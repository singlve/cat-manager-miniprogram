import { beforeEach, describe, expect, it } from 'vitest';

import {
  addRecord,
  addReminder,
  getCats,
  getRecords,
  getReminders,
  removeCat,
  saveCats
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

  it('删除宠物时同步删除该宠物的健康记录和提醒', () => {
    saveCats([
      { _id: 'cat_1', name: '橘座' },
      { _id: 'cat_2', name: '雪球' }
    ]);
    addRecord({ _id: 'record_1', catId: 'cat_1', type: 'bath' });
    addRecord({ _id: 'record_2', catId: 'cat_2', type: 'vaccine' });
    addReminder({ _id: 'remind_1', catId: 'cat_1', type: 'deworm' });
    addReminder({ _id: 'remind_2', catId: 'cat_2', type: 'checkup' });

    removeCat('cat_1');

    expect(getCats()).toEqual([{ _id: 'cat_2', name: '雪球' }]);
    expect(getRecords()).toEqual([{ _id: 'record_2', catId: 'cat_2', type: 'vaccine' }]);
    expect(getReminders()).toEqual([{ _id: 'remind_2', catId: 'cat_2', type: 'checkup' }]);
  });
});
