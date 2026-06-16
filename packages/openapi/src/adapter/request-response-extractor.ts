/**
 * 请求/响应提取器
 * 负责从 OpenAPI AST 中提取 requestBody 和 responses 定义
 * 处理泛型类型检测和内联类型的自动命名
 *
 * 设计说明：
 * - 所有依赖通过构造函数注入（不再使用 setDependencies 两阶段初始化）
 * - schemas / interfaces 为共享输出累加器，由适配器在 parse() 中创建
 */

import ts from 'typescript';
import { createHash } from 'node:crypto';
import type {
  ApiDefinition,
  SchemaReference,
  SchemaDefinition,
  NamingStyle,
} from '@api-codegen-universal/core';
import {
  extractStringFromNode,
  extractSchemaReference,
  sharedPrinter,
  sharedSourceFile,
} from './ast-utils';
import { GenericDetector } from '../utils/generic-detector';
import { NamingUtils } from '../utils/naming-utils';
import { normalizeGenericName } from '../utils/type-ref-utils';
import type { ApifoxGenericMeta } from '../types';
import type { SchemaExtractor } from './schema-extractor';
import type { InterfaceGenerator } from './interface-generator';

/**
 * 请求/响应提取器类
 */
export class RequestResponseExtractor {
  /** 泛型检测器 */
  private readonly genericDetector: GenericDetector;
  /** 泛型基类映射表 (BaseType -> GenericField) */
  private readonly genericBaseTypes: Map<string, string>;
  /** 泛型信息映射表 (RefName -> { baseType, generics }) */
  private readonly genericInfoMap: Map<string, ApifoxGenericMeta>;
  /** 命名风格配置 */
  private readonly namingStyle: NamingStyle;
  /** 接口导出模式 */
  private readonly interfaceExportMode: 'export' | 'declare';
  /** Schema 提取器 */
  private readonly schemaExtractor: SchemaExtractor;
  /** Schema 定义集合（共享累加器） */
  private readonly schemas: Record<string, SchemaDefinition>;
  /** 接口代码生成器 */
  private readonly interfaceGenerator: InterfaceGenerator;
  /** 接口代码集合（共享累加器） */
  private readonly interfaces: Record<string, string>;
  /** 缓存的正则表达式，用于提取 JSDoc 中的 @description */
  private readonly descriptionRegex = /\*\s*@description\s+(.+?)\s*$/;
  /** 已生成的 schema 名称集合，用于避免重复 */
  private readonly generatedSchemaNames = new Set<string>();
  /** TypeNode 内容到 schema 名称的映射缓存 */
  private readonly typeNodeToSchemaNameCache = new Map<string, string>();

  constructor(
    genericDetector: GenericDetector,
    genericBaseTypes: Map<string, string>,
    genericInfoMap: Map<string, ApifoxGenericMeta>,
    namingStyle: NamingStyle,
    interfaceExportMode: 'export' | 'declare',
    schemaExtractor: SchemaExtractor,
    schemas: Record<string, SchemaDefinition>,
    interfaceGenerator: InterfaceGenerator,
    interfaces: Record<string, string>,
  ) {
    this.genericDetector = genericDetector;
    this.genericBaseTypes = genericBaseTypes;
    this.genericInfoMap = genericInfoMap;
    this.namingStyle = namingStyle;
    this.interfaceExportMode = interfaceExportMode;
    this.schemaExtractor = schemaExtractor;
    this.schemas = schemas;
    this.interfaceGenerator = interfaceGenerator;
    this.interfaces = interfaces;
  }

