import { BaseAdapter, type InputSource, type AdapterOptions } from '../base'
import type { StandardOutput, Metadata, OpenAPIOptions } from '../../types'
import { FileReader } from '../../utils/file-reader'
import { SchemaTransformer } from './schema-transformer'
import { PathTransformer } from './path-transformer'
import { GenericDetector } from './generic-detector'

/**
 * OpenAPI 适配器
 * 负责解析 OpenAPI 3.0/3.1 规范
 */
export class OpenAPIAdapter extends BaseAdapter {
  async parse(source: InputSource, options?: AdapterOptions): Promise<StandardOutput> {
    const openapiOptions = (options || {}) as OpenAPIOptions

    // 1. 读取源文件
    const openapi = await FileReader.read(source)

    // 2. 验证格式
    if (!this.isOpenAPI(openapi)) {
      throw new Error('Invalid OpenAPI specification')
    }

    // 3. 创建转换器
    const schemaTransformer = new SchemaTransformer(openapi)
    const pathTransformer = new PathTransformer(openapi, {
      commonPrefix: openapiOptions.commonPrefix,
      maxDepth: openapiOptions.maxClassificationDepth,
    })
    const genericDetector = new GenericDetector(openapi, {
      genericWrappers: openapiOptions.genericWrappers,
    })

    // 4. 转换 schemas
    const schemas = schemaTransformer.transform(openapi.components?.schemas || {})

    // 5. 检测泛型并更新 schemas
    const genericResults = genericDetector.detectBatch(openapi.components?.schemas || {})
    for (const [name, result] of Object.entries(genericResults)) {
      if (result.isGeneric && schemas[name]) {
        schemas[name].isGeneric = true
        schemas[name].genericParam = result.genericParam
        schemas[name].baseType = result.baseType
        schemas[name].type = 'generic'
      }
    }

    // 6. 转换 APIs
    const apis = pathTransformer.transform(openapi.paths || {})

    // 7. 生成元数据
    const metadata = this.generateMetadata(openapi, openapiOptions)

    return {
      schemas,
      apis,
      metadata,
    }
  }

  async validate(source: InputSource): Promise<boolean> {
    try {
      const content = await FileReader.read(source)
      return this.isOpenAPI(content)
    } catch {
      return false
    }
  }

  /**
   * 检查是否为 OpenAPI 格式
   */
  private isOpenAPI(content: any): boolean {
    return (
      typeof content === 'object' &&
      (content.openapi !== undefined || content.swagger !== undefined)
    )
  }

  /**
   * 生成元数据
   */
  private generateMetadata(openapi: any, options: OpenAPIOptions): Metadata {
    return {
      version: openapi.openapi || openapi.swagger,
      title: openapi.info?.title,
      description: openapi.info?.description,
      baseUrl: openapi.servers?.[0]?.url,
      commonPrefix: options.commonPrefix,
      generatedAt: new Date().toISOString(),
      servers: openapi.servers?.map((server: any) => ({
        url: server.url,
        description: server.description,
        variables: server.variables,
      })),
    }
  }
}
