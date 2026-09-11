---
'api-codegen-universal': patch
---

Fix a batch of verified bugs across the core, openapi and apifox adapters:

- **openapi**: schema names that collapse after naming-style conversion (e.g. `user_profile` vs `userProfile`) no longer silently overwrite each other; a collision-free name map is shared by schema extraction, interface generation and response refs, and renames are reported via a new `renamedCollidingSchemas` warnings counter.
- **openapi**: URL-encoded schema keys are now decoded consistently, so `schemas` and `interfaces` no longer disagree for pre-encoded documents (e.g. `User%20Dto`).
- **openapi**: `requestBody.required` is restored from the AST instead of being hardcoded to `true`; unspecified request bodies now correctly default to `false` per the OpenAPI spec.
- **openapi**: `commonPrefix` is only stripped at path segment boundaries, fixing `commonPrefix: '/api'` mangling `/apis/users` into `s/users`.
- **openapi**: `TRACE` is added to the `HttpMethod` union, matching OpenAPI 3.0 path-item fields.
- **openapi**: non-structural unions/intersections (e.g. `A[] & B[]`) now keep their original type text in a new `SchemaDefinition.rawType` field instead of degrading to an empty object.
- **openapi**: multi-line `@description` content is preserved for schema properties and response statuses (previously only the first line was kept).
- **openapi**: response headers are now extracted into `responses[status].headers`.
- **openapi**: operation `tags` are restored from the raw document (the AST path drops them).
- **openapi**: `validate()` applies `fetchTimeoutMs` for URL inputs instead of waiting indefinitely.
- **openapi**: the warnings collector and other runtime plumbing keys are excluded from `metadata.options`, and synthetic comments are read through the official `ts.getSyntheticLeadingComments` API.
- **core**: `sanitizeOptions` no longer reports shared (DAG) object references as `[circular]`; true cycles are still detected.
- **apifox**: explicitly-`undefined` `exportOptions` keys no longer override request defaults (e.g. `scope`).
