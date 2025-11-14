# API Codegen Universal

> **当前版本**: v0.1.0 | **状态**: ✅ MVP 完成，核心功能可用

通用的 API 代码生成器核心库，支持将 OpenAPI、Apifox 等 API 规范格式转换为标准化的数据结构。

## 🎯 特性

- ✅ 支持 OpenAPI 3.0/3.1 规范
- ✅ 统一的标准输出格式
- ✅ 完整的 TypeScript 类型定义
- ✅ 泛型自动检测（`allOf` 合并模式）
- ✅ 智能路径分类算法
- 🚧 Apifox 支持（规划中）
- 🚧 CLI 工具（规划中）

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
import { parse } from 'api-codegen-universal'

// 从本地文件解析
const result = await parse({
  source: './swagger.json'
})

console.log(result.schemas)  // 所有的 Schema 定义
console.log(result.apis)     // 所有的 API 接口
console.log(result.metadata) // 元数据信息
```

### 从远程 URL 解析

```typescript
const result = await parse({
  source: 'https://petstore3.swagger.io/api/v3/openapi.json'
})
```

### 从 JSON 对象解析

```typescript
const openapiSpec = {
  openapi: '3.0.0',
  paths: { /* ... */ },
  components: { /* ... */ }
}

const result = await parse({
  source: openapiSpec
})
```

### 自定义配置

```typescript
const result = await parse({
  source: './swagger.yaml',
  parser: 'openapi',
  openapi: {
    // 公共前缀（用于路径分类）
    commonPrefix: '/api/v1',
    
    // 泛型容器列表
    genericWrappers: ['ApiSuccessResponse', 'PageResult'],
    
    // 自定义类型转换
    transform(schemaObject, metadata) {
      if (schemaObject.format === 'date-time') {
        // 将 date-time 转换为 Date 类型
        return ts.factory.createIdentifier('Date')
      }
    }
  }
})
```

## 📊 标准输出格式

```typescript
interface StandardOutput {
  // 所有的 Schema 模型定义
  schemas: Record<string, SchemaDefinition>
  
  // 所有的 API 接口定义
  apis: ApiDefinition[]
  
  // 元数据信息
  metadata: Metadata
}
```

### Schema 定义

```typescript
interface SchemaDefinition {
  name: string                    // Schema 名称
  description?: string            // 描述
  type: 'object' | 'array' | 'enum' | 'primitive' | 'generic'
  
  // object 类型的属性
  properties?: Record<string, PropertyDefinition>
  required?: string[]
  
  // generic 类型的信息
  isGeneric?: boolean
  genericParam?: string
  
  // enum 类型的值
  enum?: string[] | number[]
  
  // array 类型的元素
  items?: SchemaReference
}
```

### API 定义

```typescript
interface ApiDefinition {
  path: string                    // API 路径
  method: HttpMethod              // HTTP 方法
  operationId: string             // 操作 ID
  summary?: string                // 摘要
  description?: string            // 描述
  tags?: string[]                 // 标签
  
  // 请求参数
  parameters?: ParameterDefinition[]
  requestBody?: RequestBodyDefinition
  
  // 响应
  responses: Record<string, ResponseDefinition>
  
  // 分类信息（用于代码生成）
  category: CategoryInfo
}
```

### 分类信息

```typescript
interface CategoryInfo {
  primary: string          // 主分类（如 'auth'）
  secondary?: string       // 次级分类（如 'users'）
  depth: number            // 分类深度
  isUnclassified: boolean  // 是否为未分类
  filePath: string         // 建议的文件路径
}
```

## 🔧 配置选项

### ParseOptions

```typescript
interface ParseOptions {
  // 输入源（本地文件、URL 或 JSON 对象）
  source: string | URL | object
  
  // 解析器类型（默认 'auto'）
  parser?: 'openapi' | 'apifox' | 'auto'
  
  // OpenAPI 特定配置
  openapi?: OpenAPIOptions
  
