import { describe, it, expect } from '@rstest/core';
import { ApifoxAdapter } from '../src/parser';
import type { OpenAPIRaw } from '../src/parser';
import type { createWarningsCollector } from '@api-codegen-universal/core';

/**
 * 辅助函数：通过 any 调用 ApifoxAdapter 的私有方法
 * 这是测试私有方法的标准模式，不影响生产代码
 */
function getPrivate(adapter: ApifoxAdapter) {
  const a = adapter as unknown as Record<string, unknown>;
  return {
    fixNullTypes: a.fixNullTypes as (
      data: OpenAPIRaw,
      w?: ReturnType<typeof createWarningsCollector>,
    ) => void,
    fixBrokenRefs: a.fixBrokenRefs as (
      data: OpenAPIRaw,
      w?: ReturnType<typeof createWarningsCollector>,
    ) => void,
    fixDuplicateOperationIds: a.fixDuplicateOperationIds as (
      data: OpenAPIRaw,
      w?: ReturnType<typeof createWarningsCollector>,
    ) => void,
    fixSecuritySchemes: a.fixSecuritySchemes as (data: OpenAPIRaw) => void,
    fixPathsSecurityExtensions: a.fixPathsSecurityExtensions as (
      data: OpenAPIRaw,
    ) => void,
    fixGenericsNames: a.fixGenericsNames as (
      data: OpenAPIRaw,
      w?: ReturnType<typeof createWarningsCollector>,
    ) => void,
    hasRef: a.hasRef as (root: OpenAPIRaw, ref: string) => boolean,
    fixOpenApiCompatibility: a.fixOpenApiCompatibility as (
      data: OpenAPIRaw,
      w?: ReturnType<typeof createWarningsCollector>,
    ) => OpenAPIRaw,
  };
}

// ===================================================================================
// fixNullTypes 测试
// ===================================================================================

describe('fixNullTypes', () => {
  it('should convert type: "null" to nullable: true', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              name: { type: 'null' },
            },
          },
        },
      },
    };

    priv.fixNullTypes(data);

    const name = (data.components as OpenAPIRaw)
      .schemas as OpenAPIRaw as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(name.User.properties.name).toEqual({ nullable: true });
    expect(name.User.properties.name.type).toBeUndefined();
  });

  it('should handle type array containing null with multiple types', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              name: { type: ['string', 'null'] },
            },
          },
        },
      },
    };

    priv.fixNullTypes(data);

    const name = (data.components as OpenAPIRaw)
      .schemas as OpenAPIRaw as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(name.User.properties.name.nullable).toBe(true);
    // Single remaining type should be collapsed to a string
    expect(name.User.properties.name.type).toBe('string');
  });

  it('should delete type when all types in array are null', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              name: { type: ['null'] },
            },
          },
        },
      },
    };

    priv.fixNullTypes(data);

    const name = (data.components as OpenAPIRaw)
      .schemas as OpenAPIRaw as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(name.User.properties.name.nullable).toBe(true);
    expect(name.User.properties.name.type).toBeUndefined();
  });

  it('should handle deeply nested null types', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              address: {
                type: 'object',
                properties: {
                  zip: { type: 'null' },
                },
              },
            },
          },
        },
      },
    };

    priv.fixNullTypes(data);

    const zip = (
      (data.components as OpenAPIRaw).schemas as OpenAPIRaw as Record<
        string,
        Record<string, Record<string, Record<string, Record<string, unknown>>>>
      >
    ).User.properties.address.properties.zip;
    expect(zip.nullable).toBe(true);
    expect(zip.type).toBeUndefined();
  });

  it('should not modify non-null types', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'integer' },
            },
          },
        },
      },
    };

    const original = JSON.parse(JSON.stringify(data));
    priv.fixNullTypes(data);
    expect(data).toEqual(original);
  });

  it('should handle arrays of schemas', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              tags: {
                type: 'array',
                items: { type: 'null' },
              },
            },
          },
        },
      },
    };

    priv.fixNullTypes(data);

    const items = (
      (data.components as OpenAPIRaw).schemas as OpenAPIRaw as Record<
        string,
        Record<string, Record<string, unknown>>
      >
    ).User.properties.tags.items;
    expect(items.nullable).toBe(true);
    expect(items.type).toBeUndefined();
  });
});

// ===================================================================================
// hasRef 测试
// ===================================================================================

