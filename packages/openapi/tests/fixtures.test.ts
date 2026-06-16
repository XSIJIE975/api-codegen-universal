import { test, expect } from '@rstest/core';
import { OpenAPIAdapter } from '../src';
import path from 'node:path';
import fs from 'node:fs';

const FIXTURES_DIR = path.resolve(__dirname, './fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.resolve(FIXTURES_DIR, name), 'utf-8'));
}

// ===================================================================================
// generics-openapi.json fixture tests
// ===================================================================================

test('OpenAPIAdapter: generics fixture detects generic base and produces generic refs', async () => {
  const doc = loadFixture('generics-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  // ApiResponse should be detected as generic (used in allOf pattern)
  expect(result.schemas['ApiResponse']).toBeDefined();
  expect(result.schemas['ApiResponse']?.isGeneric).toBe(true);
  expect(result.schemas['ApiResponse']?.type).toBe('generic');

  // Non-generic schemas should not be marked
  expect(result.schemas['UserVo']?.isGeneric).toBeFalsy();
  expect(result.schemas['PostVo']?.isGeneric).toBeFalsy();

  // Should produce multiple APIs
  expect(result.apis.length).toBe(2);

  const listUsersApi = result.apis.find((a) => a.operationId === 'listUsers');
  expect(listUsersApi).toBeDefined();
  expect(listUsersApi?.method).toBe('GET');

  const listPostsApi = result.apis.find((a) => a.operationId === 'listPosts');
  expect(listPostsApi).toBeDefined();
});

test('OpenAPIAdapter: generics fixture generates interface code for generic base', async () => {
  const doc = loadFixture('generics-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  const apiResponseInterface = result.interfaces['ApiResponse'];
  expect(apiResponseInterface).toBeDefined();
  expect(apiResponseInterface).toContain('interface ApiResponse<T = any>');
  expect(apiResponseInterface).toContain('data');
});

// ===================================================================================
// complex-openapi.json fixture tests
// ===================================================================================

test('OpenAPIAdapter: complex fixture extracts multiple paths and methods', async () => {
  const doc = loadFixture('complex-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  // Should have extracted all paths/methods
  expect(result.apis.length).toBe(6); // GET/POST /users, GET/PUT/DELETE /users/{id}, GET /health

  const operationIds = result.apis.map((a) => a.operationId);
  expect(operationIds).toContain('listUsers');
  expect(operationIds).toContain('createUser');
  expect(operationIds).toContain('getUser');
  expect(operationIds).toContain('updateUser');
  expect(operationIds).toContain('deleteUser');
  expect(operationIds).toContain('healthCheck');
});

test('OpenAPIAdapter: complex fixture extracts metadata', async () => {
  const doc = loadFixture('complex-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  expect(result.metadata).toBeDefined();
  expect(result.metadata?.title).toBe('Complex API');
  expect(result.metadata?.description).toBe(
    'A complex OpenAPI fixture for thorough testing',
  );
  expect(result.metadata?.baseUrl).toBe('https://api.example.com/v2');
});

test('OpenAPIAdapter: complex fixture generates all schemas', async () => {
  const doc = loadFixture('complex-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  expect(result.schemas['User']).toBeDefined();
  expect(result.schemas['Role']).toBeDefined();
  expect(result.schemas['CreateUserRequest']).toBeDefined();
  expect(result.schemas['UpdateUserRequest']).toBeDefined();
  expect(result.schemas['PaginatedResponse']).toBeDefined();
});

test('OpenAPIAdapter: complex fixture extracts enum schema', async () => {
  const doc = loadFixture('complex-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  const role = result.schemas['Role'];
  expect(role).toBeDefined();
  expect(role?.type).toBe('enum');
  expect(role?.enum).toEqual(['admin', 'user', 'guest']);
});

test('OpenAPIAdapter: complex fixture classifies paths correctly', async () => {
  const doc = loadFixture('complex-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  const listUsers = result.apis.find((a) => a.operationId === 'listUsers');
  expect(listUsers?.category.segments).toEqual(['users']);
  expect(listUsers?.category.isUnclassified).toBe(false);

  const health = result.apis.find((a) => a.operationId === 'healthCheck');
  expect(health?.category.segments).toEqual(['health']);
});

test('OpenAPIAdapter: complex fixture generates parameter interfaces for query params', async () => {
  const doc = loadFixture('complex-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  // listUsers has query params (limit, offset, role)
  expect(result.schemas['ListUsersQueryParams']).toBeDefined();
  expect(result.interfaces['ListUsersQueryParams']).toBeDefined();

  // getUser has path param (id)
  expect(result.schemas['GetUserPathParams']).toBeDefined();
});

test('OpenAPIAdapter: complex fixture handles request body', async () => {
  const doc = loadFixture('complex-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  const createUser = result.apis.find((a) => a.operationId === 'createUser');
  expect(createUser?.requestBody).toBeDefined();
  expect(createUser?.requestBody?.required).toBe(true);
});

// ===================================================================================
// Input-type matrix tests
// ===================================================================================

test('OpenAPIAdapter: accepts object input directly', async () => {
  const doc = loadFixture('valid-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc);

  expect(result.schemas['User']).toBeDefined();
  expect(result.apis.length).toBeGreaterThan(0);
});

test('OpenAPIAdapter: accepts Buffer input', async () => {
  const content = fs.readFileSync(
    path.resolve(FIXTURES_DIR, 'valid-openapi.json'),
  );
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(content);

  expect(result.schemas['User']).toBeDefined();
});

test('OpenAPIAdapter: accepts string content (JSON)', async () => {
  const content = fs.readFileSync(
    path.resolve(FIXTURES_DIR, 'valid-openapi.json'),
    'utf-8',
  );
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(content);

  expect(result.schemas['User']).toBeDefined();
});

test('OpenAPIAdapter: accepts file path as string', async () => {
  const filePath = path.resolve(FIXTURES_DIR, 'valid-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(filePath);

  expect(result.schemas['User']).toBeDefined();
});

test('OpenAPIAdapter: accepts URL object for file://', async () => {
  const filePath = path.resolve(FIXTURES_DIR, 'valid-openapi.json');
  const { pathToFileURL } = await import('node:url');
  const url = pathToFileURL(filePath);

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(url);

  expect(result.schemas['User']).toBeDefined();
});

// ===================================================================================
// Output control tests
// ===================================================================================

test('OpenAPIAdapter: output.schemas=false does not extract components.schemas', async () => {
  const doc = loadFixture('complex-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc, {
    codeGeneration: { output: { schemas: false } },
  });

  // components.schemas should not be extracted
  expect(result.schemas['User']).toBeUndefined();
  expect(result.schemas['Role']).toBeUndefined();
  // But APIs and some inline schemas may still exist
  expect(result.apis.length).toBeGreaterThan(0);
});

test('OpenAPIAdapter: output.interfaces=false does not extract components.schemas as interfaces', async () => {
  const doc = loadFixture('complex-openapi.json');
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(doc, {
    codeGeneration: { output: { interfaces: false } },
  });

  // components.schemas should not be extracted as interfaces
  expect(result.interfaces['User']).toBeUndefined();
  expect(result.interfaces['Role']).toBeUndefined();
  // Schemas and APIs should still be generated
  expect(Object.keys(result.schemas).length).toBeGreaterThan(0);
  expect(result.apis.length).toBeGreaterThan(0);
});

test('OpenAPIAdapter: re-entrant calls do not cross-contaminate state', async () => {
  const adapter = new OpenAPIAdapter();
  const doc1 = loadFixture('valid-openapi.json');
  const doc2 = loadFixture('complex-openapi.json');

  // Run two parses concurrently
  const [r1, r2] = await Promise.all([
    adapter.parse(doc1),
    adapter.parse(doc2),
  ]);

  // r1 should only have User schema
  expect(r1.schemas['User']).toBeDefined();
  expect(r1.schemas['Role']).toBeUndefined();

  // r2 should have complex schemas
  expect(r2.schemas['User']).toBeDefined();
  expect(r2.schemas['Role']).toBeDefined();
  expect(r2.apis.length).toBeGreaterThan(r1.apis.length);
});
