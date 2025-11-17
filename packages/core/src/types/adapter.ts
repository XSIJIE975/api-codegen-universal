/**
 * 适配器接口定义
 */

import type { StandardOutput } from './standard';
import type { InputSource } from './config';

/**
 * 适配器基础接口
 * 所有适配器都必须实现此接口
 */
export interface IAdapter {
  /**
   * 解析输入源并返回标准格式
   * @param source 输入源(文件路径/URL/对象)
   * @param options 适配器特定选项
   * @returns 标准输出格式
   */
  parse(source: InputSource, options?: AdapterOptions): Promise<StandardOutput>;

  /**
   * 验证输入源是否有效
   * @param source 输入源
   * @returns 是否有效
   */
  validate(source: InputSource): Promise<boolean>;
}

/**
 * 适配器选项(基类)
 * 不同适配器可以继承此类型添加特定选项
 */
export interface AdapterOptions {
  [key: string]: unknown;
}