describe('hasRef', () => {
  const adapter = new ApifoxAdapter();
  const priv = getPrivate(adapter);

  const root: OpenAPIRaw = {
    components: {
      schemas: {
        User: { type: 'object' },
        'User«Profile»': { type: 'object' },
      },
    },
  };

  it('should return true for existing ref', () => {
    expect(priv.hasRef(root, '#/components/schemas/User')).toBe(true);
  });

  it('should return false for non-existing ref', () => {
    expect(priv.hasRef(root, '#/components/schemas/Order')).toBe(false);
  });

  it('should return false for incomplete ref path', () => {
    expect(priv.hasRef(root, '#/components/nonexistent')).toBe(false);
  });

  it('should handle URL-encoded schema names', () => {
    // User«Profile» encoded as User%C2%ABProfile%C2%BB
    expect(
      priv.hasRef(root, '#/components/schemas/User%C2%ABProfile%C2%BB'),
    ).toBe(true);
  });

  it('should handle JSON Pointer escape sequences', () => {
    const rootWithSlash: OpenAPIRaw = {
      components: {
        schemas: {
          'User/Profile': { type: 'object' },
        },
      },
    };
    // / is encoded as ~1 in JSON Pointer
    expect(
      priv.hasRef(rootWithSlash, '#/components/schemas/User~1Profile'),
    ).toBe(true);
  });

  it('should handle tilde escape sequence', () => {
    const rootWithTilde: OpenAPIRaw = {
      components: {
        schemas: {
          'User~Profile': { type: 'object' },
        },
      },
    };
    // ~ is encoded as ~0 in JSON Pointer
    expect(
      priv.hasRef(rootWithTilde, '#/components/schemas/User~0Profile'),
    ).toBe(true);
  });

  it('should return false for ref starting at wrong root', () => {
    expect(priv.hasRef(root, '#/paths/schemas/User')).toBe(false);
  });
});

// ===================================================================================
// fixBrokenRefs 测试
// ===================================================================================

describe('fixBrokenRefs', () => {
  it('should not modify existing valid refs', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          User: { type: 'object' },
          Profile: {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' },
            },
          },
        },
      },
    };

    priv.fixBrokenRefs(data);

    const userRef = (data.components as OpenAPIRaw)
      .schemas as OpenAPIRaw as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(userRef.Profile.properties.user.$ref).toBe(
      '#/components/schemas/User',
    );
  });

  it('should replace broken ref with type: object and description', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          Profile: {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/NonExistent' },
            },
          },
        },
      },
    };

    priv.fixBrokenRefs(data);

    const userRef = (data.components as OpenAPIRaw)
      .schemas as OpenAPIRaw as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(userRef.Profile.properties.user.$ref).toBeUndefined();
    expect(userRef.Profile.properties.user.type).toBe('object');
    expect(userRef.Profile.properties.user.description).toContain(
      'NonExistent',
    );
  });

  it('should handle URL-encoded broken refs', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          Profile: {
            type: 'object',
            properties: {
              user: {
                $ref: '#/components/schemas/NonExistent%C2%ABUser%C2%BB',
              },
            },
          },
        },
      },
    };

    priv.fixBrokenRefs(data);

    const userRef = (data.components as OpenAPIRaw)
      .schemas as OpenAPIRaw as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(userRef.Profile.properties.user.$ref).toBeUndefined();
    expect(userRef.Profile.properties.user.type).toBe('object');
  });

  it('should handle broken refs in deeply nested structures', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              address: {
                type: 'object',
                properties: {
                  country: { $ref: '#/components/schemas/Country' },
                },
              },
            },
          },
        },
      },
    };

    priv.fixBrokenRefs(data);

    const country = (
      (data.components as OpenAPIRaw).schemas as OpenAPIRaw as Record<
        string,
        Record<string, Record<string, Record<string, Record<string, unknown>>>>
      >
    ).User.properties.address.properties.country;
    expect(country.$ref).toBeUndefined();
    expect(country.type).toBe('object');
  });

  it('should handle broken refs in array items', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: {
              roles: {
                type: 'array',
                items: { $ref: '#/components/schemas/Role' },
              },
            },
          },
        },
      },
    };

    priv.fixBrokenRefs(data);

    const items = (
      (data.components as OpenAPIRaw).schemas as OpenAPIRaw as Record<
        string,
        Record<string, Record<string, Record<string, unknown>>>
      >
    ).User.properties.roles.items;
    expect(items.$ref).toBeUndefined();
    expect(items.type).toBe('object');
  });
});

// ===================================================================================
// fixDuplicateOperationIds 测试
// ===================================================================================

