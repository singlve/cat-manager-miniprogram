import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  SUBSCRIBE_TMPL_ID,
  getSubscribeState,
  getLatestNotifyResult,
  getAuthorizationCopy
} = require('../utils/reminder-notifications.js');

describe('提醒通知可靠性状态', () => {
  it('识别订阅授权、拒绝和总开关关闭', () => {
    expect(getSubscribeState({ subscriptionsSetting: { itemSettings: { [SUBSCRIBE_TMPL_ID]: 'accept' } } })).toBe('accepted');
    expect(getSubscribeState({ subscriptionsSetting: { itemSettings: { [SUBSCRIBE_TMPL_ID]: 'reject' } } })).toBe('rejected');
    expect(getSubscribeState({ subscriptionsSetting: { mainSwitch: false } })).toBe('disabled');
  });

  it('展示最近成功结果', () => {
    expect(getLatestNotifyResult([{ lastNotifyStatus: 'success', lastNotifiedAt: 2, lastNotifiedDate: '2026-06-07' }])).toEqual({
      status: 'success',
      text: '最近一次发送成功',
      detail: '2026-06-07'
    });
  });

  it('将用户拒绝错误转换成可操作提示', () => {
    const result = getLatestNotifyResult([{ lastNotifyStatus: 'failed', lastNotifyAttemptAt: 3, lastNotifyErrorCode: 43101 }]);
    expect(result.status).toBe('failed');
    expect(result.detail).toContain('重新开启');
  });

  it('未授权时提示用户主动开启', () => {
    expect(getAuthorizationCopy('rejected').title).toContain('未授权');
  });
});
