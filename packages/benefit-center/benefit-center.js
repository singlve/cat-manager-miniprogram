const clouddb = require('../../utils/clouddb.js');
const { getTheme, getInitialThemeData } = require('../../utils/themes.js');
const initialTheme = getInitialThemeData();

function rewardText(item) {
  const amount = Math.max(1, parseInt(item.rewardAmount, 10) || 1);
  if (item.rewardType === 'points') return amount + ' 积分';
  if (item.rewardType === 'card') return amount + ' 张补签卡';
  if (item.rewardType === 'theme_voucher') return amount + ' 张主题兑换券';
  if (item.rewardType === 'draw') return amount + ' 次抽奖机会';
  if (item.rewardType === 'theme') return getTheme(item.themeKey).name;
  if (item.rewardType === 'physical') return '实物礼品 ×' + amount;
  return '福利奖励';
}

function stateMeta(item) {
  const map = {
    available: { text: '可领取', className: 'available' },
    claimed: { text: item.rewardType === 'theme_voucher' ? '待使用' : '已到账', className: 'claimed' },
    used: { text: '已使用', className: 'used' },
    upcoming: { text: '未开始', className: 'upcoming' },
    expired: { text: '已过期', className: 'expired' }
  };
  return map[item.state] || { text: '暂不可领', className: 'expired' };
}

function claimStatusText(claim) {
  if (claim.status === 'unused') return '待使用';
  if (claim.status === 'partially_used') return '部分使用';
  if (claim.status === 'used') {
    return claim.usedThemeKey ? '已兑换 ' + getTheme(claim.usedThemeKey).name : '已使用';
  }
  return '已到账';
}

Page({
  data: {
    loading: true,
    loadError: false,
    claimingId: '',
    campaigns: [],
    claims: [],
    themeVouchers: 0,
    pendingClaims: 0,
    pendingUses: 0,
    themeClass: initialTheme.themeClass
  },

  onShow() {
    const active = getApp().applyTheme();
    this.setData({ themeClass: active.className });
    this.loadBenefit();
  },

  async loadBenefit() {
    this.setData({ loading: true, loadError: false });
    try {
      const status = await clouddb.getBenefitStatus();
      this.applyStatus(status);
    } catch (error) {
      console.error('[benefit-center] load failed:', error);
      this.setData({ loadError: true });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyStatus(status) {
    const currentUser = wx.getStorageSync('currentUser') || {};
    currentUser.themeVouchers = Math.max(0, parseInt(status.themeVouchers, 10) || 0);
    wx.setStorageSync('currentUser', currentUser);
    this.setData({
      campaigns: (status.campaigns || []).map(item => {
        const meta = stateMeta(item);
        return Object.assign({}, item, {
          _rewardText: rewardText(item),
          _stateText: meta.text,
          _stateClass: meta.className,
          _actionText: item.rewardType === 'theme_voucher'
            ? '使用主题兑换券'
            : (item.rewardType === 'physical'
              ? '查看我的背包'
              : (item.rewardType === 'theme'
                ? '查看主题装扮'
                : (item.rewardType === 'draw' ? '去抽奖' : '')))
        });
      }),
      claims: (status.claims || []).map(item => Object.assign({}, item, {
        _rewardText: rewardText(item),
        _statusText: claimStatusText(item),
        _timeText: String(item.claimedAt || '').slice(0, 16).replace('T', ' ')
      })),
      themeVouchers: currentUser.themeVouchers,
      pendingClaims: Math.max(0, parseInt(status.pendingClaims, 10) || 0),
      pendingUses: Math.max(0, parseInt(status.pendingUses, 10) || 0)
    });
  },

  async claimBenefit(e) {
    const campaignId = e.currentTarget.dataset.id;
    if (this.data.claimingId || !campaignId) return;
    this.setData({ claimingId: campaignId });
    try {
      const status = await clouddb.claimBenefit(campaignId);
      this.applyStatus(status);
      wx.showToast({
        title: status.alreadyClaimed ? '已经领取过啦' : '福利已到账',
        icon: status.alreadyClaimed ? 'none' : 'success'
      });
    } catch (error) {
      console.error('[benefit-center] claim failed:', error);
      try {
        const status = await clouddb.getBenefitStatus();
        const claimed = (status.claims || []).some(item => item.campaignId === campaignId);
        this.applyStatus(status);
        wx.showToast({
          title: claimed ? '福利已到账' : (error.message || '领取失败，请重试'),
          icon: claimed ? 'success' : 'none'
        });
      } catch (refreshError) {
        wx.showToast({ title: error.message || '领取失败，请重试', icon: 'none' });
      }
    } finally {
      this.setData({ claimingId: '' });
    }
  },

  useBenefit(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;
    if (item.rewardType === 'theme_voucher') {
      wx.navigateTo({ url: '/packages/points-mall/points-mall?filter=voucher' });
      return;
    }
    if (item.rewardType === 'theme') {
      wx.navigateTo({ url: '/packages/theme-center/theme-center' });
      return;
    }
    if (item.rewardType === 'physical') {
      wx.navigateTo({ url: '/packages/inventory/inventory' });
      return;
    }
    if (item.rewardType === 'draw') {
      wx.switchTab({ url: '/pages/mine/mine' });
    }
  },

  goThemeMall() {
    wx.navigateTo({ url: '/packages/points-mall/points-mall?filter=voucher' });
  },

  async onPullDownRefresh() {
    try { await this.loadBenefit(); } finally { wx.stopPullDownRefresh(); }
  }
});
