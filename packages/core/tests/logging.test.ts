import { test, expect } from '@rstest/core';
import {
  shouldLog,
  createAdapterLogger,
  createWarningsCollector,
  sanitizeOptions,
} from '../src';
import type { LogLevel, LogMethod } from '../src';

// ===================================================================================
// shouldLog 测试
// ===================================================================================

test('shouldLog: error level only allows error', () => {
  expect(shouldLog('error', 'error')).toBe(true);
  expect(shouldLog('warn', 'error')).toBe(false);
  expect(shouldLog('info', 'error')).toBe(false);
  expect(shouldLog('debug', 'error')).toBe(false);
});

test('shouldLog: warn level allows error + warn', () => {
  expect(shouldLog('error', 'warn')).toBe(true);
  expect(shouldLog('warn', 'warn')).toBe(true);
  expect(shouldLog('info', 'warn')).toBe(false);
  expect(shouldLog('debug', 'warn')).toBe(false);
});

test('shouldLog: debug level allows everything', () => {
  expect(shouldLog('error', 'debug')).toBe(true);
  expect(shouldLog('warn', 'debug')).toBe(true);
  expect(shouldLog('info', 'debug')).toBe(true);
  expect(shouldLog('debug', 'debug')).toBe(true);
});

test('shouldLog: silent level blocks everything', () => {
  expect(shouldLog('error', 'silent')).toBe(false);
  expect(shouldLog('warn', 'silent')).toBe(false);
  expect(shouldLog('info', 'silent')).toBe(false);
  expect(shouldLog('debug', 'silent')).toBe(false);
});

// ===================================================================================
// createAdapterLogger 测试
// ===================================================================================

test('createAdapterLogger: defaults to logLevel=error and sampleLimit=10', () => {
  const logger = createAdapterLogger(undefined, { adapter: 'test' });
  expect(logger.logLevel).toBe('error');
  expect(logger.sampleLimit).toBe(10);
  expect(logger.context.adapter).toBe('test');
});

test('createAdapterLogger: respects custom logLevel and sampleLimit', () => {
  const logger = createAdapterLogger(
    { logLevel: 'debug', logSampleLimit: 5 },
    { adapter: 'test', source: 'src' },
  );
  expect(logger.logLevel).toBe('debug');
  expect(logger.sampleLimit).toBe(5);
  expect(logger.context.source).toBe('src');
});

test('createAdapterLogger: invalid sampleLimit falls back to 10', () => {
  const logger1 = createAdapterLogger({ logSampleLimit: -1 }, { adapter: 't' });
  expect(logger1.sampleLimit).toBe(10);

  const logger2 = createAdapterLogger(
    { logSampleLimit: NaN },
    { adapter: 't' },
  );
  expect(logger2.sampleLimit).toBe(10);

  const logger3 = createAdapterLogger(
    { logSampleLimit: 3.7 },
    { adapter: 't' },
  );
  expect(logger3.sampleLimit).toBe(3); // floor
});

test('createAdapterLogger: custom logger receives calls at correct level', () => {
  const calls: Array<{ method: string; message: string }> = [];
  const customLogger = {
    debug: (m: string) => calls.push({ method: 'debug', message: m }),
    info: (m: string) => calls.push({ method: 'info', message: m }),
    warn: (m: string) => calls.push({ method: 'warn', message: m }),
    error: (m: string) => calls.push({ method: 'error', message: m }),
  };

  const logger = createAdapterLogger(
    { logLevel: 'debug', logger: customLogger },
    { adapter: 'test' },
  );

  logger.debug('d');
  logger.info('i');
  logger.warn('w');
  logger.error('e');

  expect(calls).toHaveLength(4);
  expect(calls[0]?.method).toBe('debug');
  expect(calls[3]?.method).toBe('error');
});

test('createAdapterLogger: logger without optional methods does not crash', () => {
  // Logger with only error method
  const calls: string[] = [];
  const partialLogger = {
    error: (m: string) => calls.push(m),
  };

  const logger = createAdapterLogger(
    { logLevel: 'debug', logger: partialLogger },
    { adapter: 'test' },
  );

  // These should not throw even though debug/info/warn are not defined
  logger.debug('d');
  logger.info('i');
  logger.warn('w');
  logger.error('e');

  expect(calls).toEqual(['e']);
});

// ===================================================================================
// createWarningsCollector 测试
// ===================================================================================

test('createWarningsCollector: flush emits nothing when logLevel < warn', () => {
  const warnCalls: unknown[] = [];
  const logger = createAdapterLogger(
    {
      logLevel: 'error',
      logger: { warn: (m) => warnCalls.push(m) },
    },
    { adapter: 'test' },
  );

  const w = createWarningsCollector({ logger, code: 'TEST' });
  w.inc('fixedNullTypes');
  w.flush({ validation: 'enabled' });

  expect(warnCalls).toHaveLength(0);
});

