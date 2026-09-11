/**
 * OpenAPI Adapter 全面测试
 *
 * 覆盖：
 * - Input type matrix (URL/Buffer/string/file path)
 * - Edge cases (empty/malformed/large doc)
 * - Validate method
 * - Schema/Interface 结构验证
 * - Generic 处理
 * - Output control options
 */

import { describe, it, expect } from '@rstest/core';
import { OpenAPIAdapter } from '../src/adapter';
import path from 'node:path';
import fs from 'node:fs';

const FIXTURES_DIR = path.resolve(__dirname, './fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.resolve(FIXTURES_DIR, name), 'utf-8'));
}

// ===================================================================================
// Input Type Matrix 测试
// ===================================================================================

describe('OpenAPIAdapter - Input Type Matrix', () => {
  it('should accept plain object input', async () => {
    const doc = loadFixture('valid-openapi.json');
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    expect(result.schemas['User']).toBeDefined();
    expect(result.apis.length).toBeGreaterThan(0);
  });

  it('should accept Buffer input', async () => {
    const content = fs.readFileSync(
      path.resolve(FIXTURES_DIR, 'valid-openapi.json'),
    );
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(content);

    expect(result.schemas['User']).toBeDefined();
  });

  it('should accept string content (JSON)', async () => {
    const content = fs.readFileSync(
      path.resolve(FIXTURES_DIR, 'valid-openapi.json'),
      'utf-8',
    );
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(content);

    expect(result.schemas['User']).toBeDefined();
  });

  it('should accept file path as string', async () => {
    const filePath = path.resolve(FIXTURES_DIR, 'valid-openapi.json');
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(filePath);

    expect(result.schemas['User']).toBeDefined();
  });

  it('should accept URL object for file:// protocol', async () => {
    const filePath = path.resolve(FIXTURES_DIR, 'valid-openapi.json');
    const { pathToFileURL } = await import('node:url');
    const url = pathToFileURL(filePath);

    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(url);

    expect(result.schemas['User']).toBeDefined();
  });
});

// ===================================================================================
// Edge Cases 测试
// ===================================================================================

describe('OpenAPIAdapter - Edge Cases', () => {
  it('should handle empty paths object', async () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Empty API', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
            },
          },
        },
      },
    };

    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    expect(result.apis).toEqual([]);
    expect(result.schemas['User']).toBeDefined();
  });

  it('should handle empty components', async () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'No Components API', version: '1.0.0' },
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
    const result = await adapter.parse(doc);

    expect(Object.keys(result.schemas).length).toBe(0);
    expect(result.apis.length).toBe(1);
    expect(result.apis[0].operationId).toBe('ping');
  });

  it('should handle completely empty document', async () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Empty', version: '1.0.0' },
      paths: {},
    };

    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    expect(result.schemas).toEqual({});
    expect(result.apis).toEqual([]);
    expect(result.interfaces).toEqual({});
  });

  it('should handle schema with no properties', async () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          EmptyObject: { type: 'object' },
          EmptyArray: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    };

    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    expect(result.schemas['EmptyObject']).toBeDefined();
    expect(result.schemas['EmptyObject'].type).toBe('object');
  });

  it('should handle API with no responses content', async () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/ping': {
          get: {
            operationId: 'ping',
            responses: {
              '204': { description: 'No Content' },
            },
          },
        },
      },
    };

    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    expect(result.apis[0].responses['204']).toBeDefined();
    expect(result.apis[0].responses['204'].description).toBe('No Content');
    expect(result.apis[0].responses['204'].content).toBeUndefined();
  });

  it('should handle enum schemas', async () => {
    const doc = loadFixture('complex-openapi.json');
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    // 验证枚举 schema
    const roleSchema = result.schemas['Role'];
    expect(roleSchema).toBeDefined();
    expect(roleSchema.type).toBe('enum');
    expect(roleSchema.enum).toEqual(['admin', 'user', 'guest']);
  });

  it('should handle allOf (inheritance) schemas', async () => {
    const doc = loadFixture('complex-openapi.json');
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    // 验证 allOf schema
    const updateSchema = result.schemas['UpdateUserRequest'];
    expect(updateSchema).toBeDefined();
    // allOf 应该被合并或标记 extends
    expect(updateSchema.type).toBe('object');
  });
});

// ===================================================================================
// Validate Method 测试
// ===================================================================================

