# API Codegen Universal

> **当前版本**: v0.1.0 | **状态**: ✅ MVP 完成，核心功能可用

通用的 API 代码生成器核心库，支持将 OpenAPI、Apifox 等 API 规范格式转换为标准化的数据结构，并生成 TypeScript 接口代码。

## 🎯 核心特性

### ✅ 已实现功能

- **多源解析支持** - 支持本地文件、远程 URL、JSON 对象三种输入方式
- **OpenAPI 3.x 完整支持** - 基于 `openapi-typescript` 的 AST 解析
- **标准化输出** - 统一的 `StandardOutput` 数据结构
- **TypeScript 接口生成** - 自动生成可用的 TS 接口代码字符串
- **泛型自动检测** - 智能识别 `allOf` 合并模式并转换为泛型类型
- **智能路径分类** - 基于路径自动分类 API，便于代码组织
- **灵活配置选项** - 支持命名风格、导出模式、输出控制等多种配置
- **Monorepo 架构** - 使用 pnpm workspace 管理多包结构

### 🚧 规划中功能

- Apifox 格式支持
- CLI 命令行工具
- 更多自定义钩子和插件机制

## 📦 安装

```bash
npm install api-codegen-universal
# or
pnpm add api-codegen-universal
# or
yarn add api-codegen-universal
```

## 🚀 快速开始

### 基础使用

```typescript
import { OpenAPIAdapter } from 'api-codegen-universal';

const adapter = new OpenAPIAdapter();

// 从本地文件解析
const result = await adapter.parse('./swagger.json');

console.log(result.schemas);     // Schema 模型定义
console.log(result.interfaces);  // TypeScript 接口代码字符串
console.log(result.apis);        // API 接口定义
console.log(result.metadata);    // 元数据信息
```

### 从远程 URL 解析

```typescript
const result = await adapter.parse(
  new URL('https://petstore3.swagger.io/api/v3/openapi.json')
);
```

### 从 JSON 对象解析

```typescript
const openapiSpec = {
  openapi: '3.0.0',
  info: { title: 'My API', version: '1.0.0' },
  paths: { /* ... */ },
  components: { /* ... */ },
};

const result = await adapter.parse(openapiSpec);
```

### 完整配置示例

```typescript
const result = await adapter.parse('./swagger.json', {
  // 路径分类配置
  pathClassification: {
    outputPrefix: 'services',  // 输出目录前缀（默认 'api'）
    commonPrefix: '/api/v1',   // API 路径公共前缀
    maxDepth: 3,               // 路径分类最大深度（默认 2）
  },

  // 代码生成配置
  codeGeneration: {
    // 参数接口命名风格
    parameterNamingStyle: 'PascalCase', // 'PascalCase' | 'camelCase' | 'snake_case' | 'kebab-case'
    
    // 接口导出模式
    interfaceExportMode: 'export',      // 'export' | 'declare'
    
    // 输出控制
    output: {
      schemas: true,      // 是否生成 schemas 字段
      interfaces: true,   // 是否生成 interfaces 字段（TS 代码字符串）
      apis: true,         // 是否生成 apis 字段
    },
  },

  // 自定义类型转换（可选）
  transform(schemaObject, metadata) {
    // 自定义特定格式的类型转换
    if (schemaObject.format === 'date-time') {
      return ts.factory.createTypeReferenceNode('Date');
    }
  },
});

## 📊 标准输出格式

### StandardOutput 结构

```typescript
interface StandardOutput {
  /** Schema 定义集合 - 包含所有数据模型的结构化定义 */
  schemas: Record<string, SchemaDefinition>;
  
  /** TypeScript 接口代码字符串集合 - 可直接写入 .ts 文件 */
  interfaces: Record<string, string>;
  
  /** API 接口定义列表 - 包含所有 API 的详细信息 */
  apis: ApiDefinition[];
  
  /** 元数据信息 */
  metadata: Metadata | null;
}
```

**输出示例**：

```typescript
{
  schemas: {
    "User": {
      name: "User",
      type: "object",
      properties: {
        id: { name: "id", type: "number", required: true },
        name: { name: "name", type: "string", required: true },
        email: { name: "email", type: "string", required: false }
      },
      required: ["id", "name"]
    }
  },
  interfaces: {
    "User": "export interface User {\n  id: number;\n  name: string;\n  email?: string;\n}"
  },
  apis: [
    {
      path: "/users/{id}",
      method: "GET",
      operationId: "getUserById",
      category: { segments: ["users"], depth: 1, filePath: "api/users/index.ts" }
    }
  ],
  metadata: {
    title: "My API",
    generatedAt: "2024-01-01T00:00:00.000Z"
  }
}
```

### SchemaDefinition - Schema 定义

```typescript
interface SchemaDefinition {
  /** Schema 名称 */
  name: string;
  /** 描述信息 */
  description?: string;
  /** Schema 类型 */
  type: 'object' | 'array' | 'enum' | 'primitive' | 'generic';

