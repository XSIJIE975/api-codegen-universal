/**
 * OperationId 消歧工具
 *
 * 背景：operationId 在下游会经过多轮命名变换（NamingUtils.convert、
 * camelCase/PascalCase 等），这些变换都会吞掉 `-`、`_` 等分隔符。
 * 因此两个"原始字符串不同"的 operationId（如 `getUser` 与 `get-user`、
 * 由 `/a-b` 与 `/a/b` 生成的 id）可能在下游坍缩成同一个标识符，
 * 导致同一输出文件中出现重复的函数名/类型名。
 *
 * 本模块以"归一化后的 key"（小写、仅保留字母数字）为唯一性基准，
 * 在派生类型名之前完成消歧，保证 operationId 在常见命名变换下仍然唯一。
 */

import type { WarningsCollector } from '@api-codegen-universal/core';

/** 参与消歧的最小操作描述 */
export interface OperationRef {
  path: string;
  method: string;
  operationId: string;
}

/**
 * 计算 operationId 的归一化 key。
 * 与 lodash camelCase / NamingUtils.convert 的坍缩行为保持一致：
 * 大小写与分隔符差异全部抹平，只保留字母数字。
 */
export function normalizeOperationIdKey(operationId: string): string {
  return operationId.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * 保证所有 operationId 在归一化后唯一（原地修改）。
 *
 * 规则：
 * - 归一化 key 相同的操作视为冲突组；
 * - 组内按 `(path, method)` 字典序排序，第一个保留原名，其余追加数字后缀
 *   `2`、`3`…（排序保证结果与文档顺序无关）；
 * - 每次重命名通过 warnings 记录（复用 renamedDuplicateOperationIds 统计）。
 */
export function resolveOperationIdCollisions<T extends OperationRef>(
  operations: T[],
  warnings?: WarningsCollector,
): void {
  if (operations.length === 0) return;

  const takenKeys = new Set<string>();
  const groupsByKey = new Map<string, T[]>();

  for (const op of operations) {
    const key = normalizeOperationIdKey(op.operationId);
    takenKeys.add(key);
    const group = groupsByKey.get(key);
    if (group) group.push(op);
    else groupsByKey.set(key, [op]);
  }

  for (const group of groupsByKey.values()) {
    if (group.length < 2) continue;

    const sorted = [...group].sort(
      (a, b) =>
        (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) ||
        (a.method < b.method ? -1 : a.method > b.method ? 1 : 0),
    );

    for (const op of sorted.slice(1)) {
      const original = op.operationId;
      let n = 2;
      let next = `${original}${n}`;
      while (takenKeys.has(normalizeOperationIdKey(next))) {
        n += 1;
        next = `${original}${n}`;
      }

      op.operationId = next;
      takenKeys.add(normalizeOperationIdKey(next));

      warnings?.addDuplicateOperationId({
        from: original,
        to: next,
        path: op.path,
        method: op.method,
      });
    }
  }
}
