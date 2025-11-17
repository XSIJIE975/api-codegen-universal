/**
 * OpenAPI 适配器
 * 基于 openapi-typescript AST 进行二次处理
 */

import openapiTS from 'openapi-typescript';
import ts from 'typescript';
import type {
  IAdapter,
  StandardOutput,
  InputSource,
  OpenAPIOptions,
  SchemaDefinition,
  ApiDefinition,
  Metadata,
  SchemaReference,
  NamingStyle,
  ParametersDefinition,
} from '@api-codegen-universal/core';
import { PathClassifier, GenericDetector } from '@api-codegen-universal/core';

/**
 * OpenAPI 适配器
 *
 * 处理流程:
 * 1. 调用 openapi-typescript 获取 TypeScript AST
 * 2. 遍历 AST 提取类型信息
 * 3. 转换为标准格式
 */
export class OpenAPIAdapter implements IAdapter {
  private pathClassifier: PathClassifier;
  private genericDetector: GenericDetector;
  /** 泛型基类集合(从 responses 中检测到的) */
  private genericBaseTypes = new Set<string>();
  /** 命名风格配置 */
  private namingStyle: NamingStyle = 'PascalCase';
  /** 接口导出模式 */
  private interfaceExportMode: 'export' | 'declare' = 'export';
  /** 是否生成 schemas */
  private shouldGenerateSchemas = true;
  /** 是否生成 interfaces */
  private shouldGenerateInterfaces = true;

  constructor() {
    this.pathClassifier = new PathClassifier();
    this.genericDetector = new GenericDetector();
  }

  /**
   * 解析 OpenAPI 文档
   */
  async parse(
    source: InputSource,
    options?: OpenAPIOptions,
  ): Promise<StandardOutput> {
    // 1. 使用 openapi-typescript 生成 TypeScript AST
    const ast = await openapiTS(source as any, {
      transform: options?.transform,
    });

    // 2. 提取配置选项
    const pathClassificationOpts = options?.pathClassification || {};
    const codeGenOpts = options?.codeGeneration || {};
    const outputOpts = codeGenOpts.output || {};

    // 初始化分类器
    this.pathClassifier = new PathClassifier({
      outputPrefix: pathClassificationOpts.outputPrefix || 'api',
      commonPrefix: pathClassificationOpts.commonPrefix,
      maxDepth: pathClassificationOpts.maxDepth || 2,
    });

    // 设置代码生成配置
    this.namingStyle = codeGenOpts.parameterNamingStyle || 'PascalCase';
    this.interfaceExportMode = codeGenOpts.interfaceExportMode || 'export';

    // 3. 根据配置决定是否生成各个部分
    this.shouldGenerateSchemas = outputOpts.schemas !== false;
    this.shouldGenerateInterfaces = outputOpts.interfaces !== false;
    const shouldGenerateApis = outputOpts.apis !== false;

    // 4. 遍历 AST 提取信息
    const schemas: Record<string, SchemaDefinition> = {};
    const interfaces: Record<string, string> = {};
    const apis: ApiDefinition[] = [];

    // 重置泛型基类集合
    this.genericBaseTypes.clear();

    // 存储中间数据
    let pathsNode: ts.InterfaceDeclaration | undefined;
    let operationsNode: ts.InterfaceDeclaration | undefined;
    let componentsNode: ts.InterfaceDeclaration | undefined;

    // 第一遍遍历: 找到关键接口
    for (const node of ast) {
      if (ts.isInterfaceDeclaration(node)) {
        const interfaceName = node.name.text;

        if (interfaceName === 'paths') {
          pathsNode = node;
        } else if (interfaceName === 'operations') {
          operationsNode = node;
        } else if (interfaceName === 'components') {
          componentsNode = node;
        }
      }
    }

    // 第二步: 提取 APIs 和参数接口
    // 注意：即使不生成 APIs，也需要遍历以生成参数接口
    if (pathsNode && operationsNode) {
      if (shouldGenerateApis) {
        // 需要生成 APIs，正常提取
        this.extractAPIs(pathsNode, operationsNode, apis, schemas, interfaces);
      } else if (this.shouldGenerateSchemas || this.shouldGenerateInterfaces) {
        // 不生成 APIs，但需要生成 schemas 或 interfaces，则只提取参数相关的
        this.extractParametersOnly(
          pathsNode,
          operationsNode,
          schemas,
          interfaces,
        );
      }
    }

    // 第三步: 提取 schemas 和生成接口代码（来自 components）
    if (componentsNode) {
      if (this.shouldGenerateSchemas) {
        this.extractSchemas(componentsNode, schemas);
      }
      if (this.shouldGenerateInterfaces) {
        this.generateInterfaceCode(componentsNode, interfaces);
      }
    }

    // 5. 生成元数据
    const metadata: Metadata = {
      generatedAt: new Date().toISOString(),
      commonPrefix: pathClassificationOpts.commonPrefix,
    };

    return {
      schemas,
      interfaces,
      apis,
      metadata,
    };
  }