  // ======== object 类型特有 ========
  /** 对象属性定义 */
  properties?: Record<string, PropertyDefinition>;
  /** 必填字段列表 */
  required?: string[];
  /** 额外属性定义 */
  additionalProperties?: SchemaReference;

  // ======== array 类型特有 ========
  /** 数组元素类型 */
  items?: SchemaReference;

  // ======== enum 类型特有 ========
  /** 枚举值 */
  enum?: Array<string | number>;

  // ======== 泛型相关 ========
  /** 是否为泛型类型 */
  isGeneric?: boolean;
  /** 泛型基础类型名(如 ApiSuccessResponse) */
  baseType?: string;
  /** 泛型参数(如 User, User[]) */
  genericParam?: string;

  // ======== 其他元信息 ========
  /** 示例值 */
  example?: any;
  /** 默认值 */
  default?: any;
  /** 是否废弃 */
  deprecated?: boolean;
}
```

### PropertyDefinition - 属性定义

```typescript
interface PropertyDefinition {
  /** 属性名 */
  name: string;
  /** 属性类型(TS 类型字符串) */
  type: string;
  /** 描述信息 */
  description?: string;
  /** 是否必填 */
  required: boolean;
  /** 是否可为 null */
  nullable?: boolean;
  /** 默认值 */
  default?: any;
  /** 示例值 */
  example?: any;
  /** 格式(date-time, email等) */
  format?: string;
  /** 正则模式 */
  pattern?: string;
  /** 最小/最大长度 */
  minLength?: number;
  maxLength?: number;
  /** 最小/最大值 */
  minimum?: number;
  maximum?: number;
  /** 枚举值 */
  enum?: Array<string | number>;
}
```

### ApiDefinition - API 接口定义

```typescript
interface ApiDefinition {
  /** API 路径 */
  path: string;
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  /** 操作 ID(唯一标识) */
  operationId: string;
  /** 摘要 */
  summary?: string;
  /** 详细描述 */
  description?: string;
  /** 标签列表 */
  tags?: string[];
  /** 是否废弃 */
  deprecated?: boolean;

  // ======== 请求相关 ========
  /** 参数定义(按位置分组) */
  parameters?: ParametersDefinition;
  /** 请求体定义 */
  requestBody?: RequestBodyDefinition;

  // ======== 响应相关 ========
  /** 响应定义(按状态码) */
  responses: Record<string, ResponseDefinition>;

  // ======== 分类信息 ========
  /** 分类信息(用于生成文件路径) */
  category: CategoryInfo;
}
```

### ParametersDefinition - 参数定义

```typescript
interface ParametersDefinition {
  /** Query 参数接口引用 */
  query?: SchemaReference;
  /** Path 参数接口引用 */
  path?: SchemaReference;
  /** Header 参数接口引用 */
  header?: SchemaReference;
  /** Cookie 参数接口引用 */
  cookie?: SchemaReference;
}
```

**重要说明**：`parameters` 字段中的每个位置（query/path/header/cookie）都引用一个生成的参数接口，而不是直接存储参数数组。例如：

```typescript
// 对于 GET /users?page=1&size=10
parameters: {
  query: {
    type: 'ref',
    ref: 'GetUsersQueryParams'  // 引用生成的接口
  }
}

