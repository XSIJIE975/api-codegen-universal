/**
 * sanitize 模块高级测试
 *
 * 覆盖：
 * - URL 查询参数清理
 * - 嵌套对象深度清理
 * - 数组递归清理
 * - Map/Set/类实例占位符
 * - 循环引用检测
 * - Date/RegExp 处理
 * - 混合敏感模式
 * - 大小写敏感性
 */

import { describe, it, expect } from '@rstest/core';
import { sanitizeOptions } from '../src/sanitize';

// ===================================================================================
// URL 查询参数清理
// ===================================================================================

describe('sanitizeOptions - URL Query Parameter Sanitization', () => {
  it('should redact token parameter in URL string', () => {
    const input = {
      endpoint: 'https://api.example.com/data?token=secret123&name=test',
    };
    const result = sanitizeOptions(input);

    // URL 参数会被 URL 编码，[REDACTED] 变成 %5BREDACTED%5D
    expect(result?.endpoint).toContain('%5BREDACTED%5D');
    expect(result?.endpoint).toContain('name=test');
    expect(result?.endpoint).not.toContain('secret123');
  });

  it('should redact multiple sensitive parameters in URL', () => {
    const input = {
      endpoint: 'https://api.example.com/data?token=abc&apikey=xyz&name=test',
    };
    const result = sanitizeOptions(input);

    // URL 参数会被 URL 编码，[REDACTED] 变成 %5BREDACTED%5D
    expect(result?.endpoint).toContain('%5BREDACTED%5D');
    expect(result?.endpoint).toContain('name=test');
    expect(result?.endpoint).not.toContain('abc');
    expect(result?.endpoint).not.toContain('xyz');
  });

  it('should handle case-insensitive parameter names', () => {
    const input = {
      endpoint: 'https://api.example.com/data?TOKEN=secret123&ApiKey=xyz',
    };
    const result = sanitizeOptions(input);

    // URL 编码后的 [REDACTED]
    expect(result?.endpoint).toContain('%5BREDACTED%5D');
    expect(result?.endpoint).not.toContain('secret123');
    expect(result?.endpoint).not.toContain('xyz');
  });

  it('should not modify URL without sensitive parameters', () => {
    const input = {
      endpoint: 'https://api.example.com/data?name=test&page=1',
    };
    const result = sanitizeOptions(input);

    expect(result?.endpoint).toBe(
      'https://api.example.com/data?name=test&page=1',
    );
  });

  it('should handle URL object instances', () => {
    const input = {
      endpoint: new URL(
        'https://api.example.com/data?token=secret123&name=test',
      ),
    };
    const result = sanitizeOptions(input);

    // URL objects are converted to sanitized strings
    expect(typeof result?.endpoint).toBe('string');
    // URL 编码后的 [REDACTED]
    expect(result?.endpoint).toContain('%5BREDACTED%5D');
    expect(result?.endpoint).not.toContain('secret123');
  });

  it('should handle invalid URL strings gracefully', () => {
    const input = {
      value: 'some?text',
    };
    const result = sanitizeOptions(input);

    // Should return as-is if not a valid URL
    expect(result?.value).toBe('some?text');
  });
});

// ===================================================================================
// 嵌套对象深度清理
// ===================================================================================

