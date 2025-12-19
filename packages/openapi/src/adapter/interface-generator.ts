/**
 * 接口代码生成器
 * 负责生成 TypeScript 接口字符串
 *
 * 主要功能：
 * 1. 遍历 components.schemas 节点
 * 2. 生成 interface 或 type alias 定义
 * 3. 处理泛型基类和泛型别名
 * 4. 智能替换泛型参数 (T)
 */

import ts from 'typescript';
import type { NamingStyle } from '@api-codegen-universal/core';
import {
  extractStringFromNode,
  simplifyTypeReference,
  sharedPrinter,
  sharedSourceFile,
} from './ast-utils';
import { NamingUtils } from '../utils/naming-utils';

export class InterfaceGenerator {
  /** 泛型基类集合 name -> fieldName */
  private genericBaseTypes: Map<string, string>;
  /** 泛型信息映射 */
  private genericInfoMap: Map<string, { baseType: string; generics: string[] }>;
  /** 接口导出模式 */
  private interfaceExportMode: 'export' | 'declare';
  /** 命名风格 */
  private namingStyle: NamingStyle;
  /** 缓存的注释匹配正则 */
  private readonly commentRegex = /^(\s*\/\*\*[\s\S]*?\*\/)/;

  constructor(
    genericBaseTypes: Map<string, string>,
    interfaceExportMode: 'export' | 'declare' = 'export',
    genericInfoMap?: Map<string, { baseType: string; generics: string[] }>,
    namingStyle: NamingStyle = 'PascalCase',
  ) {
    this.genericBaseTypes = genericBaseTypes;
    this.interfaceExportMode = interfaceExportMode;
    this.genericInfoMap = genericInfoMap || new Map();
    this.namingStyle = namingStyle;
  }

