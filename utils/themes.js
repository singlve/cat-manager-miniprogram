const DEFAULT_THEME_KEY = 'default';
const TAB_BAR_ICON_NAMES = ['pet', 'remind', 'service', 'mine'];

const THEMES = [
  {
    key: 'default',
    name: '清爽治愈',
    desc: '熟悉的蓝绿配色，清爽耐看。',
    className: 'theme-default',
    primary: '#5BA7D8',
    primaryDeep: '#2F8DB8',
    secondary: '#6BC6B3',
    secondaryDeep: '#3F9486',
    actionStart: '#25779C',
    actionEnd: '#327A70',
    background: '#F7F9FB',
    soft: '#EAF4FB',
    secondarySoft: '#EAF7F5',
    tabBackground: '#FFFFFF',
    navText: '#ffffff'
  },
  {
    key: 'peach',
    name: '蜜桃暖阳',
    desc: '柔和蜜桃与暖橙，像晒过太阳的午后。',
    className: 'theme-peach',
    primary: '#E9857B',
    primaryDeep: '#C7635B',
    secondary: '#F4B06A',
    secondaryDeep: '#B97835',
    actionStart: '#A94F48',
    actionEnd: '#9A5C25',
    background: '#FFF8F5',
    soft: '#FDEDEA',
    secondarySoft: '#FFF1DF',
    tabBackground: '#FFFCFA',
    navText: '#ffffff'
  },
  {
    key: 'forest',
    name: '森林散步',
    desc: '草木绿与天空蓝，安静又有生命力。',
    className: 'theme-forest',
    primary: '#5F9F7B',
    primaryDeep: '#477F61',
    secondary: '#72B7C8',
    secondaryDeep: '#4F8795',
    actionStart: '#477F61',
    actionEnd: '#3F7180',
    background: '#F5FAF7',
    soft: '#E7F3EB',
    secondarySoft: '#E7F3F6',
    tabBackground: '#FBFEFC',
    navText: '#ffffff'
  },
  {
    key: 'night',
    name: '夜空陪伴',
    desc: '沉静夜蓝与柔和青色，适合安静记录。',
    className: 'theme-night',
    primary: '#526D96',
    primaryDeep: '#445E87',
    secondary: '#63A6A4',
    secondaryDeep: '#477E7C',
    actionStart: '#445E87',
    actionEnd: '#477E7C',
    background: '#F3F6FA',
    soft: '#E7EDF6',
    secondarySoft: '#E4F1F0',
    tabBackground: '#F9FBFD',
    navText: '#ffffff'
  },
  {
    key: 'lunar',
    name: '新岁团圆',
    desc: '朱红与鎏金点亮新年，把每一份陪伴都收进团圆里。',
    className: 'theme-lunar',
    primary: '#C85250',
    primaryDeep: '#983B3A',
    secondary: '#D7A64A',
    secondaryDeep: '#8A6320',
    actionStart: '#8F3434',
    actionEnd: '#7A571B',
    background: '#FFF8F3',
    soft: '#FBE9E7',
    secondarySoft: '#FFF2D8',
    tabBackground: '#FFFCF8',
    navText: '#ffffff',
    limited: true,
    badge: '新岁限定',
    heroDecor: '/assets/decorations/lunar-hero.png',
    tabEffect: 'firecracker'
  },
  {
    key: 'birthday',
    name: '生日派对',
    desc: '莓紫与玫粉装点生日时刻，庆祝宝贝又长大一岁。',
    className: 'theme-birthday',
    primary: '#B56FC5',
    primaryDeep: '#824A94',
    secondary: '#F08E9B',
    secondaryDeep: '#A94C5C',
    actionStart: '#744085',
    actionEnd: '#983F52',
    background: '#FCF8FF',
    soft: '#F3E8F7',
    secondarySoft: '#FCE9EE',
    tabBackground: '#FFFCFF',
    navText: '#ffffff',
    limited: true,
    badge: '生日限定'
  },
  {
    key: 'christmas',
    name: '圣诞暖夜',
    desc: '松针绿与浆果红，像窝在灯火旁度过安静冬夜。',
    className: 'theme-christmas',
    primary: '#477C63',
    primaryDeep: '#315B47',
    secondary: '#B64F55',
    secondaryDeep: '#84363B',
    actionStart: '#315B47',
    actionEnd: '#763238',
    background: '#F7FAF8',
    soft: '#E5F0E9',
    secondarySoft: '#F6E5E6',
    tabBackground: '#FBFDFC',
    navText: '#ffffff',
    limited: true,
    badge: '冬日限定',
    heroDecor: '/assets/decorations/christmas-hero.png',
    tabEffect: 'christmas-tree'
  }
];

