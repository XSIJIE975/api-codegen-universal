/**
 * 配置类型定义
 */

/**
 * 解析选项
 */
export interface ParseOptions {
  /** 输入源(文件路径/URL/对象) */
  source: InputSource
  /** 解析器类型 */
  parser?: ParserType
  /** OpenAPI 特定选项 */
  openapi?: OpenAPIOptions
  /** Apifox 特定选项(预留) */
  apifox?: ApifoxOptions
}

/**
 * 输入源类型
 */
export type InputSource = string | URL | object

/**
 * 解析器类型
 */
export type ParserType = 'openapi' | 'apifox' | 'auto'

/**
 * 命名风格
 */
export type NamingStyle = 'PascalCase' | 'camelCase' | 'snake_case' | 'kebab-case'

/**
 * OpenAPI 解析选项
 */
export interface OpenAPIOptions {
  /** 公共路径前缀(用于路径分类,如 '/api/v1') */
  commonPrefix?: string
  
  /** 泛型容器列表(用于检测泛型,如 ['ApiSuccessResponse', 'PageResult']) */
  genericWrappers?: string[]
  
  /** 路径分类最大深度(默认2) */
  maxClassificationDepth?: number
  
  /** 自定义类型转换函数 */
  transform?: TransformFunction
  
  /** 是否解析 JSON Schema(默认 true) */
  parseSchemas?: boolean
  
  /** 是否解析 API 路径(默认 true) */
  parsePaths?: boolean
  
  /** 自动生成参数接口的命名风格(默认 'PascalCase') */
  parameterNamingStyle?: NamingStyle
}

/**
 * Apifox 解析选项(预留)
 */
export interface ApifoxOptions {
  /** API Token */
  token?: string
  /** 项目 ID */
  projectId?: string
  /** 其他选项 */
  [key: string]: any
}

/**
 * 自定义转换函数
 * 用于在解析过程中自定义类型转换逻辑
 */
export type TransformFunction = (
  schemaObject: any,
  metadata: TransformMetadata
) => any

/**
 * 转换元数据
 */
export interface TransformMetadata {
  /** Schema 名称 */
  name?: string
  /** 路径信息 */
  path?: string
  /** 上下文信息 */
  context?: any
}