describe('OpenAPIAdapter - Validate Method', () => {
  it('should return true for valid OpenAPI document object', async () => {
    const doc = loadFixture('valid-openapi.json');
    const adapter = new OpenAPIAdapter();
    const result = await adapter.validate(doc);

    expect(result).toBe(true);
  });

  it('should return false for invalid document', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.validate(
      'not-a-valid-openapi-document' as never,
    );

    expect(result).toBe(false);
  });

  it('should return true for valid file path via URL', async () => {
    const filePath = path.resolve(FIXTURES_DIR, 'valid-openapi.json');
    const { pathToFileURL } = await import('node:url');
    const url = pathToFileURL(filePath);
    const adapter = new OpenAPIAdapter();
    const result = await adapter.validate(url);

    expect(result).toBe(true);
  });

  it('should return false for non-existent file', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.validate('/non/existent/file.json' as never);

    expect(result).toBe(false);
  });
});

// ===================================================================================
// Output Control Options 测试
// ===================================================================================

describe('OpenAPIAdapter - Output Control Options', () => {
  const complexDoc = loadFixture('complex-openapi.json');

  it('should skip component schemas when output.schemas=false', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(complexDoc, {
      codeGeneration: { output: { schemas: false } },
    });

    // output.schemas=false 只跳过 components.schemas 提取
    // 但内联 schema（request/response body）仍会生成
    // 因此验证 component schema 不在结果中（如 User, Role 等）
    expect(result.schemas['User']).toBeUndefined();
    expect(result.schemas['Role']).toBeUndefined();
    expect(result.apis.length).toBeGreaterThan(0);
  });

  it('should skip component interfaces when output.interfaces=false', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(complexDoc, {
      codeGeneration: { output: { interfaces: false } },
    });

    // output.interfaces=false 只跳过 components.schemas 接口生成
    // 但内联 schema 的接口仍会生成
    // 因此验证 component 接口不在结果中（如 User, Role 等）
    expect(result.interfaces['User']).toBeUndefined();
    expect(result.interfaces['Role']).toBeUndefined();
    expect(Object.keys(result.schemas).length).toBeGreaterThan(0);
    expect(result.apis.length).toBeGreaterThan(0);
  });

  it('should skip apis when output.apis=false but still generate parameter models', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(complexDoc, {
      codeGeneration: { output: { apis: false } },
    });

    expect(result.apis).toEqual([]);
    // 参数模型仍应生成
    expect(Object.keys(result.schemas).length).toBeGreaterThan(0);
  });

  it('should respect naming style: camelCase', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(complexDoc, {
      codeGeneration: { parameterNamingStyle: 'camelCase' },
    });

    // 验证参数接口名称使用 camelCase
    const paramSchemaNames = Object.keys(result.schemas).filter((name) =>
      name.includes('Params'),
    );
    for (const name of paramSchemaNames) {
      // camelCase 不应以大写字母开头
      expect(name[0]).toBe(name[0].toLowerCase());
    }
  });

  it('should respect naming style: snake_case', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(complexDoc, {
      codeGeneration: {
        parameterNamingStyle: 'snake_case',
        output: { apis: false },
      },
    });

    // 验证参数接口名称使用 snake_case
    const paramSchemaNames = Object.keys(result.schemas).filter((name) =>
      name.includes('params'),
    );
    for (const name of paramSchemaNames) {
      // snake_case 应包含下划线（如果有多词）
      expect(name).toMatch(/^[a-z_]+$/);
    }
  });

  it('should respect interfaceExportMode: declare', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(complexDoc, {
      codeGeneration: { interfaceExportMode: 'declare' },
    });

    // 验证接口代码使用 declare 而非 export
    for (const code of Object.values(result.interfaces)) {
      expect(code).toMatch(/^declare\s/m);
      expect(code).not.toMatch(/^export\s/m);
    }
  });
});

// ===================================================================================
// Schema/Interface 结构验证
// ===================================================================================

