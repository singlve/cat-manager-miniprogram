import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('expense add entry', () => {
  it('uses a large empty-state button and a draggable FAB when records exist', () => {
    const template = read('packages/expense/expense.wxml');
    const script = read('packages/expense/expense.js');
    const styles = read('packages/expense/expense.wxss');

    expect(template).toContain('wx:if="{{!loading && !loadError && !hasVisibleExpenses}}" class="add-section"');
    expect(template).toContain('wx:if="{{!loading && !loadError && hasVisibleExpenses}}" class="add-fab-area"');
    expect(template).toContain('bindtouchend="onAddFabRelease"');
    expect(script).toContain('hasVisibleExpenses: groups.length > 0');
    expect(script).toContain('hasVisibleExpenses: yearExpenses.length > 0');
    expect(styles).toMatch(/\.add-fab-area\s*\{[\s\S]*?pointer-events:\s*none/);
    expect(styles).toMatch(/\.add-fab\s*\{[\s\S]*?pointer-events:\s*auto/);
  });
});
