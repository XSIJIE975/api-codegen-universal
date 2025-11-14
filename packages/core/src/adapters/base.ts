import type { StandardOutput } from '../types'

/**
 * 输入源类型
 */
export type InputSource = string | URL | object

/**
 * 适配器选项
 */
export interface AdapterOptions {
  [key: string]: any
}

/**
 * 适配器接口
 * 所有适配器都必须实现这个接口
 */
export interface IAdapter {
  /**
   * 解析输入源，返回标准格式
   * @param source 输入源（文件路径、URL 或 JSON 对象）
   * @param options 适配器选项
   * @returns 标准输出格式
   */
  parse(source: InputSource, options?: AdapterOptions): Promise<StandardOutput>

  /**
   * 验证输入源是否有效
   * @param source 输入源
   * @returns 是否有效
   */
  validate(source: InputSource): Promise<boolean>
}

/**
 * 适配器基类
 * 提供通用的工具方法
 */
export abstract class BaseAdapter implements IAdapter {
  abstract parse(source: InputSource, options?: AdapterOptions): Promise<StandardOutput>

  async validate(source: InputSource): Promise<boolean> {
    try {
      await this.parse(source)
      return true
    } catch {
      return false
    }
  }
}
