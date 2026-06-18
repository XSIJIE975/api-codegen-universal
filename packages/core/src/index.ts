/**
 * @api-codegen-universal/core
 * 核心标准类型定义
 * 所有适配器都必须遵循这些标准格式
 */

// 导出标准类型定义
export * from './types';

// 导出元数据净化工具（供适配器在写入 Metadata.options 前使用）
export { sanitizeOptions } from './sanitize';
