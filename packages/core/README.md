# @api-codegen/core

API Codegen Universal 的核心解析引擎。

## 安装

```bash
npm install @api-codegen/core
# or
pnpm add @api-codegen/core
```

## 使用

```typescript
import { parse } from '@api-codegen/core'

const result = await parse({
  source: './swagger.json'
})

console.log(result.schemas)  // 所有的 Schema 定义
console.log(result.apis)     // 所有的 API 接口
console.log(result.metadata) // 元数据信息
```

## 系统要求

- Node.js >= 20.0.0
- ESM 模式

## 许可证

MIT
