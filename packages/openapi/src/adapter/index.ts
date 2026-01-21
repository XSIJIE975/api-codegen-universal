/**
 * OpenAPI 适配器
 * 基于 openapi-typescript AST 进行二次处理
 * 将 OpenAPI 文档转换为标准输出格式 (StandardOutput)
 */

import openapiTS from 'openapi-typescript';
import ts from 'typescript';
import { load as loadYaml } from 'js-yaml';
import { createAdapterLogger } from '@api-codegen-universal/core';
import type {
  IAdapter,
  StandardOutput,
  SchemaDefinition,
  ApiDefinition,
  Metadata,
  NamingStyle,
} from '@api-codegen-universal/core';
import type { InputSource, OpenAPIOptions, OpenAPIDocument } from '../types';
import { PathClassifier, GenericDetector } from '../utils';
import { SchemaExtractor } from './schema-extractor';
import { InterfaceGenerator } from './interface-generator';
import { ParameterExtractor } from './parameter-extractor';
import { RequestResponseExtractor } from './request-response-extractor';
import { ApiExtractor } from './api-extractor';

/**
 * OpenAPI 适配器
 *
 * 该适配器负责将 OpenAPI 文档转换为标准输出格式。
 * 它使用 openapi-typescript 将 OpenAPI 转换为 TypeScript AST，
 * 然后遍历 AST 提取 Schema、Interface 和 API 定义。
 *
 * 处理流程:
 * 1. 调用 openapi-typescript 获取 TypeScript AST
 * 2. 遍历 AST 提取类型信息
 * 3. 转换为标准格式
 */
export class OpenAPIAdapter implements IAdapter<OpenAPIOptions, InputSource> {
  // ===================================================================================
  // 核心组件
  // ===================================================================================

  /** 路径分类器：用于将 API 路径分类到不同的模块/文件中 */
  private pathClassifier: PathClassifier;

  /** 泛型检测器：用于检测和处理泛型类型 */
  private genericDetector: GenericDetector;

  // ===================================================================================
  // 状态数据
  // ===================================================================================

  /** 泛型基类集合(从 responses 中检测到的) name -> fieldName */
  private genericBaseTypes = new Map<string, string>();

  /** 泛型信息映射 (Schema Name -> Generic Info) */
  private genericInfoMap = new Map<
    string,
    { baseType: string; generics: string[] }
  >();

  // ===================================================================================
  // 配置选项
  // ===================================================================================

  /** 命名风格配置 */
  private namingStyle: NamingStyle = 'PascalCase';

  /** 接口导出模式 */
  private interfaceExportMode: 'export' | 'declare' = 'export';

  /** 是否生成 schemas */
  private shouldGenerateSchemas = true;

  /** 是否生成 interfaces */
  private shouldGenerateInterfaces = true;