describe('OpenAPIAdapter - Schema/Interface Structure', () => {
  const complexDoc = loadFixture('complex-openapi.json');

  it('should generate correct property types for User schema', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(complexDoc);

    const user = result.schemas['User'];
    expect(user).toBeDefined();
    expect(user.type).toBe('object');
    expect(user.properties?.id).toBeDefined();
    expect(user.properties?.email).toBeDefined();
    expect(user.properties?.name).toBeDefined();
  });

  it('should generate interface code with correct syntax', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(complexDoc);

    for (const [name, code] of Object.entries(result.interfaces)) {
      // 验证基本语法
      expect(code).toContain(name);
      // interface 包含花括号，type alias 包含等号
      expect(code).toMatch(/[{}=]/);

      // 验证没有语法错误（至少不以奇怪字符开头）
      expect(code).not.toMatch(/^\s*undefined/);
      expect(code).not.toMatch(/^\s*null/);
    }
  });

  it('should generate correct category info for APIs', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(complexDoc);

    for (const api of result.apis) {
      // 验证分类信息完整
      expect(api.category.filePath).toBeDefined();
      expect(api.category.filePath).toMatch(/\.ts$/);
      expect(api.category.segments).toBeDefined();
      expect(api.category.depth).toBeGreaterThanOrEqual(0);
    }
  });

  it('should handle API with path parameters correctly', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(complexDoc);

    // 找到包含 path 参数的 API
    const apiWithParams = result.apis.find((api) => api.path.includes('{id}'));

    if (apiWithParams) {
      expect(apiWithParams.parameters?.path).toBeDefined();
      expect(apiWithParams.parameters?.path?.ref).toBeDefined();
    }
  });

  it('should handle API with query parameters correctly', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(complexDoc);

    // 找到包含 query 参数的 API（listUsers）
    const listApi = result.apis.find((api) => api.operationId === 'listUsers');

    if (listApi) {
      expect(listApi.parameters?.query).toBeDefined();
      expect(listApi.parameters?.query?.ref).toBeDefined();
    }
  });

  it('should handle API with request body correctly', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(complexDoc);

    // 找到有 request body 的 API（createUser）
    const createApi = result.apis.find(
      (api) => api.operationId === 'createUser',
    );

    if (createApi) {
      expect(createApi.requestBody).toBeDefined();
      expect(createApi.requestBody?.content).toBeDefined();
      expect(createApi.requestBody?.content['application/json']).toBeDefined();
    }
  });
});

// ===================================================================================
// HTTP 方法完整性测试（trace 等 OpenAPI 允许的方法不应丢失）
// ===================================================================================

describe('OpenAPIAdapter - HttpMethod completeness', () => {
  it('should extract TRACE operations with a valid HttpMethod value', async () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Trace API', version: '1.0.0' },
      paths: {
        '/debug': {
          trace: {
            operationId: 'traceDebug',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };

    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    expect(result.apis.length).toBe(1);
    const validMethods = [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
      'HEAD',
      'OPTIONS',
      'TRACE',
    ];
    expect(validMethods).toContain(result.apis[0]?.method);
    expect(result.apis[0]?.method).toBe('TRACE');
  });

  it('should not treat x- extension fields on path items as operations', async () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Ext API', version: '1.0.0' },
      paths: {
        '/users': {
          'x-internal-note': 'hidden',
          get: {
            operationId: 'getUsers',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };

    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    expect(result.apis.length).toBe(1);
    expect(result.apis[0]?.operationId).toBe('getUsers');
  });
});

// ===================================================================================
// requestBody.required 还原测试（此前被硬编码为 true）
// ===================================================================================

describe('OpenAPIAdapter - requestBody required flag', () => {
  const buildDoc = (required: boolean | undefined) => ({
    openapi: '3.0.0',
    info: { title: 'ReqBody API', version: '1.0.0' },
    paths: {
      '/items': {
        post: {
          operationId: 'postItem',
          requestBody: {
            ...(required !== undefined ? { required } : {}),
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { a: { type: 'string' } },
                },
              },
            },
          },
          responses: { '200': { description: 'ok' } },
        },
      },
    },
  });

  it('should preserve required: true', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(buildDoc(true));
    expect(result.apis[0]?.requestBody?.required).toBe(true);
  });

  it('should preserve required: false', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(buildDoc(false));
    expect(result.apis[0]?.requestBody?.required).toBe(false);
  });

  it('should default to false when required is unspecified (per OpenAPI spec)', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(buildDoc(undefined));
    expect(result.apis[0]?.requestBody?.required).toBe(false);
  });
});

// ===================================================================================
// URL 编码 schema 名的一致性测试（schemas 与 interfaces 键必须一致）
//
// 场景：上游工具（如部分版本的 Apifox 导出）会预先对 schema 名做 URL 编码，
// 文档键字面为 `User%20Dto`；$ref 需要双编码（%2520）才能通过
// openapi-typescript 内部的引用解析。此时 AST 键为字面 `User%20Dto`，
// schemas 与 interfaces 必须使用同一解码逻辑派生输出键。
// ===================================================================================

describe('OpenAPIAdapter - URL-encoded schema name consistency', () => {
  const doc = {
    openapi: '3.0.0',
    info: { title: 'Encoded Names', version: '1.0.0' },
    paths: {
      '/profiles': {
        get: {
          operationId: 'getProfile',
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User%2520Dto' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        'User%20Dto': {
          type: 'object',
          properties: { id: { type: 'integer' } },
        },
      },
    },
  };

  it('should produce identical keys in schemas and interfaces for URL-encoded names', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    const schemaKeys = Object.keys(result.schemas).sort();
    const interfaceKeys = Object.keys(result.interfaces).sort();
    expect(schemaKeys).toEqual(interfaceKeys);
    expect(schemaKeys).toContain('User Dto');
  });

  it('should resolve a response $ref to the same key as the schema/interface maps', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    const ref =
      result.apis[0]?.responses['200']?.content?.['application/json']?.schema
        ?.ref;
    expect(ref).toBeDefined();
    expect(result.schemas[ref!]).toBeDefined();
    expect(result.interfaces[ref!]).toBeDefined();
  });
});

