/**
 * 测试输出控制配置
 */

import { OpenAPIAdapter } from '../dist/index.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testOutputControl() {
  console.log('========================================');
  console.log('测试输出控制配置');
  console.log('========================================\n');

  const adapter = new OpenAPIAdapter();
  const inputFile = new URL('../test-openapi.json', import.meta.url);

  // 测试 1: 只生成 interfaces
  const result1 = await adapter.parse(inputFile, {
    codeGeneration: {
      output: {
        schemas: false,
        interfaces: true,
        apis: true,
      },
    },
  });
  console.log('✅ schemas:', Object.keys(result1.schemas).length);
  console.log('✅ interfaces:', Object.keys(result1.interfaces).length);
  console.log('✅ apis:', result1.apis.length);
}

testOutputControl().catch(console.error);
