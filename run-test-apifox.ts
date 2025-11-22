import { ApifoxAdapter } from '@api-codegen-universal/apifox';
import fs from 'node:fs/promises';

async function main() {
  const adapter = new ApifoxAdapter();

  const config = {
    projectId: '7291336',
    token: 'APS-C5ILWIsaushFsRvqdQoefxwZAJq63kYz',
    apiVersion: '2024-03-28',
  };

  try {
    const output = await adapter.parse(config, {
      pathClassification: {
        outputPrefix: 'api',
        commonPrefix: '/api/v1',
      },
      codeGeneration: {
        parameterNamingStyle: 'PascalCase', // 动态控制参数接口命名
        output: {
          schemas: true,
          interfaces: true,
          apis: true,
        },
      },
    });

    await fs.writeFile(
      './apifox-codegen-output.json',
      JSON.stringify(output, null, 2),
    );
    console.log('Apifox sync complete!');
  } catch (e) {
    console.error('Sync failed:', e);
  }
}

main();
