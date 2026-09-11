/**
 * AST 工具函数
 * 提供 TypeScript AST 相关的通用操作
 */

import ts from 'typescript';
import {
  javaGenericsToTsAngles,
  componentsSchemaRegex,
  arrayTypeRegex,
} from '../utils/type-ref-utils';

// Re-export shared regex for backward compatibility
export { componentsSchemaRegex, arrayTypeRegex } from '../utils/type-ref-utils';

/**
 * 从节点提取字符串值
 * 支持 StringLiteral, Identifier, NumericLiteral
 */
export function extractStringFromNode(node: ts.PropertyName): string | null {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isNumericLiteral(node)) return node.text;
  return null;
}

/**
 * 解码 schema 名称中的 URL 编码。
 *
 * openapi-typescript 会把 components.schemas 中的特殊字符 key 编码后输出
 * （如中文/空格名 → %XX 形式）。schemas 提取与 interfaces 生成必须使用
 * 同一解码逻辑，否则两个输出集合的键会对不上（下游按 ref 查找时 miss）。
 */
export function decodeSchemaName(name: string): string {
  if (!name.includes('%')) return name;
  try {
    return decodeURIComponent(name);
  } catch {
    // 无效编码序列，保持原样
    return name;
  }
}

/**
 * 提取 operations 引用
 * 例如: operations["AuthController_register"]
 */
export function extractOperationIdReference(
  typeNode: ts.TypeNode,
): string | null {
  if (ts.isIndexedAccessTypeNode(typeNode)) {
    if (
      ts.isLiteralTypeNode(typeNode.indexType) &&
      ts.isStringLiteral(typeNode.indexType.literal)
    ) {
      return typeNode.indexType.literal.text;
    }
  }
  return null;
}

/**
 * 提取 schema 引用
 * 例如: components["schemas"]["UserDto"]
 */
export function extractSchemaReference(
  typeNode: ts.TypeNode,
): string | undefined {
  if (!ts.isIndexedAccessTypeNode(typeNode)) return undefined;

  const objectType = typeNode.objectType;
  if (!ts.isIndexedAccessTypeNode(objectType)) return undefined;

  if (
    ts.isLiteralTypeNode(typeNode.indexType) &&
    ts.isStringLiteral(typeNode.indexType.literal)
  ) {
    let ref = typeNode.indexType.literal.text;

    // URL 解码
    if (ref.includes('%')) {
      try {
        ref = decodeURIComponent(ref);
      } catch {
        // ignore
      }
    }

    // 处理 Java 风格泛型符号
    ref = javaGenericsToTsAngles(ref);
    return ref;
  }

  return undefined;
}

// ===================================================================================
// Printer 缓存
// ===================================================================================

/** 共享 printer 实例，避免重复创建 */
export const sharedPrinter = ts.createPrinter();

/** 共享 sourceFile 实例，供 printer 使用 */
export const sharedSourceFile = ts.createSourceFile(
  'temp.ts',
  '',
  ts.ScriptTarget.Latest,
  false,
  ts.ScriptKind.TS,
);

// ===================================================================================
// 类型字符串转换
// ===================================================================================

/**
 * 将 TypeNode 转换为类型字符串
 * 并简化 components["schemas"] 引用
 */
export function typeNodeToString(
  typeNode: ts.TypeNode,
  nameConverter?: (name: string) => string,
): string {
  let typeStr = sharedPrinter.printNode(
    ts.EmitHint.Unspecified,
    typeNode,
    sharedSourceFile,
  );

  // 处理 components["schemas"]["XXX"] 格式
  typeStr = typeStr.replace(
    componentsSchemaRegex,
    (_match: string, p1: string) => (nameConverter ? nameConverter(p1) : p1),
  );

  // 处理数组类型
  typeStr = typeStr.replace(arrayTypeRegex, '$1[]');

  return typeStr;
}

/**
 * 基础类型映射
 */
