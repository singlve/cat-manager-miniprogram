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

const CLAIM_STATUS_FILTERS = [
  { value: 'all', label: '全部状态' },
  { value: 'fulfilled', label: '已到账' },
  { value: 'unused', label: '待使用' },
  { value: 'used', label: '已使用' }
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatLocalIso(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offset = Math.abs(offsetMinutes);
  return date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + 'T' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes()) + ':00' +
    sign + pad(Math.floor(offset / 60)) + ':' + pad(offset % 60);
}

function timeParts(value, fallback) {
  const parsed = value ? new Date(value) : null;
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallback;
  if (!date) return { date: '', time: '' };
  return {
    date: date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()),
    time: pad(date.getHours()) + ':' + pad(date.getMinutes())
  };
}

function buildLocalIso(dateValue, timeValue) {
  if (!dateValue || !timeValue) return '';
  const dateParts = dateValue.split('-').map(Number);
  const clockParts = timeValue.split(':').map(Number);
  const date = new Date(
    dateParts[0],
    dateParts[1] - 1,
    dateParts[2],
    clockParts[0],
    clockParts[1],
    0
  );
  return formatLocalIso(date);
}

function emptyForm() {
  const now = new Date();
  const start = timeParts('', now);
  return {
    title: '',
    desc: '',
    rewardType: 'points',
    rewardAmount: 1,
    maxThemePoints: 1000,
    themeKey: '',
    linkedItemId: '',
    audience: 'all',
    totalQuota: 100,
    newUserSince: '',
    newUserSinceDate: '',
    newUserSinceTime: '',
    startAt: formatLocalIso(now),
    startAtDate: start.date,
    startAtTime: start.time,
    endAt: '',
    endAtDate: '',
    endAtTime: '',
    enabled: true,
    sort: 1
  };
}

function formatTime(value) {
  if (!value) return '长期有效';
  return String(value).slice(0, 16).replace('T', ' ');
}

function hydrateForm(item) {
  const form = Object.assign(emptyForm(), item);
  if (item.totalQuota === undefined || item.totalQuota === null) form.totalQuota = 0;
  const now = new Date();
  const newUserSince = timeParts(form.newUserSince, form.audience === 'new' ? now : null);
  const startAt = timeParts(form.startAt, now);
  const endAt = timeParts(form.endAt, null);
  form.newUserSince = form.audience === 'new'
    ? (form.newUserSince || buildLocalIso(newUserSince.date, newUserSince.time))
    : '';
  form.newUserSinceDate = newUserSince.date;
  form.newUserSinceTime = newUserSince.time;
  form.startAt = form.startAt || buildLocalIso(startAt.date, startAt.time);
  form.startAtDate = startAt.date;
  form.startAtTime = startAt.time;
  form.endAtDate = endAt.date;
  form.endAtTime = endAt.time;
  return form;
}

