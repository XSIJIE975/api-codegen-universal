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
  decodeSchemaName,
  extractStringFromNode,
  printNodeCached,
  simplifyTypeReference,
} from './ast-utils';
import { NamingUtils } from '../utils/naming-utils';
import {
  isTypeRefTo,
  normalizeGenericName,
  wordBoundaryRegexGlobal,
} from '../utils/type-ref-utils';
import type { ApifoxGenericMeta } from '../types';

export class InterfaceGenerator {
  /** 泛型基类集合 name -> fieldName */
  private readonly genericBaseTypes: Map<string, string>;
  /** 泛型信息映射 */
  private readonly genericInfoMap: Map<string, ApifoxGenericMeta>;
  /** 接口导出模式 */
  private readonly interfaceExportMode: 'export' | 'declare';
  /** 命名风格 */
  private readonly namingStyle: NamingStyle;
  /**
   * 组件 schema 名称映射（原始名 -> 消歧后的输出名），与 SchemaExtractor
   * 共享，保证 schemas/interfaces 键一致且不互相覆盖。
   */
  private readonly schemaNameMap?: Map<string, string>;
  /** 缓存的注释匹配正则 */
  private readonly commentRegex = /^(\s*\/\*\*[\s\S]*?\*\/)/;

  constructor(
    genericBaseTypes: Map<string, string>,
    interfaceExportMode: 'export' | 'declare' = 'export',
    genericInfoMap?: Map<string, ApifoxGenericMeta>,
    namingStyle: NamingStyle = 'PascalCase',
    schemaNameMap?: Map<string, string>,
  ) {
    this.genericBaseTypes = genericBaseTypes;
    this.interfaceExportMode = interfaceExportMode;
    this.genericInfoMap =
      genericInfoMap || new Map<string, ApifoxGenericMeta>();
    this.namingStyle = namingStyle;
    this.schemaNameMap = schemaNameMap;
  }

