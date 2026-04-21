/**
 * Catalog search tier router (SMA-123).
 *
 * Splits per-tenant search between on-device and BYOK LLM based on catalog
 * size. The 5,000-parent threshold is the outcome of the SMA-122 tier
 * analysis — see the `Tier strategy` section of that issue's analysis
 * document. Above the threshold, on-device indexing is too memory/CPU heavy
 * for the low-end Android devices this app targets, so searches are pushed
 * to the user's BYOK provider. Below it, the SMA-117 hybrid Fuse + LLM
 * pipeline runs fully on-device.
 *
 * Keep this module pure — it is called from sync completion handlers, from
 * the settings UI, and from tests. Anything touching React state, storage,
 * or async IO belongs in the call sites, not here.
 */

export const LOCAL_TIER_MAX_PARENTS = 5000

export const SEARCH_TIER_LOCAL = 'local'
export const SEARCH_TIER_BYOK = 'byok'

function normalizeParentCount(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

/**
 * Decide the search tier for a synced catalog.
 *
 * Input shape is intentionally permissive so sync callbacks can forward
 * whatever stats object they already build — only `parentCount` is read.
 * Missing or malformed stats fall back to `local`; a fresh install with no
 * catalog must not be forced into BYOK.
 */
export function pickTier(catalogStats) {
  const parentCount = normalizeParentCount(catalogStats?.parentCount)
  return parentCount > LOCAL_TIER_MAX_PARENTS ? SEARCH_TIER_BYOK : SEARCH_TIER_LOCAL
}

export function isValidSearchTier(value) {
  return value === SEARCH_TIER_LOCAL || value === SEARCH_TIER_BYOK
}
