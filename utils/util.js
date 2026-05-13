// utils/util.js
/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 计算下次提醒日期
 */
function calcNextDate(lastDate, intervalDays) {
  if (!lastDate || !intervalDays) return '';
  const d = new Date(lastDate);
  d.setDate(d.getDate() + intervalDays);
  return formatDate(d);
}

/**
 * 判断是否到期或逾期
 */
function isDue(lastDate, intervalDays) {
  if (!lastDate || !intervalDays) return false;
  const last = new Date(lastDate);
  const next = new Date(last);
  next.setDate(next.getDate() + intervalDays);
  return new Date() >= next;
}

/**
 * 获取逾期天数
 */
function getOverdueDays(lastDate, intervalDays) {
  if (!lastDate || !intervalDays) return 0;
  const last = new Date(lastDate);
  const next = new Date(last);
  next.setDate(next.getDate() + intervalDays);
  const now = new Date();
  if (now < next) return 0;
  return Math.floor((now - next) / (1000 * 60 * 60 * 24));
}

/**
 * 猫咪类型中文名
 */
const TYPE_LABELS = {
  bath: '洗澡',
  deworm: '驱虫',
  vaccine: '免疫',
  checkup: '体检',
  claw: '修剪指甲',
  other: '其他'
};

// ─── 年龄计算：出生 → 截止日期 ───
function calcAgeDetail(birthdayStr, endDateStr) {
  if (!birthdayStr) return null;
  const bp = birthdayStr.split('-');
  const birthY = +bp[0], birthM = +bp[1] - 1, birthD = +bp[2];

  let endY, endM, endD;
  if (endDateStr) {
    const ep = endDateStr.split('-');
    endY = +ep[0]; endM = +ep[1] - 1; endD = +ep[2];
  } else {
    const now = new Date();
    endY = now.getFullYear(); endM = now.getMonth(); endD = now.getDate();
  }

  const birthDate = new Date(birthY, birthM, birthD);
  const endDate = new Date(endY, endM, endD);
  if (endDate <= birthDate) return null;

  let years = endY - birthY;
  let months = endM - birthM;
  let days = endD - birthD;

  if (days < 0) {
    months--;
    const daysInPrevMonth = new Date(endY, endM, 0).getDate();
    days += daysInPrevMonth;
  }
  if (months < 0) { years--; months += 12; }

  return { years, months, days };
}

// ─── 两个日期间隔天数 ───
function calcDaysBetween(startStr, endStr) {
  if (!startStr) return null;
  const sp = startStr.split('-');
  const start = new Date(+sp[0], +sp[1] - 1, +sp[2]);
  let end;
  if (endStr) {
    const ep = endStr.split('-');
    end = new Date(+ep[0], +ep[1] - 1, +ep[2]);
  } else {
    end = new Date();
    end.setHours(0, 0, 0, 0);
  }
  const diff = Math.floor((end - start) / 86400000);
  return diff >= 0 ? diff : null;
}

// ─── 生日行文本：日期 + 近7天倒计时 ───
function formatBirthdayRow(birthdayStr, isPassed) {
  if (!birthdayStr) return { text: '🎂 未知', hint: '' };
  // 去喵星了 → 不显示生日提醒
  if (isPassed) return { text: '🎂 ' + birthdayStr, hint: '' };
  const parts = birthdayStr.split('-');
  if (parts.length < 3) return { text: '🎂 ' + birthdayStr, hint: '' };
  const birthMonth = +parts[1], birthDay = +parts[2];
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisBirthday = new Date(thisYear, birthMonth - 1, birthDay);
  const today = new Date(thisYear, now.getMonth(), now.getDate());
  const target = thisBirthday < today
    ? new Date(thisYear + 1, birthMonth - 1, birthDay)
    : thisBirthday;
  const days = Math.ceil((target - today) / 86400000);
  if (days <= 7 && days >= 0) {
    return {
      text: '🎂 ' + birthdayStr,
      hint: days === 0 ? ' 🎉 今天生日！' : ` 🎂 ${days} 天后生日`
    };
  }
  return { text: '🎂 ' + birthdayStr, hint: '' };
}

