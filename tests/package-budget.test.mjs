import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(resolve(root, 'project.config.json'), 'utf8'));
const rules = config.packOptions?.ignore || [];
const implicitFolders = new Set(['.git', 'cloudfunctions']);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function normalize(path) {
  return path.replaceAll('\\', '/').replace(/^\/+/, '');
}

function isIgnored(path, isDirectory) {
  const normalized = normalize(path);
  if (normalized.split('/').some(part => implicitFolders.has(part))) return true;

  return rules.some(rule => {
    const value = normalize(rule.value);
    if (rule.type === 'folder') {
      return normalized === value || normalized.startsWith(`${value}/`);
    }
    if (rule.type === 'file' && value.startsWith('*.')) {
      return normalized.endsWith(value.slice(1));
    }
    return !isDirectory && normalized === value;
  });
}

function collectFiles(directory = root) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    const path = normalize(relative(root, absolute));
    const stats = statSync(absolute);
    if (isIgnored(path, stats.isDirectory())) continue;
    if (stats.isDirectory()) files.push(...collectFiles(absolute));
    else files.push({ path, size: stats.size });
  }
  return files;
}

describe('main package budget', () => {
  const allFiles = collectFiles();
  const files = allFiles.filter(file => !file.path.startsWith('packages/'));

  it('keeps the estimated unpacked main package below the upload limit', () => {
    const total = files.reduce((sum, file) => sum + file.size, 0);

    expect(total).toBeLessThan(1.95 * 1024 * 1024);
  });

  it('does not add a single oversized runtime image', () => {
    const oversizedImages = allFiles.filter(file =>
      imageExtensions.has(extname(file.path).toLowerCase()) && file.size > 150 * 1024
    );

    expect(oversizedImages).toEqual([]);
  });

  it('keeps the service subpackage below its upload limit', () => {
    const serviceSize = allFiles
      .filter(file => file.path.startsWith('packages/'))
      .reduce((sum, file) => sum + file.size, 0);

    expect(serviceSize).toBeLessThan(1.95 * 1024 * 1024);
  });
});
