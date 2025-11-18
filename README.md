# API Codegen Universal

[![npm version](https://img.shields.io/npm/v/api-codegen-universal.svg)](https://www.npmjs.com/package/api-codegen-universal)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/api-codegen-universal.svg)](https://nodejs.org)

> 通用的 API 代码生成器，支持从 OpenAPI 规范自动生成 TypeScript 类型定义和接口代码。

## ✨ 特性

- 🚀 **多种输入方式** - 支持本地文件、远程 URL、JSON 对象
- 📝 **TypeScript 类型生成** - 自动生成完整的 TS 接口定义
- 🎯 **OpenAPI 3.x 支持** - 完整支持 OpenAPI 3.0/3.1 规范
- 🔄 **泛型自动识别** - 智能检测并转换泛型类型
- 📁 **智能路径分类** - 自动分类 API 便于代码组织
- ⚙️ **灵活配置** - 可自定义命名风格、输出格式等
- 🛠️ **扩展性强** - 支持自定义类型转换和钩子函数

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
console.log(result.schemas); // Schema 模型定义
console.log(result.interfaces); // TypeScript 接口代码
console.log(result.apis); // API 接口列表
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

## ⚙️ 配置选项

### 路径分类

```typescript
const result = await adapter.parse('./swagger.json', {
  pathClassification: {
    outputPrefix: 'services', // 输出目录前缀（默认 'api'）
    commonPrefix: '/api/v1', // API 路径公共前缀
    maxDepth: 3, // 路径分类最大深度（默认 2）
  },
});
```

### 代码生成

```typescript
const result = await adapter.parse('./swagger.json', {
  codeGeneration: {
    parameterNamingStyle: 'PascalCase', // 'PascalCase' | 'camelCase' | 'snake_case' | 'kebab-case'
    interfaceExportMode: 'export', // 'export' | 'declare'

    output: {
      schemas: true, // 是否生成 schemas
      interfaces: true, // 是否生成 interfaces
      apis: true, // 是否生成 apis
    },
  },
});
```

### 自定义类型转换

```typescript
import ts from 'typescript';

const result = await adapter.parse('./swagger.json', {
  transform(schemaObject, metadata) {
    if (schemaObject.format === 'date-time') {
      return ts.factory.createTypeReferenceNode('Date');
    }
    return undefined;
  },
});
```

## 📊 输出格式

生成的结果包含三部分：

- **schemas** - 结构化的数据模型定义
- **interfaces** - 可直接使用的 TypeScript 接口代码字符串
- **apis** - API 接口列表，包含路径、方法、参数等信息

### 示例输出

```typescript
{
  schemas: {
    "User": {
      name: "User",
      type: "object",
      properties: {
        id: { name: "id", type: "number", required: true },
        name: { name: "name", type: "string", required: true }
      }
    }
  },
  interfaces: {
    "User": "export interface User {\n  id: number;\n  name: string;\n}"
  },
  apis: [
    {
      path: "/users/{id}",
      method: "GET",
      operationId: "getUserById",
      category: { segments: ["users"], filePath: "api/users/index.ts" }
    }
  ]
}
```

## 💡 使用场景

### 生成类型文件

```typescript
import { writeFileSync, mkdirSync } from 'fs';

const result = await adapter.parse('./swagger.json');

// 写入所有接口到单个文件
const content = Object.values(result.interfaces).join('\n\n');
mkdirSync('./generated/types', { recursive: true });
writeFileSync('./generated/types/index.ts', content);
```

### 按分类生成 API 文件

```typescript
const result = await adapter.parse('./swagger.json', {
  pathClassification: {
    commonPrefix: '/api/v1',
    maxDepth: 2,
  },
});

// 按 category 分组
const grouped = new Map();
for (const api of result.apis) {
  const path = api.category.filePath;
  if (!grouped.has(path)) grouped.set(path, []);
  grouped.get(path).push(api);
}

// 为每组生成文件
for (const [filePath, apis] of grouped) {
  // 生成对应的 API 代码...
}
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
- [OpenAPI Specification](https://swagger.io/specification/)
- [Issues](https://github.com/XSIJIE975/api-codegen-universal/issues)

---

Made with ❤️ by [XSIJIE975](https://github.com/XSIJIE975)
