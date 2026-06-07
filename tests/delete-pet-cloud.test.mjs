import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('宠物级联删除云函数', () => {
  it('客户端通过 deletePet 云函数删除', () => {
    const source = read('utils/clouddb.js');
    expect(source).toContain("name: 'deletePet'");
    expect(source).not.toContain("const relatedCollections =");
  });

  it('服务端校验归属并清理全部关联集合', () => {
    const source = read('cloudfunctions/deletePet/index.js');
    expect(source).toContain("cat._openid !== openid");
    expect(source).toContain("'health_records'");
    expect(source).toContain("'weight_records'");
    expect(source).toContain("'reminders'");
    expect(source).toContain("'expenses'");
  });
});
