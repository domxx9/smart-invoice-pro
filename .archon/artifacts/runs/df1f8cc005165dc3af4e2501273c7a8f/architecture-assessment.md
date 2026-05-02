# Smart Invoice Pro — Architecture Assessment

_Date: 2026-05-01 · Branch: test/sma-249-ci-notification-verify_

## Executive Summary

The codebase is in better shape than CLAUDE.md suggests — `App.jsx` was decomposed into providers/hooks and now has just 4 useState hooks, not the "16+" the docs still warn about. The real god file is now `src/components/Settings.jsx` at **1,852 lines**, which mixes business profile, billing, integrations, contacts import, on-device AI, BYOK, embedder, ExecuTorch, log viewer, backup/export, and debug toggles into one component with 16 useState hooks and a 21-field destructure of the `useAiModel` return value. The second-largest concern is `src/gemma.js` (534 lines, mutable module singletons) — it self-describes as a "dev-only entry point" yet is still imported by Settings.jsx and useAiModel, with domain-specific Smart Paste prompts (`cleanOrderText`) embedded in what should be pure model plumbing. The Squarespace and Shopify integrations are functionally parallel but copy-pasted (Rule of Three triggered), and `localStorage` is touched directly in 15+ files with no central key registry — including two files that both write `sip_draft_edit`. Security posture is largely sound: no eval/XSS, secrets are wrapped in `secure-storage.js`, BYOK errors redact keys, and the model proxy uses an allowlist; but Anthropic and Gemini BYOK paths ship raw user keys directly from the browser with no proxy option.

## Methodology Notes

The injected metrics block was misleading — it only counted 2 files and reported `App.jsx` at 0 useState (the actual codebase has ~185 source files). Findings below are based on direct reads of the real hotspots: `App.jsx`, `Settings.jsx`, `gemma.js`, `byok.js`, `helpers.js`, `secure-storage.js`, `useAiModel.js`, `api/squarespace.js`, `api/shopify.js`, `api/model-proxy.js`, `ai/smartPastePipeline.js`, plus a repo-wide grep for storage and credential patterns.

---

## Top Findings (ranked by impact)

### 1. `src/components/Settings.jsx` — 1,852-line god component **[HIGH · L]**

**File:** `src/components/Settings.jsx`

**What's wrong:**

- One component owns: business profile form, billing, tax, invoicing, PDF template, Squarespace + Shopify integration UI + connection tests, Contacts import, AI mode picker, on-device Gemma UI (download/load/delete + progress sentinels), Universal Sentence Encoder UI, BYOK (provider tutorials, key entry, model picker, custom model fallback), ExecuTorch UI, log viewer modal, backup export (JSON + CSV with secret-include opt-in), restore modal, Tour replay, Debug log-level + log buffer.
- 16 `useState` + 1 `useRef` (lines 73–89) — variants of the same idle/testing/ok/error pattern repeated for Squarespace, Shopify, BYOK, BYOK model list, BYOK custom model, backup busy/error.
- 21-field destructure from the `ai` prop (lines 41–70) — leaks every public field of `useAiModel` into this component; any signature change forces a Settings.jsx edit.
- Triple state pattern: `settings` (context) → local `s` (line 73) → `setS`. The "save" path (lines 119–124, 1843–1846) must remember to call both `setS(next)` and `saveSettings(next)` to avoid drift; easy to forget in new branches.
- Inline log-viewer modal (lines 265–357) with hardcoded inline styles — clearly its own component.
- Hardcoded `BYOK_PROVIDERS` array inside the component (lines 767–821) duplicates the `BYOK_PROVIDERS` export from `src/byok.js` (lines 16–41) — two sources of truth for provider metadata.
- Inline-style JSX is everywhere (sample: lines 244–262, 269–356, 619–665, 902–1071) — `style={{ ... }}` blocks of 5–15 properties make diffs hard and theming impossible without reaching into JSX.
- Backup/restore logic (`exportJson`, `exportCsv`, `handleTest`, `handleShopifyTest`, lines 165–234) is sequencing logic that belongs in a hook; mixing it with rendering means the component re-renders on every `backupBusy` flip.

