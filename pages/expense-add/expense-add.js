// pages/expense-add/expense-add.js
const clouddb = require('../../utils/clouddb.js');
const CATEGORIES = [
  { key: 'food',     icon: '🍖', name: '食品' },
  { key: 'medical',  icon: '💊', name: '医疗' },
  { key: 'toys',     icon: '🧸', name: '玩具' },
  { key: 'grooming', icon: '🛁', name: '洗护' },
  { key: 'supplies', icon: '📦', name: '用品' },
  { key: 'other',    icon: '💰', name: '其他' }
];

Page({
  data: {
    cats: [],
    selectedCatIdx: 0,
    categories: CATEGORIES,
    selectedCategoryIdx: 0,
    amount: '',
    date: '',
    note: '',
    saving: false
  },

  onLoad() {
    // 加载用户猫咪
    clouddb.getCats().then(function(cats) {
      cats = cats || [];
      cats.unshift({ _id: null, name: '公共花销' });
      this.setData({ cats: cats });
    }.bind(this)).catch(function() {});

    // 默认日期：今天
    var now = new Date();
    var d = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    this.setData({ date: d });
  },

  // 宠物选择
  onPetChange(e) {
    this.setData({ selectedCatIdx: Number(e.detail.value) });
  },

  // 分类选择
  selectCategory(e) {
    this.setData({ selectedCategoryIdx: Number(e.currentTarget.dataset.idx) });
  },

  // 金额输入
  onAmountInput(e) {
    var val = e.detail.value;
    // 限制两位小数
    if (/^\.?\d{0,8}(\.\d{0,2})?$/.test(val) || val === '') {
      this.setData({ amount: val });
    } else {
      this.setData({ amount: this.data.amount });
    }
  },

  // 日期选择
  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  // 备注输入
  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  // 保存
  async doSave() {
    var { amount, date, cats, selectedCatIdx, categories, selectedCategoryIdx, note } = this.data;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' }); return;
    }
    if (!date) {
      wx.showToast({ title: '请选择日期', icon: 'none' }); return;
    }

    this.setData({ saving: true });

    var cat = (cats && cats[selectedCatIdx]) || { _id: null, name: '公共花销' };
    var catName = cat._id ? cat.name : '公共花销';
    var category = categories[selectedCategoryIdx];

    try {
      await clouddb.addExpense({
        petId: cat._id || null,
        petName: catName,
        category: category.key,
        categoryName: category.name,
        categoryIcon: category.icon,
        amount: Number(amount),
        date: date,
        note: note.trim(),
        createdAt: new Date().toISOString()
      });

      wx.showToast({ title: '记账成功 💰', icon: 'success' });
      setTimeout(function() { wx.navigateBack(); }, 1000);
    } catch (e) {
      console.error('[expense-add] save fail:', e);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      this.setData({ saving: false });
    }
  },

  onShareAppMessage() {
    return { title: '我给宠物记账了 💰', path: '/pages/expense/expense' };
  }
});
