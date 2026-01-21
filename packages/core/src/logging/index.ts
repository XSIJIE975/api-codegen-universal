/**
 * 日志等级（由低到高）：
 * - silent: 完全不输出
 * - error: 仅输出 error
 * - warn: 输出 warn + error
 * - info: 输出 info + warn + error
 * - debug: 输出 debug + info + warn + error
 *
 * 说明：默认约定 `logLevel` 默认值为 `'error'`，
 * 以避免适配器在大量兼容性修复时产生过多输出。
 */
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

/**
 * 外部可注入的 Logger 接口。
 *
 * 默认实现采用 Format A：`console.<level>(message, meta)`。
 * - message: 人类可读的字符串
 * - meta: 结构化对象，便于日志采集/过滤（例如 code、stats、samples 等）
 */
export interface Logger {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
}

export interface LoggingOptions {
  /** 日志等级。默认：'error' */
  logLevel?: LogLevel;
  /** 自定义 logger（可选）。默认：基于 console 的 logger */
  logger?: Logger;
  /** warnings summary 中最多保留的 samples 数量。默认：10 */
  logSampleLimit?: number;
}

export type LogMethod = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export function shouldLog(method: LogMethod, logLevel: LogLevel): boolean {
  const required: LogLevel =
    method === 'error'
      ? 'error'
      : method === 'warn'
        ? 'warn'
        : method === 'info'
          ? 'info'
          : 'debug';

  return LOG_LEVEL_ORDER[logLevel] >= LOG_LEVEL_ORDER[required];
}

export function createDefaultLogger(): Logger {
  /**
   * 默认 logger（Format A）：
   * 直接调用 `console.<level>(message, meta)`。
   *
   * 注意：这里不做 JSON stringify，避免丢失结构信息。
   */
  return {
    debug: (message, meta) => {
      console.debug(message, meta);
    },
    info: (message, meta) => {
      console.info(message, meta);
    },
    warn: (message, meta) => {
      console.warn(message, meta);
    },
    error: (message, meta) => {
      console.error(message, meta);
    },
  };
}

export interface AdapterLogContext {
  adapter: string;
  source?: string;
}

export interface AdapterLogger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  logLevel: LogLevel;
  sampleLimit: number;
  context: AdapterLogContext;
}

export function createAdapterLogger(
  options: LoggingOptions | undefined,
  context: AdapterLogContext,
): AdapterLogger {
  /**
   * 将 `logLevel/logger/logSampleLimit` 统一收敛为适配器级 logger。
   *
   * 约定：当调用方未传入 logger 时，也不会“静默”，而是使用默认 logger；
   * 是否输出由 logLevel 控制（默认 'error'）。
   */
  const logLevel = (options?.logLevel ?? 'error') as LogLevel;
  const sampleLimit =
    typeof options?.logSampleLimit === 'number' &&
    Number.isFinite(options.logSampleLimit) &&
    options.logSampleLimit >= 0
      ? Math.floor(options.logSampleLimit)
      : 10;

  const baseLogger = options?.logger ?? createDefaultLogger();

  const emit = (
    method: LogMethod,
    message: string,
    meta?: Record<string, unknown>,
  ) => {
    if (!shouldLog(method, logLevel)) return;
    const fn = baseLogger[method];
    if (fn) fn(message, meta);
  };

  return {
    debug: (message, meta) => emit('debug', message, meta),
    info: (message, meta) => emit('info', message, meta),
    warn: (message, meta) => emit('warn', message, meta),
    error: (message, meta) => emit('error', message, meta),
    logLevel,
    sampleLimit,
    context,
  };
}

export type WarningType =
  | 'renamedGenericSchemas'
  | 'fixedBrokenRefs'
  | 'fixedNullTypes'
  | 'renamedDuplicateOperationIds'
  | 'validationSkipped';

export interface WarningsSummaryMeta {
  /** 事件码：建议为包级前缀，例如 APIFOX_WARNINGS_SUMMARY */
  code: string;
  /** 适配器标识：如 'apifox'、'openapi' */
  adapter: string;
  source?: string;
  durationMs?: number;
  stats: {
    renamedGenericSchemas?: number;
    fixedBrokenRefs?: number;
    fixedNullTypes?: number;
    renamedDuplicateOperationIds?: number;
    validation: 'enabled' | 'skipped';
  };
  samples?: {
    brokenRefs?: string[];
    renamedSchemas?: Array<{ from: string; to: string }>;
    duplicateOperationIds?: Array<{
      from: string;
      to: string;
      path: string;
      method: string;
    }>;
  };
}

