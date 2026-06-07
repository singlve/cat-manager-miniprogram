import { beforeEach, describe, expect, it } from 'vitest';

import {
  addRecord,
  addReminder,
  addExpense,
  addWeightRecord,
  getCats,
  getAllExpenses,
  getRecords,
  getReminders,
  getWeightRecords,
  removeCat,
  saveCats,
  updateExpense
} from '../utils/storage.js';

describe('本地存储数据一致性', () => {
  let store;

  beforeEach(() => {
    store = {};
    global.wx = {
      getStorageSync(key) {
        return store[key] || '';
      },
      setStorageSync(key, value) {
        store[key] = value;
      }
    };
  });

  it('删除宠物时同步删除该宠物的全部关联数据', () => {
    saveCats([
      { _id: 'cat_1', name: '橘座' },
      { _id: 'cat_2', name: '雪球' }
    ]);
    addRecord({ _id: 'record_1', catId: 'cat_1', type: 'bath' });
    addRecord({ _id: 'record_2', catId: 'cat_2', type: 'vaccine' });
    addReminder({ _id: 'remind_1', catId: 'cat_1', type: 'deworm' });
    addReminder({ _id: 'remind_2', catId: 'cat_2', type: 'checkup' });
    addWeightRecord({ _id: 'weight_1', catId: 'cat_1', weight: 4.2 });
    addWeightRecord({ _id: 'weight_2', catId: 'cat_2', weight: 3.8 });
    addExpense({ _id: 'expense_1', petId: 'cat_1', amount: 20 });
    addExpense({ _id: 'expense_2', petId: 'cat_2', amount: 30 });
    addExpense({ _id: 'expense_public', petId: null, amount: 10 });

    removeCat('cat_1');

    expect(getCats()).toEqual([{ _id: 'cat_2', name: '雪球' }]);
    expect(getRecords()).toEqual([{ _id: 'record_2', catId: 'cat_2', type: 'vaccine' }]);
    expect(getReminders()).toEqual([{ _id: 'remind_2', catId: 'cat_2', type: 'checkup' }]);
    expect(getWeightRecords()).toEqual([{ _id: 'weight_2', catId: 'cat_2', weight: 3.8 }]);
    expect(getAllExpenses().map(item => item._id)).toEqual(['expense_public', 'expense_2']);
  });

  it('编辑账目时保留原记录并更新指定字段', () => {
    addExpense({ _id: 'expense_edit', petId: 'cat_1', amount: 20, note: '旧备注' });
    updateExpense('expense_edit', { amount: 35, note: '新备注' });
    expect(getAllExpenses()).toEqual([
      expect.objectContaining({ _id: 'expense_edit', petId: 'cat_1', amount: 35, note: '新备注' })
    ]);
  });
});
