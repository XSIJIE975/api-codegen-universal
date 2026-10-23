import { test, expect, rstest } from '@rstest/core';
import { OpenAPIAdapter } from '../src';
import { applyTypeNamePrefix } from '../src/utils/type-name-prefix';

/**
 * typeNamePrefix 行为测试。
 *
 * 约定：生成器为所有「自动生成的类型声明名」带上前缀（组件 schema、
 * 参数接口、内联请求/响应 schema、匿名哈希 schema）；
 * 下游 runner 的 separateTypes 直接以 interfaces 的 key 作为 `{name}.d.ts`，
 * 因此这里以 interfaces 的 key 集合验证文件名契约。
 */

function createAbDoc(): Record<string, unknown> {
  return {
    openapi: '3.0.0',
    info: { title: 'Prefix API', version: '1.0.0' },
    paths: {
      '/things': {
        get: {
          operationId: 'getThings',
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/A' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        A: {
          type: 'object',
          properties: {
            b: { $ref: '#/components/schemas/B' },
            name: { type: 'string' },
          },
          required: ['b'],
        },
        B: {
          type: 'object',
          properties: { id: { type: 'integer' } },
        },
      },
    },
  };
}

function createGenericDoc(): Record<string, unknown> {
  return {
    openapi: '3.0.0',
    info: { title: 'Generic API', version: '1.0.0' },
    paths: {},
    components: {
      schemas: {
        B: {
          type: 'object',
          properties: { id: { type: 'integer' } },
        },
        Map_String_B: {
          type: 'object',
          // ApifoxAdapter.fixGenericsNames 注入的泛型元数据
          'x-apifox-generic': { baseType: 'Map', generics: ['String', 'B'] },
          properties: {
            value: { $ref: '#/components/schemas/B' },
          },
        },
      },
    },
  };
}

test('typeNamePrefix: prefixes component schemas, refs and type file names', async () => {
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(createAbDoc(), {
    codeGeneration: {
      interfaceExportMode: 'declare',
      typeNamePrefix: 'Demo',
    },
  });

  // 类型声明名、$ref 互引均带前缀
  expect(result.interfaces['DemoA']).toBe(
    'declare interface DemoA {\n  b: DemoB;\n  name?: string;\n}',
  );
  expect(result.interfaces['DemoB']).toBe(
    'declare interface DemoB {\n  id?: number;\n}',
  );
  expect(result.interfaces['A']).toBeUndefined();
  expect(result.interfaces['B']).toBeUndefined();

  // 结构化 schemas 与响应引用同步带前缀
  expect(result.schemas['DemoA']?.properties?.b?.type).toBe('DemoB');
  expect(result.schemas['DemoB']).toBeDefined();
  expect(
    result.apis[0]?.responses['200']?.content?.['application/json']?.schema,
  ).toMatchObject({ type: 'ref', ref: 'DemoA' });

  // separateTypes 文件名契约：X.d.ts → {prefix}X.d.ts
  const typeFileNames = Object.keys(result.interfaces).map(
    (name) => `${name}.d.ts`,
  );
  expect(typeFileNames).toEqual(
    expect.arrayContaining(['DemoA.d.ts', 'DemoB.d.ts']),
  );
  expect(typeFileNames).not.toContain('A.d.ts');
  expect(typeFileNames).not.toContain('B.d.ts');
});

test('typeNamePrefix: output without prefix stays byte-identical', async () => {
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(createAbDoc(), {
    codeGeneration: { interfaceExportMode: 'declare' },
  });

  expect({
    interfaces: result.interfaces,
    schemas: result.schemas,
    apis: result.apis,
  }).toMatchSnapshot();
});

test('typeNamePrefix: generic composition references stay consistent', async () => {
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(createGenericDoc(), {
    codeGeneration: {
      interfaceExportMode: 'declare',
      typeNamePrefix: 'Demo',
    },
  });

  expect(result.interfaces['DemoB']).toContain('declare interface DemoB');
  expect(result.interfaces['DemoMap']).toContain(
    'declare interface DemoMap<T = any>',
  );
  expect(result.interfaces['DemoMap']).toContain('value?: DemoB;');
  expect(result.interfaces['DemoMapStringB']).toBe(
    'declare type DemoMapStringB = DemoMap<String, DemoB>;',
  );

  expect(result.schemas['DemoMapStringB']?.properties?.value?.type).toBe(
    'DemoB',
  );
});

