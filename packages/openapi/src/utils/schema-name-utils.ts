/**
 * Schema 名称冲突消歧工具
 *
 * 背景：组件 schema 名会经过 NamingUtils.convert 做命名风格转换，
 * 两个"原始名不同"的 schema（如 `user_profile` 与 `userProfile`）在
 * PascalCase 下会坍缩为同一个输出名 `UserProfile`。此前后写入者会静默
 * 覆盖先写入者，导致 schema 丢失。
 *
 * 本模块以输出名为唯一性基准，在提取开始前为所有组件 schema 计算
 * 无冲突的输出名映射（`Map<原始名, 输出名>`），供 schema 提取、
 * interface 生成与响应引用解析三处共享，保证键一致。
 *
 * 规则（与 resolveOperationIdCollisions 的风格一致）：
 * - 冲突组内按文档顺序，第一个保留转换名，其余追加数字后缀 `2`、`3`…；
 * - 后缀分配时跳过所有已占用名（包括非冲突组的输出名）；
 * - 结果由文档顺序决定，同一文档内确定可复现。
 */

import type { NamingStyle } from '@api-codegen-universal/core';
import type { WarningsCollector } from '@api-codegen-universal/core';
import { NamingUtils } from './naming-utils';

/**
 * 为一组 schema 原始名计算无冲突的输出名映射。
 *
 * 分配优先级（高 → 低）：
 * 1. 不动点：转换名与原名相同的 schema（如 `UserProfile2`）优先保留本名；
 * 2. 冲突组内按文档顺序的第一个成员保留转换名；
 * 3. 其余成员追加数字后缀 `2`、`3`…（跳过所有已占用名）。
 *
 * @param originalNames 文档顺序的原始 schema 名（应已做 URL 解码）
 * @param namingStyle 目标命名风格
 * @returns Map<原始名, 输出名>。未发生冲突的名称同样会出现在映射中。
 */
export function resolveSchemaNameCollisions(
  originalNames: readonly string[],
  namingStyle: NamingStyle,
): Map<string, string> {
  const convertName = (name: string): string =>
    NamingUtils.convert(name, namingStyle);

  const converted = originalNames.map(convertName);

  // 统计每个转换名的出现次数与首次出现位置
  const groupSize = new Map<string, number>();
  const firstOccurrence = new Map<string, number>();
  converted.forEach((name, i) => {
    groupSize.set(name, (groupSize.get(name) ?? 0) + 1);
    if (!firstOccurrence.has(name)) firstOccurrence.set(name, i);
  });

  const assigned = new Map<number, string>();
  const taken = new Set<string>();

  const tryAssign = (i: number, name: string): boolean => {
    if (taken.has(name)) return false;
    assigned.set(i, name);
    taken.add(name);
    return true;
  };

  // 1. 不动点：原名已是目标风格，优先保留
  originalNames.forEach((original, i) => {
    if (converted[i] === original) tryAssign(i, original);
  });

  // 2. 冲突组的第一个成员保留转换名；无冲突名直接保留
  originalNames.forEach((_original, i) => {
    if (assigned.has(i)) return;
    const convertedName = converted[i]!;
    const isGroupFirst = firstOccurrence.get(convertedName) === i;
    if (groupSize.get(convertedName)! > 1 && !isGroupFirst) return;
    tryAssign(i, convertedName);
  });

  // 3. 其余成员追加数字后缀
  originalNames.forEach((_original, i) => {
    if (assigned.has(i)) return;
    const convertedName = converted[i]!;
    let n = 2;
    let candidate = `${convertedName}${n}`;
    while (taken.has(candidate)) {
      n += 1;
      candidate = `${convertedName}${n}`;
    }
    tryAssign(i, candidate);
  });

  const map = new Map<string, string>();
  originalNames.forEach((original, i) => {
    map.set(original, assigned.get(i)!);
  });
  return map;
}

/**
 * 从 componentsNode 收集组件 schema 原始名（文档顺序，URL 解码后），
 * 计算消歧映射，并将发生重命名的条目记录到 warnings。
 */
export function resolveComponentSchemaNames(
  originalNames: readonly string[],
  namingStyle: NamingStyle,
  warnings?: WarningsCollector,
): Map<string, string> {
  const map = resolveSchemaNameCollisions(originalNames, namingStyle);

  for (const [original, output] of map) {
    if (output !== NamingUtils.convert(original, namingStyle)) {
      warnings?.addCollidingSchema(original, output);
    }
  }

  return map;
}
