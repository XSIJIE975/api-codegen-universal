/**
 * 参数提取器
 * 负责从 OpenAPI AST 中提取 API 参数定义（Query, Path, Header, Cookie）
 * 并根据配置生成对应的 Schema 和 Interface
 */

import ts from 'typescript';
import type {
  SchemaDefinition,
  ParametersDefinition,
  NamingStyle,
} from '@api-codegen-universal/core';
import {
  extractOperationIdReference,
  extractStringFromNode,
} from './ast-utils';
import { SchemaExtractor } from './schema-extractor';
import { InterfaceGenerator } from './interface-generator';
import { NamingUtils } from '../utils/naming-utils';

/**
 * 参数提取器类
 * 处理 OpenAPI 参数定义的提取和转换
 */
export class ParameterExtractor {
  /** 命名风格配置 */
  private namingStyle: NamingStyle;
  /** 是否生成 Schema 定义 */
  private shouldGenerateSchemas: boolean;
  /** 是否生成 TypeScript 接口 */
  private shouldGenerateInterfaces: boolean;
  /** Schema 提取器实例 */
  private schemaExtractor: SchemaExtractor;
  /** 接口生成器实例 */
  private interfaceGenerator: InterfaceGenerator;

  /**
   * 构造函数
   * @param namingStyle 命名风格
   * @param shouldGenerateSchemas 是否生成 Schema
   * @param shouldGenerateInterfaces 是否生成 Interface
   * @param schemaExtractor Schema 提取器
   * @param interfaceGenerator 接口生成器
   */
  constructor(
    namingStyle: NamingStyle,
    shouldGenerateSchemas: boolean,
    shouldGenerateInterfaces: boolean,
    schemaExtractor: SchemaExtractor,
    interfaceGenerator: InterfaceGenerator,
  ) {
    this.namingStyle = namingStyle;
    this.shouldGenerateSchemas = shouldGenerateSchemas;
    this.shouldGenerateInterfaces = shouldGenerateInterfaces;
    this.schemaExtractor = schemaExtractor;
    this.interfaceGenerator = interfaceGenerator;
  }

