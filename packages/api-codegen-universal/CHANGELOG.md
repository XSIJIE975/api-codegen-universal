# api-codegen-universal

## 0.6.0

### Minor Changes

- [#7](https://github.com/XSIJIE975/api-codegen-universal/pull/7) [`3bea986`](https://github.com/XSIJIE975/api-codegen-universal/commit/3bea9864dd4462599688342770a7210db673601b) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - - feat: schema definition 新增 extends 字段以支持继承关系
  - feat: 新增 naming utils 工具类用于统一命名风格转换
  - feat: 优化 schema 提取逻辑，支持交叉类型继承和 jsdoc 解析重构
  - refactor: 应用 naming utils 实现全局命名风格统一，并修复 oneof 类型处理

## 0.5.0

### Minor Changes

- [#5](https://github.com/XSIJIE975/api-codegen-universal/pull/5) [`ee98cd0`](https://github.com/XSIJIE975/api-codegen-universal/commit/ee98cd0bad6701fdf44a1f47be51806d53a2590b) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - feat: Release v0.5.0
  - **Features**:
    - Support response object naming style configuration (`namingStyle`); generated response interface names will follow the configured style.
    - Add reference repair and generic name processing to Apifox adapter, improving compatibility with complex Schemas.
  - **Bug Fixes**:
    - Fix URL-encoded Schema name parsing issue in Apifox adapter.
    - Fix generic detection and interface generation logic in OpenAPI adapter.
    - Enhance robustness of inline response processing and API extraction in OpenAPI adapter.
  - **Performance**:
    - Eliminate redundant object creation and cache expensive operations to improve performance.
  - **Documentation & Tests**:
    - Comprehensively improve source code comments and type definition explanations for core module, OpenAPI adapter, and Apifox adapter.
    - Add unit tests for core modules to improve project stability.

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
