/**
 * 泛型检测器
 * 自动检测 TypeScript 交叉类型中的泛型模式
 */

/**
 * 泛型检测结果
 */
export interface GenericDetectionResult {
  /** 是否为泛型 */
  isGeneric: boolean;
  /** 泛型基类名称(如 'ApiSuccessResponse') */
  baseType?: string;
  /** 泛型参数(如 'UserDto', 'UserDto[]') */
  genericParam?: string;
  /** 泛型字段名称(如 'data', 'items') */
  genericField?: string;
}

/**
 * 泛型检测器
 *
 * 检测模式: BaseType & { data?: SpecificType }
 * 识别为: BaseType<SpecificType>
 */
export class GenericDetector {
  /** 缓存的正则表达式 */
  private readonly genericPattern =
    /^(.+?)\s*&\s*\{\s*([a-zA-Z0-9_]+)\?:\s*(.+?)\s*;?\s*\}$/;
  private readonly baseTypePattern = /\["schemas"\]\["([^"]+)"\]/;

  /**
   * 检测交叉类型字符串是否为泛型模式
   *
   * @example
   * 输入: 'ApiSuccessResponse & { data?: RegisterResponseVo }'
   * 输出: { isGeneric: true, baseType: 'ApiSuccessResponse', genericParam: 'RegisterResponseVo', genericField: 'data' }
   */
  detect(typeString: string): GenericDetectionResult {
    // 匹配模式: BaseType & { fieldName?: DataType }
    // 支持 data, items, result, list 等常见字段，或者任意字段
    const match = typeString.match(this.genericPattern);

    if (!match || !match[1] || !match[2] || !match[3]) {
      return { isGeneric: false };
    }

    const baseType = this.extractBaseType(match[1].trim());
    const genericField = match[2].trim();
    const genericParam = this.extractGenericParam(match[3].trim());

    return {
      isGeneric: true,
      baseType,
      genericParam,
      genericField,
    };
  }

  /**
   * 检测是否为数组泛型
   * @example 'UserDto[]' -> true
   */
  isArrayGeneric(typeString: string): boolean {
    return typeString.endsWith('[]');
  }

  /**
   * 提取基类类型名
   * 如处理 components["schemas"]["ApiSuccessResponse"] 格式
   */
  private extractBaseType(baseTypeStr: string): string {
    // 匹配: components["schemas"]["TypeName"]
    const match = baseTypeStr.match(this.baseTypePattern);
    if (match && match[1]) {
      return match[1];
    }
    // 如果不是索引访问，直接返回
    return baseTypeStr;
  }

  /**
   * 提取泛型参数类型名
   * 处理各种格式:
   * - components["schemas"]["UserDto"]
   * - components["schemas"]["UserDto"][]
   */
  private extractGenericParam(paramStr: string): string {
    // 处理数组类型 - 使用 endsWith 比 regex.test() 更高效
    const isArray = paramStr.endsWith('[]');
    const cleanParam = isArray ? paramStr.slice(0, -2).trim() : paramStr;

    // 匹配: components["schemas"]["TypeName"]
    const match = cleanParam.match(this.baseTypePattern);
    if (match && match[1]) {
      return isArray ? `${match[1]}[]` : match[1];
    }

    // 如果不是索引访问，直接返回
    return isArray ? `${cleanParam}[]` : cleanParam;
  }
}
