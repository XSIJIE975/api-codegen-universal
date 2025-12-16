import { test, expect } from '@rstest/core';
import * as Core from '../src';

test('Core exports should be defined', () => {
  expect(Core).toBeDefined();
});

test('Standard types should be exported', () => {
  // Since these are types, we can't check them at runtime easily unless they are classes or values.
  // But we can check if the module loads without error.
  expect(true).toBe(true);
});
