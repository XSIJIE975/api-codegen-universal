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
  output: {
    externals: [
      'openapi-typescript',
      'typescript',
      '@redocly/openapi-core',
      'js-yaml',
    ],
  },
  plugins: [
    pluginSourceBuild({
      sourceField: 'source',
    }),
  ],
});
