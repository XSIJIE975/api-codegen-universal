# api-codegen-universal

将不同来源的 API 规范（OpenAPI/Swagger 文档、Apifox 项目）解析为统一的中间格式，供代码生成器消费的 TypeScript 适配器集合。

## Language

### 数据模型

**StandardOutput（标准输出）**:
所有适配器 `parse()` 的统一产物，包含 schemas、interfaces、apis、metadata 四个部分。
_Avoid_: 解析结果、AST 输出

**SchemaDefinition（Schema 定义）**:
对一类数据结构的结构化描述（对象/数组/枚举/原始/泛型），是类型的语义模型。
_Avoid_: model、dto

**ApiDefinition（API 定义）**:
单个 HTTP 操作的完整描述：路径、方法、参数、请求体、响应与分类。
_Avoid_: endpoint、route

**SchemaReference（Schema 引用）**:
对命名 Schema 的引用或内联定义；引用形如类型名字符串（可含数组/泛型包装）。
_Avoid_: ref path

### 适配与归一化

**Adapter（适配器）**:
实现 IAdapter、把某一来源格式转换为 StandardOutput 的组件（OpenAPIAdapter、ApifoxAdapter）。

**兼容性修复（Compatibility Fix）**:
适配器对来源数据中不合规范之处做的自动纠正（如失效 $ref、`type: null`、重复 operationId）。

**归一化冲突（Normalization Collision）**:
两个不同的原始名称经命名风格转换后坍缩为同一输出名；必须消歧而不是静默覆盖。

**operationId 消歧（OperationId Disambiguation）**:
以"归一化后仅剩字母数字"的 key 为唯一性基准，对冲突的 operationId 追加数字后缀，保证派生类型名唯一。

**泛型基类合成（Generic Synthesis）**:
从 Apifox 的具体泛型实例（如 `PageVO«User»`）推导出泛型基类接口（如 `PageVO<T>`）的过程。

### 输出与观测

**命名风格（Naming Style）**:
输出类型名的目标格式（PascalCase / camelCase / snake_case），由 `parameterNamingStyle` 配置。

**分类（Category）**:
按 API 路径段计算出的文件归属（segments + filePath），决定落地文件的组织结构。

**Warnings Summary（告警汇总）**:
适配器在 parse 末尾一次性输出的兼容性修复统计（计数 + 样本），替代逐条刷屏式告警。

**元数据净化（Metadata Sanitization）**:
写入 `metadata.options` 前剔除敏感键（token、apiKey 等）与运行时管线对象，防止泄漏。
