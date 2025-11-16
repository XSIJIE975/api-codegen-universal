/**
 * 泛型检测器
 * 自动检测 TypeScript 交叉类型中的泛型模式
 */

/**
 * 泛型检测结果
 */
export interface GenericDetectionResult {
  /** 是否为泛型 */
  isGeneric: boolean
  /** 泛型基类名称(如 'ApiSuccessResponse') */
  baseType?: string
  /** 泛型参数(如 'UserDto', 'UserDto[]') */
  genericParam?: string
}

/**
 * 泛型检测器
 * 
 * 检测模式: BaseType & { data?: SpecificType }
 * 识别为: BaseType<SpecificType>
 */
export class GenericDetector {
  /**
   * 检测交叉类型字符串是否为泛型模式
   * 
   * @example
   * 输入: 'ApiSuccessResponse & { data?: RegisterResponseVo }'
   * 输出: { isGeneric: true, baseType: 'ApiSuccessResponse', genericParam: 'RegisterResponseVo' }
   */
  detect(typeString: string): GenericDetectionResult {
    // 匹配模式: BaseType & { data?: DataType }
    const pattern = /^(.+?)\s*&\s*\{\s*data\?:\s*(.+?)\s*;?\s*\}$/

    const match = typeString.match(pattern)
    
    if (!match || !match[1] || !match[2]) {
      return { isGeneric: false }
    }

    const baseType = this.extractBaseType(match[1].trim())
    const genericParam = this.extractGenericParam(match[2].trim())

    return {
      isGeneric: true,
      baseType,
      genericParam,
    }
  }

  /**
   * 检测是否为数组泛型
   * @example 'UserDto[]' -> true
   */
  isArrayGeneric(typeString: string): boolean {
    return typeString.endsWith('[]')
  }

  /**
   * 提取基类类型名
   * 处理 components["schemas"]["ApiSuccessResponse"] 格式
   */
  private extractBaseType(baseTypeStr: string): string {
    // 匹配: components["schemas"]["TypeName"]
    const match = baseTypeStr.match(/\["schemas"\]\["([^"]+)"\]/)
    if (match && match[1]) {
      return match[1]
    }
    // 如果不是索引访问，直接返回
    return baseTypeStr
  }

  /**
   * 提取泛型参数类型名
   * 处理各种格式:
   * - components["schemas"]["UserDto"]
   * - components["schemas"]["UserDto"][]
   */
  private extractGenericParam(paramStr: string): string {
    // 处理数组类型
    const isArray = paramStr.endsWith('[]')
    const cleanParam = isArray ? paramStr.slice(0, -2).trim() : paramStr

    // 匹配: components["schemas"]["TypeName"]
    const match = cleanParam.match(/\["schemas"\]\["([^"]+)"\]/)
    if (match && match[1]) {
      return isArray ? `${match[1]}[]` : match[1]
    }

    // 如果不是索引访问，直接返回
    return isArray ? `${cleanParam}[]` : cleanParam
  }
}
