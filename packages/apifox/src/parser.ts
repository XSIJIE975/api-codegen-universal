// src/adapters/apifox/parser.ts

import type {
  ApiDefinition,
  SchemaDefinition,
  PropertyDefinition,
  SchemaReference,
  HttpMethod,
  ParametersDefinition,
  ResponseDefinition,
  SchemaType,
  StandardOutput,
  NamingStyle
} from '@api-codegen-universal/core';
import type {
  ApifoxApiDetail,
  ApifoxJsonSchema,
  ApifoxParameter
} from './types';
import { PathClassifier, SchemaIdResolver, NamingUtils } from './utils';

/**
 * 解析上下文
 */
export interface ParsingContext {
  schemas: StandardOutput['schemas'];
  interfaces: StandardOutput['interfaces'];
  shouldGenerateSchemas: boolean;
  shouldGenerateInterfaces: boolean;
  namingStyle: NamingStyle;
}

export class ApifoxParser {
  constructor(
    private resolver: SchemaIdResolver,
    private classifier: PathClassifier
  ) {}

  // ================= API 解析部分 =================

  parseApi(detail: ApifoxApiDetail, context: ParsingContext): ApiDefinition {
    const method = detail.method.toUpperCase() as HttpMethod;
    // 如果没有 operationId，生成一个默认的
    const rawOperationId = detail.operationId || this.generateOperationId(method, detail.path);
    
    // 保持 OperationId 在 API 定义中的原样 (或者你可以选择这里也格式化，通常 OperationId 是给函数名用的)
    const operationId = rawOperationId;

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
    // 提取为独立的 Schema 并引用
    if (detail.parameters) {
      const paramsDef: ParametersDefinition = {};
      
      // 使用 NamingUtils 转换名字，使其符合 PascalCase 等规范
      const baseParamsName = NamingUtils.convert(operationId, 'PascalCase');

      if (detail.parameters.query?.length) {
        paramsDef.query = this.processAndRegisterParams(
          detail.parameters.query, 
          `${baseParamsName}QueryParams`, 
          context
        );
      }
      if (detail.parameters.path?.length) {
        paramsDef.path = this.processAndRegisterParams(
          detail.parameters.path, 
          `${baseParamsName}PathParams`, 
          context
        );
      }
      if (detail.parameters.header?.length) {
        paramsDef.header = this.processAndRegisterParams(
          detail.parameters.header, 
          `${baseParamsName}HeaderParams`, 
          context
        );
      }
      
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

  /**
   * 处理参数列表：转换为 SchemaDefinition，注册到 Context，并返回引用
   */
  private processAndRegisterParams(
    params: ApifoxParameter[], 
    schemaName: string, 
    context: ParsingContext
  ): SchemaReference {
    // 1. 转换为标准 Schema 属性
    const properties: Record<string, PropertyDefinition> = {};
    const required: string[] = [];

    params.forEach(p => {
      if (p.enable === false) return;
      if (p.required) required.push(p.name);

      let type = 'string';
      if (p.schema) {
        type = this.getTsType(p.schema);
      } else if (p.type) {
        type = p.type === 'integer' ? 'number' : (p.type || 'string');
      }

      properties[p.name] = {
        name: p.name,
        type,
        required: !!p.required,
        description: p.description,
        example: p.example
      };
    });

    const schemaDef: SchemaDefinition = {
      name: schemaName,
      type: 'object',
      properties,
      required
    };

    // 2. 注册到全局 schemas
    if (context.shouldGenerateSchemas) {
      context.schemas[schemaName] = schemaDef;
    }

    // 3. 生成并注册 Interface
    if (context.shouldGenerateInterfaces) {
      context.interfaces[schemaName] = this.generateInterfaceCode(schemaDef);
    }

    // 4. 返回引用
    return {
      type: 'ref',
      ref: schemaName
    };
  }

  // ================= Schema 解析部分 =================

  parseSchema(jsonSchema: ApifoxJsonSchema, name: string): SchemaDefinition {
    const def: SchemaDefinition = {
      name,
      type: 'object', // 默认为 object，后面会修正
      description: jsonSchema.description
    };

    // 处理泛型 (关键修改点)
    // 简单判别规则：名字是 ApiSuccessResponse 或者名字包含 PageResult 等通用泛型名
    // 这里可以做成配置，或者写死几个常见的
    const genericFieldNames = ['data', 'items']; // 常见的泛型字段名
    const isLikelyGeneric = name === 'ApiSuccessResponse' || name.startsWith('PageResult');

    if (isLikelyGeneric) {
      def.type = 'generic';
      def.isGeneric = true;
      def.baseType = name;
    } else if (jsonSchema.type) {
      def.type = this.mapSchemaType(jsonSchema.type);
    } else if (jsonSchema.enum) {
      def.type = 'enum';
    }

    // 处理 Object 属性
    if (jsonSchema.properties) {
      def.properties = {};
      for (const [key, propSchema] of Object.entries(jsonSchema.properties)) {
        const isRequired = jsonSchema.required?.includes(key) ?? false;
        
        // 如果是泛型容器，且当前字段是泛型字段（如 data），强制类型为 'any' (对应 TS 的 T)
        let overrideType: string | undefined;
        if (def.isGeneric && genericFieldNames.includes(key)) {
           overrideType = 'any';
        }

        def.properties[key] = this.convertProperty(key, propSchema, isRequired, overrideType);
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

    return def;
  }

  // ================= 代码生成部分 =================

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

    // 处理 Generic 定义
    let declaration = `export interface ${schema.name}`;
    if (schema.isGeneric) { 
       declaration += '<T = any>';
    }

    lines.push(`${declaration} {`);

    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        if (prop.description) {
          lines.push(`  /**\n   * @description ${prop.description.replace(/\n/g, ' ')}\n   */`);
        }
        if (prop.example) {
           lines.push(`  /** @example ${JSON.stringify(prop.example)} */`);
        }
        
        const required = prop.required ? '' : '?';
        let typeStr = prop.type;

        // 如果是泛型容器，且字段类型被标记为 any (在 parseSchema 阶段处理过)，
        // 在生成的 Interface 字符串中我们将其视为 T
        if (schema.isGeneric && typeStr === 'any' && ['data', 'items'].includes(prop.name)) {
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

  private convertProperty(name: string, schema: ApifoxJsonSchema, required: boolean, overrideType?: string): PropertyDefinition {
    return {
      name,
      required,
      type: overrideType || this.getTsType(schema),
      description: schema.description,
      example: schema.examples?.[0] || schema.default,
      enum: schema.enum,
      format: schema.format,
      minLength: schema.minLength,
      maxLength: schema.maxLength
    };
  }

  private getTsType(schema: ApifoxJsonSchema): string {
    if (schema.$ref) {
      const refName = this.resolver.resolveRef(schema.$ref);
      return refName || 'any';
    }

    if (schema.type === 'array' && schema.items) {
      const itemType = this.getTsType(schema.items);
      return `${itemType}[]`;
    }

    // 处理 Apifox 导出特有的 allOf 泛型结构 (组合模式)
    if (schema.allOf) {
        const refs = schema.allOf.map(s => s.$ref ? this.resolver.resolveRef(s.$ref) : null).filter(Boolean);
        // 查找 inline 对象中含有 data 属性的
        const inlineData = schema.allOf.find(s => s.properties && s.properties.data);
        
        if (refs.length > 0 && inlineData) {
             const baseType = refs[0];
             const dataType = this.getTsType(inlineData.properties!.data!);
             return `${baseType}<${dataType}>`;
        }
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
        return 'Record<string, never>'; 
      default:
        return 'any';
    }
  }

  private convertJsonSchemaToReference(schema: ApifoxJsonSchema): SchemaReference {
    if (schema.$ref) {
      const name = this.resolver.resolveRef(schema.$ref);
      if (name) {
        return { type: 'ref', ref: name };
      }
    }
    
    // 检测是否是泛型类型字符串 (e.g. "ApiSuccessResponse<UserDto>")
    const typeStr = this.getTsType(schema);
    if (typeStr.includes('<') && typeStr.endsWith('>')) {
         return { type: 'ref', ref: typeStr };
    }

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