/**
 * 标准输出数据结构
 * 所有适配器都必须输出这种统一的格式
 *
 * 该文件定义了核心的数据模型，用于抹平不同 API 规范（如 OpenAPI 2.0/3.0, Swagger, GraphQL 等）之间的差异。
 * 代码生成器将基于此标准格式生成最终的代码。
 */

/**
 * 标准输出格式 - 核心导出
 * 包含所有提取出的 Schema、Interface 和 API 定义
 */
export interface StandardOutput {
  /**
   * Schema 定义集合
   * Key 为 Schema 名称（如 UserDto），Value 为详细定义
   * 用于生成类型定义文件或验证逻辑
   */
  schemas: Record<string, SchemaDefinition>;

  /**
   * TypeScript 接口代码字符串集合
   * Key 为接口名称，Value 为生成的 TypeScript 代码字符串
   * 适配器可以直接生成 TS 代码，也可以留空由后续流程生成
   */
  interfaces: Record<string, string>;

  /**
   * API 接口定义列表
   * 包含所有提取出的 API 操作详情
   */
  apis: ApiDefinition[];

  /**
   * 元数据信息
   * 包含文档标题、版本、生成时间等
   */
  metadata: Metadata | null;
}

/**
 * Schema 定义
 * 描述数据结构的元信息，类似于 JSON Schema
 */
export interface SchemaDefinition {
  /** Schema 名称 (如 User, OrderDetail) */
  name: string;
  /** 描述信息 */
  description?: string;
  /** Schema 类型 */
  type: SchemaType;

  // ======== object 类型特有 ========
  /** 对象属性定义 (当 type='object' 时有效) */
  properties?: Record<string, PropertyDefinition>;
  /** 必填字段列表 */
  required?: string[];
  /** 额外属性定义 (索引签名) */
  additionalProperties?: SchemaReference;

  // ======== array 类型特有 ========
  /** 数组元素类型 (当 type='array' 时有效) */
  items?: SchemaReference;

  // ======== enum 类型特有 ========
  /** 枚举值列表 (当 type='enum' 时有效) */
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
  example?: unknown;
  /** 默认值 */
  default?: unknown;
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
 * 描述对象中的单个属性
 */
export interface PropertyDefinition {
  /** 属性名 */
  name: string;
  /** 属性类型(TS 类型字符串，如 string, number, UserDto) */
  type: string;
  /** 描述信息 */
  description?: string;
  /** 是否必填 */
  required: boolean;
  /** 是否可为 null */
  nullable?: boolean;
  /** 默认值 */
  default?: unknown;
  /** 示例值 */
  example?: unknown;
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
 *
 * @example
 * // 引用类型
 * { type: 'ref', ref: 'User' }
 *
 * // 内联定义
 * { type: 'inline', schema: { type: 'object', properties: { ... } } }
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
  example?: unknown;
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
  value: unknown;
}

/**
 * 分类信息
 * 用于将API按路径分类到不同文件
 *
 * @example
 * // 路径: /api/v1/users/profile
 * {
 *   segments: ['api', 'v1', 'users'],
 *   depth: 3,
 *   isUnclassified: false,
 *   filePath: 'api/v1/users/index.ts'
 * }
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
  /** 生成时间 */
  generatedAt: string;
  /** 原始文档来源 */
  source?: string;
  /** 生成选项/配置参数 */
  options?: Record<string, unknown>;
}
