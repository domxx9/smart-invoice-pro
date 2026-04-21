/**
 * Catalog search dispatcher (SMA-123).
 *
 * Single entrypoint callers (widgets, tests) can hit without caring which
 * backend actually runs. The tier — set by `pickTier` after every full
 * sync — decides:
 *
 *   - `local`  → SMA-117 pipeline (`runSmartPastePipeline`).
 *   - `byok`   → `runByokCatalogSearch` when a BYOK key is configured.
 *   - `byok`   → BM25 lexical fallback when no BYOK key is configured; the
 *                caller sees `mode: 'bm25_fallback'` and `needsBYOKKey: true`
 *                so it can surface a prompt-to-configure banner.
 *
 * Unknown tiers default to `local` — the safest fallback for an ambiguous
 * state, since the local pipeline works for any catalog size (just slower
 * above the threshold). Mis-tiered catalogs are corrected on the next sync
 * by the caller that owns sync completion.
 */

import { runSmartPastePipeline } from '../ai/smartPastePipeline.js'
import { runByokCatalogSearch } from './byokSearch.js'
import { runBm25Fallback } from './bm25.js'
import { SEARCH_TIER_BYOK, SEARCH_TIER_LOCAL } from './tier.js'
import { logger } from '../utils/logger.js'

function hasByokKey({ aiMode, byokProvider, byokApiKeyConfigured } = {}) {
  if (aiMode !== 'byok') return false
  if (!byokProvider) return false
  return byokApiKeyConfigured === true
}

async function runLocalSearch(args) {
  const result = await runSmartPastePipeline(args)
  return { ...result, mode: 'local' }
}

function runBm25Path({ text, products }) {
  const result = runBm25Fallback({ text, products })
  return {
    ...result,
    mode: 'bm25_fallback',
    needsBYOKKey: true,
    fallback: false,
  }
}

/**
 * Dispatch a catalog search.
 *
 * @param {object} opts
 * @param {'local'|'byok'} opts.tier - Tier from `pickTier`.
 * @param {object} opts.byok - BYOK-config snapshot: `{aiMode, byokProvider, byokApiKeyConfigured}`.
 * @param {string} opts.text - Raw paste text.
 * @param {Array} opts.products - Synced catalog.
 * @param {Function} opts.runInference - Inference fn (see `src/ai/pipeline.js`).
 * @param {object} [opts.context] - Smart-paste business context.
 * @param {Function} [opts.onStage] - Stage progress callback.
 * @param {object} [opts.productDictionary] - Optional dictionary (SMA-120) — passed to local pipeline only.
 * @param {object} [opts.repairOpts] - Dictionary repair options — passed to local pipeline only.
 */
export async function runCatalogSearch({
  tier,
  byok,
  text,
  products,
  runInference,
  context,
  onStage,
  productDictionary,
  repairOpts,
} = {}) {
  const resolvedTier = tier === SEARCH_TIER_BYOK ? SEARCH_TIER_BYOK : SEARCH_TIER_LOCAL
  if (resolvedTier === SEARCH_TIER_BYOK) {
    if (!hasByokKey(byok)) {
      logger.info('catalogSearch.dispatch', { tier: resolvedTier, mode: 'bm25_fallback' })
      return runBm25Path({ text, products })
    }
    logger.info('catalogSearch.dispatch', { tier: resolvedTier, mode: 'byok' })
    return runByokCatalogSearch({
      text,
      products,
      context,
      runInference,
      onStage,
    })
  }

  logger.info('catalogSearch.dispatch', { tier: resolvedTier, mode: 'local' })
  return runLocalSearch({
    text,
    products,
    context,
    runInference,
    onStage,
    productDictionary,
    repairOpts,
  })
}
