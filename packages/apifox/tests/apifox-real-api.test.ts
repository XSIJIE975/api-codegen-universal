/**
 * Apifox 真实 API 集成测试
 *
 * 使用真实 Apifox 项目验证端到端解析流程。
 * 仅通过环境变量传入凭据，不硬编码任何敏感信息。
 *
 * 环境变量：
 * - APIFOX_TEST_PROJECT_ID: Apifox 项目 ID
 * - APIFOX_TEST_TOKEN: Apifox API Token
 *
 * 运行示例：
 * APIFOX_TEST_PROJECT_ID=8017604 APIFOX_TEST_TOKEN=your_token pnpm test
 */

import { describe, expect, test } from '@rstest/core';
import { ApifoxAdapter } from '../src/parser';

// 凭据配置：仅从环境变量读取，不硬编码默认值
const APIFOX_TEST_PROJECT_ID = process.env.APIFOX_TEST_PROJECT_ID;
const APIFOX_TEST_TOKEN = process.env.APIFOX_TEST_TOKEN;

const hasCredentials = !!APIFOX_TEST_PROJECT_ID && !!APIFOX_TEST_TOKEN;

// ===================================================================================
// 真实 API 集成测试（需要网络访问）
// ===================================================================================

describe('ApifoxAdapter - Real API Integration', () => {
  test.skipIf(!hasCredentials)(
    'should fetch and parse real Apifox project successfully',
    async () => {
      const adapter = new ApifoxAdapter();
      const config = {
        projectId: APIFOX_TEST_PROJECT_ID,
        token: APIFOX_TEST_TOKEN,
      };

      const result = await adapter.parse(config, {
        validateOpenApi: false, // 跳过 swagger-parser 校验以提升测试速度
      });

      // 验证基本输出结构
      expect(result).toBeDefined();
      expect(result.schemas).toBeDefined();
      expect(result.interfaces).toBeDefined();
      expect(result.apis).toBeDefined();
      expect(result.metadata).toBeDefined();

      // 验证 metadata
      expect(result.metadata?.source).toContain(
        `Apifox Project ${APIFOX_TEST_PROJECT_ID}`,
      );
      expect(result.metadata?.generatedAt).toBeDefined();

      // 验证输出非空（真实项目应有数据）
      expect(Object.keys(result.schemas).length).toBeGreaterThan(0);
      expect(result.apis.length).toBeGreaterThan(0);
    },
    60_000, // 60s 超时（真实 API 可能较慢）
  );

  test.skipIf(!hasCredentials)(
    'should generate valid schemas with correct structure',
    async () => {
      const adapter = new ApifoxAdapter();
      const config = {
        projectId: APIFOX_TEST_PROJECT_ID,
        token: APIFOX_TEST_TOKEN,
      };

      const result = await adapter.parse(config, {
        validateOpenApi: false,
      });

      // 验证每个 schema 的结构完整性
      for (const [name, schema] of Object.entries(result.schemas)) {
        expect(schema.name).toBe(name);
        expect(schema.type).toBeDefined();

        // 如果是 object 类型，验证 properties 存在
        if (schema.type === 'object' || schema.type === 'generic') {
          expect(schema.properties).toBeDefined();
        }

        // 如果是 enum 类型，验证 enum 数组存在
        if (schema.type === 'enum') {
          expect(schema.enum).toBeDefined();
          expect(Array.isArray(schema.enum)).toBe(true);
        }

        // 如果是 array 类型，验证 items 存在
        if (schema.type === 'array') {
          expect(schema.items).toBeDefined();
        }
      }
    },
    60_000,
  );

  test.skipIf(!hasCredentials)(
    'should generate valid API definitions with correct structure',
    async () => {
      const adapter = new ApifoxAdapter();
      const config = {
        projectId: APIFOX_TEST_PROJECT_ID,
        token: APIFOX_TEST_TOKEN,
      };

      const result = await adapter.parse(config, {
        validateOpenApi: false,
      });

      // 验证每个 API 的结构完整性
      for (const api of result.apis) {
        expect(api.path).toBeDefined();
        expect(api.method).toBeDefined();
        expect(api.operationId).toBeDefined();
        expect(api.responses).toBeDefined();
        expect(api.category).toBeDefined();

        // 验证 HTTP 方法有效
        expect([
          'GET',
          'POST',
          'PUT',
          'DELETE',
          'PATCH',
          'HEAD',
          'OPTIONS',
        ]).toContain(api.method);

        // 验证分类信息
        expect(api.category.filePath).toBeDefined();
        expect(api.category.segments).toBeDefined();
        expect(Array.isArray(api.category.segments)).toBe(true);

        // 验证响应至少有一个状态码
        expect(Object.keys(api.responses).length).toBeGreaterThan(0);
      }
    },
    60_000,
  );

  test.skipIf(!hasCredentials)(
    'should generate TypeScript interface code strings',
    async () => {
      const adapter = new ApifoxAdapter();
      const config = {
        projectId: APIFOX_TEST_PROJECT_ID,
        token: APIFOX_TEST_TOKEN,
      };

      const result = await adapter.parse(config, {
        validateOpenApi: false,
      });

      // 验证接口代码字符串
      for (const [name, code] of Object.entries(result.interfaces)) {
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);

        // 验证代码包含 export 或 declare 关键字
        expect(code).toMatch(/^(export|declare)\s/m);

        // 验证代码包含接口/类型名称
        expect(code).toContain(name);
      }
    },
    60_000,
  );

  test.skipIf(!hasCredentials)(
    'should handle generics correctly in real project',
    async () => {
      const adapter = new ApifoxAdapter();
      const config = {
        projectId: APIFOX_TEST_PROJECT_ID,
        token: APIFOX_TEST_TOKEN,
      };

      const result = await adapter.parse(config, {
        validateOpenApi: false,
      });

      // 查找泛型 schema
      const genericSchemas = Object.entries(result.schemas).filter(
        ([, schema]) => schema.isGeneric === true,
      );

      // 如果有泛型 schema，验证其结构
      for (const [name, schema] of genericSchemas) {
        expect(schema.baseType).toBeDefined();
        expect(schema.genericParam).toBeDefined();

        // 验证接口代码中包含泛型语法
        const interfaceCode = result.interfaces[name];
        if (interfaceCode) {
          expect(interfaceCode).toMatch(/<T\s*=/);
        }
      }
    },
    60_000,
  );

  test.skipIf(!hasCredentials)(
    'should not leak sensitive credentials in metadata',
    async () => {
      const adapter = new ApifoxAdapter();
      const config = {
        projectId: APIFOX_TEST_PROJECT_ID,
        token: APIFOX_TEST_TOKEN,
      };

      const result = await adapter.parse(config, {
        validateOpenApi: false,
      });

      // 验证 metadata 中不包含 token
      const metadataStr = JSON.stringify(result.metadata);
      expect(metadataStr).not.toContain(APIFOX_TEST_TOKEN);

      // 验证 metadata.options 中不包含敏感字段
      if (result.metadata?.options) {
        const optionsStr = JSON.stringify(result.metadata.options);
        expect(optionsStr).not.toContain('token');
        expect(optionsStr).not.toContain(APIFOX_TEST_TOKEN);
      }
    },
    60_000,
  );

  test.skipIf(!hasCredentials)(
    'should produce deterministic output across multiple parses',
    async () => {
      const adapter = new ApifoxAdapter();
      const config = {
        projectId: APIFOX_TEST_PROJECT_ID,
        token: APIFOX_TEST_TOKEN,
      };

      const options = { validateOpenApi: false };

      // 执行两次解析
      const result1 = await adapter.parse(config, options);
      const result2 = await adapter.parse(config, options);

      // 验证 schema 名称一致
      expect(Object.keys(result1.schemas).sort()).toEqual(
        Object.keys(result2.schemas).sort(),
      );

      // 验证 API 数量和 operationId 一致
      expect(result1.apis.length).toBe(result2.apis.length);
      const ops1 = result1.apis.map((a) => a.operationId).sort();
      const ops2 = result2.apis.map((a) => a.operationId).sort();
      expect(ops1).toEqual(ops2);

      // 验证接口代码一致
      expect(Object.keys(result1.interfaces).sort()).toEqual(
        Object.keys(result2.interfaces).sort(),
      );
    },
    120_000, // 2 分钟超时（两次 API 调用）
  );
});