// 对应的接口会在 interfaces 中：
interfaces: {
  "GetUsersQueryParams": "export interface GetUsersQueryParams {\n  page?: number;\n  size?: number;\n}"
}
```

### CategoryInfo - 分类信息

```typescript
interface CategoryInfo {
  /** 路径段数组(如 ['auth', 'users']) */
  segments: string[];
  /** 分类深度 */
  depth: number;
  /** 是否为未分类(无法按规则分类的 API Path) */
  isUnclassified: boolean;
  /** 建议的文件路径(如 'api/auth/users/index.ts') */
  filePath: string;
}
```

**示例**：

```typescript
// 路径: /api/v1/auth/users/{id}
// commonPrefix: '/api/v1'
// maxDepth: 2
{
  segments: ['auth', 'users'],
  depth: 2,
  isUnclassified: false,
  filePath: 'api/auth/users/index.ts'
}
```

### Metadata - 元数据

```typescript
interface Metadata {
  /** API 标题 */
  title?: string;
  /** API 描述 */
  description?: string;
  /** 基础 URL */
  baseUrl?: string;
  /** 公共路径前缀(如 '/api/v1') */
  commonPrefix?: string;
  /** 生成时间 */
  generatedAt: string;
  /** 原始文档来源 */
  source?: string;
}
```


## 🔧 配置选项详解

### 路径分类配置 (pathClassification)

控制 API 路径如何被分类和组织。

```typescript
interface PathClassificationOptions {
  /** 输出目录前缀(默认 'api') */
  outputPrefix?: string;
  
  /** API 路径公共前缀(用于路径分类,如 '/api/v1') */
  commonPrefix?: string;
  
  /** 路径分类最大深度(默认 2) */
  maxDepth?: number;
}
```

**示例**：

```typescript
// 配置
pathClassification: {
  outputPrefix: 'services',
  commonPrefix: '/api/v1',
  maxDepth: 2
}

// 输入路径: /api/v1/auth/users/profile
// 输出分类:
{
  segments: ['auth', 'users'],  // 去除前缀后取前2段
  filePath: 'services/auth/users/index.ts'
}
```

### 代码生成配置 (codeGeneration)

控制生成的 TypeScript 代码风格和内容。

```typescript
interface CodeGenerationOptions {
  /** 参数接口命名风格(默认 'PascalCase') */
  parameterNamingStyle?: 'PascalCase' | 'camelCase' | 'snake_case' | 'kebab-case';
  
  /** 接口导出模式(默认 'export') */
  interfaceExportMode?: 'export' | 'declare';
  
  /** 输出控制 */
  output?: OutputControlOptions;
}

interface OutputControlOptions {
  /** 是否生成 schemas 字段(默认 true) */
  schemas?: boolean;
  
  /** 是否生成 interfaces 字段(默认 true) */
  interfaces?: boolean;
  
  /** 是否生成 apis 字段(默认 true) */
  apis?: boolean;
}
```

**parameterNamingStyle 示例**：

```typescript
// PascalCase (默认)
export interface GetUsersQueryParams { ... }

// camelCase
export interface getUsersQueryParams { ... }

// snake_case
export interface get_users_query_params { ... }

// kebab-case
export interface get-users-query-params { ... }  // 注意：不是合法的 TS 标识符
```

**interfaceExportMode 示例**：

```typescript
// export (默认) - 适用于模块
export interface User {
  id: number;
  name: string;
}

// declare - 适用于类型声明文件
declare interface User {
  id: number;
  name: string;
}
```

**output 控制示例**：

```typescript
// 只生成接口代码，不生成结构化定义
codeGeneration: {
  output: {
    schemas: false,
    interfaces: true,
    apis: true
  }
}

// 结果
{
  schemas: {},           // 空对象
  interfaces: { ... },   // 包含接口代码
  apis: [ ... ]          // 包含 API 定义
}
```

### 自定义类型转换 (transform)

提供自定义 Schema 对象转换逻辑的钩子函数。

```typescript
type TransformFunction = (
  schemaObject: any,
  metadata: {
    schemaName: string;
    propertyName?: string;
  }
) => ts.TypeNode | undefined;
```

**使用示例**：

```typescript
import ts from 'typescript';

const result = await adapter.parse('./swagger.json', {
  transform(schemaObject, metadata) {
    // 将 date-time 格式转换为 Date 类型
    if (schemaObject.format === 'date-time') {
      return ts.factory.createTypeReferenceNode('Date');
    }
    
    // 自定义 decimal 格式处理
    if (schemaObject.format === 'decimal') {
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
    }
    
    // 返回 undefined 使用默认处理
    return undefined;
  }
});
```


## 📖 核心功能详解

### 1. 泛型自动检测

自动识别 OpenAPI 中的 `allOf` 合并模式，将其转换为 TypeScript 泛型类型。

**OpenAPI 定义**：

```yaml
components:
  schemas:
    ApiSuccessResponse:
      type: object
      properties:
        code:
          type: integer
        message:
          type: string
        data:
          type: object
    
    UserResponse:
      allOf:
        - $ref: '#/components/schemas/ApiSuccessResponse'
        - type: object
          properties:
            data:
              $ref: '#/components/schemas/User'
