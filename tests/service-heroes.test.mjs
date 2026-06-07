import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

const servicePages = [
  'pages/expense/expense.wxml',
  'pages/shipping-address/shipping-address.wxml',
  'pages/feedback/feedback.wxml',
  'packages/admin-announcement/admin-announcement.wxml',
  'packages/admin-items/admin-items.wxml',
  'packages/admin-data/admin-data.wxml',
  'pages/data-backup/data-backup.wxml'
];

describe('service feature heroes', () => {
  it.each(servicePages)('%s uses the shared themed hero structure', page => {
    const template = read(page);

    expect(template).toContain('service-feature-hero-shell');
    expect(template).toContain('service-feature-hero');
    expect(template).toContain('service-feature-art');
    expect(template).toContain('service-feature-title');
    expect(template).toContain('theme-business-icon');
  });

  it('defines a responsive, theme-aware shared hero', () => {
    const styles = read('app.wxss');

    expect(styles).toContain('.service-feature-hero');
    expect(styles).toContain('.service-feature-hero-shell');
    expect(styles).toContain('var(--theme-primary');
    expect(styles).toContain('var(--theme-primary-soft');
    expect(styles).toContain('@media (max-width: 340px)');
  });
});
