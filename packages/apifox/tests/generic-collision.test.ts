import { describe, it, expect } from '@rstest/core';
import { ApifoxAdapter } from '../src/parser';

describe('ApifoxAdapter - Generic Name Collision', () => {
  it('should handle generic name collisions without data loss', async () => {
    // 模拟一个包含泛型名称冲突的 Apifox 导出数据
    const mockApifoxData = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          // 已存在的普通 schema
          PageVO_User: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
          // 泛型实例，规范化后会与上面的名称冲突
          'PageVO«User»': {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: { $ref: '#/components/schemas/User' },
              },
              total: { type: 'integer' },
            },
          },
          User: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      },
    };

    const adapter = new ApifoxAdapter();

    // 直接调用内部方法进行修复
    const fixedData = (adapter as any).fixOpenApiCompatibility(
      JSON.parse(JSON.stringify(mockApifoxData)),
    );

    // 验证两个 schema 都存在
    expect(fixedData.components.schemas['PageVO_User']).toBeDefined();

    // 泛型实例应该被重命名为带哈希的名称
    const genericSchemaKeys = Object.keys(fixedData.components.schemas).filter(
      (key) => key.startsWith('PageVO_User_'),
    );
    expect(genericSchemaKeys.length).toBe(1);

    const genericSchemaKey = genericSchemaKeys[0];
    const genericSchema = fixedData.components.schemas[genericSchemaKey];

    // 验证泛型 schema 保留了其原始结构
    expect(genericSchema.properties.items).toBeDefined();
    expect(genericSchema.properties.items.type).toBe('array');
    expect(genericSchema.properties.total).toBeDefined();
    expect(genericSchema.properties.total.type).toBe('integer');

    // 验证泛型元数据被正确注入
    expect(genericSchema['x-apifox-generic']).toEqual({
      baseType: 'PageVO',
      generics: ['User'],
    });

    // 验证原始 schema 没有被覆盖
    const originalSchema = fixedData.components.schemas['PageVO_User'];
    expect(originalSchema.properties.id).toBeDefined();
    expect(originalSchema.properties.name).toBeDefined();
    expect(originalSchema.properties.items).toBeUndefined();

    // 验证引用映射正确
    const refPath = `#/components/schemas/${genericSchemaKey}`;
    expect((adapter as any).hasRef(fixedData, refPath)).toBe(true);
  });

  it('should handle multiple generic instances with same base type', async () => {
    const mockApifoxData = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          'PageVO«User»': {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: { $ref: '#/components/schemas/User' },
              },
            },
          },
          'PageVO«Product»': {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: { $ref: '#/components/schemas/Product' },
              },
            },
          },
          User: { type: 'object' },
          Product: { type: 'object' },
        },
      },
    };

    const adapter = new ApifoxAdapter();
    const fixedData = (adapter as any).fixOpenApiCompatibility(
      JSON.parse(JSON.stringify(mockApifoxData)),
    );

    // 应该有两个不同的重命名 schema
    const pageVOSchemas = Object.keys(fixedData.components.schemas).filter(
      (key) => key.startsWith('PageVO_'),
    );

    expect(pageVOSchemas.length).toBe(2);

    // 验证每个泛型实例都有正确的元数据
    const userGeneric = pageVOSchemas.find((key) =>
      fixedData.components.schemas[key]['x-apifox-generic']?.generics?.includes(
        'User',
      ),
    );
    const productGeneric = pageVOSchemas.find((key) =>
      fixedData.components.schemas[key]['x-apifox-generic']?.generics?.includes(
        'Product',
      ),
    );

    expect(userGeneric).toBeDefined();
    expect(productGeneric).toBeDefined();
    expect(userGeneric).not.toBe(productGeneric);
  });
});
