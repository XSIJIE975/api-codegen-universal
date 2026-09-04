import { test, expect } from '@rstest/core';
import { OpenAPIAdapter } from '../src';
import { resolveOperationIdCollisions } from '../src/utils/operation-id-utils';
import {
  createAdapterLogger,
  createWarningsCollector,
} from '@api-codegen-universal/core';

const okResponse = {
  '200': {
    description: 'ok',
    content: {
      'application/json': { schema: { type: 'string' } },
    },
  },
};

function buildDoc(paths: Record<string, Record<string, unknown>>) {
  return {
    openapi: '3.0.0',
    info: { title: 'OperationId Test API', version: '1.0.0' },
    paths,
  };
}

test('separator-variant paths get unique operationIds (real-world collision case)', async () => {
  const doc = buildDoc({
    // `-` 分隔：按 (path, method) 字典序排在 `/` 分隔之前（`-` < `/`），保留原名
    '/service/hiagent-convert-file-to-jsonl': {
      post: {
        summary: 'convert',
        parameters: [
          { name: 'fileName', in: 'query', schema: { type: 'string' } },
        ],
        responses: okResponse,
      },
    },
    // `/` 分隔：归一化后与上面同名，追加数字后缀消歧
    '/service/hiagent/convert-file-to-jsonl': {
      post: {
        summary: 'convertFileToJsonl',
        parameters: [
          { name: 'tagKey', in: 'query', schema: { type: 'string' } },
          { name: 'tagValue', in: 'query', schema: { type: 'string' } },
        ],
        responses: okResponse,
      },
    },
  });

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  const dashApi = result.apis.find(
    (a) => a.path === '/service/hiagent-convert-file-to-jsonl',
  );
  const slashApi = result.apis.find(
    (a) => a.path === '/service/hiagent/convert-file-to-jsonl',
  );

  expect(dashApi?.operationId).toBe('postServiceHiagentConvertFileToJsonl');
  expect(slashApi?.operationId).toBe('postServiceHiagentConvertFileToJsonl2');

  // 类型名与消歧后的 operationId 保持同步
  expect(
    result.schemas['PostServiceHiagentConvertFileToJsonlQueryParams'],
  ).toBeDefined();
  expect(
    result.schemas['PostServiceHiagentConvertFileToJsonl2QueryParams'],
  ).toBeDefined();
  expect(slashApi?.parameters?.query?.ref).toBe(
    'PostServiceHiagentConvertFileToJsonl2QueryParams',
  );
});

test('collision resolution is deterministic regardless of document order', async () => {
  const doc = buildDoc({
    '/service/hiagent/convert-file-to-jsonl': {
      post: { responses: okResponse },
    },
    '/service/hiagent-convert-file-to-jsonl': {
      post: { responses: okResponse },
    },
  });

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  const slashApi = result.apis.find(
    (a) => a.path === '/service/hiagent/convert-file-to-jsonl',
  );
  expect(slashApi?.operationId).toBe('postServiceHiagentConvertFileToJsonl2');
});

test('provided operationIds that normalize to the same key are disambiguated', async () => {
  const doc = buildDoc({
    '/users-list': {
      get: { operationId: 'get-user', responses: okResponse },
    },
    '/users': {
      get: { operationId: 'getUser', responses: okResponse },
    },
  });

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  const byId = (id: string) => result.apis.find((a) => a.operationId === id);
  expect(byId('getUser')?.path).toBe('/users');
  expect(byId('get-user2')?.path).toBe('/users-list');
});

test('generateOperationId splits segments on - and _', async () => {
  const doc = buildDoc({
    '/users/{id}': { get: { responses: okResponse } },
    '/files/{file_id}/download': { get: { responses: okResponse } },
    '/service/api/iic/ccmOpinionData/add-or_update': {
      post: { responses: okResponse },
    },
  });

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  const byId = (id: string) => result.apis.find((a) => a.operationId === id);
  expect(byId('getUsersById')?.path).toBe('/users/{id}');
  // {param} 段仅首字母大写（保持既有行为），其余段按 -/_ 拆词
  expect(byId('getFilesByFile_idDownload')?.path).toBe(
    '/files/{file_id}/download',
  );
  expect(byId('postServiceApiIicCcmOpinionDataAddOrUpdate')?.path).toBe(
    '/service/api/iic/ccmOpinionData/add-or_update',
  );
});

test('renames are recorded through the warnings collector', async () => {
  const doc = buildDoc({
    '/service/hiagent-convert-file-to-jsonl': {
      post: { responses: okResponse },
    },
    '/service/hiagent/convert-file-to-jsonl': {
      post: { responses: okResponse },
    },
  });

  const warnMetas: Array<Record<string, unknown>> = [];
  const warnings = createWarningsCollector({
    logger: createAdapterLogger(
      {
        logLevel: 'warn',
        logger: {
          warn: (msg, meta) => {
            void msg;
            if (meta) warnMetas.push(meta);
          },
        },
      },
      { adapter: 'openapi', source: 'test' },
    ),
    code: 'OPENAPI_WARNINGS_SUMMARY',
  });

  const adapter = new OpenAPIAdapter();
  await adapter.parse(doc, { warnings });

  warnings.flush({ validation: 'enabled' });

  expect(warnMetas.length).toBe(1);
  const stats = warnMetas[0].stats as {
    renamedDuplicateOperationIds?: number;
  };
  expect(stats.renamedDuplicateOperationIds).toBe(1);
  const samples = warnMetas[0].samples as {
    duplicateOperationIds?: Array<{
      from: string;
      to: string;
      path: string;
      method: string;
    }>;
  };
  expect(samples.duplicateOperationIds?.[0]).toEqual({
    from: 'postServiceHiagentConvertFileToJsonl',
    to: 'postServiceHiagentConvertFileToJsonl2',
    path: '/service/hiagent/convert-file-to-jsonl',
    method: 'POST',
  });
});

test('resolveOperationIdCollisions avoids suffix keys already taken by other operations', () => {
  const ops = [
    { path: '/c', method: 'GET', operationId: 'x2' },
    { path: '/a', method: 'GET', operationId: 'x' },
    { path: '/b', method: 'GET', operationId: 'X' },
  ];

  resolveOperationIdCollisions(ops);

  // /a 保留 'x'；/b 的 'X' 归一化后与 'x' 冲突，且后缀 '2' 已被 /c 的 'x2' 占用，顺延为 'X3'
  expect(ops.map((o) => o.operationId).sort()).toEqual(['X3', 'x', 'x2']);
  expect(ops.find((o) => o.path === '/a')?.operationId).toBe('x');
  expect(ops.find((o) => o.path === '/b')?.operationId).toBe('X3');
  expect(ops.find((o) => o.path === '/c')?.operationId).toBe('x2');
});
