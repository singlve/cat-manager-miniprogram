import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('dangerous action consistency', () => {
  it('provides a shared two-step confirmation helper', () => {
    const source = read('utils/util.js');

    expect(source).toContain('async function confirmDangerousAction(options)');
    expect(source.match(/wx\.showModal/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain('confirmDangerousAction,');
  });

  it.each([
    'pages/cat-list/cat-list.js',
    'pages/reminders/reminders.js'
  ])('%s uses the shared confirmation and operation lock', path => {
    const source = read(path);

    expect(source).toContain('confirmDangerousAction');
    expect(source).toMatch(/deleting(Cat|Reminder)Id/);
  });
});
