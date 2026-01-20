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

  const result = await adapter.parse(config);

  expect(result).toBeDefined();
  expect(result.schemas).toBeDefined();
  expect(result.apis).toBeDefined();
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
