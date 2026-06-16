import { test, expect } from '@rstest/core';
import { NamingUtils } from '../src/utils/naming-utils';
import { GenericDetector } from '../src/utils/generic-detector';
import { PathClassifier } from '../src/utils/path-classifier';
import {
  normalizeGenericName,
  javaGenericsToTsAngles,
  escapeRegExp,
  isTypeRefTo,
  wordBoundaryRegex,
} from '../src/utils/type-ref-utils';

// ===================================================================================
// NamingUtils 测试
// ===================================================================================

test('NamingUtils.convert: PascalCase', () => {
  expect(
    NamingUtils.convert('AuthController_register_Query_Params', 'PascalCase'),
  ).toBe('AuthControllerRegisterQueryParams');
  expect(NamingUtils.convert('user-dto', 'PascalCase')).toBe('UserDto');
  expect(NamingUtils.convert('single', 'PascalCase')).toBe('Single');
});

test('NamingUtils.convert: camelCase', () => {
  expect(
    NamingUtils.convert('AuthController_register_Query_Params', 'camelCase'),
  ).toBe('authControllerRegisterQueryParams');
  expect(NamingUtils.convert('user-dto', 'camelCase')).toBe('userDto');
  expect(NamingUtils.convert('single', 'camelCase')).toBe('single');
});

test('NamingUtils.convert: snake_case', () => {
  expect(NamingUtils.convert('UserDto', 'snake_case')).toBe('user_dto');
  expect(NamingUtils.convert('APIResponse', 'snake_case')).toBe('api_response');
  expect(NamingUtils.convert('auth_controller_register', 'snake_case')).toBe(
    'auth_controller_register',
  );
});

test('NamingUtils.convert: handles empty/edge cases', () => {
  expect(NamingUtils.convert('', 'PascalCase')).toBe('');
  expect(NamingUtils.convert('already-good', 'PascalCase')).toBe('AlreadyGood');
  expect(NamingUtils.convert('___', 'PascalCase')).toBe('');
});

// ===================================================================================
// normalizeGenericName 测试
// ===================================================================================

test('normalizeGenericName: basic Java generics', () => {
  expect(normalizeGenericName('PageVO«ApplyListVO»')).toBe(
    'PageVO_ApplyListVO',
  );
  expect(normalizeGenericName('Map«String,List«Item»»')).toBe(
    'Map_String_List_Item',
  );
});

test('normalizeGenericName: commas and spaces', () => {
  expect(normalizeGenericName('Foo«A, B, C»')).toBe('Foo_A_B_C');
});

test('normalizeGenericName: no generics passes through', () => {
  expect(normalizeGenericName('SimpleName')).toBe('SimpleName');
});

// ===================================================================================
// javaGenericsToTsAngles 测试
// ===================================================================================

test('javaGenericsToTsAngles: basic conversion', () => {
  expect(javaGenericsToTsAngles('PageVO«User»')).toBe('PageVO<User>');
  expect(javaGenericsToTsAngles('Map«String, List«Item»»')).toBe(
    'Map<String, List<Item>>',
  );
});

test('javaGenericsToTsAngles: no generics passes through', () => {
  expect(javaGenericsToTsAngles('SimpleType')).toBe('SimpleType');
});

// ===================================================================================
// escapeRegExp 测试
// ===================================================================================

test('escapeRegExp: escapes special characters', () => {
  expect(escapeRegExp('a.b')).toBe('a\\.b');
  expect(escapeRegExp('a*b')).toBe('a\\*b');
  expect(escapeRegExp('a[0]')).toBe('a\\[0\\]');
  expect(escapeRegExp('plain')).toBe('plain');
});

// ===================================================================================
// isTypeRefTo 测试
// ===================================================================================

test('isTypeRefTo: exact match', () => {
  expect(isTypeRefTo('User', 'User')).toBe(true);
  expect(isTypeRefTo('User', 'Other')).toBe(false);
});

test('isTypeRefTo: array match', () => {
  expect(isTypeRefTo('User[]', 'User')).toBe(true);
  expect(isTypeRefTo('Other[]', 'User')).toBe(false);
});

test('isTypeRefTo: union match', () => {
  expect(isTypeRefTo('User | null', 'User')).toBe(true);
  expect(isTypeRefTo('User[] | null', 'User')).toBe(true);
  expect(isTypeRefTo('Other | null', 'User')).toBe(false);
});

test('isTypeRefTo: contains match (generic wrapper)', () => {
  expect(isTypeRefTo('Response<User>', 'User')).toBe(true);
  expect(isTypeRefTo('Array<User>', 'User')).toBe(true);
});

test('isTypeRefTo: does not false-positive on partial matches', () => {
  expect(isTypeRefTo('UserProfile', 'User')).toBe(false);
  expect(isTypeRefTo('UsersList', 'User')).toBe(false);
});

test('isTypeRefTo: empty input returns false', () => {
  expect(isTypeRefTo('', 'User')).toBe(false);
});

