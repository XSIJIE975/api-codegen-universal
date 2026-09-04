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
  WarningsCollector,
} from '@api-codegen-universal/core';
import {
  extractStringFromNode,
  extractOperationIdReference,
  extractJSDocComment,
  parseJSDoc,
  type JSDocInfo,
  isNonHttpMethodField,
  buildOperationsMap,
} from './ast-utils';
import { PathClassifier } from '../utils/path-classifier';
import { resolveOperationIdCollisions } from '../utils/operation-id-utils';
import { ParameterExtractor } from './parameter-extractor';
import { RequestResponseExtractor } from './request-response-extractor';

/** 阶段一收集的操作信息（尚未构建 ApiDefinition） */
interface PendingOperation {
  path: string;
  method: string;
  operationId: string;
  operationNode: ts.TypeLiteralNode;
  jsDocInfo?: JSDocInfo;
}

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
   *
   * 分三个阶段：
   * 1. 遍历 paths/methods 收集操作信息（此时不构建 ApiDefinition）；
   * 2. 以归一化形式对 operationId 消歧——参数/请求体/响应的类型名均由
   *    operationId 派生，必须先消歧再提取，否则类型名与 id 失同步；
   * 3. 用消歧后的 operationId 构建 ApiDefinition。
   */
  extractAPIs(
    pathsNode: ts.InterfaceDeclaration,
    operationsNode: ts.InterfaceDeclaration | undefined,
    apis: ApiDefinition[],
    schemas: Record<string, SchemaDefinition>,
    interfaces: Record<string, string>,
    warnings?: WarningsCollector,
  ): void {
    // 构建 operations 映射表
    const operationsMap = this.buildOperationsMap(operationsNode);

    // ---- 阶段一：收集操作信息 ----
    const pendingOperations: PendingOperation[] = [];

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

        pendingOperations.push({
          path,
          method,
          operationId,
          operationNode,
          jsDocInfo,
        });
      }
    }

    // ---- 阶段二：operationId 归一化消歧 ----
    resolveOperationIdCollisions(pendingOperations, warnings);

    // ---- 阶段三：构建 ApiDefinition ----
    for (const op of pendingOperations) {
      apis.push(
        this.buildApiDefinition(
          op.path,
          op.method,
          op.operationId,
          op.operationNode,
          schemas,
          interfaces,
          op.jsDocInfo,
        ),
      );
    }
  }

  /**
   * 构建 operations 映射表 (OperationId -> TypeLiteralNode)
   */
  private buildOperationsMap(
    operationsNode: ts.InterfaceDeclaration | undefined,
  ): Map<string, ts.TypeLiteralNode> {
    return buildOperationsMap(operationsNode);
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

/**
 * 生成 OperationId
 * 规则: method + PathWords (各段按 -/_ 拆词后 PascalCase)
 * 例如: GET /users/{id} -> getUsersById
 *       POST /service/hiagent-convert-file-to-jsonl -> postServiceHiagentConvertFileToJsonl
 *
 * 分词规则与 NamingUtils.convert 一致（按 `_-` 拆分），
 * 避免同一 id 在不同层的命名变换下产生不同结果。
 * 剩余的归一化冲突由 resolveOperationIdCollisions 统一消歧。
 */
function generateOperationId(path: string, method: string): string {
  const words = path
    .split('/')
    .filter((p) => p)
    .flatMap((p) => {
      if (p.startsWith('{') && p.endsWith('}')) {
        const paramName = p.slice(1, -1);
        return [
          'By' + (paramName.charAt(0).toUpperCase() + paramName.slice(1)),
        ];
      }
      return p
        .split(/[_-]+/)
        .filter((w) => w)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    });
  return method.toLowerCase() + words.join('');
}
