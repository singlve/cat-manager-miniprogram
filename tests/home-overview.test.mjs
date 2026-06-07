import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('首页精简查询', () => {
  it('首页使用专用 overview 接口', () => {
    const source = read('pages/cat-list/cat-list.js');
    expect(source).toContain('clouddb.getHomeOverview()');
    expect(source).not.toContain('clouddb.getRecords(),');
  });

  it('云函数只返回近期记录和每只宠物最近记录', () => {
    const source = read('cloudfunctions/getHomeOverview/index.js');
    expect(source).toContain(".limit(3)");
    expect(source).toContain('latestRecordByCat');
    expect(source).toContain("catId: cat._id");
  });
});
