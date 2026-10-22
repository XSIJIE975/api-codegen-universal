---
'api-codegen-universal': minor
---

feat(openapi): add `codeGeneration.typeNamePrefix`

When multiple projects emit global `declare` types with
`interfaceExportMode: 'declare'`, schemas with the same name (for example
`PageDTO` or `IdDTO`) collide in the global scope. `typeNamePrefix` injects a
project prefix at generation time, so declaration names, interfaces/schemas
keys, `$ref` references, generic composition names and split `{TypeName}.d.ts`
file names remain isolated.

The prefix covers component schemas, operation-derived parameter interfaces,
inline request/response schemas, anonymous hash-named schemas and synthesized
generic bases. Input names that already start with the prefix are skipped with
a `console.warn` to avoid double prefixes. The option is opt-in: omitting it
keeps existing output unchanged.
