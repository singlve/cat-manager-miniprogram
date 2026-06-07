// cloudfunctions/checkReminders/index.js
// 定时触发：检查所有提醒，向即将到期/已逾期的用户推送订阅消息
const cloud = require('wx-server-sdk');
const https = require('https');
const {
  buildReminderSummary,
  groupRemindersByOpenid
} = require('./summary.js');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 订阅消息模板 ID — 优先使用云函数环境变量，未配置时回退到小程序端申请授权的同一模板
const DEFAULT_APPID = 'wx1362cb2063c2e367';
const DEFAULT_TEMPLATE_ID = 'BMr3A8IZjnDrHnIxsIUZU4LX7khHdVrFo8F2aN7Fu8U';
const WECHAT_APPID = process.env.WECHAT_APPID || DEFAULT_APPID;
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET || '';
const TEMPLATE_ID = process.env.TEMPLATE_ID || DEFAULT_TEMPLATE_ID;
const MINIPROGRAM_STATE = process.env.MINIPROGRAM_STATE || 'formal';

const TYPE_LABEL = { bath: '洗澡', deworm: '驱虫', vaccine: '免疫', checkup: '体检', claw: '修剪指甲' };

const PAGE_SIZE = 100;
const SEND_CONCURRENCY = 5;

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return new Date(NaN);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

let tokenCache = { token: '', expiresAt: 0 };

function requestJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = https.request(url, {
      method,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      } : {}
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(new Error('微信接口返回非 JSON: ' + raw));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getAccessToken(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && tokenCache.token && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  if (!WECHAT_APPSECRET) {
    throw new Error('缺少云函数环境变量 WECHAT_APPSECRET');
  }

  const url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential'
    + '&appid=' + encodeURIComponent(WECHAT_APPID)
    + '&secret=' + encodeURIComponent(WECHAT_APPSECRET);
  const res = await requestJson('GET', url);

  if (!res.access_token) {
    throw new Error('获取 access_token 失败: ' + JSON.stringify(res));
  }

  const expiresIn = Number(res.expires_in || 7200);
  tokenCache = {
    token: res.access_token,
    expiresAt: now + Math.max(60, expiresIn - 300) * 1000
  };
  return tokenCache.token;
}

async function sendSubscribeMessage(payload) {
  let token = await getAccessToken(false);
  let res = await requestJson('POST', 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' + encodeURIComponent(token), payload);

  if (res.errcode === 40001 || res.errcode === 42001) {
    token = await getAccessToken(true);
    res = await requestJson('POST', 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' + encodeURIComponent(token), payload);
  }

  if (res.errcode && res.errcode !== 0) {
    const err = new Error(res.errmsg || 'subscribe send failed');
    err.errCode = res.errcode;
    err.errMsg = res.errmsg;
    throw err;
  }

  return res;
}

exports.main = async (event, context) => {
  event = event || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalChecked = 0;
  let totalDue = 0;
  let sentCount = 0;
  let sentReminderCount = 0;
  let failCount = 0;
  let failedReminderCount = 0;
  let skippedNoTemplate = 0;
  let skippedNoOpenid = 0;
  let skippedInvalidReminder = 0;
  let skippedCatUnavailable = 0;
  let skippedAlreadyNotified = 0;
  const failedDetails = [];
  const previewDetails = [];
  const todayKey = formatDateKey(today);

  try {
    // 分页查询所有提醒
    let reminders = [];
    const countResult = await db.collection('reminders').count();
    const total = countResult.total;

    for (let skip = 0; skip < total; skip += PAGE_SIZE) {
      const { data } = await db.collection('reminders').skip(skip).limit(PAGE_SIZE).get();
      reminders = reminders.concat(data);
    }

    totalChecked = reminders.length;

    const dueReminders = [];

    for (const r of reminders) {
      if (r.completedAt) continue;
      if (r.lastNotifiedDate === todayKey) {
        skippedAlreadyNotified++;
        continue;
      }

      if (!r.lastDate || !r.intervalDays) {
        skippedInvalidReminder++;
        continue;
      }

      const lastDate = parseLocalDate(r.lastDate);
      if (Number.isNaN(lastDate.getTime())) {
        skippedInvalidReminder++;
        continue;
      }
      lastDate.setHours(0, 0, 0, 0);

      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + r.intervalDays);
      nextDate.setHours(0, 0, 0, 0);

      if (nextDate > today) continue;
      totalDue++;
      dueReminders.push({ reminder: r, nextDate });
    }

    const sendTargets = event.limit
      ? dueReminders.slice(0, Math.max(0, Number(event.limit) || 0))
      : dueReminders;

    const catCache = new Map();
    async function prepareOne(item) {
      const r = item.reminder;
      let catName = '你的宠物';
      let catData = null;
      if (catCache.has(r.catId)) {
        catData = catCache.get(r.catId);
      } else {
        try {
          const cat = await db.collection('cats').doc(r.catId).get();
          catData = cat.data || null;
        } catch (e) {
          console.warn('[checkReminders] cat lookup failed for', r.catId, e.message);
        }
        catCache.set(r.catId, catData);
      }

      if (!catData || catData.status === 'passed_away') {
        skippedCatUnavailable++;
        console.warn('[checkReminders] 宠物不存在或已离世，跳过发送:', r._id, r.catId);
        return null;
      }

      catName = catData.name || catName;

      if (!r._openid) {
        skippedNoOpenid++;
        console.warn('[checkReminders] 提醒缺少 _openid，无法发送:', r._id);
        return null;
      }

      return {
        reminder: r,
        nextDate: item.nextDate,
        catName,
        typeLabel: TYPE_LABEL[r.type] || r.type
      };
    }

    const prepared = (await Promise.all(sendTargets.map(prepareOne))).filter(Boolean);
    const messageGroups = groupRemindersByOpenid(prepared);

    async function updateGroupStatus(group, updates) {
      await Promise.all(group.reminders.map(async item => {
        try {
          await db.collection('reminders').doc(item.reminder._id).update({ data: updates });
        } catch (updateErr) {
          console.warn('[checkReminders] 通知状态更新失败:', item.reminder._id, updateErr.message);
        }
      }));
    }

    async function sendOneGroup(group) {
      const summary = buildReminderSummary(group.reminders, today);
      if (!summary) return;

      if (previewDetails.length < 10) {
        previewDetails.push({
          reminderIds: group.reminders.map(item => item.reminder._id),
          reminderCount: group.reminders.length,
          catId: summary.first.reminder.catId,
          thing1: summary.thing1,
          time23: summary.time23,
          thing26: summary.thing26,
          thing26Raw: summary.thing26Raw
        });
      }

      if (event.dryRun) return;

      if (!TEMPLATE_ID) {
        skippedNoTemplate += group.reminders.length;
        console.log('[checkReminders] 未配置模板ID，跳过一组提醒:', group.reminders.length);
        return;
      }

      try {
        const attemptAt = Date.now();
        await sendSubscribeMessage({
          touser: group.openid,
          template_id: TEMPLATE_ID,
          data: {
            thing1: { value: summary.thing1 },
            time23: { value: summary.time23 },
            thing26: { value: summary.thing26 }
          },
          page: group.reminders.length === 1
            ? `pages/cat-detail/cat-detail?id=${summary.first.reminder.catId}`
            : 'pages/reminders/reminders',
          miniprogram_state: MINIPROGRAM_STATE,
          lang: 'zh_CN'
        });
        sentCount++;
        sentReminderCount += group.reminders.length;
        await updateGroupStatus(group, {
          lastNotifiedDate: todayKey,
          lastNotifiedAt: attemptAt,
          lastNotifyAttemptAt: attemptAt,
          lastNotifyStatus: 'success',
          lastNotifyErrorCode: '',
          lastNotifyError: ''
        });
      } catch (e) {
        failCount++;
        failedReminderCount += group.reminders.length;
        await updateGroupStatus(group, {
          lastNotifyAttemptAt: Date.now(),
          lastNotifyStatus: 'failed',
          lastNotifyErrorCode: e.errCode || e.errcode || e.code || '',
          lastNotifyError: e.errMsg || e.errmsg || e.message || String(e)
        });
        if (failedDetails.length < 10) {
          failedDetails.push({
            reminderIds: group.reminders.map(item => item.reminder._id),
            reminderCount: group.reminders.length,
            templateId: TEMPLATE_ID,
            errCode: e.errCode || e.errcode || e.code || '',
            errMsg: e.errMsg || e.errmsg || e.message || String(e)
          });
        }
        console.error('[checkReminders] grouped send failed:', group.reminders.length, e.message);
      }
    }

    for (let i = 0; i < messageGroups.length; i += SEND_CONCURRENCY) {
      await Promise.all(messageGroups.slice(i, i + SEND_CONCURRENCY).map(sendOneGroup));
    }

    console.log(`[checkReminders] 完成 — 检查 ${totalChecked} 条，到期 ${totalDue} 条，合并为 ${messageGroups.length} 条消息，发送成功 ${sentCount} 条消息/${sentReminderCount} 项提醒，失败 ${failCount} 条消息/${failedReminderCount} 项提醒，无模板 ${skippedNoTemplate}，无openid ${skippedNoOpenid}，无效提醒 ${skippedInvalidReminder}，宠物不可用 ${skippedCatUnavailable}，今日已通知 ${skippedAlreadyNotified}`);
    return {
      ok: true,
      checked: totalChecked,
      due: totalDue,
      attempted: messageGroups.length,
      attemptedReminders: prepared.length,
      sent: sentCount,
      sentReminders: sentReminderCount,
      failed: failCount,
      failedReminders: failedReminderCount,
      skippedNoTemplate,
      skippedNoOpenid,
      skippedInvalidReminder,
      skippedCatUnavailable,
      skippedAlreadyNotified,
      failedDetails,
      previewDetails
    };

  } catch (e) {
    console.error('[checkReminders] 执行失败:', e);
    return { ok: false, error: e.message, checked: totalChecked, due: totalDue };
  }
};
