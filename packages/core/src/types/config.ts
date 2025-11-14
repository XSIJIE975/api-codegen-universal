/**
 * 解析选项
 */
export interface ParseOptions {
  /** 输入源（本地文件、URL 或 JSON 对象） */
  source: string | URL | object
  /** 解析器类型（默认 'auto'） */
  parser?: 'openapi' | 'apifox' | 'auto'
  /** OpenAPI 特定选项 */
  openapi?: OpenAPIOptions
  /** Apifox 特定选项（预留） */
  apifox?: ApifoxOptions
}

/**
 * OpenAPI 解析选项
 */
export interface OpenAPIOptions {
  /** 公共前缀，用于路径分类，例如 '/api/v1' */
  commonPrefix?: string

  /** 泛型容器列表，例如 ['ApiSuccessResponse', 'PageResult'] */
  genericWrappers?: string[]

  /** 自定义 Schema 转换函数 */
  transform?: (schemaObject: any, metadata: any) => any

  /** 路径分类最大深度（默认 2） */
  maxClassificationDepth?: number

  /** 是否将 date-time 转换为 Date 类型（默认 false） */
  useDateType?: boolean

  /** 是否将 binary 转换为 Blob 类型（默认 false） */
  useBlobType?: boolean
}

/**
 * Apifox 解析选项（预留）
 */
export interface ApifoxOptions {
  /** API Token */
  token?: string
  /** 项目 ID */
  projectId?: string
  /** API 基础 URL */
  baseUrl?: string
}

/**
 * 配置文件类型
 */
export interface CodegenConfig {
  /** 输入源 */
  input: string | URL
  /** 解析器类型 */
  parser?: 'openapi' | 'apifox'
  /** OpenAPI 选项 */
  openapi?: OpenAPIOptions
  /** Apifox 选项 */
  apifox?: ApifoxOptions
  /** 输出配置 */
  output?: {
    /** 输出格式 */
    format?: 'json' | 'yaml'
    /** 输出路径 */
    path?: string
  }
}
