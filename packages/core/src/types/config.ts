/**
 * 命名风格
 * 用于控制生成的代码中的变量、类、接口等名称的格式
 *
 * - PascalCase: 大驼峰 (如 UserProfile) - 通常用于类名、接口名
 * - camelCase: 小驼峰 (如 userProfile) - 通常用于变量名、属性名
 * - snake_case: 下划线 (如 user_profile) - 某些特定场景使用
 */
export type NamingStyle = 'PascalCase' | 'camelCase' | 'snake_case';