test('typeNamePrefix: already-prefixed schema names warn and are not prefixed twice', async () => {
  const warnSpy = rstest.spyOn(console, 'warn').mockImplementation(() => {});

  try {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Already Prefixed API', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          DemoUser: {
            type: 'object',
            properties: { id: { type: 'integer' } },
          },
        },
      },
    };

    const adapter = new OpenAPIAdapter();
    const result = await adapter.parse(doc, {
      codeGeneration: {
        interfaceExportMode: 'declare',
        typeNamePrefix: 'Demo',
      },
    });

    expect(result.interfaces['DemoUser']).toContain(
      'declare interface DemoUser',
    );
    expect(result.interfaces['DemoDemoUser']).toBeUndefined();

    const warned = warnSpy.mock.calls.some((call) =>
      String(call[0]).includes('DemoUser'),
    );
    expect(warned).toBe(true);
  } finally {
    warnSpy.mockRestore();
  }
});

test('typeNamePrefix: inline request schema names are prefixed once', async () => {
  const doc = {
    openapi: '3.0.0',
    info: { title: 'Inline API', version: '1.0.0' },
    paths: {
      '/things': {
        post: {
          operationId: 'createThing',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    b: { $ref: '#/components/schemas/B' },
                  },
                },
              },
            },
          },
          responses: {
            '204': { description: 'ok' },
          },
        },
      },
    },
    components: {
      schemas: {
        B: {
          type: 'object',
          properties: { id: { type: 'integer' } },
        },
      },
    },
  };

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc, {
    codeGeneration: {
      interfaceExportMode: 'declare',
      typeNamePrefix: 'Demo',
    },
  });

  // 内联类型名同样带前缀，且不会因来源名已带前缀而变成 DemoDemo*
  const inlineName = Object.keys(result.interfaces).find((name) =>
    name.endsWith('_RequestBody'),
  );
  expect(inlineName).toBe('DemoCreateThing_application_json_RequestBody');
  expect(result.interfaces[inlineName!]).toContain('b?: DemoB;');
  expect(
    result.interfaces['DemoDemoCreateThing_application_json_RequestBody'],
  ).toBeUndefined();
});

test('typeNamePrefix: operation-derived parameter, inline response and anonymous schemas are prefixed', async () => {
  const doc = {
    openapi: '3.0.0',
    info: { title: 'Derived API', version: '1.0.0' },
    paths: {
      '/things': {
        get: {
          operationId: 'getThings',
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
              headers: {
                'X-Meta': {
                  schema: {
                    type: 'object',
                    properties: { trace: { type: 'string' } },
                  },
                },
              },
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/B' },
                    },
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
        B: {
          type: 'object',
          properties: { id: { type: 'integer' } },
        },
      },
    },
  };

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc, {
    codeGeneration: {
      interfaceExportMode: 'declare',
      typeNamePrefix: 'Demo',
    },
  });

  const api = result.apis[0]!;

  // 参数接口：声明名与 API 引用同步带前缀
  expect(result.interfaces['DemoGetThingsQueryParams']).toContain(
    'declare interface DemoGetThingsQueryParams',
  );
  expect(api.parameters?.query?.ref).toBe('DemoGetThingsQueryParams');

  // 内联响应 schema：声明名与响应引用同步带前缀
  const responseRef =
    api.responses['200']?.content?.['application/json']?.schema.ref;
  expect(responseRef).toBe('DemoGetThings_Response_application_json');
  expect(result.interfaces[responseRef!]).toContain('data?: DemoB;');

  // 无上下文的匿名对象：哈希名同样带前缀
  const anonymousName = Object.keys(result.interfaces).find((name) =>
    /^DemoAnonymousSchema_[0-9a-f]{8}$/.test(name),
  );
  expect(anonymousName).toBeDefined();
  expect(result.interfaces[anonymousName!]).toContain('trace?: string;');
  expect(api.responses['200']?.headers?.['X-Meta']?.schema.ref).toBe(
    anonymousName,
  );

  // 该文档全部声明均带前缀，且没有双重前缀
  for (const name of Object.keys(result.interfaces)) {
    expect(name.startsWith('Demo')).toBe(true);
    expect(name.startsWith('DemoDemo')).toBe(false);
  }
  for (const name of Object.keys(result.schemas)) {
    expect(name.startsWith('Demo')).toBe(true);
  }
});

/**
 * 前缀与命名大小写规整的顺序缺陷回归：
 * 前缀必须与原始名「逐段」做 PascalCase 规整后再拼接，
 * 而不是先拼整串再统一转换（那样小写单词名只会首字母大写）。
 */