// ─── 日期部分提取（前10字符 YYYY-MM-DD）───
function datePart(str) { return (str || '').slice(0, 10); }

// ─── 相对时间显示（xxx天前/xxx个月前/xxx年前）───
function calcAgo(dateStr) {
  if (!dateStr) return '';
  // 手动拆日期避免 new Date("YYYY-MM-DD") 的 UTC/local 歧义
  const d = datePart(dateStr).split('-');
  const recordDate = new Date(d[0], d[1] - 1, d[2]); // 本地午夜
  const today = new Date();
  today.setHours(0, 0, 0, 0); // 今天本地午夜
  const diff = Math.floor((today - recordDate) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 30) return `${diff}天前`;
  if (diff < 365) return `${Math.floor(diff / 30)}个月前`;
  return `${Math.floor(diff / 365)}年前`;
}

// ─── 今天的日期 YYYY-MM-DD ───
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── 当前时间 HH:mm ───
function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── 日期 + 时间拼接 → YYYY-MM-DD HH:mm:00 ───
function datetime(date, time) { return `${date || ''} ${time || '00:00'}:00`; }

// ─── 签到积分计算 ───
function calcCheckInPoints(streak) {
  if (streak <= 3) return 10;
  if (streak <= 7) return 15;
  if (streak <= 30) return 20;
  return 25;
}

// ─── 构建签到日历（最近7天） ───
function buildCheckInCalendar(lastCheckInDate, checkInStreak, makeUpDates) {
  const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);  // 归一化到午夜，避免时间部分导致日期差计算错误
  const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const makeUpSet = new Set(makeUpDates || []);

  // 上次签到日期也归一化到午夜
  let lastCheck = null;
  if (lastCheckInDate) {
    const parts = lastCheckInDate.split('-');
    lastCheck = new Date(+parts[0], +parts[1] - 1, +parts[2]);  // 本地午夜
  }

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayNum = d.getDate();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const isToday = i === 0;

    let checked = false;
    let isMadeUp = false;
    if (lastCheck) {
      // 归一化到午夜再比较，避免时分秒导致天数计算偏差
      const dMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const lastMidnight = new Date(lastCheck.getFullYear(), lastCheck.getMonth(), lastCheck.getDate());
      const dayMs = 24 * 60 * 60 * 1000;
      const daysDiff = Math.round((lastMidnight.getTime() - dMidnight.getTime()) / dayMs);
      if (daysDiff >= 0 && daysDiff < checkInStreak) checked = true;
    }
    if (!checked && makeUpSet.has(dateStr)) { checked = true; isMadeUp = true; }

    const isPast = dateStr < todayDateStr;
    const canMakeUp = isPast && !checked && !isToday;

    days.push({
      date: String(dayNum),
      dayName: DAY_NAMES[d.getDay()],
      dateStr, isToday, isPast, checked, isMadeUp, canMakeUp
    });
  }

  return days;
}

// ─── 判断日期是否在当前月 ───
function isCurrentMonth(dateStr) {
  if (!dateStr) return false;
  const parts = dateStr.split('-');
  const now = new Date();
  return +parts[0] === now.getFullYear() && +parts[1] === now.getMonth() + 1;
}

// ─── 连续签到对应的抽奖次数（上限4） ───
function getLotteryDrawsForStreak(streak) {
  return Math.min(4, Math.floor((streak || 0) / 7));
}

// ─── 累积签到奖励配置 ───
var CUMULATIVE_MILESTONES = [
  { days: 7,   points: 20,  label: '7天'   },
  { days: 30,  points: 50,  label: '30天'  },
  { days: 60,  points: 100, label: '60天'  },
  { days: 100, points: 200, label: '100天' },
  { days: 365, points: 1000,label: '365天' }
];

