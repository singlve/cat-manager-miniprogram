const STORAGE_KEY = 'app_error_logs_v1';
const MAX_LOGS = 30;
const BLOCKED_KEYS = /phone|password|openid|token|secret|content|note|address/i;

function safeMessage(error) {
  if (!error) return 'Unknown error';
  return String(error.message || error.errMsg || error).slice(0, 240);
}

function sanitizeMeta(meta) {
  const clean = {};
  Object.keys(meta || {}).forEach(key => {
    if (BLOCKED_KEYS.test(key)) return;
    const value = meta[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = String(value).slice(0, 120);
    }
  });
  return clean;
}

function getErrorLogs() {
  try {
    const logs = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(logs) ? logs : [];
  } catch (error) {
    return [];
  }
}

function reportError(scope, error, meta) {
  console.error('[' + scope + ']', error);
  try {
    const logs = getErrorLogs();
    logs.unshift({
      time: new Date().toISOString(),
      scope: String(scope || 'unknown').slice(0, 80),
      message: safeMessage(error),
      code: String((error && (error.code || error.errCode)) || '').slice(0, 60),
      meta: sanitizeMeta(meta)
    });
    wx.setStorageSync(STORAGE_KEY, logs.slice(0, MAX_LOGS));
  } catch (storageError) {
    console.warn('[error-log] persist failed:', storageError);
  }
}

function clearErrorLogs() {
  try { wx.removeStorageSync(STORAGE_KEY); } catch (error) {}
}

module.exports = {
  STORAGE_KEY,
  MAX_LOGS,
  getErrorLogs,
  reportError,
  clearErrorLogs
};
