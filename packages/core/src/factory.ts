import { OpenAPIAdapter } from './adapters/openapi'
import { ApifoxAdapter } from './adapters/apifox'
import type { IAdapter, InputSource } from './adapters/base'
import { FileReader } from './utils/file-reader'

/**
 * 适配器工厂
 * 负责创建和选择适配器
 */
export class AdapterFactory {
  /**
   * 根据类型创建适配器
   */
  static create(type: 'openapi' | 'apifox'): IAdapter {
    switch (type) {
      case 'openapi':
        return new OpenAPIAdapter()
      case 'apifox':
        return new ApifoxAdapter()
      default:
        throw new Error(`Unknown adapter type: ${type}`)
    }
  }

  /**
   * 自动检测输入类型并创建适配器
   */
  static async autoDetect(input: InputSource): Promise<IAdapter> {
    // 读取内容
    const content = await FileReader.read(input)

    // 检测格式
    if (this.isOpenAPI(content)) {
      return new OpenAPIAdapter()
    }

    if (this.isApifox(content)) {
      return new ApifoxAdapter()
    }

    throw new Error('Unknown API specification format')
  }

  /**
   * 检查是否为 OpenAPI 格式
   */
  private static isOpenAPI(content: any): boolean {
    return (
      typeof content === 'object' &&
      (content.openapi !== undefined || content.swagger !== undefined)
    )
  }

  /**
   * 检查是否为 Apifox 格式
   */
  private static isApifox(content: any): boolean {
    return typeof content === 'object' && content.apifoxVersion !== undefined
  }
}
