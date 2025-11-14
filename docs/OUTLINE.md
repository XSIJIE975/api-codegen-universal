# API Codegen Universal - 项目大纲

> **最后更新**: 2025-11-14 | **当前版本**: v0.1.0 | **状态**: ✅ MVP 完成

## 📋 项目概述

**项目名称**: api-codegen-universal  
**项目定位**: 通用的 API 代码生成器核心库  
**核心功能**: 将各种 API 规范(OpenAPI、Apifox 等)解析并转换为标准化的数据结构，供上层代码生成器使用

## 🎯 核心目标

1. **标准化输出**: 提供统一的中间数据结构，屏蔽不同 API 规范的差异
2. **扩展性强**: 支持多种 API 规范格式（OpenAPI、Apifox、Postman 等）
3. **类型安全**: 完整的 TypeScript 类型定义
4. **易于使用**: 简洁的 API 接口，支持多种输入方式

## 🏗️ 项目架构

### 分层设计

```
api-codegen-universal/
├── packages/
│   ├── core/                          # 核心解析引擎
│   │   ├── src/
│   │   │   ├── types/                 # 类型定义
│   │   │   │   ├── standard.ts        # 标准输出数据结构
│   │   │   │   ├── openapi.ts         # OpenAPI 相关类型
│   │   │   │   └── config.ts          # 配置类型
│   │   │   │
│   │   │   ├── adapters/              # 适配器（解析器）
│   │   │   │   ├── base.ts            # 基础适配器接口
│   │   │   │   ├── openapi/           # OpenAPI 适配器
│   │   │   │   │   ├── index.ts       # 主入口
│   │   │   │   │   ├── parser.ts      # 解析器
│   │   │   │   │   ├── schema-transformer.ts  # Schema 转换
│   │   │   │   │   ├── path-transformer.ts    # Path 转换
│   │   │   │   │   ├── generic-detector.ts    # 泛型检测
│   │   │   │   │   └── ref-resolver.ts        # $ref 引用解析
│   │   │   │   │
│   │   │   │   └── apifox/            # Apifox 适配器（预留）
│   │   │   │       └── index.ts
│   │   │   │
│   │   │   ├── utils/                 # 工具函数
│   │   │   │   ├── path-classifier.ts # 路径分类算法
│   │   │   │   ├── type-converter.ts  # 类型转换工具
│   │   │   │   └── logger.ts          # 日志工具
│   │   │   │
│   │   │   ├── factory.ts             # 适配器工厂
│   │   │   └── index.ts               # 主入口
│   │   │
│   │   ├── tests/                     # 测试文件
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cli/                           # 命令行工具（可选，Phase 3）
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── examples/                          # 示例项目
│   ├── basic/                         # 基础使用示例
│   ├── with-generics/                 # 泛型处理示例
│   └── custom-transform/              # 自定义转换示例
│
├── docs/                              # 文档
│   ├── api.md                         # API 文档
│   ├── examples.md                    # 使用示例
│   └── architecture.md                # 架构设计
│
├── package.json                       # 根 package.json (monorepo)
├── pnpm-workspace.yaml                # pnpm workspace 配置
├── tsconfig.json                      # TypeScript 基础配置
└── README.md                          # 项目说明
```

## 📦 核心模块

### 1. 标准数据结构（Standard Output）

```typescript
interface StandardOutput {
  schemas: Record<string, SchemaDefinition>
  apis: ApiDefinition[]
  metadata: Metadata
}
```

**职责**: 定义统一的输出格式，所有适配器都必须输出这种格式

### 2. 适配器（Adapters）

**职责**: 将不同的 API 规范转换为标准数据结构

- **OpenAPIAdapter**: 解析 OpenAPI 3.0/3.1 规范
- **ApifoxAdapter**: 解析 Apifox 格式（预留）

### 3. 工具函数（Utils）

**职责**: 提供通用的工具函数

- **PathClassifier**: 路径分类算法（按 `/api/v1/auth/xxx` 等规则分类）
- **TypeConverter**: 类型转换（OpenAPI type -> TS type）
- **GenericDetector**: 泛型检测（识别 `allOf` 等模式）

### 4. 适配器工厂（Factory）

**职责**: 根据配置创建对应的适配器实例

## 🔑 核心功能

### Phase 1: MVP（最小可行产品）

- [x] 项目初始化
- [ ] 定义标准数据结构
- [ ] OpenAPI 基础解析
  - [ ] 解析 `paths`
  - [ ] 解析 `components.schemas`
  - [ ] 基础类型转换
- [ ] 输出标准化 JSON
- [ ] 单元测试

### Phase 2: 核心功能完善

- [ ] 泛型处理
  - [ ] 识别 `allOf` 合并模式
  - [ ] 自动检测泛型容器（如 `ApiSuccessResponse<T>`）
- [ ] 路径分类算法
  - [ ] 按公共前缀分类
  - [ ] 支持多级路径分类
  - [ ] 未分类路径统一处理
- [ ] 完整类型转换
  - [ ] `enum` 处理
  - [ ] `array` / `object` 嵌套
  - [ ] `$ref` 引用解析
  - [ ] `required` 字段处理
- [ ] 配置文件支持

### Phase 3: 扩展功能

- [ ] CLI 工具
- [ ] 自定义 transform 钩子
- [ ] 更多配置选项
- [ ] 性能优化

### Phase 4: 多格式支持

- [ ] Apifox 适配器
- [ ] Postman Collection 支持（可选）
- [ ] Swagger 2.0 支持（可选）

## 📐 设计模式

### 1. 适配器模式（Adapter Pattern）

**应用场景**: 不同 API 规范的解析

```typescript
interface IAdapter {
  parse(source: any, options?: any): Promise<StandardOutput>
}

class OpenAPIAdapter implements IAdapter { /* ... */ }
class ApifoxAdapter implements IAdapter { /* ... */ }
```

