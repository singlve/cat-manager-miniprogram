// pages/cat-list/cat-list.js
// 猫咪列表页
const clouddb = require('../../utils/clouddb.js');

// 计算距下次生日天数（仅当年内，0=今天，负数=已过今年生日）
function getDaysToBirthday(birthdayStr) {
  if (!birthdayStr) return null;
  const parts = birthdayStr.split('-');
  if (parts.length < 3) return null;
  const birthMonth = parseInt(parts[1], 10);
  const birthDay   = parseInt(parts[2], 10);
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisBirthday = new Date(thisYear, birthMonth - 1, birthDay);
  // 已过今年生日 → 算明年的（只比较日期部分，忽略时分秒）
  const today = new Date(thisYear, now.getMonth(), now.getDate());
  if (thisBirthday < today) {
    thisBirthday.setFullYear(thisYear + 1);
  }
  return Math.ceil((thisBirthday - now) / 86400000);
}

Page({
  data: { cats: [], loading: false },

  onShow() { this.loadAll(); },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const cats = await clouddb.getCats();

      const catsWithExtras = await Promise.all(cats.map(async cat => {
        const avatarUrl = cat.avatar ? await clouddb.getAvatarUrl(cat.avatar) : '';

        const daysToBirthday = getDaysToBirthday(cat.birthday);

        let daysSinceRecord;
        if (cat._id) {
          const records = await clouddb.getRecords({ catId: cat._id });
          if (records.length > 0) {
            const latest = records.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            daysSinceRecord = Math.floor((Date.now() - new Date(latest.date).getTime()) / 86400000);
          }
        }

        // 生日倒计时（仅7天内才显示）
        let birthdayHint = null;
        if (daysToBirthday !== null && daysToBirthday >= 0 && daysToBirthday <= 7) {
          birthdayHint = daysToBirthday === 0
            ? '🎉 今天生日！'
            : `🎂 ${daysToBirthday} 天后生日`;
        }

        return {
          ...cat,
          _displayAvatar: avatarUrl,
          _daysSinceRecord: daysSinceRecord,
          _birthdayHint: birthdayHint
        };
      }));

      this.setData({ cats: catsWithExtras, loading: false });
    } catch (e) {
      console.error('[cat-list] loadAll error:', e);
      this.setData({ loading: false });
    }
  },

  addCat() { wx.navigateTo({ url: '/pages/cat-add/cat-add' }); },

  goCatDetail(e) {
    wx.navigateTo({ url: `/pages/cat-detail/cat-detail?id=${e.currentTarget.dataset.id}` });
  },

  quickAddRecord(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/health-records/health-records?catId=${id}&catName=${name}` });
  },

  async deleteCat(e) {
    const confirmed = await new Promise(r =>
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这只猫咪的档案吗？相关记录也会一并删除。',
        success: res => r(res.confirm)
      })
    );
    if (!confirmed) return;
    wx.showLoading({ title: '删除中...' });
    try {
      await clouddb.deleteCat(e.currentTarget.dataset.id);
      wx.showToast({ title: '已删除', icon: 'success' });
      this.loadAll();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  }
});
