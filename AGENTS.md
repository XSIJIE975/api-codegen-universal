# AGENTS.md

Agent instructions for this repository (api-codegen-universal monorepo).

This repo is a TypeScript monorepo managed by **pnpm workspaces** and built with **rslib**.
Testing uses **@rstest/core**. Formatting is **Prettier**. Linting is **ESLint (flat config)**.

> No Cursor/Copilot rule files were found (.cursorrules, .cursor/rules/, .github/copilot-instructions.md).

## Repo layout

- `packages/core` – shared types/utilities
- `packages/openapi` – OpenAPI adapter (uses openapi-typescript)
- `packages/apifox` – Apifox adapter (fetch + compatibility fixes)
- `packages/api-codegen-universal` – published package that re-exports adapters

## Commands (root)

Use **pnpm** (preferred). Node >= 20.

### Install

- `pnpm install`

### Build

- `pnpm build` – build all packages (`pnpm -r build`)
- Build a single package:
  - `pnpm -C packages/openapi build`
  - `pnpm -C packages/apifox build`

### Test

- `pnpm test` – run all tests (root `rstest`, config: `rstest.config.ts`)

Run a **single test file**:

- `pnpm test -- run --include "packages/apifox/tests/index.test.ts"`

Run a **single test by name** (regex):

- `pnpm test -- run --include "packages/apifox/tests/index.test.ts" -t "ApifoxAdapter"`

Run only one project (workspace package) by name/pattern:

- `pnpm test -- run --project "packages/apifox"`

List which tests would run:

- `pnpm test -- list`

Watch mode:

- `pnpm test -- watch --include "packages/openapi/tests"`

### Lint / Format

- `pnpm lint` – eslint on `{packages}/**/*.ts`
- `pnpm lint:fix` – eslint autofix
- `pnpm format` – prettier write

### Changesets / Release (maintainers)

- `pnpm changeset` – create changeset
- `pnpm version-packages` – bump versions
- `pnpm release` – publish via changesets

## Tooling configuration (authoritative)

- TypeScript: `tsconfig.json`
  - `strict: true`
  - `noUncheckedIndexedAccess: true`
  - `noUnusedLocals/noUnusedParameters/noImplicitReturns: true`
- ESLint: `eslint.config.mjs` (recommended JS + typescript-eslint recommended)
- Prettier: `.prettierrc` (`singleQuote: true`)
- Lint-staged: `.lintstagedrc.json` (eslint --fix + prettier)
- Commit messages: `commitlint.config.js` (conventional commits, max header 100)

## Code style guidelines

### Language / module system

- TypeScript-first. Packages are `"type": "module"`.
- Use ESM `import`/`export`.
- Prefer `import type { ... }` for type-only imports.

### Imports

- Order (typical):
  1. Node built-ins (`node:fs`, `node:path`, etc.)
  2. External deps
  3. Workspace/internal packages (`@api-codegen-universal/...`)
  4. Relative imports
- Keep imports minimal; avoid unused imports (TS config enforces this).

### Formatting

- Prettier is the source of truth.
- Use **single quotes**.
- Keep lines readable; don’t hand-format against Prettier.

### Types / safety

- Keep strict typing. Don’t suppress errors with `any` unless it’s truly dynamic data.
- If `any` is necessary, contain it:
  - isolate parsing/validation code
  - convert to typed structures at the boundary
- Avoid `as unknown as T` chains.
- Favor discriminated unions, readonly types, and explicit return types for exported APIs.

### Naming

- `PascalCase` for types/classes.
- `camelCase` for variables/functions.
- `SCREAMING_SNAKE_CASE` only for constants that are truly global/static.
- File names: existing style is kebab-case in many areas (follow local convention).

### Error handling

- Never swallow errors silently.
- Prefer throwing `Error` with actionable context:
  - include operation, identifiers, and hints
- When wrapping errors, keep the original message and add context.
- Log only at boundaries/adapters (e.g., network fetch) — avoid noisy logs in core transforms.

### OpenAPI / adapter-specific conventions

- Adapters should be resilient to non-standard inputs, but must produce standard outputs.
- Prefer **small, targeted compatibility fixes** over broad refactors.
- Add tests for any new compatibility behavior (fixtures or minimal inline docs).

### Testing style (rstest)

- Use `@rstest/core` (`test`, `expect`).
- Keep tests deterministic: avoid real network calls; mock `fetchOpenApiData()` in adapter tests.
- Test naming: describe behavior, not implementation details.

## Before you ship changes (local checklist)

- `pnpm format`
- `pnpm lint`
- `pnpm test` (or targeted include + -t)
- `pnpm build`

## Docs / references

- Rslib: https://rslib.rs/llms.txt
- Rsbuild: https://rsbuild.rs/llms.txt
- Rspack: https://rspack.rs/llms.txt
