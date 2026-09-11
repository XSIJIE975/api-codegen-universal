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
  getSyntheticLeadingCommentTexts,
  extractStringFromNode,
  printNodeCached,
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
  /**
   * 组件 schema 名称映射（原始名 -> 消歧后的输出名），由适配器预计算。
   * 保证命名风格转换坍缩的两个 schema 不会静默互相覆盖。
   */
  private readonly schemaNameMap?: Map<string, string>;
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
    schemaNameMap?: Map<string, string>,
  ) {
    this.genericBaseTypes = genericBaseTypes;
    this.namingStyle = namingStyle;
    this.schemaNameMap = schemaNameMap;
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
          const convertedName =
            this.schemaNameMap?.get(originalName) ??
            NamingUtils.convert(originalName, this.namingStyle);

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

    const commentTexts = getSyntheticLeadingCommentTexts(node);
    if (commentTexts.length === 0) {
      return { description, example, format, enumValues };
    }

    for (const text of commentTexts) {
      const lines = text.split('\n');
      let collectingExample = false;
      let collectingDescription = false;
      let exampleLines: string[] = [];
      const descriptionParts: string[] = [];

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

        // 如果正在收集 description 续行：
        // 遇到下一个 @ 标签 / 注释结束 / 非 * 行则停止，否则累积
        if (collectingDescription) {
          if (
            trimmedLine.startsWith('* @') ||
            trimmedLine === '*/' ||
            !trimmedLine.startsWith('*')
          ) {
            collectingDescription = false;
          } else {
            descriptionParts.push(trimmedLine.replace(/^\*\s*/, ''));
            continue;
          }
        }

        // @description 标签（含后续多行）
        if (!collectingExample) {
          const descMatch = trimmedLine.match(this.descRegex);
          if (descMatch && descMatch[1]) {
            descriptionParts.push(descMatch[1].trim());
            collectingDescription = true;
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

        // 普通注释内容（无标签时的首行作为 description）
        if (
          !collectingExample &&
          descriptionParts.length === 0 &&
          trimmedLine.startsWith('*') &&
          !trimmedLine.startsWith('* @')
        ) {
          const plainMatch = trimmedLine.match(this.plainRegex);
          if (plainMatch && plainMatch[1]) {
            descriptionParts.push(plainMatch[1].trim());
          }
        }
      }

      // 处理注释结束时仍在收集的 example
      if (collectingExample && exampleLines.length > 0) {
        example = parseExampleLines(exampleLines);
      }

      if (descriptionParts.length > 0) {
        description = descriptionParts.join('\n');
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
      // 非字面量联合（如 User | Order）无法结构化表达，
      // 保留原始类型文本避免信息丢失
      schema.type = 'object';
      schema.rawType = typeNodeToString(typeNode, (n) =>
        NamingUtils.convert(n, this.namingStyle),
      );
    }
  }

  private extractFromIntersectionType(
    schema: SchemaDefinition,
    name: string,
    typeNode: ts.IntersectionTypeNode,
  ): void {
    schema.type = 'object';
    const extendsList = new Set<string>();
    let hasDroppedMembers = false;

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
        else hasDroppedMembers = true;
      }
    }

    if (extendsList.size > 0) schema.extends = Array.from(extendsList);

    // 有成员既不能合并也不能作为 extends 保留（如数组分支）时，
    // 记录完整原始类型文本
    if (hasDroppedMembers) {
      schema.rawType = typeNodeToString(typeNode, (n) =>
        NamingUtils.convert(n, this.namingStyle),
      );
    }
  }

  private extractFromOtherType(
    schema: SchemaDefinition,
    typeNode: ts.TypeNode,
  ): void {
    const typeStr = this.tsTypeToSchemaType(typeNode);

    if (typeStr.endsWith('[]')) {
      schema.type = 'array';
      schema.rawType = typeStr;
    } else if (['string', 'number', 'boolean'].includes(typeStr)) {
      schema.type = 'primitive';
    } else if (isValidExtendsRef(typeStr)) {
      schema.type = 'object';
      schema.extends = [typeStr];
    } else {
      schema.type = 'object';
      schema.rawType = typeStr;
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
      const text = printNodeCached(t).trim();

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