describe('fixDuplicateOperationIds', () => {
  it('should not modify unique operationIds', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      paths: {
        '/users': {
          get: { operationId: 'getUsers' },
          post: { operationId: 'createUser' },
        },
        '/orders': {
          get: { operationId: 'getOrders' },
        },
      },
    };

    priv.fixDuplicateOperationIds(data);

    const paths = data.paths as Record<
      string,
      Record<string, Record<string, string>>
    >;
    expect(paths['/users'].get.operationId).toBe('getUsers');
    expect(paths['/users'].post.operationId).toBe('createUser');
    expect(paths['/orders'].get.operationId).toBe('getOrders');
  });

  it('should rename duplicate operationId with method and path suffix', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      paths: {
        '/users': {
          get: { operationId: 'getData' },
        },
        '/orders': {
          get: { operationId: 'getData' },
        },
      },
    };

    priv.fixDuplicateOperationIds(data);

    const paths = data.paths as Record<
      string,
      Record<string, Record<string, string>>
    >;
    expect(paths['/users'].get.operationId).toBe('getData');
    expect(paths['/orders'].get.operationId).toBe('getData_GET_orders');
  });

  it('should handle triple duplicates with counter suffix', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      paths: {
        '/a': {
          get: { operationId: 'dup' },
        },
        '/b': {
          post: { operationId: 'dup' },
        },
        '/c': {
          put: { operationId: 'dup' },
        },
      },
    };

    priv.fixDuplicateOperationIds(data);

    const paths = data.paths as Record<
      string,
      Record<string, Record<string, string>>
    >;
    expect(paths['/a'].get.operationId).toBe('dup');
    expect(paths['/b'].post.operationId).toBe('dup_POST_b');
    expect(paths['/c'].put.operationId).toBe('dup_PUT_c');
  });

  it('should handle path parameters in slug', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      paths: {
        '/users': {
          get: { operationId: 'getData' },
        },
        '/users/{id}': {
          get: { operationId: 'getData' },
        },
      },
    };

    priv.fixDuplicateOperationIds(data);

    const paths = data.paths as Record<
      string,
      Record<string, Record<string, string>>
    >;
    expect(paths['/users'].get.operationId).toBe('getData');
    // Path parameter {id} is replaced with "param" in slug
    expect(paths['/users/{id}'].get.operationId).toBe(
      'getData_GET_users_param',
    );
  });
});

// ===================================================================================
// fixSecuritySchemes 测试
// ===================================================================================

describe('fixSecuritySchemes', () => {
  it('should remove name and in from http security schemes', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            name: 'Authorization',
            in: 'header',
          },
        },
      },
    };

    priv.fixSecuritySchemes(data);

    const scheme = (
      (data.components as OpenAPIRaw).securitySchemes as OpenAPIRaw as Record<
        string,
        Record<string, unknown>
      >
    ).bearerAuth;
    expect(scheme.type).toBe('http');
    expect(scheme.scheme).toBe('bearer');
    expect(scheme.name).toBeUndefined();
    expect(scheme.in).toBeUndefined();
  });

  it('should not modify apiKey security schemes', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        securitySchemes: {
          apiKeyAuth: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
          },
        },
      },
    };

    const original = JSON.parse(JSON.stringify(data));
    priv.fixSecuritySchemes(data);
    expect(data).toEqual(original);
  });

  it('should handle data without components', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      paths: {},
    };

    // Should not throw
    expect(() => priv.fixSecuritySchemes(data)).not.toThrow();
  });

  it('should handle data without securitySchemes', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {},
      },
    };

    // Should not throw
    expect(() => priv.fixSecuritySchemes(data)).not.toThrow();
  });
});

// ===================================================================================
// fixPathsSecurityExtensions 测试
// ===================================================================================

describe('fixPathsSecurityExtensions', () => {
  it('should remove x- prefixed keys from security arrays', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      paths: {
        '/users': {
          get: {
            security: [
              {
                bearerAuth: [],
                'x-apifox-options': { someOption: true },
              },
            ],
          },
        },
      },
    };

    priv.fixPathsSecurityExtensions(data);

    const secItem = (data.paths as Record<string, Record<string, unknown>>)[
      '/users'
    ].get as Record<string, unknown>;
    const security = (secItem.security as Record<string, unknown>[])[0];
    expect(security.bearerAuth).toEqual([]);
    expect(security['x-apifox-options']).toBeUndefined();
  });

  it('should handle case-insensitive x- prefix matching', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      paths: {
        '/users': {
          get: {
            security: [
              {
                bearerAuth: [],
                'X-Apifox-Options': { someOption: true },
              },
            ],
          },
        },
      },
    };

    priv.fixPathsSecurityExtensions(data);

    const secItem = (data.paths as Record<string, Record<string, unknown>>)[
      '/users'
    ].get as Record<string, unknown>;
    const security = (secItem.security as Record<string, unknown>[])[0];
    expect(security['X-Apifox-Options']).toBeUndefined();
  });

  it('should preserve non-x- keys', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      paths: {
        '/users': {
          get: {
            security: [
              {
                bearerAuth: ['read', 'write'],
                oauth2: ['profile'],
              },
            ],
          },
        },
      },
    };

    const original = JSON.parse(JSON.stringify(data));
    priv.fixPathsSecurityExtensions(data);
    expect(data).toEqual(original);
  });

  it('should handle multiple security items', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      paths: {
        '/users': {
          get: {
            security: [
              {
                bearerAuth: [],
                'x-apifox-1': true,
              },
              {
                oauth2: [],
                'x-apifox-2': true,
              },
            ],
          },
        },
      },
    };

    priv.fixPathsSecurityExtensions(data);

    const secItems = (data.paths as Record<string, Record<string, unknown>>)[
      '/users'
    ].get as Record<string, unknown>;
    const security = secItems.security as Record<string, unknown>[];
    expect(security[0]['x-apifox-1']).toBeUndefined();
    expect(security[0].bearerAuth).toEqual([]);
    expect(security[1]['x-apifox-2']).toBeUndefined();
    expect(security[1].oauth2).toEqual([]);
  });

  it('should handle data without paths', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {},
    };

    // Should not throw
    expect(() => priv.fixPathsSecurityExtensions(data)).not.toThrow();
  });
});

