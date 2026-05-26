import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getActiveAnnouncement } from '../utils/clouddb.js';

describe('公告公开读取', () => {
  beforeEach(() => {
    global.getApp = () => ({ globalData: { cloudReady: true } });
    global.wx = {
      cloud: {
        callFunction: vi.fn()
      }
    };
  });

  it('普通用户读取当前启用公告时调用公开 active action', async () => {
    const active = { _id: 'ann_1', content: '留言板开放中', isActive: true };
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: { code: 0, data: active }
    });

    await expect(getActiveAnnouncement()).resolves.toEqual(active);
    expect(wx.cloud.callFunction).toHaveBeenCalledWith({
      name: 'adminAnnouncement',
      data: { action: 'active' }
    });
  });

  it('没有启用公告时返回 null，留言板入口应保持隐藏', async () => {
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: { code: 0, data: null }
    });

    await expect(getActiveAnnouncement()).resolves.toBeNull();
  });

  it('公告读取失败时返回 null，不影响页面继续渲染', async () => {
    wx.cloud.callFunction.mockResolvedValueOnce({
      result: { code: -1, msg: '无管理员权限' }
    });

    await expect(getActiveAnnouncement()).resolves.toBeNull();
  });
});