  /**
   * 解析 Schema 引用，并处理泛型转换
   * 将 TypeScript 类型节点转换为 Schema 引用字符串
   *
   * @param typeNode TypeScript 类型节点
   * @param contextName 上下文名称，用于生成匿名 schema 名称
   * @returns Schema 引用字符串，如果无法解析则返回 undefined
   */
  private resolveSchemaRef(
    typeNode: ts.TypeNode,
    contextName?: string,
  ): string | undefined {
    // 处理基本类型
    if (typeNode.kind === ts.SyntaxKind.StringKeyword) return 'string';
    if (typeNode.kind === ts.SyntaxKind.NumberKeyword) return 'number';
    if (typeNode.kind === ts.SyntaxKind.BooleanKeyword) return 'boolean';
    if (typeNode.kind === ts.SyntaxKind.VoidKeyword) return 'void';

    // 处理 TypeLiteral（内联 object 类型）
    if (ts.isTypeLiteralNode(typeNode)) {
      // 生成 TypeNode 的内容签名（用于缓存和去重）
      const typeSignature = this.getTypeNodeSignature(typeNode);

      // 检查缓存：如果相同结构的类型已经生成过，直接返回
      const cached = this.typeNodeToSchemaNameCache.get(typeSignature);
      if (cached) return cached;

      // 生成 schema 名称
      let schemaName: string;
      if (contextName) {
        schemaName = contextName;
      } else {
        schemaName = this.generateSchemaNameFromHash(typeSignature);
      }

      // 检查名称冲突（理论上基于哈希不会冲突，但做双重保险）
      // 使用 typeSignature 的哈希作为确定性后缀，确保相同内容生成相同名称
      if (this.generatedSchemaNames.has(schemaName)) {
        const collisionHash = createHash('sha256')
          .update(typeSignature)
          .digest('hex')
          .substring(0, 6);
        schemaName = `${schemaName}_${collisionHash}`;
      }

      // 标记为已生成
      this.generatedSchemaNames.add(schemaName);
      this.typeNodeToSchemaNameCache.set(typeSignature, schemaName);

      // 使用 schemaExtractor 提取 schema 定义
      const schema = this.schemaExtractor.typeNodeToSchema(
        schemaName,
        typeNode,
      );
      this.schemas[schemaName] = schema;

      // 同时生成接口代码
      const interfaceCode = this.generateInterfaceFromTypeLiteral(
        schemaName,
        typeNode,
      );
      if (interfaceCode) {
        this.interfaces[schemaName] = interfaceCode;
      }

      return schemaName;
    }

    // 处理数组类型 Type[]
    if (ts.isArrayTypeNode(typeNode)) {
      const elementTypeRef = this.resolveSchemaRef(
        typeNode.elementType,
        contextName,
      );
      if (elementTypeRef) return `${elementTypeRef}[]`;
    }

    // 处理 Array<Type>
    if (
      ts.isTypeReferenceNode(typeNode) &&
      ts.isIdentifier(typeNode.typeName) &&
      typeNode.typeName.text === 'Array'
    ) {
      if (typeNode.typeArguments && typeNode.typeArguments.length > 0) {
        const elementTypeRef = this.resolveSchemaRef(
          typeNode.typeArguments[0]!,
          contextName,
        );
        if (elementTypeRef) return `${elementTypeRef}[]`;
      }
    }

    // 提取基本引用
    const ref = extractSchemaReference(typeNode);

    if (ref) {
      // 检查泛型信息，如果存在则还原为泛型语法
      const info = this.genericInfoMap.get(ref);
      if (info) {
        const args = info.generics.map((arg) =>
          NamingUtils.convert(normalizeGenericName(arg), this.namingStyle),
        );
        const baseType = NamingUtils.convert(info.baseType, this.namingStyle);
        return `${baseType}<${args.join(', ')}>`;
      }
      return NamingUtils.convert(ref, this.namingStyle);
    }

    // 处理联合类型 A | B
    if (ts.isUnionTypeNode(typeNode)) {
      const refs = typeNode.types
        .map((t) => this.resolveSchemaRef(t, contextName))
        .filter((ref): ref is string => !!ref);

      if (refs.length > 0) {
        return Array.from(new Set(refs)).join(' | ');
      }
    }

    return undefined;
  }

  /**
   * 生成 TypeNode 的内容签名
   */
  private getTypeNodeSignature(typeNode: ts.TypeNode): string {
    return sharedPrinter.printNode(
      ts.EmitHint.Unspecified,
      typeNode,
      sharedSourceFile,
    );
  }

  /**
   * 基于内容签名生成 schema 名称
   */
  private generateSchemaNameFromHash(typeSignature: string): string {
    const hash = createHash('sha256')
      .update(typeSignature)
      .digest('hex')
      .substring(0, 8);
    return `AnonymousSchema_${hash}`;
  }

