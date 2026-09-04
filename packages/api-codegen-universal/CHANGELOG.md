# api-codegen-universal

## 0.7.0

### Minor Changes

- [`4b12ab6`](https://github.com/XSIJIE975/api-codegen-universal/commit/4b12ab6f609a846cfac8b80392ef10e436152d2d) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - 修复 operationId 归一化冲突导致的重复函数名/类型名

  当两个 API 路径仅分隔符不同（如 `/a/resource-detail` 与 `/a/resource/detail`）时，生成的 operationId 原始字符串互不相同，但在下游 camelCase / PascalCase 等命名变换后会坍缩为同一个标识符，导致同一输出中产生重复的函数名与类型名（TS Duplicate identifier）。
  - **`generateOperationId` 分词规则与下游命名变换对齐**：路径段按 `-/`/`_` 拆词后 PascalCase 拼接（原实现仅按 `/` 切段，段内分隔符原样保留），生成的 operationId 不再残留分隔符。
  - **新增 operationId 归一化唯一性保证**：以"小写 + 去分隔符"的归一化 key 检测冲突，按 `(path, method)` 字典序保留第一个，其余追加数字后缀（`2`、`3`…）自动消歧，结果与文档顺序无关。消歧在参数/请求体/响应类型名派生之前完成，保证类型名与 operationId 始终同步。
  - **`OpenAPIOptions` 新增可选 `warnings` 透传**：传入 warnings 收集器后，消歧重命名会以 `renamedDuplicateOperationIds` 统计与 samples 汇总输出（Apifox 适配器已自动透传，无需额外配置）。

  兼容性说明：对未发生冲突的接口，经由命名变换后的最终函数名与类型名不变；仅直接消费原始 operationId 的调用方会看到更干净（不含分隔符）的 id。

## 0.6.5

### Patch Changes

- Improve type safety, performance and maintainability
  - Add `sanitizeOptions` to strip sensitive fields (token, apiKey, etc.) from metadata before logging
  - Rewrite OpenAPI adapter to stateless `ParseContext` pattern, eliminating shared mutable state
  - Extract shared `type-ref-utils` and `ast-utils` across adapters
  - Add configurable fetch timeout via `AbortSignal.timeout` (default 30s) with validation
  - Replace `JSON.parse/stringify` with `structuredClone`; replace random collision suffix with deterministic SHA-256
  - Replace `any` in Apifox parser with recursive `OpenAPIRaw` type; improve generic name collision resolution
  - Validate `x-apifox-generic` shape and YAML parse results; improve non-Error exception handling
  - Restore CJS output via `bundle: true`; clean up unused dependencies
  - Add 100+ new tests covering sanitize, logging, adapter, parser internals, generic collision and real-API integration

## 0.6.4

### Patch Changes

- [#13](https://github.com/XSIJIE975/api-codegen-universal/pull/13) [`1d58776`](https://github.com/XSIJIE975/api-codegen-universal/commit/1d5877698feeb11b7b8f810019ec9c9bfb885de3) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - Add unified logging and warnings summary feature with logLevel, logger injection, and logSampleLimit support

## 0.6.3

### Patch Changes

- [#11](https://github.com/XSIJIE975/api-codegen-universal/pull/11) [`c4cf838`](https://github.com/XSIJIE975/api-codegen-universal/commit/c4cf83873115587920a693da2331ff4d81cc005d) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - Fix the Apifox adapter to handle `null` schemas and deduplicate `operationId` values to prevent conflicts in generated output.

## 0.6.2

### Patch Changes

- [`74e7c98`](https://github.com/XSIJIE975/api-codegen-universal/commit/74e7c989a10cf6ee9c0ad821629c759b4d851f02) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - fix: ensure RequestResponseExtractor respects interfaceExportMode when generating inline interfaces

## 0.6.1

### Patch Changes

- [`df4639e`](https://github.com/XSIJIE975/api-codegen-universal/commit/df4639e5df5f8fc5068afd3c018ed009ff52a2de) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - - feat: enhance OpenAPI document loading with support for Buffer and improved error handling
  - feat: support extraction of inline schemas in request bodies
  - fix: optimize type parsing and response content traversal logic

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
