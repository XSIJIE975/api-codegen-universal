/**
 * OpenAPI 适配器
 * 基于 openapi-typescript AST 进行二次处理
 * 将 OpenAPI 文档转换为标准输出格式 (StandardOutput)
 *
 * 设计说明：
 * 该适配器为无状态门面（stateless façade），所有 per-parse 状态都封装在
 * `ParseContext` 中，确保可重入、可并发调用。
 */

import openapiTS from 'openapi-typescript';
import ts from 'typescript';
import { load as loadYaml } from 'js-yaml';
import {
  createAdapterLogger,
  sanitizeOptions,
} from '@api-codegen-universal/core';
import type {
  IAdapter,
  StandardOutput,
  SchemaDefinition,
  ApiDefinition,
  Metadata,
  NamingStyle,
  AdapterLogger,
} from '@api-codegen-universal/core';
import type {
  InputSource,
  OpenAPIOptions,
  OpenAPIDocument,
  ApifoxGenericMeta,
} from '../types';
import { PathClassifier, GenericDetector } from '../utils';
import { SchemaExtractor } from './schema-extractor';
import { InterfaceGenerator } from './interface-generator';
import { ParameterExtractor } from './parameter-extractor';
import { RequestResponseExtractor } from './request-response-extractor';
import { ApiExtractor } from './api-extractor';

// ===================================================================================
// Per-parse 上下文（所有 per-parse 状态的容器）
// ===================================================================================

interface ParseContext {
  // ---- 配置（不可变） ----
  namingStyle: NamingStyle;
  interfaceExportMode: 'export' | 'declare';
  shouldGenerateSchemas: boolean;
  shouldGenerateInterfaces: boolean;
  shouldGenerateApis: boolean;
  pathClassification: {
    outputPrefix: string;
    commonPrefix: string;
    maxDepth: number;
  };

  // ---- 共享可变状态 ----
  genericBaseTypes: Map<string, string>;
  genericInfoMap: Map<string, ApifoxGenericMeta>;

  // ---- 输出累加器 ----
  schemas: Record<string, SchemaDefinition>;
  interfaces: Record<string, string>;
  apis: ApiDefinition[];

  // ---- 日志 ----
  logger: AdapterLogger;
}

// ===================================================================================
// 关键 AST 节点集合
// ===================================================================================

interface KeyASTNodes {
  pathsNode?: ts.InterfaceDeclaration;
  operationsNode?: ts.InterfaceDeclaration;
  componentsNode?: ts.InterfaceDeclaration;
}

// ===================================================================================
// 提取器集合
// ===================================================================================

interface Extractors {
  schemaExtractor: SchemaExtractor;
  interfaceGenerator: InterfaceGenerator;
  parameterExtractor: ParameterExtractor;
  requestResponseExtractor: RequestResponseExtractor;
  apiExtractor: ApiExtractor;
}

// ===================================================================================
// 默认 fetch 超时时间（毫秒）
// ===================================================================================

const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

// ===================================================================================
// OpenAPI 适配器
// ===================================================================================

/**
 * OpenAPI 适配器
 *
 * 该适配器负责将 OpenAPI 文档转换为标准输出格式。
 * 它使用 openapi-typescript 将 OpenAPI 转换为 TypeScript AST，
 * 然后遍历 AST 提取 Schema、Interface 和 API 定义。
 *
 * 处理流程:
 * 1. 加载原始文档（仅一次）
 * 2. 调用 openapi-typescript 获取 TypeScript AST（复用已加载文档，避免二次抓取）
 * 3. 遍历 AST 提取类型信息
 * 4. 转换为标准格式
 */
export class OpenAPIAdapter implements IAdapter<OpenAPIOptions, InputSource> {
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
    // 1. 构建 logger
    const sourceLabel = describeSource(source);
    const logger = createAdapterLogger(options, {
      adapter: 'openapi',
      source: sourceLabel,
    });

    // 2. 先加载原始文档（仅一次，后续传给 openapiTS 避免二次抓取）
    const rawDocument = await loadRawDocument(
      source,
      logger,
      options?.fetchTimeoutMs,
    );

    // 3. 使用 openapi-typescript 生成 TypeScript AST
    //    如果成功加载了原始文档，直接传入对象（避免二次 fetch/parse）
    //    否则回退到原始 source（让 openapiTS 自行处理）
    const astSource: InputSource | OpenAPIDocument = rawDocument ?? source;
    const ast = await openapiTS(astSource as InputSource, {
      transform: options?.transform,
    });

    // 4. 构建 per-parse 上下文
    const ctx = buildParseContext(options, logger);