  // Apifox 特定配置（预留）
  apifox?: ApifoxOptions
}
```

### OpenAPIOptions

```typescript
interface OpenAPIOptions {
  // 公共前缀，用于路径分类
  // 例如: '/api/v1'
  commonPrefix?: string
  
  // 泛型容器列表
  // 例如: ['ApiSuccessResponse', 'PageResult']
  genericWrappers?: string[]
  
  // 自定义 Schema 转换函数
  transform?: (schemaObject: any, metadata: any) => any
}
```

## 📖 使用场景

### 1. 生成 TypeScript 类型定义

```typescript
const { schemas } = await parse({ source: './swagger.json' })

// 根据 schemas 生成 .d.ts 文件
for (const [name, schema] of Object.entries(schemas)) {
  generateTypeDefinition(name, schema)
}
```

### 2. 生成 API 调用函数

```typescript
const { apis } = await parse({ 
  source: './swagger.json',
  openapi: { commonPrefix: '/api/v1' }
})

// 根据分类生成文件
const grouped = groupBy(apis, api => api.category.filePath)

for (const [filePath, apiList] of Object.entries(grouped)) {
  generateApiFile(filePath, apiList)
}
```

### 3. 泛型处理示例

输入（OpenAPI）：
```yaml
CsDevListResponse:
  allOf:
    - $ref: '#/components/schemas/ApiSuccessResponse'
    - type: object
      properties:
        data:
          $ref: '#/components/schemas/PaginatedCsDevVo'
```

输出（StandardOutput）：
```typescript
{
  name: 'CsDevListResponse',
  isGeneric: true,
  genericParam: 'PaginatedCsDevVo',
  baseType: 'ApiSuccessResponse'
}
```

可用于生成：
```typescript
type CsDevListResponse = ApiSuccessResponse<PaginatedCsDevVo>
```

## 🏗️ 架构设计

```
输入源
  ↓
适配器工厂（自动检测或指定）
  ↓
OpenAPIAdapter / ApifoxAdapter
  ↓
标准输出格式
  ↓
上层代码生成器
```

### 核心模块

- **适配器（Adapters）**: 将不同格式转换为标准格式
- **转换器（Transformers）**: Schema 和 Path 的具体转换逻辑
- **工具函数（Utils）**: 路径分类、类型转换等通用工具

详细架构请查看 [TECHNICAL_DESIGN.md](./TECHNICAL_DESIGN.md)

## 📚 文档

- [项目大纲](./OUTLINE.md) - 项目整体规划
- [技术方案](./TECHNICAL_DESIGN.md) - 详细技术设计
- [API 文档](./docs/api.md) - API 使用文档（待完善）
- [示例](./examples/) - 使用示例（待完善）

## 🧪 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 测试
pnpm test

# 类型检查
pnpm typecheck

# 代码格式化
pnpm format
```

## 🗺️ 路线图

### v0.1.0 - MVP ✅

- [x] 项目初始化
- [x] 核心类型定义
- [x] OpenAPI 基础解析
- [x] Schema 和 Path 转换
- [x] 泛型检测
- [x] 路径分类算法
- [x] 构建和示例验证

### v0.2.0 - 完善功能

- [ ] YAML 完整支持
- [ ] 错误处理增强
- [ ] 配置文件支持
- [ ] 单元测试

### v0.3.0 - 增强功能

- [ ] CLI 工具
- [ ] 更多配置选项
- [ ] 性能优化

### v1.0.0 - 生产就绪

- [ ] Apifox 支持
- [ ] 完整文档
- [ ] 发布到 npm

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

## 📄 许可证

MIT License

## 🔗 相关项目

- [openapi-typescript](https://openapi-ts.dev/) - OpenAPI 到 TypeScript 类型转换
- [Swagger UI](https://swagger.io/tools/swagger-ui/) - API 文档可视化
- [Apifox](https://www.apifox.cn/) - API 设计、开发、测试一体化工具
