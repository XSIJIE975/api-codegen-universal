import fs from 'fs/promises';
import { ApifoxAdapter } from '@api-codegen-universal/apifox';

async function main() {
  // 读取文件
  const apiDetailsRaw = await fs.readFile(
    './example-input-sources/apifox/api-details.json',
    'utf-8',
  );
  const dataSchemasRaw = await fs.readFile(
    './example-input-sources/apifox/data-schemas.json',
    'utf-8',
  );

  const apiDetailsJson = JSON.parse(apiDetailsRaw);
  const dataSchemasJson = JSON.parse(dataSchemasRaw);

  // 构造输入源 (注意 Apifox 导出的 json 外层通常包裹了 { success: true, data: [...] })
  const source = {
    apiDetails: apiDetailsJson.data,
    dataSchemas: dataSchemasJson.data,
  };

  const adapter = new ApifoxAdapter();

  // 校验
  if (!(await adapter.validate(source))) {
    console.error('Invalid Apifox data source');
    return;
  }

  // 解析
  const output = await adapter.parse(source, {
    pathClassification: {
      outputPrefix: 'api',
      commonPrefix: '/api/v1', // 去除公共前缀
      maxDepth: 2,
    },
    codeGeneration: {
      output: {
        schemas: true,
        interfaces: true,
        apis: true,
      },
    },
  });

  // 输出结果
  await fs.writeFile(
    './example-input-sources/apifox/apifox-codegen-output.json',
    JSON.stringify(output, null, 2),
  );
  console.log('Done!');
}

main();
