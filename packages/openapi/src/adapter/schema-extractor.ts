/**
 * Schema 提取器
 * 负责从 AST 中提取 Schema 定义
 */

import ts from 'typescript';
import type { SchemaDefinition } from '@api-codegen-universal/core';
import { extractStringFromNode } from './ast-utils.js';

export class SchemaExtractor {
  /** 泛型基类集合(从 responses 中检测到的) */
  private genericBaseTypes: Set<string>;

  constructor(genericBaseTypes: Set<string>) {
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

              if (schemaName && ts.isTypeLiteralNode(schemaMember.type)) {
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
          let enumValues: string[] | undefined;

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

          schema.properties![propName] = {
            name: propName,
            type: this.tsTypeToSchemaType(member.type),
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
    }

    return schema;
  }

  /**
   * 将 TS 类型转换为 schema 类型字符串
   */
  private tsTypeToSchemaType(typeNode: ts.TypeNode): string {
    switch (typeNode.kind) {
      case ts.SyntaxKind.StringKeyword:
        return 'string';
      case ts.SyntaxKind.NumberKeyword:
        return 'number';
      case ts.SyntaxKind.BooleanKeyword:
        return 'boolean';
      case ts.SyntaxKind.AnyKeyword:
        return 'any';
      default:
        return 'string';
    }
  }
}
