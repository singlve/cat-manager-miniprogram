import { describe, expect, it } from 'vitest';

import { hashPassword, isHashed, verifyPassword } from '../utils/crypto.js';

describe('密码哈希', () => {
  it('新密码保存为带盐哈希，不保存明文', () => {
    const hashed = hashPassword('secret123');

    expect(hashed).toMatch(/^sha256:[^:]+:[a-f0-9]{64}$/);
    expect(hashed).not.toContain('secret123');
    expect(isHashed(hashed)).toBe(true);
  });

  it('正确密码通过校验，错误密码被拒绝', () => {
    const hashed = hashPassword('secret123');

    expect(verifyPassword('secret123', hashed)).toBe(true);
    expect(verifyPassword('wrong-password', hashed)).toBe(false);
  });

  it('兼容旧明文密码，但不会把它识别成哈希', () => {
    expect(verifyPassword('legacy-pass', 'legacy-pass')).toBe(true);
    expect(verifyPassword('other-pass', 'legacy-pass')).toBe(false);
    expect(isHashed('legacy-pass')).toBe(false);
  });
});
