/**
 * 元数据净化器
 *
 * 适配器选项可能包含敏感信息（如 Bearer Token、API Key），
 * 直接写入 StandardOutput.metadata.options 会随序列化/日志泄漏。
 * 该模块提供深度净化函数，确保只有非敏感项被保留。
 */

/**
 * 已知敏感键模式。
 *
 * 匹配策略：
 * - 字符串模式：使用子串包含匹配（如 'token' 匹配 bearerToken、authToken 等）
 * - 正则模式：使用精确匹配（如 /^x-/i 匹配 x- 开头的扩展字段）
 *
 * 注意：使用具体的复合词模式（如 'apikey'、'secretkey'）而非裸 'key'，
 * 避免误匹配 primaryKey、keyCode 等非敏感字段。
 */
const SENSITIVE_KEY_PATTERNS: ReadonlyArray<string | RegExp> = [
  'token', // 匹配 bearerToken, authToken, accessToken 等
  'password', // 匹配 userPassword, dbPassword 等
  'passwd',
  'secret', // 匹配 apiSecret, clientSecret, secretKey 等
  'credential',
  'authorization',
  // 具体的敏感 key 复合词（避免裸 'key' 匹配 primaryKey、keyCode 等）
  'apikey',
  'api_key',
  'api-key',
  'secretkey',
  'secret_key',
  'privatekey',
  'private_key',
  'accesskey',
  'access_key',
  'encryptionkey',
  'signingkey',
  /^x-/i, // 所有 x- 开头的扩展字段（如 x-api-key）
];

/**
 * 判断某个键是否被视为敏感。
 */
function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) =>
    typeof pattern === 'string' ? lower.includes(pattern) : pattern.test(key),
  );
}

/**
 * 清理字符串中的敏感信息（简单处理：移除 URL 查询参数中的敏感字段）
 */
function sanitizeString(str: string): string {
  // 对于 URL 字符串，清理查询参数中的敏感信息
  if (str.includes('?')) {
    try {
      const url = new URL(str);
      const sensitiveParams = [
        'token',
        'apikey',
        'api_key',
        'secret',
        'password',
        'credential',
      ];
      // 大小写不敏感地匹配参数名
      for (const [key] of url.searchParams.entries()) {
        const lowerKey = key.toLowerCase();
        if (sensitiveParams.some((param) => lowerKey.includes(param))) {
          url.searchParams.set(key, '[REDACTED]');
        }
      }
      return url.toString();
    } catch {
      // 如果不是有效 URL，返回原字符串
      return str;
    }
  }
  return str;
}

/**
 * 深度净化选项对象，剔除所有敏感键。
 *
 * - 对 plain object 递归处理
 * - 对数组逐元素处理
 * - 其他原样返回
 */
export function sanitizeOptions(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!input) return undefined;
  const visited = new WeakSet<object>();
  return sanitizeObject(input, visited);
}

function sanitizeObject(
  input: Record<string, unknown>,
  visited: WeakSet<object>,
): Record<string, unknown> {
  // 检测循环引用
  if (visited.has(input)) {
    return { '[circular]': true };
  }
  visited.add(input);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) continue;
    out[key] = sanitizeValue(value, visited);
  }
  return out;
}

function sanitizeValue(value: unknown, visited: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, visited));
  }
  if (value && typeof value === 'object') {
    // 处理 Date 对象 - 转为 ISO 字符串
    if (value instanceof Date) {
      return value.toISOString();
    }
    // 处理 URL 对象 - 清理敏感查询参数后转为字符串
    if (value instanceof URL) {
      const sensitiveParams = [
        'token',
        'apikey',
        'api_key',
        'secret',
        'password',
        'credential',
      ];
      const sanitizedUrl = new URL(value.toString());
      // 大小写不敏感地匹配参数名
      for (const [key] of sanitizedUrl.searchParams.entries()) {
        const lowerKey = key.toLowerCase();
        if (sensitiveParams.some((param) => lowerKey.includes(param))) {
          sanitizedUrl.searchParams.set(key, '[REDACTED]');
        }
      }
      return sanitizedUrl.toString();
    }
    // 处理 RegExp 对象 - 转为字符串表示
    if (value instanceof RegExp) {
      return value.toString();
    }
    // 检查是否为普通对象（plain object）
    // Map、Set、类实例等非普通对象会被替换为占位符，避免静默数据丢失
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const proto: object | null = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      return sanitizeObject(value as Record<string, unknown>, visited);
    }
    // 非普通对象（Map、Set、类实例等）替换为占位符
    return `[${value.constructor?.name || 'Object'}]`;
  }
  // 处理字符串 - 清理可能的敏感信息
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  return value;
}
