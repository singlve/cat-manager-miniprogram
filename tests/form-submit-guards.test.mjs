import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('primary form submit guards', () => {
  it('keeps reminder creation visibly locked while saving', () => {
    const source = read('pet-package/reminder-add/reminder-add.js');
    const template = read('pet-package/reminder-add/reminder-add.wxml');

    expect(source).toContain('if (this.data.saving) return');
    expect(source).toContain('this.setData({ saving: true })');
    expect(template).toContain('disabled="{{saving}}"');
    expect(template).toContain('loading="{{saving}}"');
  });

  it('prevents duplicate feedback submissions', () => {
    const source = read('packages/feedback-post/feedback-post.js');
    const template = read('packages/feedback-post/feedback-post.wxml');

    expect(source).toContain('if (this.data.submitting) return');
    expect(source).toContain('this.setData({ submitting: true })');
    expect(template).toContain('disabled="{{submitting}}"');
    expect(template).toContain('loading="{{submitting}}"');
  });

  it.each([
    ['pet-package/weight-records/weight-records.js', 'savingRecord'],
    ['pet-package/cat-detail/cat-detail.js', 'weightSaving'],
    ['pages/cat-list/cat-list.js', 'quickSaving'],
    ['account-package/bind-phone/bind-phone.js', 'submitting'],
    ['pet-package/health-records/health-records.js', 'editSaving']
  ])('%s exposes a visible submit guard', (path, state) => {
    const source = read(path);

    expect(source).toContain(`this.data.${state}`);
    expect(source).toContain(`${state}: true`);
    expect(source).toContain(`${state}: false`);
  });
});