  /**
   * 只提取参数(不提取完整API)
   * 用于仅需要参数定义的场景
   *
   * @param pathsNode paths 接口节点
   * @param operationsNode operations 接口节点
   * @param schemas Schema 定义集合（输出）
   * @param interfaces 接口定义集合（输出）
   */
  extractParametersOnly(
    pathsNode: ts.InterfaceDeclaration,
    operationsNode: ts.InterfaceDeclaration | undefined,
    schemas: Record<string, SchemaDefinition>,
    interfaces: Record<string, string>,
  ): void {
    // 1. 构建 operations 的映射表，方便通过 operationId 查找
    const operationsMap = new Map<string, ts.TypeLiteralNode>();

    if (operationsNode) {
      for (const member of operationsNode.members) {
        if (ts.isPropertySignature(member) && member.name && member.type) {
          const operationId = (member.name as ts.Identifier).text;
          if (ts.isTypeLiteralNode(member.type)) {
            operationsMap.set(operationId, member.type);
          }
        }
      }
    }

    // 2. 遍历 paths，只提取参数
    for (const pathMember of pathsNode.members) {
      if (
        ts.isPropertySignature(pathMember) &&
        pathMember.name &&
        pathMember.type
      ) {
        const path = extractStringFromNode(pathMember.name);

        if (path && ts.isTypeLiteralNode(pathMember.type)) {
          // 遍历该 path 下的 HTTP 方法
          for (const methodMember of pathMember.type.members) {
            if (
              ts.isPropertySignature(methodMember) &&
              methodMember.name &&
              methodMember.type
            ) {
              const methodName = extractStringFromNode(methodMember.name);
              if (!methodName) continue;

              // 忽略 parameters 字段和其他非 HTTP 方法字段
              if (
                [
                  'PARAMETERS',
                  '$REF',
                  'SUMMARY',
                  'DESCRIPTION',
                  'SERVERS',
                ].includes(methodName.toUpperCase())
              ) {
                continue;
              }

              // 提取 operationId 引用
              const operationIdRef = extractOperationIdReference(
                methodMember.type,
              );

              let operationNode: ts.TypeLiteralNode | undefined;
              let operationId = operationIdRef;

              // 尝试从 operationsMap 或当前节点获取 operation 定义
              if (operationIdRef && operationsMap.has(operationIdRef)) {
                operationNode = operationsMap.get(operationIdRef)!;
              } else if (ts.isTypeLiteralNode(methodMember.type)) {
                operationNode = methodMember.type;
              }

              if (operationNode) {
                // 如果没有 operationId，生成一个临时的
                if (!operationId) {
                  operationId = `temp_${path}_${methodMember.name.getText()}`;
                }

                // 只提取 parameters 属性
                for (const member of operationNode.members) {
                  if (ts.isPropertySignature(member) && member.name) {
                    const propName = (member.name as ts.Identifier).text;

                    if (
                      propName === 'parameters' &&
                      member.type &&
                      ts.isTypeLiteralNode(member.type)
                    ) {
                      this.extractParameters(
                        operationId,
                        member.type,
                        schemas,
                        interfaces,
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * 提取参数定义
   * 处理 query, path, header, cookie 参数
   *
   * @param operationId 操作 ID
   * @param parametersNode 参数节点
   * @param schemas Schema 定义集合（输出）
   * @param interfaces 接口定义集合（输出）
   * @returns 提取的参数定义对象，如果没有参数则返回 undefined
   */
  extractParameters(
    operationId: string,
    parametersNode: ts.TypeLiteralNode,
    schemas: Record<string, SchemaDefinition>,
    interfaces: Record<string, string>,
  ): ParametersDefinition | undefined {
    const parametersMap: ParametersDefinition = {};
    let hasParameters = false;

    for (const member of parametersNode.members) {
      if (ts.isPropertySignature(member) && member.name && member.type) {
        const location = (member.name as ts.Identifier).text as
          | 'query'
          | 'path'
          | 'header'
          | 'cookie';

        // 检查是否是 never 类型（表示该位置没有参数）
        if (
          ts.isTypeReferenceNode(member.type) &&
          member.type.typeName.getText() === 'never'
        ) {
          continue;
        }

        // 提取 TypeLiteralNode
        if (ts.isTypeLiteralNode(member.type)) {
          // 生成接口名称（使用配置的命名风格）
          const interfaceName = this.generateParameterInterfaceName(
            operationId,
            location,
          );

          // 根据配置生成 SchemaDefinition
          if (this.shouldGenerateSchemas) {
            const schema = this.schemaExtractor.typeNodeToSchema(
              interfaceName,
              member.type,
            );
            schemas[interfaceName] = schema;
          }

          // 根据配置生成接口代码
          if (this.shouldGenerateInterfaces) {
            // 使用 interfaceGenerator 的内部方法生成接口字符串
            const interfaceCode =
              this.interfaceGenerator.generateInterfaceString(
                interfaceName,
                member.type,
                false,
              );
            interfaces[interfaceName] = interfaceCode;
          }

          // 添加到 parametersMap，使用引用类型指向生成的 Schema/Interface
          parametersMap[location] = {
            type: 'ref',
            ref: interfaceName,
          };

          hasParameters = true;
        }
      }
    }

    return hasParameters ? parametersMap : undefined;
  }

  /**
   * 生成参数接口名称
   * 格式：{OperationId}{Location}Params
   * 例如：GetUserQueryParams
   *
   * @param operationId 操作 ID
   * @param location 参数位置 (query, path, header, cookie)
   * @returns 格式化后的接口名称
   */
  private generateParameterInterfaceName(
    operationId: string,
    location: string,
  ): string {
    // 转换 location 首字母大写
    const locationCapitalized =
      location.charAt(0).toUpperCase() + location.slice(1);

    // 根据命名风格转换
    return NamingUtils.convert(
      `${operationId}_${locationCapitalized}_Params`,
      this.namingStyle,
    );
  }
}
