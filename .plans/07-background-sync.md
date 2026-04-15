# Phase 7 — Background Sync (Squarespace)

**Effort:** ~2-3 days | **Priority:** Medium | **Depends on:** Phase 0

## Context
Auto-sync every 30 minutes. Two-phase: fast initial (names/IDs only) + background enrichment (descriptions + images). Abstract adapter pattern for future Shopify/WooCommerce support.

## Tasks

### 7a. Create Sync Directory Structure
```
src/sync/
  core/
    SyncManager.js
  adapters/
    BaseAdapter.js
    SquarespaceAdapter.js
  storage/
    LocalStorageSync.js
    CapacitorSync.js
```

### 7b. Create `src/sync/adapters/BaseAdapter.js`
Interface definition (JSDoc only — no TypeScript):
```js
/**
 * @typedef {Object} BaseAdapter
 * @method fetchInitial() → [{ id, name }] — fast, names/IDs only
 * @method fetchEnrichment(productId) → { desc, images[] }
 * @method downloadImage(url) → localPath or URL
 */
```

### 7c. Create `src/sync/adapters/SquarespaceAdapter.js`
Refactors existing `src/api/squarespace.js` logic:

**`fetchInitial(apiKey, onCount)`** — fetches product names/IDs only (skip variant expansion, skip images). Fast, gets app usable in < 5s.

**`fetchEnrichment(apiKey, productId)`** — fetches full product detail for one product. Returns description + up to 2 image URLs.

**`downloadImage(url, platform)`** — On web: return URL as-is (browser cache handles it). On native: download to `Directory.Cache` via `Filesystem.writeFile()`.

### 7d. Create `src/sync/core/SyncManager.js`
```js
export class SyncManager {
  constructor(adapter, storage) { ... }

  async runInitialSync() {
    // Phase 1: fast fetch names/IDs
    // Store in localStorage sip_products
    // Return product array
  }

  async runEnrichment(batchSize = 2) {
    // Phase 2: chunked enrichment
    // Read checkpoint from localStorage sip_enrich_idx
    // Enrich batchSize products starting from checkpoint
    // Save checkpoint after each product (atomic — survives iOS kill)
    // Return enriched products
  }
}
```

Conflict resolution: products carry `remoteModifiedAt`. During enrichment, if local has been modified more recently, skip remote update.

### 7e. Create `src/hooks/useCatalogSync.js`
Replaces inline `handleSyncCatalog` in App.jsx:

```js
export function useCatalogSync(apiKey, onProducts, onToast) {
  const [syncStatus, setSyncStatus] = useState('idle')
  const [syncCount, setSyncCount] = useState(0)
  const [lastSynced, setLastSynced] = useState(...)

  const runSync = useCallback(async () => {
    setSyncStatus('syncing')
    try {
      const adapter = new SquarespaceAdapter(apiKey)
      const mgr = new SyncManager(adapter)
      const products = await mgr.runInitialSync()
      onProducts(products)
      setSyncStatus('ok')
      // Background enrichment — do NOT await
      mgr.runEnrichment().then(enriched => onProducts(enriched)).catch(console.warn)
    } catch {
      setSyncStatus('error')
    }
  }, [apiKey])

  // Auto-sync every 30 minutes
  useEffect(() => {
    if (!apiKey) return
    runSync()
    const timer = setInterval(runSync, 30 * 60 * 1000)
    return () => clearInterval(timer)
  }, [apiKey, runSync])

  return { syncStatus, syncCount, lastSynced, runSync }
}
```

### 7f. Web Background Enrichment (Service Worker)
**File:** `public/sw.js`

Add `message` event handler for `SYNC_ENRICH` command. App posts to SW when tab becomes hidden:
```js
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SYNC_ENRICH', apiKey })
  }
})
```

### 7g. Native Background Sync (Deferred)
Install `@capacitor/background-runner` and create `runners/background.js` for iOS/Android background sync. **This can be deferred to a later sprint** — the web `setInterval` approach works for MVP on both web and native (while app is in foreground).

### 7h. Update App.jsx
Replace inline sync state (`syncStatus`, `syncCount`, `lastSynced`, `handleSyncCatalog`) with `useCatalogSync` hook. Pass `runSync` to Inventory and PullToRefresh.

## Files Created
- `src/sync/core/SyncManager.js`
- `src/sync/adapters/BaseAdapter.js`
- `src/sync/adapters/SquarespaceAdapter.js`
- `src/sync/storage/LocalStorageSync.js`
- `src/sync/storage/CapacitorSync.js`
- `src/hooks/useCatalogSync.js`

## Files Modified
- `src/App.jsx` — replace inline sync with useCatalogSync hook
- `public/sw.js` — add SYNC_ENRICH message handler
- `src/api/squarespace.js` — may be refactored into SquarespaceAdapter

## Risk: iOS Background Runner 30s Limit
Enrichment batch must be conservative (2 products per run). Save checkpoint BEFORE enriching each product (not after). If killed mid-run, next invocation re-enriches same product (idempotent).

## Verification
- App open → products sync automatically (fast initial sync)
- After initial sync, descriptions/images appear gradually (enrichment)
- 30-minute timer fires → silent re-sync (no UI interruption)
- Close and reopen app → products still there, enrichment resumes from checkpoint
