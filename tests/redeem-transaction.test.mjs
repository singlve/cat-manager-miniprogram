import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('atomic points redemption', () => {
  it('runs points, stock, records and inventory writes in a server transaction', () => {
    const source = read('cloudfunctions/redeemItem/index.js');

    expect(source).toContain('db.runTransaction');
    expect(source).toContain("const REQUEST_COL = 'redeem_requests'");
    expect(source).toContain("transaction.collection(RECORD_COL)");
    expect(source).toContain("transaction.collection(INVENTORY_COL)");
    expect(source).toContain('user._openid !== openid');
    expect(source).toContain('item.enabled === false');
    expect(source).toContain('.doc(recordDocId).set(recordData)');
    expect(source).toContain('.doc(inventoryDocId).set(inventoryData)');
    expect(source).not.toContain('.doc(recordDocId).set({ data: recordData })');
    expect(source).not.toContain('.doc(inventoryDocId).set({ data: inventoryData })');
    expect(source).toMatch(/await userRef\.update\(\{\s*totalPoints:/);
    expect(source).toMatch(/await requestRef\.set\(\{\s*_openid:/);
  });

  it('uses an idempotent request id from the mall page', () => {
    const source = read('packages/points-mall/points-mall.js');

    expect(source).toContain('clouddb.redeemItemAtomic');
    expect(source).toContain('redeemRequestId');
    expect(source).not.toContain('await clouddb.addRedeemRecord(record)');
  });

  it('exposes cloud and local redemption through the data layer', () => {
    const source = read('utils/clouddb.js');
    const cloudSource = read('cloudfunctions/redeemItem/index.js');

    expect(source).toContain('async function redeemItemAtomic(params)');
    expect(source).toContain("name: 'redeemItem'");
    expect(source).toContain('redeemItemAtomic,');
    expect(source).toContain("options.admin ? 'adminStore' : 'redeemItem'");
    expect(source).toContain("options.admin ? 'listItems' : 'list'");
    expect(cloudSource).toContain("if (action === 'list')");
    expect(cloudSource).toContain('item.enabled !== false');
  });
});
