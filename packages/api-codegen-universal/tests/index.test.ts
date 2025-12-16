import { test, expect } from '@rstest/core';
import * as Main from '../src';

test('Main package exports should be defined', () => {
  expect(Main).toBeDefined();
});
