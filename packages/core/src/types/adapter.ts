/**
 * 适配器接口定义
 * 定义了所有数据源适配器必须遵循的规范
 */

import type { StandardOutput } from './standard.js';

/**
 * 适配器基础接口
 * 所有适配器（如 OpenAPIAdapter, ApifoxAdapter, SwaggerAdapter）都必须实现此接口
 *
 * @template TOptions 适配器特定的配置选项类型
 * @template TSource 输入源类型（如 URL 字符串、文件路径、JSON 对象等）
 */
export interface IAdapter<TOptions = AdapterOptions, TSource = unknown> {
  /**
   * 解析输入源并返回标准格式
   * 这是适配器的核心方法，负责将特定格式的 API 文档转换为统一的 StandardOutput
   *
   * @param source 输入源(各适配器自定义类型)
   * @param options 适配器特定选项
   * @returns Promise<StandardOutput> 标准输出格式
   */
  parse(source: TSource, options?: TOptions): Promise<StandardOutput>;

  /**
   * 验证输入源是否有效
   * 用于在解析前快速检查输入源格式是否符合该适配器的要求
   *
   * @param source 输入源
   * @returns Promise<boolean> 是否有效
   */
  validate(source: TSource): Promise<boolean>;
}

/**
 * 适配器选项(基类)
 * 不同适配器可以继承此类型添加特定选项
 * 允许包含任意键值对以支持扩展配置
 */
export interface AdapterOptions {
  [key: string]: unknown;
}
