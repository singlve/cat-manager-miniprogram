import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('可配置抽奖系统', () => {
  it('前端转盘只展示云端结果，不再自行随机发奖', () => {
    const source = read('pages/mine/mine.js');

    expect(source).toContain('clouddb.getLotteryPrizes()');
    expect(source).toContain('clouddb.drawLotteryAtomic');
    expect(source).toContain('_applyLotteryResult(result)');
    expect(source).not.toContain('Math.floor(Math.random() * prizes.length)');
    expect(source).not.toContain('_awardPrize(prize)');
  });

  it('云端使用事务校验抽奖机会并记录幂等请求', () => {
    const source = read('cloudfunctions/drawLottery/index.js');

    expect(source).toContain('db.runTransaction');
    expect(source).toContain("const REQUEST_COL = 'lottery_requests'");
    expect(source).toContain("throw businessError('NO_DRAW_CHANCE'");
    expect(source).toContain('normalizeDrawnMilestones(user, streak)');
    expect(source).toContain('user.lotteryUsed');
    expect(source).toContain('drawnMilestones');
    expect(source).toContain('requestRef.set');
  });

  it('主题重复和实物无库存不会进入用户可抽奖池', () => {
    const source = read('cloudfunctions/drawLottery/index.js');
    const listSource = read('cloudfunctions/adminLottery/index.js');

    expect(source).toContain("prize.type === 'physical'");
    expect(source).toContain("prize.virtualType === 'theme'");
    expect(source).toContain('ownedThemes.indexOf(prize.virtualValue)');
    expect(source).toContain('prize.stock');
    expect(listSource).toContain("prize.type === 'physical'");
    expect(listSource).toContain("prize.virtualType === 'theme'");
    expect(listSource).toContain('ownedThemes.indexOf(prize.virtualValue)');
  });

  it('实物奖品写入背包与兑换记录并扣减奖池库存', () => {
    const source = read('cloudfunctions/drawLottery/index.js');

    expect(source).toContain("const INVENTORY_COL = 'user_inventory'");
    expect(source).toContain("const REDEEM_RECORD_COL = 'redeem_records'");
    expect(source).toContain("status: 'in_backpack'");
    expect(source).toContain("source: 'lottery'");
    expect(source).toContain('stock: Math.max(0');
  });

  it('管理员可配置奖品并用友好的概率、颜色和测试转盘完成预览', () => {
    const source = read('packages/admin-items/admin-items.js');
    const template = read('packages/admin-items/admin-items.wxml');

    expect(template).toContain('data-tab="lottery"');
    expect(template).toContain('预计中奖概率 {{item._probability}}%');
    expect(template).toContain('data-kind="lotteryTheme"');
    expect(template).toContain('data-kind="lotteryPhysicalItem"');
    expect(template).toContain('bindtap="openLotteryTester"');
    expect(template).toContain('仅模拟当前奖池，不发放奖励');
    expect(template).toContain('lottery-color-option');
    expect(template).not.toContain('data-key="sort"');
    expect(template).not.toMatch(/wx:else[^>]*wx:for|wx:for[^>]*wx:else/);
    expect(source).toContain('saveLotteryPrize');
    expect(source).toContain('toggleLotteryPrize');
    expect(source).toContain('deleteLotteryPrize');
    expect(source).toContain('updateLotteryProbability');
    expect(source).toContain('runLotteryTest');
    expect(source).toContain('Math.sin(radians)');
    expect(template).toContain('left:{{item.x}}%;top:{{item.y}}%;');
  });

  it('首次使用时云函数会自动创建奖池集合并填充默认奖品', () => {
    const source = read('cloudfunctions/adminLottery/index.js');

    expect(source).toContain('db.createCollection(COLL)');
    expect(source).toContain('isCollectionMissing');
    expect(source).toContain('await ensureCollection()');
    expect(source).toMatch(/if \(action === 'add'\) \{\s+await ensureDefaults\(\)/);
  });

  it('默认奖池保留原有积分、补签卡和谢谢参与', () => {
    const source = read('utils/storage.js');

    expect(source).toContain("name: '5积分'");
    expect(source).toContain("name: '20积分'");
    expect(source).toContain("name: '1张补签卡'");
    expect(source).toContain("name: '2张补签卡'");
    expect(source).toContain("name: '谢谢参与'");
  });
});