describe('sanitizeOptions - Nested Object Sanitization', () => {
  it('should sanitize deeply nested sensitive keys', () => {
    const input = {
      level1: {
        level2: {
          level3: {
            apiKey: 'secret',
            name: 'test',
          },
        },
      },
    };
    const result = sanitizeOptions(input);

    expect(result?.level1).toBeDefined();
    expect((result?.level1 as Record<string, unknown>)?.level2).toBeDefined();
    const level2 = (result?.level1 as Record<string, unknown>)
      ?.level2 as Record<string, unknown>;
    const level3 = level2?.level3 as Record<string, unknown>;
    expect(level3?.apiKey).toBeUndefined();
    expect(level3?.name).toBe('test');
  });

  it('should handle mixed sensitive and non-sensitive keys at multiple levels', () => {
    const input = {
      config: {
        token: 'secret1',
        endpoint: 'https://api.example.com',
        nested: {
          password: 'secret2',
          timeout: 5000,
        },
      },
      debug: true,
    };
    const result = sanitizeOptions(input);

    const config = result?.config as Record<string, unknown>;
    expect(config?.token).toBeUndefined();
    expect(config?.endpoint).toBe('https://api.example.com');
    const nested = config?.nested as Record<string, unknown>;
    expect(nested?.password).toBeUndefined();
    expect(nested?.timeout).toBe(5000);
    expect(result?.debug).toBe(true);
  });

  it('should handle empty nested objects', () => {
    const input = {
      config: {},
      nested: {
        empty: {},
      },
    };
    const result = sanitizeOptions(input);

    expect(result?.config).toEqual({});
    expect((result?.nested as Record<string, unknown>)?.empty).toEqual({});
  });
});

// ===================================================================================
// 数组递归清理
// ===================================================================================

describe('sanitizeOptions - Array Sanitization', () => {
  it('should sanitize sensitive keys in array of objects', () => {
    const input = {
      servers: [
        { url: 'https://api1.example.com', token: 'secret1' },
        { url: 'https://api2.example.com', token: 'secret2' },
      ],
    };
    const result = sanitizeOptions(input);

    const servers = result?.servers as Record<string, unknown>[];
    expect(servers).toHaveLength(2);
    expect(servers[0]?.url).toBe('https://api1.example.com');
    expect(servers[0]?.token).toBeUndefined();
    expect(servers[1]?.url).toBe('https://api2.example.com');
    expect(servers[1]?.token).toBeUndefined();
  });

  it('should handle nested arrays', () => {
    const input = {
      matrix: [
        [{ apiKey: 'secret1' }, { name: 'test1' }],
        [{ apiKey: 'secret2' }, { name: 'test2' }],
      ],
    };
    const result = sanitizeOptions(input);

    const matrix = result?.matrix as Record<string, unknown>[][];
    expect(matrix).toHaveLength(2);
    expect(matrix[0]).toHaveLength(2);
    expect(matrix[0][0]?.apiKey).toBeUndefined();
    expect(matrix[0][1]?.name).toBe('test1');
  });

  it('should handle arrays of primitives', () => {
    const input = {
      tags: ['tag1', 'tag2', 'tag3'],
      numbers: [1, 2, 3],
    };
    const result = sanitizeOptions(input);

    expect(result?.tags).toEqual(['tag1', 'tag2', 'tag3']);
    expect(result?.numbers).toEqual([1, 2, 3]);
  });

  it('should handle empty arrays', () => {
    const input = {
      empty: [],
      nested: [[]],
    };
    const result = sanitizeOptions(input);

    expect(result?.empty).toEqual([]);
    expect(result?.nested).toEqual([[]]);
  });
});

// ===================================================================================
// Map/Set/类实例占位符
// ===================================================================================

describe('sanitizeOptions - Non-Plain Object Placeholders', () => {
  it('should replace Map instances with placeholder', () => {
    const input = {
      cache: new Map([['key', 'value']]),
      name: 'test',
    };
    const result = sanitizeOptions(input);

    expect(result?.cache).toBe('[Map]');
    expect(result?.name).toBe('test');
  });

  it('should replace Set instances with placeholder', () => {
    const input = {
      tags: new Set(['tag1', 'tag2']),
      name: 'test',
    };
    const result = sanitizeOptions(input);

    expect(result?.tags).toBe('[Set]');
    expect(result?.name).toBe('test');
  });

  it('should replace class instances with placeholder', () => {
    class CustomClass {
      value: string;
      constructor(value: string) {
        this.value = value;
      }
    }

    const input = {
      instance: new CustomClass('test'),
      name: 'test',
    };
    const result = sanitizeOptions(input);

    expect(result?.instance).toBe('[CustomClass]');
    expect(result?.name).toBe('test');
  });

  it('should handle mixed plain and non-plain objects', () => {
    const input = {
      plain: { apiKey: 'secret', name: 'test' },
      map: new Map(),
      array: [{ password: 'secret' }],
    };
    const result = sanitizeOptions(input);

    const plain = result?.plain as Record<string, unknown>;
    expect(plain?.apiKey).toBeUndefined();
    expect(plain?.name).toBe('test');
    expect(result?.map).toBe('[Map]');
    const array = result?.array as Record<string, unknown>[];
    expect(array[0]?.password).toBeUndefined();
  });
});

