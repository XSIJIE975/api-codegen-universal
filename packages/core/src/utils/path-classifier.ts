/**
 * 路径分类器
 * 根据 API 路径自动分类到不同的文件
 */

import type { CategoryInfo } from '../types'

export interface PathClassifierOptions {
  /** 公共前缀(如 '/api/v1') */
  commonPrefix?: string
  /** 最大分类深度(默认2) */
  maxDepth?: number
}

/**
 * 路径分类器
 */
export class PathClassifier {
  private commonPrefix: string
  private maxDepth: number

  constructor(options: PathClassifierOptions = {}) {
    this.commonPrefix = options.commonPrefix || ''
    this.maxDepth = options.maxDepth || 2
  }

  /**
   * 对单个路径进行分类
   */
  classify(path: string): CategoryInfo {
    // 1. 移除公共前缀
    const normalizedPath = this.removePrefix(path)

    // 2. 提取路径段(忽略参数)
    const segments = this.extractSegments(normalizedPath)

    // 3. 检查是否能分类
    if (segments.length === 0) {
      return this.createUnclassified()
    }

    // 4. 生成分类信息
    const primary = segments[0]!
    const secondary = segments.length > 1 ? segments[1] : undefined

    return {
      primary,
      secondary,
      depth: segments.length,
      isUnclassified: false,
      filePath: this.generateFilePath(segments),
    }
  }

  /**
   * 批量分类多个路径
   */
  classifyBatch(paths: string[]): Map<string, CategoryInfo> {
    const result = new Map<string, CategoryInfo>()
    for (const path of paths) {
      result.set(path, this.classify(path))
    }
    return result
  }

  /**
   * 移除公共前缀
   */
  private removePrefix(path: string): string {
    if (!this.commonPrefix) return path
    if (path.startsWith(this.commonPrefix)) {
      return path.slice(this.commonPrefix.length)
    }
    return path
  }

  /**
   * 提取路径段(忽略参数)
   */
  private extractSegments(path: string): string[] {
    return path
      .split('/')
      .filter(segment => {
        // 过滤空字符串
        if (!segment) return false
        // 过滤路径参数 {id}
        if (segment.startsWith('{') && segment.endsWith('}')) return false
        return true
      })
      .slice(0, this.maxDepth) // 限制深度
  }

  /**
   * 生成文件路径
   */
  private generateFilePath(segments: string[]): string {
    if (segments.length === 0) {
      return 'api/unclassified.ts'
    }
    return `api/${segments.join('/')}/index.ts`
  }

  /**
   * 创建未分类信息
   */
  private createUnclassified(): CategoryInfo {
    return {
      primary: 'unclassified',
      depth: 0,
      isUnclassified: true,
      filePath: 'api/unclassified.ts',
    }
  }
}
