/**
 * 测试接口代码输出效果
 */

import { OpenAPIAdapter } from '../dist/index.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testInterfaceOutput() {
  console.log('========================================');
  console.log('测试接口代码输出');
  console.log('========================================\n');

  // 解析 OpenAPI
  const adapter = new OpenAPIAdapter();
  const inputFile = new URL('../test-openapi.json', import.meta.url);
  const result = await adapter.parse(inputFile, {
    pathClassification: {
      commonPrefix: '/api/v1',
    },
  });

  console.log('✅ 解析完成\n');

  // 1. 直接打印到控制台（查看多行效果）
  console.log('📝 ApiSuccessResponse 接口代码（控制台输出）：\n');
  console.log(result.interfaces.ApiSuccessResponse);
  console.log('\n');

  // 2. 写入到 .ts 文件
  const outputPath = join(__dirname, '../generated-interfaces.ts');

  let tsContent =
    '/**\n * Auto-generated TypeScript interfaces\n * Generated at: ' +
    new Date().toISOString() +
    '\n */\n\n';

  // 添加所有接口
  for (const [name, code] of Object.entries(result.interfaces)) {
    tsContent += `${code}\n\n`;
  }

  writeFileSync(outputPath, tsContent, 'utf-8');
  console.log(`✅ 接口代码已写入文件: ${outputPath}`);

  console.log('\n📊 统计：');
  console.log(`  - 生成了 ${Object.keys(result.interfaces).length} 个接口`);

  console.log('\n========================================');
  console.log('测试完成！');
  console.log('========================================');
}

testInterfaceOutput().catch(console.error);
