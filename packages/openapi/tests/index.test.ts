import { test, expect } from '@rstest/core';
import { OpenAPIAdapter } from '../src';
import path from 'node:path';
import fs from 'node:fs';

test('OpenAPIAdapter should parse fixture openapi.json', async () => {
  const openapiPath = path.resolve(__dirname, './fixtures/valid-openapi.json');
  const openapiContent = JSON.parse(fs.readFileSync(openapiPath, 'utf-8'));

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(openapiContent);

  expect(result.schemas).toBeDefined();
  expect(result.apis).toBeDefined();
  expect(result.interfaces).toBeDefined();

  // schemas
  expect(Object.keys(result.schemas).length).toBeGreaterThan(0);
  expect(result.schemas['User']).toBeDefined();
  expect(result.schemas['User']?.type).toBe('object');

  // apis
  expect(result.apis.length).toBeGreaterThan(0);
  const getUsersApi = result.apis.find((api) => api.operationId === 'getUsers');
  expect(getUsersApi).toBeDefined();
  expect(getUsersApi?.method).toBe('GET');
  expect(getUsersApi?.path).toBe('/users');
});

test('OpenAPIAdapter should support output options: apis=false still generates parameter models', async () => {
  const openapiDoc = {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
      '/users': {
        get: {
          operationId: 'getUsers',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: false,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  };

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(openapiDoc, {
    codeGeneration: {
      output: {
        apis: false,
      },
    },
  });

  expect(result.apis).toEqual([]);

  // ParameterExtractor should still run, generating query params schema/interface.
  expect(result.schemas['GetUsersQueryParams']).toBeDefined();
  expect(result.interfaces['GetUsersQueryParams']).toBeDefined();
});

test('OpenAPIAdapter should mark generic base schemas and use generic refs in responses', async () => {
  const openapiDoc = {
    openapi: '3.0.0',
    info: { title: 'Generic API', version: '1.0.0' },
    paths: {
      '/users': {
        get: {
          operationId: 'getUsers',
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
                          data: { $ref: '#/components/schemas/User' },
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
            data: { type: 'object' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
          },
          required: ['id'],
        },
      },
    },
  };

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(openapiDoc);

  // generic base schema should be marked
  expect(result.schemas['ApiSuccessResponse']).toBeDefined();
  expect(result.schemas['ApiSuccessResponse']?.type).toBe('generic');
  expect(result.schemas['ApiSuccessResponse']?.isGeneric).toBe(true);

  // interface code should become generic and replace the generic field with T
  const apiSuccessInterface = result.interfaces['ApiSuccessResponse'];
  expect(apiSuccessInterface).toBeDefined();
  expect(apiSuccessInterface).toContain(
    'interface ApiSuccessResponse<T = any>',
  );
  expect(apiSuccessInterface).toContain('data?: T');

  // response schema ref should be generic
  const api = result.apis.find((a) => a.operationId === 'getUsers');
  expect(api).toBeDefined();
  const response200 = api?.responses['200'];
  expect(response200).toBeDefined();
  const responseSchemaRef =
    response200?.content?.['application/json']?.schema?.ref;
  expect(responseSchemaRef).toBe('ApiSuccessResponse<User>');
});

test('OpenAPIAdapter.validate should return false for invalid inputs', async () => {
  const adapter = new OpenAPIAdapter();
  const ok = await adapter.validate({
    openapi: '3.0.0',
    info: { title: 'Ok', version: '1.0.0' },
    paths: {},
  });
  expect(ok).toBe(true);

  const bad = await adapter.validate('not-a-valid-openapi-document');
  expect(bad).toBe(false);
});

test('OpenAPIAdapter should build metadata from raw document', async () => {
  const openapiDoc = {
    openapi: '3.0.0',
    info: { title: 'Meta API', version: '1.0.0', description: 'desc' },
    servers: [{ url: 'https://example.com' }],
    paths: {
      '/ping': {
        get: {
          operationId: 'ping',
          responses: {
            '200': { description: 'ok' },
          },
        },
      },
    },
  };

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(openapiDoc);
  expect(result.metadata).toBeDefined();
  expect(result.metadata?.title).toBe('Meta API');
  expect(result.metadata?.description).toBe('desc');
  expect(result.metadata?.baseUrl).toBe('https://example.com');
});

test('OpenAPIAdapter should exclude the warnings collector from metadata.options', async () => {
  const openapiDoc = {
    openapi: '3.0.0',
    info: { title: 'Warnings Leak', version: '1.0.0' },
    paths: {},
  };

  // 模拟一个携带内部状态的 warnings 收集器（与真实收集器同为 plain object）
  const fakeWarnings = {
    inc: () => {},
    addRenamedSchema: () => {},
    addBrokenRef: () => {},
    addDuplicateOperationId: () => {},
    flush: () => {},
    internalStats: { fixedBrokenRefs: 42 },
    bigSampleArray: new Array(50).fill('sample'),
  };

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(openapiDoc, {
    logLevel: 'warn',
    warnings: fakeWarnings as never,
  });

  const optionsStr = JSON.stringify(result.metadata?.options ?? {});
  // 收集器内部状态不得泄漏进 metadata
  expect(optionsStr).not.toContain('internalStats');
  expect(optionsStr).not.toContain('bigSampleArray');
  expect(optionsStr).not.toContain('addRenamedSchema');
  // 正常配置键应保留
  expect(result.metadata?.options?.logLevel).toBe('warn');
});

// ---------------------------------------------------------------------------
// fetchTimeoutMs 选项透传测试
//
// OpenAPIAdapter 对 URL 输入会走 fetchWithTimeout 分支。
// 这里 mock globalThis.fetch + spy AbortSignal.timeout，
// 验证 parse({ fetchTimeoutMs }) → loadRawDocument → fetchWithTimeout → AbortSignal.timeout。
// ---------------------------------------------------------------------------

/** 一个最小合法的 OpenAPI 文档 JSON 字符串，供 mock fetch 返回 */
const REMOTE_OPENAPI_JSON = JSON.stringify({
  openapi: '3.0.0',
  info: { title: 'Remote API', version: '1.0.0' },
  paths: {},
});

/** 安装 fetch + AbortSignal.timeout 的 mock，返回 (timeoutCalls) 以供断言 */
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
    new Response(REMOTE_OPENAPI_JSON, {
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

test('OpenAPIAdapter should pass fetchTimeoutMs to AbortSignal.timeout for URL input', async () => {
  const { timeoutCalls, restore } = mockFetchAndTimeout();
  const adapter = new OpenAPIAdapter();
  try {
    await adapter.parse('https://example.com/openapi.json', {
      fetchTimeoutMs: 5000,
    });
  } finally {
    restore();
  }

  expect(timeoutCalls).toContain(5000);
});

test('OpenAPIAdapter should default fetchTimeoutMs to 30000 for URL input', async () => {
  const { timeoutCalls, restore } = mockFetchAndTimeout();
  const adapter = new OpenAPIAdapter();
  try {
    await adapter.parse('https://example.com/openapi.json');
  } finally {
    restore();
  }

  expect(timeoutCalls).toContain(30_000);
});

test('OpenAPIAdapter.validate should pass fetchTimeoutMs to AbortSignal.timeout for URL input', async () => {
  const { timeoutCalls, restore } = mockFetchAndTimeout();
  const adapter = new OpenAPIAdapter();
  try {
    const ok = await adapter.validate('https://example.com/openapi.json', {
      fetchTimeoutMs: 2500,
    });
    expect(ok).toBe(true);
  } finally {
    restore();
  }

  expect(timeoutCalls).toContain(2500);
});

test('OpenAPIAdapter.validate should return false when fetch fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('nope', { status: 500 })) as typeof fetch;
  const adapter = new OpenAPIAdapter();
  try {
    const ok = await adapter.validate('https://example.com/openapi.json');
    expect(ok).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
