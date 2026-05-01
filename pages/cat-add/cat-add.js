// pages/cat-add/cat-add.js
// 添加猫咪页：头像上传 + 档案保存
const clouddb = require('../../utils/clouddb.js');

// ─── 常见宠物猫品种（含颜色变种）───
const BREEDS = [
  // ── 中华田园猫 ──
  '中华田园猫', '橘猫', '狸花猫', '三花猫', '奶牛猫', '黑猫', '白猫', '玳瑁猫',
  '狮子猫', '临清狮子猫', '四川简州猫',

  // ── 英短 ──
  '英短蓝猫', '英短蓝白',
  '英短金渐层', '英短金渐层(蓝金)', '英短金渐层(巧克力金)', '英短金渐层(紫金)',
  '英短银渐层', '英短银渐层(重点色)',
  '英短纯白', '英短乳白', '英短丁香', '英短巧克力色', '英短肉桂色',
  '英短三花', '英短玳瑁', '英短虎斑', '英短色点', '英短纯黑',

  // ── 英长 ──
  '英长金渐层', '英长银渐层', '英长蓝猫', '英长纯白',

  // ── 美短 ──
  '美短虎斑', '美短棕虎斑', '美短银虎斑', '美短红虎斑',
  '美短加白', '美短凯米尔色', '美短纯色', '美短纯黑', '美短纯白', '美短三花',

  // ── 布偶猫 ──
  '布偶猫', '布偶猫(重点色)', '布偶猫(手套色)', '布偶猫(双色)',
  '布偶猫(蓝双)', '布偶猫(海豹双色)', '布偶猫(山猫纹)',

  // ── 暹罗猫 ──
  '暹罗猫', '暹罗猫(海豹色)', '暹罗猫(蓝色)', '暹罗猫(巧克力色)', '暹罗猫(淡紫色)',

  // ── 缅因猫 ──
  '缅因猫', '缅因猫(棕虎斑)', '缅因猫(银虎斑)', '缅因猫(纯色)', '缅因猫(玳瑁)',

  // ── 波斯猫 ──
  '波斯猫', '波斯猫(纯白)', '波斯猫(黑色)', '波斯猫(蓝色)', '波斯猫(红色)',
  '波斯猫(双色)', '波斯猫(三花)',

  // ── 东方短毛猫 ──
  '东方短毛猫',

  // ── 异国猫 ──
  '异国短毛猫', '异国长毛猫',

  // ── 其他品种 ──
  '斯芬克斯无毛猫', '金吉拉', '苏格兰折耳猫', '挪威森林猫', '喜马拉雅猫',
  '伯曼猫', '索马里猫', '俄罗斯蓝猫', '美国卷耳猫', '孟加拉豹猫',
  '阿比西尼亚猫', '埃及猫', '新加坡猫', '土耳其梵猫', '土耳其安哥拉猫',
  '巴厘猫', '奥西猫', '柯尼斯卷毛猫', '德文卷毛猫', '塞尔凯克卷毛猫',
  '曼基康矮脚猫', '日本短尾猫', '美国短尾猫', '东奇尼猫', '雪鞋猫',
  '褴褛猫', '波米拉猫', '欧洲短毛猫', '西伯利亚猫', '玩具虎猫',
  '拉邦猫', '内华达猫', '孟买猫',

  '其他'
];

