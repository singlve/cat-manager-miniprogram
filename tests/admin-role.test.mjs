import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('central admin role support', () => {
  it.each([
    'cloudfunctions/adminUsers/index.js',
    'cloudfunctions/adminAnnouncement/index.js',
    'cloudfunctions/getAdminRecords/index.js',
    'cloudfunctions/adminFeedback/index.js'
  ])('%s accepts users.role and environment configuration', path => {
    const source = read(path);

    expect(source).toContain('async function isServerAdmin(openid)');
    expect(source).toContain("role: 'admin'");
    expect(source).toContain('process.env.ADMIN_OPENIDS');
    expect(source).not.toContain('const ADMIN_OPENIDS = [');
  });

  it('uses the same role in the client visibility check', () => {
    expect(read('utils/util.js')).toContain("user.role === 'admin'");
  });
});