function campaignMeta(item) {
  const stateMap = {
    active: { text: '进行中', className: 'active' },
    upcoming: { text: '未开始', className: 'upcoming' },
    expired: { text: '已结束', className: 'expired' },
    disabled: { text: '已停用', className: 'disabled' },
    sold_out: { text: '已领完', className: 'sold-out' }
  };
  const state = stateMap[item.state] || stateMap.active;
  const cutoff = item.audience === 'new' && item.newUserSince
    ? '仅限 ' + formatTime(item.newUserSince) + ' 后注册'
    : '全部登录用户';
  const quota = Math.max(0, parseInt(item.totalQuota, 10) || 0);
  const claimed = Math.max(0, parseInt(item.claimedCount, 10) || 0);
  let endingText = '';
  const end = item.endAt ? new Date(item.endAt).getTime() : 0;
  const remaining = end - Date.now();
  if (state.className === 'active' && remaining > 0 && remaining <= 3 * 86400000) {
    endingText = remaining <= 86400000
      ? '不足 1 天结束'
      : Math.ceil(remaining / 86400000) + ' 天后结束';
  }
  return {
    _statusText: state.text,
    _statusClass: state.className,
    _audienceText: cutoff,
    _quotaText: quota > 0
      ? '已领 ' + claimed + ' / ' + quota + '，剩余 ' + Math.max(0, quota - claimed)
      : '已领 ' + claimed + '，不限总份数',
    _endingText: endingText
  };
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
    filteredClaims: [],
    claimCampaignOptions: [{ value: 'all', label: '全部活动' }],
    claimCampaignFilter: 'all',
    claimStatusFilters: CLAIM_STATUS_FILTERS,
    claimStatusFilter: 'all',
    physicalItems: [],
    themes: THEMES.filter(item => item.key !== 'default'),
    rewardTypes: REWARD_TYPES,
    showEditor: false,
    editingId: '',
    form: emptyForm(),
    audiencePreview: null,
    previewingAudience: false,
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
        clouddb.getRedeemItems({ admin: true })
      ]);
      const physicalItems = (items || []).filter(item => item.type === 'physical');
      const itemMap = {};
      physicalItems.forEach(item => { itemMap[item._id] = item.name; });
      const campaignRows = (campaigns || []).map(item => Object.assign({}, item, campaignMeta(item), {
        _rewardText: rewardText(item),
        _timeText: item.startAt || item.endAt
          ? formatTime(item.startAt) + ' 至 ' + formatTime(item.endAt)
          : '长期有效'
      }));
      const claimRows = (claims || []).map(item => Object.assign({}, item, {
        _rewardText: rewardText(item),
        _timeText: formatTime(item.claimedAt),
        _statusText: {
          unused: '待使用',
          partially_used: '部分使用',
          used: '已使用',
          fulfilled: '已到账'
        }[item.status] || '已领取'
      }));
      this.setData({
        campaigns: campaignRows,
        claims: claimRows,
        claimCampaignOptions: [{ value: 'all', label: '全部活动' }].concat(
          campaignRows.map(item => ({ value: item._id, label: item.title }))
        ),
        physicalItems,
        loading: false
      });
      this.applyClaimFilters();
    } catch (error) {
      console.error('[admin-benefits] load failed:', error);
      this.setData({ loading: false, loadError: true });
    }
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  openAdd() {
    this.setData({
      showEditor: true,
      editingId: '',
      form: emptyForm(),
      audiencePreview: null
    });
  },

  openEdit(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      showEditor: true,
      editingId: item._id,
      form: hydrateForm(item),
      audiencePreview: item.eligibleUsers
    });
  },

  copyCampaign(e) {
    const item = e.currentTarget.dataset.item;
    const form = hydrateForm(Object.assign({}, item, {
      title: item.title + ' 副本',
      startAt: '',
      endAt: '',
      totalQuota: item.totalQuota === undefined ? 100 : item.totalQuota
    }));
    this.setData({
      showEditor: true,
      editingId: '',
      form,
      audiencePreview: null
    });
  },

  closeEditor() {
    if (this.data.saving) return;
    this.setData({
      showEditor: false,
      editingId: '',
      form: emptyForm(),
      audiencePreview: null
    });
  },

  onInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.key]: e.detail.value });
  },

  selectRewardType(e) {
    const rewardType = e.currentTarget.dataset.value;
    if (rewardType === this.data.form.rewardType) return;
    this.setData({
      'form.rewardType': rewardType,
      'form.rewardAmount': 1,
      'form.themeKey': '',
      'form.linkedItemId': ''
    });
  },

  selectAudience(e) {
    const audience = e.currentTarget.dataset.value;
    const updates = { 'form.audience': audience };
    if (audience === 'new' && !this.data.form.newUserSince) {
      const now = new Date();
      const parts = timeParts('', now);
      updates['form.newUserSince'] = formatLocalIso(now);
      updates['form.newUserSinceDate'] = parts.date;
      updates['form.newUserSinceTime'] = parts.time;
    }
    updates.audiencePreview = null;
    this.setData(updates);
  },

  onTimePartChange(e) {
    const key = e.currentTarget.dataset.key;
    const part = e.currentTarget.dataset.part;
    const value = e.detail.value;
    const dateKey = key + 'Date';
    const timeKey = key + 'Time';
    const nowParts = timeParts('', new Date());
    const dateValue = part === 'date'
      ? value
      : (this.data.form[dateKey] || nowParts.date);
    const timeValue = part === 'time'
      ? value
      : (this.data.form[timeKey] || nowParts.time);
    this.setData({
      ['form.' + dateKey]: dateValue,
      ['form.' + timeKey]: timeValue,
      ['form.' + key]: buildLocalIso(dateValue, timeValue),
      audiencePreview: key === 'newUserSince' ? null : this.data.audiencePreview
    });
  },

  clearEndTime() {
    this.setData({
      'form.endAt': '',
      'form.endAtDate': '',
      'form.endAtTime': ''
    });
  },

  async previewAudience() {
    if (this.data.previewingAudience) return;
    this.setData({ previewingAudience: true });
    try {
      const result = await clouddb.previewBenefitAudience(this.data.form);
      this.setData({ audiencePreview: result.eligibleUsers || 0 });
    } catch (error) {
      wx.showToast({ title: error.message || '预估失败', icon: 'none' });
    } finally {
      this.setData({ previewingAudience: false });
    }
  },

  selectClaimCampaign(e) {
    this.setData({ claimCampaignFilter: e.currentTarget.dataset.value });
    this.applyClaimFilters();
  },

  selectClaimStatus(e) {
    this.setData({ claimStatusFilter: e.currentTarget.dataset.value });
    this.applyClaimFilters();
  },

  applyClaimFilters() {
    const campaignId = this.data.claimCampaignFilter;
    const status = this.data.claimStatusFilter;
    const filteredClaims = (this.data.claims || []).filter(item => {
      if (campaignId !== 'all' && item.campaignId !== campaignId) return false;
      if (status === 'all') return true;
      if (status === 'unused') {
        return item.status === 'unused' || item.status === 'partially_used';
      }
      return item.status === status;
    });
    this.setData({ filteredClaims });
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
      totalQuota: Math.max(0, parseInt(this.data.form.totalQuota, 10) || 0),
      sort: parseInt(this.data.form.sort, 10) || 0
    });
    if (!String(form.title || '').trim()) {
      wx.showToast({ title: '请输入福利名称', icon: 'none' });
      return;
    }
    if (form.audience === 'new' &&
        (!form.newUserSince || Number.isNaN(new Date(form.newUserSince).getTime()))) {
      wx.showToast({ title: '请填写有效的新用户注册起算时间', icon: 'none' });
      return;
    }
    if (!form.startAt || Number.isNaN(new Date(form.startAt).getTime())) {
      wx.showToast({ title: '请选择有效的活动开始时间', icon: 'none' });
      return;
    }
    if (form.endAt && Number.isNaN(new Date(form.endAt).getTime())) {
      wx.showToast({ title: '请选择有效的活动结束时间', icon: 'none' });
      return;
    }
    if (form.endAt && new Date(form.startAt).getTime() >= new Date(form.endAt).getTime()) {
      wx.showToast({ title: '结束时间必须晚于开始时间', icon: 'none' });
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
