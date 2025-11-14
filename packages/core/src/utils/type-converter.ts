/**
 * 类型转换器
 * 将 OpenAPI 类型转换为 TypeScript 类型字符串
 */
export class TypeConverter {
  /**
   * OpenAPI 类型到 TypeScript 类型的映射
   */
  private static readonly TYPE_MAP: Record<string, string> = {
    string: 'string',
    number: 'number',
    integer: 'number',
    boolean: 'boolean',
    object: 'Record<string, any>',
    array: 'any[]',
    null: 'null',
  }

  /**
   * 转换 OpenAPI Schema 类型为 TypeScript 类型字符串
   */
  static convert(schema: any): string {
    // 处理引用
    if (schema.$ref) {
      return this.extractRefName(schema.$ref)
    }

    // 处理枚举
    if (schema.enum) {
      return this.convertEnum(schema.enum)
    }

    // 处理数组
    if (schema.type === 'array') {
      if (schema.items) {
        const itemType = this.convert(schema.items)
        return `${itemType}[]`
      }
      return 'any[]'
    }

    // 处理对象
    if (schema.type === 'object') {
      return this.convertObject(schema)
    }

    // 处理 allOf
    if (schema.allOf) {
      return this.convertAllOf(schema.allOf)
    }

    // 处理 oneOf
    if (schema.oneOf) {
      return this.convertOneOf(schema.oneOf)
    }

    // 处理 anyOf
    if (schema.anyOf) {
      return this.convertAnyOf(schema.anyOf)
    }

    // 处理基础类型
    return this.convertPrimitive(schema.type, schema.format)
  }

  /**
   * 转换基础类型
   */
  private static convertPrimitive(type?: string, format?: string): string {
    // 特殊格式处理
    if (format === 'date-time' || format === 'date') {
      return 'string' // 默认用 string，可配置为 Date
    }

    if (format === 'binary') {
      return 'Blob' // 文件上传
    }

    if (format === 'byte' || format === 'base64') {
      return 'string'
    }

    return this.TYPE_MAP[type || 'string'] || 'any'
  }

  /**
   * 转换枚举类型
   */
  private static convertEnum(values: any[]): string {
    if (values.length === 0) return 'never'

    return values.map(v => {
      if (typeof v === 'string') return `'${v}'`
      return String(v)
    }).join(' | ')
  }

  /**
   * 转换对象类型
   */
  private static convertObject(schema: any): string {
    if (!schema.properties || Object.keys(schema.properties).length === 0) {
      if (schema.additionalProperties) {
        const valueType = typeof schema.additionalProperties === 'object'
          ? this.convert(schema.additionalProperties)
          : 'any'
        return `Record<string, ${valueType}>`
      }
      return 'Record<string, any>'
    }

    const required = schema.required || []
    const props = Object.entries(schema.properties).map(([key, prop]: [string, any]) => {
      const isRequired = required.includes(key)
      const type = this.convert(prop)
      const optional = isRequired ? '' : '?'
      return `${key}${optional}: ${type}`
    })

    return `{ ${props.join('; ')} }`
  }

  /**
   * 转换 allOf（交叉类型）
   */
  private static convertAllOf(schemas: any[]): string {
    const types = schemas.map(s => this.convert(s))
    return types.join(' & ')
  }

  /**
   * 转换 oneOf（联合类型）
   */
  private static convertOneOf(schemas: any[]): string {
    const types = schemas.map(s => this.convert(s))
    return types.join(' | ')
  }

  /**
   * 转换 anyOf（联合类型）
   */
  private static convertAnyOf(schemas: any[]): string {
    const types = schemas.map(s => this.convert(s))
    return types.join(' | ')
  }

  /**
   * 提取引用名称
   */
  private static extractRefName(ref: string): string {
    return ref.split('/').pop() || 'any'
  }

  /**
   * 检查类型是否为可选
   */
  static isOptional(schema: any, propertyName: string): boolean {
    const required = schema.required || []
    return !required.includes(propertyName)
  }

  /**
   * 获取类型描述
   */
  static getDescription(schema: any): string | undefined {
    return schema.description || schema.title
  }
}
