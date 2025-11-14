# API Codegen Universal - 技术方案

> **最后更新**: 2025-11-14 | **当前版本**: v0.1.0 | **状态**: ✅ MVP 完成

## 1. 项目概述

### 1.1 项目背景

现代前端开发中，API 接口调用是核心部分。通常的做法是：

1. 后端提供 API 文档(OpenAPI、Apifox 等)
2. 前端手动编写接口调用代码和 TypeScript 类型定义
3. API 变更时需要手动同步更新

这种方式存在的问题：

- 手动维护工作量大
- 容易出错，类型不同步
- 重复劳动

### 1.2 解决方案

开发一个通用的 API 代码生成器核心库，能够：

1. 解析多种 API 规范格式(OpenAPI、Apifox 等)
2. 转换为统一的标准数据结构
3. 供上层代码生成器使用，生成类型安全的 API 调用代码

### 1.3 核心价值

- **标准化**: 统一的输出格式，屏蔽不同 API 规范的差异
- **类型安全**: 完整的 TypeScript 类型定义
- **扩展性**: 易于添加新的 API 规范支持
- **复用性**: 输出的标准格式可被任何代码生成器使用

## 2. 技术架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                    Input Sources                        │
│  OpenAPI JSON/YAML │ Apifox API │ Postman Collection   │
└─────────────┬───────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│                   Adapter Factory                        │
│         (根据输入类型选择对应的适配器)                      │
└─────────────┬───────────────────────────────────────────┘
              │
      ┌───────┴───────┐
      ▼               ▼
┌──────────┐    ┌──────────┐    ┌──────────┐
│ OpenAPI  │    │ Apifox   │    │ Postman  │
│ Adapter  │    │ Adapter  │    │ Adapter  │
└────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │
     └───────┬───────┴───────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│              Standard Output Format                      │
│  {                                                       │
│    schemas: {...},  // 所有的 Schema 定义                 │
│    apis: [...],     // 所有的 API 接口                    │
│    metadata: {...}  // 元数据信息                        │
│  }                                                       │
└─────────────┬───────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│              Code Generators (上层应用)                   │
│  TypeScript │ Java │ C# │ Custom Generator              │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心模块设计

#### 2.2.1 类型定义模块 (types/)

**职责**: 定义所有核心类型

```typescript
// standard.ts - 标准输出格式
export interface StandardOutput {
  schemas: Record<string, SchemaDefinition>
  apis: ApiDefinition[]
  metadata: Metadata
}

export interface SchemaDefinition {
  name: string
  description?: string
  type: 'object' | 'array' | 'enum' | 'primitive' | 'generic'
  
  // object 类型
  properties?: Record<string, PropertyDefinition>
  required?: string[]
  
  // generic 类型
  isGeneric?: boolean
  genericParam?: string
  
  // enum 类型
  enum?: string[] | number[]
  
  // array 类型
  items?: SchemaReference
  
  // 其他
  additionalProperties?: SchemaReference
}

export interface PropertyDefinition {
  name: string
  type: string
  description?: string
  required: boolean
  nullable?: boolean
  default?: any
  example?: any
  format?: string
  pattern?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  enum?: string[] | number[]
}

export interface ApiDefinition {
  path: string
  method: HttpMethod
  operationId: string
  summary?: string
  description?: string
  tags?: string[]
  deprecated?: boolean
  
  // 请求参数
  parameters?: ParameterDefinition[]
  requestBody?: RequestBodyDefinition
  
  // 响应
  responses: Record<string, ResponseDefinition>
  
  // 分类信息
  category: CategoryInfo
}

export interface CategoryInfo {
  primary: string          // 主分类
  secondary?: string       // 次级分类
  depth: number            // 分类深度
  isUnclassified: boolean  // 是否未分类
  filePath: string         // 建议文件路径
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

export interface ParameterDefinition {
  name: string
  in: 'query' | 'path' | 'header' | 'cookie'
  required: boolean
  schema: SchemaReference
  description?: string
}

export interface SchemaReference {
  type: 'ref' | 'inline'
  ref?: string           // #/components/schemas/UserDto
  schema?: SchemaDefinition
}

export interface Metadata {
  version: string
  title?: string
  description?: string
  baseUrl?: string
  commonPrefix?: string
  generatedAt: string
}
```

