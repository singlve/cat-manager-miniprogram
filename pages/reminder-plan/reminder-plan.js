const clouddb = require('../../utils/clouddb.js');
const { REMINDER_PLANS, getTypeMeta, getPlanById } = require('../../utils/reminder-plans.js');
const { parseDate } = require('../../utils/util.js');

const SUBSCRIBE_TMPL_ID = 'BMr3A8IZjnDrHnIxsIUZU4LX7khHdVrFo8F2aN7Fu8U';

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function getPetStage(cat) {
  if (!cat || !cat.birthday) return 'unknown';
  const birth = parseDate(cat.birthday);
  if (Number.isNaN(birth.getTime())) return 'unknown';
  const ageDays = Math.floor((Date.now() - birth.getTime()) / 86400000);
  if (ageDays < 365) return 'young';
  if (ageDays >= 365 * 7) return 'senior';
  return 'adult';
}

function decoratePlans(cat) {
  const species = (cat && cat.species) || 'cat';
  const stage = getPetStage(cat);
  return REMINDER_PLANS.map(plan => {
    const targetMatched = plan.target === 'all' || plan.target === species;
    const stageMatched = plan.stage === stage;
    const isRecommended = targetMatched && (stage === 'unknown' ? true : stageMatched || plan.target === 'all');
    return {
      ...plan,
      isRecommended,
      sortScore: (isRecommended ? 100 : 0) + (stageMatched ? 20 : 0) + (plan.target === species ? 10 : 0),
      itemCount: plan.items.length,
      itemSummary: plan.items.map(item => getTypeMeta(item.type).label).join(' · '),
      targetText: plan.target === 'cat' ? '猫猫' : plan.target === 'dog' ? '狗狗' : '通用'
    };
  }).sort((a, b) => {
    if (a.sortScore !== b.sortScore) return b.sortScore - a.sortScore;
    return REMINDER_PLANS.findIndex(plan => plan.id === a.id) - REMINDER_PLANS.findIndex(plan => plan.id === b.id);
  });
}

function getDefaultPlanForCat(cat) {
  const decorated = decoratePlans(cat);
  return decorated.find(plan => plan.isRecommended) || decorated[0] || REMINDER_PLANS[0];
}

function withPreviewText(item) {
  const nextDate = addDays(item.lastDate, item.intervalDays);
  const sourceText = item.sourceText || '从计划开始日期计算';
  return {
    ...item,
    nextDate,
    sourceText,
    metaText: `每 ${item.intervalDays} 天 · 上次 ${item.lastDate}`,
    nextText: item.status === 'skip' ? `现有提醒：下次 ${nextDate}` : `下次提醒 ${nextDate} · ${sourceText}`
  };
}

