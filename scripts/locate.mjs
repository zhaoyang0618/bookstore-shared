/**
 * 跨语言契约验证（设计文档 4.3「接口是契约，实现是自由的」的可执行保证）。
 *
 * 两个脚本都需要同时检出 mylibrary 与 ebook-studio：
 *
 *   book_store/
 *   ├── mylibrary/       ← TS 侧（数据契约参考实现）
 *   ├── ebook-studio/    ← Dart 侧（契约镜像）
 *   └── shared/          ← 本仓库
 *
 * 仓库位置可用环境变量覆盖：
 *   MYLIBRARY_ROOT=... EBOOK_STUDIO_ROOT=... node scripts/verify-contract.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHARED_ROOT = resolve(HERE, '..');

/** 定位同级仓库，支持环境变量覆盖。 */
export function locateRepos() {
  const mylibraryRoot = process.env.MYLIBRARY_ROOT
    ? resolve(process.env.MYLIBRARY_ROOT)
    : resolve(SHARED_ROOT, '..', 'mylibrary');
  const ebookStudioRoot = process.env.EBOOK_STUDIO_ROOT
    ? resolve(process.env.EBOOK_STUDIO_ROOT)
    : resolve(SHARED_ROOT, '..', 'ebook-studio');
  return { mylibraryRoot, ebookStudioRoot };
}

/** 断言一个路径存在，否则给出可操作的提示。 */
export function requirePath(path, hint) {
  if (!existsSync(path)) {
    console.error(`✗ 找不到 ${path}`);
    if (hint) console.error(`  ${hint}`);
    process.exit(1);
  }
}

/** 读取文件，失败时退出。 */
export function readOrExit(path) {
  requirePath(path);
  return readFileSync(path, 'utf8');
}

export { join, resolve };
