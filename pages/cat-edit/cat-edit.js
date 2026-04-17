// pages/cat-edit/cat-edit.js
// 编辑猫咪页：头像替换 + 档案更新
const clouddb = require('../../utils/clouddb.js');

// ─── 常见宠物猫品种（与 cat-add 保持一致） ───
const BREEDS = [
  '中华田园猫', '橘猫', '狸花猫', '三花猫', '奶牛猫', '黑猫', '白猫', '狮子猫', '临清狮子猫', '四川简州猫',
  '英短蓝猫', '英短蓝白', '英短金渐层', '英短银渐层', '英短纯白', '英短乳白', '英短丁香', '英短色点',
  '美短虎斑', '美短加白', '美短银虎斑', '美短纯色',
  '布偶猫', '暹罗猫', '缅因猫', '斯芬克斯无毛猫', '孟加拉豹猫', '阿比西尼亚猫', '美国短尾猫',
  '波斯猫', '金吉拉', '挪威森林猫', '喜马拉雅猫', '伯曼猫', '索马里猫',
  '俄罗斯蓝猫', '苏格兰折耳猫', '英国长毛猫', '美国卷耳猫', '埃及猫', '新加坡猫', '土耳其梵猫', '巴厘猫', '奥西猫', '柯尼斯卷毛猫', '德文卷毛猫', '孟买猫', '曼基康矮脚猫', '日本短尾猫',
  '其他'
];

Page({
  data: {
    catId: '', name: '', gender: 'male', breed: '', birthday: '',
    adoptedDate: '', note: '', avatar: '', tempAvatarPath: '', originalAvatar: '',
    nameError: '', birthdayError: '', saving: false,
    breedList: BREEDS,
    breedPickerVisible: false, breedKeyword: '', filteredBreeds: BREEDS
  },

  onLoad(options) {
    if (!options.id) { wx.showToast({ title: '参数错误', icon: 'none' }); setTimeout(() => wx.navigateBack(), 1000); return; }
    this.setData({ catId: options.id, nowDate: new Date().toISOString().split('T')[0] });
    this.loadCat(options.id);
  },

  async loadCat(id) {
    const cat = await clouddb.getCatById(id);
    if (!cat) { wx.showToast({ title: '猫咪不存在', icon: 'none' }); setTimeout(() => wx.navigateBack(), 1000); return; }
    const displayAvatar = cat.avatar ? await clouddb.getAvatarUrl(cat.avatar) : '';
    this.setData({
      name: cat.name || '', gender: cat.gender || 'male', breed: cat.breed || '',
      birthday: cat.birthday || '', adoptedDate: cat.adoptedDate || '',
      note: cat.note || '', avatar: displayAvatar, tempAvatarPath: '',
      originalAvatar: cat.avatar || ''
    });
  },

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

  chooseAvatar() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album', 'camera'],
      success: res => { this.setData({ tempAvatarPath: res.tempFiles[0].tempFilePath, avatar: res.tempFiles[0].tempFilePath }); },
      fail: () => wx.showToast({ title: '选择失败，请重试', icon: 'none' })
    });
  },

  removeAvatar() { this.setData({ avatar: '', tempAvatarPath: '' }); },

  async saveCat() {
    if (!this.validateName()) return;
    if (this.data.birthdayError) { wx.showToast({ title: '请修正生日日期', icon: 'none' }); return; }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });

    const { catId, tempAvatarPath, name, gender, breed, birthday, adoptedDate, note, originalAvatar } = this.data;

    let newAvatar = originalAvatar; // 默认用原始值
    if (tempAvatarPath) {
      // 用户选了新头像，上传到云存储
      newAvatar = await clouddb.uploadAvatar(tempAvatarPath, catId);
    }

    await clouddb.updateCat(catId, {
      name: name.trim(), gender, breed: breed.trim(),
      birthday, adoptedDate, note: note.trim(), avatar: newAvatar
    });

    wx.hideLoading();
    wx.showToast({ title: '保存成功 🎉', icon: 'success' });
    this.setData({ saving: false });
    setTimeout(() => wx.navigateBack(), 1200);
  }
});
