# api-codegen-universal

## 0.9.1

### Patch Changes

- [#20](https://github.com/XSIJIE975/api-codegen-universal/pull/20) [`339c166`](https://github.com/XSIJIE975/api-codegen-universal/commit/339c1660a79c76cfcacd6f20992268663ab809af) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - 修复 `typeNamePrefix` 与命名大小写规整的顺序缺陷：前缀化改为逐段 PascalCase 规整

  启用 `codeGeneration.typeNamePrefix` 时，前缀原先直接与原始 schema 名拼接成整串，再统一做一次命名风格转换；而整串转换只会将首字母大写，因此以小写字母开头的原始名会产出大小写畸形的声明名。以配置前缀 `Demo` 为例：
  - 原始名 `key` → `Demokey`（期望 `DemoKey`），并连带生成 `declare type Demokey = Record<string, never>` 与拆分文件 `Demokey.d.ts`；
  - 原始名 `key1` → `Demokey1`（期望 `DemoKey1`）。

  声明名、`separateTypes` 拆分的文件名与 `$ref` 互引三处使用同一名字，因此三处一致地错。

  修复后，前缀按 `PascalCase(prefix) + PascalCase(rawName)` 逐段规整后再拼接：
  - `key` → `DemoKey`，`key1` → `DemoKey1`，`pageDTO` → `DemoPageDTO`；
  - 已是 PascalCase 的名称结果不变（幂等），如 `UserProfileSaveDTO` → `DemoUserProfileSaveDTO`；
  - 组件 schema、`schemaNameMap` / `genericInfoMap` 键、泛型基名与泛型参数、operationId/哈希派生的内联声明名全部经由同一处 `applyTypeNamePrefix` 收敛，声明名、拆分文件名与 `$ref` 互引保持一致；
  - 不配置 `typeNamePrefix` 时输出逐字节不变；已带前缀的输入名仍跳过加前缀，不产生双重前缀。

## 0.9.0

### Minor Changes

- [#18](https://github.com/XSIJIE975/api-codegen-universal/pull/18) [`75e8c13`](https://github.com/XSIJIE975/api-codegen-universal/commit/75e8c132ea55b4e9bdd6d455ffaaa265423414b8) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - feat(openapi): add `codeGeneration.typeNamePrefix`

  When multiple projects emit global `declare` types with
  `interfaceExportMode: 'declare'`, schemas with the same name (for example
  `PageDTO` or `IdDTO`) collide in the global scope. `typeNamePrefix` injects a
  project prefix at generation time, so declaration names, interfaces/schemas
  keys, `$ref` references, generic composition names and split `{TypeName}.d.ts`
  file names remain isolated.

  The prefix covers component schemas, operation-derived parameter interfaces,
  inline request/response schemas, anonymous hash-named schemas and synthesized
  generic bases. Input names that already start with the prefix are skipped with
  a `console.warn` to avoid double prefixes. The option is opt-in: omitting it
  keeps existing output unchanged.

## 0.8.0

### Minor Changes

- [`72bc582`](https://github.com/XSIJIE975/api-codegen-universal/commit/72bc582b174d9b96bb8832b3b78211ac7c03acba) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - Fix a batch of verified bugs, add the `emitStandardOutput` file emitter, and cache `printNode` output:

  **Bug fixes**
  - **openapi**: schema names that collapse after naming-style conversion (e.g. `user_profile` vs `userProfile`) no longer silently overwrite each other; a collision-free name map is shared by schema extraction, interface generation and response refs, and renames are reported via a new `renamedCollidingSchemas` warnings counter.
  - **openapi**: URL-encoded schema keys are now decoded consistently, so `schemas` and `interfaces` no longer disagree for pre-encoded documents (e.g. `User%20Dto`).
  - **openapi**: `requestBody.required` is restored from the AST instead of being hardcoded to `true`; unspecified request bodies now correctly default to `false` per the OpenAPI spec.
  - **openapi**: `commonPrefix` is only stripped at path segment boundaries, fixing `commonPrefix: '/api'` mangling `/apis/users` into `s/users`.
  - **openapi**: `TRACE` is added to the `HttpMethod` union, matching OpenAPI 3.0 path-item fields.
  - **openapi**: non-structural unions/intersections (e.g. `A[] & B[]`) now keep their original type text in a new `SchemaDefinition.rawType` field instead of degrading to an empty object.
  - **openapi**: multi-line `@description` content is preserved for schema properties and response statuses (previously only the first line was kept).
  - **openapi**: response headers are now extracted into `responses[status].headers`.
  - **openapi**: operation `tags` are restored from the raw document (the AST path drops them).
  - **openapi**: `validate()` applies `fetchTimeoutMs` for URL inputs instead of waiting indefinitely.
  - **openapi**: the warnings collector and other runtime plumbing keys are excluded from `metadata.options`, and synthetic comments are read through the official `ts.getSyntheticLeadingComments` API.
  - **core**: `sanitizeOptions` no longer reports shared (DAG) object references as `[circular]`; true cycles are still detected.
  - **apifox**: explicitly-`undefined` `exportOptions` keys no longer override request defaults (e.g. `scope`).

  **New features**
  - **emitter**: new `emitStandardOutput(output, { outDir, modelsDir?, barrel?, header? })` writes the standard output to disk — single-category interfaces land in their API category file, shared/orphan ones in `models/shared.ts`; cross-file type imports and an optional barrel `index.ts` are generated automatically. Emitted output passes `tsc --strict`.
  - **perf**: `printNode` output is cached per AST node (WeakMap), removing repeated printing across schema extraction, interface generation and generic detection.
  - docs: `CONTEXT.md` glossary and `docs/plans/ROADMAP.md` with the prioritized backlog (request-client generation, Swagger 2.0 adapter, Zod emission, CLI/config, watch mode).

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
