export function classifySyncError(err) {
  if (!err) return { message: 'Sync failed — try again later', type: 'error' }
  if (err.message === 'Failed to fetch' || err.message === 'Network request failed') {
    return { message: 'Sync failed: check your connection', type: 'error' }
  }
  if (err.status === 401 || err.status === 403) {
    return { message: 'Sync failed: API key invalid — check Settings', type: 'error' }
  }
  if (err.status === 429) {
    return { message: 'Sync failed: rate limited — try again later', type: 'warning' }
  }
  console.warn('[sync error]', err)
  return { message: 'Sync failed — try again later', type: 'error' }
}
