// pages/expense-add/expense-add.js
const clouddb = require('../../utils/clouddb.js');
const { getExpenseCategories } = require('../../utils/expense-categories.js');
const EXPENSE_CATEGORIES = getExpenseCategories('default');

const { syncPageTheme } = require('../../utils/themes.js');

Page({
  onShow() {
    var theme = syncPageTheme(this);
    this.setData({ categories: getExpenseCategories(theme.key) });
  },

  data: {
    cats: [],
    selectedCatIdx: 0,
    categories: EXPENSE_CATEGORIES,
    selectedCategoryIdx: 0,
    amount: '',
    date: '',
    note: '',
    saving: false,
    showPetPicker: false,
    isEdit: false,
    editId: ''
  },

  async onLoad(options) {
    // 加载用户猫咪
    await clouddb.getCats().then(function(cats) {
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
    if (options && options.id) await this.loadExpense(options.id);
  },

  async loadExpense(id) {
    const list = await clouddb.getExpenses();
    const expense = (list || []).find(item => item._id === id);
    if (!expense) {
      wx.showToast({ title: '账目不存在', icon: 'none' });
      return;
    }
    const catIndex = Math.max(0, this.data.cats.findIndex(cat => (cat._id || null) === (expense.petId || null)));
    const categoryIndex = Math.max(0, this.data.categories.findIndex(category => category.key === expense.category));
    this.setData({
      isEdit: true,
      editId: id,
      selectedCatIdx: catIndex,
      selectedCategoryIdx: categoryIndex,
      amount: String(expense.amount || ''),
      date: expense.date || this.data.date,
      note: expense.note || ''
    });
    wx.setNavigationBarTitle({ title: '编辑账目' });
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
      const expenseData = {
        petId: cat._id || null,
        petName: catName,
        category: category.key,
        categoryName: category.name,
        categoryIcon: category.iconPath,
        amount: Number(amount),
        date: date,
        note: note.trim(),
        updatedAt: new Date().toISOString()
      };
      if (this.data.isEdit) {
        await clouddb.updateExpense(this.data.editId, expenseData);
      } else {
        expenseData.createdAt = new Date().toISOString();
        await clouddb.addExpense(expenseData);
      }

      wx.showToast({ title: this.data.isEdit ? '修改成功' : '记账成功', icon: 'success' });
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
