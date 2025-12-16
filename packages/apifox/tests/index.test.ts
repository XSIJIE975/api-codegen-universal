import { test, expect } from '@rstest/core';
import { ApifoxAdapter } from '../src';
import path from 'path';
import fs from 'fs';

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