```

**识别结果**：

```typescript
{
  name: 'UserResponse',
  type: 'generic',
  isGeneric: true,
  baseType: 'ApiSuccessResponse',
  genericParam: 'User'
}
```

**生成的 TypeScript 接口**：

```typescript
export type UserResponse = ApiSuccessResponse<User>;
```

**工作原理**：

`GenericDetector` 工具类会检测以下模式：

- `BaseType & { data?: DataType }` → `BaseType<DataType>`
- 支持数组类型：`BaseType & { data?: DataType[] }` → `BaseType<DataType[]>`
- 自动提取基类和泛型参数

### 2. 智能路径分类

根据 API 路径自动将接口分类到不同的文件中，便于代码组织。

**分类算法**：

```typescript
class PathClassifier {
  classify(path: string): CategoryInfo {
    // 1. 移除配置的公共前缀
    // 2. 提取路径段（忽略参数部分如 {id}）
    // 3. 根据 maxDepth 限制深度
    // 4. 生成文件路径建议
  }
}
```

**示例**：

```typescript
// 配置
pathClassification: {
  commonPrefix: '/api/v1',
  outputPrefix: 'services',
  maxDepth: 2
}

// 路径分类结果
'/api/v1/auth/login'          → 'services/auth/index.ts'
'/api/v1/users/{id}'          → 'services/users/index.ts'
'/api/v1/users/{id}/profile'  → 'services/users/index.ts'  // 深度限制为2
'/api/v1/admin/system/config' → 'services/admin/system/index.ts'
```

**未分类处理**：

无法按规则分类的路径会被标记为 `isUnclassified: true`，放入 `unclassified` 目录：

```typescript
{
  segments: [],
  depth: 0,
  isUnclassified: true,
  filePath: 'api/unclassified/index.ts'
}
```

### 3. TypeScript 接口代码生成

自动生成可直接使用的 TypeScript 接口代码字符串。

**特性**：

- ✅ 支持嵌套对象和数组
- ✅ 支持可选属性（`?`）
- ✅ 支持联合类型（`|`）
- ✅ 支持枚举类型
- ✅ 支持泛型类型
- ✅ 保留注释和描述信息
- ✅ 支持 `export` 和 `declare` 两种导出模式

**生成示例**：

```typescript
// Schema 定义
{
  name: 'User',
  type: 'object',
  description: '用户信息',
  properties: {
    id: { name: 'id', type: 'number', required: true, description: '用户ID' },
    name: { name: 'name', type: 'string', required: true },
    email: { name: 'email', type: 'string', required: false, format: 'email' },
    role: { name: 'role', type: 'string', required: false, enum: ['admin', 'user'] }
  }
}

// 生成的接口代码
/**
 * 用户信息
 */
export interface User {
  /** 用户ID */
  id: number;
  name: string;
  email?: string;
  role?: 'admin' | 'user';
}
```

**使用接口代码**：

```typescript
import { writeFileSync } from 'fs';

const result = await adapter.parse('./swagger.json');

// 方式1: 直接写入文件
for (const [name, code] of Object.entries(result.interfaces)) {
  writeFileSync(`./types/${name}.ts`, code);
}

// 方式2: 合并写入单个文件
const allInterfaces = Object.values(result.interfaces).join('\n\n');
writeFileSync('./types/index.ts', allInterfaces);
```

### 4. 参数接口生成

为每个 API 的每个参数位置（query/path/header/cookie）生成独立的接口。

**OpenAPI 定义**：

```yaml
paths:
  /users:
    get:
      operationId: getUsers
      parameters:
        - name: page
          in: query
          schema:
            type: integer
        - name: size
          in: query
          schema:
            type: integer
```

**生成结果**：

```typescript
// apis 中的参数引用
{
  operationId: 'getUsers',
  parameters: {
    query: {
      type: 'ref',
      ref: 'GetUsersQueryParams'
    }
  }
}

// interfaces 中的接口代码
{
  "GetUsersQueryParams": `export interface GetUsersQueryParams {
  page?: number;
  size?: number;
}`
}
```

**命名规则**：

```text
{OperationId}{Position}Params

示例：
- GetUsersQueryParams
- GetUserByIdPathParams
- CreateUserHeaderParams
```

### 5. 输出控制

灵活控制输出内容，按需生成。

```typescript
// 只需要接口代码
const result = await adapter.parse('./swagger.json', {
  codeGeneration: {
    output: {
      schemas: false,     // 不生成结构化定义
      interfaces: true,   // 生成接口代码
      apis: false         // 不生成 API 定义
    }
  }
});

