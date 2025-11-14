import type { CategoryInfo } from '../../types'

/**
 * 路径分类器配置
 */
export interface PathClassifierOptions {
  /** 公共前缀，例如 '/api/v1' */
  commonPrefix?: string
  /** 最大分类深度（默认 2） */
  maxDepth?: number
  /** 未分类文件路径（默认 'api/unclassified.ts'） */
  unclassifiedPath?: string
}

/**
 * 路径分类器
 * 负责将 API 路径分类到对应的文件
 */
export class PathClassifier {
  private options: Required<PathClassifierOptions>

  constructor(options: PathClassifierOptions = {}) {
    this.options = {
      commonPrefix: options.commonPrefix || '',
      maxDepth: options.maxDepth || 2,
      unclassifiedPath: options.unclassifiedPath || 'api/unclassified.ts',
    }
  }

  /**
   * 对 API 路径进行分类
   */
  classify(path: string): CategoryInfo {
    // 1. 移除公共前缀
    const normalizedPath = this.removePrefix(path)

    // 2. 检查是否符合分类规则
    if (!this.matchesPattern(normalizedPath)) {
      return {
        primary: 'unclassified',
        depth: 0,
        isUnclassified: true,
        filePath: this.options.unclassifiedPath,
      }
    }

    // 3. 提取分类层级
    const segments = this.extractSegments(normalizedPath)

    if (segments.length === 0) {
      return {
        primary: 'unclassified',
        depth: 0,
        isUnclassified: true,
        filePath: this.options.unclassifiedPath,
      }
    }

    return {
      primary: segments[0]!,
      secondary: segments[1],
      depth: segments.length,
      isUnclassified: false,
      filePath: this.generateFilePath(segments),
    }
  }

  /**
   * 移除公共前缀
   */
  private removePrefix(path: string): string {
    if (!this.options.commonPrefix) {
      return path
    }

    if (path.startsWith(this.options.commonPrefix)) {
      return path.slice(this.options.commonPrefix.length)
    }

    return path
  }

  /**
   * 检查路径是否符合标准格式
   */
  private matchesPattern(path: string): boolean {
    // 必须以 / 开头
    if (!path.startsWith('/')) {
      return false
    }

    // 必须有至少一个路径段（不包括参数）
    const segments = this.extractSegments(path)
    return segments.length > 0
  }

  /**
   * 提取路径段（忽略参数）
   */
  private extractSegments(path: string): string[] {
    return path
      .split('/')
      .filter(segment => {
        // 过滤空段
        if (!segment) return false
        // 过滤参数段（{xxx}）
        if (segment.startsWith('{') && segment.endsWith('}')) return false
        // 过滤特殊字符开头的段
        if (!/^[a-zA-Z0-9-_]+$/.test(segment)) return false
        return true
      })
      .slice(0, this.options.maxDepth) // 限制深度
  }

  /**
   * 生成文件路径
   */
  private generateFilePath(segments: string[]): string {
    if (segments.length === 0) {
      return this.options.unclassifiedPath
    }

    // 转换为小写并用 / 连接
    const pathParts = segments.map(s => s.toLowerCase())
    return `api/${pathParts.join('/')}/index.ts`
  }

  /**
   * 批量分类
   */
  classifyBatch(paths: string[]): Map<string, string[]> {
    const groups = new Map<string, string[]>()

    for (const path of paths) {
      const category = this.classify(path)
      const filePath = category.filePath

      if (!groups.has(filePath)) {
        groups.set(filePath, [])
      }

      groups.get(filePath)!.push(path)
    }

    return groups
  }
}
