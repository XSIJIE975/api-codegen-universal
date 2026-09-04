---
'api-codegen-universal': minor
---

修复 operationId 归一化冲突导致的重复函数名/类型名

当两个 API 路径仅分隔符不同（如 `/a/resource-detail` 与 `/a/resource/detail`）时，生成的 operationId 原始字符串互不相同，但在下游 camelCase / PascalCase 等命名变换后会坍缩为同一个标识符，导致同一输出中产生重复的函数名与类型名（TS Duplicate identifier）。

- **`generateOperationId` 分词规则与下游命名变换对齐**：路径段按 `-/`/`_` 拆词后 PascalCase 拼接（原实现仅按 `/` 切段，段内分隔符原样保留），生成的 operationId 不再残留分隔符。
- **新增 operationId 归一化唯一性保证**：以"小写 + 去分隔符"的归一化 key 检测冲突，按 `(path, method)` 字典序保留第一个，其余追加数字后缀（`2`、`3`…）自动消歧，结果与文档顺序无关。消歧在参数/请求体/响应类型名派生之前完成，保证类型名与 operationId 始终同步。
- **`OpenAPIOptions` 新增可选 `warnings` 透传**：传入 warnings 收集器后，消歧重命名会以 `renamedDuplicateOperationIds` 统计与 samples 汇总输出（Apifox 适配器已自动透传，无需额外配置）。

兼容性说明：对未发生冲突的接口，经由命名变换后的最终函数名与类型名不变；仅直接消费原始 operationId 的调用方会看到更干净（不含分隔符）的 id。
