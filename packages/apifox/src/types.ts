/**
 * Apifox 原始数据类型定义
 */

export interface ApifoxSource {
  apiDetails: ApifoxApiDetail[];
  dataSchemas: ApifoxDataSchema[];
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
  schema?: ApifoxJsonSchema; // 新版 Apifox 可能包含 schema 字段
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
  oneOf?: ApifoxJsonSchema[];
  anyOf?: ApifoxJsonSchema[];
  examples?: any[];
  default?: any;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}