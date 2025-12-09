/* eslint-disable @typescript-eslint/no-explicit-any */
import SwaggerParser from '@apidevtools/swagger-parser';
import type { IAdapter, StandardOutput } from '@api-codegen-universal/core';
import {
  InputSource,
  OpenAPIAdapter,
  type OpenAPIOptions,
} from '@api-codegen-universal/openapi';
import type {
  ApifoxAdapterOptions,
  ApifoxConfig,
  ApifoxExportToOpenAPIOptions,
} from './types';

export class ApifoxAdapter
  implements IAdapter<ApifoxAdapterOptions, ApifoxConfig>
{
  /**
   * 验证配置有效性
   */
  async validate(source: ApifoxConfig): Promise<boolean> {
    return !!(source && source.projectId && source.token);
  }

  /**
   * 解析主入口
   */
  async parse(
    source: ApifoxConfig,
    options: ApifoxAdapterOptions = {},
  ): Promise<StandardOutput> {
    console.log(
      `[ApifoxAdapter] Starting export for project: ${source.projectId}`,
    );
    let openApiData = await this.fetchOpenApiData(source);
    openApiData = this.fixOpenApiCompatibility(openApiData);
    // 校验数据格式是否符合 OpenAPI 标准
    try {
      await SwaggerParser.validate(JSON.parse(JSON.stringify(openApiData)));
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`[ApifoxAdapter] Validation Failed: ${err.message}`);
        throw new Error(
          `Invalid OpenAPI data received from Apifox: ${err.message}`,
        );
      }
    }
    console.log(`[ApifoxAdapter] Converting using OpenAPIAdapter...`);

    const openApiAdapter = new OpenAPIAdapter();

    const result = await openApiAdapter.parse(
      openApiData as InputSource,
      options as OpenAPIOptions,
    );

    if (result.metadata) {
      result.metadata.source = `Apifox Project ${source.projectId}`;
      result.metadata.generatedAt = new Date().toISOString();
    }

    return result;
  }

  /**
   * 修复 Apifox 导出数据中不符合 OpenAPI 3.0/3.1 标准的地方
   */
  private fixOpenApiCompatibility(data: any): any {
    if (!data) return data;

    // 修复失效的引用
    this.fixBrokenRefs(data);

    // 修复泛型名称 (Java 风格的 « »)
    this.fixGenericsNames(data);

    // 1. 修复 Security Schemes 定义问题
    // type: http 的 scheme 不允许包含 'name' 和 'in' 字段
    if (data.components?.securitySchemes) {
      Object.values(data.components.securitySchemes).forEach((scheme: any) => {
        if (scheme.type === 'http') {
          delete scheme.name; // 删除非标字段
          delete scheme.in; // 删除非标字段
        }
      });
    }

    // 2. 修复 Paths 中的 Security 定义问题
    // security 数组中的对象 key 只能是 Scheme Name，不能包含 x-apifox 等扩展字段
    if (data.paths) {
      Object.values(data.paths).forEach((pathItem: any) => {
        // 遍历所有 HTTP 方法 (get, post, put, etc.)
        [
          'get',
          'post',
          'put',
          'delete',
          'patch',
          'options',
          'head',
          'trace',
        ].forEach((method) => {
          if (pathItem[method] && pathItem[method].security) {
            const security = pathItem[method].security;
            if (Array.isArray(security)) {
              security.forEach((secItem: any) => {
                // 删除 secItem 中所有以 'x-' 开头的 key
                Object.keys(secItem).forEach((key) => {
                  if (key.toLowerCase().startsWith('x-')) {
                    delete secItem[key];
                  }
                });
              });
            }
          }
        });
      });
    }

    return data;
  }

  /**
   * 请求 Apifox 开放 API
   */
  private async fetchOpenApiData(config: ApifoxConfig): Promise<unknown> {
    const baseUrl = 'https://api.apifox.com/v1';
    const url = `${baseUrl}/projects/${config.projectId}/export-openapi`;

    const requestBody: ApifoxExportToOpenAPIOptions = {
      exportFormat: 'JSON',
      oasVersion: '3.0',
      scope: {
        type: 'ALL',
      },
      options: {
        addFoldersToTags: false,
        includeApifoxExtensionProperties: false,
      },
      ...config.exportOptions,
    };

    if (config.exportOptions?.scope) {
      requestBody.scope = config.exportOptions.scope;
    }
    if (config.exportOptions?.options) {
      requestBody.options = {
        ...requestBody.options,
        ...config.exportOptions.options,
      };
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'X-Apifox-Api-Version': config.apiVersion || '2024-03-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Apifox Export API Failed: [${response.status}] ${errorText}`,
        );
      }
      return await response.json();
    } catch (error) {
      console.error('[ApifoxAdapter] Network Request Error:', error);
      throw error;
    }
  }

  /**
   * 递归检查并修复失效的引用
   */
  private fixBrokenRefs(data: any): void {
    const findAndFix = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      if (Array.isArray(obj)) {
        obj.forEach(findAndFix);
        return;
      }

      if (
        obj.$ref &&
        typeof obj.$ref === 'string' &&
        obj.$ref.startsWith('#/')
      ) {
        if (!this.hasRef(data, obj.$ref)) {
          const decodedRef = decodeURIComponent(obj.$ref);
          console.warn(
            `[ApifoxAdapter] Fixing broken reference: ${decodedRef}`,
          );
          delete obj.$ref;
          obj.type = 'object'; // Fallback to generic object
          obj.description = `(Fixed broken reference: ${decodedRef})`;
        }
      }

      Object.values(obj).forEach(findAndFix);
    };

    findAndFix(data);
  }

  /**
   * 检查引用是否存在
   */
  private hasRef(root: any, ref: string): boolean {
    try {
      const path = ref.substring(2).split('/');
      let current = root;
      for (const segment of path) {
        const decodedSegment = segment.replace(/~1/g, '/').replace(/~0/g, '~');
        if (
          current &&
          typeof current === 'object' &&
          decodedSegment in current
        ) {
          current = current[decodedSegment];
        } else {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 修复泛型名称 (Java 风格的 « »)
   */
  private fixGenericsNames(data: any): void {
    if (!data?.components?.schemas) return;

    const schemaMap = new Map<string, string>();
    const schemas = data.components.schemas;

    // 1. 建立映射并重命名 Schema Key
    Object.keys(schemas).forEach((key) => {
      if (key.includes('«') || key.includes('»')) {
        // 替换策略：« -> _, » -> (空), , -> _
        // 例如: Success«Data» -> Success_Data
        const newKey = key
          .replace(/«/g, '_')
          .replace(/»/g, '')
          .replace(/,/g, '_');

        // 只有当新 key 不存在时才重命名，防止冲突
        if (!schemas[newKey]) {
          schemas[newKey] = schemas[key];
          delete schemas[key];
          schemaMap.set(
            `#/components/schemas/${key}`,
            `#/components/schemas/${newKey}`,
          );
        }
      }
    });

    if (schemaMap.size === 0) return;

    console.log(
      `[ApifoxAdapter] Renamed ${schemaMap.size} schemas with generic names.`,
    );

    // 2. 遍历整个对象更新引用
    const updateRefs = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      if (Array.isArray(obj)) {
        obj.forEach(updateRefs);
        return;
      }

      if (obj.$ref && typeof obj.$ref === 'string') {
        if (schemaMap.has(obj.$ref)) {
          obj.$ref = schemaMap.get(obj.$ref);
        }
      }

      Object.values(obj).forEach(updateRefs);
    };

    updateRefs(data);
  }
}
