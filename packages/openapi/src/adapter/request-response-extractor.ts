/**
 * 请求/响应提取器
 * 负责从 OpenAPI AST 中提取 requestBody 和 responses 定义
 * 处理泛型类型检测和内联类型的自动命名
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
import type { SchemaExtractor } from './schema-extractor';
import type { InterfaceGenerator } from './interface-generator';

/**
 * 请求/响应提取器类
 */
export class RequestResponseExtractor {
  /** 泛型检测器 */
  private genericDetector: GenericDetector;
  /** 泛型基类映射表 (BaseType -> GenericField) */
  private genericBaseTypes: Map<string, string>;
  /** 泛型信息映射表 (RefName -> { baseType, generics }) */
  private genericInfoMap: Map<string, { baseType: string; generics: string[] }>;
  /** 命名风格配置 */
  private namingStyle: NamingStyle;
  /** 接口导出模式 */
  private interfaceExportMode: 'export' | 'declare';
  /** Schema 提取器 */
  private schemaExtractor?: SchemaExtractor;
  /** Schema 定义集合 */
  private schemas?: Record<string, SchemaDefinition>;
  /** 接口代码生成器 */
  private interfaceGenerator?: InterfaceGenerator;
  /** 接口代码集合 */
  private interfaces?: Record<string, string>;
  /** 缓存的正则表达式，用于提取 JSDoc 中的 @description */
  private readonly descriptionRegex = /\*\s*@description\s+(.+?)\s*$/;
  /** 已生成的 schema 名称集合，用于避免重复 */
  private generatedSchemaNames = new Set<string>();
  /** TypeNode 内容到 schema 名称的映射缓存 */
  private typeNodeToSchemaNameCache = new Map<string, string>();

  /**
   * 构造函数
   * @param genericDetector 泛型检测器
   * @param genericBaseTypes 泛型基类映射表
   * @param genericInfoMap 泛型信息映射表
   * @param namingStyle 命名风格
   * @param interfaceExportMode 接口导出模式
   */
  constructor(
    genericDetector: GenericDetector,
    genericBaseTypes: Map<string, string>,
    genericInfoMap: Map<string, { baseType: string; generics: string[] }>,
    namingStyle: NamingStyle,
    interfaceExportMode: 'export' | 'declare' = 'export',
  ) {
    this.genericDetector = genericDetector;
    this.genericBaseTypes = genericBaseTypes;
    this.genericInfoMap = genericInfoMap;
    this.namingStyle = namingStyle;
    this.interfaceExportMode = interfaceExportMode;
  }

  /**
   * 设置依赖项（用于处理内联 schema）
   */
  setDependencies(
    schemaExtractor: SchemaExtractor,
    schemas: Record<string, SchemaDefinition>,
    interfaceGenerator: InterfaceGenerator,
    interfaces: Record<string, string>,
  ): void {
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
    if (typeNode.kind === ts.SyntaxKind.StringKeyword) {
      return 'string';
    }
    if (typeNode.kind === ts.SyntaxKind.NumberKeyword) {
      return 'number';
    }
    if (typeNode.kind === ts.SyntaxKind.BooleanKeyword) {
      return 'boolean';
    }
    if (typeNode.kind === ts.SyntaxKind.VoidKeyword) {
      return 'void';
    }

    // 处理 TypeLiteral（内联 object 类型）
    if (ts.isTypeLiteralNode(typeNode)) {
      // 如果有 schemaExtractor 和 schemas，则动态创建 schema
      if (this.schemaExtractor && this.schemas) {
        // 生成 TypeNode 的内容签名（用于缓存和去重）
        const typeSignature = this.getTypeNodeSignature(typeNode);

        // 检查缓存：如果相同结构的类型已经生成过，直接返回
        if (this.typeNodeToSchemaNameCache.has(typeSignature)) {
          return this.typeNodeToSchemaNameCache.get(typeSignature)!;
        }

        // 生成 schema 名称
        let schemaName: string;
        if (contextName) {
          // 如果提供了 contextName，直接使用（不再拼接计数器）
          schemaName = contextName;
        } else {
          // 没有 contextName 时，使用基于内容哈希的命名方式
          schemaName = this.generateSchemaNameFromHash(typeSignature);
        }

        // 检查名称冲突（理论上基于哈希不会冲突，但做双重保险）
        if (this.generatedSchemaNames.has(schemaName)) {
          // 如果哈希冲突（极低概率），添加短随机后缀
          schemaName = `${schemaName}_${Math.random().toString(36).substring(2, 6)}`;
        }

        // 标记为已生成
        this.generatedSchemaNames.add(schemaName);
        // 缓存 TypeNode 到 schema 名称的映射
        this.typeNodeToSchemaNameCache.set(typeSignature, schemaName);

        // 使用 schemaExtractor 提取 schema 定义
        const schema = this.schemaExtractor.typeNodeToSchema(
          schemaName,
          typeNode,
        );

        // 添加到 schemas 集合中
        this.schemas[schemaName] = schema;

        // 如果有 interfaceGenerator，也生成对应的接口代码
        if (this.interfaceGenerator && this.interfaces) {
          const interfaceCode = this.generateInterfaceFromTypeLiteral(
            schemaName,
            typeNode,
          );
          if (interfaceCode) {
            this.interfaces[schemaName] = interfaceCode;
          }
        }

        return schemaName;
      }
      // 如果没有 schemaExtractor，返回 unknown
      return 'unknown';
    }

    // 处理数组类型 Type[]
    if (ts.isArrayTypeNode(typeNode)) {
      const elementTypeRef = this.resolveSchemaRef(
        typeNode.elementType,
        contextName,
      );
      if (elementTypeRef) {
        return `${elementTypeRef}[]`;
      }
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
        if (elementTypeRef) {
          return `${elementTypeRef}[]`;
        }
      }
    }

