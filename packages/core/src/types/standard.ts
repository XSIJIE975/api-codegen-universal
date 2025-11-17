/**
 * 标准输出数据结构
 * 所有适配器都必须输出这种统一的格式
 */

/**
 * 标准输出格式 - 核心导出
 */
export interface StandardOutput {
  /** Schema 定义集合 */
  schemas: Record<string, SchemaDefinition>;
  /** TypeScript 接口代码字符串集合 */
  interfaces: Record<string, string>;
  /** API 接口定义列表 */
  apis: ApiDefinition[];
  /** 元数据信息 */
  metadata: Metadata | null;
}

/**
 * Schema 定义
 */
export interface SchemaDefinition {
  /** Schema 名称 */
  name: string;
  /** 描述信息 */
  description?: string;
  /** Schema 类型 */
  type: SchemaType;

  // ======== object 类型特有 ========
  /** 对象属性定义 */
  properties?: Record<string, PropertyDefinition>;
  /** 必填字段列表 */
  required?: string[];
  /** 额外属性定义 */
  additionalProperties?: SchemaReference;

  // ======== array 类型特有 ========
  /** 数组元素类型 */
  items?: SchemaReference;

  // ======== enum 类型特有 ========
  /** 枚举值 */
  enum?: Array<string | number>;

  // ======== 泛型相关 ========
  /** 是否为泛型类型 */
  isGeneric?: boolean;
  /** 泛型基础类型名(如 ApiSuccessResponse) */
  baseType?: string;
  /** 泛型参数(如 User, User[]) */
  genericParam?: string;

  // ======== 其他元信息 ========
  /** 示例值 */
  example?: any;
  /** 默认值 */
  default?: any;
  /** 是否废弃 */
  deprecated?: boolean;
}

/**
 * Schema 类型枚举
 */
export type SchemaType =
  | 'object' // 对象类型
  | 'array' // 数组类型
  | 'enum' // 枚举类型
  | 'primitive' // 基础类型(string, number, boolean等)
  | 'generic'; // 泛型类型

/**
 * 属性定义
 */
export interface PropertyDefinition {
  /** 属性名 */
  name: string;
  /** 属性类型(TS 类型字符串) */
  type: string;
  /** 描述信息 */
  description?: string;
  /** 是否必填 */
  required: boolean;
  /** 是否可为 null */
  nullable?: boolean;
  /** 默认值 */
  default?: any;
  /** 示例值 */
  example?: any;
  /** 格式(date-time, email等) */
  format?: string;
  /** 正则模式 */
  pattern?: string;
  /** 最小长度 */
  minLength?: number;
  /** 最大长度 */
  maxLength?: number;
  /** 最小值 */
  minimum?: number;
  /** 最大值 */
  maximum?: number;
  /** 枚举值 */
  enum?: Array<string | number>;
}

/**
 * Schema 引用
 * 用于表示类型引用或内联定义
 */
export interface SchemaReference {
  /** 引用类型 */
  type: 'ref' | 'inline';
  /** 引用路径(type=ref时) */
  ref?: string;
  /** 内联Schema定义(type=inline时) */
  schema?: Partial<SchemaDefinition>;
}

/**
 * API 定义
 */
export interface ApiDefinition {
  /** API 路径 */
  path: string;
  /** HTTP 方法 */
  method: HttpMethod;
  /** 操作 ID(唯一标识) */
  operationId: string;
  /** 摘要 */
  summary?: string;
  /** 详细描述 */
  description?: string;
  /** 标签列表 */
  tags?: string[];
  /** 是否废弃 */
  deprecated?: boolean;

  // ======== 请求相关 ========
  /** 参数定义(按位置分组，每个位置引用一个生成的接口) */
  parameters?: ParametersDefinition;
  /** 请求体定义 */
  requestBody?: RequestBodyDefinition;

  // ======== 响应相关 ========
  /** 响应定义(按状态码) */
  responses: Record<string, ResponseDefinition>;

  // ======== 分类信息 ========
  /** 分类信息(用于生成文件路径) */
  category: CategoryInfo;
}

/**
 * HTTP 方法枚举
 */
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS';

/**
 * 参数定义(按位置分组)
 */
export interface ParametersDefinition {
  /** Query 参数接口引用 */
  query?: SchemaReference;
  /** Path 参数接口引用 */
  path?: SchemaReference;
  /** Header 参数接口引用 */
  header?: SchemaReference;
  /** Cookie 参数接口引用 */
  cookie?: SchemaReference;
}

/**
 * 请求体定义
 */
export interface RequestBodyDefinition {
  /** 描述信息 */
  description?: string;
  /** 是否必填 */
  required?: boolean;
  /** 内容类型定义 */
  content: Record<string, MediaTypeDefinition>;
}

/**
 * 响应定义
 */
export interface ResponseDefinition {
  /** 描述信息 */
  description: string;
  /** 内容类型定义 */
  content?: Record<string, MediaTypeDefinition>;
  /** 响应头定义 */
  headers?: Record<string, HeaderDefinition>;
}

/**
 * 媒体类型定义
 */
export interface MediaTypeDefinition {
  /** Schema 引用 */
  schema: SchemaReference;
  /** 示例值 */
  example?: any;
  /** 多个示例 */
  examples?: Record<string, ExampleDefinition>;
}

/**
 * 响应头定义
 */
export interface HeaderDefinition {
  /** 描述信息 */
  description?: string;
  /** Schema 定义 */
  schema: SchemaReference;
  /** 是否必填 */
  required?: boolean;
}

/**
 * 示例定义
 */
export interface ExampleDefinition {
  /** 摘要 */
  summary?: string;
  /** 描述 */
  description?: string;
  /** 示例值 */
  value: any;
}

/**
 * 分类信息
 * 用于将API按路径分类到不同文件
 */
export interface CategoryInfo {
  /** 路径段数组(如 ['auth', 'users']) */
  segments: string[];
  /** 分类深度 */
  depth: number;
  /** 是否为未分类(无法按规则分类的 API Path) */
  isUnclassified: boolean;
  /** 建议的文件路径(如 'api/auth/users/index.ts') */
  filePath: string;
}

/**
 * 元数据信息
 */
export interface Metadata {
  /** API 标题 */
  title?: string;
  /** API 描述 */
  description?: string;
  /** 基础 URL */
  baseUrl?: string;
  /** 公共路径前缀(如 '/api/v1') */
  commonPrefix?: string;
  /** 生成时间 */
  generatedAt: string;
  /** 原始文档来源 */
  source?: string;
}
