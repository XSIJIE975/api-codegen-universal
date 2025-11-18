/**
 * OpenAPI 适配器
 * 基于 openapi-typescript AST 进行二次处理
 */

import openapiTS from 'openapi-typescript';
import ts from 'typescript';
import type {
  IAdapter,
  StandardOutput,
  SchemaDefinition,
  ApiDefinition,
  Metadata,
} from '@api-codegen-universal/core';
import type {
  InputSource,
  OpenAPIOptions,
  NamingStyle,
} from '../types/index.js';
import { PathClassifier } from '../utils/path-classifier.js';
import { GenericDetector } from '../utils/generic-detector.js';
import { SchemaExtractor } from './schema-extractor.js';
import { InterfaceGenerator } from './interface-generator.js';
import { ParameterExtractor } from './parameter-extractor.js';
import { RequestResponseExtractor } from './request-response-extractor.js';
import { ApiExtractor } from './api-extractor.js';

/**
 * OpenAPI 适配器
 *
 * 处理流程:
 * 1. 调用 openapi-typescript 获取 TypeScript AST
 * 2. 遍历 AST 提取类型信息
 * 3. 转换为标准格式
 */
export class OpenAPIAdapter implements IAdapter<OpenAPIOptions, InputSource> {
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

  // 提取器实例
  private schemaExtractor!: SchemaExtractor;
  private interfaceGenerator!: InterfaceGenerator;
  private parameterExtractor!: ParameterExtractor;
  private requestResponseExtractor!: RequestResponseExtractor;
  private apiExtractor!: ApiExtractor;

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
    const ast = await openapiTS(source, {
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

    // 4. 重置泛型基类集合
    this.genericBaseTypes.clear();

    // 5. 初始化所有提取器
    this.schemaExtractor = new SchemaExtractor(this.genericBaseTypes);
    this.interfaceGenerator = new InterfaceGenerator(
      this.genericBaseTypes,
      this.interfaceExportMode,
    );
    this.requestResponseExtractor = new RequestResponseExtractor(
      this.genericDetector,
      this.genericBaseTypes,
    );
    this.parameterExtractor = new ParameterExtractor(
      this.namingStyle,
      this.shouldGenerateSchemas,
      this.shouldGenerateInterfaces,
      this.schemaExtractor,
      this.interfaceGenerator,
    );
    this.apiExtractor = new ApiExtractor(
      this.pathClassifier,
      this.parameterExtractor,
      this.requestResponseExtractor,
    );

    // 6. 遍历 AST 提取信息
    const schemas: Record<string, SchemaDefinition> = {};
    const interfaces: Record<string, string> = {};
    const apis: ApiDefinition[] = [];

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

    // 第二遍处理: 提取数据

    // 提取 schemas
    if (componentsNode && this.shouldGenerateSchemas) {
      this.schemaExtractor.extractSchemas(componentsNode, schemas);
    }

    // 提取 interfaces
    if (componentsNode && this.shouldGenerateInterfaces) {
      this.interfaceGenerator.generateInterfaceCode(componentsNode, interfaces);
    }

    // 提取 APIs
    if (pathsNode && operationsNode) {
      if (shouldGenerateApis) {
        this.apiExtractor.extractAPIs(
          pathsNode,
          operationsNode,
          apis,
          schemas,
          interfaces,
        );
      } else {
        // 即使不生成 APIs，也需要提取参数接口
        this.parameterExtractor.extractParametersOnly(
          pathsNode,
          operationsNode,
          schemas,
          interfaces,
        );
      }
    }

    // 7. 返回标准格式
    return {
      schemas,
      interfaces,
      apis,
      metadata: this.buildMetadata(source),
    };
  }

  /**
   * 构建元数据
   */
  private buildMetadata(source: InputSource): Metadata | null {
    return {
      generatedAt: new Date().toISOString(),
      source: typeof source === 'string' ? source : undefined,
    };
  }

  /**
   * 验证输入源
   */
  async validate(source: InputSource): Promise<boolean> {
    try {
      // openapiTS 接受 string | URL 作为参数
      await openapiTS(source as string | URL);
      return true;
    } catch {
      return false;
    }
  }
}
