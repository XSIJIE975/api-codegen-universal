import { parse } from '@api-codegen/core'

/**
 * 基础使用示例
 */
async function main() {
  try {
    console.log('🚀 开始解析 OpenAPI 文档...\n')

    // 解析示例 OpenAPI 文档
    const result = await parse({
      // source: '../sample-openapi.json',
      // 输入为一个 http 地址
      source: 'http://localhost:8000/api/docs-json',
      parser: 'openapi',
      openapi: {
        commonPrefix: '/api/v1',
        genericWrappers: ['ApiSuccessResponse', 'ApiErrorResponse'],
      },
    })

    console.log('✅ 解析成功!\n')

    // 输出元数据
    console.log('📊 元数据:')
    console.log(`  标题: ${result.metadata.title}`)
    console.log(`  版本: ${result.metadata.version}`)
    console.log(`  描述: ${result.metadata.description}`)
    console.log(`  基础 URL: ${result.metadata.baseUrl}`)
    console.log(`  生成时间: ${result.metadata.generatedAt}\n`)

    // 输出 Schemas
    console.log('📦 Schemas:')
    const schemaNames = Object.keys(result.schemas)
    console.log(`  共 ${schemaNames.length} 个 Schema`)
    schemaNames.forEach(name => {
      const schema = result.schemas[name]
      const genericTag = schema.isGeneric ? ' (泛型)' : ''
      console.log(`  - ${name}${genericTag}: ${schema.type}`)
    })
    console.log()

    // 输出泛型 Schemas
    const genericSchemas = Object.entries(result.schemas).filter(([_, s]) => s.isGeneric)
    if (genericSchemas.length > 0) {
      console.log('🔷 泛型 Schemas:')
      genericSchemas.forEach(([name, schema]) => {
        console.log(`  - ${name}`)
        console.log(`    基础类型: ${schema.baseType}`)
        console.log(`    泛型参数: ${schema.genericParam || 'unknown'}`)
      })
      console.log()
    }

    // 输出 APIs
    console.log('🌐 APIs:')
    console.log(`  共 ${result.apis.length} 个接口`)

    // 按分类分组
    const apisByCategory = new Map<string, typeof result.apis>()
    result.apis.forEach(api => {
      const key = api.category.filePath
      if (!apisByCategory.has(key)) {
        apisByCategory.set(key, [])
      }
      apisByCategory.get(key)!.push(api)
    })

    // 按分类输出
    apisByCategory.forEach((apis, filePath) => {
      console.log(`\n  📁 ${filePath}:`)
      apis.forEach(api => {
        console.log(`    ${api.method.padEnd(6)} ${api.path}`)
        console.log(`           ${api.summary || '(无描述)'}`)
      })
    })

    console.log('\n✨ 完成!')
  } catch (error) {
    console.error('❌ 错误:', error)
    process.exit(1)
  }
}

main()
