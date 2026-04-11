# Smart Invoice Pro — Application Build Plan

**Windows-first · Android Native · iOS via Cloud Mac · Gemma 4 On-Device AI**
Version 1.0 · April 2026

---

## Executive Summary

Smart Invoice Pro is a mobile-first billing and inventory application built with React, Capacitor, and Gemma 4 on-device AI. This build plan defines the complete path from local development on a Windows machine to published apps on both the Google Play Store (Android) and Apple App Store (iOS) — without requiring a Mac for the majority of the build process.

> **No-Mac Strategy:** Android is built entirely on Windows. iOS is handled via a rented cloud Mac session (~$5 total, ~2 hours needed) for the final Xcode archive and App Store submission only. A Progressive Web App (PWA) covers iOS users in the interim.

---

## Timeline at a Glance

| Phase | Timeline | Description |
|-------|----------|-------------|
| Phase 1 | Weeks 1–2 | Foundation & Local Development |
| Phase 2 | Weeks 3–4 | Android Build & Play Store |
| Phase 3 | Week 5 | PWA Deployment (iOS interim) |
| Phase 4 | Weeks 6–7 | Gemma 4 Real Integration |
| Phase 5 | Week 8 | iOS App Store via Cloud Mac |
| Phase 6 | Week 9+ | Polish, Analytics & v1.1 Roadmap |

---

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| UI Framework | React 18 + Vite | Component-based, fast HMR, Capacitor-compatible build output |
| Native Shell | Capacitor 6 | Wraps React in a native WebView — zero code rewrite required |
| Styling | Self-contained CSS (in-JS) | All design tokens live in the CSS constant inside App.jsx |
| On-Device AI | Gemma 4 1B via MediaPipe | gemma-4-1b-it-q4f16_1 · ~800MB · WebGPU · zero network calls |
| Cloud AI | Gemini API (fallback) | Used when on-device inference unavailable; optional |
| E-commerce | Squarespace Commerce API v1 | Product catalog sync and inventory update after each sale |
| Android Build | Android Studio + Gradle | Windows-native, no Mac required |
| iOS Build | Xcode 15 on cloud Mac | MacinCloud or GitHub Actions macOS runner; ~2hr session |
| PWA | Web Manifest + Service Worker | Installable on iOS Safari as interim before App Store ship |
| CI/CD | GitHub Actions | Automated build, lint, and optionally iOS archive |
| Version Control | Git + GitHub | Source of truth; required for cloud Mac pull |
| Package Mgmt | npm | Node 18+ required |

---

## Phase 1 — Foundation & Local Development
**Weeks 1–2 · Windows machine · No Mac required**

### Goal
Get the React app running locally, wired to your real Squarespace catalog, and ready to be wrapped by Capacitor.

### Environment Setup

| Task | Detail | Platform |
|------|--------|----------|
| Install Node.js 18+ | Download LTS from nodejs.org. Verify: `node --version` | Windows |
| Install Git | git-scm.com — required for version control and cloud Mac pull | Windows |
| Install VS Code | code.visualstudio.com — add ESLint + Prettier extensions | Windows |
| Install Claude Code | `npm install -g @anthropic-ai/claude-code` — run `claude` from project root | Windows |
| Install Android Studio | developer.android.com/studio — also installs Java 17 JDK and Android SDK | Windows |

### Project Scaffold

```bash
npm create vite@latest smart-invoice-pro -- --template react
cd smart-invoice-pro
npm install
```

- Replace `src/App.jsx` with the Smart Invoice Pro component (`SmartInvoicePro.jsx`)
- Clear `src/index.css` — all styles are self-contained in the component
- Edit `vite.config.js` and set `base: './'` — **critical for Capacitor**
- Run `npm run dev` — verify the app loads at `http://localhost:5173`

### Capacitor Initialisation

```bash
npm install @capacitor/core @capacitor/cli
npx cap init
# App name: Smart Invoice Pro
# App ID: com.yourname.smartinvoicepro
# Web asset directory: dist
npx cap add android
```

Confirm `capacitor.config.ts` has `webDir: 'dist'` and `androidScheme: 'https'`.

### Squarespace API Connection

- Enter your Squarespace API key in the app's Settings screen
- Locate the `fetchProducts()` stub and replace with a real fetch to the Squarespace Commerce API v1 endpoint
- Test that your live product catalog populates the Inventory screen and the product search autocomplete in the Invoice Editor

