import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'esm',
      syntax: ['node 20'],
      bundle: true,
      dts: {
        bundle: true,
      },
    },
    {
      format: 'cjs',
      syntax: ['node 20'],
      bundle: true,
    },
  ],
  source: {
    entry: {
      index: './src/index.ts',
    },
  },
  // 将重型依赖标记为 external，避免打包进产物
  externals: ['@apidevtools/swagger-parser'],
});
