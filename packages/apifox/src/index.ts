// src/adapters/apifox/index.ts

import type { IAdapter, AdapterOptions, StandardOutput } from '@api-codegen-universal/core';
import type { ApifoxConfig, ApifoxApiDetail, ApifoxDataSchema, ApifoxApiResponse } from './types';
import { SchemaIdResolver, PathClassifier } from './utils';
import { ApifoxParser, type ParsingContext } from './parser';

export interface ApifoxAdapterOptions extends AdapterOptions {
  /** 输出路径分类配置 */
  pathClassification?: {
    outputPrefix?: string;
    commonPrefix?: string;
    maxDepth?: number;
  };
  /** 代码生成配置 */
  codeGeneration?: {
    /** 参数接口命名风格 (默认 PascalCase) */
    parameterNamingStyle?: 'PascalCase' | 'camelCase' | 'snake_case' | 'kebab-case';
    output?: {
      schemas?: boolean;
      interfaces?: boolean;
      apis?: boolean;
    };
  };
}

export class ApifoxAdapter implements IAdapter<ApifoxAdapterOptions, ApifoxConfig> {
  
  /**
   * 验证配置源是否有效
   */
  async validate(source: ApifoxConfig): Promise<boolean> {
    return !!(source && source.projectId && source.token);
  }

  /**
   * 解析主入口
   */
  async parse(source: ApifoxConfig, options: ApifoxAdapterOptions = {}): Promise<StandardOutput> {
    // 1. 远程获取数据
    const { apiDetails, dataSchemas } = await this.fetchApifoxData(source);

    // 2. 初始化工具和解析器
    const pathOptions = options.pathClassification || {};
    const classifier = new PathClassifier({
      outputPrefix: pathOptions.outputPrefix,
      commonPrefix: pathOptions.commonPrefix,
      maxDepth: pathOptions.maxDepth
    });
    
    const resolver = new SchemaIdResolver(dataSchemas);
    const parser = new ApifoxParser(resolver, classifier);

    const result: StandardOutput = {
      schemas: {},
      interfaces: {},
      apis: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        source: `Apifox Project: ${source.projectId}`,
        title: 'Apifox Generated API'
      }
    };

    const codeGenOpts = options.codeGeneration || {};
    const shouldGenSchemas = codeGenOpts.output?.schemas !== false;
    const shouldGenInterfaces = codeGenOpts.output?.interfaces !== false;
    const shouldGenApis = codeGenOpts.output?.apis !== false;
    const namingStyle = codeGenOpts.parameterNamingStyle || 'PascalCase';

    // 3. 解析 Data Schemas (实体类)
    if (shouldGenSchemas || shouldGenInterfaces) {
      for (const rawSchema of dataSchemas) {
        const schemaDef = parser.parseSchema(rawSchema.jsonSchema, rawSchema.name);
        if (rawSchema.description) {
          schemaDef.description = rawSchema.description;
        }

        if (shouldGenSchemas) {
          result.schemas[rawSchema.name] = schemaDef;
        }

        if (shouldGenInterfaces) {
          result.interfaces[rawSchema.name] = parser.generateInterfaceCode(schemaDef);
        }
      }
    }

    // 4. 构造解析上下文，用于在解析 API 过程中动态添加参数 Schema
    const context: ParsingContext = {
      schemas: result.schemas,
      interfaces: result.interfaces,
      shouldGenerateSchemas: shouldGenSchemas,
      shouldGenerateInterfaces: shouldGenInterfaces,
      namingStyle: namingStyle
    };

    // 5. 解析 API Endpoints
    if (shouldGenApis) {
      for (const rawApi of apiDetails) {
        // Apifox 中 status 为 released 才是已发布
        // 如果你需要导出所有，可以注释掉这行
        if (rawApi.status === 'released' || rawApi.status === 'tested') { 
            const apiDef = parser.parseApi(rawApi, context);
            result.apis.push(apiDef);
        }
      }
    }

    return result;
  }

  /**
   * 从 Apifox 开放 API 拉取数据
   */
  private async fetchApifoxData(config: ApifoxConfig): Promise<{ apiDetails: ApifoxApiDetail[], dataSchemas: ApifoxDataSchema[] }> {
    const baseUrl = 'https://api.apifox.com/api/v1';
    const headers = {
      'Authorization': `Bearer ${config.token}`,
      'X-Apifox-Api-Version': config.apiVersion || '2025-09-01',
      'x-project-id': config.projectId
    };

    try {
      // 并行请求两个接口
      const [schemasRes, detailsRes] = await Promise.all([
        fetch(`${baseUrl}/projects/${config.projectId}/data-schemas`, { headers }),
        fetch(`${baseUrl}/api-details`, { headers })
      ]);

      if (!schemasRes.ok) throw new Error(`Fetch Schemas Failed: ${schemasRes.status} ${schemasRes.statusText}`);
      if (!detailsRes.ok) throw new Error(`Fetch API Details Failed: ${detailsRes.status} ${detailsRes.statusText}`);

      const schemasJson = await schemasRes.json() as ApifoxApiResponse<ApifoxDataSchema[]>;
      const detailsJson = await detailsRes.json() as ApifoxApiResponse<ApifoxApiDetail[]>;

      if (!schemasJson.success) throw new Error(`Apifox Schemas Error: ${schemasJson.message}`);
      if (!detailsJson.success) throw new Error(`Apifox Details Error: ${detailsJson.message}`);

      return {
        apiDetails: detailsJson.data,
        dataSchemas: schemasJson.data
      };
    } catch (error) {
      console.error('Error fetching data from Apifox:', error);
      throw error;
    }
  }
}