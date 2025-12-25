# API Codegen Universal (Monorepo)

This repository contains the source code for the `api-codegen-universal` project, a universal adapter for generating API code from OpenAPI and Apifox definitions.

[中文文档](./README.zh-CN.md)

## Packages

- **[api-codegen-universal](./packages/api-codegen-universal)**: The main entry point package published to npm.
- **[@api-codegen-universal/core](./packages/core)**: Core type definitions and standard interfaces.
- **[@api-codegen-universal/openapi](./packages/openapi)**: Adapter implementation for OpenAPI 3.0/3.1.
- **[@api-codegen-universal/apifox](./packages/apifox)**: Adapter implementation for Apifox.

## Development

### Prerequisites

- Node.js >= 18
- pnpm >= 8

### Setup

```bash
pnpm install
pnpm build
```

### Testing

```bash
pnpm test
```

## License

MIT
