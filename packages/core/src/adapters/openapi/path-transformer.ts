import type {
  ApiDefinition,
  HttpMethod,
  ParameterDefinition,
  RequestBodyDefinition,
  ResponseDefinition,
  MediaTypeDefinition,
  SchemaReference,
} from '../../types'
import { RefResolver } from '../../utils/ref-resolver'
import { PathClassifier, type PathClassifierOptions } from './path-classifier'

/**
 * Path 转换器
 * 负责将 OpenAPI paths 转换为标准格式
 */
export class PathTransformer {
  private refResolver: RefResolver
  private pathClassifier: PathClassifier

  constructor(schema: any, options?: PathClassifierOptions) {
    this.refResolver = new RefResolver(schema)
    this.pathClassifier = new PathClassifier(options)
  }

  /**
   * 转换所有 paths
   */
  transform(paths: Record<string, any>): ApiDefinition[] {
    const apis: ApiDefinition[] = []

    for (const [path, pathItem] of Object.entries(paths)) {
      // 遍历每个 HTTP 方法
      for (const [method, operation] of Object.entries(pathItem)) {
        // 过滤非 HTTP 方法的字段
        if (!this.isHttpMethod(method)) {
          continue
        }

        const api = this.transformOperation(path, method as HttpMethod, operation)
        apis.push(api)
      }
    }

    return apis
  }

  /**
   * 转换单个 operation
   */
  private transformOperation(
    path: string,
    method: HttpMethod,
    operation: any
  ): ApiDefinition {
    return {
      path,
      method,
      operationId: operation.operationId || this.generateOperationId(method, path),
      summary: operation.summary,
      description: operation.description,
      tags: operation.tags,
      deprecated: operation.deprecated || false,
      parameters: this.transformParameters(operation.parameters),
      requestBody: this.transformRequestBody(operation.requestBody),
      responses: this.transformResponses(operation.responses),
      category: this.pathClassifier.classify(path),
    }
  }

  /**
   * 转换参数
   */
  private transformParameters(parameters?: any[]): ParameterDefinition[] | undefined {
    if (!parameters || parameters.length === 0) {
      return undefined
    }

    return parameters.map(param => {
      // 解析引用
      const actualParam = RefResolver.isRef(param)
        ? this.refResolver.resolve(param.$ref)
        : param

      return {
        name: actualParam.name,
        in: actualParam.in,
        required: actualParam.required || actualParam.in === 'path', // path 参数默认必填
        schema: this.transformSchemaReference(actualParam.schema),
        description: actualParam.description,
        deprecated: actualParam.deprecated,
        example: actualParam.example,
      }
    })
  }

  /**
   * 转换请求体
   */
  private transformRequestBody(requestBody?: any): RequestBodyDefinition | undefined {
    if (!requestBody) {
      return undefined
    }

    // 解析引用
    const actualBody = RefResolver.isRef(requestBody)
      ? this.refResolver.resolve(requestBody.$ref)
      : requestBody

    return {
      required: actualBody.required || false,
      description: actualBody.description,
      content: this.transformContent(actualBody.content),
    }
  }

  /**
   * 转换响应
   */
  private transformResponses(responses: any): Record<string, ResponseDefinition> {
    const result: Record<string, ResponseDefinition> = {}

    for (const [statusCode, response] of Object.entries<any>(responses)) {
      // 解析引用
      const actualResponse = RefResolver.isRef(response)
        ? this.refResolver.resolve(response.$ref)
        : response

      result[statusCode] = {
        description: actualResponse.description || '',
        content: actualResponse.content
          ? this.transformContent(actualResponse.content)
          : undefined,
        headers: actualResponse.headers
          ? this.transformHeaders(actualResponse.headers)
          : undefined,
      }
    }

    return result
  }

  /**
   * 转换内容类型
   */
  private transformContent(content: any): Record<string, MediaTypeDefinition> {
    const result: Record<string, MediaTypeDefinition> = {}

    for (const [mediaType, mediaTypeObj] of Object.entries<any>(content)) {
      result[mediaType] = {
        schema: this.transformSchemaReference(mediaTypeObj.schema),
        example: mediaTypeObj.example,
        examples: mediaTypeObj.examples,
      }
    }

    return result
  }

  /**
   * 转换响应头
   */
  private transformHeaders(headers: any): Record<string, any> {
    const result: Record<string, any> = {}

    for (const [headerName, header] of Object.entries<any>(headers)) {
      const actualHeader = RefResolver.isRef(header)
        ? this.refResolver.resolve(header.$ref)
        : header

      result[headerName] = {
        description: actualHeader.description,
        schema: this.transformSchemaReference(actualHeader.schema),
        required: actualHeader.required,
        deprecated: actualHeader.deprecated,
      }
    }

    return result
  }

  /**
   * 转换 Schema 引用
   */
  private transformSchemaReference(schema: any): SchemaReference {
    if (!schema) {
      return { type: 'inline', schema: undefined }
    }

    if (RefResolver.isRef(schema)) {
      return {
        type: 'ref',
        ref: schema.$ref,
      }
    }

    return {
      type: 'inline',
      schema: undefined, // 这里可以内联转换 schema，暂时简化处理
    }
  }

  /**
   * 检查是否为 HTTP 方法
   */
  private isHttpMethod(method: string): boolean {
    const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']
    return httpMethods.includes(method.toLowerCase())
  }

  /**
   * 生成 operationId
   */
  private generateOperationId(method: HttpMethod, path: string): string {
    const cleanPath = path.replace(/\{|\}/g, '').replace(/\//g, '_')
    return `${method.toLowerCase()}${cleanPath}`
  }
}
