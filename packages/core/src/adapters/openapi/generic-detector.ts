import { RefResolver } from '../../utils/ref-resolver'

/**
 * 泛型检测器配置
 */
export interface GenericDetectorOptions {
  /** 泛型容器列表，例如 ['ApiSuccessResponse', 'PageResult'] */
  genericWrappers?: string[]
}

/**
 * 泛型检测结果
 */
export interface GenericDetectionResult {
  /** 是否为泛型 */
  isGeneric: boolean
  /** 泛型参数类型 */
  genericParam?: string
  /** 基础类型（泛型容器） */
  baseType?: string
}

/**
 * 泛型检测器
 * 负责检测 OpenAPI Schema 中的泛型模式
 */
export class GenericDetector {
  private options: Required<GenericDetectorOptions>

  constructor(_schema: any, options: GenericDetectorOptions = {}) {
    this.options = {
      genericWrappers: options.genericWrappers || [
        'ApiSuccessResponse',
        'ApiResponse',
        'PageResult',
        'PaginatedResponse',
        'Result',
      ],
    }
  }

  /**
   * 检测 schema 是否为泛型
   */
  detect(schema: any, name?: string): GenericDetectionResult {
    // 1. 检查名称是否在泛型列表中
    if (name && this.isGenericWrapper(name)) {
      return {
        isGeneric: true,
        baseType: name,
        genericParam: this.extractGenericParamFromName(name),
      }
    }

    // 2. 检查 allOf 模式
    if (schema.allOf) {
      const result = this.detectAllOfPattern(schema.allOf)
      if (result.isGeneric) {
        return result
      }
    }

    // 3. 检查是否有泛型属性（data: any）
    if (schema.properties?.data) {
      const dataSchema = schema.properties.data
      // 如果 data 是引用或者是 object 类型，可能是泛型
      if (RefResolver.isRef(dataSchema) || dataSchema.type === 'object') {
        return {
          isGeneric: true,
          baseType: name,
          genericParam: RefResolver.isRef(dataSchema)
            ? RefResolver.extractName(dataSchema.$ref)
            : undefined,
        }
      }
    }

    return { isGeneric: false }
  }

  /**
   * 检测 allOf 模式
   * 
   * 模式示例：
   * ```yaml
   * allOf:
   *   - $ref: '#/components/schemas/ApiSuccessResponse'
   *   - type: object
   *     properties:
   *       data:
   *         $ref: '#/components/schemas/UserDto'
   * ```
   * 
   * 应该转换为: ApiSuccessResponse<UserDto>
   */
  private detectAllOfPattern(allOf: any[]): GenericDetectionResult {
    // 查找引用泛型容器的项
    const genericRefItem = allOf.find(item => {
      if (RefResolver.isRef(item)) {
        const refName = RefResolver.extractName(item.$ref)
        return this.isGenericWrapper(refName)
      }
      return false
    })

    if (!genericRefItem) {
      return { isGeneric: false }
    }

    const baseType = RefResolver.extractName(genericRefItem.$ref)

    // 查找覆盖 data 属性的项
    const dataOverrideItem = allOf.find(item => item.properties?.data)

    if (!dataOverrideItem) {
      return {
        isGeneric: true,
        baseType,
      }
    }

    // 提取泛型参数
    const dataSchema = dataOverrideItem.properties.data
    const genericParam = this.extractGenericType(dataSchema)

    return {
      isGeneric: true,
      baseType,
      genericParam,
    }
  }

  /**
   * 提取泛型类型
   */
  private extractGenericType(schema: any): string | undefined {
    if (RefResolver.isRef(schema)) {
      return RefResolver.extractName(schema.$ref)
    }

    if (schema.type === 'array' && schema.items) {
      const itemType = this.extractGenericType(schema.items)
      return itemType ? `${itemType}[]` : undefined
    }

    if (schema.type === 'object') {
      return 'object'
    }

    return schema.type
  }

  /**
   * 检查名称是否为泛型容器
   */
  private isGenericWrapper(name: string): boolean {
    return this.options.genericWrappers.includes(name)
  }

  /**
   * 从名称中提取泛型参数（针对命名约定）
   * 例如: ApiResponseUserDto => UserDto
   */
  private extractGenericParamFromName(name: string): string | undefined {
    for (const wrapper of this.options.genericWrappers) {
      if (name.startsWith(wrapper)) {
        const param = name.slice(wrapper.length)
        return param || undefined
      }
    }
    return undefined
  }

  /**
   * 批量检测
   */
  detectBatch(schemas: Record<string, any>): Record<string, GenericDetectionResult> {
    const result: Record<string, GenericDetectionResult> = {}

    for (const [name, schema] of Object.entries(schemas)) {
      result[name] = this.detect(schema, name)
    }

    return result
  }
}
