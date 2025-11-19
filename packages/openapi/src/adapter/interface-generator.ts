/**
 * 接口代码生成器
 * 负责生成 TypeScript 接口字符串
 */

import ts from 'typescript';
import { extractStringFromNode, simplifyTypeReference } from './ast-utils.js';

export class InterfaceGenerator {
  /** 泛型基类集合 name -> fieldName */
  private genericBaseTypes: Map<string, string>;
  /** 接口导出模式 */
  private interfaceExportMode: 'export' | 'declare';

  constructor(
    genericBaseTypes: Map<string, string>,
    interfaceExportMode: 'export' | 'declare' = 'export',
  ) {
    this.genericBaseTypes = genericBaseTypes;
    this.interfaceExportMode = interfaceExportMode;
  }

  /**
   * 从 components 节点生成所有接口代码
   */
  generateInterfaceCode(
    componentsNode: ts.InterfaceDeclaration,
    interfaces: Record<string, string>,
  ): void {
    // 找到 schemas 属性
    for (const member of componentsNode.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = (member.name as ts.Identifier).text;

        if (
          propName === 'schemas' &&
          member.type &&
          ts.isTypeLiteralNode(member.type)
        ) {
          // 遍历所有 schema
          for (const schemaMember of member.type.members) {
            if (
              ts.isPropertySignature(schemaMember) &&
              schemaMember.name &&
              schemaMember.type
            ) {
              const schemaName = extractStringFromNode(schemaMember.name);

              if (schemaName) {
                // 生成接口代码
                const interfaceCode = this.generateInterfaceString(
                  schemaName,
                  schemaMember.type,
                  this.genericBaseTypes.has(schemaName),
                  this.genericBaseTypes.get(schemaName),
                );
                interfaces[schemaName] = interfaceCode;
              }
            }
          }
        }
      }
    }
  }

  /**
   * 生成单个接口的代码字符串
   */
  private generateInterfaceString(
    name: string,
    typeNode: ts.TypeNode,
    isGeneric: boolean,
    genericField?: string,
  ): string {
    // 如果是对象字面量，生成 interface
    if (ts.isTypeLiteralNode(typeNode)) {
      const lines: string[] = [];

      // 接口声明行 - 根据配置选择 export 或 declare
      const exportKeyword =
        this.interfaceExportMode === 'export' ? 'export ' : 'declare ';
      const genericPart = isGeneric ? '<T = any>' : '';
      lines.push(`${exportKeyword}interface ${name}${genericPart} {`);

      // 创建 printer 用于打印注释
      const printer = ts.createPrinter({ removeComments: false });
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        '',
        ts.ScriptTarget.Latest,
        false,
        ts.ScriptKind.TS,
      );

      // 遍历所有属性
      for (const member of typeNode.members) {
        if (ts.isPropertySignature(member) && member.name && member.type) {
          // 打印整个成员节点(包括注释)
          const memberText = printer.printNode(
            ts.EmitHint.Unspecified,
            member,
            sourceFile,
          );

          const propName = (member.name as ts.Identifier).text;

          if (isGeneric && genericField && propName === genericField) {
            // 提取注释
            const commentMatch = memberText.match(/^(\s*\/\*\*[\s\S]*?\*\/)/);
            const comment = commentMatch ? commentMatch[1] + '\n' : '';

            // 构建新行，替换类型为 T
            const isOptional = !!member.questionToken;
            const optionalMark = isOptional ? '?' : '';
            lines.push(`${comment}  ${propName}${optionalMark}: T;`);
          } else {
            lines.push(`  ${simplifyTypeReference(memberText)}`);
          }
        }
      }

      lines.push('}');
      return lines.join('\n');
    }

    // 对于其他类型(如 Union, Intersection, Array 等)，生成 type alias
    const exportKeyword =
      this.interfaceExportMode === 'export' ? 'export ' : 'declare ';
    const genericPart = isGeneric ? '<T = any>' : '';

    // 使用 printer 打印类型定义
    const printer = ts.createPrinter({ removeComments: false });
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      '',
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    );

    const typeText = printer.printNode(
      ts.EmitHint.Unspecified,
      typeNode,
      sourceFile,
    );

    return `${exportKeyword}type ${name}${genericPart} = ${simplifyTypeReference(typeText)};`;
  }
}