#### 2.2.2 适配器模块 (adapters/)

**职责**: 将不同格式转换为标准格式

```typescript
// base.ts - 适配器基类
export interface IAdapter {
  /**
   * 解析输入源，返回标准格式
   */
  parse(source: InputSource, options?: AdapterOptions): Promise<StandardOutput>
  
  /**
   * 验证输入源是否有效
   */
  validate(source: InputSource): Promise<boolean>
}

export type InputSource = string | URL | object

export interface AdapterOptions {
  [key: string]: any
}

// openapi/index.ts - OpenAPI 适配器
export class OpenAPIAdapter implements IAdapter {
  private parser: OpenAPIParser
  private schemaTransformer: SchemaTransformer
  private pathTransformer: PathTransformer
  private genericDetector: GenericDetector
  
  async parse(source: InputSource, options?: OpenAPIOptions): Promise<StandardOutput> {
    // 1. 使用 openapi-typescript 解析
    const ast = await openapiTS(source, options?.transform)
    
    // 2. 解析 OpenAPI 原始对象
    const openapi = await this.parser.parseRaw(source)
    
    // 3. 转换 schemas
    const schemas = await this.schemaTransformer.transform(
      openapi.components?.schemas || {},
      options
    )
    
    // 4. 转换 APIs
    const apis = await this.pathTransformer.transform(
      openapi.paths || {},
      options
    )
    
    // 5. 生成元数据
    const metadata = this.generateMetadata(openapi, options)
    
    return { schemas, apis, metadata }
  }
  
  async validate(source: InputSource): Promise<boolean> {
    // 验证是否为有效的 OpenAPI 格式
  }
}
```

#### 2.2.3 转换器模块

**SchemaTransformer - Schema 转换器**

```typescript
export class SchemaTransformer {
  private genericDetector: GenericDetector
  private refResolver: RefResolver
  
  /**
   * 转换所有 schemas
   */
  async transform(
    schemas: Record<string, OpenAPISchemaObject>,
    options?: OpenAPIOptions
  ): Promise<Record<string, SchemaDefinition>> {
    const result: Record<string, SchemaDefinition> = {}
    
    for (const [name, schema] of Object.entries(schemas)) {
      result[name] = await this.transformSchema(name, schema, options)
    }
    
    return result
  }
  
  /**
   * 转换单个 schema
   */
  private async transformSchema(
    name: string,
    schema: OpenAPISchemaObject,
    options?: OpenAPIOptions
  ): Promise<SchemaDefinition> {
    // 1. 检测是否为泛型
    const isGeneric = this.genericDetector.detect(schema, options)
    
    // 2. 转换类型
    const type = this.determineType(schema)
    
    // 3. 转换属性
    const properties = await this.transformProperties(schema.properties, schema.required)
    
    // 4. 处理枚举
    const enumValues = schema.enum
    
    return {
      name,
      type,
      description: schema.description,
      properties,
      required: schema.required,
      isGeneric,
      enum: enumValues,
      // ...
    }
  }
  
  /**
   * 转换属性
   */
  private async transformProperties(
    properties?: Record<string, OpenAPISchemaObject>,
    required?: string[]
  ): Promise<Record<string, PropertyDefinition>> {
    // 转换每个属性
  }
  
  /**
   * 确定类型
   */
  private determineType(schema: OpenAPISchemaObject): SchemaDefinition['type'] {
    if (schema.enum) return 'enum'
    if (schema.type === 'array') return 'array'
    if (schema.type === 'object') return 'object'
    return 'primitive'
  }
}
```

**PathTransformer - API 路径转换器**

