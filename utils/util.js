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

module.exports = {
  formatDate,
  calcNextDate,
  isDue,
  getOverdueDays,
  TYPE_LABELS
};
