/**
 * 路径分类器
 * 根据 API 路径自动分类到不同的文件
 */

import type { CategoryInfo } from '@api-codegen-universal/core';
import type { PathClassificationOptions } from '../types';

export class PathClassifier {
  private readonly outputPrefix: string;
  private readonly commonPrefix: string;
  private readonly maxDepth: number;

  constructor(options: PathClassificationOptions = {}) {
    this.outputPrefix = options.outputPrefix || 'api';
    this.commonPrefix = options.commonPrefix || '';
    this.maxDepth = options.maxDepth || 2;
  }

  /**
   * 对单个路径进行分类
   */
  classify(path: string): CategoryInfo {
    const normalizedPath = this.removePrefix(path);
    const segments = this.extractSegments(normalizedPath);

    if (segments.length === 0) {
      return this.createUnclassified();
    }

    return {
      segments,
      depth: segments.length,
      isUnclassified: false,
      filePath: this.generateFilePath(segments),
    };
  }

  private removePrefix(path: string): string {
    if (!this.commonPrefix) return path;
    if (path.startsWith(this.commonPrefix)) {
      return path.slice(this.commonPrefix.length);
    }
    return path;
  }

  private extractSegments(path: string): string[] {
    return path
      .split('/')
      .filter((segment) => {
        if (!segment) return false;
        if (segment.startsWith('{') && segment.endsWith('}')) return false;
        return true;
      })
      .slice(0, this.maxDepth);
  }

  private generateFilePath(segments: string[]): string {
    return `${this.outputPrefix}/${segments.join('/')}/index.ts`;
  }

  private createUnclassified(): CategoryInfo {
    return {
      segments: [],
      depth: 0,
      isUnclassified: true,
      filePath: `${this.outputPrefix}/unclassified.ts`,
    };
  }
}
