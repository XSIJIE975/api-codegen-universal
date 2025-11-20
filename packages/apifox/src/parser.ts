import type {
  ApiDefinition,
  SchemaDefinition,
  PropertyDefinition,
  SchemaReference,
  HttpMethod,
  ParametersDefinition,
  ResponseDefinition,
  SchemaType
} from '@api-codegen-universal/core';
import type {
  ApifoxApiDetail,
  ApifoxJsonSchema,
  ApifoxParameter
} from './types';
import { PathClassifier, SchemaIdResolver } from './utils';

export class ApifoxParser {
  constructor(
    private resolver: SchemaIdResolver,
    private classifier: PathClassifier
  ) { }

  // ================= API 解析部分 =================

  parseApi(detail: ApifoxApiDetail): ApiDefinition {
    const method = detail.method.toUpperCase() as HttpMethod;
    // 如果没有 operationId，生成一个基于 path 的
    const operationId = detail.operationId || this.generateOperationId(method, detail.path);

    const api: ApiDefinition = {
      path: detail.path,
      method,
      operationId,
      summary: detail.name,
      description: detail.description,
      tags: detail.tags || [],
      category: this.classifier.classify(detail.path),
      parameters: {},
      responses: {}
    };

    // 1. 处理参数 (Query, Path, Header)
    // Apifox 参数是数组，标准输出要求转换为 Schema 对象
    if (detail.parameters) {
      const paramsDef: ParametersDefinition = {};
      if (detail.parameters.query?.length) {
        paramsDef.query = this.convertParamsArrayToSchema(detail.parameters.query, `${operationId}QueryParams`);
      }
      if (detail.parameters.path?.length) {
        paramsDef.path = this.convertParamsArrayToSchema(detail.parameters.path, `${operationId}PathParams`);
      }
      if (detail.parameters.header?.length) {
        paramsDef.header = this.convertParamsArrayToSchema(detail.parameters.header, `${operationId}HeaderParams`);
      }
      // 只有当有参数时才赋值
      if (Object.keys(paramsDef).length > 0) {
        api.parameters = paramsDef;
      }
    }

    // 2. 处理 Request Body
    if (detail.requestBody && detail.requestBody.type === 'application/json' && detail.requestBody.jsonSchema) {
      api.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: this.convertJsonSchemaToReference(detail.requestBody.jsonSchema)
          }
        }
      };
    }

    // 3. 处理 Responses
    if (detail.responses) {
      detail.responses.forEach(resp => {
        const statusCode = String(resp.code);
        const responseDef: ResponseDefinition = {
          description: resp.name || 'Response'
        };

        if (resp.contentType === 'json' && resp.jsonSchema) {
          responseDef.content = {
            'application/json': {
              schema: this.convertJsonSchemaToReference(resp.jsonSchema)
            }
          };
        }
        api.responses[statusCode] = responseDef;
      });
    }

    return api;
  }

  // ================= Schema 解析部分 =================

  parseSchema(jsonSchema: ApifoxJsonSchema, name: string): SchemaDefinition {
    const def: SchemaDefinition = {
      name,
      type: 'object',
      description: jsonSchema.description
    };

    if (jsonSchema.type) {
      def.type = this.mapSchemaType(jsonSchema.type);
    } else if (jsonSchema.enum) {
      def.type = 'enum';
    }

    // 处理 Object 属性
    if (jsonSchema.properties) {
      def.properties = {};
      for (const [key, propSchema] of Object.entries(jsonSchema.properties)) {
        const isRequired = jsonSchema.required?.includes(key) ?? false;
        def.properties[key] = this.convertProperty(key, propSchema, isRequired);
      }
      if (jsonSchema.required) {
        def.required = jsonSchema.required;
      }
    }

    // 处理 Array Items
    if (jsonSchema.items) {
      def.items = this.convertJsonSchemaToReference(jsonSchema.items);
      def.type = 'array';
    }

    // 处理 Enum
    if (jsonSchema.enum) {
      def.type = 'enum';
      def.enum = jsonSchema.enum;
    }

    // 简单检测泛型模式 (Apifox 导出有时会使用 allOf 组合基类)
    // 如果 allOf [ Ref(ApiSuccessResponse), Object(data: Ref(User)) ]
    if (jsonSchema.allOf && jsonSchema.allOf.length === 2) {
      const baseRef = this.convertJsonSchemaToReference(jsonSchema.allOf[0]!);
      const genericPart = jsonSchema.allOf[1];

      if (baseRef.type === 'ref' && genericPart?.properties && genericPart?.properties['data']) {
        const genericType = this.convertJsonSchemaToReference(genericPart?.properties['data']);
        if (genericType.type === 'ref') {
          // 检测到类似 ApiSuccessResponse & { data: UserDto }
          // 标记为 Generic 以便后续特殊处理 (可选)
          // 在标准输出中，我们可以直接通过 type ref 传递泛型语法 string
          // 但这里为了保持 StandardOutput 结构纯净，我们不做过多 Hacker
        }
      }
    }

    return def;
  }

  // ================= 代码生成部分 =================

  /**
   * 生成 TypeScript 接口代码字符串
   */
  generateInterfaceCode(schema: SchemaDefinition): string {
    const lines: string[] = [];
    const isEnum = schema.type === 'enum';

    if (isEnum) {
      lines.push(`export enum ${schema.name} {`);
      schema.enum?.forEach(val => {
        if (typeof val === 'string') {
          lines.push(`  ${val} = "${val}",`);
        } else {
          lines.push(`  Value${val} = ${val},`);
        }
      });
      lines.push('}');
      return lines.join('\n');
    }

    // 处理 Generic 泛型定义 (简单 heuristic)
    // 如果名字里包含 <T> 或者是基类
    let declaration = `export interface ${schema.name}`;
    if (schema.name === 'ApiSuccessResponse') { // 硬编码或通过配置传入基类名
      declaration += '<T = any>';
      schema.isGeneric = true;
    }

    lines.push(`${declaration} {`);

    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        if (prop.description) {
          lines.push(`  /**\n * @description ${prop.description.replace(/\n/g, '\n * ')}\n */`);
        }
        if (prop.example) {
          lines.push(`  /** @example ${JSON.stringify(prop.example)} */`);
        }

        const required = prop.required ? '' : '?';
        let typeStr = prop.type;

        // 特殊处理泛型替换
        if (schema.isGeneric && prop.name === 'data') {
          typeStr = 'T';
        }

        lines.push(`  ${prop.name}${required}: ${typeStr};`);
      }
    }
    lines.push('}');

    return lines.join('\n');
  }

  // ================= 内部 Helper 方法 =================

  private mapSchemaType(type: string): SchemaType {
    switch (type) {
      case 'integer':
      case 'number':
      case 'boolean':
      case 'string':
        return 'primitive';
      case 'array':
        return 'array';
      case 'object':
      default:
        return 'object';
    }
  }

  private convertProperty(name: string, schema: ApifoxJsonSchema, required: boolean): PropertyDefinition {
    return {
      name,
      required,
      type: this.getTsType(schema),
      description: schema.description,
      example: schema.examples?.[0],
      enum: schema.enum,
      format: schema.format,
      minLength: schema.minLength,
      maxLength: schema.maxLength
    };
  }

  /**
   * 获取 TS 类型字符串 (string, number, UserDto, UserDto[])
   */
  private getTsType(schema: ApifoxJsonSchema): string {
    if (schema.$ref) {
      const refName = this.resolver.resolveRef(schema.$ref);
      return refName || 'any';
    }

    if (schema.type === 'array' && schema.items) {
      const itemType = this.getTsType(schema.items);
      // 简单的数组处理，如果 itemType 包含泛型或复杂字符，可能需要加括号
      return `${itemType}[]`;
    }

    // 处理 allOf (泛型组合)
    // 场景：ApiSuccessResponse & { data: UserDto } -> ApiSuccessResponse<UserDto>
    if (schema.allOf) {
      // 这是一个简化的处理逻辑，针对特定的 Apifox 泛型导出模式
      const refs = schema.allOf.map(s => s.$ref ? this.resolver.resolveRef(s.$ref) : null).filter(Boolean);
      // 查找 allOf 中定义了 properties.data 的内联对象
      const inlineData = schema.allOf.find(s => s.properties && s.properties.data);

      if (refs.length > 0 && inlineData) {
        const baseType = refs[0];
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const dataType = this.getTsType(inlineData.properties?.data);
        return `${baseType}<${dataType}>`;
      }
      // 兜底：如果是单纯的继承，使用交叉类型
      if (refs.length > 1) {
        return refs.join(' & ');
      }
    }

    switch (schema.type) {
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'string':
        if (schema.enum) {
          return schema.enum.map(e => `"${e}"`).join(' | ');
        }
        return 'string';
      case 'object':
        // 如果是内联 Object，通常定义为 Record<string, never> 或者 any
        // 为了严格一点，如果没有 properties，就是 any 或者 Record<string, any>
        return 'Record<string, never>'; // 对应 StandardOutput 示例中的空对象
      default:
        return 'any';
    }
  }

  /**
   * 将 Apifox 参数数组转换为 SchemaReference (Inline Object)
   * 用于适配 ParametersDefinition 接口
   */
  private convertParamsArrayToSchema(params: ApifoxParameter[], tempName: string): SchemaReference {
    const properties: Record<string, PropertyDefinition> = {};
    const required: string[] = [];

    params.forEach(p => {
      if (p.enable === false) return; // Apifox 特有的开关
      if (p.required) required.push(p.name);

      let type = 'string';
      // 兼容旧版 type 字段和新版 schema 字段
      if (p.schema) {
        type = this.getTsType(p.schema);
      } else if (p.type) {
        type = p.type === 'integer' ? 'number' : p.type;
      }

      properties[p.name] = {
        name: p.name,
        type,
        required: !!p.required,
        description: p.description,
        example: p.example
      };
    });

    return {
      type: 'inline',
      schema: {
        name: tempName,
        type: 'object',
        properties,
        required
      }
    };
  }

  /**
   * 将 JsonSchema 转换为 SchemaReference
   */
  private convertJsonSchemaToReference(schema: ApifoxJsonSchema): SchemaReference {
    if (schema.$ref) {
      const name = this.resolver.resolveRef(schema.$ref);
      if (name) {
        // 处理泛型引用情况，虽然是 ref，但标准库 ref 字段是个 string
        // 这里如果 getTsType 返回的是 "ApiResult<User>"，也作为 ref 字符串传回去
        return { type: 'ref', ref: name };
      }
    }

    // 如果不是纯引用，或者是泛型组合 (allOf)，我们需要获取完整的类型字符串作为引用
    // 比如 "ApiSuccessResponse<UserDto>"
    const typeStr = this.getTsType(schema);
    if (typeStr !== 'any' && typeStr !== 'Record<string, never>') {
      // 如果计算出了复杂的类型字符串（包含 <>），也视为 ref 类型
      return { type: 'ref', ref: typeStr };
    }

    // 兜底：内联 Schema
    return {
      type: 'inline',
      schema: {
        type: this.mapSchemaType(schema.type || 'object')
      }
    };
  }

  private generateOperationId(method: string, path: string): string {
    const segments = path.split('/').filter(s => s && !s.includes('{'));
    const name = segments.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    return `${method.toLowerCase()}${name}`;
  }
}