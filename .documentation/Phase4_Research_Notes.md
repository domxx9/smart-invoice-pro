# Phase 4 — On-Device AI — Research Notes

**Date:** 2026-04-11
**Status:** Research complete, ready for implementation

---

## Key Finding: Tiered Model Strategy (April 2026)

Based on latest testing and the `litert-community` hub, we will offer a **Tiered Model Strategy**. This allows the user to balance download speed, memory usage, and AI quality.

### Model Options Overview

| Tier | Model | Approx. Size | Memory | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **Nano** | **Gemma 3 270M IT** | ~250 MB | Low | Quick data extraction & categorization |
| **Small** | **Gemma 3 1B IT** | ~750 MB | Medium | **(Recommended)** Default invoice analysis |
| **Pro** | **Gemma 2 2B IT** | ~1.6 GB | High | Complex summarization & draft writing |
| **Alt** | **Llama 3.2 1B IT** | ~1 GB | Medium | high-performance reasoning (Alt Small) |

**Recommendation:** Default to **Gemma 3 1B IT**. It is significantly smaller than the previous 2.5 GB baseline while outperforming it on extraction tasks due to its improved architecture.

### Source URLs

- **Gemma 3 (Google Official):** https://huggingface.co/litert-community/gemma-3-1b-it-litert-lm
- **Gemma 3 Nano:** https://huggingface.co/litert-community/gemma-3-270m-it-litert-lm
- **Gemma 2 (Pro):** https://huggingface.co/litert-community/gemma-2-2b-it-litert-lm
- **Llama 3.2 (Meta/Community):** https://huggingface.co/litert-community/Llama-3.2-1B-Instruct-it-litert-lm
- **Web JS SDK Guide:** https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/web_js

---

## API Surface (Confirmed from Official Sample)

The MediaPipe LLM Inference API is straightforward:

### Initialization
```javascript
import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai';

const genai = await FilesetResolver.forGenAiTasks(
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm'
);

const llm = await LlmInference.createFromOptions(genai, {
  baseOptions: { modelAssetPath: MODEL_URL },  // URL to .task file
  // OR: baseOptions: { modelAssetBuffer: readableStream },  // for local file
  maxTokens: 512,
  temperature: 0.1,
  topK: 40,
});
```

### Streaming Generation
```javascript
llm.generateResponse(prompt, (partialResult, complete) => {
  // partialResult: new chunk of text (NOT cumulative — just the new piece)
  // complete: boolean — true when done
});
```

### Cancellation
```javascript
llm.cancelProcessing();
```

### Prompt Format (Gemma 3/4)
```
<start_of_turn>user
{user_message}
<end_of_turn>
<start_of_turn>model
```

---

## Architecture Decisions

### 1. Model Delivery — Download from HuggingFace CDN

The build plan suggests hosting on your own CDN (Cloudflare R2 / S3). However, HuggingFace already hosts the file with free CDN and fast global delivery. For v1, we can use the HuggingFace direct download URL:

```
https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task
```

This eliminates CDN costs entirely for now. We can migrate to our own CDN later if needed.

### 2. Storage — Browser Cache vs Capacitor Filesystem

**On web (PWA):** We cannot use `@capacitor/filesystem`. Instead, we'll use:
- **Cache API** or **Origin Private File System (OPFS)** for persistent browser storage
- IndexedDB as fallback

**On native (Android/iOS via Capacitor):** We can use `@capacitor/filesystem` to save the model to the device's data directory.

**Decision:** Build a platform-aware storage adapter:
- Web → OPFS (best for large files in browser)
- Native → `@capacitor/filesystem`

### 3. WebGPU Requirement

WebGPU is **required** — there is no WASM fallback for the LLM Inference API (only GPU backend supported per the docs). This means:
- Chrome 113+ ✅
- Edge 113+ ✅
- Safari 18+ ✅ (partial — check WebGPU support)
- Android WebView — needs verification

We should detect WebGPU availability and show a clear message if unavailable.

### 4. `inferGemma()` is Defined but Never Called

The stub function exists at line 312 of App.jsx, but it is never actually called from any UI component. The Smart Paste feature uses a separate regex-based extraction system. We need to:

1. Wire `inferGemma` into an AI Assistant widget (new)
2. Optionally enhance Smart Paste to use Gemma for better extraction
3. Update the Settings screen's "AI Model" section from a static badge to a working download/status UI

### 5. Multi-Model Configuration
A new `MODELS` registry in `src/gemma.js` will link IDs to their respective URLs and local filenames.

---

## What We'll Build

### New Module: `src/gemma.js`
Standalone AI inference module with:
- Model download with progress tracking
- Multi-model registry (Nano, Small, Pro)
- Platform-aware storage (OPFS for web)
- WebGPU detection
- LLM initialization and streaming generation
- Prompt formatting for Gemma 3 and Llama 3.2

### Modified: `src/App.jsx`
- Replace `inferGemma()` stub with import from `src/gemma.js`
- Add AI Assistant panel to invoice editor (free-form prompt → streaming response)
- Update Settings screen: Tier selection cards with download/delete buttons
- Wire Smart Paste to optionally use the selected model

### New Dependencies
- `@mediapipe/tasks-genai` — MediaPipe LLM Inference API

### NOT Adding (deferred)
- `@capacitor/filesystem` — Not needed for web-first approach; can add later for native builds

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| 2.58 GB download too large for mobile | Progressive download with resume; show clear size warning |
| WebGPU not available on older devices | Detection + graceful degradation message + keep regex-based Smart Paste as fallback |
| Model loading takes 10-30 seconds on cold start | Show loading state with spinner; cache model in OPFS/Filesystem |
| HuggingFace CDN rate limits | Monitor; migrate to own CDN if needed |
| CORS issues downloading from HuggingFace | HF supports CORS on resolve/ URLs; verified via live demo |
