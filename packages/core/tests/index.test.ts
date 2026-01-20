import { test, expect } from '@rstest/core';
import type {
  ApiDefinition,
  Metadata,
  SchemaDefinition,
  SchemaReference,
  StandardOutput,
} from '../src';

test('core package should load and export runtime module', async () => {
  const Core = await import('../src');
  expect(Core).toBeDefined();
});

test('core types should be usable in TS (compile-time)', () => {
  // This test is intentionally runtime-trivial; it exists to ensure
  // exported types can be imported/used without type errors.

  const schemaRef: SchemaReference = { type: 'ref', ref: 'User' };

  const schema: SchemaDefinition = {
    name: 'User',
    type: 'object',
    properties: {
      id: { name: 'id', type: 'string', required: true },
    },
    required: ['id'],
  };

  const api: ApiDefinition = {
    path: '/users',
    method: 'GET',
    operationId: 'getUsers',
    category: {
      segments: ['users'],
      depth: 1,
      isUnclassified: false,
      filePath: 'api/users/index.ts',
    },
    responses: {
      '200': {
        description: 'ok',
        content: {
          'application/json': { schema: schemaRef },
        },
      },
    },
  };

  const metadata: Metadata = {
    generatedAt: new Date(0).toISOString(),
    title: 'Test',
  };

  const output: StandardOutput = {
    schemas: { User: schema },
    interfaces: {},
    apis: [api],
    metadata,
  };

  expect(output.schemas.User?.name).toBe('User');
});