// ─── 检查累积签到是否有可领取的奖励 ───
function calcCumulativeRewards(totalCheckIns, claimedMilestones) {
  var claimed = new Set(claimedMilestones || []);
  var next = null;
  for (var i = 0; i < CUMULATIVE_MILESTONES.length; i++) {
    var m = CUMULATIVE_MILESTONES[i];
    if (totalCheckIns >= m.days && !claimed.has(m.days)) {
      return { earned: true, points: m.points, milestone: m.days, label: m.label };
    }
    if (!next && totalCheckIns < m.days) {
      next = { days: m.days, label: m.label, remaining: m.days - totalCheckIns };
    }
  }
  return { next: next || null };
}

// ─── 构建签到周视图（当前周一~周日） ───
function buildCheckInWeek(lastCheckInDate, checkInStreak, makeUpDates, drawnMilestones) {
  const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  const makeUpSet = new Set(makeUpDates || []);

  var lastCheck = null;
  var streakStartDate = null;
  if (lastCheckInDate) {
    var lcParts = lastCheckInDate.split('-');
    lastCheck = new Date(+lcParts[0], +lcParts[1] - 1, +lcParts[2]);
    // 计算连续签到起始日：lastCheckInDate - (checkInStreak - 1) 天
    streakStartDate = new Date(lastCheck);
    streakStartDate.setDate(lastCheck.getDate() - ((checkInStreak || 1) - 1));
  }

  // 本周一
  var dayOfWeek = today.getDay(); // 0=Sun
  var mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  var monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);

  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    var dayNum = d.getDate();
    var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(dayNum).padStart(2, '0');
    var isToday = dateStr === todayDateStr;
    var dw = d.getDay(); // 0=Sun
    var dwIdx = dw === 0 ? 6 : dw - 1;

    var checked = false;
    var isMadeUp = false;
    if (streakStartDate) {
      // 若当天 >= streakStartDate 且 <= lastCheckInDate，则在连签范围内
      if (d >= streakStartDate && d <= lastCheck) checked = true;
    }
    if (!checked && makeUpSet.has(dateStr)) { checked = true; isMadeUp = true; }

    var isPast = dateStr < todayDateStr;
    var inMonth = d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    var canMakeUp = isPast && !checked && !isToday && inMonth;

    // 抽奖盒子：当天连续签到恰好到 7/14/21/28 的里程碑日
    var isDrawDay = false;
    var drawMilestone = 0;
    var drawUsed = false;
    if (checked && !isMadeUp && streakStartDate) {
      // 计算当天在连签序列中的位置（1-based）
      var daysIntoStreak = Math.round((lastCheck.getTime() - d.getTime()) / 86400000) + 1;
      if (daysIntoStreak > 0 && daysIntoStreak % 7 === 0) {
        isDrawDay = true;
        drawMilestone = daysIntoStreak;
        var dm = drawnMilestones || [];
        drawUsed = dm.indexOf(daysIntoStreak) !== -1;
      }
    }

    days.push({
      date: String(dayNum), dayName: DAY_NAMES[dwIdx],
      dateStr: dateStr, isToday: isToday, isPast: isPast,
      checked: checked, isMadeUp: isMadeUp, canMakeUp: canMakeUp,
      isDrawDay: isDrawDay, drawMilestone: drawMilestone, drawUsed: drawUsed
    });
  }
  return days;
}