// 结果
console.log(Object.keys(result.schemas).length);    // 0
console.log(Object.keys(result.interfaces).length); // 50+
console.log(result.apis.length);                    // 0
```


## 🏗️ 项目架构

### Monorepo 结构

```text
api-codegen-universal/
├── packages/
│   ├── core/                    # 核心类型和工具
│   │   ├── src/
│   │   │   ├── types/          # 类型定义
│   │   │   │   ├── standard.ts    # 标准输出格式
│   │   │   │   ├── adapter.ts     # 适配器接口
│   │   │   │   ├── config.ts      # 配置类型
│   │   │   │   └── index.ts
│   │   │   └── utils/          # 工具类
│   │   │       ├── generic-detector.ts  # 泛型检测器
│   │   │       ├── path-classifier.ts   # 路径分类器
│   │   │       └── index.ts
│   │   └── package.json
│   │
│   └── openapi/                 # OpenAPI 适配器
│       ├── src/
│       │   ├── adapter/
│       │   │   └── index.ts    # OpenAPIAdapter 实现
│       │   └── index.ts
│       └── package.json
│
├── src/
│   └── index.ts                 # 主入口，统一导出
│
├── examples/                    # 示例代码
│   ├── basic-openapi.ts
│   ├── test-export-mode.ts
│   ├── test-interface-output.ts
│   └── test-output-control.ts
│
├── tests/                       # 测试文件
├── rslib.config.ts              # Rslib 构建配置
├── tsconfig.json                # TypeScript 配置
└── package.json                 # 根包配置
```

### 技术栈

- **构建工具**: Rslib + Rspack (基于 Rust 的高性能构建)
- **包管理**: pnpm workspace
- **语言**: TypeScript 5.x
- **代码质量**: ESLint + Prettier
- **测试框架**: Rstest
- **核心依赖**:
  - `openapi-typescript` - OpenAPI 到 TypeScript AST 转换
  - `@redocly/openapi-core` - OpenAPI 规范验证
  - `js-yaml` - YAML 解析支持

### 数据流

```text
输入源 (File/URL/Object)
    ↓
OpenAPIAdapter.parse()
    ↓
openapi-typescript (生成 AST)
    ↓
AST 遍历与解析
    ├→ extractSchemas()         → schemas
    ├→ generateInterfaces()     → interfaces
    └→ extractAPIs()            → apis
    ↓
StandardOutput
    ↓
用户代码生成器
```

### 核心模块说明

#### 1. @api-codegen-universal/core

提供核心类型定义和工具类：

- **类型定义**:
  - `StandardOutput` - 标准输出格式
  - `SchemaDefinition` - Schema 定义
  - `ApiDefinition` - API 定义
  - `IAdapter` - 适配器接口

- **工具类**:
  - `PathClassifier` - 路径分类器
  - `GenericDetector` - 泛型检测器

#### 2. @api-codegen-universal/openapi

OpenAPI 3.x 适配器实现：

- 基于 `openapi-typescript` 的 AST 解析
- Schema 提取与转换
- API 提取与参数处理
- 泛型自动识别
- TypeScript 接口代码生成

### 扩展性设计

**适配器模式**：

```typescript
interface IAdapter {
  parse(source: InputSource, options?: AdapterOptions): Promise<StandardOutput>;
  validate(source: InputSource): Promise<boolean>;
}
```

**添加新适配器**：

1. 实现 `IAdapter` 接口
2. 转换为 `StandardOutput` 格式
3. 导出适配器类

**示例 - Apifox 适配器（规划中）**：

```typescript
export class ApifoxAdapter implements IAdapter {
  async parse(source: InputSource, options?: ApifoxOptions): Promise<StandardOutput> {
    // 1. 读取 Apifox 格式数据
    // 2. 转换为 StandardOutput
    // 3. 返回结果
  }
  
  async validate(source: InputSource): Promise<boolean> {
    // 验证是否为有效的 Apifox 格式
  }
}
```


## 📚 完整示例

### 示例 1: 基础 OpenAPI 解析

```typescript
import { OpenAPIAdapter } from 'api-codegen-universal';

