const CATEGORY_META = [
  { key: 'food', iconPath: '/assets/icons/expense/food.png', name: '食品', tone: 'orange' },
  { key: 'medical', iconPath: '/assets/icons/expense/medical.png', name: '医疗', tone: 'red' },
  { key: 'toys', iconPath: '/assets/icons/expense/toys.png', name: '玩具', tone: 'green' },
  { key: 'grooming', iconPath: '/assets/icons/expense/grooming.png', name: '洗护', tone: 'blue' },
  { key: 'supplies', iconPath: '/assets/icons/expense/supplies.png', name: '用品', tone: 'purple' },
  { key: 'other', iconPath: '/assets/icons/expense/other.png', name: '其他', tone: 'gray' }
];

const CATEGORY_PALETTES = {
  default: ['#FFB86B', '#F36B6B', '#6BC6B3', '#5BA7D8', '#7C9ED9', '#94A3B8'],
  peach: ['#F4B06A', '#D96F6F', '#85B99A', '#E9857B', '#A68AC1', '#9A918F'],
  forest: ['#D6A45E', '#D66E6E', '#5F9F7B', '#72B7C8', '#798FB4', '#879A90'],
  night: ['#D9A35F', '#D66B76', '#63A6A4', '#526D96', '#8178A8', '#8591A3'],
  lunar: ['#D7A64A', '#C85250', '#719A72', '#B66D5B', '#8C6D9F', '#9A8877'],
  birthday: ['#E6A45F', '#D8667A', '#79AD91', '#B56FC5', '#778EC0', '#9A879F'],
  christmas: ['#C99B4B', '#B64F55', '#477C63', '#668CA3', '#826E9D', '#78877F']
};

function getExpenseCategories(themeKey) {
  const palette = CATEGORY_PALETTES[themeKey] || CATEGORY_PALETTES.default;
  return CATEGORY_META.map(function(category, index) {
    return Object.assign({}, category, { color: palette[index] });
  });
}

function getExpenseCategory(key, themeKey) {
  const categories = getExpenseCategories(themeKey);
  return categories.find(function(category) {
    return category.key === key;
  }) || categories[categories.length - 1];
}

module.exports = {
  CATEGORY_META,
  CATEGORY_PALETTES,
  getExpenseCategories,
  getExpenseCategory
};