  /**
   * 从 paths + operations 提取 API 定义
   */
  private extractAPIs(
    pathsNode: ts.InterfaceDeclaration,
    operationsNode: ts.InterfaceDeclaration,
    apis: ApiDefinition[],
    schemas: Record<string, SchemaDefinition>,
    interfaces: Record<string, string>,
  ): void {
    // 1. 构建 operations 的映射表
    const operationsMap = new Map<string, ts.TypeLiteralNode>();

    for (const member of operationsNode.members) {
      if (ts.isPropertySignature(member) && member.name && member.type) {
        const operationId = (member.name as ts.Identifier).text;
        if (ts.isTypeLiteralNode(member.type)) {
          operationsMap.set(operationId, member.type);
        }
      }
    }

    // 2. 遍历 paths,结合 operations 生成 API
    for (const pathMember of pathsNode.members) {
      if (
        ts.isPropertySignature(pathMember) &&
        pathMember.name &&
        pathMember.type
      ) {
        // 提取 path (可能是 StringLiteral)
        const path = this.extractStringFromNode(pathMember.name);

        if (path && ts.isTypeLiteralNode(pathMember.type)) {
          // 遍历该 path 下的 HTTP 方法
          for (const methodMember of pathMember.type.members) {
            if (
              ts.isPropertySignature(methodMember) &&
              methodMember.name &&
              methodMember.type
            ) {
              const method = (
                methodMember.name as ts.Identifier
              ).text.toUpperCase();

              // 提取 operationId 引用
              const operationId = this.extractOperationIdReference(
                methodMember.type,
              );

              if (operationId && operationsMap.has(operationId)) {
                const operationNode = operationsMap.get(operationId)!;

                // 构建 ApiDefinition
                const api = this.buildApiDefinition(
                  path,
                  method,
                  operationId,
                  operationNode,
                  schemas,
                  interfaces,
                );

                apis.push(api);
              }
            }
          }
        }
      }
    }
  }

