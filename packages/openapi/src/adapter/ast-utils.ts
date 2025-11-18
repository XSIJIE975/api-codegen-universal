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
export function typeNodeToString(typeNode: ts.TypeNode): string {
  const printer = ts.createPrinter();
  const sourceFile = ts.createSourceFile(
    'temp.ts',
    '',
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );

  // 打印类型节点
  let typeStr = printer.printNode(
    ts.EmitHint.Unspecified,
    typeNode,
    sourceFile,
  );

  // 处理 components["schemas"]["XXX"] 格式,提取出类型名
  typeStr = typeStr.replace(/components\["schemas"\]\["([^"]+)"\]/g, '$1');

  // 处理数组类型
  typeStr = typeStr.replace(/Array<(.+)>/g, '$1[]');

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
