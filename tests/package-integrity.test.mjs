import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const app = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8'));
const textExtensions = new Set(['.js', '.wxml', '.wxss', '.json']);

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap(name => {
    const target = join(directory, name);
    return statSync(target).isDirectory() ? walk(target) : [target];
  });
}

function registeredPages() {
  return [
    ...app.pages,
    ...app.subPackages.flatMap(pkg => pkg.pages.map(page => `${pkg.root}/${page}`))
  ];
}

function sourceFiles() {
  return ['pages', 'packages', 'pet-package', 'account-package', 'templates', 'utils']
    .flatMap(directory => walk(resolve(root, directory)))
    .filter(file => textExtensions.has(extname(file)));
}

function directorySize(directory) {
  return walk(directory).reduce((total, file) => total + statSync(file).size, 0);
}

describe('分包完整性', () => {
  it('每个注册页面都具备 JS、JSON、WXML 和 WXSS 四件套', () => {
    registeredPages().forEach(page => {
      ['.js', '.json', '.wxml', '.wxss'].forEach(extension => {
        expect(existsSync(resolve(root, page + extension)), `${page}${extension}`).toBe(true);
      });
    });
  });

  it('所有本地页面跳转都指向已注册页面', () => {
    const pages = new Set(registeredPages().map(page => `/${page}`));
    const routePattern = /['"`](\/(?:pages|packages|pet-package|account-package)\/[A-Za-z0-9_./-]+)/g;

    sourceFiles().forEach(file => {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(routePattern)) {
        const route = match[1].split('?')[0];
        if (route.endsWith('.png') || route.endsWith('.webp')) continue;
        expect(pages.has(route), `${file}: ${route}`).toBe(true);
      }
    });
  });

  it('WXML 中的本地图片和 include 模板都真实存在', () => {
    sourceFiles().filter(file => extname(file) === '.wxml').forEach(file => {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:src|iconPath)="(\/[^"{]+)"/g)) {
        expect(existsSync(resolve(root, match[1].slice(1))), `${file}: ${match[1]}`).toBe(true);
      }
      for (const match of source.matchAll(/<include\s+src="([^"]+)"/g)) {
        expect(existsSync(resolve(dirname(file), match[1])), `${file}: ${match[1]}`).toBe(true);
      }
    });
  });

  it('相对 require 依赖都真实存在', () => {
    sourceFiles().filter(file => extname(file) === '.js').forEach(file => {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
        expect(existsSync(resolve(dirname(file), match[1])), `${file}: ${match[1]}`).toBe(true);
      }
    });
  });

  it('主包 utils 中的 JS 都能从主包入口实际到达', () => {
    const entryFiles = [
      resolve(root, 'app.js'),
      ...app.pages.map(page => resolve(root, page + '.js'))
    ];
    const reachable = new Set();

    function visit(file) {
      if (reachable.has(file) || !existsSync(file)) return;
      reachable.add(file);
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
        const dependency = resolve(dirname(file), match[1]);
        if (extname(dependency) === '.js') visit(dependency);
      }
    }

    entryFiles.forEach(visit);
    walk(resolve(root, 'utils'))
      .filter(file => extname(file) === '.js')
      .forEach(file => {
        expect(reachable.has(file), `主包未使用 JS 应迁入对应分包: ${file}`).toBe(true);
      });
  });

  it('分包根目录存在且不互相嵌套', () => {
    const roots = app.subPackages.map(pkg => pkg.root);
    roots.forEach(packageRoot => {
      expect(statSync(resolve(root, packageRoot)).isDirectory()).toBe(true);
      roots.filter(other => other !== packageRoot).forEach(other => {
        expect(packageRoot.startsWith(other + '/')).toBe(false);
      });
    });
  });

  it('主包和各分包都保留充足的体积余量', () => {
    const mainSize = [
      'app.js',
      'app.json',
      'app.wxss',
      'sitemap.json',
      'assets',
      'pages',
      'utils',
      'templates'
    ].reduce((total, target) => {
      const absolute = resolve(root, target);
      return total + (statSync(absolute).isDirectory() ? directorySize(absolute) : statSync(absolute).size);
    }, 0);

    expect(mainSize, `main package: ${mainSize} bytes`).toBeLessThan(1.5 * 1024 * 1024);
    app.subPackages.forEach(pkg => {
      const size = directorySize(resolve(root, pkg.root));
      expect(size, `${pkg.root}: ${size} bytes`).toBeLessThan(2 * 1024 * 1024);
    });
  });

  it('主包图片资源控制在 200 KB 内且没有超大单图', () => {
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
    const images = walk(resolve(root, 'assets')).filter(file => imageExtensions.has(extname(file).toLowerCase()));
    const totalSize = images.reduce((total, file) => total + statSync(file).size, 0);

    expect(totalSize, `root images: ${totalSize} bytes`).toBeLessThanOrEqual(200000);
    images.forEach(file => {
      expect(statSync(file).size, file).toBeLessThanOrEqual(200000);
    });
  });
});
