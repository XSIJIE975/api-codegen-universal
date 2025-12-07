# api-codegen-universal

## 0.4.0

### Minor Changes

- [`e5e84c8`](https://github.com/XSIJIE975/api-codegen-universal/commit/e5e84c80cf17389864e95c5b487f8d1927941f39) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - feat(openapi): 支持提取接口摘要、标签及文档元数据
  - 更新 `Metadata` 类型定义，增加 `options` 字段。
  - 支持从生成的 TypeScript 代码 JSDoc 中提取接口的 `summary` (摘要)、`description` (描述)、`tags` (标签) 和 `deprecated` (废弃) 状态。
  - 新增 `loadOpenAPIDocument` 方法，支持加载原始 OpenAPI JSON/YAML 文档。
  - 支持提取 OpenAPI 文档的元数据，包括 `title` (标题)、`description` (描述) 和 `baseUrl` (基础路径)。
  - 修复了相关类型定义，增强了类型安全性。

## 0.3.0

### Minor Changes

- [#1](https://github.com/XSIJIE975/api-codegen-universal/pull/1) [`32121e6`](https://github.com/XSIJIE975/api-codegen-universal/commit/32121e613a63f7ea0044a4d5ed4e09aaf7e4e24c) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - feat: 支持 Apifox 代码生成适配器