// ===================================================================================
// 循环引用检测
// ===================================================================================

describe('sanitizeOptions - Circular Reference Detection', () => {
  it('should detect direct self-reference', () => {
    const input: Record<string, unknown> = { name: 'test' };
    input.self = input;

    const result = sanitizeOptions(input);

    expect(result?.name).toBe('test');
    expect(result?.self).toEqual({ '[circular]': true });
  });

  it('should detect indirect circular reference', () => {
    const obj1: Record<string, unknown> = { name: 'obj1' };
    const obj2: Record<string, unknown> = { name: 'obj2', ref: obj1 };
    obj1.ref = obj2;

    const result = sanitizeOptions(obj1);

    expect(result?.name).toBe('obj1');
    const ref = result?.ref as Record<string, unknown>;
    expect(ref?.name).toBe('obj2');
    expect(ref?.ref).toEqual({ '[circular]': true });
  });

  it('should detect circular reference in nested structure', () => {
    const input: Record<string, unknown> = {
      level1: {
        level2: {
          name: 'test',
        },
      },
    };
    // 创建循环引用
    (input.level1 as Record<string, unknown>).back = input;

    const result = sanitizeOptions(input);

    const level1 = result?.level1 as Record<string, unknown>;
    const level2 = level1?.level2 as Record<string, unknown>;
    expect(level2?.name).toBe('test');
    expect(level1?.back).toEqual({ '[circular]': true });
  });

  it('should detect circular reference in array', () => {
    const input: Record<string, unknown> = { name: 'test' };
    input.arr = [input];

    const result = sanitizeOptions(input);

    expect(result?.name).toBe('test');
    const arr = result?.arr as Record<string, unknown>[];
    expect(arr[0]).toEqual({ '[circular]': true });
  });
});

// ===================================================================================
// Date/RegExp 处理
// ===================================================================================