// ===================================================================================
// wordBoundaryRegex 测试
// ===================================================================================

test('wordBoundaryRegex: returns a regex (no caching)', () => {
  const r1 = wordBoundaryRegex('User');
  const r2 = wordBoundaryRegex('User');
  expect(r1).not.toBe(r2); // different references (no cache)
  expect(r1.source).toBe(r2.source);
});

test('wordBoundaryRegex: matches whole word only', () => {
  const re = wordBoundaryRegex('User');
  expect('User'.match(re)?.length).toBeGreaterThan(0);
  expect('UserProfile'.match(re)).toBeNull();
});

// ===================================================================================
// GenericDetector 测试
// ===================================================================================

test('GenericDetector.detect: recognizes generic intersection pattern', () => {
  const detector = new GenericDetector();
  const result = detector.detect(
    'ApiSuccessResponse & { data?: RegisterResponseVo }',
  );
  expect(result.isGeneric).toBe(true);
  expect(result.baseType).toBe('ApiSuccessResponse');
  expect(result.genericField).toBe('data');
  expect(result.genericParam).toBe('RegisterResponseVo');
});

test('GenericDetector.detect: handles components["schemas"]["X"] format', () => {
  const detector = new GenericDetector();
  const result = detector.detect(
    'components["schemas"]["ApiSuccessResponse"] & { data?: components["schemas"]["User"] }',
  );
  expect(result.isGeneric).toBe(true);
  expect(result.baseType).toBe('ApiSuccessResponse');
  expect(result.genericParam).toBe('User');
});

test('GenericDetector.detect: handles array generic param', () => {
  const detector = new GenericDetector();
  const result = detector.detect(
    'components["schemas"]["ApiSuccessResponse"] & { data?: components["schemas"]["User"][] }',
  );
  expect(result.isGeneric).toBe(true);
  expect(result.genericParam).toBe('User[]');
});

test('GenericDetector.detect: non-generic type returns isGeneric=false', () => {
  const detector = new GenericDetector();
  const result = detector.detect('User');
  expect(result.isGeneric).toBe(false);
});

test('GenericDetector.detect: multi-property intersection captures up to last semicolon', () => {
  const detector = new GenericDetector();
  const result = detector.detect('Base & { data?: T; extra?: string }');
  // The regex is greedy-backtracking, so it captures up to the last ;
  expect(result.isGeneric).toBe(true);
  expect(result.baseType).toBe('Base');
  expect(result.genericField).toBe('data');
});

test('GenericDetector.detect: handles {} fallback param', () => {
  const detector = new GenericDetector();
  const result = detector.detect('Base & { data?: {} }');
  expect(result.isGeneric).toBe(true);
  expect(result.genericParam).toBe('any');
});

// ===================================================================================
// PathClassifier 测试
// ===================================================================================

test('PathClassifier.classify: basic path', () => {
  const classifier = new PathClassifier();
  const result = classifier.classify('/users');
  expect(result.segments).toEqual(['users']);
  expect(result.depth).toBe(1);
  expect(result.isUnclassified).toBe(false);
  expect(result.filePath).toBe('api/users/index.ts');
});

test('PathClassifier.classify: filters out path parameters', () => {
  const classifier = new PathClassifier();
  const result = classifier.classify('/users/{id}/posts');
  expect(result.segments).toEqual(['users', 'posts']);
  expect(result.depth).toBe(2);
});

test('PathClassifier.classify: respects maxDepth', () => {
  const classifier = new PathClassifier({ maxDepth: 1 });
  const result = classifier.classify('/a/b/c');
  expect(result.segments).toEqual(['a']);
});

test('PathClassifier.classify: respects commonPrefix', () => {
  const classifier = new PathClassifier({ commonPrefix: '/api/v1' });
  const result = classifier.classify('/api/v1/users');
  expect(result.segments).toEqual(['users']);
});

test('PathClassifier.classify: respects outputPrefix', () => {
  const classifier = new PathClassifier({ outputPrefix: 'endpoints' });
  const result = classifier.classify('/users');
  expect(result.filePath).toBe('endpoints/users/index.ts');
});

test('PathClassifier.classify: empty path returns unclassified', () => {
  const classifier = new PathClassifier();
  const result = classifier.classify('/');
  expect(result.isUnclassified).toBe(true);
  expect(result.segments).toEqual([]);
  expect(result.filePath).toBe('api/unclassified.ts');
});

test('PathClassifier.classify: path with only parameters returns unclassified', () => {
  const classifier = new PathClassifier();
  const result = classifier.classify('/{id}');
  expect(result.isUnclassified).toBe(true);
});

test('PathClassifier.classify: commonPrefix not matching leaves path intact', () => {
  const classifier = new PathClassifier({ commonPrefix: '/api/v1' });
  const result = classifier.classify('/other/users');
  expect(result.segments).toEqual(['other', 'users']);
});
