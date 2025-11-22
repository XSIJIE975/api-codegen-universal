// src/adapters/apifox/utils.ts

import type { CategoryInfo, NamingStyle } from '@api-codegen-universal/core';
import type { ApifoxDataSchema } from './types';

export class PathClassifier {
  private outputPrefix: string;
  private commonPrefix: string;
  private maxDepth: number;

  constructor(options: { outputPrefix?: string; commonPrefix?: string; maxDepth?: number } = {}) {
    this.outputPrefix = options.outputPrefix || 'api';
    this.commonPrefix = options.commonPrefix || '';
    this.maxDepth = options.maxDepth || 2;
  }

  classify(path: string): CategoryInfo {
    let cleanPath = path;
    if (this.commonPrefix && cleanPath.startsWith(this.commonPrefix)) {
      cleanPath = cleanPath.slice(this.commonPrefix.length);
    }
    // 移除开头的 /
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);

    const segments = cleanPath.split('/')
      .filter(s => s && !s.includes('{')) // 忽略空段和参数段
      .slice(0, this.maxDepth);

    if (segments.length === 0) {
      return {
        segments: [],
        depth: 0,
        isUnclassified: true,
        filePath: `${this.outputPrefix}/unclassified.ts`
      };
    }

    return {
      segments,
      depth: segments.length,
      isUnclassified: false,
      filePath: `${this.outputPrefix}/${segments.join('/')}/index.ts`
    };
  }
}

export class SchemaIdResolver {
  private idToNameMap = new Map<string, string>();

  constructor(dataSchemas: ApifoxDataSchema[]) {
    dataSchemas.forEach(schema => {
      this.idToNameMap.set(String(schema.id), schema.name);
    });
  }

  /**
   * 解析 Apifox 的引用 ID
   * 例如: "#/definitions/12345" -> "UserDto"
   */
  resolveRef(ref: string): string | undefined {
    const match = ref.match(/#\/definitions\/(\d+)/);
    if (match && match[1]) {
      return this.idToNameMap.get(match[1]);
    }
    return undefined;
  }
}

export class NamingUtils {
  /**
   * 根据风格转换名称
   */
  static convert(name: string, style: NamingStyle = 'PascalCase'): string {
    // 1. 先分割单词 (支持下划线、横杠、驼峰)
    const words = name
      .replace(/([a-z])([A-Z])/g, '$1 $2') // 拆分驼峰
      .replace(/[^a-zA-Z0-9]+/g, ' ') // 替换非字母数字为通过空格
      .trim()
      .split(' ');

    if (words.length === 0) return name;

    // 2. 根据目标风格重组
    switch (style) {
      case 'PascalCase':
        return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');

      case 'camelCase':
        return words.map((w, i) =>
          i === 0
            ? w.toLowerCase()
            : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        ).join('');

      case 'snake_case':
        return words.map(w => w.toLowerCase()).join('_');

      case 'kebab-case':
        return words.map(w => w.toLowerCase()).join('-');

      default:
        return name; // 原样返回
    }
  }
}