Page({
  data: {
    name: '', gender: 'male', breed: '', birthday: '',
    adoptedDate: '', note: '', avatar: '', tempAvatarPath: '',
    nameError: '', birthdayError: '', saving: false,
    breedList: BREEDS,
    breedPickerVisible: false, breedKeyword: '', filteredBreeds: BREEDS,
    neutered: false,
    status: 'with_me', passedDate: ''
  },

  onLoad() { this.setData({ nowDate: new Date().toISOString().split('T')[0] }); },

  nameInput(e)    { this.setData({ name: e.detail.value.trim(), nameError: '' }); },
  breedChange(e)  { this.setData({ breed: this.data.breedList[parseInt(e.detail.value)] }); },
  showBreedPicker()  { this.setData({ breedPickerVisible: true, breedKeyword: '', filteredBreeds: this.data.breedList }); },
  hideBreedPicker()  { this.setData({ breedPickerVisible: false }); },
  onBreedSearch(e)   {
    const keyword = e.detail.value.trim().toLowerCase();
    const filtered = keyword
      ? this.data.breedList.filter(b => b.toLowerCase().includes(keyword))
      : this.data.breedList;
    this.setData({ breedKeyword: e.detail.value, filteredBreeds: filtered });
  },
  clearBreedSearch() { this.setData({ breedKeyword: '', filteredBreeds: this.data.breedList }); },
  selectBreed(e)     { this.setData({ breed: e.currentTarget.dataset.breed, breedPickerVisible: false }); },
  noteInput(e)    { this.setData({ note: e.detail.value }); },

  validateName() {
    if (!this.data.name.trim()) { this.setData({ nameError: '请输入猫咪名字' }); return false; }
    return true;
  },

  genderChange(e)      { this.setData({ gender: e.detail.value }); },
  bindBirthdayChange(e) {
    const birthday = e.detail.value;
    if (birthday > new Date().toISOString().split('T')[0]) {
      this.setData({ birthday, birthdayError: '生日不能是未来日期' }); return;
    }
    this.setData({ birthday, birthdayError: '' });
  },
  bindAdoptedDateChange(e) { this.setData({ adoptedDate: e.detail.value }); },
  onNeuteredChange(e) { this.setData({ neutered: e.detail.value }); },

  onStatusChange(e) {
    const status = e.detail.value;
    this.setData({ status, passedDate: status === 'passed_away' ? this.data.passedDate : '' });
  },

  onPassedDateChange(e) { this.setData({ passedDate: e.detail.value }); },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'],
      success: res => {
        const filePath = res.tempFiles[0].tempFilePath;
        this.setData({ tempAvatarPath: filePath, avatar: filePath });
      },
      fail: () => wx.showToast({ title: '选择失败，请重试', icon: 'none' })
    });
  },

  removeAvatar() { this.setData({ avatar: '', tempAvatarPath: '' }); },

  async saveCat() {
    if (this.data.saving) return;
    if (!this.validateName()) return;
    if (this.data.birthdayError) { wx.showToast({ title: '请修正生日日期', icon: 'none' }); return; }
    if (this.data.adoptedDate && this.data.birthday && this.data.adoptedDate < this.data.birthday) {
      wx.showToast({ title: '领养日期不能早于出生日期', icon: 'none' }); return;
    }

    // 去喵星日期不能早于出生日期
    if (this.data.status === 'passed_away' && this.data.passedDate && this.data.birthday && this.data.passedDate < this.data.birthday) {
      wx.showToast({ title: '去喵星日期不能早于出生日期', icon: 'none' }); return;
    }

    // 去喵星的猫咪，领养日期不能晚于去喵星日期
    if (this.data.status === 'passed_away' && this.data.adoptedDate && this.data.passedDate && this.data.adoptedDate > this.data.passedDate) {
      wx.showToast({ title: '领养日期不能晚于去喵星日期', icon: 'none' }); return;
    }

    const app = getApp();
    if (!app.isLoggedIn()) {
      wx.showModal({
        title: '需要登录',
        content: '登录后才能保存猫咪信息，是否现在登录？',
        confirmText: '去登录',
        cancelText: '稍后再说',
        success: res => { if (res.confirm) wx.navigateTo({ url: '/pages/login/login' }); }
      });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });

    const catId = 'cat_' + Date.now();
    const { tempAvatarPath, name, gender, breed, birthday, adoptedDate, note, neutered } = this.data;

    let avatar = '';
    if (tempAvatarPath) {
      avatar = await clouddb.uploadAvatar(tempAvatarPath, catId);
    }

    const { status, passedDate } = this.data;
    const newCat = {
      _id: catId, name: name.trim(), gender, breed: breed.trim(), birthday,
      adoptedDate, note: note.trim(), avatar, neutered,
      status: status, passedDate: status === 'passed_away' ? passedDate : '',
      _createTime: Date.now()
    };
    await clouddb.addCat(newCat);

    wx.hideLoading();
    wx.showToast({ title: '添加成功 🎉', icon: 'success' });
    this.setData({ saving: false });
    setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 1200);
  }
});
