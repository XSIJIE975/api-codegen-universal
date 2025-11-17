/**
 * 测试不同的接口导出模式
 */

import { OpenAPIAdapter } from '../dist/index.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testExportModes() {
  console.log('========================================');
  console.log('测试接口导出模式');
  console.log('========================================\n');

  const adapter = new OpenAPIAdapter();
  const inputFile = new URL('../test-openapi.json', import.meta.url);

  // 测试 1: export 模式（默认）
  console.log('📝 测试 export 模式...\n');
  const resultExport = await adapter.parse(inputFile, {
    pathClassification: {
      commonPrefix: '/api/v1',
    },
    codeGeneration: {
      interfaceExportMode: 'export',
    },
  });

  // 测试 2: declare 模式
  console.log('📝 测试 declare 模式...\n');
  const resultDeclare = await adapter.parse(inputFile, {
    pathClassification: {
      commonPrefix: '/api/v1',
    },
    codeGeneration: {
      interfaceExportMode: 'declare',
    },
  });

  // 输出示例对比
  console.log('====== export 模式示例 ======');
  console.log(
    resultExport.interfaces['RegisterDto']?.split('\n').slice(0, 5).join('\n'),
  );
  console.log('...\n');

  console.log('====== declare 模式示例 ======');
  console.log(
    resultDeclare.interfaces['RegisterDto']?.split('\n').slice(0, 5).join('\n'),
  );
  console.log('...\n');

  // 写入文件
  const exportPath = join(__dirname, '../generated-export.d.ts');
  const declarePath = join(__dirname, '../generated-declare.d.ts');

  let exportContent =
    '/**\n * Generated interfaces (export mode)\n * Use: import { InterfaceName } from "./generated-export"\n */\n\n';
  for (const [name, code] of Object.entries(resultExport.interfaces)) {
    exportContent += `${code}\n\n`;
  }
  writeFileSync(exportPath, exportContent, 'utf-8');

  let declareContent =
    '/**\n * Generated interfaces (declare mode)\n * Add this directory to tsconfig.json "include" array\n * Use directly without import: const user: RegisterDto = {...}\n */\n\n';
  for (const [name, code] of Object.entries(resultDeclare.interfaces)) {
    declareContent += `${code}\n\n`;
  }
  writeFileSync(declarePath, declareContent, 'utf-8');

  console.log(`✅ export 模式文件: ${exportPath}`);
  console.log(`✅ declare 模式文件: ${declarePath}`);
  console.log('\n========================================');
  console.log('测试完成！');
  console.log('========================================');
}

testExportModes().catch(console.error);
