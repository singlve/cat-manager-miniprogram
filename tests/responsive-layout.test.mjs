import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('small-screen layout safeguards', () => {
  it.each([
    'pages/reminders/reminders.wxss',
    'pet-package/health-records/health-records.wxss',
    'pages/services/services.wxss',
    'packages/points-mall/points-mall.wxss',
    'packages/inventory/inventory.wxss'
  ])('%s provides a compact layout', path => {
    expect(read(path)).toContain('@media (max-width: 340px)');
  });

  it('allows reminder dates and metadata to wrap instead of overflowing', () => {
    const styles = read('pages/reminders/reminders.wxss');

    expect(styles).toMatch(/\.next-date-highlight\s*\{[\s\S]*?flex-wrap:\s*wrap/);
    expect(styles).toMatch(/\.info-row\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  });

  it('lets inventory names shrink beside quantity and delete actions', () => {
    const styles = read('packages/inventory/inventory.wxss');

    expect(styles).toMatch(/\.item-name\s*\{[\s\S]*?flex:\s*1/);
    expect(styles).toMatch(/\.item-name\s*\{[\s\S]*?min-width:\s*0/);
  });

  it('anchors the pet gender badge to the avatar instead of fixed coordinates', () => {
    const styles = read('pages/cat-list/cat-list.wxss');
    const template = read('pages/cat-list/cat-list.wxml');

    expect(styles).toContain('.gender-symbol');
    expect(styles).toContain('right: -4rpx');
    expect(styles).toContain('bottom: -4rpx');
    expect(styles).not.toContain('left: 84rpx');
    expect(styles).not.toContain('top: 84rpx');
    expect(template).toContain('class="gender-symbol"');
  });
});
