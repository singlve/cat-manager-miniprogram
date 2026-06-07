import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('宠物头像批量临时地址', () => {
  it('首页批量解析当前用户宠物头像，不再逐只请求', () => {
    const source = read('pages/cat-list/cat-list.js');

    expect(source).toContain('clouddb.getAvatarUrls(cats.map');
    expect(source).not.toContain('await clouddb.getAvatarUrl(cat.avatar)');
  });

  it('数据层提供去重、分批和短期缓存', () => {
    const source = read('utils/clouddb.js');

    expect(source).toContain('new Set((fileIds || []).filter(Boolean))');
    expect(source).toContain('AVATAR_URL_BATCH_SIZE = 50');
    expect(source).toContain('AVATAR_URL_CACHE_TTL');
    expect(source).toContain('avatarUrlCache');
    expect(source).toContain('getAvatarUrls');
  });
});
