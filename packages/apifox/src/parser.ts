/**
 * Apifox 适配器
 * 负责从 Apifox API 获取 OpenAPI 数据，并进行兼容性修复和转换
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import SwaggerParser from '@apidevtools/swagger-parser';
import type { IAdapter, StandardOutput } from '@api-codegen-universal/core';
import {
  createAdapterLogger,
  createWarningsCollector,
} from '@api-codegen-universal/core';
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
  // Note: warnings collector is per-parse invocation.
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
    /**
     * 统一日志入口：
     * - 默认 logLevel='error'（不输出 warn/info/debug）
     * - 兼容性修复的“可预期告警”会以 warnings summary 形式汇总输出（Scheme A）
     */
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
    let openApiData = await this.fetchOpenApiData(source);

    // 2. 修复兼容性
    openApiData = this.fixOpenApiCompatibility(openApiData, warnings);

    // 3. 校验数据格式是否符合 OpenAPI 标准
    const shouldValidateOpenApi = options.validateOpenApi ?? true;
    if (shouldValidateOpenApi) {
      try {
        type SwaggerValidateInput = Parameters<
          typeof SwaggerParser.validate
        >[0];

        // swagger-parser 在校验过程中会修改输入对象，这里需要传入克隆副本。
        // 优先使用 structuredClone (Node 20+) 避免 JSON stringify 带来的 CPU/内存峰值。
        // 兜底：如果遇到不可克隆数据结构，再退回到 JSON 深拷贝。
        const rawForValidation = openApiData as SwaggerValidateInput;
        let validationInput: SwaggerValidateInput;
        try {
          validationInput = structuredClone(rawForValidation);
        } catch {
          validationInput = JSON.parse(
            JSON.stringify(rawForValidation),
          ) as SwaggerValidateInput;
        }

        await SwaggerParser.validate(validationInput);
      } catch (err: unknown) {
        if (err instanceof Error) {
          // 即使校验失败，也尝试继续处理，因为有些非关键错误可能不影响代码生成
          // 但这里选择抛出错误以保证数据质量，可视情况调整策略
          throw new Error(
            `Invalid OpenAPI data received from Apifox: ${err.message}`,
          );
        }
      }
    } else {
      // 这不是错误：调用方显式关闭了校验（通常用于性能或容忍非标文档）。
      warnings.inc('validationSkipped');
    }

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

    warnings.flush({
      durationMs: Date.now() - startAt,
      validation: shouldValidateOpenApi ? 'enabled' : 'skipped',
    });

    return result;
  }

  /**
   * 修复 Apifox 导出数据中不符合 OpenAPI 3.0/3.1 标准的地方
   * 以及处理 Apifox 特有的泛型命名风格
   *
   * @param data 原始 OpenAPI 数据
   * @returns 修复后的 OpenAPI 数据
   */
  /**
   * 修复 Apifox 导出数据中不符合 OpenAPI 标准的地方。
   *
   * 说明：这些修复属于“兼容性处理”，默认不会逐条输出 warn，
   * 只会在 parse 末尾通过 warnings summary 汇总输出。
   */
  private fixOpenApiCompatibility(
    data: any,
    warnings?: ReturnType<typeof createWarningsCollector>,
  ): any {
    if (!data) return data;

    // 修复泛型名称 (Java 风格的 « »)
    // 注意：必须在 fixBrokenRefs 之前执行，因为 fixBrokenRefs 可能会因为编码不匹配误删泛型引用
    this.fixGenericsNames(data, warnings);

    // 修复失效的引用
    this.fixBrokenRefs(data, warnings);

    // 修复 Apifox 导出中的 `type: null` (OpenAPI 3.0 不允许)
    // OpenAPI 3.0 需要使用 `nullable: true` 来表达可为 null。
    this.fixNullTypes(data, warnings);

    // 修复重复 operationId（openapi-typescript / redocly 会报错）
    // Apifox 导出的不同 path/method 有时会共用同一个 operationId。
    this.fixDuplicateOperationIds(data, warnings);

    // 1. 修复 Security Schemes 定义问题
    // type: http 的 scheme 不允许包含 'name' 和 'in' 字段
    if (data.components?.securitySchemes) {
      Object.values(data.components.securitySchemes).forEach((scheme: any) => {
        if (scheme.type === 'http') {
          // 删除非标字段
          Reflect.deleteProperty(scheme, 'name');
          Reflect.deleteProperty(scheme, 'in');
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
                    Reflect.deleteProperty(secItem, key);
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
   * 确保 OpenAPI 文档中所有 operationId 唯一。
   *
   * openapi-typescript 会对重复 operationId 报错：
   *   Every operation must have a unique `operationId`.
   *
   * 修复策略：
   * - 保留第一次出现的 operationId
   * - 对后续重复的 operationId 进行重命名：`${operationId}_${METHOD}_${PATH_SLUG}`
   * - 生成的新 operationId 再次检查，若仍冲突则追加递增序号
   */
  private fixDuplicateOperationIds(
    data: any,
    warnings?: ReturnType<typeof createWarningsCollector>,
  ): void {
    /**
     * openapi-typescript / redocly 会对重复 operationId 报错。
     * 这里做“确定性重命名”，并将变更记录到 warnings summary。
     */
    const paths = data?.paths;
    if (!paths || typeof paths !== 'object') return;

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

    const slugifyPath = (p: string) => {
      // /api/v1/roles/batch-delete -> api_v1_roles_batch_delete
      return p
        .replace(/^\//, '')
        .replace(/\{[^}]+\}/g, 'param')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60);
    };

    for (const [pathKey, pathItem] of Object.entries(paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      const item: any = pathItem;

      for (const method of methods) {
        const op = item[method];
        if (!op || typeof op !== 'object') continue;

        const operationId = op.operationId;
        if (!operationId || typeof operationId !== 'string') continue;

        if (!seen.has(operationId)) {
          seen.add(operationId);
          continue;
        }

        const base = `${operationId}_${method.toUpperCase()}_${slugifyPath(
          String(pathKey),
        )}`;
        let next = base;
        let i = 2;
        while (seen.has(next)) {
          next = `${base}_${i}`;
          i += 1;
        }

        op.operationId = next;
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
   * 将 schema 中不合法的 `type: "null"` (或 type 包含 null) 修复为 OpenAPI 3.0 兼容形式。
   *
   * Apifox 在导出 OpenAPI 3.0.x 时，有时会生成：
   *   { allOf: [{ $ref: ... }], type: "null" }
   * 这会导致 swagger-parser 校验失败。
   *
   * 修复策略：
   * - 当检测到 `type === "null"`：删除 type，并设置 `nullable: true`
   * - 当检测到 `type` 是数组且包含 "null"：移除 "null"，并设置 `nullable: true`
   */
  private fixNullTypes(
    data: any,
    warnings?: ReturnType<typeof createWarningsCollector>,
  ): void {
    /**
     * Apifox 在导出 OpenAPI 3.0.x 时可能出现：type: null 或 type 数组包含 null。
     * 该情况不符合 3.0 规范，需要转为 nullable 语义。
     */
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;

      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }

      if ('type' in node) {
        // Case 1: type: 'null'
        if (node.type === 'null') {
          Reflect.deleteProperty(node, 'type');
          node.nullable = true;
          warnings?.inc('fixedNullTypes');
        }

        // Case 2: type: ['object', 'null'] (more JSON-schema like)
        if (Array.isArray(node.type) && node.type.includes('null')) {
          node.type = node.type.filter((t: unknown) => t !== 'null');
          node.nullable = true;

          warnings?.inc('fixedNullTypes');

          if (node.type.length === 1) {
            node.type = node.type[0];
          } else if (node.type.length === 0) {
            Reflect.deleteProperty(node, 'type');
          }
        }
      }

      Object.values(node).forEach(visit);
    };

    visit(data);
  }

  /**
   * 请求 Apifox 开放 API 获取 OpenAPI 数据
   *
   * @param config Apifox 配置
   * @returns OpenAPI JSON 数据
   */
  protected async fetchOpenApiData(config: ApifoxConfig): Promise<unknown> {
    /**
     * 注意：这里不主动记录网络错误日志，直接 throw。
     * - 避免适配器默认“重复输出”（业务侧通常会 catch 并记录）
     * - 如需记录，可通过调用方的 try/catch + logger 注入实现
     */
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
  }

  /**
   * 递归检查并修复失效的引用 ($ref)
   * 如果引用指向的路径不存在，则删除该引用并回退到普通对象
   *
   * @param data OpenAPI 数据
   */
  private fixBrokenRefs(
    data: any,
    warnings?: ReturnType<typeof createWarningsCollector>,
  ): void {
    /**
     * 递归修复失效引用：
     * - 当 $ref 指向的路径不存在：删除 $ref 并回退为 object
     * - 将变更记录到 warnings summary（带 sample ref）
     */
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
          warnings?.addBrokenRef(decodedRef);
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
  private fixGenericsNames(
    data: any,
    warnings?: ReturnType<typeof createWarningsCollector>,
  ): void {
    /**
     * 修复 Apifox 导出中 Java 风格泛型命名（« »）。
     *
     * 目标：
     * - schema key 变为可用的 TS identifier（否则 openapi-typescript 可能生成 unknown）
     * - 更新整个文档中的所有 $ref
     * - 注入 x-apifox-generic 元数据，供 openapi adapter 侧识别泛型信息
     */
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

        warnings?.addRenamedSchema(decodedKey, newKeyName);
      }
    });

    if (schemaMap.size === 0) return;

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
          obj.$ref = schemaMap.get(ref);
        } else {
          // 尝试解码后匹配
          try {
            const decodedRef = decodeURIComponent(ref);
            if (schemaMap.has(decodedRef)) {
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