export function primitiveTypeToString(kind: ts.SyntaxKind): string {
  switch (kind) {
    case ts.SyntaxKind.StringKeyword:
      return 'string';
    case ts.SyntaxKind.NumberKeyword:
      return 'number';
    case ts.SyntaxKind.BooleanKeyword:
      return 'boolean';
    case ts.SyntaxKind.NullKeyword:
      return 'null';
    case ts.SyntaxKind.UndefinedKeyword:
      return 'undefined';
    case ts.SyntaxKind.AnyKeyword:
      return 'any';
    case ts.SyntaxKind.UnknownKeyword:
      return 'unknown';
    case ts.SyntaxKind.VoidKeyword:
      return 'void';
    case ts.SyntaxKind.NeverKeyword:
      return 'never';
    case ts.SyntaxKind.ObjectKeyword:
      return 'object';
    default:
      return 'any';
  }
}

/**
 * 简化类型引用字符串
 * 将 components["schemas"]["X"] 简化为 X
 */
export function simplifyTypeReference(
  text: string,
  nameConverter?: (name: string) => string,
): string {
  return text.replace(componentsSchemaRegex, (_match: string, p1: string) =>
    nameConverter ? nameConverter(p1) : p1,
  );
}

// ===================================================================================
// JSDoc 处理
// ===================================================================================

/**
 * 提取 JSDoc 注释内容
 */
export function extractJSDocComment(node: ts.Node): string | undefined {
  // 1. 尝试获取 jsDoc 属性
  const jsDoc = (node as ts.Node & { jsDoc?: ts.JSDoc[] }).jsDoc;
  if (jsDoc && jsDoc.length > 0 && jsDoc[0]) {
    const comment = jsDoc[0].comment;
    if (typeof comment === 'string') return comment;
    if (Array.isArray(comment)) {
      return comment.map((c: ts.JSDocComment) => c.text).join('');
    }
  }

  // 2. 尝试获取合成的前导注释
  const syntheticComments = ts.getSyntheticLeadingComments(node);
  if (syntheticComments && syntheticComments.length > 0) {
    return syntheticComments
      .map((c) =>
        c.text
          .replace(/^\s*\/\*\*/, '')
          .replace(/\*\/\s*$/, '')
          .replace(/^\s*\*\s?/gm, '')
          .trim(),
      )
      .join('\n');
  }

  return undefined;
}

export interface JSDocInfo {
  summary?: string;
  description?: string;
  deprecated?: boolean;
  tags?: string[];
}

/**
 * 解析 JSDoc 注释内容
 */
export function parseJSDoc(comment: string): JSDocInfo {
  const info: JSDocInfo = {};
  const lines = comment.split('\n').map((line) => line.trim());

  let currentSection = 'summary';
  const summaryParts: string[] = [];
  const descriptionParts: string[] = [];

  for (const line of lines) {
    if (!line) continue;

    if (line.startsWith('@deprecated')) {
      info.deprecated = true;
      continue;
    }
    if (line.startsWith('@description')) {
      currentSection = 'description';
      const descContent = line.replace('@description', '').trim();
      if (descContent) descriptionParts.push(descContent);
      continue;
    }
    // TODO: openapi-typescript 生成数据并无 tags 标签
    if (line.startsWith('@tags')) {
      const tagsContent = line.replace('@tags', '').trim();
      if (tagsContent) info.tags = tagsContent.split(',').map((t) => t.trim());
      continue;
    }

    if (currentSection === 'summary') {
      summaryParts.push(line);
    } else if (currentSection === 'description') {
      descriptionParts.push(line);
    }
  }

  if (summaryParts.length > 0) info.summary = summaryParts.join('\n');
  if (descriptionParts.length > 0)
    info.description = descriptionParts.join('\n');

  return info;
}

// ===================================================================================
// 共享的 HTTP 方法过滤逻辑
// ===================================================================================

/**
 * 非 HTTP 方法的字段名集合
 * 这些字段在 operations 节点中表示元数据，不是实际的 HTTP 方法
 */
export const NON_HTTP_METHOD_FIELDS = new Set([
  'PARAMETERS',
  '$REF',
  'SUMMARY',
  'DESCRIPTION',
  'SERVERS',
]);

/**
 * 判断字段名是否为非 HTTP 方法字段
 */
export function isNonHttpMethodField(name: string): boolean {
  return NON_HTTP_METHOD_FIELDS.has(name.toUpperCase());
}

/**
 * 构建 operations 映射表 (OperationId -> TypeLiteralNode)
 */
export function buildOperationsMap(
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
