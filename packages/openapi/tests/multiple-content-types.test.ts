import { test, expect } from '@rstest/core';
import { OpenAPIAdapter } from '../src/adapter';

test('multiple content types with different inline schemas should not collide', async () => {
  const openApiDoc = {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
      '/users': {
        post: {
          operationId: 'createUser',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string' },
                  },
                  required: ['name', 'email'],
                },
              },
              'application/xml': {
                schema: {
                  type: 'object',
                  properties: {
                    userName: { type: 'string' },
                    emailAddress: { type: 'string' },
                  },
                  required: ['userName', 'emailAddress'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      createdAt: { type: 'string' },
                    },
                  },
                },
                'application/xml': {
                  schema: {
                    type: 'object',
                    properties: {
                      userId: { type: 'integer' },
                      creationDate: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse(openApiDoc as any);

  // Verify that we have separate schemas for each content type
  const schemaNames = Object.keys(result.schemas);

  // Should have separate request body schemas
  const jsonRequestSchema = schemaNames.find(
    (name) =>
      name.toLowerCase().includes('createuser') &&
      name.toLowerCase().includes('json') &&
      name.toLowerCase().includes('request'),
  );
  const xmlRequestSchema = schemaNames.find(
    (name) =>
      name.toLowerCase().includes('createuser') &&
      name.toLowerCase().includes('xml') &&
      name.toLowerCase().includes('request'),
  );

  expect(jsonRequestSchema).toBeDefined();
  expect(xmlRequestSchema).toBeDefined();
  expect(jsonRequestSchema).not.toBe(xmlRequestSchema);

  // Verify the schemas have the correct properties
  const jsonReqSchema = result.schemas[jsonRequestSchema!];
  const xmlReqSchema = result.schemas[xmlRequestSchema!];

  expect(jsonReqSchema.properties).toHaveProperty('name');
  expect(jsonReqSchema.properties).toHaveProperty('email');
  expect(jsonReqSchema.properties).not.toHaveProperty('userName');
  expect(jsonReqSchema.properties).not.toHaveProperty('emailAddress');

  expect(xmlReqSchema.properties).toHaveProperty('userName');
  expect(xmlReqSchema.properties).toHaveProperty('emailAddress');
  expect(xmlReqSchema.properties).not.toHaveProperty('name');
  expect(xmlReqSchema.properties).not.toHaveProperty('email');

  // Should have separate response schemas
  const jsonResponseSchema = schemaNames.find(
    (name) =>
      name.toLowerCase().includes('createuser') &&
      name.toLowerCase().includes('json') &&
      name.toLowerCase().includes('response'),
  );
  const xmlResponseSchema = schemaNames.find(
    (name) =>
      name.toLowerCase().includes('createuser') &&
      name.toLowerCase().includes('xml') &&
      name.toLowerCase().includes('response'),
  );

  expect(jsonResponseSchema).toBeDefined();
  expect(xmlResponseSchema).toBeDefined();
  expect(jsonResponseSchema).not.toBe(xmlResponseSchema);

  // Verify the response schemas have the correct properties
  const jsonRespSchema = result.schemas[jsonResponseSchema!];
  const xmlRespSchema = result.schemas[xmlResponseSchema!];

  expect(jsonRespSchema.properties).toHaveProperty('id');
  expect(jsonRespSchema.properties).toHaveProperty('createdAt');
  expect(jsonRespSchema.properties).not.toHaveProperty('userId');
  expect(jsonRespSchema.properties).not.toHaveProperty('creationDate');

  expect(xmlRespSchema.properties).toHaveProperty('userId');
  expect(xmlRespSchema.properties).toHaveProperty('creationDate');
  expect(xmlRespSchema.properties).not.toHaveProperty('id');
  expect(xmlRespSchema.properties).not.toHaveProperty('createdAt');

  // Verify the API definition references the correct schemas
  const api = result.apis[0];
  expect(api.requestBody?.content['application/json']?.schema.ref).toBe(
    jsonRequestSchema,
  );
  expect(api.requestBody?.content['application/xml']?.schema.ref).toBe(
    xmlRequestSchema,
  );
  expect(api.responses['200'].content?.['application/json']?.schema.ref).toBe(
    jsonResponseSchema,
  );
  expect(api.responses['200'].content?.['application/xml']?.schema.ref).toBe(
    xmlResponseSchema,
  );
});
