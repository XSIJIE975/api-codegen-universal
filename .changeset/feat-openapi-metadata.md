---
'api-codegen-universal': minor
---

feat(openapi): 支持提取接口摘要、标签及文档元数据

- 更新 `Metadata` 类型定义，增加 `options` 字段。
- 支持从生成的 TypeScript 代码 JSDoc 中提取接口的 `summary` (摘要)、`description` (描述)、`tags` (标签) 和 `deprecated` (废弃) 状态。
- 新增 `loadOpenAPIDocument` 方法，支持加载原始 OpenAPI JSON/YAML 文档。
- 支持提取 OpenAPI 文档的元数据，包括 `title` (标题)、`description` (描述) 和 `baseUrl` (基础路径)。
- 修复了相关类型定义，增强了类型安全性。