### 2. 工厂模式（Factory Pattern）

**应用场景**: 创建适配器实例

```typescript
class AdapterFactory {
  static create(type: 'openapi' | 'apifox'): IAdapter
  static autoDetect(input: any): IAdapter
}
```

### 3. 策略模式（Strategy Pattern）

**应用场景**: 不同的类型转换策略

```typescript
interface ITypeConverter {
  convert(schema: SchemaObject): TypeDefinition
}
```

## 🔧 技术栈

### 核心依赖

- **TypeScript**: 类型安全
- **openapi-typescript**: OpenAPI 解析基础库
- **@redocly/openapi-core**: OpenAPI 验证和处理

### 开发工具

- **pnpm**: 包管理器（支持 monorepo）
- **tsup**: TypeScript 构建工具
- **vitest**: 单元测试框架
- **prettier**: 代码格式化
- **eslint**: 代码检查

### 构建产物

- **ESM**: `dist/index.mjs`
- **CJS**: `dist/index.cjs`
- **Types**: `dist/index.d.ts`

## 📝 对外 API 设计

### 主函数

```typescript
// 核心解析函数
function parse(options: ParseOptions): Promise<StandardOutput>

// 类型定义
interface ParseOptions {
  source: string | URL | object  // 输入源
  parser?: 'openapi' | 'apifox'  // 解析器类型
  openapi?: OpenAPIOptions       // OpenAPI 特定选项
  apifox?: ApifoxOptions         // Apifox 特定选项（预留）
}

interface StandardOutput {
  schemas: Record<string, SchemaDefinition>
  apis: ApiDefinition[]
  metadata: Metadata
}
```

### 使用示例

```typescript
import { parse } from 'api-codegen-universal'

// 1. 本地文件
const result = await parse({
  source: './swagger.json'
})

// 2. 远程 URL
const result = await parse({
  source: 'https://api.example.com/openapi.json'
})

// 3. JSON 对象
const result = await parse({
  source: openapiObject
})

// 4. 自定义配置
const result = await parse({
  source: './swagger.yaml',
  openapi: {
    genericWrappers: ['ApiResponse', 'PageResult'],
    commonPrefix: '/api/v1'
  }
})
```

## 📊 标准数据结构详解

### SchemaDefinition

```typescript
interface SchemaDefinition {
  name: string
  description?: string
  type: 'object' | 'array' | 'enum' | 'primitive' | 'generic'
  properties?: Record<string, PropertyDefinition>
  required?: string[]
  isGeneric?: boolean
  genericParam?: string
  enum?: string[]
  items?: SchemaReference
  additionalProperties?: SchemaReference
}
```

### ApiDefinition

```typescript
interface ApiDefinition {
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  operationId: string
  summary?: string
  description?: string
  tags?: string[]
  parameters?: ParameterDefinition[]
  requestBody?: SchemaReference
  response: ResponseDefinition
  category: CategoryInfo
}
```

### CategoryInfo

```typescript
interface CategoryInfo {
  primary: string          // 主分类（如 'auth'）
  secondary?: string       // 次级分类（如 'users'）
  isUnclassified: boolean  // 是否为未分类
  filePath: string         // 建议的文件路径
}
```

## 🧪 测试策略

### 单元测试

- 每个适配器独立测试
- 工具函数单独测试
- 类型转换逻辑测试

### 集成测试

- 完整的 OpenAPI 文档解析测试
- 真实项目的 Swagger 文档测试

### 测试覆盖率

- 目标: 80%+

## 📚 文档计划

1. **README.md**: 项目介绍、快速开始
2. **API.md**: 详细的 API 文档
3. **EXAMPLES.md**: 使用示例
4. **ARCHITECTURE.md**: 架构设计文档
5. **CONTRIBUTING.md**: 贡献指南

## 🚀 发布计划

### v0.1.0 (Phase 1)

- 基础 OpenAPI 解析
- 标准数据结构输出
- 基础文档

### v0.2.0 (Phase 2)

- 完整的类型转换
- 泛型处理
- 路径分类算法

### v0.3.0 (Phase 3)

- CLI 工具
- 更多配置选项

### v1.0.0 (Phase 4)

- 生产就绪
- Apifox 支持
- 完整文档

## 🎯 关键技术挑战

### 1. 泛型检测

**问题**: 如何自动识别 `allOf` 中的泛型模式

**解决方案**:
```typescript
// 检测模式：
// allOf: [
//   { $ref: '#/components/schemas/ApiResponse' },
//   { properties: { data: { $ref: '#/.../SpecificType' } } }
// ]
// 转换为: ApiResponse<SpecificType>
```

### 2. 路径分类

**问题**: 如何智能地将 API 路径分类到文件

**解决方案**:
```typescript
// 配置公共前缀: /api/v1
// /api/v1/auth/login -> /src/api/auth/index.ts
// /api/v1/auth/users/profile -> /src/api/auth/users/index.ts
// /other-api/test -> /src/api/unclassified.ts
```

### 3. $ref 引用解析

**问题**: 递归引用、跨文件引用

**解决方案**: 使用 `@redocly/openapi-core` 的 bundle 功能

### 4. 类型转换准确性

**问题**: OpenAPI 类型 -> TypeScript 类型的精确映射

**解决方案**: 完善的类型转换表 + 边界情况处理

## 🔮 未来扩展

1. **代码生成器插件系统**
   - TypeScript 生成器
   - Java 生成器
   - C# 生成器

2. **自定义模板**
   - 支持用户自定义生成模板

3. **增量更新**
   - 只更新变化的部分

4. **可视化工具**
   - Web UI 预览生成结果

## 📄 许可证

MIT License
