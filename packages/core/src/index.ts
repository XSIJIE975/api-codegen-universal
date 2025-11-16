/**
 * @api-codegen/core
 * 核心解析引擎 - 主入口
 */

// 导出类型定义
export * from './types'

// 导出工具类
export * from './utils'

// 导出适配器
export { OpenAPIAdapter } from './adapters/openapi'

// 导出适配器接口
export type { IAdapter } from './types/adapter'
