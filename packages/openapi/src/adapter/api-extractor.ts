/**
 * API 提取器
 * 负责从 TypeScript AST 中提取 API 定义
 *
 * 主要功能：
 * 1. 遍历 paths 和 operations 节点
 * 2. 提取 HTTP 方法、路径、OperationID
 * 3. 提取参数、请求体、响应体
 * 4. 生成标准的 ApiDefinition 对象
 */

import ts from 'typescript';
import type {
  ApiDefinition,
  SchemaDefinition,
} from '@api-codegen-universal/core';
import {
  extractStringFromNode,
  extractOperationIdReference,
  extractJSDocComment,
  parseJSDoc,
  type JSDocInfo,
} from './ast-utils';
import { PathClassifier } from '../utils/path-classifier';
import { ParameterExtractor } from './parameter-extractor';
import { RequestResponseExtractor } from './request-response-extractor';

export class ApiExtractor {
  private readonly pathClassifier: PathClassifier;
  private readonly parameterExtractor: ParameterExtractor;
  private readonly requestResponseExtractor: RequestResponseExtractor;

  constructor(
    pathClassifier: PathClassifier,
    parameterExtractor: ParameterExtractor,
    requestResponseExtractor: RequestResponseExtractor,
  ) {
    this.pathClassifier = pathClassifier;
    this.parameterExtractor = parameterExtractor;
    this.requestResponseExtractor = requestResponseExtractor;
  }

  /**
   * 提取所有 API 定义
   */
  extractAPIs(
    pathsNode: ts.InterfaceDeclaration,
    operationsNode: ts.InterfaceDeclaration | undefined,
    apis: ApiDefinition[],
    schemas: Record<string, SchemaDefinition>,
    interfaces: Record<string, string>,
  ): void {
    // 构建 operations 映射表
    const operationsMap = this.buildOperationsMap(operationsNode);

    // 遍历 paths
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

        const method = methodName.toUpperCase();

        // 忽略非 HTTP 方法字段
        if (isNonHttpMethodField(method)) continue;

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
          operationId = generateOperationId(path, method);
        }

        const jsDocComment = extractJSDocComment(methodMember);
        const jsDocInfo = jsDocComment ? parseJSDoc(jsDocComment) : undefined;

        const api = this.buildApiDefinition(
          path,
          method,
          operationId,
          operationNode,
          schemas,
          interfaces,
          jsDocInfo,
        );

        apis.push(api);
      }
    }
  }

  /**
   * 构建 operations 映射表 (OperationId -> TypeLiteralNode)
   */
  private buildOperationsMap(
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
   * 构建单个 API 定义
   */
  private buildApiDefinition(
    path: string,
    method: string,
    operationId: string,
    operationNode: ts.TypeLiteralNode,
    schemas: Record<string, SchemaDefinition>,
    interfaces: Record<string, string>,
    jsDocInfo?: JSDocInfo,
  ): ApiDefinition {
    const category = this.pathClassifier.classify(path);

    const api: ApiDefinition = {
      path,
      method: method as ApiDefinition['method'],
      operationId,
      summary: jsDocInfo?.summary,
      description: jsDocInfo?.description,
      deprecated: jsDocInfo?.deprecated,
      tags: jsDocInfo?.tags,
      category,
      responses: {},
    };

    for (const member of operationNode.members) {
      if (!ts.isPropertySignature(member) || !member.name) continue;
      const propName = (member.name as ts.Identifier).text;

      if (
        propName === 'parameters' &&
        member.type &&
        ts.isTypeLiteralNode(member.type)
      ) {
        api.parameters = this.parameterExtractor.extractParameters(
          operationId,
          member.type,
          schemas,
          interfaces,
        );
      } else if (propName === 'requestBody' && member.type) {
        api.requestBody = this.requestResponseExtractor.extractRequestBody(
          member.type,
          operationId,
        );
      } else if (propName === 'responses' && member.type) {
        api.responses = this.requestResponseExtractor.extractResponses(
          member.type,
          operationId,
        );
      }
    }

    return api;
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

function isNonHttpMethodField(method: string): boolean {
  return NON_HTTP_METHOD_FIELDS.has(method);
}

/**
 * 生成 OperationId
 * 规则: method + PathParts (PascalCase)
 * 例如: GET /users/{id} -> getUsersById
 */
function generateOperationId(path: string, method: string): string {
  const parts = path.split('/').filter((p) => p);
  const pathStr = parts
    .map((p) => {
      if (p.startsWith('{') && p.endsWith('}')) {
        const paramName = p.slice(1, -1);
        return 'By' + (paramName.charAt(0).toUpperCase() + paramName.slice(1));
      }
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join('');
  return method.toLowerCase() + pathStr;
}
