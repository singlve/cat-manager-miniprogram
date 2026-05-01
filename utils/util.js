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
  datetime
};