test('createWarningsCollector: flush emits when logLevel >= warn and there are warnings', () => {
  const warnCalls: Array<{ message: string; meta?: Record<string, unknown> }> =
    [];
  const logger = createAdapterLogger(
    {
      logLevel: 'warn',
      logger: {
        warn: (m, meta) => warnCalls.push({ message: m, meta }),
      },
    },
    { adapter: 'test' },
  );

  const w = createWarningsCollector({ logger, code: 'TEST_CODE' });
  w.inc('fixedNullTypes');
  w.inc('fixedBrokenRefs');
  w.flush({ validation: 'enabled', durationMs: 100 });

  expect(warnCalls).toHaveLength(1);
  const meta = warnCalls[0]?.meta as {
    code: string;
    adapter: string;
    stats: {
      fixedNullTypes?: number;
      fixedBrokenRefs?: number;
      validation: string;
    };
    durationMs?: number;
  };
  expect(meta.code).toBe('TEST_CODE');
  expect(meta.adapter).toBe('test');
  expect(meta.stats.fixedNullTypes).toBe(1);
  expect(meta.stats.fixedBrokenRefs).toBe(1);
  expect(meta.stats.validation).toBe('enabled');
  expect(meta.durationMs).toBe(100);
});

test('createWarningsCollector: flush emits nothing when no warnings accumulated', () => {
  const warnCalls: unknown[] = [];
  const logger = createAdapterLogger(
    {
      logLevel: 'warn',
      logger: { warn: () => warnCalls.push(1) },
    },
    { adapter: 'test' },
  );

  const w = createWarningsCollector({ logger, code: 'TEST' });
  w.flush({ validation: 'enabled' });

  expect(warnCalls).toHaveLength(0);
});

test('createWarningsCollector: validationSkipped sets validation=skipped', () => {
  const warnCalls: Array<{ meta?: Record<string, unknown> }> = [];
  const logger = createAdapterLogger(
    {
      logLevel: 'warn',
      logger: { warn: (_m, meta) => warnCalls.push({ meta }) },
    },
    { adapter: 'test' },
  );

  const w = createWarningsCollector({ logger, code: 'TEST' });
  w.inc('validationSkipped');
  w.flush({ validation: 'skipped' });

  expect(warnCalls).toHaveLength(1);
  const stats = warnCalls[0]?.meta?.stats as { validation?: string };
  expect(stats.validation).toBe('skipped');
});

test('createWarningsCollector: sampleLimit caps the samples array', () => {
  const warnCalls: Array<{ meta?: Record<string, unknown> }> = [];
  const logger = createAdapterLogger(
    {
      logLevel: 'warn',
      logSampleLimit: 2,
      logger: { warn: (_m, meta) => warnCalls.push({ meta }) },
    },
    { adapter: 'test' },
  );

  const w = createWarningsCollector({ logger, code: 'TEST' });
  w.addBrokenRef('ref1');
  w.addBrokenRef('ref2');
  w.addBrokenRef('ref3'); // should be capped
  w.flush({ validation: 'enabled' });

  const samples = warnCalls[0]?.meta?.samples as { brokenRefs?: string[] };
  expect(samples.brokenRefs).toHaveLength(2);
  expect(samples.brokenRefs).toEqual(['ref1', 'ref2']);
});

test('createWarningsCollector: addRenamedSchema records both stats and samples', () => {
  const warnCalls: Array<{ meta?: Record<string, unknown> }> = [];
  const logger = createAdapterLogger(
    {
      logLevel: 'warn',
      logger: { warn: (_m, meta) => warnCalls.push({ meta }) },
    },
    { adapter: 'test' },
  );

  const w = createWarningsCollector({ logger, code: 'TEST' });
  w.addRenamedSchema('A«B»', 'A_B');
  w.flush({ validation: 'enabled' });

  const meta = warnCalls[0]?.meta as {
    stats: { renamedGenericSchemas?: number };
    samples: { renamedSchemas?: Array<{ from: string; to: string }> };
  };
  expect(meta.stats.renamedGenericSchemas).toBe(1);
  expect(meta.samples.renamedSchemas).toEqual([{ from: 'A«B»', to: 'A_B' }]);
});

// ===================================================================================
// sanitizeOptions 测试
// ===================================================================================

test('sanitizeOptions: returns undefined for undefined input', () => {
  expect(sanitizeOptions(undefined)).toBeUndefined();
});

test('sanitizeOptions: strips token field', () => {
  const result = sanitizeOptions({ token: 'secret', projectId: '123' });
  expect(result).toEqual({ projectId: '123' });
});

test('sanitizeOptions: strips multiple sensitive fields', () => {
  const result = sanitizeOptions({
    token: 'abc',
    authorization: 'Bearer xyz',
    apiKey: 'key123',
    password: 'pass',
    safeField: 'value',
  });
  expect(result).toEqual({ safeField: 'value' });
});

