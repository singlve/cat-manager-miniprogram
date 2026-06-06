// pages/expense-add/expense-add.js
const clouddb = require('../../utils/clouddb.js');
const EXPENSE_CATEGORIES = [
  { key: 'food', iconPath: '/assets/icons/expense/food.png', name: '食品', tone: 'orange' },
  { key: 'medical', iconPath: '/assets/icons/expense/medical.png', name: '医疗', tone: 'red' },
  { key: 'toys', iconPath: '/assets/icons/expense/toys.png', name: '玩具', tone: 'green' },
  { key: 'grooming', iconPath: '/assets/icons/expense/grooming.png', name: '洗护', tone: 'blue' },
  { key: 'supplies', iconPath: '/assets/icons/expense/supplies.png', name: '用品', tone: 'purple' },
  { key: 'other', iconPath: '/assets/icons/expense/other.png', name: '其他', tone: 'gray' }
];

Page({
  data: {
    cats: [],
    selectedCatIdx: 0,
    categories: EXPENSE_CATEGORIES,
    selectedCategoryIdx: 0,
    amount: '',
    date: '',
    note: '',
    saving: false,
    showPetPicker: false
  },

  onLoad() {
    // 加载用户猫咪
    clouddb.getCats().then(function(cats) {
      cats = (cats || []).slice(); // 复制一份，避免污染缓存
      cats.unshift({ _id: null, name: '公共花销' });
      this.setData({ cats: cats });
    }.bind(this)).catch(function(e) {
      console.error('[expense-add] load cats fail:', e);
      this.setData({ cats: [{ _id: null, name: '公共花销' }] });
    }.bind(this));

    // 默认日期：今天
    var now = new Date();
    var d = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    this.setData({ date: d });
  },

  // 宠物选择
  onPetChange(e) {
    this.setData({ selectedCatIdx: Number(e.detail.value) });
  },

  openPetPicker() {
    if (!this.data.cats.length) return;
    this.setData({ showPetPicker: true });
  },

  closePetPicker() {
    this.setData({ showPetPicker: false });
  },

  selectPet(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!this.data.cats[index]) return;
    this.setData({ selectedCatIdx: index, showPetPicker: false });
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
    if (this.data.saving) return;
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
        categoryIcon: category.iconPath,
        amount: Number(amount),
        date: date,
        note: note.trim(),
        createdAt: new Date().toISOString()
      });

      wx.showToast({ title: '记账成功', icon: 'success' });
      setTimeout(function() { wx.navigateBack(); }, 1000);
    } catch (e) {
      console.error('[expense-add] save fail:', e);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: '来看看我的宠物日常账单', path: '/pages/expense/expense' };
  }
});
