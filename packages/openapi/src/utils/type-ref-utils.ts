/**
 * 通用类型引用与正则工具
 * 集中管理跨提取器共享的名称操作、类型匹配、正则辅助函数
 */

// ===================================================================================
// Java 风格泛型名称处理
// ===================================================================================

/**
 * 将 Java 风格泛型名称转换为安全 TS 标识符。
 *
 * 转换规则：
 * - « → _
 * - » → (删除)
 * - , → _
 * - 空格 → (删除)
 *
 * @example
 * 'PageVO«ApplyListVO»'   -> 'PageVO_ApplyListVO'
 * 'Map«String,List«Item»»' -> 'Map_String_List_Item'
 */
export function normalizeGenericName(s: string): string {
  return s
    .replace(/«/g, '_')
    .replace(/»/g, '')
    .replace(/,/g, '_')
    .replace(/\s/g, '');
}

/**
 * 将 Java 风格泛型符号转换为 TS 风格尖括号。
 *
 * 转换规则：
 * - « → <
 * - » → >
 *
 * 该函数用于 AST 引用提取（extractSchemaReference），
 * 将 openapi-typescript 生成的索引访问中的 Java 风格泛型还原为 TS 风格，
 * 以便下游泛型检测器识别。
 *
 * @example 'PageVO«User»' -> 'PageVO<User>'
 */
export function javaGenericsToTsAngles(s: string): string {
  return s.replace(/«/g, '<').replace(/»/g, '>');
}

// ===================================================================================
// 正则辅助
// ===================================================================================

/**
 * 转义字符串中的正则表达式特殊字符。
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 构造一个带单词边界的正则，按目标字符串做全字匹配。
 * 默认不带全局标志，适用于 .test() / .match()。
 * 如需全局替换（.replaceAll / .replace with g），使用 wordBoundaryRegexGlobal。
 */
export function wordBoundaryRegex(target: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(target)}\\b`);
}

/**
 * 构造一个带单词边界和全局标志的正则，适用于 .replace() 全局替换。
 */
export function wordBoundaryRegexGlobal(target: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(target)}\\b`, 'g');
}

// ===================================================================================
// 类型引用匹配
// ===================================================================================

/**
 * 判断类型字符串是否引用了指定类型。
 * 支持：
 * - 精确匹配：User
 * - 数组匹配：User[]
 * - 联合类型匹配：User | null、User[] | null
 * - 包含匹配：Response<User>
 */
export function isTypeRefTo(typeStr: string, targetName: string): boolean {
  if (!typeStr) return false;

  const cleanType = typeStr.replace(/\s/g, '');
  const cleanTarget = targetName.replace(/\s/g, '');

  // 1. 精确匹配
  if (cleanType === cleanTarget) return true;

  // 2. 数组匹配
  if (cleanType === `${cleanTarget}[]`) return true;

  // 3. 联合类型匹配 (e.g. "Type|null", "Type[]|null")
  if (cleanType.includes('|')) {
    const parts = cleanType.split('|');
    const matched = parts.some((part) => {
      const p = part.replace(/^\(|\)$/g, '');
      return (
        p === cleanTarget ||
        p === `${cleanTarget}[]` ||
        p.endsWith(`/${cleanTarget}`) ||
        p.endsWith(`/${cleanTarget}[]`)
      );
    });
    if (matched) return true;
  }

  // 4. 包含匹配（最宽松，用于处理复杂情况）
  return wordBoundaryRegex(cleanTarget).test(typeStr);
}

// ===================================================================================
// components["schemas"]["XXX"] 正则
// ===================================================================================

/**
 * 匹配 components["schemas"]["XXX"] 格式的正则。
 * 导出为共享常量，避免各模块重复定义。
 */
export const componentsSchemaRegex = /components\["schemas"\]\["([^"]+)"\]/g;

/**
 * 匹配 Array<XXX> 格式的正则。
 */
export const arrayTypeRegex = /Array<(.+)>/g;
