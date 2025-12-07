import { Readable } from 'node:stream';
import type { OpenAPI3, OpenAPITSOptions } from 'openapi-typescript';
import type { AdapterOptions, NamingStyle } from '@api-codegen-universal/core';

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

  /** 自定义类型转换函数 */
  transform?: OpenAPITSOptions['transform'];
}

/**
 * Apifox 解析选项(预留)
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
 */
export interface TransformMetadata {
  /** Schema 名称 */
  name?: string;
  /** 路径信息 */
  path?: string;
  /** 上下文信息 */
  context?: unknown;
}
