/**
 * 适配器接口定义
 * 定义了所有数据源适配器必须遵循的规范
 */

import type { StandardOutput } from './standard.js';
import type { LogLevel, Logger } from '../logging/index.js';

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
  /**
   * 日志等级。默认：'error'
   *
   * 说明：默认仅输出 error，避免兼容性修复过程中输出过多日志。
   * 如需看到 warnings summary，请显式设置为 'warn' 或更高。
   */
  logLevel?: LogLevel;
  /**
   * 自定义 logger（可选）。
   * 默认采用 `console.<level>(message, meta)` 的输出格式（Format A）。
   */
  logger?: Logger;
  /**
   * warnings summary 中最多保留的 samples 数量。默认：10
   * 用于避免单次解析产生过大的日志 payload。
   */
  logSampleLimit?: number;
  [key: string]: unknown;
}
