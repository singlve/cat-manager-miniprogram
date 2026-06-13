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

module.exports = {
  normalizeClaimDocument,
  enrichClaims
};
