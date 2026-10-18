/**
 * 合并语义交叉验证：用相同输入跑 TS 侧实现，
 * 逐条比对 Dart 测试（test/mylibrary_test.dart）里的期望值。
 *
 * 这是「两套软件的同步实现不一致」这个风险（设计文档第七部分）的直接防线：
 * 任何一侧改了合并规则，这里会立刻发现两侧结论不同。
 *
 * 用法：
 *   cd mylibrary && pnpm run build        # 先构建，本脚本读取 dist/
 *   node ../shared/scripts/cross-check.mjs
 */
import { existsSync } from 'node:fs';
import { locateRepos, readOrExit, join } from './locate.mjs';

const { mylibraryRoot } = locateRepos();

const distIndex = join(mylibraryRoot, 'dist', 'index.js');
if (!existsSync(distIndex)) {
  console.error(`✗ 找不到 ${distIndex}`);
  console.error('  请先构建：cd mylibrary && pnpm run build');
  process.exit(1);
}

const {
  mergeLibraries, planSync, mergeSyncState,
  createSyncRequest, syncRequestFileName, planDelete,
} = await import(distIndex);

// ---------- 与 Dart 测试一致的测试夹具 ----------
const mkBook = (over = {}) => ({
  id: 'uuid-1', title: '三体', author: '刘慈欣', format: 'epub',
  relative_path: 'books/三体/三体.epub', size_bytes: 1048576,
  added_at: '2026-10-01T00:00:00Z',
  sync_state: {
    metadata: 'synced', cover: 'synced', notes: 'synced',
    file: 'local_only', recordings: 'local_only',
  },
  held_by: [], ...over,
});

const mkLib = (books, version = 1) => ({
  schema_version: '1.0', version, updated_at: '2026-10-16T10:30:00Z',
  updated_by: 'local', books, collections: [], tags: [],
});

let pass = 0;
let fail = 0;
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}\n      实际: ${a}\n      期望: ${e}`);
  }
};

console.log('合并语义交叉验证（期望值来自 ebook-studio/test/mylibrary_test.dart）\n');

// ---------- 1. 版本对比（设计文档 1.8.1） ----------
console.log('版本对比：');
check('网盘版本更高 → download', planSync(mkLib([], 1), mkLib([], 2)).action, 'download');
check('版本一致 → none', planSync(mkLib([], 7), mkLib([], 7)).action, 'none');
check('本地版本更高 → upload', planSync(mkLib([], 9), mkLib([], 3)).action, 'upload');

// ---------- 2. 书籍并集（1.8.2） ----------
console.log('\n书籍并集：');
const m1 = mergeLibraries(
  mkLib([mkBook({ id: 'a', title: 'A' })]),
  mkLib([mkBook({ id: 'b', title: 'B' })], 5),
);
check('不同书籍按 book_id 取并集', m1.value.books.map((b) => b.id).sort(), ['a', 'b']);
check('version 取较大值', m1.value.version, 5);

// ---------- 3. 字段并集（1.8.2） ----------
console.log('\n字段并集：');
const m2 = mergeLibraries(
  mkLib([mkBook({ tags: ['科幻'], collections: ['待读'], linked_wiki_pages: ['a'] })]),
  mkLib([mkBook({ tags: ['中文', '科幻'], collections: ['已读'], linked_wiki_pages: ['b'] })], 5),
);
check('tags 并集', [...m2.value.books[0].tags].sort(), ['中文', '科幻'].sort());
check('collections 并集', [...m2.value.books[0].collections].sort(), ['待读', '已读'].sort());
check('linked_wiki_pages 并集', [...m2.value.books[0].linked_wiki_pages].sort(), ['a', 'b']);

// ---------- 4. reading_position 决胜（1.8.2） ----------
console.log('\nreading_position 决胜：');
const m3 = mergeLibraries(
  mkLib([mkBook({ reading_position: { position: 'p-local', percentage: 0.2, updated_at: '2026-10-16T08:30:00Z', updated_by: 'local' } })]),
  mkLib([mkBook({ reading_position: { position: 'p-remote', percentage: 0.8, updated_at: '2026-10-16T11:00:00Z', updated_by: 'remote' } })], 5),
);
check('取 updated_at 较新的一方', m3.value.books[0].reading_position.position, 'p-remote');

// ---------- 5. held_by 排序（1.8.2） ----------
console.log('\nheld_by 并集与排序：');
const m4 = mergeLibraries(
  mkLib([mkBook({ held_by: [
    { client_id: 'mac', last_seen: '2026-10-16T08:30:00Z' },
    { client_id: 'ipad', last_seen: '2026-10-16T11:00:00Z' },
  ] })]),
  mkLib([mkBook({ held_by: [{ client_id: 'win', last_seen: '2026-10-16T10:30:00Z' }] })], 5),
);
check('按 last_seen 降序', m4.value.books[0].held_by.map((h) => h.client_id), ['ipad', 'win', 'mac']);

// ---------- 6. sync_state 择优（1.4） ----------
console.log('\nsync_state 五维度择优：');
check('每个维度取更可达的状态', mergeSyncState(
  { metadata: 'synced', cover: 'local_only', notes: 'synced', file: 'local_only', recordings: 'missing' },
  { metadata: 'synced', cover: 'synced', notes: 'local_only', file: 'synced', recordings: 'partial' },
), {
  metadata: 'synced', cover: 'synced', notes: 'synced', file: 'synced', recordings: 'partial',
});

// ---------- 7. 同步请求（1.8.4） ----------
console.log('\n同步请求队列：');
check('文件名规范', syncRequestFileName('uuid-1', 'flutter-ipad'), 'sync-req-uuid-1-flutter-ipad.json');
check('构造 pending 请求', createSyncRequest('uuid-1', 'ipad', '2026-10-16T10:30:00Z', 'sync-req-1'), {
  id: 'sync-req-1', book_id: 'uuid-1', requested_by: 'ipad',
  requested_at: '2026-10-16T10:30:00Z', status: 'pending',
});

// ---------- 8. 删除语义（1.8.5） ----------
console.log('\n删除语义：');
check('移除条目：删元数据留文件', {
  metadata: planDelete('remove_entry').metadata,
  file: planDelete('remove_entry').file,
}, { metadata: 'delete', file: 'keep' });
check('删除书籍：文件进 .trash', planDelete('delete_book').file, 'trash');
check('仅删除本地：sync_state.file 改 local_only', planDelete('delete_local_only').nextFileSyncState, 'local_only');

// ---------- 汇总 ----------
console.log(`\n结果：${pass} 通过，${fail} 失败`);
if (fail > 0) {
  console.error('\n✗ TS 与 Dart 的合并语义不一致，请检查两侧实现');
  process.exit(1);
}
console.log('✓ TS 与 Dart 的合并语义完全一致');
