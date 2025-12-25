# API Codegen Universal (Monorepo)

本仓库包含 `api-codegen-universal` 项目的源代码，这是一个用于从 OpenAPI 和 Apifox 定义生成 API 代码的通用适配器。

## 软件包

- **[api-codegen-universal](./packages/api-codegen-universal)**: 发布到 npm 的主入口包。
- **[@api-codegen-universal/core](./packages/core)**: 核心类型定义和标准接口。
- **[@api-codegen-universal/openapi](./packages/openapi)**: OpenAPI 3.0/3.1 的适配器实现。
- **[@api-codegen-universal/apifox](./packages/apifox)**: Apifox 的适配器实现。

## 开发

### 前置要求

- Node.js >= 18
- pnpm >= 8

### 设置

```bash
pnpm install
pnpm build
```

### 测试

```bash
pnpm test
```

## 许可证

MIT
