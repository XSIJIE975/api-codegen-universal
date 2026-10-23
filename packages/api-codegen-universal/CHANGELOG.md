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

- [#18](https://github.com/XSIJIE975/api-codegen-universal/pull/18) [`75e8c13`](https://github.com/XSIJIE975/api-codegen-universal/commit/75e8c132ea55b4e9bdd6d455ffaaa265423414b8) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - 新增 `codeGeneration.typeNamePrefix` 类型声明名前缀

  多个项目统一以 `interfaceExportMode: 'declare'` 输出全局 `.d.ts` 声明时，跨项目同名 schema（如 `PageDTO`、`IdDTO`）会在全局作用域合并/冲突。`typeNamePrefix` 在生成阶段为类型声明名注入项目前缀，使声明名、interfaces/schemas 注册表键、`$ref` 互引、泛型组合名与拆分后的 `{TypeName}.d.ts` 文件名自然隔离。

  前缀覆盖组件 schema、operationId 派生的参数接口、内联请求/响应 schema、匿名哈希 schema 与合成的泛型基类。已以前缀开头的输入名会跳过加前缀并输出 `console.warn` 告警，避免双重前缀。该选项按需启用：不配置时既有输出保持不变。

## 0.8.0

### Minor Changes

- [`72bc582`](https://github.com/XSIJIE975/api-codegen-universal/commit/72bc582b174d9b96bb8832b3b78211ac7c03acba) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - 修复一批已验证缺陷，新增 `emitStandardOutput` 文件输出器，并为 `printNode` 输出增加缓存：

  **缺陷修复**
  - **openapi**：命名风格转换后坍缩的 schema 名（如 `user_profile` 与 `userProfile`）不再互相静默覆盖；schema 提取、接口生成与响应引用三处共享同一份无冲突名映射，重命名通过新增的 `renamedCollidingSchemas` warnings 计数器上报。
  - **openapi**：URL 编码的 schema 键现在会一致解码，预编码文档（如 `User%20Dto`）的 `schemas` 与 `interfaces` 不再不一致。
  - **openapi**：`requestBody.required` 改从 AST 还原，不再硬编码为 `true`；未指定的请求体按 OpenAPI 规范正确默认为 `false`。
  - **openapi**：`commonPrefix` 只在路径段边界剥离，修复 `commonPrefix: '/api'` 把 `/apis/users` 错切为 `s/users` 的问题。
  - **openapi**：`HttpMethod` 联合类型新增 `TRACE`，与 OpenAPI 3.0 path-item 字段对齐。
  - **openapi**：非结构性联合/交叉类型（如 `A[] & B[]`）现在把原始类型文本保留到新增的 `SchemaDefinition.rawType` 字段，不再退化为空对象。
  - **openapi**：schema 属性与响应状态的多行 `@description` 内容现在完整保留（此前只保留首行）。
  - **openapi**：响应头现在会提取到 `responses[status].headers`。
  - **openapi**：operation 的 `tags` 从原始文档还原（AST 路径会丢失它们）。
  - **openapi**：`validate()` 对 URL 输入同样应用 `fetchTimeoutMs`，不再无限等待。
  - **openapi**：warnings 收集器等运行时管道键不再进入 `metadata.options`；合成注释改经官方 `ts.getSyntheticLeadingComments` API 读取。
  - **core**：`sanitizeOptions` 不再把共享（DAG）对象引用误报为 `[circular]`；真正的循环引用仍会被检测。
  - **apifox**：显式为 `undefined` 的 `exportOptions` 键不再覆盖请求默认值（如 `scope`）。

  **新功能**
  - **emitter**：新增 `emitStandardOutput(output, { outDir, modelsDir?, barrel?, header? })` 将标准输出写入磁盘——单分类 interfaces 落入对应 API 分类文件，共享/孤儿类型落入 `models/shared.ts`；跨文件类型导入与可选的 barrel `index.ts` 自动生成，产物可通过 `tsc --strict` 检查。
  - **perf**：`printNode` 输出按 AST 节点缓存（WeakMap），消除 schema 提取、接口生成与泛型检测之间的重复打印。
  - 文档：新增 `CONTEXT.md` 术语表与带优先级路线图的 `docs/plans/ROADMAP.md`（请求客户端生成、Swagger 2.0 适配器、Zod 产物、CLI/配置、watch 模式）。

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

- 提升类型安全性、性能与可维护性
  - 新增 `sanitizeOptions`，在写入日志前从 metadata 中剥离敏感字段（token、apiKey 等）
  - OpenAPI 适配器重写为无状态的 `ParseContext` 模式，消除共享可变状态
  - 跨适配器抽取共享的 `type-ref-utils` 与 `ast-utils`
  - 新增可配置的 fetch 超时（基于 `AbortSignal.timeout`，默认 30s）并做校验
  - 用 `structuredClone` 替代 `JSON.parse/stringify`；用确定性 SHA-256 替代随机冲突后缀
  - Apifox 解析器中的 `any` 替换为递归的 `OpenAPIRaw` 类型；改进泛型名冲突消解
  - 校验 `x-apifox-generic` 形状与 YAML 解析结果；改进非 Error 异常处理
  - 通过 `bundle: true` 恢复 CJS 产物；清理无用依赖
  - 新增 100+ 测试，覆盖 sanitize、日志、适配器、解析器内部、泛型冲突与真实 API 集成

## 0.6.4

### Patch Changes

- [#13](https://github.com/XSIJIE975/api-codegen-universal/pull/13) [`1d58776`](https://github.com/XSIJIE975/api-codegen-universal/commit/1d5877698feeb11b7b8f810019ec9c9bfb885de3) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - 新增统一日志与 warnings 汇总能力，支持 `logLevel`、logger 注入与 `logSampleLimit` 配置

## 0.6.3

### Patch Changes

- [#11](https://github.com/XSIJIE975/api-codegen-universal/pull/11) [`c4cf838`](https://github.com/XSIJIE975/api-codegen-universal/commit/c4cf83873115587920a693da2331ff4d81cc005d) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - 修复 Apifox 适配器对 `null` schema 的处理，并对 `operationId` 去重，避免生成产物中的冲突

## 0.6.2

### Patch Changes

- [`74e7c98`](https://github.com/XSIJIE975/api-codegen-universal/commit/74e7c989a10cf6ee9c0ad821629c759b4d851f02) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - 修复 RequestResponseExtractor 生成内联接口时未遵循 `interfaceExportMode` 的问题

## 0.6.1

### Patch Changes

- [`df4639e`](https://github.com/XSIJIE975/api-codegen-universal/commit/df4639e5df5f8fc5068afd3c018ed009ff52a2de) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - 增强 OpenAPI 文档加载：支持 Buffer 输入并改进错误处理
  - 支持提取请求体中的内联 schema
  - 优化类型解析与响应 content 遍历逻辑

## 0.6.0

### Minor Changes

- [#7](https://github.com/XSIJIE975/api-codegen-universal/pull/7) [`3bea986`](https://github.com/XSIJIE975/api-codegen-universal/commit/3bea9864dd4462599688342770a7210db673601b) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - schema 定义新增 extends 字段以支持继承关系
  - 新增 naming utils 工具类，用于统一命名风格转换
  - 优化 schema 提取逻辑，支持交叉类型继承，并重构 jsdoc 解析
  - 应用 naming utils 实现全局命名风格统一，并修复 oneof 类型处理

## 0.5.0

### Minor Changes

- [#5](https://github.com/XSIJIE975/api-codegen-universal/pull/5) [`ee98cd0`](https://github.com/XSIJIE975/api-codegen-universal/commit/ee98cd0bad6701fdf44a1f47be51806d53a2590b) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - 发布 v0.5.0
  - **功能**：
    - 支持响应对象命名风格配置（`namingStyle`），生成的响应接口名将遵循所配置的风格。
    - Apifox 适配器新增引用修复与泛型名处理，改善对复杂 Schema 的兼容性。
  - **缺陷修复**：
    - 修复 Apifox 适配器中 URL 编码 Schema 名的解析问题。
    - 修复 OpenAPI 适配器中的泛型检测与接口生成逻辑。
    - 增强 OpenAPI 适配器内联响应处理与 API 提取的健壮性。
  - **性能**：
    - 消除冗余对象创建并缓存高开销操作，提升性能。
  - **文档与测试**：
    - 全面完善 core 模块、OpenAPI 适配器与 Apifox 适配器的源码注释与类型定义说明。
    - 为 core 模块新增单元测试，提升项目稳定性。

## 0.4.0

### Minor Changes

- [`e5e84c8`](https://github.com/XSIJIE975/api-codegen-universal/commit/e5e84c80cf17389864e95c5b487f8d1927941f39) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - 支持提取接口摘要、标签及文档元数据
  - 更新 `Metadata` 类型定义，增加 `options` 字段。
  - 支持从生成的 TypeScript 代码 JSDoc 中提取接口的 `summary`（摘要）、`description`（描述）、`tags`（标签）和 `deprecated`（废弃）状态。
  - 新增 `loadOpenAPIDocument` 方法，支持加载原始 OpenAPI JSON/YAML 文档。
  - 支持提取 OpenAPI 文档的元数据，包括 `title`（标题）、`description`（描述）和 `baseUrl`（基础路径）。
  - 修复了相关类型定义，增强了类型安全性。

## 0.3.0

### Minor Changes

- [#1](https://github.com/XSIJIE975/api-codegen-universal/pull/1) [`32121e6`](https://github.com/XSIJIE975/api-codegen-universal/commit/32121e613a63f7ea0044a4d5ed4e09aaf7e4e24c) Thanks [@XSIJIE975](https://github.com/XSIJIE975)! - 支持 Apifox 代码生成适配器
