import type { IAdapter, AdapterOptions, StandardOutput } from '@api-codegen-universal/core';
import type { ApifoxSource } from './types';
import { SchemaIdResolver, PathClassifier } from './utils';
import { ApifoxParser } from './parser';

export interface ApifoxAdapterOptions extends AdapterOptions {
  /** 输出路径分类配置 */
  pathClassification?: {
    outputPrefix?: string;
    commonPrefix?: string;
    maxDepth?: number;
  };
  /** 代码生成配置 */
  codeGeneration?: {
    parameterNamingStyle?: 'PascalCase' | 'camelCase';
    output?: {
      schemas?: boolean;
      interfaces?: boolean;
      apis?: boolean;
    };
  };
}

export class ApifoxAdapter implements IAdapter<ApifoxAdapterOptions, ApifoxSource> {
  
  async validate(source: ApifoxSource): Promise<boolean> {
    return !!(
      source && 
      Array.isArray(source.apiDetails) && 
      Array.isArray(source.dataSchemas)
    );
  }

  async parse(source: ApifoxSource, options: ApifoxAdapterOptions = {}): Promise<StandardOutput> {
    // 1. 初始化工具
    const pathOptions = options.pathClassification || {};
    const classifier = new PathClassifier({
      outputPrefix: pathOptions.outputPrefix,
      commonPrefix: pathOptions.commonPrefix,
      maxDepth: pathOptions.maxDepth
    });
    
    const resolver = new SchemaIdResolver(source.dataSchemas);
    const parser = new ApifoxParser(resolver, classifier);

    const result: StandardOutput = {
      schemas: {},
      interfaces: {},
      apis: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        source: 'Apifox',
        title: 'Apifox Generated API'
      }
    };

    const codeGenOpts = options.codeGeneration?.output || {};
    const shouldGenSchemas = codeGenOpts.schemas !== false;
    const shouldGenInterfaces = codeGenOpts.interfaces !== false;
    const shouldGenApis = codeGenOpts.apis !== false;

    // 2. 解析 Schemas (Data Models)
    if (shouldGenSchemas || shouldGenInterfaces) {
      for (const rawSchema of source.dataSchemas) {
        // 解析为标准 SchemaDefinition
        const schemaDef = parser.parseSchema(rawSchema.jsonSchema, rawSchema.name);
        
        // Apifox 特有的 description 在外层
        if (rawSchema.description) {
          schemaDef.description = rawSchema.description;
        }

        if (shouldGenSchemas) {
          result.schemas[rawSchema.name] = schemaDef;
        }

        if (shouldGenInterfaces) {
          // 生成 TypeScript 字符串
          result.interfaces[rawSchema.name] = parser.generateInterfaceCode(schemaDef);
        }
      }
    }

    // 3. 解析 API Endpoints
    if (shouldGenApis) {
      for (const rawApi of source.apiDetails) {
        if (rawApi.status !== 'released') continue; // 可选：只处理已发布的接口
        const apiDef = parser.parseApi(rawApi);
        result.apis.push(apiDef);
      }
    }

    return result;
  }
}