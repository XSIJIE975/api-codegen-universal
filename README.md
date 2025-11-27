# API Codegen Universal

[![npm version](https://img.shields.io/npm/v/api-codegen-universal.svg)](https://www.npmjs.com/package/api-codegen-universal)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/api-codegen-universal.svg)](https://nodejs.org)

> 通用的 API 代码生成器，基于 [openapi-typescript](https://github.com/openapi-ts/openapi-typescript) 强大的 AST 生成能力，提供更高级的 TypeScript 类型定义和接口代码生成。

## 🔌 支持的 API 规范与平台

- ✅ **OpenAPI (Swagger) 3.0 / 3.1** - 完整支持标准规范，无论是 JSON 还是 YAML
- ✅ **Apifox** - 直接对接 Apifox 云端项目，支持自动同步最新 API 定义

## ✨ 核心亮点

- 💎 **类型精准** - 基于 AST 生成，完美还原 OpenAPI 类型系统，支持复杂嵌套与泛型
- 🔄 **智能泛型** - 自动识别 `Page<T>`, `Result<T>` 等泛型结构，告别 `any`，还原真实的泛型调用
- 📂 **结构清晰** - 智能分析 URL 路径，自动生成符合项目结构的目录层级，拒绝扁平化的大杂烩
- 🦊 **Apifox 深度集成** - 专为 Apifox 用户优化，支持直接拉取项目数据，无需手动导出文件
- 🛠️ **高度定制** - 从命名风格到输出内容，一切皆可配置，满足不同团队的规范要求
- ⚡ **开箱即用** - 自动生成 TypeScript 接口与 API 请求代码，无缝集成到前端项目

## 📦 安装

```bash
npm install api-codegen-universal
# or
pnpm add api-codegen-universal
# or
yarn add api-codegen-universal
```

## 🚀 快速开始

```typescript
import { OpenAPIAdapter } from 'api-codegen-universal';

const adapter = new OpenAPIAdapter();

// 从本地文件解析
const result = await adapter.parse('./swagger.json');

// 输出内容
console.log(result.schemas); // 结构化的 Schema 模型定义
console.log(result.interfaces); // 生成的 TypeScript 接口代码字符串
console.log(result.apis); // 提取的 API 接口列表（包含路径、方法、参数等）
```

### 从远程 URL 解析

```typescript
const result = await adapter.parse(
  new URL('https://petstore3.swagger.io/api/v3/openapi.json'),
);
```

### 从 JSON 对象解析

```typescript
const openapiSpec = {
  openapi: '3.0.0',
  info: { title: 'My API', version: '1.0.0' },
  paths: {
    /* ... */
  },
  components: {
    /* ... */
  },
};

const result = await adapter.parse(openapiSpec);
```

### Apifox 项目支持

直接从 Apifox 项目同步 API 定义，无需手动导出文件。
具体参数参照[官方API文档](https://apifox-openapi.apifox.cn/api-173411997)

```typescript
import { ApifoxAdapter, ApifoxConfig } from 'api-codegen-universal';

const adapter = new ApifoxAdapter();

const config: ApifoxConfig = {
  projectId: 'YOUR_PROJECT_ID', // Apifox 项目 ID
  token: 'YOUR_ACCESS_TOKEN', // Apifox 访问令牌
  // 可选：导出配置
  exportOptions: {
    scope: {
      type: 'ALL', // 导出全部接口
      // 或者指定接口:
      // type: 'SELECTED_ENDPOINTS',
      // selectedEndpointIds: [123, 456]
    },
  },
};

const result = await adapter.parse(config, {
  // 支持所有 OpenAPIAdapter 的配置项
  pathClassification: {
    outputPrefix: 'api',
    commonPrefix: '/api/v1',
  },
  codeGeneration: {
    output: {
      schemas: true,
      interfaces: true,
      apis: true,
    },
  },
});
```

## ⚙️ 配置选项

`parse` 方法的第二个参数支持丰富的配置选项：

### 路径分类配置 (`pathClassification`)

```typescript
const result = await adapter.parse('./swagger.json', {
  pathClassification: {
    outputPrefix: 'services', // 输出目录前缀（默认 'api'）
    commonPrefix: '/api/v1', // API 路径公共前缀，用于生成更简洁的文件路径
    maxDepth: 3, // 路径分类最大深度（默认 2）
  },
});
```

### 代码生成配置 (`codeGeneration`)

```typescript
const result = await adapter.parse('./swagger.json', {
  codeGeneration: {
    parameterNamingStyle: 'PascalCase', // 参数接口命名风格: 'PascalCase' | 'camelCase' | 'snake_case' | 'kebab-case'
    interfaceExportMode: 'export', // 接口导出模式: 'export' (默认) | 'declare'

    output: {
      schemas: true, // 是否生成 schemas 结构化数据
      interfaces: true, // 是否生成 TypeScript 接口代码
      apis: true, // 是否生成 API 列表
    },
  },
});
```

### 自定义类型转换 (`transform`)

本库直接透传 `openapi-typescript` 的 `transform` 选项，允许你自定义 Schema 到 TypeScript AST 的转换逻辑。

```typescript
import ts from 'typescript';

const result = await adapter.parse('./swagger.json', {
  // schemaObject 是 OpenAPI Schema 对象
  // metadata 包含 path 等上下文信息
  transform(schemaObject, metadata) {
    // 示例：将 format: 'date-time' 转换为 Date 类型
    if (schemaObject.format === 'date-time') {
      return ts.factory.createTypeReferenceNode(
        ts.factory.createIdentifier('Date'),
        undefined,
      );
    }
    // 返回 undefined 表示使用默认转换逻辑
    return undefined;
  },
});
```

## 📊 输出格式

生成的结果包含三部分：

- **schemas** - 结构化的数据模型定义，包含类型、属性、必填项、枚举值等信息，适合用于生成表单或验证规则。
- **interfaces** - 生成好的 TypeScript 接口代码字符串，可以直接写入 `.ts` 文件。
- **apis** - API 接口列表，包含路径、方法、操作 ID、参数定义、响应定义以及自动计算的分类信息。

### 示例输出结构

```typescript
{
  schemas: {
    "User": {
      name: "User",
      type: "object",
      properties: {
        id: { name: "id", type: "number", required: true },
        name: { name: "name", type: "string", required: true },
        role: {
          name: "role",
          type: "string",
          enum: ["ADMIN", "USER"],
          required: true
        }
      }
    }
  },
  interfaces: {
    // 自动处理引用和泛型
    "User": "export interface User {\n  id: number;\n  name: string;\n  role: \"ADMIN\" | \"USER\";\n}",
    "PageResult": "export interface PageResult<T = any> {\n  items?: T;\n  total?: number;\n}"
  },
  apis: [
    {
      path: "/users/{id}",
      method: "GET",
      operationId: "getUserById",
      // 自动生成的分类信息，便于文件组织
      category: {
        segments: ["users"],
        depth: 1,
        filePath: "api/users/index.ts"
      },
      parameters: { /* ... */ },
      responses: { /* ... */ }
    }
  ]
}
```

## 💡 最佳实践

### 生成类型定义文件

```typescript
import { writeFileSync, mkdirSync } from 'fs';
import { OpenAPIAdapter } from 'api-codegen-universal';

async function generate() {
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse('./swagger.json');

  // 1. 写入类型定义
  const typeContent = Object.values(result.interfaces).join('\n\n');
  mkdirSync('./src/types', { recursive: true });
  writeFileSync('./src/types/api-types.ts', typeContent);

  // 2. 结合 result.apis 生成 API 请求代码
  // ...
}

generate();
```

## 📚 API 文档

完整的类型定义和 API 文档请查看 [TypeScript 声明文件](./dist/index.d.ts)。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](./LICENSE)

## 🔗 相关链接

- [GitHub Repository](https://github.com/XSIJIE975/api-codegen-universal)
- [NPM Package](https://www.npmjs.com/package/api-codegen-universal)
- [openapi-typescript](https://github.com/openapi-ts/openapi-typescript) - 本项目依赖的核心库
- [OpenAPI Specification](https://swagger.io/specification/)

---

Made with ❤️ by [XSIJIE975](https://github.com/XSIJIE975)
