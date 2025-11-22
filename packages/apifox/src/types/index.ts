// src/adapters/apifox/types.ts

/**
 * 适配器输入源配置
 * parse(source) 中的 source 类型
 */
export interface ApifoxConfig {
  /** Apifox 项目 ID */
  projectId: string;
  /** Apifox 访问令牌 (Bearer Token) */
  token: string;
  /** Apifox API 版本 (默认 2024-03-28 或 2025-09-01) */
  apiVersion?: string;
}

// ======== Apifox 原始响应数据结构 ========

export interface ApifoxApiResponse<T> {
  success: boolean;
  data: T;
  code?: number;
  message?: string;
}

export interface ApifoxDataSchema {
  id: number;
  name: string;
  displayName?: string;
  description?: string;
  jsonSchema: ApifoxJsonSchema;
}

export interface ApifoxApiDetail {
  id: number;
  name: string;
  description?: string;
  operationId?: string;
  method: string;
  path: string;
  tags?: string[];
  status: string;
  parameters?: {
    path?: ApifoxParameter[];
    query?: ApifoxParameter[];
    header?: ApifoxParameter[];
    cookie?: ApifoxParameter[];
  };
  requestBody?: {
    type: string;
    jsonSchema?: ApifoxJsonSchema;
  };
  responses?: ApifoxResponse[];
}

export interface ApifoxParameter {
  id: string;
  name: string;
  type: string;
  required: boolean;
  description?: string;
  enable?: boolean;
  example?: string;
  schema?: ApifoxJsonSchema;
}

export interface ApifoxResponse {
  code: number;
  name: string;
  contentType: string;
  jsonSchema?: ApifoxJsonSchema;
}

export interface ApifoxJsonSchema {
  type?: string;
  properties?: Record<string, ApifoxJsonSchema>;
  items?: ApifoxJsonSchema;
  required?: string[];
  description?: string;
  enum?: (string | number)[];
  format?: string;
  $ref?: string;
  allOf?: ApifoxJsonSchema[];
  examples?: any[];
  default?: any;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}