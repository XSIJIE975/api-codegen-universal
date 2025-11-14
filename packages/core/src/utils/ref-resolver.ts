/**
 * 引用解析器
 * 负责解析 OpenAPI 中的 $ref 引用
 */
export class RefResolver {
  private schema: any
  private cache = new Map<string, any>()

  constructor(schema: any) {
    this.schema = schema
  }

  /**
   * 解析引用
   * @param ref 引用路径，例如 "#/components/schemas/User"
   * @returns 解析后的对象
   */
  resolve(ref: string): any {
    // 检查缓存
    if (this.cache.has(ref)) {
      return this.cache.get(ref)
    }

    // 解析引用
    const resolved = this.doResolve(ref)
    this.cache.set(ref, resolved)

    return resolved
  }

  /**
   * 执行解析
   */
  private doResolve(ref: string): any {
    // 只支持内部引用（以 # 开头）
    if (!ref.startsWith('#')) {
      throw new Error(`External references not supported yet: ${ref}`)
    }

    // 移除 # 并分割路径
    const path = ref.slice(1).split('/')

    // 遍历路径
    let current = this.schema
    for (const segment of path) {
      if (!segment) continue // 跳过空段

      if (current[segment] === undefined) {
        throw new Error(`Reference not found: ${ref}`)
      }

      current = current[segment]
    }

    return current
  }

  /**
   * 提取引用名称
   * @param ref 引用路径
   * @returns 引用名称
   * @example
   * extractName('#/components/schemas/User') => 'User'
   */
  static extractName(ref: string): string {
    return ref.split('/').pop() || ''
  }

  /**
   * 检查是否为引用
   */
  static isRef(obj: any): obj is { $ref: string } {
    return typeof obj === 'object' && obj !== null && '$ref' in obj
  }

  /**
   * 递归解析对象中的所有引用
   */
  resolveDeep(obj: any): any {
    if (RefResolver.isRef(obj)) {
      const resolved = this.resolve(obj.$ref)
      // 递归解析
      return this.resolveDeep(resolved)
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveDeep(item))
    }

    if (typeof obj === 'object' && obj !== null) {
      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveDeep(value)
      }
      return result
    }

    return obj
  }
}
