/**
 * Apifox 适配器
 * 负责从 Apifox API 获取 OpenAPI 数据，并进行兼容性修复和转换
 */

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

/**
 * Apifox 适配器类
 * 实现 IAdapter 接口，用于处理 Apifox 项目数据的导入和转换
 */
export class ApifoxAdapter
  implements IAdapter<ApifoxAdapterOptions, ApifoxConfig>
{
  /**
   * 验证配置有效性
   * 检查是否包含必要的 projectId 和 token
   *
   * @param source Apifox 配置对象
   * @returns 如果配置有效返回 true，否则返回 false
   */
  async validate(source: ApifoxConfig): Promise<boolean> {
    return !!(source && source.projectId && source.token);
  }

  /**
   * 解析主入口
   * 1. 从 Apifox API 获取 OpenAPI 数据
   * 2. 修复数据中的兼容性问题 (泛型命名、失效引用、非标字段)
   * 3. 验证修复后的数据是否符合 OpenAPI 标准
   * 4. 使用 OpenAPIAdapter 将其转换为标准输出格式
   *
   * @param source Apifox 配置对象
   * @param options 适配器选项
   * @returns 标准输出格式 (StandardOutput)
   */
  async parse(
    source: ApifoxConfig,
    options: ApifoxAdapterOptions = {},
  ): Promise<StandardOutput> {
    console.log(
      `[ApifoxAdapter] Starting export for project: ${source.projectId}`,
    );

    // 1. 获取数据
    let openApiData = await this.fetchOpenApiData(source);

    // 2. 修复兼容性
    openApiData = this.fixOpenApiCompatibility(openApiData);

    // 3. 校验数据格式是否符合 OpenAPI 标准
    try {
      // 使用 JSON.parse(JSON.stringify()) 深拷贝一份数据进行校验，避免校验过程修改原数据
      await SwaggerParser.validate(JSON.parse(JSON.stringify(openApiData)));
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`[ApifoxAdapter] Validation Failed: ${err.message}`);
        // 即使校验失败，也尝试继续处理，因为有些非关键错误可能不影响代码生成
        // 但这里选择抛出错误以保证数据质量，可视情况调整策略
        throw new Error(
          `Invalid OpenAPI data received from Apifox: ${err.message}`,
        );
      }
    }
    console.log(`[ApifoxAdapter] Converting using OpenAPIAdapter...`);

    // 4. 转换为标准格式
    const openApiAdapter = new OpenAPIAdapter();

    const result = await openApiAdapter.parse(
      openApiData as InputSource,
      options as OpenAPIOptions,
    );

    // 补充元数据
    if (result.metadata) {
      result.metadata.source = `Apifox Project ${source.projectId}`;
      result.metadata.generatedAt = new Date().toISOString();
    }

    return result;
  }

  /**
   * 修复 Apifox 导出数据中不符合 OpenAPI 3.0/3.1 标准的地方
   * 以及处理 Apifox 特有的泛型命名风格
   *
   * @param data 原始 OpenAPI 数据
   * @returns 修复后的 OpenAPI 数据
   */
  private fixOpenApiCompatibility(data: any): any {
    if (!data) return data;

    // 修复泛型名称 (Java 风格的 « »)
    // 注意：必须在 fixBrokenRefs 之前执行，因为 fixBrokenRefs 可能会因为编码不匹配误删泛型引用
    this.fixGenericsNames(data);

    // 修复失效的引用
    this.fixBrokenRefs(data);

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
   * 请求 Apifox 开放 API 获取 OpenAPI 数据
   *
   * @param config Apifox 配置
   * @returns OpenAPI JSON 数据
   */
  protected async fetchOpenApiData(config: ApifoxConfig): Promise<unknown> {
    const baseUrl = 'https://api.apifox.com/v1';
    const url = `${baseUrl}/projects/${config.projectId}/export-openapi`;

    // 构建请求体
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

    // 合并用户配置
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
   * 递归检查并修复失效的引用 ($ref)
   * 如果引用指向的路径不存在，则删除该引用并回退到普通对象
   *
   * @param data OpenAPI 数据
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
          Reflect.deleteProperty(obj, '$ref');
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
   * 解析 JSON Pointer 并在根对象中查找
   *
   * @param root 根对象
   * @param ref 引用字符串 (例如 #/components/schemas/User)
   * @returns 如果引用存在返回 true，否则返回 false
   */
  private hasRef(root: any, ref: string): boolean {
    try {
      const path = ref.substring(2).split('/');
      let current = root;
      for (const segment of path) {
        const decodedSegment = segment.replace(/~1/g, '/').replace(/~0/g, '~');

        if (current && typeof current === 'object') {
          if (decodedSegment in current) {
            current = current[decodedSegment];
            continue;
          }
          // 尝试 URL 解码后查找
          try {
            const urlDecoded = decodeURIComponent(decodedSegment);
            if (urlDecoded in current) {
              current = current[urlDecoded];
              continue;
            }
          } catch {
            // ignore
          }

          return false;
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
   *
   * 策略：
   * 1. 将特殊字符转换为下划线，生成安全的 Schema 名称，避免 openapi-typescript 解析为 unknown
   *    例如: PageVO«ApplyListVO» -> PageVO_ApplyListVO
   * 2. 在 Schema 中注入 x-apifox-generic 元数据，记录原始泛型结构
   *    例如: { baseType: 'PageVO', generics: ['ApplyListVO'] }
   *
   * @param data OpenAPI 数据
   */
  private fixGenericsNames(data: any): void {
    if (!data?.components?.schemas) return;

    const schemaMap = new Map<string, string>();
    const schemas = data.components.schemas;

    // 1. 建立映射并重命名 Schema Key
    Object.keys(schemas).forEach((key) => {
      let decodedKey = key;
      try {
        decodedKey = decodeURIComponent(key);
      } catch {
        // ignore
      }

      if (decodedKey.includes('«') || decodedKey.includes('»')) {
        // 1. 生成 Safe Name (用于 TS 类型名)
        // 替换策略：« -> _, » -> (空), , -> _
        const newKeyName = decodedKey
          .replace(/«/g, '_')
          .replace(/»/g, '')
          .replace(/,/g, '_')
          .replace(/\s/g, ''); // 去除空格

        const newRef = `#/components/schemas/${newKeyName}`;

        // 2. 建立映射 (无论是否重命名，都要建立映射)
        // 映射原始 key
        schemaMap.set(`#/components/schemas/${key}`, newRef);
        // 映射解码后的 key
        if (key !== decodedKey) {
          schemaMap.set(`#/components/schemas/${decodedKey}`, newRef);
        }
        // 映射编码后的 key
        const encodedKey = encodeURIComponent(key);
        if (encodedKey !== key) {
          schemaMap.set(`#/components/schemas/${encodedKey}`, newRef);
        }
        // 映射编码后的解码 key
        const encodedDecodedKey = encodeURIComponent(decodedKey);
        if (encodedDecodedKey !== key && encodedDecodedKey !== encodedKey) {
          schemaMap.set(`#/components/schemas/${encodedDecodedKey}`, newRef);
        }

        // 3. 注入泛型元数据 (x-apifox-generic)
        const match = decodedKey.match(/^(.+?)«(.+)»$/);
        let meta = undefined;
        if (match) {
          const base = match[1];
          const args = match[2];
          const generics = args?.split(',').map((s) => s.trim());
          meta = {
            baseType: base,
            generics: generics,
          };
        }

        // 4. 重命名 Schema
        if (!schemas[newKeyName]) {
          schemas[newKeyName] = schemas[key];
          delete schemas[key];
          if (meta) {
            schemas[newKeyName]['x-apifox-generic'] = meta;
          }
        } else {
          // 如果目标已存在，也尝试注入元数据
          if (meta && !schemas[newKeyName]['x-apifox-generic']) {
            schemas[newKeyName]['x-apifox-generic'] = meta;
          }
          // 删除旧的 key，避免重复和 invalid identifier
          if (key !== newKeyName) {
            delete schemas[key];
          }
        }
      }
    });

    if (schemaMap.size === 0) return;

    console.log(
      `[ApifoxAdapter] Renamed ${schemaMap.size} schemas with generic names (to underscore style).`,
    );

    // 2. 遍历整个对象更新引用
    const updateRefs = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;

      if (Array.isArray(obj)) {
        obj.forEach(updateRefs);
        return;
      }

      if (obj.$ref && typeof obj.$ref === 'string') {
        const ref = obj.$ref;
        // 尝试直接匹配
        if (schemaMap.has(ref)) {
          // console.log(`[ApifoxAdapter] Updating ref: ${ref} -> ${schemaMap.get(ref)}`);
          obj.$ref = schemaMap.get(ref);
        } else {
          // 尝试解码后匹配
          try {
            const decodedRef = decodeURIComponent(ref);
            if (schemaMap.has(decodedRef)) {
              // console.log(`[ApifoxAdapter] Updating ref (decoded): ${ref} -> ${schemaMap.get(decodedRef)}`);
              obj.$ref = schemaMap.get(decodedRef);
            }
          } catch {
            // ignore
          }
        }
      }

      Object.values(obj).forEach(updateRefs);
    };

    updateRefs(data);
  }
}
