/**
 * Schema 提取器
 * 负责从 TypeScript AST 中提取 Schema 定义
 *
 * 主要功能：
 * 1. 遍历 components.schemas 节点
 * 2. 解析类型定义 (TypeLiteral, UnionType, IntersectionType 等)
 * 3. 提取 JSDoc 注释 (description, example, format, enum)
 * 4. 处理泛型基类合成 (Generic Synthesis)
 */

import ts from 'typescript';
import type {
  SchemaDefinition,
  NamingStyle,
} from '@api-codegen-universal/core';
import {
  decodeSchemaName,
  extractStringFromNode,
  sharedPrinter,
  sharedSourceFile,
  typeNodeToString,
} from './ast-utils';
import { NamingUtils } from '../utils/naming-utils';
import {
  isTypeRefTo,
  normalizeGenericName,
  wordBoundaryRegexGlobal,
} from '../utils/type-ref-utils';
import type { ApifoxGenericMeta } from '../types';

export class SchemaExtractor {
  /** 泛型基类集合(从 responses 中检测到的) name -> fieldName */
  private readonly genericBaseTypes: Map<string, string>;
  /** 命名风格 */
  private readonly namingStyle: NamingStyle;
  /** 缓存的正则表达式 */
  private readonly descRegex = /^\*\s*@description\s+(.+)$/;
  private readonly exampleRegex = /^\*\s*@example\s*(.*)$/;
  private readonly formatRegex = /^\*\s*Format:\s*(.+)$/;
  private readonly enumRegex = /^\*\s*@enum\s+\{(.+)\}$/;
  private readonly plainRegex = /^\*\s*(.+)$/;
  private readonly stringLiteralRegex = /^["'](.*)["']$/;

  constructor(
    genericBaseTypes: Map<string, string>,
    namingStyle: NamingStyle = 'PascalCase',
  ) {
    this.genericBaseTypes = genericBaseTypes;
    this.namingStyle = namingStyle;
  }

  /**
   * 从 components 节点提取所有 schemas
   */
  extractSchemas(
    componentsNode: ts.InterfaceDeclaration,
    schemas: Record<string, SchemaDefinition>,
    genericInfoMap?: Map<string, ApifoxGenericMeta>,
  ): void {
    for (const member of componentsNode.members) {
      if (!ts.isPropertySignature(member) || !member.name) continue;
      const propName = (member.name as ts.Identifier).text;

      if (
        propName === 'schemas' &&
        member.type &&
        ts.isTypeLiteralNode(member.type)
      ) {
        for (const schemaMember of member.type.members) {
          if (
            !ts.isPropertySignature(schemaMember) ||
            !schemaMember.name ||
            !schemaMember.type
          )
            continue;

          const schemaNameRaw = extractStringFromNode(schemaMember.name);
          if (!schemaNameRaw) continue;

          const schemaName = decodeSchemaName(schemaNameRaw);

          const originalName = schemaName;
          const convertedName = NamingUtils.convert(
            originalName,
            this.namingStyle,
          );

          const schema = this.typeNodeToSchema(
            convertedName,
            schemaMember.type,
          );

          // 检测是否为泛型基类
          const genericField = this.genericBaseTypes.get(originalName);
          if (genericField !== undefined) {
            schema.isGeneric = true;
            schema.baseType = convertedName;
            schema.type = 'generic';
          }

          schemas[convertedName] = schema;
        }
      }
    }

    // 合成泛型基类
    if (genericInfoMap && genericInfoMap.size > 0) {
      this.synthesizeGenericBaseTypes(schemas, genericInfoMap);
    }
  }

  /**
   * 合成泛型基类
   * 根据具体实例 (PageVO_ApplyListVO) 推导出基类 (PageVO<T>)
   */
  private synthesizeGenericBaseTypes(
    schemas: Record<string, SchemaDefinition>,
    genericInfoMap: Map<string, ApifoxGenericMeta>,
  ): void {
    // 按 baseType 分组
    const groups = new Map<string, string[]>();
    for (const [name, info] of genericInfoMap) {
      if (!groups.has(info.baseType)) {
        groups.set(info.baseType, []);
      }
      groups.get(info.baseType)!.push(name);
    }

    for (const [baseType, instances] of groups) {
      if (schemas[baseType]) continue;

      const instanceName = instances[0];
      if (!instanceName) continue;

      const instanceSchema = schemas[instanceName];
      if (!instanceSchema) continue;

      // 使用 structuredClone 深拷贝（Node 20+）
      const baseSchema: SchemaDefinition = structuredClone(instanceSchema);
      baseSchema.name = baseType;
      baseSchema.isGeneric = true;
      baseSchema.genericParam = 'T';

      const rawArg = genericInfoMap.get(instanceName)?.generics[0];
      if (!rawArg) continue;

      const targetType = normalizeGenericName(rawArg);

      // 查找并替换泛型字段
      let genericFieldFound = false;
      if (baseSchema.properties) {
        for (const [propName, propDef] of Object.entries(
          baseSchema.properties,
        )) {
          if (isTypeRefTo(propDef.type, targetType)) {
            const newType = propDef.type.replace(
              wordBoundaryRegexGlobal(targetType),
              'T',
            );
            baseSchema.properties[propName] = { ...propDef, type: newType };
            genericFieldFound = true;
          }
        }
      }

      if (genericFieldFound) {
        schemas[baseType] = baseSchema;
      }
    }
  }

  /**
   * 从节点提取 JSDoc 元数据
   */
  private extractJSDocMetadata(node: ts.Node): {
    description?: string;
    example?: unknown;
    format?: string;
    enumValues?: (string | number)[];
  } {
    let description: string | undefined;
    let example: unknown;
    let format: string | undefined;
    let enumValues: (string | number)[] | undefined;

    const nodeWithEmit = node as ts.Node & {
      emitNode?: {
        leadingComments?: Array<{ kind: number; text: string }>;
      };
    };

    if (!nodeWithEmit.emitNode?.leadingComments) {
      return { description, example, format, enumValues };
    }

    for (const comment of nodeWithEmit.emitNode.leadingComments) {
      if (!comment.text) continue;

      const lines = comment.text.split('\n');
      let collectingExample = false;
      let exampleLines: string[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();

        // 如果正在收集 example，继续累积
        if (collectingExample) {
          if (trimmedLine.startsWith('* @') || trimmedLine === '*/') {
            collectingExample = false;
            example = parseExampleLines(exampleLines);
            exampleLines = [];
          } else if (trimmedLine.startsWith('*')) {
            exampleLines.push(trimmedLine.replace(/^\*\s?/, ''));
          }
        }

        // @description 标签
        if (!collectingExample) {
          const descMatch = trimmedLine.match(this.descRegex);
          if (descMatch && descMatch[1]) {
            description = descMatch[1].trim();
            continue;
          }
        }

        // @example 标签
        if (!collectingExample) {
          const exampleMatch = trimmedLine.match(this.exampleRegex);
          if (exampleMatch !== null) {
            const firstLineContent = exampleMatch[1]?.trim();
            if (firstLineContent) exampleLines.push(firstLineContent);
            collectingExample = true;
            continue;
          }
        }

        // Format: xxx
        if (!collectingExample) {
          const formatMatch = trimmedLine.match(this.formatRegex);
          if (formatMatch && formatMatch[1]) {
            format = formatMatch[1].trim();
            continue;
          }
        }

        // @enum 标签
        if (!collectingExample) {
          const enumMatch = trimmedLine.match(this.enumRegex);
          if (enumMatch) continue;
        }

        // 普通注释内容
        if (
          !collectingExample &&
          !description &&
          trimmedLine.startsWith('*') &&
          !trimmedLine.startsWith('* @')
        ) {
          const plainMatch = trimmedLine.match(this.plainRegex);
          if (plainMatch && plainMatch[1]) {
            description = plainMatch[1].trim();
          }
        }
      }

      // 处理注释结束时仍在收集的 example
      if (collectingExample && exampleLines.length > 0) {
        example = parseExampleLines(exampleLines);
      }
    }

    return { description, example, format, enumValues };
  }

  /**
   * 将 TypeNode 转换为 SchemaDefinition
   */
  public typeNodeToSchema(
    name: string,
    typeNode: ts.TypeNode,
  ): SchemaDefinition {
    const schema: SchemaDefinition = {
      name,
      type: 'object',
      properties: {},
    };

    if (ts.isTypeLiteralNode(typeNode)) {
      this.extractFromTypeLiteral(schema, typeNode);
    } else if (ts.isUnionTypeNode(typeNode)) {
      this.extractFromUnionType(schema, typeNode);
    } else if (ts.isIntersectionTypeNode(typeNode)) {
      this.extractFromIntersectionType(schema, name, typeNode);
    } else {
      this.extractFromOtherType(schema, typeNode);
    }

    return schema;
  }

  private extractFromTypeLiteral(
    schema: SchemaDefinition,
    typeNode: ts.TypeLiteralNode,
  ): void {
    const required: string[] = [];

    for (const member of typeNode.members) {
      if (!ts.isPropertySignature(member) || !member.name || !member.type)
        continue;

      const propName = (member.name as ts.Identifier).text;
      const isRequired = !member.questionToken;
      if (isRequired) required.push(propName);

      const {
        description,
        example,
        format,
        enumValues: jsDocEnumValues,
      } = this.extractJSDocMetadata(member);
      let enumValues = jsDocEnumValues;

      if (!enumValues && ts.isUnionTypeNode(member.type)) {
        const extracted = this.extractEnumValues(member.type);
        if (extracted.length > 0) enumValues = extracted;
      }

      let propType = this.tsTypeToSchemaType(member.type);
      if (enumValues && enumValues.length > 0) {
        const firstVal = enumValues[0];
        propType = typeof firstVal === 'number' ? 'number' : 'string';
      }

      schema.properties![propName] = {
        name: propName,
        type: propType,
        required: isRequired,
        description,
        ...(example !== undefined && { example }),
        ...(format && { format }),
        ...(enumValues && { enum: enumValues }),
      };
    }

    if (required.length > 0) schema.required = required;
  }

  private extractFromUnionType(
    schema: SchemaDefinition,
    typeNode: ts.UnionTypeNode,
  ): void {
    const extracted = this.extractEnumValues(typeNode);
    if (extracted.length > 0) {
      schema.type = 'enum';
      schema.enum = extracted;
    } else {
      schema.type = 'object';
    }
  }

  private extractFromIntersectionType(
    schema: SchemaDefinition,
    name: string,
    typeNode: ts.IntersectionTypeNode,
  ): void {
    schema.type = 'object';
    const extendsList = new Set<string>();

    for (const t of typeNode.types) {
      if (ts.isTypeLiteralNode(t)) {
        const subSchema = this.typeNodeToSchema(name, t);
        if (subSchema.properties) {
          schema.properties = { ...schema.properties, ...subSchema.properties };
        }
        if (subSchema.required) {
          schema.required = [...(schema.required || []), ...subSchema.required];
        }
      } else {
        const refName = typeNodeToString(t, (n) =>
          NamingUtils.convert(n, this.namingStyle),
        );
        if (isValidExtendsRef(refName)) extendsList.add(refName);
      }
    }

    if (extendsList.size > 0) schema.extends = Array.from(extendsList);
  }

  private extractFromOtherType(
    schema: SchemaDefinition,
    typeNode: ts.TypeNode,
  ): void {
    const typeStr = this.tsTypeToSchemaType(typeNode);

    if (typeStr.endsWith('[]')) {
      schema.type = 'array';
    } else if (['string', 'number', 'boolean'].includes(typeStr)) {
      schema.type = 'primitive';
    } else if (isValidExtendsRef(typeStr)) {
      schema.type = 'object';
      schema.extends = [typeStr];
    } else {
      schema.type = 'object';
    }
  }

  /**
   * 将 TS 类型转换为 schema 类型字符串
   */
  private tsTypeToSchemaType(typeNode: ts.TypeNode): string {
    if (ts.isTypeReferenceNode(typeNode)) {
      const typeText = typeNodeToString(typeNode, (n) =>
        NamingUtils.convert(n, this.namingStyle),
      );
      if (typeText.includes('Record<string, never>')) return 'any';
      return typeText;
    }

    switch (typeNode.kind) {
      case ts.SyntaxKind.StringKeyword:
        return 'string';
      case ts.SyntaxKind.NumberKeyword:
        return 'number';
      case ts.SyntaxKind.BooleanKeyword:
        return 'boolean';
      case ts.SyntaxKind.AnyKeyword:
        return 'any';
      case ts.SyntaxKind.ArrayType:
        return `${this.tsTypeToSchemaType((typeNode as ts.ArrayTypeNode).elementType)}[]`;
      default:
        return typeNodeToString(typeNode, (n) =>
          NamingUtils.convert(n, this.namingStyle),
        );
    }
  }

  /**
   * 尝试从 UnionTypeNode 提取枚举值
   */
  private extractEnumValues(node: ts.UnionTypeNode): (string | number)[] {
    const enumValues: (string | number)[] = [];

    for (const t of node.types) {
      const text = sharedPrinter
        .printNode(ts.EmitHint.Unspecified, t, sharedSourceFile)
        .trim();

      const stringMatch = text.match(this.stringLiteralRegex);
      if (stringMatch && typeof stringMatch[1] === 'string') {
        enumValues.push(stringMatch[1]);
        continue;
      }

      if (text && !isNaN(Number(text))) {
        enumValues.push(Number(text));
        continue;
      }

      if (text === 'true' || text === 'false') {
        enumValues.push(text);
        continue;
      }

      if (text === 'null') continue;

      return []; // 非纯枚举
    }

    return enumValues;
  }
}

// ===================================================================================
// 辅助函数
// ===================================================================================

/**
 * 验证是否为合法的继承引用
 */
function isValidExtendsRef(refName: string): boolean {
  if (!refName) return false;

  const primitiveTypes = new Set([
    'string',
    'number',
    'boolean',
    'any',
    'object',
    'undefined',
    'null',
    'void',
    'never',
    'unknown',
  ]);
  if (primitiveTypes.has(refName)) return false;
  if (refName.endsWith('[]')) return false;
  if (refName.startsWith('{')) return false;

  return true;
}

/**
 * 解析收集的 @example 行，尝试 JSON.parse，失败则作为纯文本
 */
function parseExampleLines(lines: string[]): unknown {
  const text = lines.join('\n').trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