```typescript
export class PathTransformer {
  private pathClassifier: PathClassifier
  
  /**
   * 转换所有 paths
   */
  async transform(
    paths: Record<string, OpenAPIPathItemObject>,
    options?: OpenAPIOptions
  ): Promise<ApiDefinition[]> {
    const apis: ApiDefinition[] = []
    
    for (const [path, pathItem] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!this.isHttpMethod(method)) continue
        
        const api = await this.transformOperation(
          path,
          method as HttpMethod,
          operation,
          options
        )
        
        apis.push(api)
      }
    }
    
    return apis
  }
  
  /**
   * 转换单个 operation
   */
  private async transformOperation(
    path: string,
    method: HttpMethod,
    operation: OpenAPIOperationObject,
    options?: OpenAPIOptions
  ): Promise<ApiDefinition> {
    // 1. 分类路径
    const category = this.pathClassifier.classify(path, options?.commonPrefix)
    
    // 2. 解析参数
    const parameters = await this.transformParameters(operation.parameters)
    
    // 3. 解析请求体
    const requestBody = await this.transformRequestBody(operation.requestBody)
    
    // 4. 解析响应
    const responses = await this.transformResponses(operation.responses)
    
    return {
      path,
      method,
      operationId: operation.operationId || `${method}_${path}`,
      summary: operation.summary,
      description: operation.description,
      tags: operation.tags,
      parameters,
      requestBody,
      responses,
      category
    }
  }
}
```

#### 2.2.4 工具模块 (utils/)

**PathClassifier - 路径分类器**

```typescript
export class PathClassifier {
  /**
   * 对 API 路径进行分类
   */
  classify(path: string, commonPrefix?: string): CategoryInfo {
    // 1. 移除公共前缀
    const normalizedPath = this.removePrefix(path, commonPrefix)
    
    // 2. 检查是否符合分类规则
    if (!this.matchesPattern(normalizedPath)) {
      return {
        primary: 'unclassified',
        depth: 0,
        isUnclassified: true,
        filePath: 'api/unclassified.ts'
      }
    }
    
    // 3. 提取分类层级
    const segments = this.extractSegments(normalizedPath)
    
    return {
      primary: segments[0],
      secondary: segments[1],
      depth: segments.length,
      isUnclassified: false,
      filePath: this.generateFilePath(segments)
    }
  }
  
  private removePrefix(path: string, prefix?: string): string {
    if (!prefix) return path
    return path.startsWith(prefix) ? path.slice(prefix.length) : path
  }
  
  private matchesPattern(path: string): boolean {
    // 检查路径是否符合标准格式
    return /^\/[a-zA-Z0-9-_]+/.test(path)
  }
  
  private extractSegments(path: string): string[] {
    // 提取路径段，忽略参数
    return path
      .split('/')
      .filter(s => s && !s.startsWith('{'))
      .slice(0, 2) // 最多两级
  }
  
  private generateFilePath(segments: string[]): string {
    return `api/${segments.join('/')}/index.ts`
  }
}
```

**GenericDetector - 泛型检测器**

```typescript
export class GenericDetector {
  /**
   * 检测 schema 是否为泛型容器
   */
  detect(schema: OpenAPISchemaObject, options?: OpenAPIOptions): boolean {
    // 1. 检查是否在配置的泛型列表中
    const genericWrappers = options?.genericWrappers || ['ApiSuccessResponse', 'PageResult']
    
    // 2. 检查 allOf 模式
    if (schema.allOf) {
      return this.detectAllOfPattern(schema.allOf, genericWrappers)
    }
    
    // 3. 检查是否有泛型属性（如 data: any）
    if (schema.properties?.data && schema.properties.data.type === 'object') {
      return true
    }
    
    return false
  }
  
  /**
   * 检测 allOf 模式
   */
  private detectAllOfPattern(
    allOf: OpenAPISchemaObject[],
    genericWrappers: string[]
  ): boolean {
    // 检查是否有引用泛型容器 + 属性覆盖的模式
    const hasGenericRef = allOf.some(item => {
      if (item.$ref) {
        const refName = this.extractRefName(item.$ref)
        return genericWrappers.includes(refName)
      }
      return false
    })
    
    const hasPropertyOverride = allOf.some(item => item.properties?.data)
    
    return hasGenericRef && hasPropertyOverride
  }
  
  /**
   * 提取泛型类型参数
   */
  extractGenericType(schema: OpenAPISchemaObject): string | undefined {
    if (!schema.allOf) return undefined
    
    // 从 allOf 中找到覆盖 data 属性的项
    for (const item of schema.allOf) {
      if (item.properties?.data) {
        return this.resolveType(item.properties.data)
      }
    }
    
    return undefined
  }
  
  private extractRefName(ref: string): string {
    return ref.split('/').pop() || ''
  }
  
  private resolveType(schema: OpenAPISchemaObject): string {
    if (schema.$ref) {
      return this.extractRefName(schema.$ref)
    }
    return schema.type || 'any'
  }
}
```