// ===================================================================================
// fixGenericsNames 测试
// ===================================================================================

describe('fixGenericsNames', () => {
  it('should rename generic schema key from «» to _', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          'PageVO«User»': { type: 'object' },
        },
      },
    };

    priv.fixGenericsNames(data);

    const schemas = (data.components as OpenAPIRaw).schemas as Record<
      string,
      unknown
    >;
    expect(schemas.PageVO_User).toBeDefined();
    expect(schemas['PageVO«User»']).toBeUndefined();
  });

  it('should inject x-apifox-generic metadata', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          'PageVO«User»': { type: 'object' },
        },
      },
    };

    priv.fixGenericsNames(data);

    const schema = (
      (data.components as OpenAPIRaw).schemas as Record<
        string,
        Record<string, unknown>
      >
    ).PageVO_User;
    expect(schema['x-apifox-generic']).toEqual({
      baseType: 'PageVO',
      generics: ['User'],
    });
  });

  it('should handle multiple generic parameters', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          'Map«String,User»': { type: 'object' },
        },
      },
    };

    priv.fixGenericsNames(data);

    const schema = (
      (data.components as OpenAPIRaw).schemas as Record<
        string,
        Record<string, unknown>
      >
    ).Map_String_User;
    expect(schema['x-apifox-generic']).toEqual({
      baseType: 'Map',
      generics: ['String', 'User'],
    });
  });

  it('should update $ref throughout the document', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          'PageVO«User»': { type: 'object' },
          Profile: {
            type: 'object',
            properties: {
              page: { $ref: '#/components/schemas/PageVO«User»' },
            },
          },
        },
      },
    };

    priv.fixGenericsNames(data);

    const pageRef = (
      (data.components as OpenAPIRaw).schemas as Record<
        string,
        Record<string, Record<string, unknown>>
      >
    ).Profile.properties.page;
    expect(pageRef.$ref).toBe('#/components/schemas/PageVO_User');
  });

  it('should handle URL-encoded generic names', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const encoded = encodeURIComponent('PageVO«User»');
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          [encoded]: { type: 'object' },
        },
      },
    };

    priv.fixGenericsNames(data);

    const schemas = (data.components as OpenAPIRaw).schemas as Record<
      string,
      unknown
    >;
    expect(schemas.PageVO_User).toBeDefined();
  });

  it('should not modify non-generic schemas', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          User: { type: 'object' },
          PageVO: { type: 'object' },
        },
      },
    };

    const original = JSON.parse(JSON.stringify(data));
    priv.fixGenericsNames(data);
    expect(data).toEqual(original);
  });

  it('should handle generic name collision with non-generic schema', () => {
    const adapter = new ApifoxAdapter();
    const priv = getPrivate(adapter);
    const data: OpenAPIRaw = {
      components: {
        schemas: {
          PageVO_User: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
          'PageVO«User»': {
            type: 'object',
            properties: { items: { type: 'array' } },
          },
        },
      },
    };

    priv.fixGenericsNames(data);

    const schemas = (data.components as OpenAPIRaw).schemas as Record<
      string,
      Record<string, unknown>
    >;
    // Both should exist
    expect(schemas.PageVO_User).toBeDefined();
    // The generic should have a hash suffix
    const genericKey = Object.keys(schemas).find(
      (k) => k.startsWith('PageVO_User_') && k !== 'PageVO_User',
    );
    expect(genericKey).toBeDefined();
    // The generic should have x-apifox-generic metadata
    expect(schemas[genericKey!]['x-apifox-generic']).toBeDefined();
    // The non-generic should not have metadata
    expect(schemas.PageVO_User['x-apifox-generic']).toBeUndefined();
  });
});
