/**
 * 类型声明名前缀工具
 *
 * 背景：多个系统的 API 代码统一以 `interfaceExportMode: 'declare'` 输出全局
 * `.d.ts` 声明时，跨项目同名 schema（如 `PageDTO`、`IdDTO`）会在全局作用域
 * 合并/冲突。所有生成的类型声明名（组件 schema 及 operationId/哈希派生的
 * 参数接口、内联 schema、泛型基类）统一加项目前缀后，
 * 注册表键、`$ref` 互引与下游拆分的文件名即可自然隔离。
 *
 * 幂等约定：生成器每次 clean 重建，输入本应是裸 schema 名；若输入已带前缀，
 * 则跳过加前缀（由调用方决定是否告警），避免产生 `DemoDemoXxx`。
 */

import type { NamingStyle } from '@api-codegen-universal/core';
import { NamingUtils } from './naming-utils';
import { normalizeGenericName } from './type-ref-utils';

/**
 * 为名称加上类型前缀。
 *
 * - `prefix` 为空时原样返回（完全向后兼容）；
 * - 名称已以 `prefix` 开头时原样返回，避免双重前缀。
 */
export function applyTypeNamePrefix(name: string, prefix?: string): string {
  if (!name || !prefix) return name;
  return name.startsWith(prefix) ? name : `${prefix}${name}`;
}

/**
 * 判断名称是否已带指定前缀。
 */
export function hasTypeNamePrefix(name: string, prefix?: string): boolean {
  return !!prefix && name.startsWith(prefix);
}

/**
 * 解析组件 schema 的输出名：先加前缀，再查消歧映射，最后做命名风格转换。
 *
 * `schemaNameMap` 的键为「已加前缀的原始名」，与组件 schema 提取时一致。
 */
export function resolveComponentTypeName(
  name: string,
  prefix: string | undefined,
  namingStyle: NamingStyle,
  schemaNameMap?: Map<string, string>,
): string {
  const prefixedName = applyTypeNamePrefix(name, prefix);
  return (
    schemaNameMap?.get(prefixedName) ??
    NamingUtils.convert(prefixedName, namingStyle)
  );
}

/**
 * 解析泛型基类名。
 *
 * 泛型基类（如 Apifox 的 `Map«String,B»` 中的 `Map`）即使没有同名组件 schema，
 * 也会由生成器合成一条基类声明，因此始终加前缀，保证声明与引用一致。
 */
export function resolveGenericBaseName(
  baseType: string,
  prefix: string | undefined,
  namingStyle: NamingStyle,
): string {
  return NamingUtils.convert(
    applyTypeNamePrefix(baseType, prefix),
    namingStyle,
  );
}

/**
 * 解析泛型参数名。
 *
 * 仅当参数指向真实存在的组件 schema 时加前缀；`String` / `Integer` 等
 * 泛型占位类型保持原样，避免生成不存在的 `DemoString`。
 * 支持数组形式（`User[]`）。
 */
export function resolveGenericArgumentName(
  argument: string,
  prefix: string | undefined,
  namingStyle: NamingStyle,
  schemaNameMap?: Map<string, string>,
): string {
  const arraySuffix = argument.endsWith('[]') ? '[]' : '';
  const bareName = normalizeGenericName(
    arraySuffix ? argument.slice(0, -2) : argument,
  );

  const mappedName = schemaNameMap?.get(applyTypeNamePrefix(bareName, prefix));
  const resolvedName = mappedName ?? NamingUtils.convert(bareName, namingStyle);
  return `${resolvedName}${arraySuffix}`;
}
