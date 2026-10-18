# bookstore-shared — 跨仓库契约验证

三个仓库拆分后，「两套软件的同步实现不一致」成了最大的风险（设计文档第七部分）。
这个仓库就是那条防线：**用可执行的脚本证明 TS 与 Dart 对同一份数据的理解完全一致。**

## 为什么单独一个仓库

契约验证需要**同时读取两个仓库的源码**：

```
book_store/
├── mylibrary/       ← TS 侧：数据契约的参考实现
├── ebook-studio/    ← Dart 侧：契约的镜像实现
└── shared/          ← 本仓库：比对两者
```

它不属于任何一方——放进 `mylibrary` 会让那个仓库多一个对 Dart 的依赖，
放进 `ebook-studio` 又需要 Node 环境。独立成仓库最干净。

## 两个脚本

### `scripts/verify-contract.mjs` — 字段级契约

对比 TS 的 `src/types.ts` 与 Dart 的 `fromJson`，验证设计文档第一部分定义的
**51 个关键字段**两侧都存在。

```
✓ TS 侧：51 个关键字段齐全（共 75 个字段）
✓ Dart 侧：51 个关键字段齐全（共 53 个 JSON 键）
✓ 契约一致
```

### `scripts/cross-check.mjs` — 语义级契约

用**相同输入**跑 TS 侧的合并实现，逐条比对 Dart 测试里的期望值，
验证 16 项合并规则两侧结论相同：

| 规则 | 设计文档 |
|---|---|
| 版本对比（download / none / upload） | 1.8.1 |
| 书籍并集、字段并集 | 1.8.2 |
| `reading_position` 按 `updated_at` 决胜 | 1.8.2 |
| `held_by` 并集 + `last_seen` 降序 | 1.8.2 |
| `sync_state` 五维度择优 | 1.4 |
| 同步请求队列 | 1.8.4 |
| 四种删除语义 | 1.8.5 |

```
结果：16 通过，0 失败
✓ TS 与 Dart 的合并语义完全一致
```

## 用法

```bash
# 1. 先构建 mylibrary（脚本读取 dist/）
cd ../mylibrary && pnpm install && pnpm run build

# 2. 跑验证
cd ../shared
node scripts/verify-contract.mjs
node scripts/cross-check.mjs

# 或一次跑完
npm run check
```

### 仓库不在同级目录时

用环境变量指定：

```bash
MYLIBRARY_ROOT=/path/to/mylibrary \
EBOOK_STUDIO_ROOT=/path/to/ebook-studio \
node scripts/verify-contract.mjs
```

## 什么时候会失败

这是它的价值所在——以下情况脚本会报错：

- 有人给 `types.ts` 加字段但没同步 Dart 的 `fromJson`
- 有人改了 `mergeLibraries` 的规则，Dart 侧没跟上
- 字段改名、删除、类型变更
- 删除语义或同步请求格式调整

CI 里配了自动运行（见 `.github/workflows/ci.yml`），需要把三个仓库都 checkout 到同级目录。
