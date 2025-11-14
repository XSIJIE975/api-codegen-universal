import { BaseAdapter, type InputSource, type AdapterOptions } from '../base'
import type { StandardOutput } from '../../types'
import { FileReader } from '../../utils/file-reader'

/**
 * Apifox 适配器（预留）
 * 负责解析 Apifox 格式
 */
export class ApifoxAdapter extends BaseAdapter {
  async parse(_source: InputSource, _options?: AdapterOptions): Promise<StandardOutput> {
    throw new Error('ApifoxAdapter not implemented yet')
  }

  async validate(source: InputSource): Promise<boolean> {
    try {
      const content = await FileReader.read(source)
      return this.isApifox(content)
    } catch {
      return false
    }
  }

  /**
   * 检查是否为 Apifox 格式
   */
  private isApifox(content: any): boolean {
    return typeof content === 'object' && content.apifoxVersion !== undefined
  }
}
