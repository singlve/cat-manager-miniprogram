const clouddb = require('../../utils/clouddb.js');
const { isAdmin } = require('../../utils/util.js');
const { THEMES, syncPageTheme } = require('../../utils/themes.js');

const REWARD_TYPES = [
  { value: 'points', label: '积分' },
  { value: 'card', label: '补签卡' },
  { value: 'theme_voucher', label: '主题券' },
  { value: 'theme', label: '指定主题' },
  { value: 'draw', label: '抽奖次数' },
  { value: 'physical', label: '实物奖品' }
];

function emptyForm() {
  return {
    title: '',
    desc: '',
    rewardType: 'points',
    rewardAmount: 100,
    maxThemePoints: 1000,
    themeKey: '',
    linkedItemId: '',
    audience: 'all',
    newUserSince: '',
    startAt: '',
    endAt: '',
    enabled: true,
    sort: 10
  };
}

function formatTime(value) {
  if (!value) return '长期有效';
  return String(value).slice(0, 16).replace('T', ' ');
}

function rewardText(item) {
  const amount = Math.max(1, parseInt(item.rewardAmount, 10) || 1);
  if (item.rewardType === 'points') return amount + ' 积分';
  if (item.rewardType === 'card') return amount + ' 张补签卡';
  if (item.rewardType === 'theme_voucher') return amount + ' 张主题券';
  if (item.rewardType === 'draw') return amount + ' 次抽奖';
  if (item.rewardType === 'theme') {
    const theme = THEMES.find(row => row.key === item.themeKey);
    return theme ? theme.name : '指定主题';
  }
  return '实物奖品 ×' + amount;
}

Page({
  data: {
    isAdmin: false,
    loading: true,
    loadError: false,
    activeTab: 'campaigns',
    campaigns: [],
    claims: [],
    physicalItems: [],
    themes: THEMES.filter(item => item.key !== 'default'),
    rewardTypes: REWARD_TYPES,
    showEditor: false,
    editingId: '',
    form: emptyForm(),
    saving: false
  },

  async onLoad() {
    this.setData({ isAdmin: isAdmin() });
    if (!this.data.isAdmin) {
      wx.showToast({ title: '无权访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
    }
  },

  async onShow() {
    syncPageTheme(this);
    if (this.data.isAdmin) await this.loadAll();
  },

  async loadAll() {
    this.setData({ loading: true, loadError: false });
    try {
      const [campaigns, claims, items] = await Promise.all([
        clouddb.getBenefitCampaignsAdmin(),
        clouddb.getBenefitClaimsAdmin(),
        clouddb.getRedeemItems()
      ]);
      const physicalItems = (items || []).filter(item => item.type === 'physical');
      const itemMap = {};
      physicalItems.forEach(item => { itemMap[item._id] = item.name; });
      this.setData({
        campaigns: (campaigns || []).map(item => Object.assign({}, item, {
          _rewardText: rewardText(item),
          _timeText: item.startAt || item.endAt
            ? formatTime(item.startAt) + ' 至 ' + formatTime(item.endAt)
            : '长期有效'
        })),
        claims: (claims || []).map(item => Object.assign({}, item, {
          _rewardText: rewardText(item),
          _timeText: formatTime(item.claimedAt),
          _statusText: {
            unused: '待使用',
            partially_used: '部分使用',
            used: '已使用',
            fulfilled: '已到账'
          }[item.status] || '已领取'
        })),
        physicalItems,
        loading: false
      });
    } catch (error) {
      console.error('[admin-benefits] load failed:', error);
      this.setData({ loading: false, loadError: true });
    }
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  openAdd() {
    this.setData({ showEditor: true, editingId: '', form: emptyForm() });
  },

  openEdit(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      showEditor: true,
      editingId: item._id,
      form: Object.assign(emptyForm(), item)
    });
  },

  closeEditor() {
    if (this.data.saving) return;
    this.setData({ showEditor: false, editingId: '', form: emptyForm() });
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value });
  },

  selectRewardType(e) {
    this.setData({ 'form.rewardType': e.currentTarget.dataset.value });
  },

  selectAudience(e) {
    this.setData({ 'form.audience': e.currentTarget.dataset.value });
  },

  selectTheme(e) {
    this.setData({ 'form.themeKey': e.currentTarget.dataset.key });
  },

  selectPhysical(e) {
    this.setData({ 'form.linkedItemId': e.currentTarget.dataset.id });
  },

  toggleFormEnabled(e) {
    this.setData({ 'form.enabled': e.detail.value });
  },

  async saveCampaign() {
    if (this.data.saving) return;
    const form = Object.assign({}, this.data.form, {
      rewardAmount: parseInt(this.data.form.rewardAmount, 10) || 1,
      maxThemePoints: parseInt(this.data.form.maxThemePoints, 10) || 1000,
      sort: parseInt(this.data.form.sort, 10) || 0
    });
    if (!String(form.title || '').trim()) {
      wx.showToast({ title: '请输入福利名称', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    try {
      await clouddb.saveBenefitCampaign(this.data.editingId, form);
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ showEditor: false, editingId: '', form: emptyForm() });
      await this.loadAll();
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async toggleCampaign(e) {
    const item = e.currentTarget.dataset.item;
    try {
      await clouddb.toggleBenefitCampaign(item._id, e.detail.value);
      await this.loadAll();
    } catch (error) {
      wx.showToast({ title: error.message || '更新失败', icon: 'none' });
      await this.loadAll();
    }
  },

  deleteCampaign(e) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '删除福利活动',
      content: '仅未被领取的活动可以删除；已有领取记录的活动请改为停用。',
      confirmText: '继续删除',
      confirmColor: '#F36B6B',
      success: res => {
        if (!res.confirm) return;
        wx.showModal({
          title: '再次确认',
          content: '删除后无法恢复，确定删除「' + item.title + '」吗？',
          confirmText: '确认删除',
          confirmColor: '#F36B6B',
          success: async second => {
            if (!second.confirm) return;
            try {
              await clouddb.deleteBenefitCampaign(item._id);
              wx.showToast({ title: '已删除', icon: 'success' });
              await this.loadAll();
            } catch (error) {
              wx.showToast({ title: error.message || '删除失败', icon: 'none' });
            }
          }
        });
      }
    });
  },

  stopBubble() {},

  async onPullDownRefresh() {
    try { await this.loadAll(); } finally { wx.stopPullDownRefresh(); }
  }
});