async function example1() {
  const adapter = new OpenAPIAdapter();
  
  // 解析本地文件
  const result = await adapter.parse('./petstore.json');
  
  console.log('Schemas 数量:', Object.keys(result.schemas).length);
  console.log('Interfaces 数量:', Object.keys(result.interfaces).length);
  console.log('APIs 数量:', result.apis.length);
  
  // 查看某个接口的代码
  console.log(result.interfaces.Pet);
}
```

### 示例 2: 生成 TypeScript 类型文件

```typescript
import { OpenAPIAdapter } from 'api-codegen-universal';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

async function example2() {
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse('./swagger.json', {
    codeGeneration: {
      interfaceExportMode: 'export',
      output: {
        interfaces: true,
        schemas: false,
        apis: false
      }
    }
  });
  
  // 创建输出目录
  const outputDir = './generated/types';
  mkdirSync(outputDir, { recursive: true });
  
  // 生成类型文件
  let content = '// Auto-generated by api-codegen-universal\n';
  content += `// Generated at: ${new Date().toISOString()}\n\n`;
  
  // 写入所有接口
  for (const code of Object.values(result.interfaces)) {
    content += code + '\n\n';
  }
  
  writeFileSync(join(outputDir, 'index.ts'), content);
  console.log('✅ 类型文件已生成');
}
```

### 示例 3: 按分类生成 API 文件

```typescript
import { OpenAPIAdapter } from 'api-codegen-universal';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

