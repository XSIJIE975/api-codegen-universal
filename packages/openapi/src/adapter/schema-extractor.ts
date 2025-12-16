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
import type { SchemaDefinition } from '@api-codegen-universal/core';
import {
  extractStringFromNode,
  simplifyTypeReference,
  sharedPrinter,
  sharedSourceFile,
} from './ast-utils';

export class SchemaExtractor {
  /** 泛型基类集合(从 responses 中检测到的) name -> fieldName */
  private genericBaseTypes: Map<string, string>;
  /** 缓存的正则表达式 */
  private readonly descRegex = /^\*\s*@description\s+(.+)$/;
  private readonly exampleRegex = /^\*\s*@example\s*(.*)$/;
  private readonly formatRegex = /^\*\s*Format:\s*(.+)$/;
  private readonly enumRegex = /^\*\s*@enum\s+\{(.+)\}$/;
  private readonly plainRegex = /^\*\s*(.+)$/;
  private readonly stringLiteralRegex = /^["'](.*)["']$/;

  constructor(genericBaseTypes: Map<string, string>) {
    this.genericBaseTypes = genericBaseTypes;
  }

  /**
   * 从 components 节点提取所有 schemas
   *
   * @param componentsNode components 接口节点
   * @param schemas Schema 定义集合(输出)
   * @param genericInfoMap 泛型信息映射(可选，用于辅助泛型合成)
   */
  extractSchemas(
    componentsNode: ts.InterfaceDeclaration,
    schemas: Record<string, SchemaDefinition>,
    genericInfoMap?: Map<string, { baseType: string; generics: string[] }>,
  ): void {
    // 找到 schemas 属性
    for (const member of componentsNode.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = (member.name as ts.Identifier).text;

        if (
          propName === 'schemas' &&
          member.type &&
          ts.isTypeLiteralNode(member.type)
        ) {
          // 遍历所有 schema
          for (const schemaMember of member.type.members) {
            if (
              ts.isPropertySignature(schemaMember) &&
              schemaMember.name &&
              schemaMember.type
            ) {
              let schemaName = extractStringFromNode(schemaMember.name);

              if (schemaName) {
                // 解码并处理泛型符号
                if (schemaName.includes('%')) {
                  try {
                    schemaName = decodeURIComponent(schemaName);
                  } catch {
                    // ignore
                  }
                }

                // 解析具体的 schema 结构
                const schema = this.typeNodeToSchema(
                  schemaName,
                  schemaMember.type,
                );

                // 检测是否为泛型基类 - 优化: 只查找一次 Map
                const genericField = this.genericBaseTypes.get(schemaName);
                if (genericField !== undefined) {
                  schema.isGeneric = true;
                  schema.baseType = schemaName;
                  schema.type = 'generic';
                }

                schemas[schemaName] = schema;
              }
            }
          }
        }
      }
    }

    // 提取完成后，合成泛型基类
    if (genericInfoMap && genericInfoMap.size > 0) {
      this.synthesizeGenericBaseTypes(schemas, genericInfoMap);
    }
  }

