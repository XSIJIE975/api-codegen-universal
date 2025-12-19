import type { NamingStyle } from '@api-codegen-universal/core';

export class NamingUtils {
  private static readonly splitRegex = /[_-]/;

  /**
   * 转换为指定的命名风格
   * 支持 PascalCase, camelCase, snake_case
   *
   * @param name 原始名称
   * @param style 目标风格
   * @returns 转换后的名称
   */
  static convert(name: string, style: NamingStyle): string {
    if (!name) return name;

    switch (style) {
      case 'PascalCase':
        // AuthController_register_Query_Params -> AuthControllerRegisterQueryParams
        return name
          .split(this.splitRegex)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join('');

      case 'camelCase': {
        // AuthController_register_Query_Params -> authControllerRegisterQueryParams
        const parts = name.split(this.splitRegex).filter((p) => p.length > 0);
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
      }

      case 'snake_case':
        // AuthController_register_Query_Params -> auth_controller_register_query_params
        // UserDto -> user_dto
        // APIResponse -> api_response
        return name
          .replace(/([a-z])([A-Z])/g, '$1_$2')
          .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
          .toLowerCase()
          .replace(/^_/, '')
          .replace(/_+/g, '_');

      default:
        return name;
    }
  }
}