  // ===================================================================================
  // 提取器实例
  // ===================================================================================

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
   *
   * @param source 输入源 (URL, 文件路径, 或对象)
   * @param options 配置选项
   * @returns 标准输出格式
   */
  async parse(
    source: InputSource,
    options?: OpenAPIOptions,
  ): Promise<StandardOutput> {
    /**
     * 统一日志入口（默认 logLevel='error'，因此不主动输出 warn/info）。
     * 这里仅用于元数据加载失败时的警告（不影响主流程）。
     */
    const sourceLabel =
      typeof source === 'string'
        ? source
        : source instanceof URL
          ? source.toString()
          : Buffer.isBuffer(source)
            ? 'buffer'
            : typeof source === 'object' && source !== null && 'read' in source
              ? 'stream'
              : 'object';
    const logger = createAdapterLogger(options, {
      adapter: 'openapi',
      source: sourceLabel,
    });

    // 1. 使用 openapi-typescript 生成 TypeScript AST
    const ast = await openapiTS(source, {
      transform: options?.transform,
    });

    // 加载原始文档以获取元数据
    const rawDocument = await this.loadOpenAPIDocument(source, logger);

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
    this.genericInfoMap.clear();

    // 预处理泛型信息 (从 x-apifox-generic 元数据中提取)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const components = rawDocument?.components as any;
    if (components?.schemas) {
      for (const [key, schema] of Object.entries(components.schemas)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meta = (schema as any)['x-apifox-generic'];
        if (meta) {
          this.genericInfoMap.set(key, meta);
        }
      }
    }

    // 5. 初始化所有提取器
    this.schemaExtractor = new SchemaExtractor(
      this.genericBaseTypes,
      this.namingStyle,
    );
    this.interfaceGenerator = new InterfaceGenerator(
      this.genericBaseTypes,
      this.interfaceExportMode,
      this.genericInfoMap,
      this.namingStyle,
    );
    this.requestResponseExtractor = new RequestResponseExtractor(
      this.genericDetector,
      this.genericBaseTypes,
      this.genericInfoMap,
      this.namingStyle,
      this.interfaceExportMode,
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
      this.schemaExtractor,
      this.interfaceGenerator,
    );

    // 6. 遍历 AST 提取信息
    const schemas: Record<string, SchemaDefinition> = {};
    const interfaces: Record<string, string> = {};
    const apis: ApiDefinition[] = [];

    // 设置 requestResponseExtractor 的依赖项（用于处理内联 schema）
    this.requestResponseExtractor.setDependencies(
      this.schemaExtractor,
      schemas,
      this.interfaceGenerator,
      interfaces,
    );

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

        // 早期退出: 如果找到所有三个接口，无需继续遍历
        if (pathsNode && operationsNode && componentsNode) {
          break;
        }
      }
    }

    // 第二遍处理: 提取数据

    // 提取 APIs (优先提取以检测泛型和生成参数 Schema)
    if (pathsNode) {
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

    // 提取 schemas
    if (componentsNode && this.shouldGenerateSchemas) {
      this.schemaExtractor.extractSchemas(
        componentsNode,
        schemas,
        this.genericInfoMap,
      );
    }

    // 提取 interfaces
    if (componentsNode && this.shouldGenerateInterfaces) {
      this.interfaceGenerator.generateInterfaceCode(componentsNode, interfaces);
    }

    // 7. 返回标准格式
    return {
      schemas,
      interfaces,
      apis,
      metadata: this.buildMetadata(source, options, rawDocument),
    };
  }

  /**
   * 加载原始 OpenAPI 文档
   * 支持 URL, 本地文件路径, Buffer, JSON/YAML 字符串内容, 或直接传入对象
   *
   * 注意：如果 source 是 ReadableStream，由于已被 openapi-typescript 消费，
   * 这里无法再次读取，将返回 null。
   *
   * @param source 输入源
   * @returns 解析后的 OpenAPI 文档对象
   */
  private async loadOpenAPIDocument(
    source: InputSource,
    logger: ReturnType<typeof createAdapterLogger>,
  ): Promise<OpenAPIDocument | null> {
    try {
      // 1. URL 对象
      if (source instanceof URL) {
        return this.loadFromUrlObject(source);
      }

      // 2. Buffer
      if (Buffer.isBuffer(source)) {
        return this.parseContent(source.toString('utf-8'));
      }

      // 3. 字符串 (URL, 文件路径, 或 内容)
      if (typeof source === 'string') {
        return this.loadFromString(source);
      }

      // 4. 对象 (已经是 JSON 对象)
      // 排除 Stream 类型 (Node.js Readable 或 Web ReadableStream)
      if (
        typeof source === 'object' &&
        source !== null &&
        !('read' in source) &&
        !('getReader' in source)
      ) {
        return source as unknown as OpenAPIDocument;
      }
    } catch (error) {
      // 仅记录 warn，不阻断主流程：该步骤仅用于 metadata 提取。
      logger.warn(
        'Failed to load raw OpenAPI document for metadata extraction.',
        {
          code: 'OPENAPI_METADATA_LOAD_FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      );
    }
    return null;
  }

  /**
   * 处理 URL 对象输入
   */
  private async loadFromUrlObject(url: URL): Promise<OpenAPIDocument> {
    if (url.protocol.startsWith('http')) {
      return this.fetchFromUrl(url);
    }
    if (url.protocol === 'file:') {
      const { fileURLToPath } = await import('node:url');
      return this.readFromFile(fileURLToPath(url));
    }
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }

  /**
   * 处理字符串输入
   */
  private async loadFromString(source: string): Promise<OpenAPIDocument> {
    // 1. 远程 URL
    if (/^https?:\/\//i.test(source)) {
      return this.fetchFromUrl(source);
    }

    // 2. 显式的内容特征 (多行, 或包含特定关键字)
    // 如果包含换行符，或者以 { 开头，或者包含 openapi/swagger 关键字，极有可能是内容
    if (
      source.includes('\n') ||
      source.trim().startsWith('{') ||
      source.includes('openapi:') ||
      source.includes('swagger:')
    ) {
      try {
        return this.parseContent(source);
      } catch {
        // 解析失败，可能是奇怪的文件路径，继续尝试作为文件读取
      }
    }

    // 3. 尝试作为文件路径读取
    try {
      return await this.readFromFile(source);
    } catch (fileError) {
      // 4. 文件读取失败，最后尝试一次作为内容解析 (处理不明显的单行内容)
      try {
        return this.parseContent(source);
      } catch {
        // 均失败，抛出文件读取错误
        throw fileError;
      }
    }
  }

  /**
   * 从 URL 获取内容
   */
  private async fetchFromUrl(url: string | URL): Promise<OpenAPIDocument> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenAPI document: ${response.status} ${response.statusText}`,
      );
    }
    const text = await response.text();
    return this.parseContent(text);
  }

  /**
   * 从文件读取内容
   */
  private async readFromFile(filePath: string): Promise<OpenAPIDocument> {
    // 处理 file:// 协议前缀的字符串
    let targetPath = filePath;
    if (targetPath.startsWith('file://')) {
      const { fileURLToPath } = await import('node:url');
      targetPath = fileURLToPath(targetPath);
    }

    const fs = await import('node:fs/promises');
    const text = await fs.readFile(targetPath, 'utf-8');
    return this.parseContent(text);
  }

  /**
   * 解析内容 (JSON 或 YAML)
   */
  private parseContent(text: string): OpenAPIDocument {
    try {
      // 优先尝试 JSON
      return JSON.parse(text);
    } catch {
      // 失败后尝试 YAML
      return loadYaml(text) as OpenAPIDocument;
    }
  }

  /**
   * 构建元数据
   * 提取文档标题、描述、BaseURL 等信息
   *
   * @param source 输入源
   * @param options 配置选项
   * @param rawDocument 原始文档
   * @returns 元数据对象
   */
  private buildMetadata(
    source: InputSource,
    options?: OpenAPIOptions,
    rawDocument?: OpenAPIDocument | null,
  ): Metadata | null {
    const metadata: Metadata = {
      generatedAt: new Date().toISOString(),
      source: typeof source === 'string' ? source : undefined,
      options: options,
    };

    if (rawDocument) {
      if (rawDocument.info) {
        metadata.title = rawDocument.info.title;
        metadata.description = rawDocument.info.description;
      }
      if (
        rawDocument.servers &&
        Array.isArray(rawDocument.servers) &&
        rawDocument.servers.length > 0
      ) {
        metadata.baseUrl = rawDocument.servers[0]?.url;
      }
    }
    return metadata;
  }

  /**
   * 验证输入源
   * 检查是否为有效的 OpenAPI 文档
   *
   * @param source 输入源
   * @returns 是否有效
   */
  async validate(source: InputSource): Promise<boolean> {
    try {
      await openapiTS(source);
      return true;
    } catch {
      return false;
    }
  }
}