test('sanitizeOptions: strips x- prefixed fields', () => {
  const result = sanitizeOptions({
    'x-api-key': 'secret',
    'X-Custom-Auth': 'hidden',
    normalField: 'visible',
  });
  expect(result).toEqual({ normalField: 'visible' });
});

test('sanitizeOptions: recursively sanitizes nested objects', () => {
  const result = sanitizeOptions({
    level1: {
      token: 'secret',
      safe: 'value',
      level2: {
        apiKey: 'hidden',
        data: 'visible',
      },
    },
  });
  expect(result).toEqual({
    level1: {
      safe: 'value',
      level2: { data: 'visible' },
    },
  });
});

test('sanitizeOptions: sanitizes arrays', () => {
  const result = sanitizeOptions({
    items: [
      { token: 'secret', name: 'a' },
      { apiKey: 'hidden', name: 'b' },
    ],
  });
  expect(result).toEqual({
    items: [{ name: 'a' }, { name: 'b' }],
  });
});

test('sanitizeOptions: preserves non-object values', () => {
  const result = sanitizeOptions({
    count: 42,
    flag: true,
    label: 'text',
    nothing: null,
  });
  expect(result).toEqual({
    count: 42,
    flag: true,
    label: 'text',
    nothing: null,
  });
});

test('sanitizeOptions: does NOT strip non-sensitive fields containing "key"', () => {
  const result = sanitizeOptions({
    primaryKey: 'id',
    keyCode: 'Enter',
    keyboardShortcut: 'Ctrl+S',
    monkeyKey: 'value',
    keyFrame: '0',
    hotkey: 'Ctrl+C',
    key: 'bare-key-value', // 裸 'key' 也不再被剥离，避免误匹配
  });
  expect(result).toEqual({
    primaryKey: 'id',
    keyCode: 'Enter',
    keyboardShortcut: 'Ctrl+S',
    monkeyKey: 'value',
    keyFrame: '0',
    hotkey: 'Ctrl+C',
    key: 'bare-key-value',
  });
});

test('sanitizeOptions: sanitizes URL objects to prevent secret leakage', () => {
  const result = sanitizeOptions({
    endpoint: new URL(
      'https://api.example.com/data?token=secret123&apiKey=abc&name=test',
    ),
    callback: new URL('https://example.com/callback'),
  });

  expect(result.endpoint).toBe(
    'https://api.example.com/data?token=%5BREDACTED%5D&apiKey=%5BREDACTED%5D&name=test',
  );
  expect(result.callback).toBe('https://example.com/callback');
});

test('sanitizeOptions: converts Date objects to ISO strings', () => {
  const date = new Date('2024-01-01T00:00:00.000Z');
  const result = sanitizeOptions({
    createdAt: date,
    name: 'test',
  });

  expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
  expect(result.name).toBe('test');
});

test('sanitizeOptions: converts RegExp objects to strings', () => {
  const result = sanitizeOptions({
    pattern: /test/gi,
    name: 'test',
  });

  expect(result.pattern).toBe('/test/gi');
  expect(result.name).toBe('test');
});

test('sanitizeOptions: handles circular references without stack overflow', () => {
  const obj: Record<string, unknown> = { name: 'test' };
  obj.self = obj; // 创建循环引用

  const result = sanitizeOptions(obj);

  expect(result?.name).toBe('test');
  expect(result?.self).toEqual({ '[circular]': true });
});

test('sanitizeOptions: handles nested circular references', () => {
  const obj1: Record<string, unknown> = { name: 'obj1' };
  const obj2: Record<string, unknown> = { name: 'obj2', ref: obj1 };
  obj1.ref = obj2; // 创建循环引用

  const result = sanitizeOptions(obj1);

  expect(result?.name).toBe('obj1');
  expect(result?.ref).toBeDefined();
  expect((result?.ref as Record<string, unknown>)?.name).toBe('obj2');
  expect((result?.ref as Record<string, unknown>)?.ref).toEqual({
    '[circular]': true,
  });
});

test('sanitizeOptions: strips specific sensitive key patterns', () => {
  const result = sanitizeOptions({
    apiKey: 'secret',
    api_key: 'secret',
    apiSecret: 'secret',
    privateKey: 'secret',
    accessKey: 'secret',
    signingKey: 'secret',
    normalField: 'visible',
  });
  expect(result).toEqual({ normalField: 'visible' });
});

// ===================================================================================
// LogMethod 类型覆盖
// ===================================================================================

test('shouldLog: covers all LogMethod variants', () => {
  const methods: LogMethod[] = ['debug', 'info', 'warn', 'error'];
  const levels: LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug'];

  for (const method of methods) {
    for (const level of levels) {
      // Just ensure it doesn't throw and returns boolean
      const result = shouldLog(method, level);
      expect(typeof result).toBe('boolean');
    }
  }
});
