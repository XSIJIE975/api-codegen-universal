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
import type { SchemaExtractor } from './schema-extractor';
import type { InterfaceGenerator } from './interface-generator';

export class ApiExtractor {
  private pathClassifier: PathClassifier;
  private parameterExtractor: ParameterExtractor;
  private requestResponseExtractor: RequestResponseExtractor;
  private schemaExtractor?: SchemaExtractor;
  private interfaceGenerator?: InterfaceGenerator;

  constructor(
    pathClassifier: PathClassifier,
    parameterExtractor: ParameterExtractor,
    requestResponseExtractor: RequestResponseExtractor,
    schemaExtractor?: SchemaExtractor,
    interfaceGenerator?: InterfaceGenerator,
  ) {
    this.pathClassifier = pathClassifier;
    this.parameterExtractor = parameterExtractor;
    this.requestResponseExtractor = requestResponseExtractor;
    this.schemaExtractor = schemaExtractor;
    this.interfaceGenerator = interfaceGenerator;
  }

  /**
   * 提取所有 API 定义
   *
   * @param pathsNode paths 接口节点
   * @param operationsNode operations 接口节点
   * @param apis API 定义数组(输出)
   * @param schemas Schema 定义集合(用于引用)
   * @param interfaces 接口代码集合(用于引用)
   */
  extractAPIs(
    pathsNode: ts.InterfaceDeclaration,
    operationsNode: ts.InterfaceDeclaration | undefined,
    apis: ApiDefinition[],
    schemas: Record<string, SchemaDefinition>,
    interfaces: Record<string, string>,
  ): void {
    // 1. 构建 operations 的映射表 (OperationId -> TypeLiteralNode)
    // openapi-typescript 生成的 AST 中，paths 下的方法通常引用 operations 接口中的定义
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

    // 2. 遍历 paths,结合 operations 生成 API
    for (const pathMember of pathsNode.members) {
      if (
        ts.isPropertySignature(pathMember) &&
        pathMember.name &&
        pathMember.type
      ) {
        // 提取 path (可能是 StringLiteral)
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

              const method = methodName.toUpperCase();

              // 忽略 parameters 字段和其他非 HTTP 方法字段
              if (
                [
                  'PARAMETERS',
                  '$REF',
                  'SUMMARY',
                  'DESCRIPTION',
                  'SERVERS',
                ].includes(method)
              ) {
                continue;
              }

              // 提取 operationId 引用
              // 例如: operations["getUsers"]
              const operationIdRef = extractOperationIdReference(
                methodMember.type,
              );

              let operationNode: ts.TypeLiteralNode | undefined;
              let operationId = operationIdRef;

              // 尝试从 operationsMap 中查找详细定义
              if (operationIdRef && operationsMap.has(operationIdRef)) {
                operationNode = operationsMap.get(operationIdRef)!;
              } else if (ts.isTypeLiteralNode(methodMember.type)) {
                // 如果是内联定义
                operationNode = methodMember.type;
              }

              if (operationNode) {
                // 如果没有 operationId，根据 path 和 method 生成一个
                if (!operationId) {
                  operationId = this.generateOperationId(path, method);
                }

                // 提取 JSDoc 信息 (注释、标签等)
                const jsDocComment = extractJSDocComment(methodMember);
                const jsDocInfo = jsDocComment
                  ? parseJSDoc(jsDocComment)
                  : undefined;

                // 构建 ApiDefinition
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
        }
      }
    }
  }

  /**
   * 生成 OperationId
   * 规则: method + PathParts (PascalCase)
   * 例如: GET /users/{id} -> getUsersById
   */
  private generateOperationId(path: string, method: string): string {
    const parts = path.split('/').filter((p) => p);
    const pathStr = parts
      .map((p) => {
        if (p.startsWith('{') && p.endsWith('}')) {
          const paramName = p.slice(1, -1);
          return (
            'By' + (paramName.charAt(0).toUpperCase() + paramName.slice(1))
          );
        }
        return p.charAt(0).toUpperCase() + p.slice(1);
      })
      .join('');
    return method.toLowerCase() + pathStr;
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
    // 分类路径 (用于决定生成文件的位置)
    const category = this.pathClassifier.classify(path);

    // 基础 API 定义
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

    // 解析 operation 内容 (parameters, requestBody, responses)
    for (const member of operationNode.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = (member.name as ts.Identifier).text;

        if (
          propName === 'parameters' &&
          member.type &&
          ts.isTypeLiteralNode(member.type)
        ) {
          // 提取 parameters (query/path/header/cookie)
          api.parameters = this.parameterExtractor.extractParameters(
            operationId,
            member.type,
            schemas,
            interfaces,
          );
        } else if (propName === 'requestBody' && member.type) {
          // 提取 requestBody
          api.requestBody = this.requestResponseExtractor.extractRequestBody(
            member.type,
          );
        } else if (propName === 'responses' && member.type) {
          // 提取 responses
          api.responses = this.requestResponseExtractor.extractResponses(
            member.type,
            operationId,
            schemas,
            interfaces,
            this.schemaExtractor,
            this.interfaceGenerator,
          );
        }
      }
    }

    return api;
  }
}
