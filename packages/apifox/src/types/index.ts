import type { OpenAPIOptions } from '@api-codegen-universal/openapi';

/**
 * Apifox 适配器配置
 * 用于配置 Apifox 项目的连接信息和导出选项
 */
export interface ApifoxConfig {
  /**
   * Apifox 项目 ID
   * 可以在 Apifox 项目设置中找到
   */
  projectId: string | number;

  /**
   * Apifox 访问令牌 (Bearer Token)
   * 用于调用 Apifox 开放 API
   */
  token: string;

  /**
   * Apifox API 版本
   * 默认为 '2024-03-28'
   */
  apiVersion?: ApiFoxVersion;

  /**
   * 导出选项 (可选)
   * 如果不传，默认导出全部接口，OpenAPI 3.0 格式
   */
  exportOptions?: Partial<ApifoxExportToOpenAPIOptions>;
}

/** Apifox API 版本类型 */
export type ApiFoxVersion = '2024-03-28' | '2025-09-01';

/**
 * 适配器选项
 * 在 OpenAPIOptions 的基础上增加 ApifoxAdapter 专属行为控制。
 */
export interface ApifoxAdapterOptions extends OpenAPIOptions {
  /**
   * 是否对修复后的 OpenAPI 文档进行 swagger-parser 校验。
   *
   * 默认开启：true
   * 关闭后可提升性能，但可能让部分非标数据进入后续处理。
   */
  validateOpenApi?: boolean;
}

/**
 * Apifox 导出 OpenAPI/Swagger 格式数据选项
 * 对应 Apifox 开放 API 的请求体结构
 */
export interface ApifoxExportToOpenAPIOptions {
  /** 指定要导出的分支ID，默认导出主分支 */
  branchId?: number;
  /** 指定要导出的环境的 ID */
  environmentIds?: number[];
  /** 指定导出的 OpenAPI 文件的格式 */
  exportFormat?: ExportFormat;
  /** 指定要导出的模块ID，默认导出默认模块 */
  moduleId?: number;
  /** 指定用于导出的 OpenAPI 规范的版本 */
  oasVersion?: OasVersion;
  /** 导出选项 */
  options?: Options;
  /** 导出范围 */
  scope: Scope;
}

/** 指定导出的 OpenAPI 文件的格式，可以有值如 "JSON" 或 "YAML" */
export type ExportFormat = 'JSON' | 'YAML';

/**
 * 指定用于导出的 OpenAPI 规范的版本，可以有值如 "2.0"，"3.0" 或 "3.1"。
 */
export type OasVersion = '3.0' | '3.1' | '2.0';

/** 导出详细选项 */
export interface Options {
  /** 指定是否在标签字段中包含接口的目录名称 */
  addFoldersToTags?: boolean;
  /** 指定是否包含 Apifox 的 OpenAPI 规范扩展字段`x-apifox` */
  includeApifoxExtensionProperties?: boolean;
}

/**
 * 导出范围配置
 * 支持导出全部、指定接口、指定标签或指定目录
 */
export interface Scope {
  /** 排除掉包含指定标签的内容 */
  excludedByTags?: string[];
  /** 指定导出的范围类型 */
  type: ScopeType;
  /** 指定要导出的选定接口的 ID */
  selectedEndpointIds?: number[];
  /** 指定要包含在导出范围内的标签。 */
  selectedTags?: string[];
  /** 指定要导出的选定文件夹的 ID */
  selectedFolderIds?: number[];
}

/** 指定导出的范围类型 */
export type ScopeType =
  | 'ALL'
  | 'SELECTED_ENDPOINTS'
  | 'SELECTED_TAGS'
  | 'SELECTED_FOLDERS';
