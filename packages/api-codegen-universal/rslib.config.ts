import { defineConfig } from '@rslib/core';
import { pluginSourceBuild } from '@rsbuild/plugin-source-build';

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
  // 将重型依赖标记为 external，避免打包进发布产物
  externals: [
    'typescript',
    'openapi-typescript',
    'js-yaml',
    '@apidevtools/swagger-parser',
    '@redocly/openapi-core',
  ],
  plugins: [
    pluginSourceBuild({
      sourceField: 'source',
    }),
  ],
});
