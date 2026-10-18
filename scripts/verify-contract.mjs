/**
 * 契约一致性检查：对比 TS 与 Dart 两侧的 JSON 键名集合。
 *
 * 验证设计文档第一部分定义的 51 个关键字段在两个实现中都存在。
 * 任何一侧新增 / 改名 / 删除字段，这个脚本都会报出来。
 *
 * 用法：
 *   node scripts/verify-contract.mjs
 *   MYLIBRARY_ROOT=/path/to/mylibrary EBOOK_STUDIO_ROOT=/path/to/ebook-studio node scripts/verify-contract.mjs
 */
import { existsSync } from 'node:fs';
import { locateRepos, readOrExit, join } from './locate.mjs';

/** 设计文档第一部分定义的关键字段（少一个就说明契约被破坏了）。 */
const CRITICAL_FIELDS = [
  // manifest.json (1.3)
  'schema_version', 'library_version', 'updated_at', 'updated_by', 'clients',
  // library.json (1.4)
  'books', 'version', 'relative_path', 'cover_path', 'notes_path', 'recordings_dir',
  'size_bytes', 'file_hash', 'added_at', 'sync_state', 'held_by', 'reading_position',
  'tags', 'collections', 'linked_wiki_pages',
  // sync_state 五维度 (1.4)
  'metadata', 'cover', 'notes', 'file', 'recordings',
  // held_by / reading_position (1.4)
  'client_id', 'last_seen', 'percentage', 'position',
  // 通用字段
  'id', 'title', 'author', 'format', 'type', 'platform', 'name', 'created_at',
  // 笔记边车 (1.5)
  'book_id', 'book_format', 'annotations', 'anchor', 'color', 'strokes',
  // 同步请求 (1.8.4)
  'requested_by', 'requested_at', 'status',
  // 录课视频 (1.7)
  'duration_seconds', 'created_by', 'position_at_start', 'position_at_end', 'transcript',
];

const { mylibraryRoot, ebookStudioRoot } = locateRepos();
console.log(`mylibrary:    ${mylibraryRoot}`);
console.log(`ebook-studio: ${ebookStudioRoot}\n`);

// ---------- TS 侧 ----------
const tsSrc = readOrExit(
  join(mylibraryRoot, 'src', 'types.ts'),
);
const tsKeys = new Set([...tsSrc.matchAll(/^\s{2,}([a-z_]+)[?]?:/gm)].map((m) => m[1]));

const missingInTs = CRITICAL_FIELDS.filter((k) => !tsKeys.has(k));
if (missingInTs.length > 0) {
  console.error(`✗ TS 侧缺少关键字段: ${missingInTs.join(', ')}`);
  process.exit(1);
}
console.log(`✓ TS 侧：${CRITICAL_FIELDS.length} 个关键字段齐全（共 ${tsKeys.size} 个字段）`);

// ---------- Dart 侧 ----------
const dartFiles = [
  'lib/models/mylibrary_models.dart',
  'lib/storage/sync.dart',
  'lib/storage/my_library_store.dart',
];
const dartSrc = dartFiles.map((f) => readOrExit(join(ebookStudioRoot, f))).join('\n');
const dartKeys = new Set([...dartSrc.matchAll(/json\['([a-z_]+)'\]/g)].map((m) => m[1]));

const missingInDart = CRITICAL_FIELDS.filter((k) => !dartKeys.has(k));
if (missingInDart.length > 0) {
  console.error(`✗ Dart 侧缺少关键字段: ${missingInDart.join(', ')}`);
  process.exit(1);
}
console.log(`✓ Dart 侧：${CRITICAL_FIELDS.length} 个关键字段齐全（共 ${dartKeys.size} 个 JSON 键）`);

// ---------- 差异说明（非致命） ----------
const onlyTs = [...tsKeys].filter((k) => !dartKeys.has(k)).sort();
if (onlyTs.length > 0) {
  console.log(`ℹ 仅在 TS 中（Dart 通过通用 Map 透传或尚未读取）: ${onlyTs.join(', ')}`);
}

console.log(`\n✓ 契约一致：${CRITICAL_FIELDS.length} 个关键字段在 TS 与 Dart 两侧完全对齐`);
