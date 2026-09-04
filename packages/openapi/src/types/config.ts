import { Readable } from 'node:stream';
import type { OpenAPI3, OpenAPITSOptions } from 'openapi-typescript';
import type {
  AdapterOptions,
  NamingStyle,
  WarningsCollector,
} from '@api-codegen-universal/core';

/**
 * 简化的 OpenAPI 文档结构接口，用于元数据提取
 */
export interface OpenAPIDocument {
  info?: {
    title?: string;
    description?: string;
    version?: string;
    [key: string]: unknown;
  };
  servers?: Array<{
    url: string;
    description?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Apifox 注入的泛型元数据。
 *
 * 结构示例：
 * - 原始 schema key：`PageVO«ApplyListVO»`
 * - 注入的元数据：`{ baseType: 'PageVO', generics: ['ApplyListVO'] }`
 *
 * 该元数据由 ApifoxAdapter.fixGenericsNames 注入，
 * 由 OpenAPIAdapter.parse 读取并用于泛型基类合成。
 */
export interface ApifoxGenericMeta {
  baseType: string;
  generics: string[];
}

/**
 * 输入源类型
 */
export type InputSource = string | URL | OpenAPI3 | Buffer | Readable;

/**
 * 接口导出模式
 */
export type InterfaceExportMode = 'export' | 'declare';

/**
 * API 路径分类配置
 */
export interface PathClassificationOptions {
  /** 输出目录前缀(默认 'api') */
  outputPrefix?: string;

  /** API 路径公共前缀(用于路径分类,如 '/api/v1') */
  commonPrefix?: string;

  /** 路径分类最大深度(默认 2) */
  maxDepth?: number;
}

/**
 * 输出控制配置
 */
export interface OutputControlOptions {
  /** 是否生成 schemas 字段(默认 true) */
  schemas?: boolean;

  /** 是否生成 interfaces 字段(默认 true) */
  interfaces?: boolean;

  /** 是否生成 apis 字段(默认 true) */
  apis?: boolean;
}

/**
 * 代码生成配置
 */
export interface CodeGenerationOptions {
  /** 参数接口命名风格(默认 'PascalCase') */
  parameterNamingStyle?: NamingStyle;

  /** 接口导出模式(默认 'export') */
  interfaceExportMode?: InterfaceExportMode;

  /** 输出控制 */
  output?: OutputControlOptions;
}

/**
 * OpenAPI 解析选项
 */
export interface OpenAPIOptions extends AdapterOptions {
  /** API 路径分类配置 */
  pathClassification?: PathClassificationOptions;

  /** 代码生成配置 */
  codeGeneration?: CodeGenerationOptions;

  /**
   * warnings 收集器（可选）。
   * 传入后，适配器内部的自动修复（如 operationId 冲突消歧）会记录到该收集器，
   * 由调用方（如 ApifoxAdapter）统一汇总输出。不传则静默处理。
   */
  warnings?: WarningsCollector;

  /** 自定义类型转换函数 */
  transform?: OpenAPITSOptions['transform'];

  /**
   * 远程 URL 拉取超时时间（毫秒）
   * @default 30000
   */
  fetchTimeoutMs?: number;

  /**
   * 调试选项
   */
  debug?: {
    /**
     * 跳过元数据敏感信息清理
     * 默认情况下，metadata.options 会经过 sanitizeOptions 清理敏感字段（如 token、apiKey 等）。
     * 设置为 true 可保留完整选项，便于调试。
     * @default false
     */
    skipMetadataSanitization?: boolean;
  };
}

/**
 * Apifox 解析选项(预留)
 * @deprecated 请使用 ApifoxAdapterOptions（来自 @api-codegen-universal/apifox）代替
 */
export interface ApifoxOptions {
  /** API Token */
  token?: string;
  /** 项目 ID */
  projectId?: string;
  /** 其他选项 */
  [key: string]: unknown;
}

/**
 * 转换元数据
 * @deprecated 此类型未被使用，将在未来版本移除
 */
export interface TransformMetadata {
  /** Schema 名称 */
  name?: string;
  /** 路径信息 */
  path?: string;
  /** 上下文信息 */
  context?: unknown;
}