**TypeConverter - 类型转换器**

```typescript
export class TypeConverter {
  /**
   * OpenAPI 类型转 TypeScript 类型
   */
  convert(schema: OpenAPISchemaObject): string {
    // 处理 $ref
    if (schema.$ref) {
      return this.extractRefName(schema.$ref)
    }
    
    // 处理 enum
    if (schema.enum) {
      return this.convertEnum(schema.enum)
    }
    
    // 处理数组
    if (schema.type === 'array') {
      return `${this.convert(schema.items!)}[]`
    }
    
    // 处理对象
    if (schema.type === 'object') {
      return this.convertObject(schema)
    }
    
    // 处理基础类型
    return this.convertPrimitive(schema.type, schema.format)
  }
  
  private convertPrimitive(type?: string, format?: string): string {
    const typeMap: Record<string, string> = {
      'string': 'string',
      'number': 'number',
      'integer': 'number',
      'boolean': 'boolean',
      'null': 'null'
    }
    
    // 特殊格式处理
    if (format === 'date-time' || format === 'date') {
      return 'string' // 或 'Date'，根据配置
    }
    
    return typeMap[type || 'string'] || 'any'
  }
  
  private convertEnum(values: any[]): string {
    return values.map(v => JSON.stringify(v)).join(' | ')
  }
  
  private convertObject(schema: OpenAPISchemaObject): string {
    // 生成内联对象类型
    if (!schema.properties) return 'Record<string, any>'
    
    const props = Object.entries(schema.properties).map(([key, prop]) => {
      const required = schema.required?.includes(key)
      const type = this.convert(prop)
      return `${key}${required ? '' : '?'}: ${type}`
    })
    
    return `{ ${props.join('; ')} }`
  }
  
  private extractRefName(ref: string): string {
    return ref.split('/').pop() || 'any'
  }
}
```

#### 2.2.5 工厂模块 (factory.ts)

```typescript
export class AdapterFactory {
  /**
   * 根据类型创建适配器
   */
  static create(type: 'openapi' | 'apifox'): IAdapter {
    switch (type) {
      case 'openapi':
        return new OpenAPIAdapter()
      case 'apifox':
        throw new Error('Apifox adapter not implemented yet')
      default:
        throw new Error(`Unknown adapter type: ${type}`)
    }
  }
  
  /**
   * 自动检测输入类型并创建适配器
   */
  static async autoDetect(input: InputSource): Promise<IAdapter> {
    // 读取输入内容
    const content = await this.readInput(input)
    
    // 检测格式
    if (this.isOpenAPI(content)) {
      return new OpenAPIAdapter()
    }
    
    if (this.isApifox(content)) {
      throw new Error('Apifox adapter not implemented yet')
    }
    
    throw new Error('Unknown API specification format')
  }
  
  private static async readInput(input: InputSource): Promise<any> {
    if (typeof input === 'object' && !(input instanceof URL)) {
      return input
    }
    
    // 读取文件或 URL
    // ...
  }
  
  private static isOpenAPI(content: any): boolean {
    return content.openapi !== undefined || content.swagger !== undefined
  }
  
  private static isApifox(content: any): boolean {
    return content.apifoxVersion !== undefined
  }
}
```

### 2.3 主入口设计

```typescript
// index.ts
export interface ParseOptions {
  source: InputSource
  parser?: 'openapi' | 'apifox' | 'auto'
  openapi?: OpenAPIOptions
  apifox?: ApifoxOptions
}

export interface OpenAPIOptions {
  /** 公共前缀 */
  commonPrefix?: string
  /** 泛型容器列表 */
  genericWrappers?: string[]
  /** 自定义 transform */
  transform?: (schemaObject: any, metadata: any) => any
}

export interface ApifoxOptions {
  token?: string
  projectId?: string
}

/**
 * 解析 API 规范并输出标准格式
 */
export async function parse(options: ParseOptions): Promise<StandardOutput> {
  const { source, parser = 'auto' } = options
  
  // 1. 创建适配器
  let adapter: IAdapter
  if (parser === 'auto') {
    adapter = await AdapterFactory.autoDetect(source)
  } else {
    adapter = AdapterFactory.create(parser)
  }
  
  // 2. 解析
  const adapterOptions = parser === 'openapi' ? options.openapi : options.apifox
  const result = await adapter.parse(source, adapterOptions)
  
  return result
}

// 导出所有类型
export * from './types'
export * from './adapters/base'
export * from './utils'
```

