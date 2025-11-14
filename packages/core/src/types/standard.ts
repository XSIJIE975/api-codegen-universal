/**
 * 标准输出格式
 * 所有适配器都必须输出这种格式
 */
export interface StandardOutput {
  /** 所有的 Schema 模型定义 */
  schemas: Record<string, SchemaDefinition>
  /** 所有的 API 接口定义 */
  apis: ApiDefinition[]
  /** 元数据信息 */
  metadata: Metadata
}

/**
 * Schema 定义
 */
export interface SchemaDefinition {
  /** Schema 名称 */
  name: string
  /** 描述 */
  description?: string
  /** 类型 */
  type: 'object' | 'array' | 'enum' | 'primitive' | 'generic'

  // object 类型的属性
  /** 属性定义 */
  properties?: Record<string, PropertyDefinition>
  /** 必填字段 */
  required?: string[]

  // generic 类型
  /** 是否为泛型容器 */
  isGeneric?: boolean
  /** 泛型参数名 */
  genericParam?: string
  /** 基础类型（对于泛型） */
  baseType?: string

  // enum 类型
  /** 枚举值 */
  enum?: string[] | number[]

  // array 类型
  /** 数组元素类型 */
  items?: SchemaReference

  // 其他
  /** 额外属性 */
  additionalProperties?: SchemaReference
  /** 可为空 */
  nullable?: boolean
  /** 默认值 */
  default?: any
  /** 示例值 */
  example?: any
}

/**
 * 属性定义
 */
export interface PropertyDefinition {
  /** 属性名 */
  name: string
  /** 类型 */
  type: string
  /** 描述 */
  description?: string
  /** 是否必填 */
  required: boolean
  /** 可为空 */
  nullable?: boolean
  /** 默认值 */
  default?: any
  /** 示例值 */
  example?: any
  /** 格式 */
  format?: string
  /** 正则模式 */
  pattern?: string
  /** 最小长度 */
  minLength?: number
  /** 最大长度 */
  maxLength?: number
  /** 最小值 */
  minimum?: number
  /** 最大值 */
  maximum?: number
  /** 枚举值 */
  enum?: string[] | number[]
  /** 引用的 Schema */
  ref?: string
}

/**
 * Schema 引用
 */
export interface SchemaReference {
  /** 引用类型 */
  type: 'ref' | 'inline'
  /** 引用路径 */
  ref?: string
  /** 内联 Schema */
  schema?: SchemaDefinition
}

/**
 * API 定义
 */
export interface ApiDefinition {
  /** API 路径 */
  path: string
  /** HTTP 方法 */
  method: HttpMethod
  /** 操作 ID */
  operationId: string
  /** 摘要 */
  summary?: string
  /** 描述 */
  description?: string
  /** 标签 */
  tags?: string[]
  /** 是否已废弃 */
  deprecated?: boolean

  // 请求
  /** 参数定义 */
  parameters?: ParameterDefinition[]
  /** 请求体定义 */
  requestBody?: RequestBodyDefinition

  // 响应
  /** 响应定义 */
  responses: Record<string, ResponseDefinition>

  // 分类信息（用于代码生成）
  /** 分类信息 */
  category: CategoryInfo
}

/**
 * HTTP 方法
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/**
 * 参数定义
 */
export interface ParameterDefinition {
  /** 参数名 */
  name: string
  /** 参数位置 */
  in: 'query' | 'path' | 'header' | 'cookie'
  /** 是否必填 */
  required: boolean
  /** Schema 引用 */
  schema: SchemaReference
  /** 描述 */
  description?: string
  /** 是否已废弃 */
  deprecated?: boolean
  /** 示例值 */
  example?: any
}

/**
 * 请求体定义
 */
export interface RequestBodyDefinition {
  /** 是否必填 */
  required: boolean
  /** 描述 */
  description?: string
  /** 内容类型 */
  content: Record<string, MediaTypeDefinition>
}

/**
 * 媒体类型定义
 */
export interface MediaTypeDefinition {
  /** Schema 引用 */
  schema: SchemaReference
  /** 示例 */
  example?: any
  /** 多个示例 */
  examples?: Record<string, ExampleDefinition>
}

/**
 * 示例定义
 */
export interface ExampleDefinition {
  /** 摘要 */
  summary?: string
  /** 描述 */
  description?: string
  /** 值 */
  value: any
}

/**
 * 响应定义
 */
export interface ResponseDefinition {
  /** 描述 */
  description: string
  /** 内容类型 */
  content?: Record<string, MediaTypeDefinition>
  /** 响应头 */
  headers?: Record<string, HeaderDefinition>
}

/**
 * 响应头定义
 */
export interface HeaderDefinition {
  /** 描述 */
  description?: string
  /** Schema 引用 */
  schema: SchemaReference
  /** 是否必填 */
  required?: boolean
  /** 是否已废弃 */
  deprecated?: boolean
}

/**
 * 分类信息
 */
export interface CategoryInfo {
  /** 主分类（第一级路径） */
  primary: string
  /** 次级分类（第二级路径） */
  secondary?: string
  /** 分类深度 */
  depth: number
  /** 是否为未分类 */
  isUnclassified: boolean
  /** 建议的文件路径 */
  filePath: string
}

/**
 * 元数据
 */
export interface Metadata {
  /** OpenAPI 版本 */
  version: string
  /** API 标题 */
  title?: string
  /** API 描述 */
  description?: string
  /** 基础 URL */
  baseUrl?: string
  /** 公共前缀 */
  commonPrefix?: string
  /** 生成时间 */
  generatedAt: string
  /** 服务器列表 */
  servers?: ServerDefinition[]
}

/**
 * 服务器定义
 */
export interface ServerDefinition {
  /** URL */
  url: string
  /** 描述 */
  description?: string
  /** 变量 */
  variables?: Record<string, ServerVariableDefinition>
}

/**
 * 服务器变量定义
 */
export interface ServerVariableDefinition {
  /** 默认值 */
  default: string
  /** 枚举值 */
  enum?: string[]
  /** 描述 */
  description?: string
}