export function createWarningsCollector(params: {
  logger: AdapterLogger;
  /** Event code, e.g. 'APIFOX_WARNINGS_SUMMARY' */
  code: string;
}): {
  /**
   * 将某类兼容性修复/告警计数 +1。
   * - 对于 validationSkipped：会将 stats.validation 标记为 'skipped'
   */
  inc: (type: WarningType) => void;
  /** 记录一次 schema 重命名（带 sample） */
  addRenamedSchema: (from: string, to: string) => void;
  /** 记录一次 broken $ref 修复（带 sample） */
  addBrokenRef: (ref: string) => void;
  /** 记录一次重复 operationId 重命名（带 sample） */
  addDuplicateOperationId: (p: {
    from: string;
    to: string;
    path: string;
    method: string;
  }) => void;
  /**
   * 输出 warnings summary（Scheme A：仅在末尾输出一次汇总）。
   *
   * 触发条件：
   * - `logLevel >= warn`
   * - 且累计 warnings 总数 > 0
   */
  flush: (
    meta: Omit<WarningsSummaryMeta, 'code' | 'adapter' | 'source' | 'stats'> & {
      durationMs?: number;
      validation: 'enabled' | 'skipped';
    },
  ) => void;
} {
  const { logger, code } = params;

  const stats: WarningsSummaryMeta['stats'] = {
    validation: 'enabled',
  };

  const samples: NonNullable<WarningsSummaryMeta['samples']> = {};

  /** 将 item 写入 samples（受 sampleLimit 限制） */
  const ensureLimitPush = <T>(arr: T[] | undefined, item: T): T[] => {
    const next = arr ?? [];
    if (next.length < logger.sampleLimit) next.push(item);
    return next;
  };

  const totalWarnings = () =>
    (stats.renamedGenericSchemas ?? 0) +
    (stats.fixedBrokenRefs ?? 0) +
    (stats.fixedNullTypes ?? 0) +
    (stats.renamedDuplicateOperationIds ?? 0) +
    (stats.validation === 'skipped' ? 1 : 0);

  return {
    inc: (type) => {
      if (type === 'validationSkipped') {
        stats.validation = 'skipped';
        return;
      }

      if (type === 'renamedGenericSchemas') {
        stats.renamedGenericSchemas = (stats.renamedGenericSchemas ?? 0) + 1;
      } else if (type === 'fixedBrokenRefs') {
        stats.fixedBrokenRefs = (stats.fixedBrokenRefs ?? 0) + 1;
      } else if (type === 'fixedNullTypes') {
        stats.fixedNullTypes = (stats.fixedNullTypes ?? 0) + 1;
      } else if (type === 'renamedDuplicateOperationIds') {
        stats.renamedDuplicateOperationIds =
          (stats.renamedDuplicateOperationIds ?? 0) + 1;
      }
    },
    addRenamedSchema: (from, to) => {
      stats.renamedGenericSchemas = (stats.renamedGenericSchemas ?? 0) + 1;
      samples.renamedSchemas = ensureLimitPush(samples.renamedSchemas, {
        from,
        to,
      });
    },
    addBrokenRef: (ref) => {
      stats.fixedBrokenRefs = (stats.fixedBrokenRefs ?? 0) + 1;
      samples.brokenRefs = ensureLimitPush(samples.brokenRefs, ref);
    },
    addDuplicateOperationId: (p) => {
      stats.renamedDuplicateOperationIds =
        (stats.renamedDuplicateOperationIds ?? 0) + 1;
      samples.duplicateOperationIds = ensureLimitPush(
        samples.duplicateOperationIds,
        p,
      );
    },
    flush: ({ durationMs, validation }) => {
      stats.validation = validation;
      if (!shouldLog('warn', logger.logLevel)) return;
      if (totalWarnings() === 0) return;

      const metaOut: WarningsSummaryMeta = {
        code,
        adapter: logger.context.adapter,
        source: logger.context.source,
        durationMs,
        stats,
        samples: Object.keys(samples).length > 0 ? samples : undefined,
      };

      logger.warn(
        `[${logger.context.adapter}] Completed with warnings`,
        metaOut as unknown as Record<string, unknown>,
      );
    },
  };
}