async function example3() {
  const adapter = new OpenAPIAdapter();
  const result = await adapter.parse('./swagger.json', {
    pathClassification: {
      commonPrefix: '/api/v1',
      outputPrefix: 'services',
      maxDepth: 2
    }
  });
  
  // 按 category.filePath 分组
  const grouped = new Map<string, typeof result.apis>();
  
  for (const api of result.apis) {
    const path = api.category.filePath;
    if (!grouped.has(path)) {
      grouped.set(path, []);
    }
    grouped.get(path)!.push(api);
  }
  
  // 为每组生成文件
  for (const [filePath, apis] of grouped) {
    const fullPath = join('./generated', filePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    
    let content = `// APIs for ${apis[0].category.segments.join('/')}\n\n`;
    
    for (const api of apis) {
      content += `// ${api.method} ${api.path}\n`;
      content += `export const ${api.operationId} = async (`;
      
      // 参数
      if (api.parameters?.query) {
        content += `query: ${api.parameters.query.ref}, `;
      }
      if (api.requestBody) {
        content += `data: any, `;
      }
      
      content += `) => {\n`;
      content += `  return request('${api.path}', { method: '${api.method}' });\n`;
      content += `};\n\n`;
    }
    
    writeFileSync(fullPath, content);
  }
  
  console.log(`✅ 生成了 ${grouped.size} 个 API 文件`);
}
```

### 示例 4: 自定义类型转换

```typescript
import { OpenAPIAdapter } from 'api-codegen-universal';
import ts from 'typescript';

async function example4() {
  const adapter = new OpenAPIAdapter();
  
  const result = await adapter.parse('./swagger.json', {
    transform(schemaObject, metadata) {
      // 自定义 date-time 处理
      if (schemaObject.format === 'date-time') {
        return ts.factory.createTypeReferenceNode('Date');
      }
      
      // 自定义 binary 处理
      if (schemaObject.format === 'binary') {
        return ts.factory.createTypeReferenceNode('File');
      }
      
      // 自定义数字格式
      if (schemaObject.type === 'number' && schemaObject.format === 'decimal') {
        return ts.factory.createTypeReferenceNode('Decimal');
      }
      
      return undefined; // 使用默认处理
    }
  });
  
  console.log('✅ 使用自定义类型转换解析完成');
}
```

### 示例 5: 远程 URL 解析

```typescript
import { OpenAPIAdapter } from 'api-codegen-universal';

async function example5() {
  const adapter = new OpenAPIAdapter();
  
  // 解析 Swagger Petstore 示例
  const result = await adapter.parse(
    new URL('https://petstore3.swagger.io/api/v3/openapi.json')
  );
  
  console.log('API 标题:', result.metadata?.title);
  console.log('API 版本:', result.metadata?.description);
  console.log('生成时间:', result.metadata?.generatedAt);
}
```

### 示例 6: 控制输出内容

```typescript
import { OpenAPIAdapter } from 'api-codegen-universal';

async function example6() {
  const adapter = new OpenAPIAdapter();
  
  // 场景1: 只需要 API 列表信息
  const result1 = await adapter.parse('./swagger.json', {
    codeGeneration: {
      output: {
        schemas: false,
        interfaces: false,
        apis: true
      }
    }
  });
  console.log('只有 APIs:', result1.apis.length);
  
  // 场景2: 只需要类型定义
  const result2 = await adapter.parse('./swagger.json', {
    codeGeneration: {
      output: {
        schemas: true,
        interfaces: true,
        apis: false
      }
    }
  });
  console.log('只有 Schemas:', Object.keys(result2.schemas).length);
}
```

## 🧪 开发指南

### 环境要求

- Node.js >= 20.0.0
- pnpm >= 8.0.0

### 安装依赖

```bash
# 克隆仓库
git clone https://github.com/XSIJIE975/api-codegen-universal.git
cd api-codegen-universal

# 安装依赖
pnpm install
```

### 开发命令

```bash
# 构建所有包
pnpm build

# 只构建子包 (packages/*)
pnpm build:packages

# 开发模式（监听文件变化）
pnpm dev

# 运行测试
pnpm test

# 代码检查
pnpm lint
pnpm lint:fix

# 代码格式化
pnpm format
```

### 运行示例

```bash
# 先构建
pnpm build

# 运行示例
node examples/basic-openapi.ts
node examples/test-interface-output.ts
node examples/test-output-control.ts
```

### 项目结构

```text
packages/core/          # 核心包
  ├── src/types/       # 类型定义
  └── src/utils/       # 工具类

packages/openapi/       # OpenAPI 适配器包
  └── src/adapter/     # 适配器实现

src/                    # 主包入口
examples/               # 使用示例
tests/                  # 测试用例
```

### 添加新功能

1. **添加新的工具类**:
   - 在 `packages/core/src/utils/` 创建文件
   - 导出到 `packages/core/src/utils/index.ts`

2. **添加新的类型**:
   - 在 `packages/core/src/types/` 添加定义
   - 导出到 `packages/core/src/types/index.ts`

3. **扩展 OpenAPI 适配器**:
   - 修改 `packages/openapi/src/adapter/index.ts`
   - 添加新的配置选项到 `OpenAPIOptions`

### 测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm test tests/index.test.ts
```

## 🗺️ 开发路线图

### ✅ v0.1.0 - MVP (已完成)

- [x] 项目初始化与 Monorepo 架构搭建
- [x] 核心类型定义 (`StandardOutput`, `SchemaDefinition`, `ApiDefinition`)
- [x] OpenAPI 3.x 基础解析支持
- [x] Schema 提取与转换
- [x] API 路径提取与分类
- [x] 泛型自动检测 (`GenericDetector`)
- [x] 智能路径分类器 (`PathClassifier`)
- [x] TypeScript 接口代码生成
- [x] 参数接口自动生成
- [x] 灵活的配置选项系统
- [x] 基础示例和文档

### 🚧 v0.2.0 - 功能完善 (进行中)

- [ ] YAML 格式完整支持
- [ ] 增强错误处理和验证
- [ ] 配置文件支持 (`.codegenrc`)
- [ ] 完善的单元测试覆盖
- [ ] 性能优化和大文件处理
- [ ] 更多配置选项
  - [ ] Schema 过滤
  - [ ] API 过滤
  - [ ] 自定义模板

### 📋 v0.3.0 - CLI 工具

- [ ] CLI 命令行工具
- [ ] 交互式配置生成
- [ ] Watch 模式（监听文件变化）
- [ ] 多文件输出支持
- [ ] 进度条和友好的输出

### 🎯 v0.4.0 - 增强功能

- [ ] Apifox 格式支持
- [ ] GraphQL Schema 支持
- [ ] 插件系统
- [ ] 自定义代码模板
- [ ] HTTP 客户端代码生成

### 🚀 v1.0.0 - 生产就绪

- [ ] 完整的文档网站
- [ ] 性能基准测试
- [ ] 发布到 npm
- [ ] CI/CD 完善
- [ ] 社区支持和反馈机制


## ❓ 常见问题 (FAQ)

### Q: 支持哪些 OpenAPI 版本？

A: 目前支持 OpenAPI 3.0 和 3.1 版本。不支持 Swagger 2.0（需要先转换到 OpenAPI 3.x）。

### Q: 生成的接口代码可以直接使用吗？

A: 是的。`result.interfaces` 中的代码字符串是完整的 TypeScript 接口定义，可以直接写入 `.ts` 文件使用。

### Q: 如何处理泛型类型？

A: 库会自动检测 `allOf` 合并模式，并将其转换为泛型类型。你可以通过 `schema.isGeneric`、`schema.baseType` 和 `schema.genericParam` 来识别和处理泛型。

### Q: 路径分类的规则是什么？

A: 路径分类器会：

1. 移除配置的 `commonPrefix`
2. 提取路径段（忽略 `{id}` 等参数）
3. 根据 `maxDepth` 限制深度
4. 生成建议的文件路径

例如：`/api/v1/auth/users` → `api/auth/users/index.ts`

### Q: 如何自定义类型转换？

A: 使用 `transform` 配置项：

```typescript
const result = await adapter.parse('./swagger.json', {
  transform(schemaObject, metadata) {
    if (schemaObject.format === 'date-time') {
      return ts.factory.createTypeReferenceNode('Date');
    }
  }
});
```

### Q: 如何只生成接口代码，不生成其他内容？

A: 使用 `output` 配置：

```typescript
codeGeneration: {
  output: {
    schemas: false,
    interfaces: true,
    apis: false
  }
}
```

### Q: 支持 YAML 格式吗？

A: 基础支持 YAML，但需要确保文件路径以 `.yaml` 或 `.yml` 结尾。完整的 YAML 支持将在 v0.2.0 中提供。

### Q: 如何处理大型 API 文档？

A: 建议：

1. 使用 `output` 控制只生成需要的内容
2. 将生成逻辑分批处理
3. 考虑使用流式处理（未来版本支持）

### Q: 生成的参数接口命名规则是什么？

A: `{OperationId}{Position}Params`，例如：

- `GetUsersQueryParams`
- `CreateUserPathParams`
- `UpdateUserHeaderParams`

可以通过 `parameterNamingStyle` 改变大小写风格。

### Q: 如何贡献代码？

A: 欢迎贡献！请：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 🤝 贡献指南

### 贡献方式

- 🐛 报告 Bug
- 💡 提出新功能建议
- 📝 改进文档
- 🔧 提交代码修复
- ⭐ Star 项目以支持我们

### 开发流程

1. **Fork 并克隆**

   ```bash
   git clone https://github.com/YOUR_USERNAME/api-codegen-universal.git
   cd api-codegen-universal
   pnpm install
   ```

2. **创建分支**

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **开发和测试**

   ```bash
   pnpm dev      # 开发模式
   pnpm test     # 运行测试
   pnpm lint     # 代码检查
   ```

4. **提交代码**

   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   git push origin feature/your-feature-name
   ```

5. **创建 Pull Request**

### Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `style:` 代码格式（不影响代码运行）
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建过程或辅助工具的变动

### 代码风格

- 使用 ESLint 和 Prettier
- 运行 `pnpm lint:fix` 自动修复
- 运行 `pnpm format` 格式化代码

## 📄 许可证

[MIT License](./LICENSE)

Copyright (c) 2025 XSIJIE975

## 🔗 相关资源

### 官方文档

- [OpenAPI Specification](https://swagger.io/specification/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Rslib Documentation](https://rslib.rs/)

### 相关项目

- [openapi-typescript](https://openapi-ts.dev/) - OpenAPI 到 TypeScript 类型转换
- [Swagger UI](https://swagger.io/tools/swagger-ui/) - API 文档可视化工具
- [Swagger Editor](https://editor.swagger.io/) - OpenAPI 规范编辑器
- [Apifox](https://www.apifox.cn/) - API 设计、开发、测试一体化平台
- [Postman](https://www.postman.com/) - API 开发协作平台

### 社区与支持

- [GitHub Issues](https://github.com/XSIJIE975/api-codegen-universal/issues) - 问题反馈
- [GitHub Discussions](https://github.com/XSIJIE975/api-codegen-universal/discussions) - 讨论交流

## 📊 项目统计

- ⭐ Stars: 欢迎 Star 支持！
- 🐛 Issues: 欢迎反馈问题
- 🔀 PRs: 欢迎贡献代码
- 📦 Downloads: Coming soon to npm

## 🙏 致谢

感谢以下开源项目：

- [openapi-typescript](https://github.com/drwpow/openapi-typescript) - 提供了出色的 OpenAPI AST 解析能力
- [Rspack](https://www.rspack.dev/) - 高性能的 JavaScript 打包工具
- [Rslib](https://rslib.rs/) - 基于 Rspack 的库构建工具

---

**如果这个项目对你有帮助，请给它一个 ⭐️！**

Made with ❤️ by [XSIJIE975](https://github.com/XSIJIE975)