Page({
  data: {
    cats: [],
    plans: decoratePlans({ species: 'cat' }),
    selectedCatId: '',
    selectedCatName: '',
    selectedCatSpecies: 'cat',
    selectedCatIndex: -1,
    planStartDate: formatDate(new Date()),
    selectedPlanId: REMINDER_PLANS[0].id,
    selectedPlan: REMINDER_PLANS[0],
    previewItems: [],
    createCount: 0,
    skipCount: 0,
    generateButtonText: '生成提醒',
    loading: true,
    saving: false,
    noCatsAvailable: false,
    showCatPicker: false,
    showPreviewEditor: false,
    editingType: '',
    editingTypeLabel: '',
    editLastDate: '',
    editIntervalDaysRaw: '',
    editNote: ''
  },

  async onLoad(options) {
    const app = getApp();
    if (!app.isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    await this.loadCats(options.catId || '');
  },

  async loadCats(preferredCatId) {
    this.setData({ loading: true });
    try {
      let cats = await clouddb.getCats();
      cats = cats.filter(cat => cat.status !== 'passed_away');
      if (!cats.length) {
        this.setData({ cats, loading: false, noCatsAvailable: true });
        return;
      }
      const selectedCatIndex = preferredCatId ? Math.max(0, cats.findIndex(cat => cat._id === preferredCatId)) : 0;
      const cat = cats[selectedCatIndex];
      const selectedPlan = getDefaultPlanForCat(cat);
      this.setData({
        cats,
        plans: decoratePlans(cat),
        selectedCatId: cat._id,
        selectedCatName: cat.name,
        selectedCatSpecies: cat.species || 'cat',
        selectedCatIndex,
        selectedPlanId: selectedPlan.id,
        selectedPlan,
        noCatsAvailable: false
      });
      await this.buildPreview();
    } catch (e) {
      console.error('[reminder-plan] loadCats error:', e);
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  openCatPicker() {
    if (!this.data.cats.length) return;
    this.setData({ showCatPicker: true });
  },

  closeCatPicker() {
    this.setData({ showCatPicker: false });
  },

  async selectCat(e) {
    const index = Number(e.currentTarget.dataset.index);
    const cat = this.data.cats[index];
    if (!cat) return;
    const selectedPlan = getDefaultPlanForCat(cat);
    this.setData({
      plans: decoratePlans(cat),
      selectedCatId: cat._id,
      selectedCatName: cat.name,
      selectedCatSpecies: cat.species || 'cat',
      selectedCatIndex: index,
      selectedPlanId: selectedPlan.id,
      selectedPlan,
      showCatPicker: false
    });
    await this.buildPreview();
  },

  async selectPlan(e) {
    const id = e.currentTarget.dataset.id;
    const selectedPlan = getPlanById(id);
    this.setData({ selectedPlanId: id, selectedPlan });
    await this.buildPreview();
  },

  async onPlanStartDateChange(e) {
    this.setData({ planStartDate: e.detail.value });
    await this.buildPreview();
  },

  async buildPreview() {
    const { selectedCatId, selectedPlan, planStartDate } = this.data;
    if (!selectedCatId || !selectedPlan) {
      this.setData({ previewItems: [], createCount: 0, skipCount: 0, generateButtonText: '无需新增提醒', loading: false });
      return;
    }

    this.setData({ loading: true });
    try {
      const [records, reminders] = await Promise.all([
        clouddb.getRecords({ catId: selectedCatId }),
        clouddb.getReminders({ catId: selectedCatId })
      ]);
      const today = formatDate(new Date());
      const previewItems = selectedPlan.items.map(item => {
        const meta = getTypeMeta(item.type);
        const latestRecord = records
          .filter(record => record.type === item.type && record.date)
          .sort((a, b) => parseDate(b.date) - parseDate(a.date))[0];
        const existing = reminders.find(reminder => reminder.type === item.type && !reminder.completedAt);
        const startDate = planStartDate || today;
        const lastDate = existing
          ? String(existing.lastDate || startDate).slice(0, 10)
          : (latestRecord ? String(latestRecord.date).slice(0, 10) : startDate);
        const intervalDays = existing ? existing.intervalDays : item.intervalDays;
        return withPreviewText({
          type: item.type,
          typeLabel: meta.label,
          iconPath: meta.iconPath,
          intervalDays,
          lastDate,
          note: item.note || '',
          sourceText: latestRecord ? '来自最近健康记录' : '从计划开始日期计算',
          status: existing ? 'skip' : 'create',
          checked: !existing,
          statusText: existing ? '已存在' : '将创建'
        });
      });
      const createCount = previewItems.filter(item => item.status === 'create' && item.checked).length;
      const skipCount = previewItems.filter(item => item.status === 'skip').length;
      this.setData({
        previewItems,
        createCount,
        skipCount,
        generateButtonText: createCount === 0 ? '无需新增提醒' : `生成 ${createCount} 条提醒`,
        loading: false
      });
    } catch (e) {
      console.error('[reminder-plan] buildPreview error:', e);
      wx.showToast({ title: '预览失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  togglePreviewItem(e) {
    const type = e.currentTarget.dataset.type;
    const previewItems = this.data.previewItems.map(item => {
      if (item.type !== type || item.status !== 'create') return item;
      const checked = !item.checked;
      return { ...item, checked, statusText: checked ? '将创建' : '未选择' };
    });
    const createCount = previewItems.filter(item => item.status === 'create' && item.checked).length;
    const skipCount = previewItems.filter(item => item.status === 'skip').length;
    this.setData({
      previewItems,
      createCount,
      skipCount,
      generateButtonText: createCount === 0 ? '请选择提醒项' : `生成 ${createCount} 条提醒`
    });
  },

  selectAllPreviewItems() {
    const previewItems = this.data.previewItems.map(item => {
      if (item.status !== 'create') return item;
      return { ...item, checked: true, statusText: '将创建' };
    });
    const createCount = previewItems.filter(item => item.status === 'create' && item.checked).length;
    const skipCount = previewItems.filter(item => item.status === 'skip').length;
    this.setData({
      previewItems,
      createCount,
      skipCount,
      generateButtonText: createCount === 0 ? '无需新增提醒' : `生成 ${createCount} 条提醒`
    });
  },

  clearPreviewItems() {
    const previewItems = this.data.previewItems.map(item => {
      if (item.status !== 'create') return item;
      return { ...item, checked: false, statusText: '未选择' };
    });
    const skipCount = previewItems.filter(item => item.status === 'skip').length;
    this.setData({
      previewItems,
      createCount: 0,
      skipCount,
      generateButtonText: '请选择提醒项'
    });
  },

  openPreviewEditor(e) {
    const type = e.currentTarget.dataset.type;
    const item = this.data.previewItems.find(preview => preview.type === type && preview.status === 'create');
    if (!item) return;
    this.setData({
      showPreviewEditor: true,
      editingType: item.type,
      editingTypeLabel: item.typeLabel,
      editLastDate: item.lastDate,
      editIntervalDaysRaw: String(item.intervalDays || ''),
      editNote: item.note || ''
    });
  },

  closePreviewEditor() {
    this.setData({
      showPreviewEditor: false,
      editingType: '',
      editingTypeLabel: '',
      editLastDate: '',
      editIntervalDaysRaw: '',
      editNote: ''
    });
  },

  onEditLastDateChange(e) {
    this.setData({ editLastDate: e.detail.value });
  },

  onEditIntervalInput(e) {
    this.setData({ editIntervalDaysRaw: e.detail.value });
  },

  onEditNoteInput(e) {
    this.setData({ editNote: e.detail.value });
  },

  savePreviewEdit() {
    const { editingType, editLastDate, editIntervalDaysRaw, editNote } = this.data;
    const intervalDays = Number(editIntervalDaysRaw);
    if (!editLastDate) {
      wx.showToast({ title: '请选择上次时间', icon: 'none' });
      return;
    }
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
      wx.showToast({ title: '周期需为1-365天', icon: 'none' });
      return;
    }

    const previewItems = this.data.previewItems.map(item => {
      if (item.type !== editingType || item.status !== 'create') return item;
      return withPreviewText({
        ...item,
        lastDate: editLastDate,
        intervalDays,
        note: (editNote || '').trim(),
        sourceText: '已手动调整'
      });
    });
    this.setData({ previewItems });
    this.closePreviewEditor();
  },

  generatePlan() {
    if (this.data.saving) return;
    const willCreate = this.data.previewItems.filter(item => item.status === 'create' && item.checked);
    if (!willCreate.length) {
      wx.showToast({ title: '请选择要生成的提醒', icon: 'none' });
      return;
    }

    const doSave = () => this._doGeneratePlan(willCreate);
    wx.showModal({
      title: '确认生成提醒',
      content: `将为${this.data.selectedCatName}生成 ${willCreate.length} 条提醒，跳过 ${this.data.skipCount} 条已有提醒。是否继续？`,
      confirmText: '生成',
      cancelText: '再看看',
      success: res => {
        if (!res.confirm) return;
        this._requestSubscribeThenSave(doSave);
      }
    });
  },

  _requestSubscribeThenSave(doSave) {
    if (SUBSCRIBE_TMPL_ID) {
      wx.requestSubscribeMessage({
        tmplIds: [SUBSCRIBE_TMPL_ID],
        complete: doSave
      });
    } else {
      doSave();
    }
  },

  async _doGeneratePlan(willCreate) {
    const { selectedCatId, selectedCatName, selectedPlan } = this.data;
    this.setData({ saving: true });
    wx.showLoading({ title: '生成中...' });
    try {
      await Promise.all(willCreate.map((item, index) => clouddb.addReminder({
        _id: 'rem_' + Date.now() + '_' + index,
        catId: selectedCatId,
        catName: selectedCatName,
        type: item.type,
        lastDate: item.lastDate,
        intervalDays: item.intervalDays,
        note: item.note,
        planId: selectedPlan.id,
        planName: selectedPlan.name
      })));
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showModal({
        title: '生成完成',
        content: `已生成 ${willCreate.length} 条提醒，跳过 ${this.data.skipCount} 条已有提醒。`,
        showCancel: false,
        confirmText: '查看提醒',
        success: () => {
          wx.setStorageSync('reminderPlanGenerated', {
            at: Date.now(),
            catId: selectedCatId
          });
          wx.navigateBack();
        }
      });
    } catch (e) {
      console.error('[reminder-plan] generate error:', e);
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: '生成失败，请重试', icon: 'none' });
    }
  },

  goAddPet() {
    wx.navigateTo({ url: '/pages/cat-add/cat-add' });
  }
});
