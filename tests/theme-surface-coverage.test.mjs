import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const themedSurfaces = [
  'pages/shipping-address/shipping-address.wxss',
  'pages/feedback/feedback.wxss',
  'packages/admin-announcement/admin-announcement.wxss',
  'packages/admin-data/admin-data.wxss',
  'packages/admin-items/admin-items.wxss',
  'packages/points-mall/points-mall.wxss',
  'packages/inventory/inventory.wxss',
  'pages/cat-detail/cat-detail.wxss',
  'pages/cat-add/cat-add.wxss',
  'pages/health-records/health-records.wxss',
  'pages/weight-records/weight-records.wxss',
  'pages/reminders/reminders.wxss',
  'pages/reminder-add/reminder-add.wxss',
  'pages/mine/mine.wxss'
];

describe('theme surface coverage', () => {
  it.each(themedSurfaces)('%s uses shared theme surface tokens', file => {
    const styles = read(file);

    expect(styles).toContain('var(--theme-text');
    expect(styles).toContain('var(--theme-text-secondary');
    expect(styles).toContain('var(--theme-card');
    expect(styles).toContain('var(--theme-divider');
  });

  it('does not rely on unsupported color mixing syntax', () => {
    themedSurfaces.forEach(file => {
      expect(read(file)).not.toContain('color-mix(');
    });
  });
});
