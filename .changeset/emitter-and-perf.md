---
'api-codegen-universal': minor
---

Add `emitStandardOutput` file emitter and print caching:

- **emitter**: new `emitStandardOutput(output, { outDir, modelsDir?, barrel?, header? })` writes the standard output to disk — single-category interfaces land in their API category file, shared/orphan ones in `models/shared.ts`; cross-file type imports and an optional barrel `index.ts` are generated automatically. Emitted output passes `tsc --strict`.
- **perf**: `printNode` output is cached per AST node (WeakMap), removing repeated printing across schema extraction, interface generation and generic detection.
- docs: `CONTEXT.md` glossary and `docs/plans/ROADMAP.md` with the prioritized backlog (request-client generation, Swagger 2.0 adapter, Zod emission, CLI/config, watch mode).