  /**
   * 合成泛型基类
   * 根据具体实例 (PageVO_ApplyListVO) 推导出基类 (PageVO<T>)
   *
   * 算法逻辑：
   * 1. 按 baseType 对泛型实例进行分组
   * 2. 对每个基类，取第一个实例作为模板
   * 3. 复制模板 Schema
   * 4. 查找并替换泛型字段 (将具体类型替换为 'T')
   */
  private synthesizeGenericBaseTypes(
    schemas: Record<string, SchemaDefinition>,
    genericInfoMap: Map<string, { baseType: string; generics: string[] }>,
  ) {
    // 按 baseType 分组
    const groups = new Map<string, string[]>();
    for (const [name, info] of genericInfoMap) {
      if (!groups.has(info.baseType)) {
        groups.set(info.baseType, []);
      }
      groups.get(info.baseType)!.push(name);
    }

    for (const [baseType, instances] of groups) {
      if (schemas[baseType]) continue; // 基类已存在

      // 取第一个实例作为模板
      const instanceName = instances[0];
      if (instanceName) {
        const instanceSchema = schemas[instanceName];
        if (!instanceSchema) {
          continue;
        }

        // 创建基类 Schema
        const baseSchema: SchemaDefinition = JSON.parse(
          JSON.stringify(instanceSchema),
        );
        baseSchema.name = baseType;
        baseSchema.isGeneric = true;
        baseSchema.genericParam = 'T'; // 暂时假设单泛型参数

        // 获取泛型参数名
        const rawArg = genericInfoMap.get(instanceName)?.generics[0];
        if (!rawArg) continue;

        // 规范化参数名
        const targetType = rawArg
          .replace(/«/g, '_')
          .replace(/»/g, '')
          .replace(/,/g, '_')
          .replace(/\s/g, '');

        // 查找并替换泛型字段
        let genericFieldFound = false;
        if (baseSchema.properties) {
          for (const [propName, propDef] of Object.entries(
            baseSchema.properties,
          )) {
            // 检查属性是否引用了 targetType
            if (this.isTypeRefTo(propDef.type, targetType)) {
              // 使用正则替换，确保只替换完整的单词
              const regex = new RegExp(
                `\\b${this.escapeRegExp(targetType)}\\b`,
                'g',
              );
              const newType = propDef.type.replace(regex, 'T');

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
  }

  /**
   * 检查类型字符串是否引用了指定类型
   * 支持:
   * - 精确匹配: User
   * - 数组匹配: User[]
   * - 联合类型: User | null
   * - 包含匹配: Response<User>
   */
  private isTypeRefTo(typeStr: string, targetName: string): boolean {
    if (!typeStr) return false;

    // 移除空白字符
    const cleanType = typeStr.replace(/\s/g, '');
    const cleanTarget = targetName.replace(/\s/g, '');

    // 1. 精确匹配
    if (cleanType === cleanTarget) return true;

    // 2. 数组匹配
    if (cleanType === `${cleanTarget}[]`) return true;

    // 3. 联合类型匹配 (e.g. "Type|null", "Type[]|null")
    if (cleanType.includes('|')) {
      const parts = cleanType.split('|');
      return parts.some((part) => {
        // 去除可能的括号
        const p = part.replace(/^\(|\)$/g, '');
        return (
          p === cleanTarget ||
          p === `${cleanTarget}[]` ||
          p.endsWith(`/${cleanTarget}`) ||
          p.endsWith(`/${cleanTarget}[]`)
        );
      });
    }

    // 4. 包含匹配 (最宽松，用于处理复杂情况)
    // 确保 targetName 是作为一个完整的单词出现
    const regex = new RegExp(`\\b${this.escapeRegExp(targetName)}\\b`);
    return regex.test(typeStr);
  }

  private escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 将 TypeNode 转换为 SchemaDefinition
   *
   * @param name Schema 名称
   * @param typeNode TypeScript 类型节点
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
      const required: string[] = [];

      for (const member of typeNode.members) {
        if (ts.isPropertySignature(member) && member.name && member.type) {
          const propName = (member.name as ts.Identifier).text;
          const isRequired = !member.questionToken;

          if (isRequired) {
            required.push(propName);
          }

          // 从 emitNode.leadingComments 提取完整的字段信息
          let description: string | undefined;
          let example: unknown;
          let format: string | undefined;
          let enumValues: (string | number)[] | undefined;

          const memberWithEmit = member as ts.Node & {
            emitNode?: {
              leadingComments?: Array<{ kind: number; text: string }>;
            };
          };
          if (memberWithEmit.emitNode?.leadingComments) {
            for (const comment of memberWithEmit.emitNode.leadingComments) {
              if (comment.text) {
                // 解析多行注释中的所有标签
                const lines = comment.text.split('\n');
                let collectingExample = false;
                let exampleLines: string[] = [];

                for (const line of lines) {
                  const trimmedLine = line.trim();

                  // 如果正在收集 example，继续累积
                  if (collectingExample) {
                    // 检查是否遇到新的标签或注释结束
                    if (trimmedLine.startsWith('* @') || trimmedLine === '*/') {
                      collectingExample = false;
                      // 尝试解析收集的 example
                      const exampleText = exampleLines.join('\n').trim();
                      if (exampleText) {
                        try {
                          example = JSON.parse(exampleText);
                        } catch {
                          example = exampleText;
                        }
                      }
                      exampleLines = [];
                    } else if (trimmedLine.startsWith('*')) {
                      // 移除开头的 * 和空格，保留内容
                      const content = trimmedLine.replace(/^\*\s?/, '');
                      exampleLines.push(content);
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

                  // @example 标签 - 开始收集
                  if (!collectingExample) {
                    const exampleMatch = trimmedLine.match(this.exampleRegex);
                    if (exampleMatch !== null) {
                      const firstLineContent = exampleMatch[1]?.trim();
                      if (firstLineContent) {
                        exampleLines.push(firstLineContent);
                      }
                      collectingExample = true;
                      continue;
                    }
                  }

                  // Format: xxx 格式
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
                    if (enumMatch) {
                      continue;
                    }
                  }

                  // 普通注释内容（没有标签的）
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
                  const exampleText = exampleLines.join('\n').trim();
                  if (exampleText) {
                    try {
                      example = JSON.parse(exampleText);
                    } catch {
                      example = exampleText;
                    }
                  }
                }
              }
            }
          }

          // 尝试从 UnionTypeNode 提取 inline enum
          if (!enumValues && ts.isUnionTypeNode(member.type)) {
            const extracted = this.extractEnumValues(member.type);
            if (extracted.length > 0) {
              enumValues = extracted;
            }
          }

          let propType = this.tsTypeToSchemaType(member.type);
          // 如果提取到了枚举值，修正 type 为基本类型
          if (enumValues && enumValues.length > 0) {
            const firstVal = enumValues[0];
            if (typeof firstVal === 'number') {
              propType = 'number';
            } else {
              propType = 'string';
            }
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
      }

      if (required.length > 0) {
        schema.required = required;
      }
    } else if (ts.isUnionTypeNode(typeNode)) {
      const extracted = this.extractEnumValues(typeNode);
      if (extracted.length > 0) {
        schema.type = 'enum';
        schema.enum = extracted;
      } else {
        schema.type = 'object';
      }
    } else if (ts.isIntersectionTypeNode(typeNode)) {
      // 处理交叉类型 (allOf)
      // 简单策略：合并所有成员的属性
      // 这只是一个近似实现，完整的实现需要递归合并
      schema.type = 'object';

      for (const t of typeNode.types) {
        if (ts.isTypeLiteralNode(t)) {
          const subSchema = this.typeNodeToSchema(name, t);
          if (subSchema.properties) {
            schema.properties = {
              ...schema.properties,
              ...subSchema.properties,
            };
          }
          if (subSchema.required) {
            schema.required = [
              ...(schema.required || []),
              ...subSchema.required,
            ];
          }
        } else if (ts.isTypeReferenceNode(t)) {
          // FIXME: 如果是引用，这里可能无法在这里解析它，因为这里只有 AST
          // schema.allOf = ...
        }
      }
    } else {
      // 处理非对象类型 (如 type A = string; type B = A & C;)
      const typeStr = this.tsTypeToSchemaType(typeNode);

      if (typeStr.endsWith('[]')) {
        schema.type = 'array';
      } else if (['string', 'number', 'boolean'].includes(typeStr)) {
        schema.type = 'primitive';
      } else {
        // 默认为 object，可能是引用或复杂类型
        schema.type = 'object';
      }
    }

    return schema;
  }

  /**
   * 将 TS 类型转换为 schema 类型字符串
   */
  private tsTypeToSchemaType(typeNode: ts.TypeNode): string {
    // 特殊处理 Record<string, never>
    if (ts.isTypeReferenceNode(typeNode)) {
      const typeText = sharedPrinter.printNode(
        ts.EmitHint.Unspecified,
        typeNode,
        sharedSourceFile,
      );
      if (typeText.includes('Record<string, never>')) {
        return 'any'; // 或者 'object'
      }
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
      case ts.SyntaxKind.ArrayType: {
        const elementType = this.tsTypeToSchemaType(
          (typeNode as ts.ArrayTypeNode).elementType,
        );
        return `${elementType}[]`;
      }
      default:
        // 对于其他类型，直接返回其文本表示
        return simplifyTypeReference(
          sharedPrinter.printNode(
            ts.EmitHint.Unspecified,
            typeNode,
            sharedSourceFile,
          ),
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

      // 检查字符串字面量 "..." 或 '...'
      const stringMatch = text.match(this.stringLiteralRegex);
      if (stringMatch && typeof stringMatch[1] === 'string') {
        enumValues.push(stringMatch[1]);
        continue;
      }

      // 检查数字字面量
      if (text && !isNaN(Number(text))) {
        enumValues.push(Number(text));
        continue;
      }

      // 检查 boolean
      if (text === 'true' || text === 'false') {
        enumValues.push(text);
        continue;
      }

      // 忽略 null
      if (text === 'null') {
        continue;
      }

      // 如果遇到其他类型，说明不是纯枚举
      return [];
    }

    return enumValues;
  }
}
