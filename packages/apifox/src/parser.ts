/**
 * Apifox 适配器
 * 负责从 Apifox API 获取 OpenAPI 数据，并进行兼容性修复和转换
 */

import { createHash } from 'node:crypto';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { IAdapter, StandardOutput } from '@api-codegen-universal/core';
import {
  createAdapterLogger,
  createWarningsCollector,
} from '@api-codegen-universal/core';
import {
  InputSource,
  OpenAPIAdapter,
  type ApifoxGenericMeta,
} from '@api-codegen-universal/openapi';
import { normalizeGenericName } from '@api-codegen-universal/openapi';
import type {
  ApifoxAdapterOptions,
  ApifoxConfig,
  ApifoxExportToOpenAPIOptions,
} from './types';

// ===================================================================================
// 递归 OpenAPI 原始数据类型（替代 any）
// ===================================================================================

/**
 * OpenAPI 文档的递归结构类型。
 * 用于在兼容性修复阶段安全地遍历和修改文档，避免使用 any。
 */
export type OpenAPIRaw =
  | { [key: string]: OpenAPIRaw }
  | OpenAPIRaw[]
  | string
  | number
  | boolean
  | null;

/**
 * 带索引签名的 OpenAPI 对象（用于遍历时按 key 访问）
 */
type OpenAPIRawObject = { [key: string]: OpenAPIRaw };

/**
 * Apifox 适配器类
 * 实现 IAdapter 接口，用于处理 Apifox 项目数据的导入和转换
 */
