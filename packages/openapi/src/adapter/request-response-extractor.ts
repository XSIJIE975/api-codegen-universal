/**
 * 请求/响应提取器
 * 负责从 OpenAPI AST 中提取 requestBody 和 responses 定义
 * 处理泛型类型检测和内联类型的自动命名
 */

import ts from 'typescript';
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
  /** 缓存的正则表达式，用于提取 JSDoc 中的 @description */
  private readonly descriptionRegex = /\*\s*@description\s+(.+?)\s*$/;
  /** 缓存的正则表达式，用于分割字符串 */
  private readonly splitRegex = /[_-]/;

  /**
   * 构造函数
   * @param genericDetector 泛型检测器
   * @param genericBaseTypes 泛型基类映射表
   * @param genericInfoMap 泛型信息映射表
   * @param namingStyle 命名风格
   */
  constructor(
    genericDetector: GenericDetector,
    genericBaseTypes: Map<string, string>,
    genericInfoMap: Map<string, { baseType: string; generics: string[] }>,
    namingStyle: NamingStyle,
  ) {
    this.genericDetector = genericDetector;
    this.genericBaseTypes = genericBaseTypes;
    this.genericInfoMap = genericInfoMap;
    this.namingStyle = namingStyle;
  }

  /**
   * 解析 Schema 引用，并处理泛型转换
   * 将 TypeScript 类型节点转换为 Schema 引用字符串
   *
   * @param typeNode TypeScript 类型节点
   * @returns Schema 引用字符串，如果无法解析则返回 undefined
   */
  private resolveSchemaRef(typeNode: ts.TypeNode): string | undefined {
    // 处理数组类型 Type[]
    if (ts.isArrayTypeNode(typeNode)) {
      const elementTypeRef = this.resolveSchemaRef(typeNode.elementType);
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
        );
        if (elementTypeRef) {
          return `${elementTypeRef}[]`;
        }
      }
    }

    // 提取基本引用
    const ref = extractSchemaReference(typeNode);
    if (!ref) return undefined;

    // 检查泛型信息，如果存在则还原为泛型语法
    if (this.genericInfoMap && this.genericInfoMap.has(ref)) {
      const info = this.genericInfoMap.get(ref)!;
      // 转换为 Base<Arg>
      // 规范化参数名 (ApplyListVO -> ApplyListVO, ResultVO«User» -> ResultVO_User)
      const args = info.generics.map((arg) =>
        arg
          .replace(/«/g, '_')
          .replace(/»/g, '')
          .replace(/,/g, '_')
          .replace(/\s/g, ''),
      );
      return `${info.baseType}<${args.join(', ')}>`;
    }

    return ref;
  }

  /**
   * 转换为指定的命名风格
   * 支持 PascalCase, camelCase, snake_case
   *
   * @param name 原始名称
   * @returns 转换后的名称
   */
  private convertToNamingStyle(name: string): string {
    switch (this.namingStyle) {
      case 'PascalCase':
        // AuthController_register_Query_Params -> AuthControllerRegisterQueryParams
        return name
          .split(this.splitRegex)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join('');

      case 'camelCase': {
        // AuthController_register_Query_Params -> authControllerRegisterQueryParams
        const parts = name.split(this.splitRegex).filter((p) => p.length > 0);
        if (parts.length === 0) return name;
        const firstPart = parts[0]!;
        return (
          firstPart.charAt(0).toLowerCase() +
          firstPart.slice(1) +
          parts
            .slice(1)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join('')
        );
      }

      case 'snake_case':
        // AuthController_register_Query_Params -> auth_controller_register_query_params
        return name
          .toLowerCase()
          .replace(/[A-Z]/g, (letter, index) =>
            index === 0 ? letter.toLowerCase() : '_' + letter.toLowerCase(),
          );

      default:
        return name;
    }
  }

  /**
   * 提取 requestBody 定义
   *
   * @param typeNode requestBody 对应的类型节点
   * @returns requestBody 定义对象
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

          // 遍历 content-type (如 application/json, multipart/form-data)
          for (const contentMember of member.type.members) {
            if (ts.isPropertySignature(contentMember) && contentMember.name) {
              const contentType = extractStringFromNode(contentMember.name);

              if (contentType && contentMember.type) {
                // 提取 schema 引用
                const schemaRef = this.resolveSchemaRef(contentMember.type);

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
              // comment.text 格式: "* @description 注册成功 "
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
                // 查找 application/json
                // 目前主要支持 application/json，其他类型可扩展
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

                        // 直接使用完整类型名作为引用
                        schemaRef = {
                          type: 'ref',
                          ref: `${genericResult.baseType}<${genericResult.genericParam}>`,
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
                            const generatedName = this.convertToNamingStyle(
                              `${operationId}_Response`,
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