    // 提取基本引用
    const ref = extractSchemaReference(typeNode);

    if (ref) {
      // 检查泛型信息，如果存在则还原为泛型语法
      if (this.genericInfoMap && this.genericInfoMap.has(ref)) {
        const info = this.genericInfoMap.get(ref)!;
        // 转换为 Base<Arg>
        const args = info.generics.map((arg) => {
          const normalized = arg
            .replace(/«/g, '_')
            .replace(/»/g, '')
            .replace(/,/g, '_')
            .replace(/\s/g, '');
          return NamingUtils.convert(normalized, this.namingStyle);
        });
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
   * 通过打印类型节点的完整内容来生成唯一签名
   * 相同结构的类型会产生相同的签名
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
   * 使用 SHA256 哈希的前 8 位作为后缀，确保唯一性
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
    // 根据配置选择修饰符
    const modifiers = [
      ts.factory.createModifier(
        this.interfaceExportMode === 'export'
          ? ts.SyntaxKind.ExportKeyword
          : ts.SyntaxKind.DeclareKeyword,
      ),
    ];

    // 使用 TypeScript 的 printer 生成接口代码
    const interfaceDecl = ts.factory.createInterfaceDeclaration(
      modifiers,
      name,
      undefined,
      undefined,
      typeNode.members as readonly ts.TypeElement[],
    );

    const code = sharedPrinter
      .printNode(ts.EmitHint.Unspecified, interfaceDecl, sharedSourceFile)
      .trim();

    return code;
  }

  /**
   * 提取 requestBody 定义
   *
   * @param typeNode requestBody 对应的类型节点
   * @param operationId 操作 ID，用于生成有意义的 schema 名称
   * @returns requestBody 定义对象
   */
  extractRequestBody(
    typeNode: ts.TypeNode,
    operationId?: string,
  ): ApiDefinition['requestBody'] {
    if (!ts.isTypeLiteralNode(typeNode)) {
      return undefined;
    }

    // 查找 content 属性
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

          // 遍历 content-type (如 application/json, multipart/form-data)
          for (const contentMember of member.type.members) {
            if (ts.isPropertySignature(contentMember) && contentMember.name) {
              const contentType = extractStringFromNode(contentMember.name);

              if (contentType && contentMember.type) {
                // 生成上下文名称：优先使用 operationId，否则使用 contentType
                const contextName = operationId
                  ? `${NamingUtils.convert(operationId, this.namingStyle)}RequestBody`
                  : `${NamingUtils.convert(contentType.replace(/[^a-zA-Z0-9]/g, ''), this.namingStyle)}RequestBody`;

                // 提取 schema 引用
                const schemaRef = this.resolveSchemaRef(
                  contentMember.type,
                  contextName,
                );

                if (schemaRef) {
                  content[contentType] = {
                    schema: {
                      type: 'ref' as const,
                      ref: schemaRef,
                    },
                  };
                }
              }
            }
          }

          if (Object.keys(content).length > 0) {
            return {
              content,
              required: true, // 默认为必填
            };
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
   *
   * @param typeNode responses 对应的类型节点
   * @param operationId 操作 ID (用于生成内联类型名称)
   * @param schemas Schema 定义集合 (用于存储生成的内联 Schema)
   * @param interfaces 接口定义集合 (用于存储生成的内联 Interface)
   * @param schemaExtractor Schema 提取器
   * @param interfaceGenerator 接口生成器
   * @returns responses 定义对象
   */
  extractResponses(
    typeNode: ts.TypeNode,
    operationId?: string,
    schemas?: Record<string, SchemaDefinition>,
    interfaces?: Record<string, string>,
    schemaExtractor?: SchemaExtractor,
    interfaceGenerator?: InterfaceGenerator,
  ): ApiDefinition['responses'] {
    const responses: ApiDefinition['responses'] = {};

    if (!ts.isTypeLiteralNode(typeNode)) {
      return responses;
    }

    // 遍历所有状态码 (200, 400, 500, etc.)
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name && member.type) {
        const statusCode = extractStringFromNode(member.name);

        if (statusCode && ts.isTypeLiteralNode(member.type)) {
          // 从 emitNode.leadingComments 提取 description
          // openapi-typescript 生成的 AST 中包含注释信息
          let description = '';

          const memberWithEmit = member as ts.Node & {
            emitNode?: {
              leadingComments?: Array<{ kind: number; text: string }>;
            };
          };
          if (memberWithEmit.emitNode?.leadingComments) {
            for (const comment of memberWithEmit.emitNode.leadingComments) {
              // comment.kind === 3 是多行注释 /* */
              // comment.text 格式: "* @description 这是一段详细的接口描述 "
              if (comment.text) {
                const match = comment.text.match(this.descriptionRegex);
                if (match && match[1]) {
                  description = match[1].trim();
                  break;
                }
              }
            }
          }

          // 查找 content 属性
          const content: Record<string, { schema: SchemaReference }> = {};
          for (const respMember of member.type.members) {
            if (ts.isPropertySignature(respMember) && respMember.name) {
              const propName = (respMember.name as ts.Identifier).text;

              if (
                propName === 'content' &&
                respMember.type &&
                ts.isTypeLiteralNode(respMember.type)
              ) {
                // 遍历所有 content-type (application/json, application/xml, application/octet-stream, etc.)
                for (const contentMember of respMember.type.members) {
                  if (
                    ts.isPropertySignature(contentMember) &&
                    contentMember.name
                  ) {
                    const contentType = extractStringFromNode(
                      contentMember.name,
                    );

                    if (contentType && contentMember.type) {
                      // 检测泛型模式 - 使用 printer 将 TypeNode 转为文本
                      const typeText = sharedPrinter.printNode(
                        ts.EmitHint.Unspecified,
                        contentMember.type,
                        sharedSourceFile,
                      );
                      const genericResult =
                        this.genericDetector.detect(typeText);

                      let schemaRef: SchemaReference;
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

                        // 直接使用完整类型名作为引用
                        schemaRef = {
                          type: 'ref',
                          ref: `${baseType}<${genericParam}>`,
                        };
                      } else {
                        // 普通引用
                        const schemaName = this.resolveSchemaRef(
                          contentMember.type,
                        );

                        if (schemaName) {
                          schemaRef = {
                            type: 'ref',
                            ref: schemaName,
                          };
                        } else {
                          // 尝试处理内联类型
                          const typeNode = contentMember.type;

                          // 1. 基本类型
                          if (typeNode.kind === ts.SyntaxKind.BooleanKeyword) {
                            schemaRef = { type: 'ref', ref: 'boolean' };
                          } else if (
                            typeNode.kind === ts.SyntaxKind.StringKeyword
                          ) {
                            schemaRef = { type: 'ref', ref: 'string' };
                          } else if (
                            typeNode.kind === ts.SyntaxKind.NumberKeyword
                          ) {
                            schemaRef = { type: 'ref', ref: 'number' };
                          } else if (
                            typeNode.kind === ts.SyntaxKind.VoidKeyword
                          ) {
                            schemaRef = { type: 'ref', ref: 'void' };
                          }
                          // 2. 复杂对象 (TypeLiteral) - 自动生成命名模型
                          else if (
                            ts.isTypeLiteralNode(typeNode) &&
                            operationId &&
                            schemas &&
                            interfaces &&
                            schemaExtractor &&
                            interfaceGenerator
                          ) {
                            // 生成唯一名称: OperationId + Response
                            // 使用配置的命名风格
                            const generatedName = NamingUtils.convert(
                              `${operationId}_Response`,
                              this.namingStyle,
                            );

                            // 生成 Schema
                            const schema = schemaExtractor.typeNodeToSchema(
                              generatedName,
                              typeNode,
                            );
                            schemas[generatedName] = schema;

                            // 生成 Interface
                            const interfaceCode =
                              interfaceGenerator.generateInterfaceString(
                                generatedName,
                                typeNode,
                                false,
                              );
                            interfaces[generatedName] = interfaceCode;

                            schemaRef = {
                              type: 'ref',
                              ref: generatedName,
                            };
                          } else {
                            schemaRef = {
                              type: 'ref',
                              ref: 'unknown',
                            };
                          }
                        }
                      }

                      content[contentType] = {
                        schema: schemaRef,
                      };
                    }
                  }
                }
              }
            }
          }

          responses[statusCode] = {
            description: description || `Response for status ${statusCode}`,
            content: Object.keys(content).length > 0 ? content : undefined,
          };
        }
      }
    }

    return responses;
  }
}