**Why it matters:** This is the single biggest source of regression risk. CLAUDE.md's "Read the full file before editing" rule effectively means every Settings change requires loading 1.8k lines into context. A new feature in any subdomain (a new BYOK provider, a new integration, a new debug toggle) compounds the problem.

**Estimated effort:** **L (1–2 weeks)**. Can be split: (a) extract `ByokSection`, `OnDeviceAiSection`, `EmbedderSection`, `ExecutorchSection`, `IntegrationsSection`, `BackupSection`, `LogViewerModal` as separate components; (b) consolidate the idle/testing/ok/error pattern into a `useAsyncStatus` hook; (c) drop the inline `BYOK_PROVIDERS` and read from `byok.js`. Each split is a small, individually-testable PR.

---

### 2. `src/gemma.js` — multi-purpose module with singleton state, plus domain leakage **[HIGH · M]**

**File:** `src/gemma.js`

**What's wrong:**

- Self-describes as "Dev-only entry point" (lines 4–10) yet is imported by `useAiModel.js` (lines 8–16) and `Settings.jsx` (lines 7–12). The migration to `gemmaWorker.js` never finished — both paths coexist and `useAiModel.loadModelViaFacade` (lines 36–49) explicitly falls back to `gemmaInit` from this file.
- One module owns: model registry (lines 28–84), platform detection (90–96), OPFS helpers (112–122), native FS helpers (126–129), download (191–304), init (314–421), prompt formatting (`gemmaPrompt`, 436–438), Smart Paste **domain logic** (`cleanOrderText`, 458–496), generic generation (500–514), and a session token constant (24).
- Module-level mutable singletons `_llm`, `_loadedModelId`, `_abortCtrl` (lines 100–102) — only one model can ever be loaded; tests must reset module state.
- `cleanOrderText` (lines 458–496) embeds the Stage 1 Smart Paste prompt — strips WhatsApp timestamps, splits combined lines — inside what should be model plumbing. This prompt belongs in `src/ai/` next to `smartPastePipeline.js` and `prompts/`.
- Web download path holds the entire model in JS heap: `await file.arrayBuffer()` → `new Uint8Array(buffer)` (lines 347–352). The `small` model is ~670 MB; this is a huge transient allocation on a phone browser.
- Untyped progress sentinel (`null` / `-1` / `0..1` / `1`, documented lines 279–285) is duplicated across `Settings.jsx` consumers — `connecting/indeterminate/progress` branches at lines 882–884, 1112–1129. A typed `DownloadStatus` discriminated union would eliminate the comment-driven contract.
- `MODELS.pro` (lines 49–55) is labelled "Gemma 2 2B" with a HuggingFace URL, but the proxy at `api/model-proxy.js:16` serves Qwen2.5-1.5B for the same `pro` ID. The two registries are out of sync — the proxy comment (`api/model-proxy.js:11–12`) admits they should match but the code already drifted (a previous SMA-47 incident is even cited in the comment).

**Why it matters:** Mixed responsibilities + module singletons make the AI subsystem the hardest area to test and the easiest to break. The `cleanOrderText` leak means changing the Smart Paste prompt forces a `gemma.js` edit, which forces a worker redeploy. The 670 MB ArrayBuffer is a memory cliff for low-end Android browsers.

**Estimated effort:** **M (3–5 days)**. Split into `src/ai/models.js` (registry), `src/ai/storage.js` (OPFS + Capacitor FS abstraction), `src/ai/download.js` (resumable streams), and move `cleanOrderText` next to `smartPastePipeline.js`. Add a typed `DownloadStatus` to replace the sentinel.

---

### 3. Squarespace + Shopify duplication — Rule of Three already triggered **[HIGH · M]**

