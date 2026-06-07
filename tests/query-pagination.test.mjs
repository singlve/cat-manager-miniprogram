import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'utils/clouddb.js'), 'utf8');

describe('云数据库列表分页', () => {
  it('完整查询具有分页和最大数量保护', () => {
    expect(source).toContain('while (rows.length < maxRows)');
    expect(source).toContain('maxRows: 1000');
    expect(source).toContain('maxRows: 2000');
  });

  it('提醒、记账和通知使用完整分页查询', () => {
    expect(source).toContain('_cloudQueryAll(REMIND_COL');
    expect(source).toContain('_cloudQueryAll(EXPENSE_COL');
    expect(source).toContain('_cloudQueryAll(NOTIFY_COL');
  });
});
