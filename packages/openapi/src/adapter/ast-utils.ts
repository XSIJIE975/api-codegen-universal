/**
 * AST 工具函数
 * 提供 TypeScript AST 相关的通用操作
 */

import ts from 'typescript';

/**
 * 从节点提取字符串值
 */
export function extractStringFromNode(node: ts.PropertyName): string | null {
  if (ts.isStringLiteral(node)) {
    return node.text;
  }
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return node.text;
  }
  return null;
}

/**
 * 提取 operations 引用
 * 例如: operations["AuthController_register"]
 */
export function extractOperationIdReference(
  typeNode: ts.TypeNode,
): string | null {
  if (ts.isIndexedAccessTypeNode(typeNode)) {
    // typeNode.indexType 应该是字符串字面量
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
  if (ts.isIndexedAccessTypeNode(typeNode)) {
    // components["schemas"]["XXX"]
    const objectType = typeNode.objectType;

    if (ts.isIndexedAccessTypeNode(objectType)) {
      // 提取最终的 schema 名称
      if (
        ts.isLiteralTypeNode(typeNode.indexType) &&
        ts.isStringLiteral(typeNode.indexType.literal)
      ) {
        return typeNode.indexType.literal.text;
      }
    }
  }

  return undefined;
}

/**
 * 将 TypeNode 转换为类型字符串
 */
// 缓存 printer 和 sourceFile 以提高性能
const sharedPrinter = ts.createPrinter();
const sharedSourceFile = ts.createSourceFile(
  'temp.ts',
  '',
  ts.ScriptTarget.Latest,
  false,
  ts.ScriptKind.TS,
);

// 缓存正则表达式 - 不使用全局标志避免 lastIndex 问题
const componentsSchemaRegex = /components\["schemas"\]\["([^"]+)"\]/g;
const arrayTypeRegex = /Array<(.+)>/g;

export function typeNodeToString(typeNode: ts.TypeNode): string {
  // 打印类型节点
  let typeStr = sharedPrinter.printNode(
    ts.EmitHint.Unspecified,
    typeNode,
    sharedSourceFile,
  );

  // 处理 components["schemas"]["XXX"] 格式,提取出类型名
  typeStr = typeStr.replace(componentsSchemaRegex, '$1');

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
 * @example components["schemas"]["UserRole"] => UserRole
 */
export function simplifyTypeReference(text: string): string {
  // 复用 componentsSchemaRegex 以避免重复定义
  return text.replace(componentsSchemaRegex, '$1');
}

/**
 * 提取 JSDoc 注释内容
 */
export function extractJSDocComment(node: ts.Node): string | undefined {
  // 1. 尝试获取 jsDoc 属性 (解析源码时产生)
  const jsDoc = (node as ts.Node & { jsDoc?: ts.JSDoc[] }).jsDoc;
  if (jsDoc && jsDoc.length > 0 && jsDoc[0]) {
    const comment = jsDoc[0].comment;
    if (typeof comment === 'string') {
      return comment;
    }
    // 处理 TypeScript 5.x 中的 JSDocComment 节点数组
    if (Array.isArray(comment)) {
      return comment.map((c: ts.JSDocComment) => c.text).join('');
    }
  }

  // 2. 尝试获取合成的前导注释 (构造 AST 时产生，如 openapi-typescript)
  const syntheticComments = ts.getSyntheticLeadingComments(node);
  if (syntheticComments && syntheticComments.length > 0) {
    return syntheticComments
      .map((c) => {
        // 去掉注释标记 /** */ 和 *
        return c.text
          .replace(/^\s*\/\*\*/, '')
          .replace(/\*\/\s*$/, '')
          .replace(/^\s*\*\s?/gm, '')
          .trim();
      })
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
      if (descContent) {
        descriptionParts.push(descContent);
      }
      continue;
    }
    // TODO: openapi-typescript 生成数据并无 tags 标签，后面尝试从原始文档中获取
    if (line.startsWith('@tags')) {
      const tagsContent = line.replace('@tags', '').trim();
      if (tagsContent) {
        info.tags = tagsContent.split(',').map((t) => t.trim());
      }
      continue;
    }

    if (currentSection === 'summary') {
      summaryParts.push(line);
    } else if (currentSection === 'description') {
      descriptionParts.push(line);
    }
  }

  if (summaryParts.length > 0) {
    info.summary = summaryParts.join('\n');
  }
  if (descriptionParts.length > 0) {
    info.description = descriptionParts.join('\n');
  }

  return info;
}
