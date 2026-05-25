// cloudfunctions/contentCheck/index.js
// UGC 内容安全校验：文本检测 / 图片检测
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { action } = event;

  // ── 文本安全检测 ──
  if (action === 'msgCheck') {
    const { content } = event;
    if (!content) return { code: -1, msg: '缺少文本内容' };
    try {
      const res = await cloud.openapi.security.msgSecCheck({
        content: content
      });
      return { code: 0, result: res };
    } catch (e) {
      console.error('[contentCheck] msgSecCheck error:', e);
      return { code: -1, msg: e.message };
    }
  }

  // ── 图片安全检测 ──
  if (action === 'imgCheck') {
    const { mediaUrl } = event;
    if (!mediaUrl) return { code: -1, msg: '缺少图片URL' };
    try {
      // 先获取图片 buffer
      const buffer = await cloud.downloadFile({ fileID: mediaUrl });
      const res = await cloud.openapi.security.imgSecCheck({
        media: {
          contentType: 'image/jpeg',
          value: buffer.fileContent
        }
      });
      return { code: 0, result: res };
    } catch (e) {
      console.error('[contentCheck] imgSecCheck error:', e);
      return { code: -1, msg: e.message };
    }
  }

  return { code: -1, msg: '无效的 action' };
};
