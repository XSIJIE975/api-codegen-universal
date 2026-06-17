import { test, expect } from '@rstest/core';
import { ApifoxAdapter } from '../src';
import path from 'node:path';
import fs from 'node:fs';

class MockApifoxAdapter extends ApifoxAdapter {
  protected async fetchOpenApiData() {
    // Return content of valid-openapi.json
    const openapiPath = path.resolve(
      __dirname,
      '../../openapi/tests/fixtures/valid-openapi.json',
    );
    const content = fs.readFileSync(openapiPath, 'utf-8');
    return JSON.parse(content);
  }
}

class MockApifoxAdapterWithNullType extends ApifoxAdapter {
  protected async fetchOpenApiData() {
    // Minimal OpenAPI that includes invalid `type: null` which Apifox may export.
    return {
      openapi: '3.0.1',
      info: {
        title: 'Apifox Null Type Fixture',
        version: '1.0.0',
      },
      paths: {
        '/logs': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      allOf: [
                        { $ref: '#/components/schemas/ApiSuccessResponse' },
                        {
                          type: 'object',
                          properties: {
                            data: { $ref: '#/components/schemas/ApiLogPageVo' },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          ApiSuccessResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          ApiLogPageVo: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: { $ref: '#/components/schemas/ApiLogVo' },
              },
            },
          },
          ApiLogVo: {
            type: 'object',
            properties: {
              user: {
                description: 'user info',
                allOf: [{ $ref: '#/components/schemas/ApiLogUserVo' }],
                // This is invalid in OpenAPI 3.0.x and should be fixed.
                type: 'null',
              },
            },
          },
          ApiLogUserVo: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      },
    };
  }
}

test('ApifoxAdapter should parse mock data', async () => {
  const adapter = new MockApifoxAdapter();
  const config = {
    projectId: '123',
    token: 'abc',
  };

  const result = await adapter.parse(config);

  expect(result).toBeDefined();
  expect(result.schemas).toBeDefined();
  expect(result.apis).toBeDefined();

  // Check metadata
  // Note: The source metadata is set by ApifoxAdapter, not from the file content
  expect(result.metadata).toBeDefined();
  expect(result.metadata?.source).toContain('Apifox Project 123');
});

test('ApifoxAdapter should fix `type: null` schemas and pass validation', async () => {
  const adapter = new MockApifoxAdapterWithNullType();
  const config = {
    projectId: '123',
    token: 'abc',
  };

  const result = await adapter.parse(config, { validateOpenApi: true });

  expect(result).toBeDefined();
  expect(result.schemas).toBeDefined();
  expect(result.apis).toBeDefined();
});

test('ApifoxAdapter should allow skipping swagger-parser validation', async () => {
  const adapter = new MockApifoxAdapterWithNullType();
  const config = {
    projectId: '123',
    token: 'abc',
  };

  // Should not throw even though data contains invalid `type: null`, because
  // validateOpenApi is disabled.
  const result = await adapter.parse(config, { validateOpenApi: false });

  expect(result).toBeDefined();
});

test('ApifoxAdapter should fix duplicate operationId', async () => {
  class MockApifoxAdapterWithDuplicateOperationId extends ApifoxAdapter {
    protected async fetchOpenApiData() {
      return {
        openapi: '3.0.1',
        info: {
          title: 'Apifox Duplicate OperationId Fixture',
          version: '1.0.0',
        },
        paths: {
          '/a': {
            get: {
              operationId: 'dup',
              responses: {
                '200': {
                  description: 'ok',
                },
              },
            },
          },
          '/b': {
            post: {
              operationId: 'dup',
              responses: {
                '200': {
                  description: 'ok',
                },
              },
            },
          },
        },
      };
    }
  }

  const adapter = new MockApifoxAdapterWithDuplicateOperationId();
  const config = {
    projectId: '123',
    token: 'abc',
  };

  const result = await adapter.parse(config);

  expect(result).toBeDefined();
});

