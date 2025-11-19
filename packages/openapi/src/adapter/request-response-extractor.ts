/**
 * 请求/响应提取器
 * 负责提取 requestBody 和 responses 定义
 */

import ts from 'typescript';
import type {
  ApiDefinition,
  SchemaReference,
} from '@api-codegen-universal/core';
import { extractStringFromNode, extractSchemaReference } from './ast-utils.js';
import { GenericDetector } from '../utils/generic-detector.js';

export class RequestResponseExtractor {
  private genericDetector: GenericDetector;
  private genericBaseTypes: Map<string, string>;

  constructor(
    genericDetector: GenericDetector,
    genericBaseTypes: Map<string, string>,
  ) {
    this.genericDetector = genericDetector;
    this.genericBaseTypes = genericBaseTypes;
  }

  /**
   * 提取 requestBody 定义
   */
  extractRequestBody(typeNode: ts.TypeNode): ApiDefinition['requestBody'] {
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

          // 遍历 content-type
          for (const contentMember of member.type.members) {
            if (ts.isPropertySignature(contentMember) && contentMember.name) {
              const contentType = extractStringFromNode(contentMember.name);

              if (contentType && contentMember.type) {
                // 提取 schema 引用
                const schemaRef = extractSchemaReference(contentMember.type);

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
              required: true,
            };
          }
        }
      }
    }

    return undefined;
  }

  /**
   * 提取 responses 定义
   */
  extractResponses(typeNode: ts.TypeNode): ApiDefinition['responses'] {
    const responses: ApiDefinition['responses'] = {};

    if (!ts.isTypeLiteralNode(typeNode)) {
      return responses;
    }

    // 遍历所有状态码
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name && member.type) {
        const statusCode = extractStringFromNode(member.name);

        if (statusCode && ts.isTypeLiteralNode(member.type)) {
          // 从 emitNode.leadingComments 提取 description
          let description = '';

          const memberWithEmit = member as ts.Node & {
            emitNode?: {
              leadingComments?: Array<{ kind: number; text: string }>;
            };
          };
          if (memberWithEmit.emitNode?.leadingComments) {
            for (const comment of memberWithEmit.emitNode.leadingComments) {
              // comment.kind === 3 是多行注释 /* */
              // comment.text 格式: "* @description 注册成功 "
              if (comment.text) {
                const match = comment.text.match(
                  /\*\s*@description\s+(.+?)\s*$/,
                );
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
                // 查找 application/json
                for (const contentMember of respMember.type.members) {
                  if (
                    ts.isPropertySignature(contentMember) &&
                    contentMember.name
                  ) {
                    const contentType = extractStringFromNode(
                      contentMember.name,
                    );

                    if (
                      contentType === 'application/json' &&
                      contentMember.type
                    ) {
                      // 检测泛型模式 - 使用 printer 将 TypeNode 转为文本
                      const printer = ts.createPrinter();
                      const sourceFile = ts.createSourceFile(
                        'temp.ts',
                        '',
                        ts.ScriptTarget.Latest,
                        false,
                        ts.ScriptKind.TS,
                      );
                      const typeText = printer.printNode(
                        ts.EmitHint.Unspecified,
                        contentMember.type,
                        sourceFile,
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

                        // 直接使用完整类型名作为引用
                        schemaRef = {
                          type: 'ref',
                          ref: `${genericResult.baseType}<${genericResult.genericParam}>`,
                        };
                      } else {
                        // 普通引用
                        const schemaName = extractSchemaReference(
                          contentMember.type,
                        );
                        schemaRef = {
                          type: 'ref',
                          ref: schemaName || 'unknown',
                        };
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
