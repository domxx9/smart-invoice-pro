# Smart Invoice Pro — Agent Context

Mobile invoicing app: React 18 + Vite 5 + Capacitor 8.3 (Android). On-device AI via MediaPipe/Gemma. Squarespace + Shopify catalog sync. jsPDF invoice generation.

## Commands

```bash
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Production build → dist/
npm run preview      # Serve built bundle locally
npm run lint         # ESLint across repo
npm run format       # Prettier write on src/
npm run format:check # Prettier check (CI)
npm run typecheck    # tsc --noEmit (TypeScript validation)
npm test             # Vitest single-run (required before commit)
npm run test:watch   # Vitest watch mode
npm run deploy:preview  # vercel deploy (preview)
npm run deploy       # vercel deploy --prod
```

## Environment Requirements

- Node >= 22.0.0
- Android SDK + Java 21 (for Capacitor builds)
- `.env.local` for local secrets — **never commit**

## Architecture

### Entry Points

- `src/main.jsx` — React mount
- `src/App.jsx` — Monolithic root (16+ useState hooks; see Tech Debt below)
- `api/model-proxy.js` — Vercel serverless proxy for BYOK model calls

### Source Layout

```
src/
  App.jsx                 # Root component — state debt lives here
  ai/                     # AI pipeline (embeddings, smartPastePipeline, productDictionary)
  api/                    # Squarespace + Shopify API integration
  catalog/                # Catalog management, variant upsert logic
  components/             # 40+ React components (no class components)
  contexts/               # React Context (ToastContext, etc.)
  hooks/                  # Custom hooks (useAiModel, useInvoiceState, useCatalogSync, …)
  services/               # Business logic (stateless)
  utils/                  # Pure utility functions
  workers/                # Web Workers — mediapipeWorker.js, streamingGuard.js
  plugins/                # Capacitor plugin wrappers (executorch.js)
  constants/              # App-wide constants + smartPasteContextPresets
  __tests__/              # Vitest + RTL test suite (72+ test files)
  gemma.js / gemmaWorker.js   # On-device Gemma LLM (MediaPipe GenAI)
  byok.js                 # BYOK cloud AI integration
  secure-storage.js       # Capacitor secure storage wrapper
  pdf.js                  # jsPDF invoice generation
  matcher.js              # Fuse.js fuzzy matching
  invoiceLifecycle.ts     # TypeScript invoice state machine
android/                  # Capacitor Android shell
```

### Key Dependency Notes

| Dep                               | Purpose                 | Notes                                                        |
| --------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `@mediapipe/tasks-genai` 0.10.27  | On-device LLM inference | Requires ES-module worker format (Vite config enforces this) |
| `capacitor-secure-storage-plugin` | API key storage         | **Never use localStorage for secrets**                       |
| `jspdf` 4.2.1                     | PDF invoice generation  |                                                              |
| `fuse.js` 7.3                     | Fuzzy product search    | ≤5k products on-device; >5k routes to BYOK LLM               |
| `react-swipeable` 7.0.2           | Swipe gestures (mobile) | Pinned — do not bump without testing Android                 |

## Coding Conventions

- **TypeScript preferred** for new modules. Migrate incrementally — `.ts`/`.tsx` alongside existing `.js`/`.jsx`.
- **Strict TS**: `strict: true`, `noUnusedLocals`, `noUnusedParameters` are enforced in `tsconfig.json`.
- Use `useCallback` for state mutation handlers passed as props (prevents child re-renders).
- **Secure storage**: all API keys and auth tokens → `secure-storage.js` (Capacitor secure storage). Never `localStorage`.
- No class components. Functional components only.
- Context + custom hooks for shared state. Do not add more top-level `useState` to `App.jsx`.
- Vitest globals available (`describe`, `it`, `expect`, `vi`) — no imports needed.
- Test files live in `src/__tests__/`. All new code must ship with tests.

## Anti-Regression Rules

1. **Read the full file before editing** — `App.jsx`, `gemma.js`, and `pdf.js` are large; partial reads cause missed dependencies.
2. **Never remove existing props or callbacks** without searching all call sites first (`Grep` for the prop name).
3. **Run `npm test` before committing** — hooks and CI both enforce this.
4. **Workers must stay ES-module format** — Vite config sets `worker: { format: 'es' }`. Any `require()` in a worker breaks MediaPipe.
5. **Capacitor plugin methods return thenables, not true Promises** — wrap with `Promise.resolve()` before `.then()`/`await`.
6. **Catalog upsert key = Variant ID** — never use product name or SKU as upsert key (breaks multi-variant products).

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `npm audit --audit-level=high` (dependency security scan)

PR template (`.github/pull_request_template.md`) requires: summary, Vercel preview URL, test plan checklist.

Branch naming: `feat/sma-NN-slug` | `fix/sma-NN-slug` | `chore/sma-NN-slug` | `test/sma-NN-slug`.

Commits must end with `Co-Authored-By: Paperclip <noreply@paperclip.ing>`.

Never commit: `.env.local`, credentials, `.vercel/` token files.

Husky + lint-staged run on pre-commit (ESLint + Prettier). Do **not** `--no-verify`.

## Tech Debt (Factor into Every Decision)

1. **Zero test coverage on new areas** — bias test-first on every touched file. 72 tests exist but coverage is uneven.
2. **Monolithic `App.jsx` state** — 16+ `useState` hooks with localStorage. Do not add more. Extract into contexts/hooks for any new feature area.
3. **localStorage-only persistence** — data loss risk, no multi-device sync. Flag any feature that compounds this surface.
4. **Silent failure modes** — sync failures go unnoticed. New code must surface errors via ToastContext or error boundaries.
5. **AI model download** — 670MB+ Gemma model, not resumable. Any AI-adjacent feature must account for progress UI and resume support.

## Agents

| Agent             | Role                |
| ----------------- | ------------------- |
| HAL (`3b718013`)  | CTO / code reviewer |
| Musk (`5a0977d4`) | Frontend Engineer   |
| Ada (`d8ee6af2`)  | Engineer            |

HAL reviews all Ada/Musk PRs before merge. Issue flow: `todo → in_progress → in_review (HAL) → done`.
