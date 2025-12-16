import { test, expect } from '@rstest/core';
import { OpenAPIAdapter } from '../src';
import path from 'path';

import fs from 'fs';

test('OpenAPIAdapter should parse openapi.json', async () => {
  const openapiPath = path.resolve(__dirname, './fixtures/valid-openapi.json');
  const openapiContent = JSON.parse(fs.readFileSync(openapiPath, 'utf-8'));

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(openapiContent);

  expect(result).toBeDefined();
  expect(result.schemas).toBeDefined();
  expect(result.apis).toBeDefined();
  expect(result.interfaces).toBeDefined();

  // Check if schemas are extracted
  const schemaKeys = Object.keys(result.schemas);
  expect(schemaKeys.length).toBeGreaterThan(0);
  expect(result.schemas['User']).toBeDefined();
  expect(result.schemas['User'].type).toBe('object');

  // Check if apis are extracted
  expect(result.apis.length).toBeGreaterThan(0);
  const getUserApi = result.apis.find((api) => api.operationId === 'getUsers');
  expect(getUserApi).toBeDefined();
  expect(getUserApi?.method).toBe('GET');
  expect(getUserApi?.path).toBe('/users');
});
