const SUBSCRIBE_TMPL_ID = 'BMr3A8IZjnDrHnIxsIUZU4LX7khHdVrFo8F2aN7Fu8U';

function getSubscribeState(settings) {
  const itemSettings = settings && settings.subscriptionsSetting && settings.subscriptionsSetting.itemSettings;
  const value = itemSettings && itemSettings[SUBSCRIBE_TMPL_ID];
  if (value === 'accept') return 'accepted';
  if (value === 'reject') return 'rejected';
  if (settings && settings.subscriptionsSetting && settings.subscriptionsSetting.mainSwitch === false) return 'disabled';
  return 'unknown';
}

function getLatestNotifyResult(reminders) {
  const candidates = (reminders || []).filter(item => item.lastNotifyAttemptAt || item.lastNotifiedAt);
  candidates.sort((a, b) => Number(b.lastNotifyAttemptAt || b.lastNotifiedAt || 0) - Number(a.lastNotifyAttemptAt || a.lastNotifiedAt || 0));
  const latest = candidates[0];
  if (!latest) return { status: 'none', text: '暂无发送记录', detail: '每天 9 点检查，同日多项会合并发送' };
  if (latest.lastNotifyStatus === 'failed') {
    const code = Number(latest.lastNotifyErrorCode || 0);
    if (code === 43101) return { status: 'failed', text: '最近一次发送失败', detail: '订阅授权已失效，请重新开启通知' };
    return { status: 'failed', text: '最近一次发送失败', detail: latest.lastNotifyError || '请稍后重试或检查通知设置' };
  }
  return { status: 'success', text: '最近一次发送成功', detail: latest.lastNotifiedDate || '通知已送达微信' };
}

function getAuthorizationCopy(state) {
  if (state === 'accepted') return { status: 'success', title: '微信通知已开启', desc: '这是全局授权，同日多项提醒会合并发送' };
  if (state === 'rejected') return { status: 'warning', title: '微信通知未授权', desc: '开启全局提醒授权，避免错过到期事项' };
  if (state === 'disabled') return { status: 'warning', title: '订阅消息总开关已关闭', desc: '请在小程序设置中重新开启通知' };
  return { status: 'neutral', title: '通知状态待确认', desc: '开启的是全局提醒，同日多项会合并发送' };
}

module.exports = {
  SUBSCRIBE_TMPL_ID,
  getSubscribeState,
  getLatestNotifyResult,
  getAuthorizationCopy
};
