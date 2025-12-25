# api-codegen-universal

A universal API code generator adapter that converts OpenAPI (Swagger) and Apifox definitions into standardized TypeScript type definitions and API metadata.

This library serves as a low-level adapter, responsible for parsing and extracting data. The generated standard output can be used by upper-layer CLI tools or scripts to generate specific API request code.

[中文文档](./README.zh-CN.md)

## Features

- **Multi-Source Support**: Supports OpenAPI 3.0/3.1 (JSON/YAML), remote URLs, and direct synchronization with Apifox projects.
- **Type Generation**: Generates precise TypeScript interface definitions based on AST, supporting complex nesting.
- **Generic Restoration**: Intelligently identifies and restores flattened generic structures (e.g., restoring `Page_User_` or `Page«User»` to `Page<User>`).
- **Path Analysis**: Automatically analyzes the module to which the API belongs based on the URL path and generates hierarchical directory structure suggestions.
- **Apifox Integration**: Automatically fixes and adapts non-standard OpenAPI formats exported by Apifox.

## Installation

```bash
npm install api-codegen-universal
# or
pnpm add api-codegen-universal
```

## Usage

### Basic Usage (OpenAPI)

```typescript
import { OpenAPIAdapter } from 'api-codegen-universal';

const adapter = new OpenAPIAdapter();

// Parse local file
const result = await adapter.parse('./swagger.json');

// Parse remote URL
// const result = await adapter.parse('https://petstore3.swagger.io/api/v3/openapi.json');

console.log(result.schemas); // Structured Schema definitions
console.log(result.interfaces); // TypeScript interface code
console.log(result.apis); // List of API operations
```

### Apifox Project Synchronization

```typescript
import { ApifoxAdapter } from 'api-codegen-universal';

const adapter = new ApifoxAdapter();

const result = await adapter.parse({
  projectId: 'YOUR_PROJECT_ID',
  token: 'YOUR_ACCESS_TOKEN',
});
```

## Configuration Options

The `parse` method accepts a second argument to configure the generation behavior:

```typescript
import { OpenAPIAdapter } from 'api-codegen-universal';

const adapter = new OpenAPIAdapter();

await adapter.parse(source, {
  // Path classification configuration
  pathClassification: {
    outputPrefix: 'api', // Output directory prefix (default: 'api')
    commonPrefix: '/api/v1', // Common path prefix to remove (e.g., '/api/v1/users' -> 'users')
    maxDepth: 2, // Maximum directory depth for classification (default: 2)
  },

  // Code generation configuration
  codeGeneration: {
    // Naming style for parameter interfaces: 'PascalCase' | 'camelCase' | 'snake_case'
    parameterNamingStyle: 'PascalCase',

    // Interface export mode: 'export' (default) | 'declare' (for .d.ts files)
    interfaceExportMode: 'export',

    // Output control: toggle specific parts of the output
    output: {
      schemas: true, // Generate structured schema definitions
      interfaces: true, // Generate TypeScript interface code
      apis: true, // Generate API operation details
    },
  },

  // Custom type transformation (passed to openapi-typescript)
  transform(schemaObject, metadata) {
    // Example: Convert 'format: date-time' to JavaScript Date object
    if (schemaObject.format === 'date-time') {
      return metadata.ts.factory.createTypeReferenceNode(
        metadata.ts.factory.createIdentifier('Date'),
      );
    }
  },
});
```

### Apifox Configuration

When using `ApifoxAdapter`, the first argument is a configuration object:

```typescript
import { ApifoxAdapter } from 'api-codegen-universal';

const adapter = new ApifoxAdapter();

await adapter.parse(
  {
    projectId: 'YOUR_PROJECT_ID', // Required: Apifox Project ID
    token: 'YOUR_ACCESS_TOKEN', // Required: Apifox Access Token

    // Optional: Export scope configuration
    exportOptions: {
      scope: {
        type: 'ALL', // 'ALL' | 'SELECTED_ENDPOINTS' | 'SELECTED_TAGS' | 'SELECTED_FOLDERS'
        // selectedEndpointIds: [123, 456],
        // selectedTags: ['public'],
        // selectedFolderIds: [789]
      },
      // Optional: Specify OpenAPI version
      oasVersion: '3.0',
    },
  },
  {
    // Supports all OpenAPIAdapter options here (pathClassification, codeGeneration, etc.)
  },
);
```

## Output Structure

The parsing result (`StandardOutput`) contains the following core fields:

- **`schemas`**: A record of structured schema definitions. Useful for runtime validation or form generation.
- **`interfaces`**: A record of generated TypeScript interface code strings. Can be directly written to `.ts` files.
- **`apis`**: An array of API operation details, including:
  - `path`: API URL path.
  - `method`: HTTP method.
  - `operationId`: Unique operation ID.
  - `parameters`: Request parameters (query, path, header, cookie).
  - `requestBody`: Request body definition.
  - `responses`: Response definitions.
  - `category`: Suggested file path and module classification based on `pathClassification` rules.
- **`metadata`**: Basic information about the API source (title, version, base URL, etc.).

## License

MIT