  /**
   * 只提取参数接口（不生成 API 定义）
   * 用于当 apis: false 但需要生成 schemas/interfaces 时
   */
  private extractParametersOnly(
    pathsNode: ts.InterfaceDeclaration,
    operationsNode: ts.InterfaceDeclaration,
    schemas: Record<string, SchemaDefinition>,
    interfaces: Record<string, string>,
  ): void {
    // 1. 构建 operations 的映射表
    const operationsMap = new Map<string, ts.TypeLiteralNode>();

    for (const member of operationsNode.members) {
      if (ts.isPropertySignature(member) && member.name && member.type) {
        const operationId = (member.name as ts.Identifier).text;
        if (ts.isTypeLiteralNode(member.type)) {
          operationsMap.set(operationId, member.type);
        }
      }
    }

    // 2. 遍历 paths，只提取参数
    for (const pathMember of pathsNode.members) {
      if (
        ts.isPropertySignature(pathMember) &&
        pathMember.name &&
        pathMember.type
      ) {
        const path = this.extractStringFromNode(pathMember.name);

        if (path && ts.isTypeLiteralNode(pathMember.type)) {
          // 遍历该 path 下的 HTTP 方法
          for (const methodMember of pathMember.type.members) {
            if (
              ts.isPropertySignature(methodMember) &&
              methodMember.name &&
              methodMember.type
            ) {
              // 提取 operationId 引用
              const operationId = this.extractOperationIdReference(
                methodMember.type,
              );

              if (operationId && operationsMap.has(operationId)) {
                const operationNode = operationsMap.get(operationId)!;

                // 只提取 parameters
                for (const member of operationNode.members) {
                  if (ts.isPropertySignature(member) && member.name) {
                    const propName = (member.name as ts.Identifier).text;

                    if (
                      propName === 'parameters' &&
                      member.type &&
                      ts.isTypeLiteralNode(member.type)
                    ) {
                      this.extractParameters(
                        operationId,
                        member.type,
                        schemas,
                        interfaces,
                      );
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * 从 components 接口提取 Schema 定义
   */
  private extractSchemas(
    componentsNode: ts.InterfaceDeclaration,
    schemas: Record<string, SchemaDefinition>,
  ): void {
    // 找到 schemas 属性
    for (const member of componentsNode.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = (member.name as ts.Identifier).text;

        if (
          propName === 'schemas' &&
          member.type &&
          ts.isTypeLiteralNode(member.type)
        ) {
          // 遍历所有 schema
          for (const schemaMember of member.type.members) {
            if (
              ts.isPropertySignature(schemaMember) &&
              schemaMember.name &&
              schemaMember.type
            ) {
              const schemaName = this.extractStringFromNode(schemaMember.name);

              if (schemaName && ts.isTypeLiteralNode(schemaMember.type)) {
                // 解析具体的 schema 结构
                schemas[schemaName] = this.typeNodeToSchema(
                  schemaName,
                  schemaMember.type,
                );
              }
            }
          }
        }
      }
    }
  }

  /**
   * 构建 ApiDefinition
   */
  private buildApiDefinition(
    path: string,
    method: string,
    operationId: string,
    operationNode: ts.TypeLiteralNode,
    schemas: Record<string, SchemaDefinition>,
    interfaces: Record<string, string>,
  ): ApiDefinition {
    // 分类路径
    const category = this.pathClassifier.classify(path);

    // 基础 API 定义
    const api: ApiDefinition = {
      path,
      method: method as any,
      operationId,
      category,
      responses: {},
    };

    // 解析 operation 内容
    for (const member of operationNode.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = (member.name as ts.Identifier).text;

        if (
          propName === 'parameters' &&
          member.type &&
          ts.isTypeLiteralNode(member.type)
        ) {
          // 提取 parameters (query/path/header/cookie)
          api.parameters = this.extractParameters(
            operationId,
            member.type,
            schemas,
            interfaces,
          );
        } else if (propName === 'requestBody' && member.type) {
          // 提取 requestBody
          api.requestBody = this.extractRequestBody(member.type);
        } else if (propName === 'responses' && member.type) {
          // 提取 responses
          api.responses = this.extractResponses(member.type);
        }
      }
    }

    return api;
  }

  /**
   * 提取 parameters 定义（新版：生成接口）
   */
  private extractParameters(
    operationId: string,
    parametersNode: ts.TypeLiteralNode,
    schemas: Record<string, SchemaDefinition>,
    interfaces: Record<string, string>,
  ): ParametersDefinition | undefined {
    const parametersMap: ParametersDefinition = {};
    let hasParameters = false;

    for (const member of parametersNode.members) {
      if (ts.isPropertySignature(member) && member.name && member.type) {
        const location = (member.name as ts.Identifier).text as
          | 'query'
          | 'path'
          | 'header'
          | 'cookie';

        // 检查是否是 never 类型
        if (
          ts.isTypeReferenceNode(member.type) &&
          member.type.typeName.getText() === 'never'
        ) {
          continue;
        }

        // 提取 TypeLiteralNode
        if (ts.isTypeLiteralNode(member.type)) {
          // 生成接口名称（使用配置的命名风格）
          const interfaceName = this.generateParameterInterfaceName(
            operationId,
            location,
          );

          // 根据配置生成 SchemaDefinition
          if (this.shouldGenerateSchemas) {
            const schema = this.typeNodeToSchema(interfaceName, member.type);
            schemas[interfaceName] = schema;
          }

          // 根据配置生成接口代码
          if (this.shouldGenerateInterfaces) {
            const interfaceCode = this.generateInterfaceString(
              interfaceName,
              member.type,
              false,
            );
            interfaces[interfaceName] = interfaceCode;
          }

          // 添加到 parametersMap
          parametersMap[location] = {
            type: 'ref',
            ref: interfaceName,
          };

          hasParameters = true;
        }
      }
    }

    return hasParameters ? parametersMap : undefined;
  }

  /**
   * 生成参数接口名称
   */
  private generateParameterInterfaceName(
    operationId: string,
    location: string,
  ): string {
    // 转换 location 首字母大写
    const locationCapitalized =
      location.charAt(0).toUpperCase() + location.slice(1);

    // 根据命名风格转换
    return this.convertToNamingStyle(
      `${operationId}_${locationCapitalized}_Params`,
    );
  }

  /**
   * 转换为指定的命名风格
   */
  private convertToNamingStyle(name: string): string {
    switch (this.namingStyle) {
      case 'PascalCase':
        // AuthController_register_Query_Params -> AuthControllerRegisterQueryParams
        return name
          .split(/[_-]/)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join('');

      case 'camelCase':
        // AuthController_register_Query_Params -> authControllerRegisterQueryParams
        const parts = name.split(/[_-]/).filter((p) => p.length > 0);
        if (parts.length === 0) return name;
        const firstPart = parts[0]!;
        return (
          firstPart.charAt(0).toLowerCase() +
          firstPart.slice(1) +
          parts
            .slice(1)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join('')
        );

      case 'snake_case':
        // AuthController_register_Query_Params -> auth_controller_register_query_params
        return name
          .toLowerCase()
          .replace(/[A-Z]/g, (letter, index) =>
            index === 0 ? letter.toLowerCase() : '_' + letter.toLowerCase(),
          );

      case 'kebab-case':
        // AuthController_register_Query_Params -> auth-controller-register-query-params
        return name
          .toLowerCase()
          .replace(/[A-Z]/g, (letter, index) =>
            index === 0 ? letter.toLowerCase() : '-' + letter.toLowerCase(),
          )
          .replace(/_/g, '-');

      default:
        return name;
    }
  }

  /**
   * 提取 requestBody 定义
   */
  private extractRequestBody(
    typeNode: ts.TypeNode,
  ): ApiDefinition['requestBody'] {
    if (!ts.isTypeLiteralNode(typeNode)) {
      return undefined;
    }

    // 查找 content 属性
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = (member.name as ts.Identifier).text;

        if (
          propName === 'content' &&
          member.type &&
          ts.isTypeLiteralNode(member.type)
        ) {
          const content: Record<string, any> = {};

          // 遍历 content-type
          for (const contentMember of member.type.members) {
            if (ts.isPropertySignature(contentMember) && contentMember.name) {
              const contentType = this.extractStringFromNode(
                contentMember.name,
              );

              if (contentType && contentMember.type) {
                // 提取 schema 引用
                const schemaRef = this.extractSchemaReference(
                  contentMember.type,
                );

                if (schemaRef) {
                  content[contentType] = {
                    schema: {
                      type: 'ref' as const,
                      ref: schemaRef,
                    },
                  };
                }
              }
            }
          }

          if (Object.keys(content).length > 0) {
            return {
              content,
              required: true,
            };
          }
        }
      }
    }

    return undefined;
  }

  /**
   * 提取 responses 定义
   */
  private extractResponses(typeNode: ts.TypeNode): ApiDefinition['responses'] {
    const responses: ApiDefinition['responses'] = {};

    if (!ts.isTypeLiteralNode(typeNode)) {
      return responses;
    }

    // 遍历所有状态码
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name && member.type) {
        const statusCode = this.extractStringFromNode(member.name);

        if (statusCode && ts.isTypeLiteralNode(member.type)) {
          // 提取 JSDoc 描述
          let description = '';
          const memberWithJsDoc = member as any;
          if (memberWithJsDoc.jsDoc && memberWithJsDoc.jsDoc.length > 0) {
            const jsDoc = memberWithJsDoc.jsDoc[0];
            if (ts.isJSDoc(jsDoc) && jsDoc.comment) {
              description =
                typeof jsDoc.comment === 'string'
                  ? jsDoc.comment
                  : jsDoc.comment.map((c: any) => c.text).join('');
            }
          }

          // 查找 content 属性
          const content: Record<string, any> = {};
          for (const respMember of member.type.members) {
            if (ts.isPropertySignature(respMember) && respMember.name) {
              const propName = (respMember.name as ts.Identifier).text;

              if (
                propName === 'content' &&
                respMember.type &&
                ts.isTypeLiteralNode(respMember.type)
              ) {
                // 查找 application/json
                for (const contentMember of respMember.type.members) {
                  if (
                    ts.isPropertySignature(contentMember) &&
                    contentMember.name
                  ) {
                    const contentType = this.extractStringFromNode(
                      contentMember.name,
                    );

                    if (
                      contentType === 'application/json' &&
                      contentMember.type
                    ) {
                      // 检测泛型模式 - 使用 printer 将 TypeNode 转为文本
                      const printer = ts.createPrinter();
                      const sourceFile = ts.createSourceFile(
                        'temp.ts',
                        '',
                        ts.ScriptTarget.Latest,
                        false,
                        ts.ScriptKind.TS,
                      );
                      const typeText = printer.printNode(
                        ts.EmitHint.Unspecified,
                        contentMember.type,
                        sourceFile,
                      );
                      const genericResult =
                        this.genericDetector.detect(typeText);

                      let schemaRef: SchemaReference;
                      if (
                        genericResult.isGeneric &&
                        genericResult.baseType &&
                        genericResult.genericParam
                      ) {
                        // 泛型类型 - 记录基类
                        this.genericBaseTypes.add(genericResult.baseType);
                        schemaRef = {
                          type: 'ref',
                          ref: `${genericResult.baseType}<${genericResult.genericParam}>`,
                        };
                      } else {
                        // 普通引用
                        const schemaName = this.extractSchemaReference(
                          contentMember.type,
                        );
                        schemaRef = {
                          type: 'ref',
                          ref: schemaName || 'unknown',
                        };
                      }

                      content[contentType] = {
                        schema: schemaRef,
                      };
                    }
                  }
                }
              }
            }
          }

          responses[statusCode] = {
            description: description || `Response for status ${statusCode}`,
            content: Object.keys(content).length > 0 ? content : undefined,
          };
        }
      }
    }

    return responses;
  }

  /**
   * 提取 Schema 引用
   * 例如: components["schemas"]["RegisterDto"] -> "RegisterDto"
   */
  private extractSchemaReference(typeNode: ts.TypeNode): string | undefined {
    if (ts.isIndexedAccessTypeNode(typeNode)) {
      // components["schemas"]["XXX"]
      const objectType = typeNode.objectType;

      if (ts.isIndexedAccessTypeNode(objectType)) {
        // 提取最终的 schema 名称
        if (
          ts.isLiteralTypeNode(typeNode.indexType) &&
          ts.isStringLiteral(typeNode.indexType.literal)
        ) {
          return typeNode.indexType.literal.text;
        }
      }
    }

    return undefined;
  }

  /**
   * 将 TypeNode 转换为 SchemaDefinition
   */
  private typeNodeToSchema(
    name: string,
    typeNode: ts.TypeNode,
  ): SchemaDefinition {
    const schema: SchemaDefinition = {
      name,
      type: 'object',
      properties: {},
    };

    if (ts.isTypeLiteralNode(typeNode)) {
      const required: string[] = [];

      for (const member of typeNode.members) {
        if (ts.isPropertySignature(member) && member.name && member.type) {
          const propName = (member.name as ts.Identifier).text;
          const isRequired = !member.questionToken;

          if (isRequired) {
            required.push(propName);
          }

          // 提取描述
          let description: string | undefined;
          const memberWithJsDoc = member as any;
          if (memberWithJsDoc.jsDoc && memberWithJsDoc.jsDoc.length > 0) {
            const jsDoc = memberWithJsDoc.jsDoc[0];
            if (ts.isJSDoc(jsDoc) && jsDoc.comment) {
              description =
                typeof jsDoc.comment === 'string'
                  ? jsDoc.comment
                  : jsDoc.comment.map((c: any) => c.text).join('');
            }
          }

          schema.properties![propName] = {
            name: propName,
            type: this.tsTypeToSchemaType(member.type),
            required: isRequired,
            description,
          };
        }
      }

      if (required.length > 0) {
        schema.required = required;
      }
    }

    return schema;
  }

  /**
   * 将 TS 类型转换为 schema 类型字符串
   */
  private tsTypeToSchemaType(typeNode: ts.TypeNode): string {
    switch (typeNode.kind) {
      case ts.SyntaxKind.StringKeyword:
        return 'string';
      case ts.SyntaxKind.NumberKeyword:
        return 'number';
      case ts.SyntaxKind.BooleanKeyword:
        return 'boolean';
      case ts.SyntaxKind.AnyKeyword:
        return 'any';
      default:
        return 'string';
    }
  }

  /**
   * 从节点提取字符串值
   */
  private extractStringFromNode(node: ts.PropertyName): string | null {
    if (ts.isStringLiteral(node)) {
      return node.text;
    }
    if (ts.isIdentifier(node)) {
      return node.text;
    }
    if (ts.isNumericLiteral(node)) {
      return node.text;
    }
    return null;
  }

  /**
   * 提取 operations 引用
   * 例如: operations["AuthController_register"]
   */
  private extractOperationIdReference(typeNode: ts.TypeNode): string | null {
    if (ts.isIndexedAccessTypeNode(typeNode)) {
      // typeNode.indexType 应该是字符串字面量
      if (
        ts.isLiteralTypeNode(typeNode.indexType) &&
        ts.isStringLiteral(typeNode.indexType.literal)
      ) {
        return typeNode.indexType.literal.text;
      }
    }
    return null;
  }

  /**
   * 生成接口代码字符串
   */
  private generateInterfaceCode(
    componentsNode: ts.InterfaceDeclaration,
    interfaces: Record<string, string>,
  ): void {
    // 找到 schemas 属性
    for (const member of componentsNode.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const propName = (member.name as ts.Identifier).text;

        if (
          propName === 'schemas' &&
          member.type &&
          ts.isTypeLiteralNode(member.type)
        ) {
          // 遍历所有 schema
          for (const schemaMember of member.type.members) {
            if (
              ts.isPropertySignature(schemaMember) &&
              schemaMember.name &&
              schemaMember.type
            ) {
              const schemaName = this.extractStringFromNode(schemaMember.name);

              if (schemaName && ts.isTypeLiteralNode(schemaMember.type)) {
                // 生成接口代码
                const interfaceCode = this.generateInterfaceString(
                  schemaName,
                  schemaMember.type,
                  this.genericBaseTypes.has(schemaName),
                );
                interfaces[schemaName] = interfaceCode;
              }
            }
          }
        }
      }
    }
  }

  /**
   * 生成单个接口的代码字符串
   */
  private generateInterfaceString(
    name: string,
    typeNode: ts.TypeLiteralNode,
    isGeneric: boolean,
  ): string {
    const lines: string[] = [];

    // 接口声明行 - 根据配置选择 export 或 declare
    const exportKeyword =
      this.interfaceExportMode === 'export' ? 'export ' : 'declare ';
    const genericPart = isGeneric ? '<T = any>' : '';
    lines.push(`${exportKeyword}interface ${name}${genericPart} {`);

    // 创建 printer 用于打印注释
    const printer = ts.createPrinter({ removeComments: false });
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      '',
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    );

    // 遍历所有属性
    for (const member of typeNode.members) {
      if (ts.isPropertySignature(member) && member.name && member.type) {
        const propName = (member.name as ts.Identifier).text;
        const isOptional = !!member.questionToken;

        // 打印整个成员节点(包括注释)
        const memberText = printer.printNode(
          ts.EmitHint.Unspecified,
          member,
          sourceFile,
        );

        // 提取注释部分
        const commentMatch = memberText.match(/(\/\*\*[\s\S]*?\*\/)/);
        if (commentMatch && commentMatch[1]) {
          // 有注释,格式化并添加
          const commentBlock = commentMatch[1];
          const commentLines = commentBlock.split('\n');
          commentLines.forEach((line) => {
            lines.push(`  ${line.trim()}`);
          });
        }

        // 生成类型字符串
        let typeStr: string;
        if (isGeneric && propName === 'data') {
          typeStr = 'T';
        } else {
          typeStr = this.typeNodeToString(member.type);
        }

        // 属性声明行
        const optionalMark = isOptional ? '?' : '';
        lines.push(`  ${propName}${optionalMark}: ${typeStr};`);
      }
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * 将 TypeNode 转换为类型字符串
   */
  private typeNodeToString(typeNode: ts.TypeNode): string {
    const printer = ts.createPrinter();
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      '',
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    );

    // 打印类型节点
    let typeStr = printer.printNode(
      ts.EmitHint.Unspecified,
      typeNode,
      sourceFile,
    );

    // 处理 components["schemas"]["XXX"] 格式,提取出类型名
    typeStr = typeStr.replace(/components\["schemas"\]\["([^"]+)"\]/g, '$1');

    // 处理数组类型
    typeStr = typeStr.replace(/Array<(.+)>/g, '$1[]');

    return typeStr;
  }

  /**
   * 验证输入源
   */
  async validate(source: InputSource): Promise<boolean> {
    try {
      await openapiTS(source as any);
      return true;
    } catch {
      return false;
    }
  }
}
