// pages/cat-edit/cat-edit.js
// 编辑宠物页：头像替换 + 档案更新

const clouddb = require("../../utils/clouddb.js");
const { catFormMethods, catFormDataDefaults } = require("../../utils/cat-form-behavior.js");
const { DOG_BREEDS, CAT_BREEDS } = require("../../utils/breeds.js");

Page(Object.assign({}, catFormMethods, {
  data: Object.assign({}, catFormDataDefaults, {
    catId: "",
    originalAvatar: "",
    isEdit: true
  }),

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: "参数错误", icon: "none" });
      setTimeout(function() { wx.navigateBack(); }, 1000);
      return;
    }
    this.setData({ catId: options.id, nowDate: new Date().toISOString().split("T")[0] });
    this.loadCat(options.id);
  },

  async loadCat(id) {
    var cat = await clouddb.getCatById(id);
    if (!cat) {
      wx.showToast({ title: "宠物不存在", icon: "none" });
      setTimeout(function() { wx.navigateBack(); }, 1000);
      return;
    }
    var displayAvatar = cat.avatar ? await clouddb.getAvatarUrl(cat.avatar) : "";
    var species = cat.species || "cat";
    var breedList = species === "dog" ? DOG_BREEDS : CAT_BREEDS;
    this.setData({
      name: cat.name || "", gender: cat.gender || "male", breed: cat.breed || "",
      birthday: cat.birthday || "", adoptedDate: cat.adoptedDate || "", neutered: cat.neutered || false,
      note: cat.note || "", avatar: displayAvatar, tempAvatarPath: "",
      originalAvatar: cat.avatar || "",
      species: species, breedList: breedList,
      filteredBreeds: breedList,
      status: cat.status || "with_me", passedDate: cat.passedDate || ""
    });
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

    this.setData({ saving: true });
    wx.showLoading({ title: "保存中..." });

    try {
      var { catId, tempAvatarPath, name, gender, breed, birthday, adoptedDate, note, neutered, originalAvatar, status, passedDate, species } = this.data;

      var newAvatar = originalAvatar;
      if (tempAvatarPath) {
        newAvatar = await clouddb.uploadAvatar(tempAvatarPath, catId);
      }

      await clouddb.updateCat(catId, {
        name: name.trim(), gender, species, breed: breed.trim(), neutered,
        birthday, adoptedDate, note: note.trim(), avatar: newAvatar,
        status: status, passedDate: status === "passed_away" ? passedDate : ""
      });

      wx.showToast({ title: "保存成功 🎉", icon: "success" });
      setTimeout(function() { wx.navigateBack(); }, 1200);
    } catch (e) {
      console.error("[cat-edit] saveCat error:", e);
      wx.showToast({ title: "保存失败，请重试", icon: "none" });
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: "编辑宠物信息 - 宠物健康管家 ✏️", path: "/pages/cat-edit/cat-edit" };
  },
}));
