/**
 * 参数提取器
 * 负责提取 API 参数定义
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

export class ParameterExtractor {
  private namingStyle: NamingStyle;
  private shouldGenerateSchemas: boolean;
  private shouldGenerateInterfaces: boolean;
  private schemaExtractor: SchemaExtractor;
  private interfaceGenerator: InterfaceGenerator;
  /** 缓存的正则表达式 */
  private readonly splitRegex = /[_-]/;

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
   */
  extractParametersOnly(
    pathsNode: ts.InterfaceDeclaration,
    operationsNode: ts.InterfaceDeclaration,
    schemas: Record<string, SchemaDefinition>,
    interfaces: Record<string, string>,
  ): void {
    // 1. 构建 operations 的映射表
    const operationsMap = new Map<string, ts.TypeLiteralNode>();

    for (const member of operationsNode.members) {
      if (ts.isPropertySignature(member) && member.name && member.type) {
        const operationId = (member.name as ts.Identifier).text;
        if (ts.isTypeLiteralNode(member.type)) {
          operationsMap.set(operationId, member.type);
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
              // 提取 operationId 引用
              const operationId = extractOperationIdReference(
                methodMember.type,
              );

              if (operationId && operationsMap.has(operationId)) {
                const operationNode = operationsMap.get(operationId)!;

                // 只提取 parameters
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

        // 检查是否是 never 类型
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
            const interfaceCode = this.interfaceGenerator[
              'generateInterfaceString'
            ](interfaceName, member.type, false);
            interfaces[interfaceName] = interfaceCode;
          }

          // 添加到 parametersMap
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
   */
  private generateParameterInterfaceName(
    operationId: string,
    location: string,
  ): string {
    // 转换 location 首字母大写
    const locationCapitalized =
      location.charAt(0).toUpperCase() + location.slice(1);

    // 根据命名风格转换
    return this.convertToNamingStyle(
      `${operationId}_${locationCapitalized}_Params`,
    );
  }

  /**
   * 转换为指定的命名风格
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
}