  /**
   * 从 TypeLiteral 节点生成接口代码
   */
  private generateInterfaceFromTypeLiteral(
    name: string,
    typeNode: ts.TypeLiteralNode,
  ): string | undefined {
    const modifiers = [
      ts.factory.createModifier(
        this.interfaceExportMode === 'export'
          ? ts.SyntaxKind.ExportKeyword
          : ts.SyntaxKind.DeclareKeyword,
      ),
    ];

    const interfaceDecl = ts.factory.createInterfaceDeclaration(
      modifiers,
      name,
      undefined,
      undefined,
      typeNode.members as readonly ts.TypeElement[],
    );

    return sharedPrinter
      .printNode(ts.EmitHint.Unspecified, interfaceDecl, sharedSourceFile)
      .trim();
  }

  /**
   * 提取 requestBody 定义
   */
  extractRequestBody(
    typeNode: ts.TypeNode,
    operationId?: string,
  ): ApiDefinition['requestBody'] {
    if (!ts.isTypeLiteralNode(typeNode)) return undefined;

    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = (member.name as ts.Identifier).text;

        if (
          propName === 'content' &&
          member.type &&
          ts.isTypeLiteralNode(member.type)
        ) {
          const content: Record<
            string,
            { schema: { type: 'ref'; ref: string } }
          > = {};

          for (const contentMember of member.type.members) {
            if (ts.isPropertySignature(contentMember) && contentMember.name) {
              const contentType = extractStringFromNode(contentMember.name);

              if (contentType && contentMember.type) {
                // 将 content type 加入 contextName，避免多个 content type 的 schema 名称冲突
                const contentTypeSuffix = contentType.replace(
                  /[^a-zA-Z0-9]/g,
                  '_',
                );
                const contextName = operationId
                  ? `${NamingUtils.convert(operationId, this.namingStyle)}_${contentTypeSuffix}_RequestBody`
                  : `${NamingUtils.convert(contentTypeSuffix, this.namingStyle)}_RequestBody`;

                const schemaRef = this.resolveSchemaRef(
                  contentMember.type,
                  contextName,
                );

                if (schemaRef) {
                  content[contentType] = {
                    schema: { type: 'ref' as const, ref: schemaRef },
                  };
                }
              }
            }
          }

          if (Object.keys(content).length > 0) {
            return { content, required: true };
          }
        }
      }
    }

    return undefined;
  }

  /**
   * 提取 responses 定义
   * 处理状态码、描述、响应内容
   * 支持自动提取内联类型为独立 Schema
   */
  extractResponses(
    typeNode: ts.TypeNode,
    operationId?: string,
  ): ApiDefinition['responses'] {
    const responses: ApiDefinition['responses'] = {};

    if (!ts.isTypeLiteralNode(typeNode)) return responses;

    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name && member.type) {
        const statusCode = extractStringFromNode(member.name);

        if (statusCode && ts.isTypeLiteralNode(member.type)) {
          const description = this.extractStatusDescription(member);
          const content = this.extractResponseContent(member.type, operationId);

          responses[statusCode] = {
            description: description || `Response for status ${statusCode}`,
            content: Object.keys(content).length > 0 ? content : undefined,
          };
        }
      }
    }

    return responses;
  }

  /**
   * 提取单个 status 的描述（从 emitNode.leadingComments 中的 @description）
   */
  private extractStatusDescription(
    member: ts.PropertySignature,
  ): string | undefined {
    const memberWithEmit = member as ts.Node & {
      emitNode?: {
        leadingComments?: Array<{ kind: number; text: string }>;
      };
    };
    if (!memberWithEmit.emitNode?.leadingComments) return undefined;

    for (const comment of memberWithEmit.emitNode.leadingComments) {
      if (!comment.text) continue;
      const match = comment.text.match(this.descriptionRegex);
      if (match && match[1]) return match[1].trim();
    }
    return undefined;
  }

  /**
   * 提取 responses 中所有 content-type 的 schema 引用
   */
  private extractResponseContent(
    statusTypeLiteral: ts.TypeLiteralNode,
    operationId?: string,
  ): Record<string, { schema: SchemaReference }> {
    const content: Record<string, { schema: SchemaReference }> = {};

    for (const respMember of statusTypeLiteral.members) {
      if (!ts.isPropertySignature(respMember) || !respMember.name) continue;
      const propName = (respMember.name as ts.Identifier).text;

      if (propName !== 'content' || !respMember.type) continue;
      if (!ts.isTypeLiteralNode(respMember.type)) continue;

      for (const contentMember of respMember.type.members) {
        if (!ts.isPropertySignature(contentMember) || !contentMember.name)
          continue;
        const contentType = extractStringFromNode(contentMember.name);
        if (!contentType || !contentMember.type) continue;

        const schemaRef = this.resolveResponseSchemaRef(
          contentMember.type,
          operationId,
          contentType,
        );
        if (schemaRef) {
          content[contentType] = { schema: schemaRef };
        }
      }
    }

    return content;
  }

  /**
   * 解析响应体的 schema 引用（含泛型检测和内联类型物化）
   */
  private resolveResponseSchemaRef(
    typeNode: ts.TypeNode,
    operationId?: string,
    contentType?: string,
  ): SchemaReference | undefined {
    // 检测泛型模式
    const typeText = sharedPrinter.printNode(
      ts.EmitHint.Unspecified,
      typeNode,
      sharedSourceFile,
    );
    const genericResult = this.genericDetector.detect(typeText);

    if (
      genericResult.isGeneric &&
      genericResult.baseType &&
      genericResult.genericParam &&
      genericResult.genericField
    ) {
      // 泛型类型 - 记录基类用于标记
      this.genericBaseTypes.set(
        genericResult.baseType,
        genericResult.genericField,
      );

      const baseType = NamingUtils.convert(
        genericResult.baseType,
        this.namingStyle,
      );
      const genericParam = NamingUtils.convert(
        genericResult.genericParam,
        this.namingStyle,
      );

      return { type: 'ref', ref: `${baseType}<${genericParam}>` };
    }

    // 普通引用 - 生成包含 contentType 的 contextName
    const contentTypeSuffix = contentType
      ? `_${contentType.replace(/[^a-zA-Z0-9]/g, '_')}`
      : '';
    const contextName = operationId
      ? `${NamingUtils.convert(operationId, this.namingStyle)}_Response${contentTypeSuffix}`
      : undefined;
    const schemaName = this.resolveSchemaRef(typeNode, contextName);
    if (schemaName) {
      return { type: 'ref', ref: schemaName };
    }

    // 回退：基本类型 / 内联类型
    return this.materializeInlineSchema(typeNode, operationId, contentType);
  }

  /**
   * 物化内联类型（基本类型直接返回，TypeLiteral 自动生成命名 Schema）
   */
  private materializeInlineSchema(
    typeNode: ts.TypeNode,
    operationId?: string,
    contentType?: string,
  ): SchemaReference | undefined {
    // 基本类型
    const primitiveMap: Partial<Record<ts.SyntaxKind, string>> = {
      [ts.SyntaxKind.BooleanKeyword]: 'boolean',
      [ts.SyntaxKind.StringKeyword]: 'string',
      [ts.SyntaxKind.NumberKeyword]: 'number',
      [ts.SyntaxKind.VoidKeyword]: 'void',
    };
    const primitiveRef = primitiveMap[typeNode.kind];
    if (primitiveRef) return { type: 'ref', ref: primitiveRef };

    // 复杂对象（TypeLiteral）— 自动生成命名
    if (ts.isTypeLiteralNode(typeNode) && operationId) {
      // 将 content type 加入 schema 名称，避免多个 content type 的 schema 名称冲突
      const contentTypeSuffix = contentType
        ? `_${contentType.replace(/[^a-zA-Z0-9]/g, '_')}`
        : '';
      const generatedName = NamingUtils.convert(
        `${operationId}_Response${contentTypeSuffix}`,
        this.namingStyle,
      );

      const schema = this.schemaExtractor.typeNodeToSchema(
        generatedName,
        typeNode,
      );
      this.schemas[generatedName] = schema;

      const interfaceCode = this.interfaceGenerator.generateInterfaceString(
        generatedName,
        typeNode,
        false,
      );
      this.interfaces[generatedName] = interfaceCode;

      return { type: 'ref', ref: generatedName };
    }

    return { type: 'ref', ref: 'unknown' };
  }
}