export class ApifoxAdapter
  implements IAdapter<ApifoxAdapterOptions, ApifoxConfig>
{
  /**
   * 验证配置有效性
   */
  // eslint-disable-next-line @typescript-eslint/require-await
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
    const startAt = Date.now();
    const logger = createAdapterLogger(options, {
      adapter: 'apifox',
      source: `Apifox Project ${source.projectId}`,
    });
    const warnings = createWarningsCollector({
      logger,
      code: 'APIFOX_WARNINGS_SUMMARY',
    });

    // 1. 获取数据
    let openApiData = await this.fetchOpenApiData(
      source,
      options.fetchTimeoutMs,
    );

    // 2. 修复兼容性
    openApiData = this.fixOpenApiCompatibility(openApiData, warnings);

    // 3. 校验数据格式
    const shouldValidateOpenApi = options.validateOpenApi ?? true;
    if (shouldValidateOpenApi) {
      try {
        type SwaggerValidateInput = Parameters<
          typeof SwaggerParser.validate
        >[0];

        // swagger-parser 会修改输入对象，使用 structuredClone 避免影响原数据
        // Apifox 返回的数据为纯 JSON（无循环引用 / 函数 / DOM 节点），structuredClone 必成功
        const rawForValidation = openApiData as SwaggerValidateInput;
        const validationInput = structuredClone(rawForValidation);

        await SwaggerParser.validate(validationInput);
      } catch (err: unknown) {
        if (err instanceof Error) {
          throw new Error(
            `Invalid OpenAPI data received from Apifox: ${err.message}`,
          );
        }
        throw new Error(
          `Invalid OpenAPI data received from Apifox: ${String(err)}`,
        );
      }
    } else {
      warnings.inc('validationSkipped');
    }

    // 4. 转换为标准格式
    // 透传 warnings collector：OpenAPI 适配器内部的自动修复
    // （如 operationId 归一化消歧）会记录到同一份 warnings 汇总中
    const openApiAdapter = new OpenAPIAdapter();
    const result = await openApiAdapter.parse(openApiData as InputSource, {
      ...options,
      warnings,
    });

    // 补充元数据
    if (result.metadata) {
      result.metadata.source = `Apifox Project ${source.projectId}`;
      result.metadata.generatedAt = new Date().toISOString();
    }

    warnings.flush({
      durationMs: Date.now() - startAt,
      validation: shouldValidateOpenApi ? 'enabled' : 'skipped',
    });

    return result;
  }

  /**
   * 修复 Apifox 导出数据中不符合 OpenAPI 标准的地方。
   * 兼容性修复不逐条输出 warn，仅在 parse 末尾通过 warnings summary 汇总输出。
   */
  private fixOpenApiCompatibility(
    data: OpenAPIRaw,
    warnings?: ReturnType<typeof createWarningsCollector>,
  ): OpenAPIRaw {
    if (!data || typeof data !== 'object') return data;

    // 修复泛型名称（必须在 fixBrokenRefs 之前）
    this.fixGenericsNames(data, warnings);

    // 修复失效的引用
    this.fixBrokenRefs(data, warnings);

    // 修复 type: null
    this.fixNullTypes(data, warnings);

    // 修复重复 operationId
    this.fixDuplicateOperationIds(data, warnings);

    // 修复 Security Schemes 定义问题
    this.fixSecuritySchemes(data);

    // 修复 Paths 中的 Security 扩展字段
    this.fixPathsSecurityExtensions(data);

    return data;
  }

  /**
   * 修复 Security Schemes 中 type: http 的 scheme 不允许包含 'name' 和 'in' 字段
   */
  private fixSecuritySchemes(data: OpenAPIRaw): void {
    if (!isObject(data)) return;
    const components = data.components;
    if (!isObject(components)) return;
    const securitySchemes = components.securitySchemes;
    if (!isObject(securitySchemes)) return;

    for (const scheme of Object.values(securitySchemes)) {
      if (isObject(scheme) && scheme.type === 'http') {
        delete (scheme as OpenAPIRawObject).name;
        delete (scheme as OpenAPIRawObject).in;
      }
    }
  }

  /**
   * 修复 Paths 中的 Security 扩展字段（以 x- 开头的 key）
   */
  private fixPathsSecurityExtensions(data: OpenAPIRaw): void {
    if (!isObject(data)) return;
    const paths = data.paths;
    if (!isObject(paths)) return;

    const httpMethods = [
      'get',
      'post',
      'put',
      'delete',
      'patch',
      'options',
      'head',
      'trace',
    ];

    for (const pathItem of Object.values(paths)) {
      if (!isObject(pathItem)) continue;

      for (const method of httpMethods) {
        const op = (pathItem as OpenAPIRawObject)[method];
        if (!isObject(op)) continue;
        const security = op.security;
        if (!Array.isArray(security)) continue;

        for (const secItem of security) {
          if (!isObject(secItem)) continue;
          for (const key of Object.keys(secItem as OpenAPIRawObject)) {
            if (key.toLowerCase().startsWith('x-')) {
              delete (secItem as OpenAPIRawObject)[key];
            }
          }
        }
      }
    }
  }

  /**
   * 确保 operationId 唯一。重复的进行重命名。
   */
  private fixDuplicateOperationIds(
    data: OpenAPIRaw,
    warnings?: ReturnType<typeof createWarningsCollector>,
  ): void {
    if (!isObject(data)) return;
    const paths = data.paths;
    if (!isObject(paths)) return;

    const methods = [
      'get',
      'post',
      'put',
      'delete',
      'patch',
      'options',
      'head',
      'trace',
    ];
    const seen = new Set<string>();

    const slugifyPath = (p: string): string =>
      p
        .replace(/^\//, '')
        .replace(/\{[^}]+\}/g, 'param')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60);

    for (const [pathKey, pathItem] of Object.entries(paths)) {
      if (!isObject(pathItem)) continue;

      for (const method of methods) {
        const op = (pathItem as OpenAPIRawObject)[method];
        if (!isObject(op)) continue;

        const operationId = op.operationId;
        if (typeof operationId !== 'string') continue;

        if (!seen.has(operationId)) {
          seen.add(operationId);
          continue;
        }

        const base = `${operationId}_${method.toUpperCase()}_${slugifyPath(String(pathKey))}`;
        let next = base;
        let i = 2;
        while (seen.has(next)) {
          next = `${base}_${i}`;
          i += 1;
        }

        (op as OpenAPIRawObject).operationId = next;
        seen.add(next);

        warnings?.addDuplicateOperationId({
          from: operationId,
          to: next,
          path: String(pathKey),
          method,
        });
      }
    }
  }

  /**
   * 修复 type: "null" 或 type 数组包含 null
   */
  private fixNullTypes(
    data: OpenAPIRaw,
    warnings?: ReturnType<typeof createWarningsCollector>,
  ): void {
    const visit = (node: OpenAPIRaw): void => {
      if (!node || typeof node !== 'object') return;

      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }

      const obj = node as OpenAPIRawObject;

      if ('type' in obj) {
        // Case 1: type: 'null'
        if (obj.type === 'null') {
          delete obj.type;
          obj.nullable = true;
          warnings?.inc('fixedNullTypes');
        }

        // Case 2: type: ['object', 'null']
        if (
          Array.isArray(obj.type) &&
          obj.type.includes('null' as OpenAPIRaw)
        ) {
          obj.type = obj.type.filter((t) => t !== 'null') as OpenAPIRaw;
          obj.nullable = true;
          warnings?.inc('fixedNullTypes');

          if (Array.isArray(obj.type)) {
            if (obj.type.length === 1) {
              obj.type = obj.type[0] as OpenAPIRaw;
            } else if (obj.type.length === 0) {
              delete obj.type;
            }
          }
        }
      }

      Object.values(obj).forEach(visit);
    };

    visit(data);
  }

  /**
   * 请求 Apifox 开放 API 获取 OpenAPI 数据
   */
  protected async fetchOpenApiData(
    config: ApifoxConfig,
    fetchTimeoutMs?: number,
  ): Promise<OpenAPIRaw> {
    const baseUrl = 'https://api.apifox.com/v1';
    const url = `${baseUrl}/projects/${config.projectId}/export-openapi`;

    const requestBody: ApifoxExportToOpenAPIOptions = {
      exportFormat: 'JSON',
      oasVersion: '3.0',
      scope: { type: 'ALL' },
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

    // 验证 timeoutMs 是否为有效的正数
    const timeoutMs = fetchTimeoutMs ?? 30_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error(
        `fetchTimeoutMs must be a positive number, got ${timeoutMs}`,
      );
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
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

    return (await response.json()) as OpenAPIRaw;
  }

  /**
   * 递归修复失效的引用 ($ref)
   */
  private fixBrokenRefs(
    data: OpenAPIRaw,
    warnings?: ReturnType<typeof createWarningsCollector>,
  ): void {
    const findAndFix = (obj: OpenAPIRaw): void => {
      if (!obj || typeof obj !== 'object') return;

      if (Array.isArray(obj)) {
        obj.forEach(findAndFix);
        return;
      }

      const objAsRecord = obj as OpenAPIRawObject;

      if (
        typeof objAsRecord.$ref === 'string' &&
        objAsRecord.$ref.startsWith('#/')
      ) {
        const ref = objAsRecord.$ref;
        if (!this.hasRef(data, ref)) {
          const decodedRef = safeDecodeURIComponent(ref);
          warnings?.addBrokenRef(decodedRef);
          delete objAsRecord.$ref;
          objAsRecord.type = 'object';
          objAsRecord.description = `(Fixed broken reference: ${decodedRef})`;
        }
      }

      Object.values(objAsRecord).forEach(findAndFix);
    };

    findAndFix(data);
  }

  /**
   * 检查引用是否存在
   */
  private hasRef(root: OpenAPIRaw, ref: string): boolean {
    try {
      const path = ref.substring(2).split('/');
      let current: OpenAPIRaw = root;
      for (const segment of path) {
        const decodedSegment = segment.replace(/~1/g, '/').replace(/~0/g, '~');

        if (current && typeof current === 'object' && !Array.isArray(current)) {
          const obj = current as OpenAPIRawObject;
          if (decodedSegment in obj) {
            current = obj[decodedSegment] as OpenAPIRaw;
            continue;
          }
          const urlDecoded = safeDecodeURIComponent(decodedSegment);
          if (urlDecoded in obj) {
            current = obj[urlDecoded] as OpenAPIRaw;
            continue;
          }
          return false;
        }
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 修复泛型名称 (Java 风格的 « »)
   */
  private fixGenericsNames(
    data: OpenAPIRaw,
    warnings?: ReturnType<typeof createWarningsCollector>,
  ): void {
    if (!isObject(data)) return;
    const components = data.components;
    if (!isObject(components)) return;
    const schemas = components.schemas;
    if (!isObject(schemas)) return;

    const schemasObj = schemas as OpenAPIRawObject;
    const schemaMap = new Map<string, string>();

    // 1. 建立映射并重命名 Schema Key
    const generatedNames = new Set<string>();
    // 预先收集所有已存在的 schema 名称
    for (const existingKey of Object.keys(schemasObj)) {
      generatedNames.add(existingKey);
    }

    for (const key of Object.keys(schemasObj)) {
      const decodedKey = safeDecodeURIComponent(key);

      if (!decodedKey.includes('«') && !decodedKey.includes('»')) continue;

      let newKeyName = normalizeGenericName(decodedKey);

      // 如果目标名称已存在，生成消歧义的名称
      // 优先使用哈希，如果哈希冲突则追加计数器
      if (generatedNames.has(newKeyName) && newKeyName !== key) {
        const hash = createHash('sha256')
          .update(key)
          .digest('hex')
          .substring(0, 16); // 使用 16 位哈希（64 位）降低冲突概率
        newKeyName = `${newKeyName}_${hash}`;

        // 如果仍然冲突，追加计数器
        let counter = 1;
        while (generatedNames.has(newKeyName)) {
          newKeyName = `${newKeyName}_${counter}`;
          counter++;
        }
      }

      const newRef = `#/components/schemas/${newKeyName}`;

      // 建立映射（原始、解码、编码 variants）
      schemaMap.set(`#/components/schemas/${key}`, newRef);
      if (key !== decodedKey) {
        schemaMap.set(`#/components/schemas/${decodedKey}`, newRef);
      }
      const encodedKey = encodeURIComponent(key);
      if (encodedKey !== key) {
        schemaMap.set(`#/components/schemas/${encodedKey}`, newRef);
      }
      const encodedDecodedKey = encodeURIComponent(decodedKey);
      if (encodedDecodedKey !== key && encodedDecodedKey !== encodedKey) {
        schemaMap.set(`#/components/schemas/${encodedDecodedKey}`, newRef);
      }

      // 注入泛型元数据
      const match = decodedKey.match(/^(.+?)«(.+)»$/);
      let meta: ApifoxGenericMeta | undefined;
      if (match && match[1] && match[2]) {
        meta = {
          baseType: match[1],
          generics: match[2].split(',').map((s) => s.trim()),
        };
      }

      const currentSchema = schemasObj[key];
      if (currentSchema) {
        // 安全地移动 schema（不会覆盖已存在的同名 schema）
        schemasObj[newKeyName] = currentSchema;
        delete schemasObj[key];
        // 更新生成的名称集合（删除旧名称，添加新名称）
        generatedNames.delete(key);
        generatedNames.add(newKeyName);
        if (meta && isObject(schemasObj[newKeyName])) {
          (schemasObj[newKeyName] as OpenAPIRawObject)['x-apifox-generic'] =
            meta as unknown as OpenAPIRaw;
        }
      }

      warnings?.addRenamedSchema(decodedKey, newKeyName);
    }

    if (schemaMap.size === 0) return;

    // 2. 遍历整个对象更新引用
    const updateRefs = (obj: OpenAPIRaw): void => {
      if (!obj || typeof obj !== 'object') return;

      if (Array.isArray(obj)) {
        obj.forEach(updateRefs);
        return;
      }

      const objAsRecord = obj as OpenAPIRawObject;
      if (typeof objAsRecord.$ref === 'string') {
        const ref = objAsRecord.$ref;
        if (schemaMap.has(ref)) {
          objAsRecord.$ref = schemaMap.get(ref) as OpenAPIRaw;
        } else {
          const decodedRef = safeDecodeURIComponent(ref);
          if (schemaMap.has(decodedRef)) {
            objAsRecord.$ref = schemaMap.get(decodedRef) as OpenAPIRaw;
          }
        }
      }

      Object.values(objAsRecord).forEach(updateRefs);
    };

    updateRefs(data);
  }
}

// ===================================================================================
// 辅助函数
// ===================================================================================

function isObject(value: unknown): value is OpenAPIRawObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