const THEME_PRODUCTS = [
  {
    _id: 'system_theme_peach',
    name: '主题·蜜桃暖阳',
    type: 'virtual',
    virtualType: 'theme',
    virtualValue: 'peach',
    points: 600,
    stock: 9999,
    enabled: true,
    image: '',
    desc: '永久解锁蜜桃暖阳主题'
  },
  {
    _id: 'system_theme_forest',
    name: '主题·森林散步',
    type: 'virtual',
    virtualType: 'theme',
    virtualValue: 'forest',
    points: 800,
    stock: 9999,
    enabled: true,
    image: '',
    desc: '永久解锁森林散步主题'
  },
  {
    _id: 'system_theme_night',
    name: '主题·夜空陪伴',
    type: 'virtual',
    virtualType: 'theme',
    virtualValue: 'night',
    points: 1000,
    stock: 9999,
    enabled: true,
    image: '',
    desc: '永久解锁夜空陪伴主题'
  },
  {
    _id: 'system_theme_lunar',
    name: '限定主题·新岁团圆',
    type: 'virtual',
    virtualType: 'theme',
    virtualValue: 'lunar',
    points: 1400,
    stock: 9999,
    enabled: true,
    image: '',
    limited: true,
    badge: '新岁限定',
    desc: '永久解锁新岁团圆限定主题'
  },
  {
    _id: 'system_theme_birthday',
    name: '限定主题·生日派对',
    type: 'virtual',
    virtualType: 'theme',
    virtualValue: 'birthday',
    points: 1600,
    stock: 9999,
    enabled: true,
    image: '',
    limited: true,
    badge: '生日限定',
    desc: '永久解锁生日派对限定主题'
  },
  {
    _id: 'system_theme_christmas',
    name: '限定主题·圣诞暖夜',
    type: 'virtual',
    virtualType: 'theme',
    virtualValue: 'christmas',
    points: 1800,
    stock: 9999,
    enabled: true,
    image: '',
    limited: true,
    badge: '冬日限定',
    desc: '永久解锁圣诞暖夜限定主题'
  }
];

function getTheme(key) {
  return THEMES.find(function(theme) {
    return theme.key === key;
  }) || THEMES[0];
}

function normalizeOwnedThemes(keys) {
  var owned = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (owned.indexOf(DEFAULT_THEME_KEY) === -1) owned.unshift(DEFAULT_THEME_KEY);
  return Array.from(new Set(owned)).filter(function(key) {
    return THEMES.some(function(theme) { return theme.key === key; });
  });
}

function getStoredThemeKey() {
  try {
    var user = wx.getStorageSync('currentUser') || {};
    if (!user._id && !user._openid) return DEFAULT_THEME_KEY;
    var ownedThemes = normalizeOwnedThemes(user.ownedThemes);
    var stored = user.activeTheme || wx.getStorageSync('activeTheme') || DEFAULT_THEME_KEY;
    var validKey = getTheme(stored).key;
    return ownedThemes.indexOf(validKey) !== -1 ? validKey : DEFAULT_THEME_KEY;
  } catch (e) {
    return DEFAULT_THEME_KEY;
  }
}