## 3. 关键技术实现

### 3.1 泛型检测与处理

**问题**: OpenAPI 中的 `allOf` 如何识别为 TypeScript 泛型？

**示例 OpenAPI 结构**:
```yaml
CsDevListResponse:
  allOf:
    - $ref: '#/components/schemas/ApiSuccessResponse'
    - type: object
      properties:
        data:
          $ref: '#/components/schemas/PaginatedCsDevVo'
```

**期望输出**:
```typescript
ApiSuccessResponse<PaginatedCsDevVo>
```

**实现步骤**:
1. 检测 `allOf` 结构
2. 识别第一个元素是泛型容器（如 `ApiSuccessResponse`）
3. 识别第二个元素覆盖了 `data` 属性
4. 提取 `data` 属性的类型作为泛型参数
5. 生成泛型类型 `Container<T>`

### 3.2 路径分类算法

**问题**: 如何将 API 路径智能分类到文件？

**规则**:
1. 移除公共前缀（如 `/api/v1`）
2. 按第一级路径分类（如 `/auth/xxx` -> `auth/`）
3. 如果有第二级路径，继续分类（如 `/auth/users/xxx` -> `auth/users/`）
4. 不符合规则的放入 `unclassified.ts`

**示例**:
```
/api/v1/auth/login        -> api/auth/index.ts
/api/v1/auth/register     -> api/auth/index.ts
/api/v1/users/{id}        -> api/users/index.ts
/api/v1/roles/paginated   -> api/roles/index.ts
/other-api/test           -> api/unclassified.ts
```

### 3.3 类型转换映射表

| OpenAPI Type | Format | TypeScript Type |
|--------------|--------|-----------------|
| string | - | string |
| string | date-time | string |
| string | date | string |
| string | binary | Blob |
| number | - | number |
| integer | - | number |
| boolean | - | boolean |
| array | - | T[] |
| object | - | { [key: string]: any } |
| enum | - | 'a' \| 'b' \| 'c' |

### 3.4 $ref 引用解析

使用 `@redocly/openapi-core` 的 `bundle` 功能：
```typescript
import { bundle } from '@redocly/openapi-core'

const { bundle: bundled } = await bundle({
  ref: './openapi.yaml'
})

// bundled 包含所有解析后的引用
```

## 4. 性能优化

### 4.1 并行处理

```typescript
// 并行转换所有 schemas
const schemaPromises = Object.entries(schemas).map(
  ([name, schema]) => this.transformSchema(name, schema, options)
)
const schemaResults = await Promise.all(schemaPromises)
```

### 4.2 缓存机制

```typescript
class RefResolver {
  private cache = new Map<string, SchemaDefinition>()
  
  resolve(ref: string): SchemaDefinition {
    if (this.cache.has(ref)) {
      return this.cache.get(ref)!
    }
    
    const resolved = this.doResolve(ref)
    this.cache.set(ref, resolved)
    return resolved
  }
}
```

### 4.3 增量更新（未来）

只更新变化的部分，而不是重新生成所有代码。

## 5. 测试策略

### 5.1 单元测试

```typescript
// path-classifier.test.ts
describe('PathClassifier', () => {
  const classifier = new PathClassifier()
  
  it('should classify standard path', () => {
    const result = classifier.classify('/api/v1/auth/login', '/api/v1')
    expect(result.primary).toBe('auth')
    expect(result.filePath).toBe('api/auth/index.ts')
  })
  
  it('should classify nested path', () => {
    const result = classifier.classify('/api/v1/auth/users/profile', '/api/v1')
    expect(result.primary).toBe('auth')
    expect(result.secondary).toBe('users')
    expect(result.filePath).toBe('api/auth/users/index.ts')
  })
  
  it('should mark unclassified path', () => {
    const result = classifier.classify('/other-api/test', '/api/v1')
    expect(result.isUnclassified).toBe(true)
    expect(result.filePath).toBe('api/unclassified.ts')
  })
})
```