---

## Phase 2 — Android Build & Play Store
**Weeks 3–4 · Windows machine · No Mac required**

### Goal
Produce a signed Android App Bundle and publish it to the Google Play Store.

### Build Tasks

| Task | Detail |
|------|--------|
| Install Capacitor plugins | `npm install @capacitor/status-bar @capacitor/splash-screen @capacitor/haptics @capacitor/keyboard` |
| Configure status bar | Set `Style.Dark` and background `#0a0a0b` in `main.jsx` on native platform |
| Create app icon | Design 1024×1024 PNG. Use Android Studio Image Asset Studio to generate all mipmap sizes |
| Create splash screen | Place drawable in `android/app/src/main/res/drawable/`. Configure in `capacitor.config.ts` |
| Build & sync | `npm run build && npx cap sync` |
| Open in Android Studio | `npx cap open android` — wait for Gradle sync |
| Test on emulator | AVD Manager → create Pixel 7 Pro emulator → Run |
| Test on physical device | Enable USB debugging → connect → select in device dropdown → Run |
| Generate signed AAB | Build → Generate Signed Bundle → create keystore `.jks` → release build |
| Back up keystore | Save `.jks` file and passwords securely — **losing this prevents future updates** |
| Create Play Console account | play.google.com/console — one-time $25 USD registration |
| Upload to Play Store | Create new app → Production release → upload `.aab` → complete listing → submit |

> **⚠ Keystore Warning:** The `.jks` keystore file is permanently tied to your Play Store app. If you lose it you cannot publish future updates. Back it up to at least two separate locations (e.g. encrypted cloud storage and a USB drive).

### Play Store Listing Requirements

- Short description (80 chars max)
- Full description (4000 chars max)
- Feature graphic: 1024 × 500 px
- Phone screenshots: minimum 2, at least 1 must be 16:9 aspect ratio
- Content rating questionnaire (IARC)
- Privacy Policy URL — required; host a simple page on any free static host (Vercel, Netlify)

---

## Phase 3 — PWA Deployment (iOS Interim)
**Week 5 · Windows machine · iOS users covered immediately**

### Goal
Ship an installable web app for iOS users before the App Store build is ready. iOS Safari supports "Add to Home Screen" which gives a full-screen icon, offline support, and a native-feeling experience.

### PWA Setup

Add `public/manifest.json`:

```json
{
  "name": "Smart Invoice Pro",
  "short_name": "SIP",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0b",
  "theme_color": "#f5a623",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Add to `index.html` `<head>`:

```html
<link rel="manifest" href="/manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0a0a0b">
```

### Deployment

```bash
npm install -g vercel
npm run build
vercel
# Follow prompts — HTTPS is automatic, deploys in ~60 seconds
```

Test on iPhone: open deployed URL in Safari → Share → Add to Home Screen → confirm full-screen launch.

> **Note:** The Gemma 4 WebGPU inference path works in Chrome on Android and progressively in Safari on iOS 17+. The PWA is a fully functional delivery channel, not just a placeholder.

---

## Phase 4 — Gemma 4 On-Device AI Integration
**Weeks 6–7 · Windows machine · Real inference replaces stub**

### Goal
Replace the `inferGemma()` simulation stub with real Gemma 4 inference using the MediaPipe LLM Inference API. All processing runs on-device with zero network calls.

### Model Specs

| Property | Value |
|----------|-------|
| Model | gemma-4-1b-it |
| Quantisation | Q4F16 (4-bit weights, 16-bit activations) |
| File size | ~800 MB (downloaded once, cached on device) |
| Primary backend | WebGPU (Chrome 113+, Edge 113+, Android WebView) |
| Fallback backend | WASM (slower but works on all devices) |
| Privacy | Zero network — no data ever leaves the device |

### Integration Tasks

```bash
npm install @mediapipe/tasks-genai
npm install @capacitor/filesystem
npx cap sync
```

Replace the `inferGemma()` stub in `src/App.jsx` with the real implementation:

```javascript
import { FilesetResolver, LlmInference } from "@mediapipe/tasks-genai";
import { Filesystem, Directory } from "@capacitor/filesystem";

const MODEL_URL = "https://your-cdn.com/gemma-4-1b-it_q4_ekv1024.task";
const MODEL_PATH = "models/gemma-4-1b-it.task";
let llmInstance = null;

