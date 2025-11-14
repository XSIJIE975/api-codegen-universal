import type { SchemaDefinition, PropertyDefinition, SchemaReference } from '../../types'
import { RefResolver } from '../../utils/ref-resolver'
import { TypeConverter } from '../../utils/type-converter'

/**
 * Schema 转换器
 * 负责将 OpenAPI Schema 转换为标准格式
 */
export class SchemaTransformer {
  private refResolver: RefResolver

  constructor(schema: any) {
    this.refResolver = new RefResolver(schema)
  }

  /**
   * 转换所有 schemas
   */
  transform(schemas: Record<string, any>): Record<string, SchemaDefinition> {
    const result: Record<string, SchemaDefinition> = {}

    for (const [name, schema] of Object.entries(schemas)) {
      result[name] = this.transformSchema(name, schema)
    }

    return result
  }

  /**
   * 转换单个 schema
   */
  transformSchema(name: string, schema: any): SchemaDefinition {
    // 解析引用
    if (RefResolver.isRef(schema)) {
      const resolved = this.refResolver.resolve(schema.$ref)
      return this.transformSchema(name, resolved)
    }

    // 确定类型
    const type = this.determineType(schema)

    // 基础定义
    const definition: SchemaDefinition = {
      name,
      type,
      description: schema.description,
      nullable: schema.nullable,
      default: schema.default,
      example: schema.example,
    }

    // 根据类型添加特定字段
    switch (type) {
      case 'object':
        definition.properties = this.transformProperties(schema)
        definition.required = schema.required || []
        if (schema.additionalProperties) {
          definition.additionalProperties = this.transformSchemaReference(
            schema.additionalProperties
          )
        }
        break

      case 'array':
        if (schema.items) {
          definition.items = this.transformSchemaReference(schema.items)
        }
        break

      case 'enum':
        definition.enum = schema.enum
        break

      case 'primitive':
        // 基础类型不需要额外字段
        break
    }

    return definition
  }

  /**
   * 转换属性
   */
  private transformProperties(schema: any): Record<string, PropertyDefinition> | undefined {
    if (!schema.properties) return undefined

    const result: Record<string, PropertyDefinition> = {}
    const required = schema.required || []

    for (const [propName, propSchema] of Object.entries<any>(schema.properties)) {
      result[propName] = this.transformProperty(propName, propSchema, required)
    }

    return result
  }

  /**
   * 转换单个属性
   */
  private transformProperty(
    name: string,
    schema: any,
    required: string[]
  ): PropertyDefinition {
    // 处理引用
    let actualSchema = schema
    let ref: string | undefined

    if (RefResolver.isRef(schema)) {
      ref = schema.$ref
      actualSchema = this.refResolver.resolve(schema.$ref)
    }

    // 转换类型
    const type = TypeConverter.convert(actualSchema)

    return {
      name,
      type,
      description: actualSchema.description,
      required: required.includes(name),
      nullable: actualSchema.nullable,
      default: actualSchema.default,
      example: actualSchema.example,
      format: actualSchema.format,
      pattern: actualSchema.pattern,
      minLength: actualSchema.minLength,
      maxLength: actualSchema.maxLength,
      minimum: actualSchema.minimum,
      maximum: actualSchema.maximum,
      enum: actualSchema.enum,
      ref,
    }
  }

  /**
   * 转换 Schema 引用
   */
  private transformSchemaReference(schema: any): SchemaReference {
    if (RefResolver.isRef(schema)) {
      return {
        type: 'ref',
        ref: schema.$ref,
      }
    }

    // 对于内联 schema，递归转换
    const name = `Inline_${Math.random().toString(36).slice(2, 9)}`
    return {
      type: 'inline',
      schema: this.transformSchema(name, schema),
    }
  }

  /**
   * 确定 schema 类型
   */
  private determineType(schema: any): SchemaDefinition['type'] {
    // 枚举
    if (schema.enum) {
      return 'enum'
    }

    // 数组
    if (schema.type === 'array') {
      return 'array'
    }

    // 对象
    if (schema.type === 'object' || schema.properties) {
      return 'object'
    }

    // 基础类型
    if (schema.type && ['string', 'number', 'integer', 'boolean', 'null'].includes(schema.type)) {
      return 'primitive'
    }

    // 默认为对象
    return 'object'
  }
}
