function normalizeClaimDocument(document) {
  if (!document || typeof document !== 'object') return null;
  const nested = document.data && typeof document.data === 'object'
    ? document.data
    : null;
  const normalized = Object.assign({}, nested || document);
  normalized._id = document._id || normalized._id;
  return normalized;
}

function enrichClaims(claims, campaignMap) {
  return claims.map(item => {
    const campaign = campaignMap[item.campaignId] || {};
    return Object.assign({}, item, {
      campaignTitle: item.campaignTitle || campaign.title || '福利活动',
      rewardType: item.rewardType || campaign.rewardType || '',
      rewardAmount: item.rewardAmount || campaign.rewardAmount || 1,
      maxThemePoints: item.maxThemePoints || campaign.maxThemePoints || 0,
      themeKey: item.themeKey || campaign.themeKey || '',
      linkedItemId: item.linkedItemId || campaign.linkedItemId || ''
    });
  });
}

function getOutstandingThemeVouchers(claims) {
  return (claims || []).reduce((total, item) => {
    if (!item || item.rewardType !== 'theme_voucher') return total;
    if (item.status !== 'unused' && item.status !== 'partially_used') return total;
    const rewardAmount = Math.max(1, parseInt(item.rewardAmount, 10) || 1);
    const usedAmount = Math.max(0, parseInt(item.usedAmount, 10) || 0);
    return total + Math.max(0, rewardAmount - usedAmount);
  }, 0);
}

module.exports = {
  normalizeClaimDocument,
  enrichClaims,
  getOutstandingThemeVouchers
};