**Files:** `src/api/squarespace.js`, `src/api/shopify.js`

**What's wrong:** The two files implement the same end-to-end pipeline (auth → cursor pagination → flatten variants → 30-day window filter → typed projection) with parallel but copy-pasted code:

- Native vs browser branch repeated inline inside `do { ... } while (cursor)` — `squarespace.js:14–26`, `shopify.js:68–105`.
- `stripDesc` / `stripHtml` are the same function under different names (`squarespace.js:39–46` vs `shopify.js:108–115`).
- `THIRTY_DAYS` window filter is duplicated verbatim — `squarespace.js:130–136` ≈ `shopify.js:255–261`.
- Variant flatten + suffix logic duplicated — `squarespace.js:48–70` ≈ `shopify.js:117–161`.
- Both files separately decide the dev-proxy URL (`/api/sqsp/...` vs `/api/shopify/...`) and the native CapacitorHttp branch.

A third provider (Wix, BigCommerce, Etsy) will produce a third copy. There is no shared `CatalogProvider` interface that both implement.

**Why it matters:** Bug fixes (e.g. SMA-249's CI signal logic, or the next "filter pagination drops items" issue) must be applied twice and tested twice. The two are already drifting — Shopify uses `__test` exports for testability (line 267), Squarespace doesn't.

**Estimated effort:** **M (3–4 days)**. Extract `src/api/catalogProvider.js` with `CatalogProvider` interface (`fetchProducts`, `fetchOrders`, both with progress callbacks); make `squarespace.js` and `shopify.js` adapters that supply `auth`, `urlBuilder`, and `flattenProduct`. The 30-day filter, `stripHtml`, and the native/browser branch belong in the shared module.

---

### 4. localStorage sprawl with no central key registry **[HIGH · S]**

**Files:** 15+ files touch `localStorage` directly:
`App.jsx:32,69,104,110`, `hooks/useInvoiceState.js:12–91` (8 sites), `hooks/useAiModel.js:52,98,121`, `hooks/useCatalogSync.js:35–55`, `hooks/useOrderSync.js:29–89`, `hooks/useContacts.js:31,42`, `hooks/usePicker.js:12–53`, `contexts/SettingsContext.jsx:76,82,156`, `services/correctionStore.js`, `components/InvoiceEditor.jsx:114`, `components/SmartPasteFeedbackModal.jsx:13,18`, `components/FineTuneExportButton.jsx:37`, `sync/storage/LocalStorageSync.js`, `ai/productDictionary.js:103`, `secure-storage.js:64–86`, plus `utils/dataExport.js` and `utils/dataImport.js` for backup/restore.

**What's wrong:**

- No central registry of `sip_*` keys. `dataExport.js` and `dataImport.js` enumerate "every persisted `sip_*` key" but the list is maintained by hand against scattered call sites — adding a new key in one place silently breaks backup completeness.
- **Split write authority on `sip_draft_edit`:** both `components/InvoiceEditor.jsx:114` and `hooks/useInvoiceState.js:48,64,91` write this key. Two writers for one piece of state is exactly how editor-restore bugs happen.
- `SmartPasteFeedbackModal.jsx:13,18` writes user fine-tune training data (JSONL) to plain `localStorage` (`FINETUNE_STORAGE_KEY`). This is opt-in user content that backup/export does not encrypt or warn about.
- `App.jsx:32` reads `sip_draft_edit` to decide initial tab, while `useInvoiceState.js:12,30` independently uses the same key to decide editor-open state. Two readers, two interpretations.
- CLAUDE.md tech-debt item #3 calls this out ("data loss risk, no multi-device sync. Flag any feature that compounds this surface") — every feature added since has compounded it.

**Why it matters:** Every new feature that adds a `sip_*` key risks (a) breaking backup/export, (b) breaking restore, and (c) introducing race conditions if two writers diverge. The codebase already has one such race waiting to bite.

**Estimated effort:** **S (1–2 days)** for a registry + thin wrapper (`storage.js` exporting typed get/set per known key). Migrating call sites can be incremental.

---

### 5. `App.jsx` — leaky provider boundary + heavy prop drilling **[MED · S]**

**File:** `src/App.jsx` (262 lines)

**What's wrong:**

- `<InvoiceProvider onOpenEditor={() => setTab('invoices')}>` (line 41) — invoice context now knows about routing. The provider should expose a `requestEditorOpen` event for the shell to listen to, not the other way around.
- `InvoiceEditor` receives **6 AI/settings props** despite `SettingsProvider` wrapping the whole app (lines 196–208): `aiMode`, `aiReady`, `runInference`, `smartPasteContext`, `searchTier`, `byokProvider`. These should be read from context inside `InvoiceEditor` (or its children), not threaded.
- Onboarding handlers `handleOnboardConnect` (lines 82–107) and `handleOnboardDemo` (108–113) embed business decisions (provider validation, sample-invoice loading, tour start) in the shell — they belong in `Onboarding.jsx` or a dedicated `useOnboarding` hook.
- Direct `localStorage` reads/writes at lines 32, 69, 104, 110 — bypasses any abstraction; the keys (`sip_onboarded`, `sip_draft_edit`) are conventions documented nowhere central.
- CLAUDE.md still describes this file as "Monolithic root (16+ useState hooks)" — that's stale; the actual count is 4. The doc lags reality.

**Why it matters:** The leaky provider (`onOpenEditor`) inverts the dependency — every router change can break the invoice context. The prop-drilling makes `InvoiceEditor`'s prop signature artificially wide.

**Estimated effort:** **S (1 day)**. Replace `onOpenEditor` with a context-internal event, move AI props into context-driven reads in `InvoiceEditor`, extract `useOnboarding`.

---

### 6. `src/helpers.js` — module-level mutable state + mixed concerns **[MED · S]**

**File:** `src/helpers.js` (214 lines, 16 exports)

**What's wrong:**

- Lines 1–14 define mutable module-level vars `_currency`, `_invoicePrefix`, `_invoicePadding` set via setter functions. `fmt` (16–17) and `nextId` (20–28) depend on these — output depends on side-effect setter calls, not on arguments. Tests must remember to reset; concurrent renders with different settings would race.
- The file mixes at least four concerns: invoice ID/blank/totals math (lines 1–77), generic time formatting (`timeAgo`, 79–86), Smart Paste preprocessing (`normalizeText`, `cleanWhatsApp`, `extractItems`, `EXTENDED_STOPWORDS`, lines 90–182), and product grouping/searching (`groupProducts`, `scoreGroup`, `searchGroups`, lines 186–213). Plus a re-export of `matcher.js` symbols (line 184) — meaning `helpers.js` becomes a barrel for unrelated modules.
- `extractItems` (144–182) is the _original_ rule-based Smart Paste extractor — it now coexists with the LLM-based pipeline in `src/ai/smartPastePipeline.js`. Whether it's still used vs. dead is non-obvious.

**Why it matters:** Module-level mutable state is the leading cause of test flakiness in this kind of codebase. The mixed concerns mean grepping `helpers.js` returns false positives for callers looking for unrelated symbols.

**Estimated effort:** **S (1 day)**. Move currency/prefix into `SettingsContext` (where they already live) and have `fmt`/`nextId` accept settings as args. Split file into `src/utils/format.js` (currency/time), `src/services/invoiceMath.js` (totals, blank, nextId), `src/ai/legacy/extractItems.js` (or delete if unused), and `src/catalog/grouping.js`.

---

### 7. BYOK security posture — direct browser access to provider keys **[MED · S]**

**Files:** `src/byok.js`, `src/secure-storage.js`

**What's wrong:**

- `src/byok.js:133, 260` sets `'anthropic-dangerous-direct-browser-access': 'true'` to allow the user's Anthropic key to go straight from the browser to `api.anthropic.com`. Anthropic's own header name flags this as dangerous: any XSS, malicious browser extension, or shared device exposes the key. There's no proxy fallback offered.
- Gemini key is sent in URL query string (`buildListRequest:121`, `buildRequest:240`: `?key=${encodeURIComponent(apiKey)}`). Query params end up in proxy logs, browser history, and `Referer` headers. Header-based auth would be safer where supported.
- Web fallback for `secure-storage.js` is `sessionStorage` (lines 25, 40, 53). Settings.jsx surfaces a warning about this (line 240–262) — acceptable trade-off, but it's the only place a user sees the disclosure. A user importing a backup with `includeSecrets=true` (Settings.jsx:166–172) into a web browser silently writes plaintext keys to sessionStorage with no further prompt.
- `secure-storage.migrateKeysFromLocalStorage` (lines 80–88) hardcodes `['openrouter', 'gemini', 'openai', 'anthropic']`. Adding a fifth provider requires editing this list — easy to miss.

**What's good:** Key sanitization in error messages (`byok.js:67–71`), HTTPS enforcement on custom base URLs (`byok.js:50–52`), `readJsonSafe` to avoid throwing on malformed bodies, no `eval` / `dangerouslySetInnerHTML` anywhere in the production codebase, no client-side `process.env` references, model-proxy uses an allowlist.

**Why it matters:** The Anthropic and Gemini paths are the realistic XSS exfiltration risk. Anthropic's own SDK warns against it; we'd need either a server-side proxy (mirroring `api/model-proxy.js`) or a clear in-app warning when these providers are selected.

**Estimated effort:** **S (1–2 days)**. (a) Move Anthropic and Gemini routing through a Vercel edge proxy (same shape as `api/model-proxy.js`) so the key stays server-side; alternatively, surface an in-app advisory when selecting these providers on web. (b) Drive `migrateKeysFromLocalStorage` from the `BYOK_PROVIDERS` registry rather than a hardcoded list.

---

### 8. `src/hooks/useAiModel.js` — multi-domain hook (343 lines, 16 useState) **[MED · S]**

**File:** `src/hooks/useAiModel.js`

**What's wrong:**

- One hook owns five subsystems: on-device Gemma (download/load/delete + auto-init `useEffect` lines 76–117), Universal Sentence Encoder embedder (lines 59–63, 150–185), BYOK testing/listing (lines 64–65, 209–252), ExecuTorch native (lines 66–67, 254–303), and the runInference adapter (lines 305–309).
- 16 useState (lines 52–67) — same anti-pattern as Settings.jsx, just shifted into a hook.
- Hardcoded tokenizer-name derivation `model.filename.replace('.pte', '_tokenizer.bin')` (lines 270, 294) — fragile; if a new ExecuTorch model uses a different tokenizer naming convention this breaks silently.
- Imports across 6+ AI sub-modules (`embeddings`, `gemma`, `gemmaWorker`, `byok`, `secure-storage`, `pipeline`, `executorch`) — high fan-in makes the hook the central choke point for any AI change.
- The ExecuTorch path duplicates download semantics that already exist in `gemma.js` (`Filesystem.deleteFile` calls, model-not-found handling at lines 285–303).

**Why it matters:** Every AI feature change touches this hook. Splitting it into `useOnDeviceModel`, `useEmbedder`, `useByok`, `useExecutorch` would isolate failure domains and shrink Settings.jsx's destructure (Finding #1).

**Estimated effort:** **S (1–2 days)**. Mechanical split — each sub-hook is already a coherent block of useState + handlers.

---

### 9. `api/model-proxy.js` — registry drift and inconsistent routing **[LOW · XS]**

**File:** `api/model-proxy.js` (57 lines)

**What's wrong:**

- `MODEL_URLS.pro` (line 16) points to `Qwen2.5-1.5B-Instruct...task` but `gemma.js:49–55` declares `pro` as "Gemma 2 2B" with a HuggingFace Gemma URL. The proxy comment (lines 11–12) explicitly acknowledges this should be in sync — it isn't.
- Inconsistent routing between models: `small` is fetched via the proxy on web (`gemma.js:42`) and direct on native (`gemma.js:43–44`); `pro` goes direct on both web and native (`gemma.js:53`). New contributors will assume the proxy is mandatory and either route everything through it or skip it.
- 1-year `Cache-Control: immutable` (line 52) is correct for content-addressed releases but if a model URL is updated under a stable ID (as `pro` apparently has been), CDN caches will serve the old bytes.

**Why it matters:** The label-to-bytes drift caused a documented SMA-47 regression (cited in the file's own comment). It can recur the next time the proxy is updated without `gemma.js` being touched.

**Estimated effort:** **XS (under 1 hour)**. Either (a) make `gemma.js`'s `MODELS` the single source of truth and have the proxy import/derive from it, or (b) add a CI check that asserts `MODEL_URLS[id]` matches `MODELS[id].nativeUrl`/`url` for any `public: true` model.

---

### 10. `src/ai/smartPastePipeline.js` — well-structured but `runInference` contract is informal **[LOW · XS]**

**File:** `src/ai/smartPastePipeline.js` (622 lines)

**What's good:** Pure orchestration, small named functions, clear stage names, careful JSON salvage for truncated provider responses (`safeParseJsonArray` lines 29–58, `salvagePartialJsonArray` lines 86–154). Cognitive load is OK in 5 minutes thanks to the section header comment at the top.

**What's wrong:** Multiple call sites do `typeof result === 'string' ? result : result?.text` (lines 222, 366, 382) — a sign that `runInference` doesn't have a stable typed contract. Same for `'stopReason' in result` checks (lines 223–224, 383–384). A typed `InferenceResult = { text: string; stopReason: string | null }` shared between this file, `byok.js`, and `useAiModel.js`'s adapter would eliminate the runtime branching.

**Why it matters:** Low — these are defensive shims that work. But every new caller of `runInference` either copies the shim or forgets it.

**Estimated effort:** **XS (under 1 hour)** to define the type and update the three call sites; the codebase has only one `.ts` file today, so this could double as a TypeScript-adoption proof point.

---

## Cross-Cutting Themes

- **CLAUDE.md is stale.** It still flags `App.jsx` as the monolith — the real monolith is now `Settings.jsx`. CLAUDE.md is itself debt.
- **TypeScript adoption is ~0.7%** (one `.ts` file: `src/invoiceLifecycle.ts`). The strict TS settings (`noUnusedLocals`, `noUnusedParameters`) only police that one file. Several findings above (#2 progress sentinels, #4 storage keys, #10 `runInference` contract) would shrink with even minimal incremental TS adoption on the AI/storage boundaries.
- **No `useCallback`/`useMemo` discipline.** Settings.jsx and useAiModel.js do not use either; handlers are recreated on every render. Probably not a perf hotspot today, but it'll show up the moment any of these hooks land in a context value (and InvoiceEditor already takes 6 callbacks as props).
- **Test coverage is real but uneven.** Pipeline (`smartPastePipeline.test.js`), `byok.test.js`, `gemmaBuildModelOptions.test.js`, `gemmaWorker.test.js`, lifecycle, and storage roundtrip are well covered. `Settings.jsx` has multiple test files (`Settings.aiProgress`, `Settings.byok`, `Settings.debugging`, `Settings.backup`) — but with 1.8k lines of UI to cover, blind spots are inevitable.
- **No deferred dead code spotted in the read sample**, but `helpers.extractItems` (rule-based Smart Paste) and `gemma.cleanOrderText` (Stage-1 Smart Paste in the wrong file) are candidates for an audit pass — they may have surviving callers, may not.

---

## Effort Legend

- **XS:** under 1 hour
- **S:** under 1 day
- **M:** 2–5 days
- **L:** 1–2 weeks
