/**
 * 泛型检测器
 * 自动检测 TypeScript 交叉类型中的泛型模式
 *
 * 检测模式: BaseType & { data?: SpecificType }
 * 识别为: BaseType<SpecificType>
 */

/**
 * 泛型检测结果
 */
export interface GenericDetectionResult {
  isGeneric: boolean;
  baseType?: string;
  genericParam?: string;
  genericField?: string;
}

export class GenericDetector {
  private readonly genericPattern =
    /^(.+?)\s*&\s*\{\s*([a-zA-Z0-9_]+)\??:\s*(.+?)\s*;?\s*\}$/;
  private readonly baseTypePattern = /\["schemas"\]\["([^"]+)"\]/;

  /**
   * 检测交叉类型字符串是否为泛型模式
   *
   * @example
   * 输入: 'ApiSuccessResponse & { data?: RegisterResponseVo }'
   * 输出: { isGeneric: true, baseType: 'ApiSuccessResponse', genericParam: 'RegisterResponseVo', genericField: 'data' }
   */
  detect(typeString: string): GenericDetectionResult {
    const match = typeString.match(this.genericPattern);

    if (!match || !match[1] || !match[2] || !match[3]) {
      return { isGeneric: false };
    }

    return {
      isGeneric: true,
      baseType: this.extractBaseType(match[1].trim()),
      genericField: match[2].trim(),
      genericParam: this.extractGenericParam(match[3].trim()),
    };
  }

  /**
   * 检测是否为数组泛型
   * @example 'UserDto[]' -> true
   * @deprecated 此方法功能过于简单，建议使用 `detect()` 方法获取完整的泛型信息
   */
  isArrayGeneric(typeString: string): boolean {
    return typeString.endsWith('[]');
  }

  /**
   * 提取基类类型名
   * 处理 components["schemas"]["TypeName"] 格式
   */
  private extractBaseType(baseTypeStr: string): string {
    const match = baseTypeStr.match(this.baseTypePattern);
    if (match && match[1]) return match[1];
    return baseTypeStr;
  }

  /**
   * 提取泛型参数类型名
   * 处理 components["schemas"]["TypeName"] 和 components["schemas"]["TypeName"][]
   */
  private extractGenericParam(paramStr: string): string {
    const isArray = paramStr.endsWith('[]');
    const cleanParam = isArray ? paramStr.slice(0, -2).trim() : paramStr;

    const match = cleanParam.match(this.baseTypePattern);
    if (match && match[1]) {
      return isArray ? `${match[1]}[]` : match[1];
    }

    if (cleanParam === '{}') {
      return isArray ? 'any[]' : 'any';
    }

    return isArray ? `${cleanParam}[]` : cleanParam;
  }
}
