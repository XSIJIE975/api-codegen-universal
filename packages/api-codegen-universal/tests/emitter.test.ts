/**
 * 文件输出器测试
 */
import { describe, it, expect, afterAll } from '@rstest/core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { emitStandardOutput } from '../src/emitter';
import type { StandardOutput } from '@api-codegen-universal/core';

/** 临时输出根目录 */
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'acu-emit-'));
const createdDirs: string[] = [];

function makeOutDir(name: string): string {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  createdDirs.push(dir);
  return dir;
}

void afterAll(async () => {
  await fs.promises.rm(tmpRoot, { recursive: true, force: true });
});

/** 构造一个覆盖各归属场景的标准输出 */
function makeOutput(): StandardOutput {
  return {
    metadata: { generatedAt: '2026-01-01T00:00:00.000Z' },
    schemas: {},
    interfaces: {
      // 多分类共享 → models/shared.ts
      Page: 'export interface Page {\n  total: number;\n}',
      // 仅 users 分类引用 → api/users/index.ts
      User: 'export interface User {\n  id: number;\n}',
      // users 的 PageList 引用 Page（跨文件 import 场景）
      UserList:
        'export interface UserList {\n  items: User[];\n  page: Page;\n}',
      // 仅 orders 分类引用 → api/orders/index.ts
      Order: 'export interface Order {\n  id: number;\n}',
      // 孤儿接口（无 api 引用）→ shared
      Orphan: 'export interface Orphan {\n  x: string;\n}',
    },
    apis: [
      {
        path: '/users',
        method: 'GET',
        operationId: 'getUsers',
        responses: {},
        category: {
          segments: ['users'],
          depth: 1,
          isUnclassified: false,
          filePath: 'api/users/index.ts',
        },
      },
      {
        path: '/users/list',
        method: 'GET',
        operationId: 'listUsers',
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: { type: 'ref', ref: 'UserList' },
              },
            },
          },
        },
        category: {
          segments: ['users'],
          depth: 1,
          isUnclassified: false,
          filePath: 'api/users/index.ts',
        },
      },
      {
        path: '/orders',
        method: 'GET',
        operationId: 'listOrders',
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                // Page 同时被 users（经 UserList）与 orders 引用 → shared
                schema: { type: 'ref', ref: 'Page<Order>' },
              },
            },
          },
        },
        category: {
          segments: ['orders'],
          depth: 1,
          isUnclassified: false,
          filePath: 'api/orders/index.ts',
        },
      },
    ],
  };
}

describe('emitStandardOutput', () => {
  it('writes category files, shared models and a barrel', async () => {
    const outDir = makeOutDir('basic');
    const result = await emitStandardOutput(makeOutput(), { outDir });

    expect(result.files).toContain('api/users/index.ts');
    expect(result.files).toContain('api/orders/index.ts');
    expect(result.files).toContain('models/shared.ts');
    expect(result.files).toContain('index.ts');

    // 文件确实存在
    for (const file of result.files) {
      expect(fs.existsSync(path.join(outDir, file))).toBe(true);
    }
  });

  it('assigns single-category refs to the category file and multi-category refs to shared', async () => {
    const outDir = makeOutDir('ownership');
    const result = await emitStandardOutput(makeOutput(), { outDir });

    const usersFile = fs.readFileSync(
      path.join(outDir, 'api/users/index.ts'),
      'utf-8',
    );
    const ordersFile = fs.readFileSync(
      path.join(outDir, 'api/orders/index.ts'),
      'utf-8',
    );
    const sharedFile = fs.readFileSync(
      path.join(outDir, 'models/shared.ts'),
      'utf-8',
    );

    // UserList/User 仅被 users 分类引用
    expect(usersFile).toContain('export interface UserList');
    expect(usersFile).toContain('export interface User');
    // Order 仅被 orders 引用
    expect(ordersFile).toContain('export interface Order');
    // Page 被 users 引用（经 UserList 闭包）；Orphan 无引用 → shared
    expect(sharedFile).toContain('export interface Page');
    expect(sharedFile).toContain('export interface Orphan');
    expect(result.sharedNames.sort()).toEqual(['Orphan', 'Page']);
  });

  it('generates type-only imports for cross-file references', async () => {
    const outDir = makeOutDir('imports');
    await emitStandardOutput(makeOutput(), { outDir });

    const usersFile = fs.readFileSync(
      path.join(outDir, 'api/users/index.ts'),
      'utf-8',
    );
    // users 文件里的 UserList 引用 Page（定义在 shared）
    expect(usersFile).toMatch(
      /import type \{ Page \} from '\.\.\/\.\.\/models\/shared\.js';/,
    );
  });

  it('barrel re-exports every generated file', async () => {
    const outDir = makeOutDir('barrel');
    await emitStandardOutput(makeOutput(), { outDir });

    const barrel = fs.readFileSync(path.join(outDir, 'index.ts'), 'utf-8');
    expect(barrel).toContain("export * from './api/users/index.js'");
    expect(barrel).toContain("export * from './api/orders/index.js'");
    expect(barrel).toContain("export * from './models/shared.js'");
  });

  it('can disable the barrel', async () => {
    const outDir = makeOutDir('no-barrel');
    const result = await emitStandardOutput(makeOutput(), {
      outDir,
      barrel: false,
    });
    expect(result.files).not.toContain('index.ts');
    expect(fs.existsSync(path.join(outDir, 'index.ts'))).toBe(false);
  });
});
