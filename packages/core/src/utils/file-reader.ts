import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

/**
 * 文件读取工具
 */
export class FileReader {
  /**
   * 读取文件内容
   * @param source 文件路径、URL 或 JSON 对象
   * @returns 解析后的 JSON 对象
   */
  static async read(source: string | URL | object): Promise<any> {
    // 如果已经是对象，直接返回
    if (typeof source === 'object' && !(source instanceof URL)) {
      return source
    }

    // 转换为 URL
    const url = this.toURL(source)

    // 根据协议选择读取方式
    if (url.protocol === 'file:') {
      return this.readFile(url)
    }

    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return this.readURL(url)
    }

    throw new Error(`Unsupported protocol: ${url.protocol}`)
  }

  /**
   * 将字符串或 URL 转换为 URL 对象
   */
  private static toURL(source: string | URL): URL {
    if (source instanceof URL) {
      return source
    }

    // 如果是绝对路径或相对路径
    if (typeof source === 'string') {
      // 如果以协议开头，直接创建 URL
      if (source.startsWith('http://') || source.startsWith('https://')) {
        return new URL(source)
      }

      // 否则视为文件路径
      return pathToFileURL(source)
    }

    throw new Error('Invalid source type')
  }

  /**
   * 读取本地文件
   */
  private static async readFile(url: URL): Promise<any> {
    const content = await fs.readFile(url, 'utf-8')
    return this.parseContent(content, url.pathname)
  }

  /**
   * 从 URL 读取
   */
  private static async readURL(url: URL): Promise<any> {
    const response = await fetch(url.toString())

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const content = await response.text()

    return this.parseContent(content, url.pathname, contentType)
  }

  /**
   * 解析内容
   */
  private static parseContent(
    content: string,
    pathname: string,
    contentType?: string
  ): any {
    // 判断是 JSON 还是 YAML
    const isYaml =
      pathname.endsWith('.yaml') ||
      pathname.endsWith('.yml') ||
      contentType?.includes('yaml') ||
      contentType?.includes('yml')

    if (isYaml) {
      // 使用 @redocly/openapi-core 解析 YAML
      return this.parseYAML(content)
    }

    return JSON.parse(content)
  }

  /**
   * 解析 YAML（简单实现，复杂情况使用 @redocly/openapi-core）
   */
  private static parseYAML(content: string): any {
    // TODO: 使用 @redocly/openapi-core 的 bundle 功能解析 YAML
    // 目前先尝试当作 JSON 解析
    try {
      return JSON.parse(content)
    } catch {
      throw new Error('YAML parsing not fully implemented yet. Please use JSON or wait for YAML support.')
    }
  }
}
