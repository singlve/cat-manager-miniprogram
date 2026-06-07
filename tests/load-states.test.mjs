import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const retryPages = [
  'pages/shipping-address/shipping-address',
  'pages/feedback/feedback',
  'packages/admin-announcement/admin-announcement',
  'packages/admin-items/admin-items',
  'packages/points-mall/points-mall',
  'packages/inventory/inventory'
];

describe('shared loading and failure states', () => {
  it.each(retryPages)('%s exposes loading, failure and retry UI', page => {
    const template = read(`${page}.wxml`);
    const source = read(`${page}.js`);

    expect(template).toContain('ui-loading-state');
    expect(template).toContain('load-error-state');
    expect(template).toContain('bindtap="retryLoad"');
    expect(source).toContain('loadError');
    expect(source).toContain('retryLoad');
  });

  it('defines the shared animated loading component', () => {
    const styles = read('app.wxss');

    expect(styles).toContain('.ui-loading-state');
    expect(styles).toContain('.ui-loading-mark');
    expect(styles).toContain('@keyframes ui-loading-spin');
  });
});
