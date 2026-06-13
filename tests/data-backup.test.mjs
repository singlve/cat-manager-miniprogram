import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('数据备份入口', () => {
  it('已注册页面路由和服务页入口', () => {
    const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'));
    const services = fs.readFileSync('pages/services/services.wxml', 'utf8');
    const servicePackage = appConfig.subPackages.find(item => item.root === 'packages');
    expect(servicePackage.pages).toContain('data-backup/data-backup');
    expect(services).toContain('bindtap="goDataBackup"');
    expect(services).toContain('数据备份');
  });

  it('备份覆盖核心用户数据', () => {
    const source = fs.readFileSync('packages/data-backup/data-backup.js', 'utf8');
    const database = fs.readFileSync('utils/clouddb.js', 'utf8');
    expect(source).toContain('clouddb.getBackupSnapshot()');
    expect(database).toContain('_cloudQueryAll(CAT_COL');
    expect(database).toContain('_cloudQueryAll(RECORD_COL');
    expect(database).toContain('_cloudQueryAll(WEIGHT_COL');
    expect(database).toContain('_cloudQueryAll(REMIND_COL');
    expect(database).toContain('_cloudQueryAll(EXPENSE_COL');
  });

  it('支持版本校验、冲突预览、合并和覆盖恢复', () => {
    const source = fs.readFileSync('packages/data-backup/data-backup.js', 'utf8');
    const template = fs.readFileSync('packages/data-backup/data-backup.wxml', 'utf8');
    const database = fs.readFileSync('utils/clouddb.js', 'utf8');

    expect(source).toContain('validateBackup(parsed)');
    expect(source).toContain("restoreMode: 'merge'");
    expect(source).toContain('confirmDangerousAction');
    expect(template).toContain('合并恢复');
    expect(template).toContain('覆盖恢复');
    expect(database).toContain('async function restoreBackupSnapshot(snapshot, mode)');
    expect(database).toContain('_cloudSet(group.collection, row._id, row)');
  });
});