  /**
   * 从 components 节点生成所有接口代码
   */
  generateInterfaceCode(
    componentsNode: ts.InterfaceDeclaration,
    interfaces: Record<string, string>,
  ): void {
    const generatedBaseTypes = new Set<string>();

    for (const member of componentsNode.members) {
      if (!ts.isPropertySignature(member) || !member.name) continue;
      const propName = (member.name as ts.Identifier).text;

      if (
        propName !== 'schemas' ||
        !member.type ||
        !ts.isTypeLiteralNode(member.type)
      )
        continue;

      for (const schemaMember of member.type.members) {
        if (
          !ts.isPropertySignature(schemaMember) ||
          !schemaMember.name ||
          !schemaMember.type
        )
          continue;

        const schemaName = extractStringFromNode(schemaMember.name);
        if (!schemaName) continue;

        // 与 SchemaExtractor 使用同一解码 + 消歧逻辑，保证键一致
        const originalName = decodeSchemaName(schemaName);
        const convertedName =
          this.schemaNameMap?.get(originalName) ??
          NamingUtils.convert(originalName, this.namingStyle);

        const info = this.genericInfoMap.get(originalName);
        if (info) {
          this.generateGenericInterface(
            convertedName,
            info,
            schemaMember.type,
            interfaces,
            generatedBaseTypes,
          );
        } else {
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

  /**
   * 生成泛型接口及其具体类型别名
   */
  private generateGenericInterface(
    convertedName: string,
    info: ApifoxGenericMeta,
    typeNode: ts.TypeNode,
    interfaces: Record<string, string>,
    generatedBaseTypes: Set<string>,
  ): void {
    const convertedBaseType = NamingUtils.convert(
      info.baseType,
      this.namingStyle,
    );

    // 1. 生成泛型基类接口（如果尚未生成）
    if (!generatedBaseTypes.has(convertedBaseType)) {
      const genericArg = info.generics[0] || 'T';
      const normalizedGenericArg = normalizeGenericName(genericArg);
      const convertedGenericArg = NamingUtils.convert(
        normalizedGenericArg,
        this.namingStyle,
      );

      const genericField = this.findGenericField(
        typeNode,
        normalizedGenericArg,
      );
      const baseInterfaceCode = this.generateInterfaceString(
        convertedBaseType,
        typeNode,
        true,
        genericField,
        convertedGenericArg,
      );
      interfaces[convertedBaseType] = baseInterfaceCode;
      generatedBaseTypes.add(convertedBaseType);
    }

    // 2. 生成具体类型的别名
    const args = info.generics.map((g) =>
      NamingUtils.convert(normalizeGenericName(g), this.namingStyle),
    );

    const exportKeyword =
      this.interfaceExportMode === 'export' ? 'export ' : 'declare ';
    interfaces[convertedName] =
      `${exportKeyword}type ${convertedName} = ${convertedBaseType}<${args.join(', ')}>;`;
  }

  /**
   * 查找泛型字段名
   */
  private findGenericField(
    typeNode: ts.TypeNode,
    targetType: string,
  ): string | undefined {
    if (!ts.isTypeLiteralNode(typeNode)) return undefined;

    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name && member.type) {
        const propName = (member.name as ts.Identifier).text;
        if (this.isTypeNodeRefTo(member.type, targetType)) return propName;
      }
    }
    return undefined;
  }

  /**
   * 检查 TypeNode 是否引用了目标类型
   */
  private isTypeNodeRefTo(typeNode: ts.TypeNode, target: string): boolean {
    const typeStr = printNodeCached(typeNode);
    const simple = simplifyTypeReference(typeStr);
    return isTypeRefTo(simple, target);
  }

  /**
   * 生成单个接口的代码字符串
   */
  public generateInterfaceString(
    name: string,
    typeNode: ts.TypeNode,
    isGeneric: boolean,
    genericField?: string,
    genericTargetType?: string,
  ): string {
    if (ts.isTypeLiteralNode(typeNode)) {
      return this.generateInterfaceFromLiteral(
        name,
        typeNode,
        isGeneric,
        genericField,
        genericTargetType,
      );
    }

    // 对于其他类型，生成 type alias
    const exportKeyword =
      this.interfaceExportMode === 'export' ? 'export ' : 'declare ';
    const genericPart = isGeneric ? '<T = any>' : '';
    const typeText = printNodeCached(typeNode);
    return `${exportKeyword}type ${name}${genericPart} = ${simplifyTypeReference(typeText)};`;
  }

  /**
   * 从 TypeLiteral 生成 interface 代码
   */
  private generateInterfaceFromLiteral(
    name: string,
    typeNode: ts.TypeLiteralNode,
    isGeneric: boolean,
    genericField?: string,
    genericTargetType?: string,
  ): string {
    const lines: string[] = [];
    const exportKeyword =
      this.interfaceExportMode === 'export' ? 'export ' : 'declare ';
    const genericPart = isGeneric ? '<T = any>' : '';
    lines.push(`${exportKeyword}interface ${name}${genericPart} {`);

    for (const member of typeNode.members) {
      if (!ts.isPropertySignature(member) || !member.name || !member.type)
        continue;

      let memberText = printNodeCached(member);
      memberText = simplifyTypeReference(memberText, (n) =>
        NamingUtils.convert(n, this.namingStyle),
      );

      const propName = (member.name as ts.Identifier).text;

      if (isGeneric && genericField && propName === genericField) {
        const commentMatch = memberText.match(this.commentRegex);
        const comment = commentMatch ? commentMatch[1] + '\n' : '';

        const typeText = printNodeCached(member.type);
        const simplifiedType = simplifyTypeReference(typeText, (n) =>
          NamingUtils.convert(n, this.namingStyle),
        );

        const newType = this.replaceGenericTypeParam(
          simplifiedType,
          genericTargetType,
        );
        const isOptional = !!member.questionToken;
        const optionalMark = isOptional ? '?' : '';
        lines.push(`${comment}  ${propName}${optionalMark}: ${newType};`);
      } else {
        lines.push(`  ${simplifyTypeReference(memberText)}`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * 将泛型目标类型替换为 T
   */
  private replaceGenericTypeParam(
    simplifiedType: string,
    genericTargetType?: string,
  ): string {
    if (genericTargetType) {
      return simplifiedType.replace(
        wordBoundaryRegexGlobal(genericTargetType),
        'T',
      );
    }

    // 没有目标类型时，保留 null/undefined 信息
    if (simplifiedType.includes('| null')) return 'T | null';
    if (simplifiedType.includes('null |')) return 'null | T';
    return 'T';
  }
}
