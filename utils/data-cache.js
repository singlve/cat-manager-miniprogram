const dataVersions = Object.create(null);
const pageStates = Object.create(null);

function normalizeTypes(types) {
  return Array.isArray(types) ? types : [types];
}

function markDataDirty(types) {
  normalizeTypes(types).filter(Boolean).forEach(function(type) {
    dataVersions[type] = (dataVersions[type] || 0) + 1;
  });
}

function markPageLoaded(pageKey, dependencies) {
  const versions = {};
  normalizeTypes(dependencies).filter(Boolean).forEach(function(type) {
    versions[type] = dataVersions[type] || 0;
  });
  pageStates[pageKey] = { loadedAt: Date.now(), versions };
}

function shouldRefreshPage(pageKey, dependencies, ttlMs) {
  const state = pageStates[pageKey];
  if (!state) return true;
  if (Date.now() - state.loadedAt >= ttlMs) return true;
  return normalizeTypes(dependencies).filter(Boolean).some(function(type) {
    return (state.versions[type] || 0) !== (dataVersions[type] || 0);
  });
}

function resetPageCache(pageKey) {
  if (pageKey) delete pageStates[pageKey];
  else Object.keys(pageStates).forEach(function(key) { delete pageStates[key]; });
}

module.exports = { markDataDirty, markPageLoaded, shouldRefreshPage, resetPageCache };