  /**
   * 从 components 节点生成所有接口代码
   *
   * @param componentsNode components 接口节点
   * @param interfaces 接口代码集合(输出)
   */
  generateInterfaceCode(
    componentsNode: ts.InterfaceDeclaration,
    interfaces: Record<string, string>,
  ): void {
    const generatedBaseTypes = new Set<string>();

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
                const originalName = schemaName;
                const convertedName = NamingUtils.convert(
                  originalName,
                  this.namingStyle,
                );

                // 检查泛型信息
                if (this.genericInfoMap.has(originalName)) {
                  const info = this.genericInfoMap.get(originalName)!;
                  const convertedBaseType = NamingUtils.convert(
                    info.baseType,
                    this.namingStyle,
                  );

                  // 1. 生成泛型基类接口 (如果尚未生成)
                  if (!generatedBaseTypes.has(convertedBaseType)) {
                    // 查找泛型字段
                    const genericArg = info.generics[0] || 'T';
                    // 规范化 genericArg 以匹配 AST 中的引用
                    const normalizedGenericArg = genericArg
                      .replace(/«/g, '_')
                      .replace(/»/g, '')
                      .replace(/,/g, '_')
                      .replace(/\s/g, '');

                    // 转换目标类型名称，以便在 generateInterfaceString 中正确匹配
                    const convertedGenericArg = NamingUtils.convert(
                      normalizedGenericArg,
                      this.namingStyle,
                    );

                    const genericField = this.findGenericField(
                      schemaMember.type,
                      genericArg,
                    );

                    const baseInterfaceCode = this.generateInterfaceString(
                      convertedBaseType,
                      schemaMember.type,
                      true, // isGeneric
                      genericField,
                      convertedGenericArg, // 传入转换后的目标类型
                    );
                    interfaces[convertedBaseType] = baseInterfaceCode;
                    generatedBaseTypes.add(convertedBaseType);
                  }

                  // 2. 生成具体类型的别名
                  // export type Generic_SomeDataType = Generic<Type>;
                  const args = info.generics.map((g) => {
                    const normalized = g
                      .replace(/«/g, '_')
                      .replace(/»/g, '')
                      .replace(/,/g, '_')
                      .replace(/\s/g, '');
                    return NamingUtils.convert(normalized, this.namingStyle);
                  });

                  const exportKeyword =
                    this.interfaceExportMode === 'export'
                      ? 'export '
                      : 'declare ';
                  const aliasCode = `${exportKeyword}type ${convertedName} = ${convertedBaseType}<${args.join(', ')}>;`;
                  interfaces[convertedName] = aliasCode;
                } else {
                  // 常规生成
                  // 生成接口代码 - 优化: 只查找一次 Map
                  const genericField = this.genericBaseTypes.get(originalName);
                  const interfaceCode = this.generateInterfaceString(
                    convertedName,
                    schemaMember.type,
                    genericField !== undefined,
                    genericField,
                  );
                  interfaces[convertedName] = interfaceCode;
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * 查找泛型字段名
   * 在类型定义中查找引用了 targetType 的属性名
   */
  private findGenericField(
    typeNode: ts.TypeNode,
    targetType: string,
  ): string | undefined {
    // 规范化目标类型名以匹配 AST 中的引用名
    const normalizedTarget = targetType
      .replace(/«/g, '_')
      .replace(/»/g, '')
      .replace(/,/g, '_')
      .replace(/\s/g, '');

    if (ts.isTypeLiteralNode(typeNode)) {
      for (const member of typeNode.members) {
        if (ts.isPropertySignature(member) && member.name && member.type) {
          const propName = (member.name as ts.Identifier).text;
          if (this.isTypeRefTo(member.type, normalizedTarget)) {
            return propName;
          }
        }
      }
    }
    return undefined;
  }

  /**
   * 检查 TypeNode 是否引用了目标类型
   */
  private isTypeRefTo(typeNode: ts.TypeNode, target: string): boolean {
    const typeStr = sharedPrinter.printNode(
      ts.EmitHint.Unspecified,
      typeNode,
      sharedSourceFile,
    );
    const simple = simplifyTypeReference(typeStr);

    // 移除空白字符
    const cleanType = simple.replace(/\s/g, '');
    const cleanTarget = target.replace(/\s/g, '');

    // 1. 精确匹配
    if (cleanType === cleanTarget) return true;

    // 2. 数组匹配
    if (cleanType === `${cleanTarget}[]`) return true;

    // 3. 联合类型匹配 (e.g. "Type|null", "Type[]|null")
    if (cleanType.includes('|')) {
      const parts = cleanType.split('|');
      return parts.some((part) => {
        // 去除可能的括号
        const p = part.replace(/^\(|\)$/g, '');
        return (
          p === cleanTarget ||
          p === `${cleanTarget}[]` ||
          p.endsWith(`/${cleanTarget}`) ||
          p.endsWith(`/${cleanTarget}[]`)
        );
      });
    }

    // 4. 包含匹配 (最宽松，用于处理复杂情况)
    // 确保 targetName 是作为一个完整的单词出现
    const regex = new RegExp(`\\b${this.escapeRegExp(target)}\\b`);
    return regex.test(simple);
  }

  private escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 生成单个接口的代码字符串
   *
   * @param name 接口名称
   * @param typeNode 类型节点
   * @param isGeneric 是否为泛型接口
   * @param genericField 泛型字段名(如果 isGeneric 为 true)
   * @param genericTargetType 泛型目标类型(用于替换为 T)
   */
  public generateInterfaceString(
    name: string,
    typeNode: ts.TypeNode,
    isGeneric: boolean,
    genericField?: string,
    genericTargetType?: string,
  ): string {
    // 如果是对象字面量，生成 interface
    if (ts.isTypeLiteralNode(typeNode)) {
      const lines: string[] = [];

      // 接口声明行 - 根据配置选择 export 或 declare
      const exportKeyword =
        this.interfaceExportMode === 'export' ? 'export ' : 'declare ';
      const genericPart = isGeneric ? '<T = any>' : '';
      lines.push(`${exportKeyword}interface ${name}${genericPart} {`);

      // 遍历所有属性
      for (const member of typeNode.members) {
        if (ts.isPropertySignature(member) && member.name && member.type) {
          // 打印整个成员节点(包括注释)
          let memberText = sharedPrinter.printNode(
            ts.EmitHint.Unspecified,
            member,
            sharedSourceFile,
          );

          // 应用类型引用简化和名称转换
          memberText = simplifyTypeReference(memberText, (name) =>
            NamingUtils.convert(name, this.namingStyle),
          );

          const propName = (member.name as ts.Identifier).text;

          if (isGeneric && genericField && propName === genericField) {
            // 提取注释
            const commentMatch = memberText.match(this.commentRegex);
            const comment = commentMatch ? commentMatch[1] + '\n' : '';

            // 获取原始类型字符串
            const typeText = sharedPrinter.printNode(
              ts.EmitHint.Unspecified,
              member.type,
              sharedSourceFile,
            );
            const simplifiedType = simplifyTypeReference(typeText, (name) =>
              NamingUtils.convert(name, this.namingStyle),
            );

            let newType = 'T';
            if (genericTargetType) {
              // 智能替换: 找到目标类型并替换为 T
              // 注意：genericTargetType 应该是转换后的名称吗？
              // genericTargetType 是从 genericArg 转换来的，如果 genericArg 是原始名称，那么这里也需要转换
              // 但是在 generateInterfaceCode 中，我们传递的是 normalizedGenericArg
              // 如果 normalizedGenericArg 是原始名称，那么这里匹配可能会失败，因为 simplifiedType 已经是转换后的了

              // 让我们假设 genericTargetType 已经是转换后的名称（在调用处处理）
              const regex = new RegExp(
                `\\b${this.escapeRegExp(genericTargetType)}\\b`,
                'g',
              );
              newType = simplifiedType.replace(regex, 'T');
            } else {
              // 如果没有目标类型（通过 GenericDetector 检测到的），直接替换为 T
              // 但保留 null/undefined 信息
              if (simplifiedType.includes('| null')) {
                newType = 'T | null';
              } else if (simplifiedType.includes('null |')) {
                newType = 'null | T';
              }
            }

            const isOptional = !!member.questionToken;
            const optionalMark = isOptional ? '?' : '';
            lines.push(`${comment}  ${propName}${optionalMark}: ${newType};`);
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
    const typeText = sharedPrinter.printNode(
      ts.EmitHint.Unspecified,
      typeNode,
      sharedSourceFile,
    );

    return `${exportKeyword}type ${name}${genericPart} = ${simplifyTypeReference(typeText)};`;
  }
}