test('ApifoxAdapter.validate should require projectId and token', async () => {
  const adapter = new ApifoxAdapter();

  expect(await adapter.validate({ projectId: '1', token: 't' })).toBe(true);

  // invalid values (still satisfy type shape)
  expect(await adapter.validate({ projectId: '', token: 't' })).toBe(false);
  expect(await adapter.validate({ projectId: '1', token: '' })).toBe(false);
  expect(await adapter.validate({ projectId: 0, token: 't' })).toBe(false);
});

test('ApifoxAdapter.parse should throw on non-OK response from Apifox API', async () => {
  class MockApifoxAdapterWithNetworkFailure extends ApifoxAdapter {
    protected override async fetchOpenApiData() {
      // call super method to exercise error path
      return super.fetchOpenApiData({
        projectId: '123',
        token: 'abc',
      });
    }
  }

  const adapter = new MockApifoxAdapterWithNetworkFailure();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response('bad request', { status: 400, statusText: 'Bad Request' });

  try {
    await expect(
      adapter.parse({ projectId: '123', token: 'abc' }),
    ).rejects.toThrow(/Apifox Export API Failed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ApifoxAdapter should emit warnings summary when logLevel=warn', async () => {
  const adapter = new MockApifoxAdapterWithNullType();
  const config = {
    projectId: '123',
    token: 'abc',
  };

  const warnCalls: Array<{ message: string; meta?: Record<string, unknown> }> =
    [];
  const logger = {
    warn: (message: string, meta?: Record<string, unknown>) => {
      warnCalls.push({ message, meta });
    },
  };

  await adapter.parse(config, {
    validateOpenApi: true,
    logLevel: 'warn',
    logger,
  });

  expect(warnCalls).toHaveLength(1);
  const meta = warnCalls[0]?.meta ?? {};
  expect(meta.code).toBe('APIFOX_WARNINGS_SUMMARY');

  const stats = meta.stats as
    | { fixedNullTypes?: number; validation?: 'enabled' | 'skipped' }
    | undefined;
  expect(stats?.validation).toBe('enabled');
  expect(stats?.fixedNullTypes).toBe(1);
});

test('ApifoxAdapter should not emit warnings summary when logLevel=error', async () => {
  const adapter = new MockApifoxAdapterWithNullType();
  const config = {
    projectId: '123',
    token: 'abc',
  };

  const warnCalls: Array<{ message: string; meta?: Record<string, unknown> }> =
    [];
  const logger = {
    warn: (message: string, meta?: Record<string, unknown>) => {
      warnCalls.push({ message, meta });
    },
  };

  await adapter.parse(config, {
    validateOpenApi: true,
    logLevel: 'error',
    logger,
  });

  expect(warnCalls).toHaveLength(0);
});

test('ApifoxAdapter warnings summary should cap samples with logSampleLimit', async () => {
  class MockApifoxAdapterWithMultipleDupOperationId extends ApifoxAdapter {
    protected async fetchOpenApiData() {
      return {
        openapi: '3.0.1',
        info: {
          title: 'Apifox Duplicate OperationId Fixture (Multiple)',
          version: '1.0.0',
        },
        paths: {
          '/a': {
            get: {
              operationId: 'dup',
              responses: {
                '200': {
                  description: 'ok',
                },
              },
            },
          },
          '/b': {
            post: {
              operationId: 'dup',
              responses: {
                '200': {
                  description: 'ok',
                },
              },
            },
          },
          '/c': {
            put: {
              operationId: 'dup',
              responses: {
                '200': {
                  description: 'ok',
                },
              },
            },
          },
        },
      };
    }
  }

  const adapter = new MockApifoxAdapterWithMultipleDupOperationId();
  const config = {
    projectId: '123',
    token: 'abc',
  };

  const warnCalls: Array<{ message: string; meta?: Record<string, unknown> }> =
    [];
  const logger = {
    warn: (message: string, meta?: Record<string, unknown>) => {
      warnCalls.push({ message, meta });
    },
  };

  await adapter.parse(config, {
    validateOpenApi: false,
    logLevel: 'warn',
    logSampleLimit: 1,
    logger,
  });

  expect(warnCalls).toHaveLength(1);
  const meta = warnCalls[0]?.meta ?? {};
  expect(meta.code).toBe('APIFOX_WARNINGS_SUMMARY');

  const stats = meta.stats as
    | {
        renamedDuplicateOperationIds?: number;
        validation?: 'enabled' | 'skipped';
      }
    | undefined;
  expect(stats?.validation).toBe('skipped');
  expect(stats?.renamedDuplicateOperationIds).toBe(2);

  const samples = meta.samples as
    | {
        duplicateOperationIds?: Array<{
          from: string;
          to: string;
          path: string;
          method: string;
        }>;
      }
    | undefined;
  expect(samples?.duplicateOperationIds).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// fetchTimeoutMs 选项透传测试
//
// 验证 parse({ fetchTimeoutMs }) → fetchOpenApiData(config, fetchTimeoutMs) → AbortSignal.timeout。
// 必须调用 super.fetchOpenApiData 才能走到真实的 fetch + AbortSignal.timeout，
// 因此 mock globalThis.fetch 返回成功响应，并 spy AbortSignal.timeout 捕获超时值。
// ---------------------------------------------------------------------------

/** 最小合法 OpenAPI 文档，供 mock fetch 返回 */
const MINIMAL_OPENAPI = {
  openapi: '3.0.0',
  info: { title: 'Timeout Test', version: '1.0.0' },
  paths: {},
};

/** 安装 fetch + AbortSignal.timeout 的 mock，返回捕获到的超时值数组 */
function mockFetchAndTimeout(): {
  timeoutCalls: number[];
  restore: () => void;
} {
  const timeoutCalls: number[] = [];
  // 用箭头函数包裹原始方法引用，避免 unbound-method 告警（mock 场景下故意解绑 this）
  const originalTimeout = (ms: number) => AbortSignal.timeout(ms);
  const originalFetch = globalThis.fetch;

  AbortSignal.timeout = ((ms: number) => {
    timeoutCalls.push(ms);
    return new AbortController().signal;
  }) as typeof AbortSignal.timeout;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify(MINIMAL_OPENAPI), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

  return {
    timeoutCalls,
    restore: () => {
      AbortSignal.timeout = originalTimeout as typeof AbortSignal.timeout;
      globalThis.fetch = originalFetch;
    },
  };
}

test('ApifoxAdapter should pass fetchTimeoutMs to AbortSignal.timeout', async () => {
  // 调用 super 以走到真实 fetch + AbortSignal.timeout
  class SpyAdapter extends ApifoxAdapter {
    protected override async fetchOpenApiData(
      config: { projectId: string | number; token: string },
      fetchTimeoutMs?: number,
    ) {
      return super.fetchOpenApiData(config, fetchTimeoutMs);
    }
  }

  const { timeoutCalls, restore } = mockFetchAndTimeout();
  const adapter = new SpyAdapter();
  try {
    await adapter.parse(
      { projectId: '123', token: 'abc' },
      { fetchTimeoutMs: 5000, validateOpenApi: false },
    );
  } finally {
    restore();
  }

  expect(timeoutCalls).toContain(5000);
});

test('ApifoxAdapter should default fetchTimeoutMs to 30000 when not provided', async () => {
  class SpyAdapter extends ApifoxAdapter {
    protected override async fetchOpenApiData(
      config: { projectId: string | number; token: string },
      fetchTimeoutMs?: number,
    ) {
      return super.fetchOpenApiData(config, fetchTimeoutMs);
    }
  }

  const { timeoutCalls, restore } = mockFetchAndTimeout();
  const adapter = new SpyAdapter();
  try {
    await adapter.parse(
      { projectId: '123', token: 'abc' },
      { validateOpenApi: false },
    );
  } finally {
    restore();
  }

  expect(timeoutCalls).toContain(30_000);
});
