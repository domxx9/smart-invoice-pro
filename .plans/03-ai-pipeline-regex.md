# Phase 3 — AI Pipeline & Regex Parser

**Effort:** ~2-3 days | **Priority:** High | **Depends on:** Phase 0

## Context
Smart Paste's regex parser only handles 2 quantity patterns and the AI matching blocks the UI. This phase improves parsing reliability, replaces fuzzy matching with Fuse.js, and makes AI non-blocking. All AI calls go through `gemma.js` (MediaPipe/WebGPU).

## Tasks

### 3a. Install Fuse.js
```bash
npm install fuse.js
```
14KB, zero deps.

### 3b. Replace `getTopCandidates()` with Fuse.js
**File:** `src/helpers.js:161-169`

Replace custom `wordSim`-based matching with Fuse.js Bitap algorithm:
```js
import Fuse from 'fuse.js'

export function getTopCandidates(name, products, n = 5) {
  const fuse = new Fuse(products, {
    keys: ['name'],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,  // don't penalise mid-string matches
  })
  return fuse.search(name).slice(0, n).map(r => r.item)
}
```

Handles typos, transpositions, and mid-word matches that `wordSim` misses. `ignoreLocation: true` is critical for product names like "Blue Molar Extractor".

### 3c. Improve `extractItems()` — 4-Stage Parser
**File:** `src/helpers.js:69-87`

Extend from 2 quantity patterns to 4, with confidence scoring:

| Pattern | Example | Confidence |
|---------|---------|------------|
| `N x Item` / `N × Item` | `2x Blue Extractor` | 1.0 |
| `Item x N` | `Blue Extractor x2` | 1.0 |
| `Item (qty: N)` / `Item (x3)` | `Cassette (qty: 10)` | 1.0 |
| `N Item` (2+ word name, capitalised) | `5 Sterilisation Cassettes` | 0.75 |

Additional improvements:
- Split on `;` in addition to `\n` and `,`
- Paren-aware comma splitting (don't split `"Scissors, small (blunt tip)"`)
- Strip currency symbols (`£$€`), leading/trailing punctuation
- Discard items with cleaned name < 3 chars
- Items with confidence 0.75 flagged for AI review even if fuzzy match > 65%

### 3d. Non-Blocking Background AI in InvoiceEditor
**File:** `src/components/InvoiceEditor.jsx:68-101`

**Current (blocking):** Sequential `for` loop with `await matchWithGemma()` per item.

**New (non-blocking):**
```js
const runParse = async () => {
  // Stage 1: regex — immediate results
  const cleaned = cleanWhatsApp(pasteText)
  const extracted = extractItems(cleaned)
  const initial = matchItems(extracted, products)
  setPasteResults(initial)

  // Stage 2: AI — parallel, non-blocking
  if (!aiReady) return
  const lowConf = initial.map((r, i) => ({ r, i })).filter(({ r }) => r.confidence < 65)
  if (!lowConf.length) return

  setPasteAiLoading(true)
  const updated = [...initial]

  await Promise.allSettled(
    lowConf.map(async ({ r, i }) => {
      const candidates = getTopCandidates(r.name, products, 5)
      if (!candidates.length) return
      const match = await matchWithGemma(r.name, candidates)
      if (match) {
        updated[i] = { ...updated[i], product: match, bestGuess: null, confidence: 90, aiEnhanced: true }
        setPasteResults([...updated])  // incremental update
      }
    })
  )
  setPasteAiLoading(false)
}
```

Key changes:
- `Promise.allSettled` instead of sequential `for/await`
- Each resolved match updates state immediately (user sees green items pop in)
- Textarea remains visible during AI loading (remove the conditional hide)
- Spinner shown as indicator below "Parse & Match" button, not replacing textarea

### 3e. Create `src/ai/pipeline.js`
New file — abstracts AI mode selection (on-device vs cloud BYOK):

```js
export async function matchItem(itemName, candidates, mode, provider, apiKey) {
  if (mode === 'ondevice' || mode === 'small') {
    const { matchWithGemma } = await import('../gemma.js')
    return matchWithGemma(itemName, candidates)
  }
  if (mode === 'byok' && apiKey) {
    return matchItemCloud(itemName, candidates, provider, apiKey)
  }
  return null
}
```

Cloud provider implementations (OpenAI, Anthropic, OpenRouter, Gemini) added here when BYOK is wired up. Each uses `max_tokens: 3` — just a digit reply.

InvoiceEditor.jsx should import from `pipeline.js` instead of directly from `gemma.js`.

## Files Modified
- `src/helpers.js` — `getTopCandidates()` rewrite, `extractItems()` rewrite
- `src/components/InvoiceEditor.jsx` — `runParse()` rewrite, textarea always visible

## Files Created
- `src/ai/pipeline.js`

## Verification
- Paste `"2x Blue Extractor\nCassette (qty: 10)\n5 Sterilisation Cassettes"` → all 3 parsed correctly
- Low-confidence items show AI spinner but textarea remains interactive
- AI results appear incrementally (green items pop in one by one)
- Run `npm test` — helpers.test.js passes with new parser patterns
