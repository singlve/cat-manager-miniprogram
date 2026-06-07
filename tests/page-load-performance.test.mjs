import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('页面加载性能保护', () => {
  it.each([
    'pages/health-records/health-records.js',
    'pages/weight-records/weight-records.js'
  ])('%s 跳过首次 onShow 的重复请求', path => {
    const source = read(path);

    expect(source).toContain('this._skipFirstOnShowReload = true');
    expect(source).toContain('if (this._skipFirstOnShowReload)');
    expect(source).toContain('this._skipFirstOnShowReload = false');
  });

  it('记账本月度按月加载，年度才读取全年', () => {
    const source = read('pages/expense/expense.js');

    expect(source).toContain("if (this.data.viewMode === 'year')");
    expect(source).toContain("start = y + '-01-01'");
    expect(source).toContain("end = this.data.currentMonth + '-31'");
    expect(source).toContain('this.loadExpenseData()');
  });

  it.each([
    'pages/health-records/health-records.js',
    'pages/weight-records/weight-records.js'
  ])('%s 原始记录保留在逻辑层，避免重复 setData', path => {
    const source = read(path);
    expect(source).toContain('this._records');
    expect(source).toContain('loadedRecordCount');
    expect(source).not.toContain('records: allRecords');
  });
});