    // 5. 预处理泛型信息（从 x-apifox-generic 元数据中提取）
    preprocessGenericInfo(rawDocument, ctx);

    // 6. 构建提取器（每次 parse 独立实例，无共享状态）
    const extractors = buildExtractors(ctx);

    // 7. 查找关键 AST 节点
    const nodes = findKeyNodes(ast);

    // 8. 执行提取
    runExtraction(nodes, extractors, ctx);

    // 9. 返回标准格式
    return {
      schemas: ctx.schemas,
      interfaces: ctx.interfaces,
      apis: ctx.apis,
      metadata: buildMetadata(source, options, rawDocument),
    };
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

// ===================================================================================
// 纯函数：输入源描述
// ===================================================================================

function describeSource(source: InputSource): string {
  if (typeof source === 'string') return source;
  if (source instanceof URL) return source.toString();
  if (Buffer.isBuffer(source)) return 'buffer';
  if (typeof source === 'object' && source !== null && 'read' in source)
    return 'stream';
  return 'object';
}

// ===================================================================================
// 纯函数：构建 per-parse 上下文
// ===================================================================================

function buildParseContext(
  options: OpenAPIOptions | undefined,
  logger: AdapterLogger,
): ParseContext {
  const pathClassificationOpts = options?.pathClassification || {};
  const codeGenOpts = options?.codeGeneration || {};
  const outputOpts = codeGenOpts.output || {};

  return {
    namingStyle: codeGenOpts.parameterNamingStyle || 'PascalCase',
    interfaceExportMode: codeGenOpts.interfaceExportMode || 'export',
    shouldGenerateSchemas: outputOpts.schemas !== false,
    shouldGenerateInterfaces: outputOpts.interfaces !== false,
    shouldGenerateApis: outputOpts.apis !== false,
    pathClassification: {
      outputPrefix: pathClassificationOpts.outputPrefix || 'api',
      commonPrefix: pathClassificationOpts.commonPrefix || '',
      maxDepth: pathClassificationOpts.maxDepth || 2,
    },
    genericBaseTypes: new Map(),
    genericInfoMap: new Map(),
    schemas: {},
    interfaces: {},
    apis: [],
    logger,
  };
}

// ===================================================================================
// 纯函数：预处理泛型信息
// ===================================================================================

function preprocessGenericInfo(
  rawDocument: OpenAPIDocument | null,
  ctx: ParseContext,
): void {
  const components = rawDocument?.components as
    | { schemas?: Record<string, Record<string, unknown>> }
    | undefined;
  if (!components?.schemas) return;

  for (const [key, schema] of Object.entries(components.schemas)) {
    const meta = schema['x-apifox-generic'] as ApifoxGenericMeta | undefined;
    if (
      meta &&
      typeof meta.baseType === 'string' &&
      Array.isArray(meta.generics) &&
      meta.generics.every((g) => typeof g === 'string')
    ) {
      ctx.genericInfoMap.set(key, meta);
    }
  }
}

// ===================================================================================
// 纯函数：构建提取器
// ===================================================================================

function buildExtractors(ctx: ParseContext): Extractors {
  const pathClassifier = new PathClassifier(ctx.pathClassification);
  const genericDetector = new GenericDetector();

  const schemaExtractor = new SchemaExtractor(
    ctx.genericBaseTypes,
    ctx.namingStyle,
  );
  const interfaceGenerator = new InterfaceGenerator(
    ctx.genericBaseTypes,
    ctx.interfaceExportMode,
    ctx.genericInfoMap,
    ctx.namingStyle,
  );
  const requestResponseExtractor = new RequestResponseExtractor(
    genericDetector,
    ctx.genericBaseTypes,
    ctx.genericInfoMap,
    ctx.namingStyle,
    ctx.interfaceExportMode,
    schemaExtractor,
    ctx.schemas,
    interfaceGenerator,
    ctx.interfaces,
  );
  const parameterExtractor = new ParameterExtractor(
    ctx.namingStyle,
    ctx.shouldGenerateSchemas,
    ctx.shouldGenerateInterfaces,
    schemaExtractor,
    interfaceGenerator,
  );
  const apiExtractor = new ApiExtractor(
    pathClassifier,
    parameterExtractor,
    requestResponseExtractor,
  );

  return {
    schemaExtractor,
    interfaceGenerator,
    parameterExtractor,
    requestResponseExtractor,
    apiExtractor,
  };
}

// ===================================================================================
// 纯函数：查找关键 AST 节点
// ===================================================================================

function findKeyNodes(ast: ts.Node[]): KeyASTNodes {
  const result: KeyASTNodes = {};

  for (const node of ast) {
    if (!ts.isInterfaceDeclaration(node)) continue;
    const name = node.name.text;

    if (name === 'paths') result.pathsNode = node;
    else if (name === 'operations') result.operationsNode = node;
    else if (name === 'components') result.componentsNode = node;

    // 早期退出：找到全部三个节点即可
    if (result.pathsNode && result.operationsNode && result.componentsNode) {
      break;
    }
  }

  return result;
}

// ===================================================================================
// 纯函数：执行提取
// ===================================================================================

function runExtraction(
  nodes: KeyASTNodes,
  extractors: Extractors,
  ctx: ParseContext,
): void {
  const { pathsNode, operationsNode, componentsNode } = nodes;
  const {
    apiExtractor,
    parameterExtractor,
    schemaExtractor,
    interfaceGenerator,
  } = extractors;

  // 提取 APIs（优先，以便检测泛型并生成参数 Schema）
  if (pathsNode) {
    if (ctx.shouldGenerateApis) {
      apiExtractor.extractAPIs(
        pathsNode,
        operationsNode,
        ctx.apis,
        ctx.schemas,
        ctx.interfaces,
      );
    } else {
      // 即使不生成 APIs，也需要提取参数接口
      parameterExtractor.extractParametersOnly(
        pathsNode,
        operationsNode,
        ctx.schemas,
        ctx.interfaces,
      );
    }
  }

  // 提取 schemas
  if (componentsNode && ctx.shouldGenerateSchemas) {
    schemaExtractor.extractSchemas(
      componentsNode,
      ctx.schemas,
      ctx.genericInfoMap,
    );
  }

  // 提取 interfaces
  if (componentsNode && ctx.shouldGenerateInterfaces) {
    interfaceGenerator.generateInterfaceCode(componentsNode, ctx.interfaces);
  }
}

// ===================================================================================
// 原始文档加载（仅抓取一次）
// ===================================================================================

/**
 * 加载原始 OpenAPI 文档（JSON/YAML 解析 + 校验）。
 * 如果失败，返回 null（仅记录 warn，不阻断主流程）。
 *
 * 该函数仅用于 metadata 提取。主流程 (openapiTS) 会复用其结果以避免二次抓取。
 */
async function loadRawDocument(
  source: InputSource,
  logger: AdapterLogger,
  fetchTimeoutMs?: number,
): Promise<OpenAPIDocument | null> {
  try {
    const doc = await loadDocument(source, fetchTimeoutMs);
    if (!isValidOpenAPIDocument(doc)) {
      logger.warn(
        'Loaded document does not look like a valid OpenAPI object.',
        {
          code: 'OPENAPI_METADATA_INVALID_SHAPE',
          typeofResult: typeof doc,
        },
      );
      return null;
    }
    return doc;
  } catch (error) {
    logger.warn(
      'Failed to load raw OpenAPI document for metadata extraction.',
      {
        code: 'OPENAPI_METADATA_LOAD_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    );
    return null;
  }
}

/**
 * 校验加载结果是否为合法的 OpenAPI 文档对象。
 */
function isValidOpenAPIDocument(doc: unknown): doc is OpenAPIDocument {
  return typeof doc === 'object' && doc !== null && !Array.isArray(doc);
}

/**
 * 根据输入源类型加载文档。
 */
async function loadDocument(
  source: InputSource,
  fetchTimeoutMs?: number,
): Promise<unknown> {
  // 1. URL 对象
  if (source instanceof URL) {
    if (source.protocol.startsWith('http')) {
      return fetchWithTimeout(source, fetchTimeoutMs);
    }
    if (source.protocol === 'file:') {
      const { fileURLToPath } = await import('node:url');
      return readAndParseFile(fileURLToPath(source));
    }
    throw new Error(`Unsupported URL protocol: ${source.protocol}`);
  }

  // 2. Buffer
  if (Buffer.isBuffer(source)) {
    return parseContent(source.toString('utf-8'));
  }

  // 3. 字符串 (URL, 文件路径, 或 内容)
  if (typeof source === 'string') {
    return loadFromString(source, fetchTimeoutMs);
  }

  // 4. 对象 (已经是 JSON 对象，排除 Stream)
  if (
    typeof source === 'object' &&
    source !== null &&
    !('read' in source) &&
    !('getReader' in source)
  ) {
    return source;
  }

  // 5. Stream — 已被 openapiTS 消费或无法二次读取
  throw new Error('Cannot re-read Stream input for metadata extraction.');
}

/**
 * 处理字符串输入（URL / 文件路径 / 内联内容）
 *
 * 判断顺序：
 * 1. 显式 http(s):// URL → 远程拉取
 * 2. 具有明显内联内容特征（多行 / 以 { 开头 / 含 openapi: 或 swagger: 关键字）→ 作为内容解析
 * 3. 看起来像文件路径（含路径分隔符或常见文档扩展名）→ 作为文件读取
 * 4. 以上皆不符合 → 最后一次尝试作为内容解析
 *
 * 第 3 步使用较强前置条件，避免对纯单词类输入（如 "users"）发起意外的磁盘 IO。
 */
async function loadFromString(
  source: string,
  fetchTimeoutMs?: number,
): Promise<unknown> {
  // 1. 远程 URL
  if (/^https?:\/\//i.test(source)) {
    return fetchWithTimeout(source, fetchTimeoutMs);
  }

  // 2. 显式的内容特征（多行, 或以 { 开头, 或包含 openapi/swagger 关键字）
  if (
    source.includes('\n') ||
    source.trim().startsWith('{') ||
    source.includes('openapi:') ||
    source.includes('swagger:')
  ) {
    try {
      return parseContent(source);
    } catch {
      // 解析失败，可能是奇怪的文件路径，继续尝试作为文件读取
    }
  }

  // 3. 文件路径前置检查：必须像真正的路径（含分隔符或以常见文档扩展名结尾）
  const looksLikeFilePath =
    source.length < 4096 &&
    (source.includes('/') ||
      source.includes('\\') ||
      /\.(ya?ml|json)$/i.test(source));

  if (looksLikeFilePath) {
    try {
      return await readAndParseFile(source);
    } catch (fileError) {
      // 4. 文件读取失败，最后尝试一次作为内容解析（处理不明显的单行内容）
      try {
        return parseContent(source);
      } catch {
        throw fileError;
      }
    }
  }

  // 5. 完全不像路径，直接尝试作为内容解析
  try {
    return parseContent(source);
  } catch {
    throw new Error(
      `Input string does not look like a URL, file path, or inline OpenAPI content: ${source.slice(0, 80)}`,
    );
  }
}

/**
 * 带超时的 fetch。
 */
async function fetchWithTimeout(
  url: string | URL,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<unknown> {
  // 验证 timeoutMs 是否为有效的正数
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(
      `fetchTimeoutMs must be a positive number, got ${timeoutMs}`,
    );
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenAPI document: ${response.status} ${response.statusText}`,
    );
  }
  const text = await response.text();
  return parseContent(text);
}

/**
 * 从文件读取并解析。
 */
async function readAndParseFile(filePath: string): Promise<unknown> {
  let targetPath = filePath;
  if (targetPath.startsWith('file://')) {
    const { fileURLToPath } = await import('node:url');
    targetPath = fileURLToPath(targetPath);
  }
  const fs = await import('node:fs/promises');
  const text = await fs.readFile(targetPath, 'utf-8');
  return parseContent(text);
}

/**
 * 解析内容 (JSON 或 YAML)。
 * 包含基础校验，确保返回值为合法对象。
 */
function parseContent(text: string): unknown {
  // 优先尝试 JSON
  try {
    return JSON.parse(text);
  } catch {
    // 失败后尝试 YAML
  }

  const yamlResult = loadYaml(text);

  // YAML 可能返回 string / number / null 等非对象值，必须校验
  if (typeof yamlResult !== 'object' || yamlResult === null) {
    const preview = text.length > 80 ? `${text.slice(0, 80)}...` : text;
    throw new Error(
      `Failed to parse content as JSON or YAML object (got ${typeof yamlResult}). Input preview: ${JSON.stringify(preview)}`,
    );
  }

  return yamlResult;
}

// ===================================================================================
// 元数据构建（含敏感信息净化）
// ===================================================================================

/**
 * 构建元数据。
 * 注意：options 在写入前经过 sanitizeOptions 净化，移除 token / apiKey 等敏感键。
 * 可通过 debug.skipMetadataSanitization 选项跳过清理（仅用于调试）。
 */
function buildMetadata(
  source: InputSource,
  options: OpenAPIOptions | undefined,
  rawDocument?: OpenAPIDocument | null,
): Metadata | null {
  const skipSanitization = options?.debug?.skipMetadataSanitization === true;

  const metadata: Metadata = {
    generatedAt: new Date().toISOString(),
    source: typeof source === 'string' ? source : undefined,
    options: skipSanitization ? options : sanitizeOptions(options),
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
