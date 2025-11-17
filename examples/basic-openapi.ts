/**
 * 基本 OpenAPI 解析示例
 *
 * 这个示例展示如何使用 api-codegen-universal 解析 OpenAPI 文档
 */

import { OpenAPIAdapter } from '../dist/index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log('========================================');
  console.log('OpenAPI 解析示例');
  console.log('========================================\n');

  const adapter = new OpenAPIAdapter();

  // const testFile = new URL(path.resolve(__dirname, '../test-openapi.json'), import.meta.url)
  const testFile = new URL('http://localhost:8000/api/docs-json');

  console.log('⏳ 开始解析...\n');

  try {
    const result = await adapter.parse(testFile, {
      pathClassification: {
        outputPrefix: 'services', // 自定义输出目录前缀(默认 'api')
        commonPrefix: '/api/v1', // API 路径前缀
        maxDepth: 3, // 分类深度(默认 2)
      },
      codeGeneration: {
        parameterNamingStyle: 'PascalCase', // 参数接口命名风格
        interfaceExportMode: 'declare', // 接口导出模式: 'export' | 'declare'
        output: {
          schemas: true, // 是否生成 schemas 字段
          interfaces: true, // 是否生成 interfaces 字段
          apis: true, // 是否生成 apis 字段
        },
      },
    });

    console.log('✅ 解析成功!\n');

    // 输出统计信息
    // console.log('📊 统计信息:')
    // console.log('  - Schemas 数量:', Object.keys(result.schemas).length)
    // console.log('  - APIs 数量:', result.apis.length)
    // // 输出元数据
    // console.log('\n📝 元数据:')
    // console.log('  生成时间:', result.metadata.generatedAt)
    // console.log('  公共前缀:', result.metadata.commonPrefix)

    // 输出完整结果到文件
    const { writeFileSync } = await import('fs');
    const outputPath = path.resolve(__dirname, '../test-output.json');
    writeFileSync(outputPath, JSON.stringify(result, null, 2));
    // console.log('\n💾 完整结果已输出到:', outputPath)

    // console.log('\n========================================')
    console.log('解析完成!');
    // console.log('========================================')
  } catch (error) {
    console.error('\n❌ 解析失败:', error);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
