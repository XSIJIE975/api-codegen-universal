# api-codegen-universal

通用的 API 代码生成器适配器，基于 [openapi-typescript](https://github.com/openapi-ts/openapi-typescript) 的 AST 能力，将 OpenAPI (Swagger) 和 Apifox 定义转换为标准化的 TypeScript 类型定义和 API 元数据。

本库主要作为底层适配器使用，负责解析和提取数据，生成的标准输出可供上层 CLI 工具或脚本使用以生成具体的 API 请求代码。

## 功能特性

- **多源支持**: 支持 OpenAPI 3.0/3.1 (JSON/YAML)、远程 URL 以及 Apifox 项目直接同步。
- **类型生成**: 基于 AST 生成精确的 TypeScript 接口定义，支持复杂嵌套。
- **泛型还原**: 智能识别并还原被扁平化的泛型结构（如将 `Page_User_` 或 `Page«User»` 还原为 `Page<User>`）。
- **路径分析**: 根据 URL 路径自动分析 API 所属模块，生成层级化的目录结构建议。
- **Apifox 集成**: 针对 Apifox 导出的非标准 OpenAPI 格式进行自动修复和兼容。

## 安装

```bash
npm install api-codegen-universal
# 或
pnpm add api-codegen-universal
```

## 使用方法

### 基础用法 (OpenAPI)

```typescript
import { OpenAPIAdapter } from 'api-codegen-universal';

const adapter = new OpenAPIAdapter();

// 解析本地文件
const result = await adapter.parse('./swagger.json');

// 解析远程 URL
// const result = await adapter.parse('https://petstore3.swagger.io/api/v3/openapi.json');

console.log(result.schemas); // 结构化的 Schema 定义
console.log(result.interfaces); // TypeScript 接口代码
console.log(result.apis); // API 操作列表
```

### Apifox 项目同步

```typescript
import { ApifoxAdapter } from 'api-codegen-universal';

const adapter = new ApifoxAdapter();

const result = await adapter.parse({
  projectId: 'YOUR_PROJECT_ID',
  token: 'YOUR_ACCESS_TOKEN',
});
```

## 配置选项

`parse` 方法接受第二个参数用于配置生成行为：

```typescript
import { OpenAPIAdapter } from 'api-codegen-universal';

const adapter = new OpenAPIAdapter();

await adapter.parse(source, {
  // 路径分类配置
  pathClassification: {
    outputPrefix: 'api', // 输出目录前缀 (默认: 'api')
    commonPrefix: '/api/v1', // 需要去除的公共路径前缀 (例如: '/api/v1/users' -> 'users')
    maxDepth: 2, // 路径分类最大深度 (默认: 2)
  },

  // 代码生成配置
  codeGeneration: {
    // 参数接口命名风格: 'PascalCase' (大驼峰) | 'camelCase' (小驼峰) | 'snake_case' (下划线)
    parameterNamingStyle: 'PascalCase',

    // 接口导出模式: 'export' (默认) | 'declare' (用于 .d.ts 文件)
    interfaceExportMode: 'export',

    // 输出控制: 开关特定部分的生成
    output: {
      schemas: true, // 生成结构化的 Schema 定义
      interfaces: true, // 生成 TypeScript 接口代码
      apis: true, // 生成 API 操作详情
    },
  },

  // 自定义类型转换 (透传给 openapi-typescript)
  transform(schemaObject, metadata) {
    // 示例: 将 'format: date-time' 转换为 JavaScript Date 对象
    if (schemaObject.format === 'date-time') {
      return metadata.ts.factory.createTypeReferenceNode(
        metadata.ts.factory.createIdentifier('Date'),
      );
    }
  },
});
```

### 日志（logLevel / logger / logSampleLimit）

所有适配器的 `parse(source, options)` 都支持统一的日志选项：

- `logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug'`（默认：`'error'`）
  - `silent`: 完全不输出
  - `error`: 仅输出 error
  - `warn`: 输出 warn + error（Apifox 的 warnings summary 需要至少 `warn`）
  - `info` / `debug`: 更详细的输出
- `logger?: { debug?; info?; warn?; error? }`
  - 默认输出格式为 `console.<level>(message, meta)`（`meta` 为结构化对象，便于采集/过滤）
  - 你可以注入自己的 logger（例如写入文件、接入 pino/winston、上报到监控等）
- `logSampleLimit?: number`（默认：`10`）
  - 用于限制 warnings summary 中的 `samples` 数量，避免单次解析产生日志 payload 过大
  - 设置为 `0` 可禁用 samples（仍会保留统计 `stats`）

> 说明：适配器默认 **不会**在内部重复打印错误（一般直接 throw）。如需记录错误，请在业务侧 `try/catch` 后自行记录。

#### 事件码（`meta.code`）

- `APIFOX_WARNINGS_SUMMARY`
  - Apifox 适配器在兼容性修复过程中产生的告警汇总。
  - 仅在 `parse` 结束时输出 **1 条** warn（Scheme A），避免刷屏。
  - `meta` 结构（关键字段）：
    - `adapter`: `apifox`
    - `source`: `Apifox Project <id>`
    - `durationMs`: 本次 parse 耗时（毫秒）
    - `stats`: 计数（例如 `fixedNullTypes` / `fixedBrokenRefs` / `renamedDuplicateOperationIds` / `renamedGenericSchemas` / `validation`）
    - `samples`: 受 `logSampleLimit` 限制的样本（例如 `brokenRefs` / `renamedSchemas` / `duplicateOperationIds`）
- `OPENAPI_METADATA_LOAD_FAILED`
  - OpenAPI 适配器在尝试加载“原始文档”以提取 metadata 时失败的 warn（不影响主流程）。
  - `meta` 结构：`{ code: 'OPENAPI_METADATA_LOAD_FAILED', errorMessage: string }`

#### 示例：注入自定义 logger 捕获 warnings summary

```typescript
import { ApifoxAdapter } from 'api-codegen-universal';

const adapter = new ApifoxAdapter();

const warnCalls: Array<{ message: string; meta?: Record<string, unknown> }> =
  [];

await adapter.parse(
  { projectId: 'YOUR_PROJECT_ID', token: 'YOUR_ACCESS_TOKEN' },
  {
    logLevel: 'warn',
    logSampleLimit: 5,
    logger: {
      warn: (message, meta) => {
        warnCalls.push({ message, meta });
      },
    },
  },
);

// warnCalls[0]?.meta?.code === 'APIFOX_WARNINGS_SUMMARY'
```

### Apifox 配置

使用 `ApifoxAdapter` 时，第一个参数是配置对象：

```typescript
import { ApifoxAdapter } from 'api-codegen-universal';

const adapter = new ApifoxAdapter();

await adapter.parse(
  {
    projectId: 'YOUR_PROJECT_ID', // 必填: Apifox 项目 ID
    token: 'YOUR_ACCESS_TOKEN', // 必填: Apifox 访问令牌

    // 可选: 导出范围配置
    exportOptions: {
      scope: {
        type: 'ALL', // 'ALL' (全部) | 'SELECTED_ENDPOINTS' (指定接口) | 'SELECTED_TAGS' (指定标签) | 'SELECTED_FOLDERS' (指定目录)
        // selectedEndpointIds: [123, 456],
        // selectedTags: ['public'],
        // selectedFolderIds: [789]
      },
      // 可选: 指定 OpenAPI 版本
      oasVersion: '3.0',
    },
  },
  {
    // 此处支持所有 OpenAPIAdapter 的配置项 (pathClassification, codeGeneration 等)
  },
);
```

## 输出结构

解析结果 (`StandardOutput`) 包含以下核心字段：

- **`schemas`**: 结构化的 Schema 定义记录。适用于运行时验证或表单生成。
- **`interfaces`**: 生成的 TypeScript 接口代码字符串记录。可以直接写入 `.ts` 文件。
- **`apis`**: API 操作详情数组，包含：
  - `path`: API URL 路径。
  - `method`: HTTP 方法。
  - `operationId`: 唯一操作 ID。
  - `parameters`: 请求参数 (query, path, header, cookie)。
  - `requestBody`: 请求体定义。
  - `responses`: 响应定义。
  - `category`: 基于 `pathClassification` 规则生成的建议文件路径和模块分类。
- **`metadata`**: 关于 API 源的基本信息 (标题, 版本, Base URL 等)。

## 许可证

MIT