function createCaseDoc(): Record<string, unknown> {
  return {
    openapi: '3.0.0',
    info: { title: 'Case API', version: '1.0.0' },
    paths: {
      '/keys': {
        get: {
          operationId: 'getKeys',
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/key' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        // 空对象：产出 type alias（复现线上 Socialkey = Record<string, never>）
        key: { type: 'object' },
        key1: {
          type: 'object',
          properties: { id: { type: 'integer' } },
        },
        pageDTO: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/key' },
            },
            detail: { $ref: '#/components/schemas/key1' },
          },
        },
        SomSensitivePublicOpinionSaveDTO: {
          type: 'object',
          properties: {
            nested: { $ref: '#/components/schemas/key1' },
          },
        },
      },
    },
  };
}

test('typeNamePrefix: applies per-segment PascalCase normalization', () => {
  // 小写单词名：拼接后不得依赖整串首字母大写
  expect(applyTypeNamePrefix('key', 'Social')).toBe('SocialKey');
  expect(applyTypeNamePrefix('key1', 'Social')).toBe('SocialKey1');
  // camelCase 名与 PascalCase 名幂等
  expect(applyTypeNamePrefix('pageDTO', 'Social')).toBe('SocialPageDTO');
  expect(
    applyTypeNamePrefix('SomSensitivePublicOpinionSaveDTO', 'Social'),
  ).toBe('SocialSomSensitivePublicOpinionSaveDTO');
  // 已带前缀名不双加（防御行为保留）
  expect(applyTypeNamePrefix('SocialUser', 'Social')).toBe('SocialUser');
  // 前缀本身也规整为 PascalCase
  expect(applyTypeNamePrefix('key', 'social')).toBe('SocialKey');
  // 不配前缀原样返回
  expect(applyTypeNamePrefix('key', undefined)).toBe('key');
});

test('typeNamePrefix: lowercase schema names get PascalCase segment after prefix', async () => {
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(createCaseDoc(), {
    codeGeneration: {
      interfaceExportMode: 'declare',
      typeNamePrefix: 'Social',
    },
  });

  // 声明名：Socialkey / Socialkey1 畸形名不再出现
  expect(result.interfaces['Socialkey']).toBeUndefined();
  expect(result.interfaces['Socialkey1']).toBeUndefined();
  expect(result.interfaces['SocialKey']).toBe(
    'declare type SocialKey = Record<string, never>;',
  );
  expect(result.interfaces['SocialKey1']).toBe(
    'declare interface SocialKey1 {\n  id?: number;\n}',
  );
  expect(result.interfaces['SocialPageDTO']).toContain('items?: SocialKey[];');
  expect(result.interfaces['SocialPageDTO']).toContain('detail?: SocialKey1;');
  expect(result.interfaces['SocialSomSensitivePublicOpinionSaveDTO']).toContain(
    'nested?: SocialKey1;',
  );

  // separateTypes 文件名契约：{name}.d.ts 与声明名、$ref 互引一致
  expect(Object.keys(result.interfaces).map((name) => `${name}.d.ts`)).toEqual(
    expect.arrayContaining([
      'SocialKey.d.ts',
      'SocialKey1.d.ts',
      'SocialPageDTO.d.ts',
      'SocialSomSensitivePublicOpinionSaveDTO.d.ts',
    ]),
  );

  // 结构化 schemas 与响应引用使用同一名字
  expect(result.schemas['SocialPageDTO']?.properties?.items?.type).toBe(
    'SocialKey[]',
  );
  expect(result.schemas['SocialPageDTO']?.properties?.detail?.type).toBe(
    'SocialKey1',
  );
  expect(
    result.apis[0]?.responses['200']?.content?.['application/json']?.schema,
  ).toMatchObject({ type: 'ref', ref: 'SocialKey' });
});

test('typeNamePrefix: prefixed output equals prefix plus unprefixed output', async () => {
  const adapter = new OpenAPIAdapter();
  const withoutPrefix = await adapter.parse(createCaseDoc(), {
    codeGeneration: { interfaceExportMode: 'declare' },
  });
  const withPrefix = await adapter.parse(createCaseDoc(), {
    codeGeneration: {
      interfaceExportMode: 'declare',
      typeNamePrefix: 'Social',
    },
  });

  // PascalCase 名的前缀化输出 = 前缀 + 未前缀化输出（2900+ 既有名的零变化不变式）
  const unprefixedNames = Object.keys(withoutPrefix.interfaces).sort();
  const prefixedNames = Object.keys(withPrefix.interfaces).sort();
  expect(prefixedNames).toEqual(unprefixedNames.map((n) => `Social${n}`));
  expect(unprefixedNames).toContain('Key');
  expect(unprefixedNames).toContain('Key1');
  expect(unprefixedNames).toContain('PageDTO');
  expect(unprefixedNames).toContain('SomSensitivePublicOpinionSaveDTO');
});