function applyNativeTheme(key, options) {
  var theme = getTheme(key);
  var shouldPersist = !options || options.persist !== false;
  if (shouldPersist) {
    try { wx.setStorageSync('activeTheme', theme.key); } catch (e) {}
  }
  try {
    wx.setNavigationBarColor({
      frontColor: theme.navText,
      backgroundColor: theme.primary,
      animation: { duration: 180, timingFunc: 'easeIn' }
    });
  } catch (e) {}
  try {
    wx.setTabBarStyle({
      color: '#A5AFBC',
      selectedColor: theme.primary,
      backgroundColor: theme.tabBackground,
      borderStyle: 'white'
    });
  } catch (e) {}
  try {
    TAB_BAR_ICON_NAMES.forEach(function(iconName, index) {
      var selectedIconPath = theme.key === DEFAULT_THEME_KEY
        ? 'assets/icons/' + iconName + '-active.png'
        : 'assets/icons/themes/' + theme.key + '/' + iconName + '-active.png';
      wx.setTabBarItem({
        index: index,
        selectedIconPath: selectedIconPath
      });
    });
  } catch (e) {}
  try {
    wx.setBackgroundColor({
      backgroundColor: theme.background,
      backgroundColorTop: theme.primary,
      backgroundColorBottom: theme.background
    });
  } catch (e) {}
  return theme;
}

function hexToRgba(hex, alpha) {
  var clean = String(hex || '').replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(function(char) { return char + char; }).join('');
  }
  var value = parseInt(clean, 16);
  if (!Number.isFinite(value)) return 'rgba(91,167,216,' + alpha + ')';
  return 'rgba(' +
    ((value >> 16) & 255) + ',' +
    ((value >> 8) & 255) + ',' +
    (value & 255) + ',' +
    alpha + ')';
}

function getThemeCanvasPalette(key) {
  var theme = getTheme(key);
  return {
    primary: theme.primary,
    primaryDeep: theme.primaryDeep,
    secondary: theme.secondary,
    background: theme.background,
    soft: theme.soft,
    secondarySoft: theme.secondarySoft,
    areaStrong: hexToRgba(theme.primary, 0.28),
    areaLight: hexToRgba(theme.primary, 0.03),
    grid: hexToRgba(theme.primary, 0.12)
  };
}

function syncPageTheme(pageContext) {
  var app = getApp();
  var theme = app.applyTheme();
  if (pageContext && typeof pageContext.setData === 'function') {
    pageContext.setData({
      themeClass: theme.className,
      themeKey: theme.key,
      themePrimary: theme.primary,
      themePrimaryDeep: theme.primaryDeep,
      themeSecondary: theme.secondary,
      themeSoft: theme.soft,
      themeSecondarySoft: theme.secondarySoft
    });
  }
  return theme;
}

function getInitialThemeData() {
  var theme = getTheme(getStoredThemeKey());
  return {
    themeClass: theme.className,
    themeKey: theme.key,
    themePrimary: theme.primary,
    themePrimaryDeep: theme.primaryDeep,
    themeSecondary: theme.secondary,
    themeSoft: theme.soft,
    themeSecondarySoft: theme.secondarySoft
  };
}

function getThemedIconClass(themeKey) {
  return 'icon-theme-' + getTheme(themeKey).key;
}

function getThemeProducts() {
  return THEME_PRODUCTS.map(function(item) {
    return Object.assign({}, item);
  });
}

module.exports = {
  DEFAULT_THEME_KEY,
  THEMES,
  THEME_PRODUCTS,
  TAB_BAR_ICON_NAMES,
  getTheme,
  normalizeOwnedThemes,
  getStoredThemeKey,
  applyNativeTheme,
  hexToRgba,
  getThemeCanvasPalette,
  syncPageTheme,
  getInitialThemeData,
  getThemedIconClass,
  getThemeProducts
};
