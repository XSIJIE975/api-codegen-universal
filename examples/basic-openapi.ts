/**
 * 基本 OpenAPI 解析示例
 * 
 * 这个示例展示如何使用 @api-codegen/core 解析 OpenAPI 文档
 */

import { OpenAPIAdapter } from '@api-codegen/core'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

// ESM 环境获取 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function main() {
  console.log('========================================')
  console.log('OpenAPI 解析示例')
  console.log('========================================\n')

  // 创建适配器实例
  const adapter = new OpenAPIAdapter()
  
  // 使用项目根目录的 test-openapi.json
  const testFile = new URL(path.resolve(__dirname, '../test-openapi.json'), import.meta.url)
  
  console.log('📄 输入文件:', testFile)
  console.log('⏳ 开始解析...\n')
  
  try {
    const result = await adapter.parse(testFile, {
      commonPrefix: '/api/v1',
      maxClassificationDepth: 2,
    })
    
    console.log('✅ 解析成功!\n')
    
    // 输出统计信息
    console.log('📊 统计信息:')
    console.log('  - Schemas 数量:', Object.keys(result.schemas).length)
    console.log('  - APIs 数量:', result.apis.length)
    
    // 输出前几个 API
    console.log('\n📋 前 5 个 APIs:')
    result.apis.slice(0, 5).forEach((api, index) => {
      console.log(`\n${index + 1}. ${api.method} ${api.path}`)
      console.log(`   Operation ID: ${api.operationId}`)
      console.log(`   分类: ${api.category.filePath}`)
      
      if (api.parameters) {
        console.log('   参数接口:')
        if (api.parameters.query) {
          console.log(`     - Query: ${api.parameters.query.ref}`)
        }
        if (api.parameters.path) {
          console.log(`     - Path: ${api.parameters.path.ref}`)
        }
        if (api.parameters.header) {
          console.log(`     - Header: ${api.parameters.header.ref}`)
        }
        if (api.parameters.cookie) {
          console.log(`     - Cookie: ${api.parameters.cookie.ref}`)
        }
      }
      
      if (api.requestBody) {
        console.log('   请求体:')
        Object.keys(api.requestBody.content).forEach(contentType => {
          const schemaRef = api.requestBody!.content[contentType].schema.ref
          console.log(`     - ${contentType}: ${schemaRef}`)
        })
      }
      
      console.log('   响应:')
      Object.entries(api.responses).forEach(([status, response]) => {
        console.log(`     - ${status}: ${response.description}`)
        if (response.content) {
          Object.entries(response.content).forEach(([ct, media]) => {
            console.log(`       ${ct}: ${media.schema.ref}`)
          })
        }
      })
    })
    
    // 输出元数据
    console.log('\n📝 元数据:')
    console.log('  生成时间:', result.metadata.generatedAt)
    console.log('  公共前缀:', result.metadata.commonPrefix)
    
    // 输出完整结果到文件
    const { writeFileSync } = await import('fs')
    const outputPath = path.resolve(__dirname, '../test-output.json')
    writeFileSync(outputPath, JSON.stringify(result, null, 2))
    console.log('\n💾 完整结果已输出到:', outputPath)
    
    console.log('\n========================================')
    console.log('解析完成!')
    console.log('========================================')
    
  } catch (error) {
    console.error('\n❌ 解析失败:', error)
    throw error
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
