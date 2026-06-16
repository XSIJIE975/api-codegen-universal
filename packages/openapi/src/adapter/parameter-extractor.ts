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
import { NamingUtils } from '../utils/naming-utils';
import type { SchemaExtractor } from './schema-extractor';
import type { InterfaceGenerator } from './interface-generator';

/**
 * 参数提取器类
 */
export class ParameterExtractor {
  private readonly namingStyle: NamingStyle;
  private readonly shouldGenerateSchemas: boolean;
  private readonly shouldGenerateInterfaces: boolean;
  private readonly schemaExtractor: SchemaExtractor;
  private readonly interfaceGenerator: InterfaceGenerator;

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
   */
  extractParametersOnly(
    pathsNode: ts.InterfaceDeclaration,
    operationsNode: ts.InterfaceDeclaration | undefined,
    schemas: Record<string, SchemaDefinition>,
    interfaces: Record<string, string>,
  ): void {
    const operationsMap = buildOperationsMap(operationsNode);

    for (const pathMember of pathsNode.members) {
      if (
        !ts.isPropertySignature(pathMember) ||
        !pathMember.name ||
        !pathMember.type
      )
        continue;

      const path = extractStringFromNode(pathMember.name);
      if (!path || !ts.isTypeLiteralNode(pathMember.type)) continue;

      for (const methodMember of pathMember.type.members) {
        if (
          !ts.isPropertySignature(methodMember) ||
          !methodMember.name ||
          !methodMember.type
        )
          continue;

        const methodName = extractStringFromNode(methodMember.name);
        if (!methodName) continue;
        if (isNonHttpMethodField(methodName)) continue;

        const operationIdRef = extractOperationIdReference(methodMember.type);

        let operationNode: ts.TypeLiteralNode | undefined;
        let operationId = operationIdRef;

        if (operationIdRef && operationsMap.has(operationIdRef)) {
          operationNode = operationsMap.get(operationIdRef)!;
        } else if (ts.isTypeLiteralNode(methodMember.type)) {
          operationNode = methodMember.type;
        }

        if (!operationNode) continue;

        if (!operationId) {
          operationId = `temp_${path}_${methodMember.name.getText()}`;
        }

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
      if (!ts.isPropertySignature(member) || !member.name || !member.type)
        continue;

      const location = (member.name as ts.Identifier).text as
        | 'query'
        | 'path'
        | 'header'
        | 'cookie';

      // never 类型表示该位置没有参数
      if (
        ts.isTypeReferenceNode(member.type) &&
        member.type.typeName.getText() === 'never'
      ) {
        continue;
      }

      if (ts.isTypeLiteralNode(member.type)) {
        const interfaceName = generateParameterInterfaceName(
          operationId,
          location,
          this.namingStyle,
        );

        if (this.shouldGenerateSchemas) {
          schemas[interfaceName] = this.schemaExtractor.typeNodeToSchema(
            interfaceName,
            member.type,
          );
        }

        if (this.shouldGenerateInterfaces) {
          interfaces[interfaceName] =
            this.interfaceGenerator.generateInterfaceString(
              interfaceName,
              member.type,
              false,
            );
        }

        parametersMap[location] = { type: 'ref', ref: interfaceName };
        hasParameters = true;
      }
    }

    return hasParameters ? parametersMap : undefined;
  }
}

// ===================================================================================
// 辅助函数
// ===================================================================================

const NON_HTTP_METHOD_FIELDS = new Set([
  'PARAMETERS',
  '$REF',
  'SUMMARY',
  'DESCRIPTION',
  'SERVERS',
]);

function isNonHttpMethodField(name: string): boolean {
  return NON_HTTP_METHOD_FIELDS.has(name.toUpperCase());
}

function buildOperationsMap(
  operationsNode: ts.InterfaceDeclaration | undefined,
): Map<string, ts.TypeLiteralNode> {
  const map = new Map<string, ts.TypeLiteralNode>();
  if (!operationsNode) return map;

  for (const member of operationsNode.members) {
    if (
      ts.isPropertySignature(member) &&
      member.name &&
      member.type &&
      ts.isTypeLiteralNode(member.type)
    ) {
      map.set((member.name as ts.Identifier).text, member.type);
    }
  }
  return map;
}

/**
 * 生成参数接口名称
 * 格式：{OperationId}{Location}Params
 */
function generateParameterInterfaceName(
  operationId: string,
  location: string,
  namingStyle: NamingStyle,
): string {
  const locationCapitalized =
    location.charAt(0).toUpperCase() + location.slice(1);
  return NamingUtils.convert(
    `${operationId}_${locationCapitalized}_Params`,
    namingStyle,
  );
}
