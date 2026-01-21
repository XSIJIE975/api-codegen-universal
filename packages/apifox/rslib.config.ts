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
    },
  ],
  source: {
    entry: {
      index: './src/index.ts',
    },
  },
});
