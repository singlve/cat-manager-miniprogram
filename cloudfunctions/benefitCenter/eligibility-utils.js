function parseTime(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'object') {
    if (value.$date !== undefined) return parseTime(value.$date);
    if (value.timestamp !== undefined) return parseTime(value.timestamp);
    if (value.seconds !== undefined) {
      const seconds = Number(value.seconds);
      return Number.isFinite(seconds) ? seconds * 1000 : 0;
    }
  }
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getUserCreatedTime(user) {
  if (!user) return 0;
  const candidates = [
    user.createdAt,
    user._createTime,
    user.registeredAt,
    user.registerTime
  ];
  for (const value of candidates) {
    const timestamp = parseTime(value);
    if (timestamp) return timestamp;
  }
  return 0;
}

function getQuota(campaign) {
  return Math.max(0, parseInt(campaign && campaign.totalQuota, 10) || 0);
}

function getClaimedCount(campaign) {
  return Math.max(0, parseInt(campaign && campaign.claimedCount, 10) || 0);
}

function isQuotaExhausted(campaign) {
  const quota = getQuota(campaign);
  return quota > 0 && getClaimedCount(campaign) >= quota;
}

function campaignState(campaign, user, claim, now) {
  const start = parseTime(campaign.startAt);
  const end = parseTime(campaign.endAt);
  const created = getUserCreatedTime(user);
  const newUserSince = parseTime(campaign.newUserSince);
  let state = 'available';
  if (campaign.enabled === false) state = 'disabled';
  else if (start && now < start) state = 'upcoming';
  else if (end && now > end) state = 'expired';
  else if (claim) state = claim.status === 'used' ? 'used' : 'claimed';
  else if (campaign.audience === 'new' &&
      (!newUserSince || !created || created < newUserSince)) state = 'ineligible';
  else if (isQuotaExhausted(campaign)) state = 'sold_out';
  return state;
}

function campaignAdminState(campaign, now) {
  const start = parseTime(campaign && campaign.startAt);
  const end = parseTime(campaign && campaign.endAt);
  if (campaign && campaign.enabled === false) return 'disabled';
  if (start && now < start) return 'upcoming';
  if (end && now > end) return 'expired';
  if (isQuotaExhausted(campaign)) return 'sold_out';
  return 'active';
}

function isAudienceEligible(campaign, user) {
  if (!campaign || campaign.audience !== 'new') return true;
  const cutoff = parseTime(campaign.newUserSince);
  const created = getUserCreatedTime(user);
  return !!cutoff && !!created && created >= cutoff;
}

module.exports = {
  parseTime,
  getUserCreatedTime,
  getQuota,
  getClaimedCount,
  isQuotaExhausted,
  campaignState,
  campaignAdminState,
  isAudienceEligible
};
