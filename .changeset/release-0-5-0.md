---
'api-codegen-universal': minor
---

feat: Release v0.5.0

- **Features**:
  - Support response object naming style configuration (`namingStyle`); generated response interface names will follow the configured style.
  - Add reference repair and generic name processing to Apifox adapter, improving compatibility with complex Schemas.
- **Bug Fixes**:
  - Fix URL-encoded Schema name parsing issue in Apifox adapter.
  - Fix generic detection and interface generation logic in OpenAPI adapter.
  - Enhance robustness of inline response processing and API extraction in OpenAPI adapter.
- **Performance**:
  - Eliminate redundant object creation and cache expensive operations to improve performance.
- **Documentation & Tests**:
  - Comprehensively improve source code comments and type definition explanations for core module, OpenAPI adapter, and Apifox adapter.
  - Add unit tests for core modules to improve project stability.
