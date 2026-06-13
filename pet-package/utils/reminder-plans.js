// 宠物照护分包内的智能提醒计划配置
const TYPE_META = {
  bath: { label: '洗澡', iconPath: '/assets/icons/ui/bath.png' },
  deworm: { label: '驱虫', iconPath: '/assets/icons/ui/deworm.png' },
  vaccine: { label: '免疫', iconPath: '/assets/icons/ui/vaccine.png' },
  checkup: { label: '体检', iconPath: '/assets/icons/ui/checkup.png' },
  claw: { label: '修剪指甲', iconPath: '/assets/icons/ui/claw.png' },
  other: { label: '其他', iconPath: '/assets/icons/ui/other.png' }
};

const REMINDER_PLANS = [
  {
    id: 'adult_cat_basic',
    name: '成年猫基础照护',
    desc: '适合成年猫的日常洗护、驱虫和年度体检。',
    target: 'cat',
    stage: 'adult',
    items: [
      { type: 'bath', intervalDays: 60, note: '智能计划：成年猫日常洗护' },
      { type: 'deworm', intervalDays: 90, note: '智能计划：成年猫定期驱虫' },
      { type: 'checkup', intervalDays: 365, note: '智能计划：成年猫年度体检' },
      { type: 'claw', intervalDays: 30, note: '智能计划：定期修剪指甲' }
    ]
  },
  {
    id: 'kitten_growth',
    name: '幼猫成长照护',
    desc: '适合幼猫阶段更频繁的免疫、驱虫和健康观察。',
    target: 'cat',
    stage: 'young',
    items: [
      { type: 'deworm', intervalDays: 30, note: '智能计划：幼猫驱虫观察' },
      { type: 'vaccine', intervalDays: 30, note: '智能计划：幼猫免疫安排' },
      { type: 'checkup', intervalDays: 90, note: '智能计划：幼猫阶段体检' },
      { type: 'claw', intervalDays: 21, note: '智能计划：幼猫指甲护理' }
    ]
  },
  {
    id: 'adult_dog_basic',
    name: '成年狗基础照护',
    desc: '适合成年狗的洗澡、驱虫、体检和指甲护理。',
    target: 'dog',
    stage: 'adult',
    items: [
      { type: 'bath', intervalDays: 30, note: '智能计划：成年狗日常洗护' },
      { type: 'deworm', intervalDays: 90, note: '智能计划：成年狗定期驱虫' },
      { type: 'checkup', intervalDays: 365, note: '智能计划：成年狗年度体检' },
      { type: 'claw', intervalDays: 30, note: '智能计划：定期修剪指甲' }
    ]
  },
  {
    id: 'senior_pet_care',
    name: '老年宠物健康关注',
    desc: '适合老年宠物更密集的体检、驱虫和综合观察。',
    target: 'all',
    stage: 'senior',
    items: [
      { type: 'checkup', intervalDays: 180, note: '智能计划：老年宠物半年体检' },
      { type: 'deworm', intervalDays: 90, note: '智能计划：老年宠物定期驱虫' },
      { type: 'other', intervalDays: 30, note: '智能计划：观察精神、食欲和体重变化' }
    ]
  }
];

function getTypeMeta(type) {
  return TYPE_META[type] || TYPE_META.other;
}

function getPlanById(id) {
  return REMINDER_PLANS.find(plan => plan.id === id) || REMINDER_PLANS[0];
}

module.exports = {
  TYPE_META,
  REMINDER_PLANS,
  getTypeMeta,
  getPlanById
};
