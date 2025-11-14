import { AdapterFactory } from './factory'
import type { IAdapter, InputSource } from './adapters/base'
import type { ParseOptions, StandardOutput } from './types'

/**
 * 解析 API 规范并输出标准格式
 * @param options 解析选项
 * @returns 标准输出格式
 *
 * @example
 * ```typescript
 * // 从本地文件解析
 * const result = await parse({ source: './swagger.json' })
 *
 * // 从远程 URL 解析
 * const result = await parse({ source: 'https://api.example.com/openapi.json' })
 *
 * // 从 JSON 对象解析
 * const result = await parse({ source: openapiObject })
 *
 * // 自定义配置
 * const result = await parse({
 *   source: './swagger.yaml',
 *   parser: 'openapi',
 *   openapi: {
 *     commonPrefix: '/api/v1',
 *     genericWrappers: ['ApiSuccessResponse', 'PageResult']
 *   }
 * })
 * ```
 */
export async function parse(options: ParseOptions): Promise<StandardOutput> {
  const { source, parser = 'auto' } = options

  // 1. 创建适配器
  let adapter: IAdapter
  if (parser === 'auto') {
    adapter = await AdapterFactory.autoDetect(source as InputSource)
  } else {
    adapter = AdapterFactory.create(parser)
  }

  // 2. 解析
  const adapterOptions = parser === 'openapi' ? options.openapi : options.apifox
  const result = await adapter.parse(source as InputSource, adapterOptions)

  return result
}

// 导出所有类型
export * from './types'
// 导出适配器相关（排除 InputSource 避免冲突）
export { IAdapter, BaseAdapter } from './adapters/base'
export { OpenAPIAdapter } from './adapters/openapi'
export { ApifoxAdapter } from './adapters/apifox'
export { AdapterFactory } from './factory'
