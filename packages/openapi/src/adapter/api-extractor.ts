/**
 * API 提取器
 * 负责提取 API 定义
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
  private pathClassifier: PathClassifier;
  private parameterExtractor: ParameterExtractor;
  private requestResponseExtractor: RequestResponseExtractor;

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
    operationsNode: ts.InterfaceDeclaration,
    apis: ApiDefinition[],
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
              const method = (
                methodMember.name as ts.Identifier
              ).text.toUpperCase();

              // 提取 operationId 引用
              const operationId = extractOperationIdReference(
                methodMember.type,
              );

              if (operationId && operationsMap.has(operationId)) {
                const operationNode = operationsMap.get(operationId)!;

                // 提取 JSDoc 信息
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
    // 分类路径
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

    // 解析 operation 内容
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
          );
        }
      }
    }

    return api;
  }
}
