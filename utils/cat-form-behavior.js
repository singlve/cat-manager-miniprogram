// utils/cat-form-behavior.js
// cat-add 和 cat-edit 页面的共享表单方法和数据默认值

const { CAT_BREEDS, DOG_BREEDS } = require("./breeds.js");

const catFormDataDefaults = {
  name: "", gender: "male", breed: "", birthday: "",
  adoptedDate: "", note: "", avatar: "", tempAvatarPath: "",
  nameError: "", birthdayError: "", saving: false,
  breedList: CAT_BREEDS,
  breedPickerVisible: false, breedKeyword: "", filteredBreeds: CAT_BREEDS,
  neutered: false,
  species: "cat", speciesList: ["🐱 猫咪", "🐶 狗狗"],
  status: "with_me", passedDate: ""
};

const catFormMethods = {
  speciesChange(e) {
    const species = e.detail.value;
    const breedList = species === "cat" ? CAT_BREEDS : DOG_BREEDS;
    this.setData({ species, breedList, breed: "", filteredBreeds: breedList });
  },

  nameInput(e)    { this.setData({ name: e.detail.value.trim(), nameError: "" }); },
  breedChange(e)  { this.setData({ breed: this.data.breedList[parseInt(e.detail.value)] }); },
  showBreedPicker()  { this.setData({ breedPickerVisible: true, breedKeyword: "", filteredBreeds: this.data.breedList }); },
  hideBreedPicker()  { this.setData({ breedPickerVisible: false }); },
  onBreedSearch(e)   {
    const keyword = e.detail.value.trim().toLowerCase();
    const filtered = keyword
      ? this.data.breedList.filter(function(b) { return b.toLowerCase().includes(keyword); })
      : this.data.breedList;
    this.setData({ breedKeyword: e.detail.value, filteredBreeds: filtered });
  },
  clearBreedSearch() { this.setData({ breedKeyword: "", filteredBreeds: this.data.breedList }); },
  selectBreed(e)     { this.setData({ breed: e.currentTarget.dataset.breed, breedPickerVisible: false }); },
  noteInput(e)    { this.setData({ note: e.detail.value }); },

  validateName() {
    if (!this.data.name.trim()) { this.setData({ nameError: "请输入宠物名字" }); return false; }
    return true;
  },

  genderChange(e)      { this.setData({ gender: e.detail.value }); },
  bindBirthdayChange(e) {
    var birthday = e.detail.value;
    if (birthday > new Date().toISOString().split("T")[0]) {
      this.setData({ birthday: birthday, birthdayError: "生日不能是未来日期" }); return;
    }
    this.setData({ birthday: birthday, birthdayError: "" });
  },
  bindAdoptedDateChange(e) { this.setData({ adoptedDate: e.detail.value }); },
  onNeuteredChange(e) { this.setData({ neutered: e.detail.value }); },

  onStatusChange(e) {
    var status = e.detail.value;
    this.setData({ status: status, passedDate: status === "passed_away" ? this.data.passedDate : "" });
  },

  onPassedDateChange(e) { this.setData({ passedDate: e.detail.value }); },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1, mediaType: ["image"], sourceType: ["album", "camera"],
      success: function(res) {
        var filePath = res.tempFiles[0].tempFilePath;
        this.setData({ tempAvatarPath: filePath, avatar: filePath });
      }.bind(this),
      fail: function() { wx.showToast({ title: "选择失败，请重试", icon: "none" }); }
    });
  },

  removeAvatar() { this.setData({ avatar: "", tempAvatarPath: "" }); },
};

module.exports = { catFormMethods, catFormDataDefaults };