### 5.2 集成测试

```typescript
// integration.test.ts
describe('OpenAPI Integration', () => {
  it('should parse complete OpenAPI document', async () => {
    const result = await parse({
      source: './fixtures/petstore.yaml',
      parser: 'openapi'
    })
    
    expect(result.schemas).toBeDefined()
    expect(result.apis.length).toBeGreaterThan(0)
    expect(result.metadata.version).toBe('3.0.0')
  })
})
```

### 5.3 快照测试

```typescript
it('should generate consistent output', async () => {
  const result = await parse({
    source: './fixtures/simple.json'
  })
  
  expect(result).toMatchSnapshot()
})
```

## 6. 错误处理

### 6.1 输入验证

```typescript
async parse(source: InputSource, options?: OpenAPIOptions): Promise<StandardOutput> {
  // 1. 验证输入
  const isValid = await this.validate(source)
  if (!isValid) {
    throw new ValidationError('Invalid OpenAPI specification')
  }
  
  // 2. 解析
  try {
    return await this.doParse(source, options)
  } catch (error) {
    throw new ParseError(`Failed to parse OpenAPI: ${error.message}`)
  }
}
```

### 6.2 自定义错误类型

```typescript
export class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class ParseError extends Error {
  constructor(message: string, public source?: any) {
    super(message)
    this.name = 'ParseError'
  }
}
```

## 7. 配置文件支持

```typescript
// codegen.config.ts
import { defineConfig } from 'api-codegen-universal'

export default defineConfig({
  input: './swagger.json',
  parser: 'openapi',
  
  openapi: {
    commonPrefix: '/api/v1',
    genericWrappers: ['ApiSuccessResponse', 'PageResult'],
    
    // 自定义转换
    transform(schemaObject, metadata) {
      if (schemaObject.format === 'date-time') {
        return 'Date'
      }
    }
  },
  
  output: {
    format: 'json',
    path: './generated/api-spec.json'
  }
})
```

## 8. 构建与发布

### 8.1 构建配置

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  external: ['openapi-typescript']
})
```

### 8.2 包结构

```json
{
  "name": "api-codegen-universal",
  "version": "0.1.0",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "require": "./dist/index.cjs",
      "import": "./dist/index.mjs",
      "types": "./dist/index.d.ts"
    }
  }
}
```

## 9. 文档计划

### 9.1 API 文档

使用 TypeDoc 生成：
```bash
pnpm add -D typedoc
npx typedoc src/index.ts
```

### 9.2 使用示例

在 `examples/` 目录下提供多个示例项目

### 9.3 架构文档

当前文档即为架构设计文档

## 10. 路线图

### v0.1.0 - MVP（1-2周）
- [x] 项目初始化
- [ ] 核心类型定义
- [ ] OpenAPI 基础解析
- [ ] 基础测试
- [ ] 基础文档

### v0.2.0 - 核心功能（2-3周）
- [ ] 泛型检测与处理
- [ ] 路径分类算法
- [ ] 完整类型转换
- [ ] 配置文件支持
- [ ] 完整测试覆盖

### v0.3.0 - 增强功能（1-2周）
- [ ] CLI 工具
- [ ] 更多配置选项
- [ ] 性能优化
- [ ] 更多示例

### v1.0.0 - 生产就绪（1周）
- [ ] 完整文档
- [ ] 稳定性测试
- [ ] 发布到 npm

### v1.1.0 - 扩展支持（待定）
- [ ] Apifox 适配器
- [ ] Postman 支持
- [ ] 代码生成器插件

## 11. 总结

本技术方案采用适配器模式，将不同的 API 规范格式统一转换为标准数据结构。核心优势在于：

1. **标准化**: 统一的输出格式，易于使用
2. **可扩展**: 易于添加新格式支持
3. **类型安全**: 完整的 TypeScript 类型
4. **高性能**: 基于成熟的 openapi-typescript 库

通过分阶段实现，确保每个版本都能交付可用的功能，逐步完善整个系统。
