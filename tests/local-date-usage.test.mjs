import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('local calendar dates', () => {
  it.each([
    'pet-package/cat-add/cat-add.js',
    'pet-package/cat-edit/cat-edit.js',
    'pet-package/cat-detail/cat-detail.js',
    'pages/cat-list/cat-list.js',
    'pet-package/weight-records/weight-records.js',
    'pet-package/utils/cat-form-behavior.js'
  ])('%s avoids UTC date truncation', path => {
    expect(read(path)).not.toContain("toISOString().split('T')[0]");
    expect(read(path)).not.toContain('toISOString().split("T")[0]');
  });

  it('parses reminder dates as local calendar dates in the cloud function', () => {
    const source = read('cloudfunctions/checkReminders/index.js');

    expect(source).toContain('function parseLocalDate(value)');
    expect(source).toContain('parseLocalDate(r.lastDate)');
    expect(source).not.toContain('new Date(r.lastDate)');
  });
});