// ===================================================================================
// Schema 名称归一化冲突消歧测试（此前会静默互相覆盖）
// ===================================================================================

describe('OpenAPIAdapter - schema name collision disambiguation', () => {
  const doc = {
    openapi: '3.0.0',
    info: { title: 'Collisions', version: '1.0.0' },
    paths: {
      '/profiles': {
        get: {
          operationId: 'getProfile',
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  // 引用冲突组中的第二个 schema
                  schema: { $ref: '#/components/schemas/userProfile' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        user_profile: {
          type: 'object',
          properties: { from_snake: { type: 'string' } },
        },
        userProfile: {
          type: 'object',
          properties: { from_camel: { type: 'string' } },
        },
      },
    },
  };

  it('should keep both colliding schemas instead of overwriting', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    // 文档顺序：user_profile 保留 UserProfile，userProfile 消歧为 UserProfile2
    expect(result.schemas['UserProfile']?.properties?.from_snake).toBeDefined();
    expect(
      result.schemas['UserProfile2']?.properties?.from_camel,
    ).toBeDefined();
  });

  it('should generate interface code for both colliding schemas', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    expect(result.interfaces['UserProfile']).toContain('from_snake');
    expect(result.interfaces['UserProfile2']).toContain('from_camel');
  });

  it('should resolve response refs to the disambiguated name', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    const ref =
      result.apis[0]?.responses['200']?.content?.['application/json']?.schema
        ?.ref;
    expect(ref).toBe('UserProfile2');
  });
});

// ===================================================================================
// 交叉/联合类型信息保留测试（rawType）
// ===================================================================================

describe('OpenAPIAdapter - rawType preservation for non-structural types', () => {
  const doc = {
    openapi: '3.0.0',
    info: { title: 'RawTypes', version: '1.0.0' },
    paths: {},
    components: {
      schemas: {
        // 交叉了两个数组分支：无法结构化表达
        Combo: {
          allOf: [
            { type: 'array', items: { $ref: '#/components/schemas/A' } },
            { type: 'array', items: { $ref: '#/components/schemas/B' } },
          ],
        },
        // 非字面量联合：oneOf 两个 $ref
        Either: {
          oneOf: [
            { $ref: '#/components/schemas/A' },
            { $ref: '#/components/schemas/B' },
          ],
        },
        // 顶层数组
        UserList: {
          type: 'array',
          items: { $ref: '#/components/schemas/A' },
        },
        A: { type: 'string' },
        B: { type: 'number' },
      },
    },
  };

  it('should keep rawType for intersections with unmergeable members', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    const combo = result.schemas['Combo'];
    expect(combo).toBeDefined();
    expect(combo?.rawType).toBeDefined();
    expect(combo?.rawType).toContain('A[]');
    expect(combo?.rawType).toContain('B[]');
  });

  it('should keep rawType for non-literal unions', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    const either = result.schemas['Either'];
    expect(either).toBeDefined();
    expect(either?.rawType).toContain('A');
    expect(either?.rawType).toContain('B');
  });

  it('should keep rawType for top-level array schemas', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    const list = result.schemas['UserList'];
    expect(list?.type).toBe('array');
    expect(list?.rawType).toBe('A[]');
  });
});

// ===================================================================================
// 多行 description 保留测试（此前只取第一行）
// ===================================================================================

describe('OpenAPIAdapter - multi-line descriptions', () => {
  const doc = {
    openapi: '3.0.0',
    info: { title: 'Multiline', version: '1.0.0' },
    paths: {
      '/x': {
        get: {
          operationId: 'getX',
          responses: {
            '200': {
              description: 'status line1\nstatus line2',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Foo' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Foo: {
          type: 'object',
          properties: {
            a: { type: 'string', description: 'prop line1\nprop line2' },
          },
        },
      },
    },
  };

  it('should keep all lines of a property description', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    const propA = result.schemas['Foo']?.properties?.a;
    expect(propA?.description).toContain('prop line1');
    expect(propA?.description).toContain('prop line2');
  });

  it('should keep all lines of a response status description', async () => {
    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc);

    const desc = result.apis[0]?.responses['200']?.description;
    expect(desc).toContain('status line1');
    expect(desc).toContain('status line2');
  });
});
