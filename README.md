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

## Logging

Adapters expose a unified logging interface (implemented in `@api-codegen-universal/core`):

- `logLevel` (default: `'error'`)
- `logger` injection (default: `console.<level>(message, meta)`)
- `logSampleLimit` (default: `10`, caps `samples` in warnings summaries)

The Apifox adapter aggregates compatibility-fix warnings into a **single warnings summary** emitted once at the end (requires `logLevel >= 'warn'`).

For full examples and event code details, see:

- `packages/api-codegen-universal/README.md`

## License

MIT
