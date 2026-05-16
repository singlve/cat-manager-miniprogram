// pages/cat-add/cat-add.js
// 添加宠物页：头像上传 + 档案保存

const clouddb = require("../../utils/clouddb.js");
const { catFormMethods, catFormDataDefaults } = require("../../utils/cat-form-behavior.js");

Page(Object.assign({}, catFormMethods, {
  data: Object.assign({}, catFormDataDefaults, {
    isEdit: false
  }),

  onLoad() {
    this.setData({ nowDate: new Date().toISOString().split("T")[0] });
  },

  async saveCat() {
    if (this.data.saving) return;
    if (!this.validateName()) return;
    if (this.data.birthdayError) { wx.showToast({ title: "请修正生日日期", icon: "none" }); return; }
    if (this.data.adoptedDate && this.data.birthday && this.data.adoptedDate < this.data.birthday) {
      wx.showToast({ title: "领养日期不能早于出生日期", icon: "none" }); return;
    }

    // 已离世日期不能早于出生日期
    if (this.data.status === "passed_away" && this.data.passedDate && this.data.birthday && this.data.passedDate < this.data.birthday) {
      wx.showToast({ title: "已离世日期不能早于出生日期", icon: "none" }); return;
    }

    // 已离世的宠物，领养日期不能晚于已离世日期
    if (this.data.status === "passed_away" && this.data.adoptedDate && this.data.passedDate && this.data.adoptedDate > this.data.passedDate) {
      wx.showToast({ title: "领养日期不能晚于已离世日期", icon: "none" }); return;
    }

    var app = getApp();
    if (!app.isLoggedIn()) {
      wx.showModal({
        title: "需要登录",
        content: "登录后才能保存宠物信息，是否现在登录？",
        confirmText: "去登录",
        cancelText: "稍后再说",
        success: function(res) { if (res.confirm) wx.navigateTo({ url: "/pages/login/login" }); }
      });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: "保存中..." });

    try {
      var catId = "cat_" + Date.now();
      var { tempAvatarPath, name, gender, breed, birthday, adoptedDate, note, neutered, status, passedDate, species } = this.data;

      var avatar = "";
      if (tempAvatarPath) {
        avatar = await clouddb.uploadAvatar(tempAvatarPath, catId);
      }

      var newCat = {
        _id: catId, name: name.trim(), gender, breed: breed.trim(), birthday,
        adoptedDate, species, note: note.trim(), avatar, neutered,
        status: status, passedDate: status === "passed_away" ? passedDate : "",
        _createTime: Date.now()
      };
      await clouddb.addCat(newCat);

      wx.showToast({ title: "添加成功 🎉", icon: "success" });
      setTimeout(function() { wx.switchTab({ url: "/pages/cat-list/cat-list" }); }, 1200);
    } catch (e) {
      console.error("[cat-add] saveCat error:", e);
      wx.showToast({ title: "保存失败，请重试", icon: "none" });
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: "添加宠物 - 宠物健康管家", path: "/pages/cat-add/cat-add" };
  },
}));
