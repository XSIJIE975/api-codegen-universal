/**
 * Schema 提取器
 * 负责从 AST 中提取 Schema 定义
 */

import ts from 'typescript';
import type { SchemaDefinition } from '@api-codegen-universal/core';
import { extractStringFromNode, simplifyTypeReference } from './ast-utils';

export class SchemaExtractor {
  /** 泛型基类集合(从 responses 中检测到的) name -> fieldName */
  private genericBaseTypes: Map<string, string>;

  constructor(genericBaseTypes: Map<string, string>) {
    this.genericBaseTypes = genericBaseTypes;
  }

  /**
   * 从 components 节点提取所有 schemas
   */
  extractSchemas(
    componentsNode: ts.InterfaceDeclaration,
    schemas: Record<string, SchemaDefinition>,
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
              const schemaName = extractStringFromNode(schemaMember.name);

              if (schemaName) {
                // 解析具体的 schema 结构
                const schema = this.typeNodeToSchema(
                  schemaName,
                  schemaMember.type,
                );

                // 检测是否为泛型基类
                if (this.genericBaseTypes.has(schemaName)) {
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
  }

  /**
   * 将 TypeNode 转换为 SchemaDefinition
   */
  typeNodeToSchema(name: string, typeNode: ts.TypeNode): SchemaDefinition {
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
                    const descMatch = trimmedLine.match(
                      /^\*\s*@description\s+(.+)$/,
                    );
                    if (descMatch && descMatch[1]) {
                      description = descMatch[1].trim();
                      continue;
                    }
                  }

                  // @example 标签 - 开始收集
                  if (!collectingExample) {
                    const exampleMatch = trimmedLine.match(
                      /^\*\s*@example\s*(.*)$/,
                    );
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
                    const formatMatch = trimmedLine.match(
                      /^\*\s*Format:\s*(.+)$/,
                    );
                    if (formatMatch && formatMatch[1]) {
                      format = formatMatch[1].trim();
                      continue;
                    }
                  }

                  // @enum 标签
                  if (!collectingExample) {
                    const enumMatch = trimmedLine.match(
                      /^\*\s*@enum\s+\{(.+)\}$/,
                    );
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
                    const plainMatch = trimmedLine.match(/^\*\s*(.+)$/);
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
          // 如果是引用，我们可能无法在这里解析它，因为我们只有 AST
          // 但我们可以记录它
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
    // 使用 printer 将 TypeNode 转为文本
    const printer = ts.createPrinter();
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      '',
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    );

    // 特殊处理 Record<string, never>
    if (ts.isTypeReferenceNode(typeNode)) {
      const typeText = printer.printNode(
        ts.EmitHint.Unspecified,
        typeNode,
        sourceFile,
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
          printer.printNode(ts.EmitHint.Unspecified, typeNode, sourceFile),
        );
    }
  }

  /**
   * 尝试从 UnionTypeNode 提取枚举值
   */
  private extractEnumValues(node: ts.UnionTypeNode): (string | number)[] {
    const enumValues: (string | number)[] = [];
    const printer = ts.createPrinter();
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      '',
      ts.ScriptTarget.Latest,
    );

    for (const t of node.types) {
      const text = printer
        .printNode(ts.EmitHint.Unspecified, t, sourceFile)
        .trim();

      // 检查字符串字面量 "..." 或 '...'
      const stringMatch = text.match(/^["'](.*)["']$/);
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