// ─── 构建签到月视图（当月完整日历，返回 [weeks]） ───
function buildCheckInMonth(lastCheckInDate, checkInStreak, makeUpDates, drawnMilestones) {
  var DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var year = today.getFullYear();
  var month = today.getMonth();
  var todayDateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  var makeUpSet = new Set(makeUpDates || []);

  var lastCheck = null;
  var streakStartDate = null;
  if (lastCheckInDate) {
    var lcParts2 = lastCheckInDate.split('-');
    lastCheck = new Date(+lcParts2[0], +lcParts2[1] - 1, +lcParts2[2]);
    // 计算连续签到起始日：lastCheckInDate - (checkInStreak - 1) 天
    streakStartDate = new Date(lastCheck);
    streakStartDate.setDate(lastCheck.getDate() - ((checkInStreak || 1) - 1));
  }

  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
  var startPad = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Mon=0

  var weeks = [];
  var currentWeek = [];
  for (var p = 0; p < startPad; p++) currentWeek.push({ empty: true });

  for (var d = 1; d <= daysInMonth; d++) {
    var dayDate = new Date(year, month, d);
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var dw = dayDate.getDay(); // 0=Sun
    var dwIdx = dw === 0 ? 6 : dw - 1;
    var isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

    var checked = false;
    var isMadeUp = false;
    if (streakStartDate && lastCheck) {
      // 若当天在 [streakStartDate, lastCheck] 范围内，则在连签范围内
      if (dayDate >= streakStartDate && dayDate <= lastCheck) checked = true;
    }
    if (!checked && makeUpSet.has(dateStr)) { checked = true; isMadeUp = true; }

    var isPast = dateStr < todayDateStr;
    var isFuture = !isPast && !isToday;
    var canMakeUp = isPast && !checked && !isToday;

    // 抽奖盒子：当天连续签到恰好到 7/14/21/28 的里程碑日
    var isDrawDay = false;
    var drawMilestone = 0;
    var drawUsed = false;
    if (checked && !isMadeUp && lastCheck) {
      // 计算当天在连签序列中的位置（1-based）
      var daysIntoStreak = Math.round((lastCheck.getTime() - dayDate.getTime()) / 86400000) + 1;
      if (daysIntoStreak > 0 && daysIntoStreak % 7 === 0) {
        isDrawDay = true;
        drawMilestone = daysIntoStreak;
        var dm = drawnMilestones || [];
        drawUsed = dm.indexOf(daysIntoStreak) !== -1;
      }
    }

    currentWeek.push({
      date: String(d), dayName: DAY_NAMES[dwIdx],
      dateStr: dateStr, isToday: isToday, isPast: isPast, isFuture: isFuture,
      checked: checked, isMadeUp: isMadeUp, canMakeUp: canMakeUp,
      isDrawDay: isDrawDay, drawMilestone: drawMilestone, drawUsed: drawUsed
    });

    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push({ empty: true });
    weeks.push(currentWeek);
  }

  return weeks;
}

// ─── 重算签到连签（含补签） ───
function recalcAllStreak(lastCheckInDate, normalStreak, makeUpDates) {
  const checked = new Set();
  if (lastCheckInDate) {
    const d = new Date(lastCheckInDate.replace(/-/g, '/'));
    for (let i = 0; i < (normalStreak || 0); i++) {
      checked.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      d.setDate(d.getDate() - 1);
    }
  }
  (makeUpDates || []).forEach(function(d) { checked.add(d); });
  var streak = 0, cursor = new Date();
  while (true) {
    var ds = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0');
    if (checked.has(ds)) { streak++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }
  return streak;
}

// ─── 本周唯一标识（基于周一日期） ───
function getWeekKey() {
  const d = new Date();
  const day = d.getDay() || 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + 1);
  monday.setHours(0, 0, 0, 0);
  return monday.getFullYear() + '-W' +
    String(Math.ceil(((monday.getTime() - new Date(monday.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7));
}

// ════════════════════════════════════════════════════
// 管理员权限
// ════════════════════════════════════════════════════
var ADMIN_OPENIDS = [
  'oYBpx3ZRljxCk6pODSAyMShkyFJA'  // 主账号 openid
];

function isAdmin() {
  try {
    var user = wx.getStorageSync('currentUser');
    if (!user || !user._openid) return false;
    return ADMIN_OPENIDS.indexOf(user._openid) !== -1;
  } catch (e) {
    return false;
  }
}

module.exports = {
  formatDate,
  calcNextDate,
  isDue,
  getOverdueDays,
  TYPE_LABELS,
  calcAgeDetail,
  calcDaysBetween,
  formatBirthdayRow,
  datePart,
  calcAgo,
  todayStr,
  nowTimeStr,
  datetime,
  getLotteryDrawsForStreak,
  calcCumulativeRewards,
  calcCheckInPoints,
  buildCheckInCalendar,
  buildCheckInWeek,
  buildCheckInMonth,
  recalcAllStreak,
  getWeekKey,
  isAdmin
};
