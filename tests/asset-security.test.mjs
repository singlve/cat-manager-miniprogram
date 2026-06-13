import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('user asset security boundaries', () => {
  it('moves check-in, make-up and share rewards into an owned-user transaction', () => {
    const cloudSource = read('cloudfunctions/userAccount/index.js');
    const mineSource = read('pages/mine/mine.js');
    const dbSource = read('utils/clouddb.js');

    expect(cloudSource).toContain('db.runTransaction');
    expect(cloudSource).toContain('user._openid !== openid');
    expect(cloudSource).toContain("runIdempotent(event, openid, 'checkIn'");
    expect(cloudSource).toContain("runIdempotent(event, openid, 'makeUp'");
    expect(cloudSource).toContain("runIdempotent(event, openid, 'shareReward'");
    expect(cloudSource).toContain("const REQUEST_COL = 'redeem_requests'");
    expect(cloudSource).toContain("throw businessError('ALREADY_MADE_UP'");
    expect(cloudSource).toContain("throw businessError('MONTHLY_LIMIT'");

    expect(dbSource).toContain("name: 'userAccount'");
    expect(dbSource).toContain('async function checkInAtomic');
    expect(dbSource).toContain('async function makeUpAtomic');
    expect(dbSource).toContain('async function claimShareRewardAtomic');
    expect(mineSource).toContain('clouddb.checkInAtomic');
    expect(mineSource).toContain('clouddb.makeUpAtomic');
    expect(mineSource).toContain('clouddb.claimShareRewardAtomic');
    expect(mineSource).not.toMatch(/updateUser\([^)]*,\s*\{\s*totalPoints:/);
    expect(mineSource).not.toMatch(/updateUser\([^)]*,\s*\{\s*makeUpCards:/);
  });

  it('does not allow generic profile updates to mutate asset balances', () => {
    const source = read('cloudfunctions/userAccount/index.js');

    expect(source).toContain('const EDITABLE_FIELDS = new Set([');
    expect(source).toContain("'activeTheme'");
    expect(source).not.toMatch(/EDITABLE_FIELDS[\s\S]{0,220}'totalPoints'/);
    expect(source).not.toMatch(/EDITABLE_FIELDS[\s\S]{0,220}'makeUpCards'/);
    expect(source).not.toMatch(/EDITABLE_FIELDS[\s\S]{0,220}'themeVouchers'/);
    expect(source).not.toMatch(/EDITABLE_FIELDS[\s\S]{0,220}'ownedThemes'/);
    expect(source).toContain("throw businessError('THEME_NOT_OWNED'");
  });
});

describe('inventory and redemption consistency', () => {
  it('confirms, cancels and deletes inventory atomically on the server', () => {
    const cloudSource = read('cloudfunctions/redeemItem/index.js');
    const pageSource = read('packages/inventory/inventory.js');
    const dbSource = read('utils/clouddb.js');

    expect(cloudSource).toContain("action === 'confirmInventory'");
    expect(cloudSource).toContain("action === 'cancelInventory'");
    expect(cloudSource).toContain("action === 'deleteInventory'");
    expect(cloudSource).toContain("const SHIPMENT_COL = 'shipments'");
    expect(cloudSource).toContain("const SHIPPING_ADDRESS_COL = 'shipping_addresses'");
    expect(cloudSource).toContain('address._openid !== openid');
    expect(cloudSource).toContain('inventory._openid !== openid');
    expect(cloudSource).toContain('await userRef.update({ totalPoints: points })');
    expect(cloudSource).toContain('await row.inventoryRef.remove()');

    expect(dbSource).toContain('async function confirmInventoryAtomic');
    expect(dbSource).toContain('async function cancelInventoryAtomic');
    expect(dbSource).toContain('async function deleteInventoryAtomic');
    expect(pageSource).toContain('clouddb.confirmInventoryAtomic');
    expect(pageSource).toContain('clouddb.cancelInventoryAtomic');
    expect(pageSource).toContain('clouddb.deleteInventoryAtomic');
    expect(pageSource).not.toContain('await clouddb.updateUser(currentUser._id');
    expect(pageSource).not.toContain('await clouddb.updateRedeemItem(item.itemId');
  });

  it('routes store administration through an admin-only cloud function', () => {
    const cloudSource = read('cloudfunctions/adminStore/index.js');
    const dbSource = read('utils/clouddb.js');
    const adminPage = read('packages/admin-items/admin-items.js');

    expect(cloudSource).toContain('await isServerAdmin(openid)');
    expect(cloudSource).toContain("action === 'saveItem'");
    expect(cloudSource).toContain("action === 'shipOrder'");
    expect(cloudSource).toContain('db.runTransaction');
    expect(cloudSource).toContain('if (shipment.status !==');
    expect(dbSource).toContain("name: 'adminStore'");
    expect(adminPage).toContain("name: 'adminStore'");
    expect(adminPage).not.toContain("wx.cloud.database().collection('users')");
    expect(adminPage).not.toContain('clouddb.updateInventoryItem');
    expect(adminPage).not.toContain('clouddb.updateRedeemRecord');
  });

  it('binds idempotent redemption requests to the complete purchase payload', () => {
    const source = read('cloudfunctions/redeemItem/index.js');

    expect(source).toContain('existingRequest.data.userId !== userId');
    expect(source).toContain('existingRequest.data.itemId !== itemId');
    expect(source).toContain("existingRequest.data.paymentMethod || 'points'");
    expect(source).toContain('existingRequest.data.quantity');
    expect(source).toMatch(/await requestRef\.set\(\{[\s\S]*paymentMethod,[\s\S]*quantity,/);
  });
});