describe('sanitizeOptions - Date/RegExp Handling', () => {
  it('should convert Date to ISO string', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const input = {
      createdAt: date,
      name: 'test',
    };
    const result = sanitizeOptions(input);

    expect(result?.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(result?.name).toBe('test');
  });

  it('should convert RegExp to string representation', () => {
    const input = {
      pattern: /test/gi,
      name: 'test',
    };
    const result = sanitizeOptions(input);

    expect(result?.pattern).toBe('/test/gi');
    expect(result?.name).toBe('test');
  });

  it('should handle Date in nested structures', () => {
    const input = {
      config: {
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-06-01T00:00:00.000Z'),
      },
    };
    const result = sanitizeOptions(input);

    const config = result?.config as Record<string, unknown>;
    expect(config?.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(config?.updatedAt).toBe('2024-06-01T00:00:00.000Z');
  });
});

// ===================================================================================
// 混合敏感模式
// ===================================================================================

describe('sanitizeOptions - Mixed Sensitive Patterns', () => {
  it('should handle all sensitive pattern types together', () => {
    const input = {
      token: 'secret1',
      password: 'secret2',
      apiKey: 'secret3',
      api_key: 'secret4',
      apiSecret: 'secret5',
      privateKey: 'secret6',
      accessKey: 'secret7',
      credential: 'secret8',
      authorization: 'Bearer secret9',
      'x-custom-header': 'secret10',
      normalField: 'visible',
    };
    const result = sanitizeOptions(input);

    expect(result?.token).toBeUndefined();
    expect(result?.password).toBeUndefined();
    expect(result?.apiKey).toBeUndefined();
    expect(result?.api_key).toBeUndefined();
    expect(result?.apiSecret).toBeUndefined();
    expect(result?.privateKey).toBeUndefined();
    expect(result?.accessKey).toBeUndefined();
    expect(result?.credential).toBeUndefined();
    expect(result?.authorization).toBeUndefined();
    expect(result?.['x-custom-header']).toBeUndefined();
    expect(result?.normalField).toBe('visible');
  });

  it('should strip fields containing sensitive patterns as substrings', () => {
    const input = {
      tokenCount: 100, // 包含 'token'，会被剥离
      passwordHash: 'abc123', // 包含 'password'，会被剥离
      secretKey: 'should-be-stripped', // 包含 'secret' 和 'key'，会被剥离
      primaryKey: 'id', // 不包含敏感模式，应该保留
      keyCode: 'Enter', // 不包含敏感模式，应该保留
      normalToken: 'should-be-stripped', // 包含 'token'，会被剥离
      userIdentifier: 'user123', // 不包含敏感模式，应该保留
    };
    const result = sanitizeOptions(input);

    // tokenCount 包含 'token'，会被剥离
    expect(result?.tokenCount).toBeUndefined();
    // passwordHash 包含 'password'，会被剥离
    expect(result?.passwordHash).toBeUndefined();
    // secretKey 包含 'secret' 和 'key'，会被剥离
    expect(result?.secretKey).toBeUndefined();
    // primaryKey 不包含敏感模式，应该保留
    expect(result?.primaryKey).toBe('id');
    // keyCode 不包含敏感模式，应该保留
    expect(result?.keyCode).toBe('Enter');
    // normalToken 包含 'token'，会被剥离
    expect(result?.normalToken).toBeUndefined();
    // userIdentifier 不包含敏感模式，应该保留
    expect(result?.userIdentifier).toBe('user123');
  });
});

// ===================================================================================
// 边界情况
// ===================================================================================

describe('sanitizeOptions - Edge Cases', () => {
  it('should handle undefined input', () => {
    const result = sanitizeOptions(undefined);
    expect(result).toBeUndefined();
  });

  it('should handle null values in object', () => {
    const input = {
      name: 'test',
      value: null,
      apiKey: 'secret',
    };
    const result = sanitizeOptions(input);

    expect(result?.name).toBe('test');
    expect(result?.value).toBeNull();
    expect(result?.apiKey).toBeUndefined();
  });

  it('should handle primitive values', () => {
    const input = {
      string: 'test',
      number: 42,
      boolean: true,
      apiKey: 'secret',
    };
    const result = sanitizeOptions(input);

    expect(result?.string).toBe('test');
    expect(result?.number).toBe(42);
    expect(result?.boolean).toBe(true);
    expect(result?.apiKey).toBeUndefined();
  });

  it('should handle very deeply nested structures', () => {
    // 创建深度嵌套结构
    const depth = 20;
    let input: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < depth; i++) {
      input = { nested: input };
    }
    // 在最深层添加敏感字段
    let current = input;
    for (let i = 0; i < depth; i++) {
      current = current.nested as Record<string, unknown>;
    }
    current.apiKey = 'secret';

    const result = sanitizeOptions(input);

    // 验证最深层敏感字段被清理
    let resultCurrent: unknown = result;
    for (let i = 0; i < depth; i++) {
      resultCurrent = (resultCurrent as Record<string, unknown>).nested;
    }
    expect((resultCurrent as Record<string, unknown>).apiKey).toBeUndefined();
    expect((resultCurrent as Record<string, unknown>).value).toBe('leaf');
  });
});
