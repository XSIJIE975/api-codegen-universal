# Examples

这个目录包含了 `@api-codegen/core` 的使用示例。

## 运行示例

首先确保已经安装依赖并构建了项目:

```bash
# 在项目根目录
pnpm install
pnpm build
```

然后运行示例:

```bash
cd examples
pnpm test:openapi
```

## 示例列表

### basic-openapi.ts

基本的 OpenAPI 解析示例,展示如何:
- 创建 `OpenAPIAdapter` 实例
- 解析 OpenAPI JSON 文件
- 输出解析结果
- 查看 APIs、参数、请求体和响应信息