async function ensureModel(onProgress) {
  try {
    const { uri } = await Filesystem.getUri({ directory: Directory.Data, path: MODEL_PATH });
    return uri; // Already cached
  } catch {
    // Download with progress
    const response = await fetch(MODEL_URL);
    const reader = response.body.getReader();
    const total = parseInt(response.headers.get("content-length"));
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (onProgress) onProgress(received / total);
    }
    const blob = new Blob(chunks);
    const base64 = await new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.readAsDataURL(blob);
    });
    await Filesystem.writeFile({ path: MODEL_PATH, data: base64, directory: Directory.Data });
    return (await Filesystem.getUri({ directory: Directory.Data, path: MODEL_PATH })).uri;
  }
}

export async function inferGemma(promptText, onToken) {
  if (!llmInstance) {
    const modelPath = await ensureModel();
    const resolver = await FilesetResolver.forGenAiTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm"
    );
    llmInstance = await LlmInference.createFromOptions(resolver, {
      baseOptions: { modelAssetPath: modelPath },
      maxTokens: 512,
      temperature: 0.1,
      topK: 40,
    });
  }
  return new Promise((resolve, reject) => {
    let full = "";
    llmInstance.generateResponse(promptText, (partial, done) => {
      full += partial;
      if (onToken) onToken(full);
      if (done) resolve(full);
    }).catch(reject);
  });
}
```

### Model Delivery Strategy

Do not bundle the 800MB model in the app binary — this violates App Store size guidelines. Use the download-on-first-launch pattern:

- Host the model file on a CDN (Cloudflare R2 or AWS S3 — ~$0.01/GB egress)
- On first app launch, show a one-time "Setting up AI" screen with a progress bar
- Download to `Filesystem.Directory.Data` — persists across app launches
- Check for cached file on every subsequent launch and skip the download
- User experience: ~2 minute one-time setup, then instant on-device inference every time

---

## Phase 5 — iOS App Store via Cloud Mac
**Week 8 · Cloud Mac session (~$5, ~2 hours) · One-time setup**

### Goal
Produce a signed iOS archive and submit it to App Store Connect using a rented cloud Mac.

### Preparation (on Windows, before the Mac session)

- Push all code to GitHub and confirm `npm run build` produces a clean `dist/`
- Create your Apple Developer Program account ($99/year) at developer.apple.com
- Create your app record in App Store Connect — confirm your Bundle ID
- Prepare all App Store metadata: screenshots, description, keywords, privacy policy URL
- Generate iOS app icons using [appicon.co](https://www.appicon.co) — download the Xcode asset catalog

### Cloud Mac Session

Rent a session at **MacinCloud** (~$1/hour on-demand) or use a free GitHub Actions `macos-latest` runner.

```bash
# In the cloud Mac terminal:
git clone https://github.com/yourname/smart-invoice-pro
cd smart-invoice-pro
npm install
npx cap add ios
npx cap sync ios
cd ios/App && pod install && cd ../..
npx cap open ios
```

Then in Xcode:

1. Drag `AppIcon.appiconset` into `Assets.xcassets`
2. Set Bundle Identifier to match your App Store record
3. Set Development Team to your Apple Developer account
4. Set Version: `1.0.0` and Build: `1`
5. Select **Any iOS Device (arm64)** as target
6. Menu → **Product → Archive**
7. Organizer → **Distribute App** → App Store Connect → follow wizard
8. Go to appstoreconnect.apple.com → select build → Add for Review → Submit

Apple review typically takes 1–3 days for a new app.

### iOS Screenshot Requirements

| Device | Size | Required |
|--------|------|----------|
| iPhone 6.7" (Pro Max) | 1290 × 2796 px | Yes |
| iPhone 6.5" (Plus) | 1242 × 2688 px | Yes |
| iPad Pro 12.9" | 2048 × 2732 px | Optional |

Take screenshots from the iOS Simulator: Device → Take Screenshot (saves to Desktop).

> **Long-term tip:** Once your Apple certificates and provisioning profiles are stored as GitHub Secrets, a GitHub Actions workflow (`runs-on: macos-latest`) can build and upload your iOS archive automatically on every push to main — eliminating the need for any Mac session after the initial setup.

---

## Phase 6 — Polish, Analytics & v1.1 Roadmap
**Week 9+ · Ongoing · Both platforms**

### Post-Launch Essentials

| Feature | Package | Notes |
|---------|---------|-------|
| Crash reporting | `@sentry/capacitor` | Catch JS and native crashes in production |
| Analytics | Plausible or Mixpanel | Track invoice creation, AI usage, screen flows |
| Push notifications | `@capacitor/push-notifications` | Payment reminders, low-stock alerts |
| Biometric auth | `@capacitor/biometric` | Face ID / fingerprint to open app |
| PDF invoice export | `jspdf` | Generate PDF from invoice data, share via native share sheet |
| Receipt camera scan | `@capacitor/camera` | Photo → Gemma 4 for line item extraction |
| Cloud backup | `@capacitor/filesystem` | Backup invoice data to user's cloud storage |
| Multi-currency | `open.er-api.com` | Live exchange rates, free tier |

---

## Windows vs Mac — Decision Reference

| Task | Windows | With Mac Access |
|------|---------|----------------|
| React development | Full — VS Code + Vite | Full |
| Claude Code sessions | Full — runs anywhere Node runs | Full |
| Android build | Full — Android Studio on Windows | Full |
| Play Store submission | Full — browser-based | Full |
| PWA deployment | Full — any static host | Full |
| Gemma 4 integration | Full — WebGPU works in Chrome | Full |
| iOS simulator testing | Not possible | Full — Xcode Simulator |
| iOS Xcode archive | Not possible natively | Required — ~2hr session |
| App Store submission | Not possible natively | Browser upload after archive |
| Future iOS updates | Repeat cloud Mac session (~1hr) | Full |

---

## Estimated Costs

| Item | Cost | Frequency |
|------|------|-----------|
| Apple Developer Program | $99 USD | Annual |
| Google Play Developer Account | $25 USD | One-time |
| Cloud Mac (MacinCloud) | ~$5 USD | Per App Store submission (~2hr @ $1/hr) |
| Model CDN hosting (Gemma 4) | ~$1–2 USD/mo | Monthly (scales with downloads) |
| Vercel PWA hosting | Free | Free tier sufficient |
| GitHub | Free | Free tier sufficient |
| **Total to first ship** | **~$130 USD** | One-time + $99/yr Apple |

---

## Master Pre-Launch Checklist

### Phase 1 — Foundation
- [ ] Node 18+, Git, VS Code, Claude Code, Android Studio installed
- [ ] Project scaffolded with Vite, `base: './'` set in `vite.config.js`
- [ ] Smart Invoice Pro component running at `localhost:5173`
- [ ] Capacitor initialised with correct App ID
- [ ] `npx cap add android` completed
- [ ] Squarespace API connected and product catalog loading

### Phase 2 — Android
- [ ] All Capacitor plugins installed and synced
- [ ] App icon generated at all mipmap sizes
- [ ] Splash screen configured
- [ ] Tested on physical Android device
- [ ] Signed `.aab` produced and keystore backed up in two locations
- [ ] Google Play Console account created ($25)
- [ ] Store listing complete with screenshots and privacy policy URL
- [ ] App submitted to production track

### Phase 3 — PWA
- [ ] `manifest.json` in `public/` with correct fields
- [ ] Service worker registered for offline support
- [ ] App icons at 192px and 512px
- [ ] Deployed to Vercel with HTTPS
- [ ] Tested "Add to Home Screen" on iPhone Safari

### Phase 4 — Gemma 4
- [ ] `@mediapipe/tasks-genai` and `@capacitor/filesystem` installed
- [ ] Gemma 4 model hosted on CDN
- [ ] First-launch download flow with progress screen implemented
- [ ] `inferGemma()` stub replaced with real `LlmInference` calls
- [ ] Smart Paste tested end-to-end with no network request
- [ ] WASM fallback tested on a device without WebGPU

### Phase 5 — iOS
- [ ] Apple Developer Program enrolled ($99)
- [ ] App record created in App Store Connect
- [ ] App Store metadata and screenshots prepared
- [ ] Cloud Mac session booked (MacinCloud or GitHub Actions)
- [ ] Repo pushed to GitHub and `npm run build` confirmed clean
- [ ] iOS app icons generated via appicon.co
- [ ] Xcode archive produced and uploaded via Distributor
- [ ] App submitted for Apple review

---

> **You're ready to ship.** Following this plan delivers a published Android app, an installable iOS PWA, and a submitted App Store app — all from a Windows machine, with less than $130 in first-year costs and no full-time Mac required.
