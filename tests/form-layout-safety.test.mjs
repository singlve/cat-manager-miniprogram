import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = resolve(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function verticalPaddingIsNonZero(value) {
  const parts = value.trim().split(/\s+/);
  const top = parts[0] || '0';
  const bottom = parts.length < 3 ? top : parts[2];
  return !/^0(?:rpx|px|rem|em|%)?$/.test(top) ||
    !/^0(?:rpx|px|rem|em|%)?$/.test(bottom);
}

describe('form layout safety', () => {
  it('does not combine fixed-height input controls with vertical padding', () => {
    const unsafe = [];
    const files = walk(root).filter(path =>
      path.endsWith('.wxss') &&
      !path.includes('/node_modules/') &&
      !path.includes('/miniprogram_npm/')
    );

    files.forEach(path => {
      const source = readFileSync(path, 'utf8');
      const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
      let match;
      while ((match = blockPattern.exec(source))) {
        const selector = match[1].trim();
        const body = match[2];
        if (!/(^|[\s,.#-])input(?:\b|-)/i.test(selector)) continue;
        if (!/(^|;)\s*height\s*:/i.test(body)) continue;
        const padding = body.match(/(?:^|;)\s*padding\s*:\s*([^;]+)/i);
        if (padding && verticalPaddingIsNonZero(padding[1])) {
          unsafe.push(path.replace(root + '/', '') + ': ' + selector.replace(/\s+/g, ' '));
        }
      }
    });

    expect(unsafe, 'Native input text may be clipped: ' + unsafe.join(', ')).toEqual([]);
  });

  it('keeps the welfare editor scroll content separate from safe-area actions', () => {
    const template = readFileSync(
      resolve(root, 'packages/admin-benefits/admin-benefits.wxml'),
      'utf8'
    );
    const styles = readFileSync(
      resolve(root, 'packages/admin-benefits/admin-benefits.wxss'),
      'utf8'
    );

    expect(template).toContain('<view class="editor-sheet"');
    expect(template).toContain('<scroll-view class="editor-scroll"');
    expect(styles).toMatch(/\.editor-sheet\s*\{[\s\S]*?display:\s*flex/);
    expect(styles).toMatch(/\.editor-scroll\s*\{[\s\S]*?flex:\s*1/);
    expect(styles).toMatch(/\.editor-actions\s*\{[\s\S]*?env\(safe-area-inset-bottom\)/);
    expect(styles).toMatch(/\.form-input\s*\{[\s\S]*?height:\s*78rpx[\s\S]*?padding:\s*0 22rpx/);
  });
});
