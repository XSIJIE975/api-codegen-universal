---
'api-codegen-universal': patch
---

修复 `typeNamePrefix` 与命名大小写规整的顺序缺陷：前缀化改为逐段 PascalCase 规整

启用 `codeGeneration.typeNamePrefix` 时，前缀原先直接与原始 schema 名拼接成整串，再统一做一次命名风格转换；而整串转换只会将首字母大写，因此以小写字母开头的原始名会产出大小写畸形的声明名。以配置前缀 `Demo` 为例：

- 原始名 `key` → `Demokey`（期望 `DemoKey`），并连带生成 `declare type Demokey = Record<string, never>` 与拆分文件 `Demokey.d.ts`；
- 原始名 `key1` → `Demokey1`（期望 `DemoKey1`）。

声明名、`separateTypes` 拆分的文件名与 `$ref` 互引三处使用同一名字，因此三处一致地错。

修复后，前缀按 `PascalCase(prefix) + PascalCase(rawName)` 逐段规整后再拼接：

- `key` → `DemoKey`，`key1` → `DemoKey1`，`pageDTO` → `DemoPageDTO`；
- 已是 PascalCase 的名称结果不变（幂等），如 `UserProfileSaveDTO` → `DemoUserProfileSaveDTO`；
- 组件 schema、`schemaNameMap` / `genericInfoMap` 键、泛型基名与泛型参数、operationId/哈希派生的内联声明名全部经由同一处 `applyTypeNamePrefix` 收敛，声明名、拆分文件名与 `$ref` 互引保持一致；
- 不配置 `typeNamePrefix` 时输出逐字节不变；已带前缀的输入名仍跳过加前缀，不产生双重前缀。
