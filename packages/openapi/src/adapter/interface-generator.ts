/**
 * 接口代码生成器
 * 负责生成 TypeScript 接口字符串
 */

import ts from 'typescript';
import { extractStringFromNode, typeNodeToString } from './ast-utils.js';

export class InterfaceGenerator {
  /** 泛型基类集合 */
  private genericBaseTypes: Set<string>;
  /** 接口导出模式 */
  private interfaceExportMode: 'export' | 'declare';

  constructor(
    genericBaseTypes: Set<string>,
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

              if (schemaName && ts.isTypeLiteralNode(schemaMember.type)) {
                // 生成接口代码
                const interfaceCode = this.generateInterfaceString(
                  schemaName,
                  schemaMember.type,
                  this.genericBaseTypes.has(schemaName),
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
    typeNode: ts.TypeLiteralNode,
    isGeneric: boolean,
  ): string {
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
        const propName = (member.name as ts.Identifier).text;
        const isOptional = !!member.questionToken;

        // 打印整个成员节点(包括注释)
        const memberText = printer.printNode(
          ts.EmitHint.Unspecified,
          member,
          sourceFile,
        );

        // 提取注释部分
        const commentMatch = memberText.match(/(\/\*\*[\s\S]*?\*\/)/);
        if (commentMatch && commentMatch[1]) {
          // 有注释,格式化并添加
          const commentBlock = commentMatch[1];
          const commentLines = commentBlock.split('\n');
          commentLines.forEach((line) => {
            lines.push(`  ${line.trim()}`);
          });
        }

        // 生成类型字符串
        let typeStr: string;
        if (isGeneric && propName === 'data') {
          typeStr = 'T';
        } else {
          typeStr = typeNodeToString(member.type);
        }

        // 属性声明行
        const optionalMark = isOptional ? '?' : '';
        lines.push(`  ${propName}${optionalMark}: ${typeStr};`);
      }
    }

    lines.push('}');

    return lines.join('\n');
  }
}
