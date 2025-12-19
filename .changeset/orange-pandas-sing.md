---
'api-codegen-universal': minor
---

- feat: schema definition 新增 extends 字段以支持继承关系
- feat: 新增 naming utils 工具类用于统一命名风格转换
- feat: 优化 schema 提取逻辑，支持交叉类型继承和 jsdoc 解析重构
- refactor: 应用 naming utils 实现全局命名风格统一，并修复 oneof 类型处理
