# 路线图：后续迭代计划

> 2026-09 制定。本轮（v0.7.x）已完成：15 项已验证 bug 修复（PR #fix/verified-bugs-batch1）、
> printNode 缓存性能优化、`emitStandardOutput` 文件输出器。以下是尚未实施的计划，
> 按建议优先级排序，每项附动机、范围与验收要点。

## P1 — 客户端请求函数生成

**动机**：目前只产出类型，调用方仍需手写 fetch/axios 封装。类型安全的请求函数是
同类工具（orval、openapi-fetch）的核心卖点，也是 `ApiDefinition` 数据的最大变现点。

**范围**：

- 新模块 `emitClient(output, { outDir, httpClient: 'fetch' | 'axios' })`
- 每个 ApiDefinition 生成一个函数：路径参数替换（`/users/{id}` → 模板串）、
  query 拼接（来自 parameters.query ref 的类型）、请求体/响应类型绑定
- 复用 emitter 的分类归属与 import 生成逻辑（抽公共层）
- 运行时零依赖优先（fetch），axios 作为可选后端

**验收**：生成的客户端在 `tsc --strict` 下零错误；e2e fixture 全量生成快照测试。

## P2 — Swagger 2.0 适配器

**动机**：`IAdapter` 注释早已预留 `SwaggerAdapter`；大量存量系统仍是 Swagger 2.0。
openapi-typescript 不支持 2.0，需要先转换。

**范围**：

- 引入 swagger2openapi（或自写受限转换层）做 2.0 → 3.0 预处理
- `SwaggerAdapter` 转换后复用 OpenAPIAdapter 全流程
- 兼容性修复清单扩展（2.0 特有的 collectionFormat、`x-nullable` 等）

**验收**：真实 Swagger 2.0 文档（petstore v1）parse 出与 3.0 等价的 StandardOutput。

## P3 — Zod Schema 生成

**动机**：`SchemaDefinition` 已是结构化的（properties/required/enum/格式约束），
生成运行时校验器的信息完备，与类型生成天然互补。

**范围**：

- `emitZod(output, { outDir })`：每个 SchemaDefinition → z.object/…；
  PropertyDefinition 的 enum/format/最小最大长度映射为 zod 校验
- 依赖 zod 作为 peerDependency

**验收**：生成的 schema 能 roundtrip 校验文档中的 example 值。

## P4 — 配置文件 + CLI

**动机**：把「库」升级为「命令行产品」；多项目/多数据源场景需要声明式配置。

**范围**：

- `api-codegen.config.json`：sources[]（openapi/apifox 各自配置）、emitter 选项、命名风格
- CLI：`api-codegen gen [-c config] [--out dir]`、`api-codegen init`
- CLI 单独发布为 `api-codegen-universal/bin`，主入口保持库形态

**验收**：一条命令从配置文件生成完整类型 + 客户端目录。

## P5 — Watch 模式与增量

**依赖**：P4（CLI 存在之后才有 watch 的宿主）。

**范围**：`api-codegen watch` 轮询/长轮询远端文档变更，diff 后增量重建；
内容寻缓存（文档 hash → 输出 hash）。

## 性能优化遗留项

| 项                   | 说明                                                                                                                      | 触发条件                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| structuredClone 消除 | Apifox 路径为防 swagger-parser 改写深拷贝整个文档，大文档内存双倍峰值。可改为校验后丢弃副本或让下游接受 dereferenced 文档 | 文档 > 5MB 的用户报告慢 |
| components 单次遍历  | SchemaExtractor 与 InterfaceGenerator 各遍历一次 components 并重复解码/打印；可合并为单次遍历共享中间产物                 | 大文档剖析耗时 > 2s     |
| 引用扫描降复杂度     | emitter 的 `findReferencedNames` 为 O(n²) 整词搜索；接口数过万时可改为一次性 tokenizer                                    | 上万接口的巨型文档      |

## 已知限制（有意保留）

- operation 级 `deprecated` 依赖 JSDoc（openapi-typescript 产物）；tags 已从 rawDocument 补全，deprecated 可用同一机制跟进。
- 响应头按规范一律可选（OpenAPI 3.0 响应头无 required 概念）。
- 泛型基类合成只处理首个泛型参数；多参数泛型（`Map<K,V>`）不合成基类。
- emitter 的接口归属基于引用闭包，同文件内多个 api 共享接口不会二次拆分（属于 shared 的仍然进 shared）。
