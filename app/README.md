# BountyHound — #BuildHybridAI 2026 (Lane A scaffold + Lane B UI)

Paste any bounty / hackathon / opportunity text → instant verdict on whether
it is worth your time. Fast triage runs on-device (Gemini Nano via Firebase
AI Logic hybrid inference); deep analysis runs in the cloud (Gemini via
Firebase AI Logic). Cloud is spent only when the opportunity is worth it.

- Hackathon: [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/)
  ($30,000, deadline 30 Nov 2026 05:00 WIB; target submit 24 Nov).
- Full plan: `../PLAN.md`. SDK verification notes: `../docs/sdk-verification.md`.
- Stack: Vite + React 19 + TypeScript (strict) + `firebase` ≥ 12.5.0,
  plain CSS (no Tailwind). Free tier only (Spark plan, Gemini Developer API).

## Status

- ✅ Scaffold + `src/lib/ai.ts` contract (PLAN §5) implemented (Lane A).
- ✅ Full polished UI (Lane B, 15 Nov 2026) — see "UI structure" below.
  Verified: `npm run build` passes; dev server serves; headless-Chrome
  interaction test passes (sample load, honest config-missing error on
  Triage, mode toggle, URL-fetch CORS hint); desktop + 390px mobile
  screenshots checked.
- ⚠️ **Firebase config is a placeholder** (`src/lib/firebase-config.ts`).
  The app runs and shows a clear "Firebase config not set yet" banner;
  AI calls fail visibly with "config missing" — no mock results, no
  invented data. Real AI calls are blocked only by the missing config.

## UI structure (Lane B)

Dark polished UI, responsive (two-column ≥ 920px, single column below).

```
src/
  main.tsx                 # entry
  App.tsx                  # full BountyHound UX (Lane B)
  index.css                # polished dark theme, plain CSS
  lib/
    firebase-config.ts     # PLACEHOLDER web config — replace with real values
    firebase.ts            # app init, App Check, anonymous Auth, Firestore, Remote Config
    ai.ts                  # Firebase AI Logic contract (PLAN §5) — consumed as-is
    samples.ts             # 3 built-in samples (verbatim from docs/demo-video-script.md,
                           #   labelled "Sample", fictional listings for demo)
  components/
    EngineBadge.tsx        # "On-device · Gemini Nano · Xs · $0.00 · private" /
                           #   "Cloud · Gemini · Xs" — engine ALWAYS from ai.ts `engine`
                           #   field (response.inferenceSource), never assumed
    ScoreGauge.tsx         # SVG ring gauge for quickScore (0–100), coloured by verdict
```

### Layout

- **Header:** BountyHound logo + tagline + live engine-status pill
  (`Setup needed` / `On-device ready` / `Model downloading` /
  `Model downloadable` / `Cloud fallback`).
- **Main column:** Opportunity panel → deep-analysis suggestion banner →
  triage result card → deep-analysis result card.
- **Sidebar:** Engine status panel + History panel.
- **Footer:** Firebase AI Logic / free-tier / privacy note.

### Behaviour

- **Input:** large textarea (Ctrl/Cmd+Enter to triage, char count, Clear)
  + 3 sample chips (Hackathon / Bug bounty / Suspicious listing — each
  load shows a "Sample — … (fictional listing for demo)" tag) + optional
  URL field: client-side `fetch` (HTML → text extraction); on failure
  shows the "paste the text instead" CORS hint, never a fake result.
- **Triage:** button is the user gesture — `initDeviceModel()` runs on
  that click (skipped in cloud-only mode; a prepare failure is a
  non-fatal notice, triage still falls back to cloud). Result card:
  GO (green) / MAYBE (amber) / SKIP (red) verdict badge, quickScore
  gauge, type / prize / deadline facts, requirements, reasons, raw JSON
  (collapsed). Engine badge from `result.engine` only.
- **Deep analysis:** enabled after triage; auto-suggested with a banner
  when `quickScore >= deep_analysis_min_score` (Remote Config, default
  70). Result card: winner-pattern match, effort estimate, red flags,
  3-step plan, cloud engine badge.
- **Engine status panel:** Firebase configured/not-set state (honest),
  on-device state from `LanguageModel.availability()`, cloud model state,
  Remote Config prompt version + deep threshold, download progress bar,
  mode selector (Prefer on-device / Cloud only) wired to
  `ai.ts setMode/getMode`, "Prepare on-device model" button, Chrome
  139+ flag hint.
- **History:** `listTriages()` on load (only when Firebase is configured),
  click an entry to reopen it (input + fast + deep restored), Save button
  persists via `saveTriage()` (shows saved state).

## Versions (verified at install, 15 Nov 2026)

- `firebase` **13.3.0** (requirement ≥ 12.5.0 — satisfied)
- `@firebase/ai` **3.1.0** (bundled inside `firebase`)
- Cloud fallback model: `gemini-3.5-flash-lite` (the SDK default
  `DEFAULT_HYBRID_IN_CLOUD_MODEL`, passed explicitly in
  `inCloudParams` — never top-level; see `docs/sdk-verification.md`)

## Setup

### 1. Install & run

```bash
cd app
npm install
npm run dev      # serves on http://localhost:5173
npm run build    # tsc (strict) + vite build
```

### 2. Add the real Firebase config

1. In the Firebase console, create/select the project and run the guided
   **AI Logic** setup (Gemini Developer API — free tier; never Vertex AI).
2. Add a **Web app** and copy its config.
3. Paste the values into `src/lib/firebase-config.ts`, replacing the
   `YOUR_*` placeholders. (`isFirebaseConfigured` flips on automatically.)
4. Replace `YOUR_PROJECT_ID` in `.firebaserc` with the real project id.
5. Replace `YOUR_RECAPTCHA_ENTERPRISE_SITE_KEY` in
   `src/lib/firebase-config.ts` with the App Check reCAPTCHA Enterprise
   site key (production). Local dev does not need it (debug provider below).

Firebase web config values are public by design. Never commit API keys
for private services, tokens, or private keys.

### 3. App Check debug token (local dev)

1. In dev mode the app sets `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`
   before `initializeAppCheck` (see `src/lib/firebase.ts`).
2. Open the app, open the browser console, copy the printed debug token.
3. Firebase console → **App Check → Apps → Manage debug tokens** → add it.
4. Reload. App Check now passes locally. Debug tokens are accepted in
   hackathon submissions.

### 4. On-device model (Chrome)

1. Use **Chrome Desktop 139+**.
2. Enable the flag: `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
   → Enabled → relaunch Chrome.
3. Open the app, click **Triage** — `initDeviceModel()` runs on that user
   gesture and downloads Gemini Nano on demand (progress shows in the
   Engine status panel). First download can take a while; while it is
   downloading, `PREFER_ON_DEVICE` falls back to cloud automatically.
4. Check the status panel: `LanguageModel.availability()` →
   `available` / `downloading` / `downloadable` / `unavailable`.
5. The engine badge on every result comes from the authoritative
   `response.inferenceSource` (`on_device` / `in_cloud`), never from the
   requested mode or latency.

### 5. Firestore + Remote Config (console)

- **Firestore:** create the database (production mode) and deploy
  `firestore.rules` (`firebase deploy --only firestore:rules`). History is
  per anonymous user (`uid` field, rules-enforced).
- **Remote Config:** optional. Defaults are baked in
  (`src/lib/firebase.ts`): `prompt_version` = `1`,
  `deep_analysis_min_score` = `70`, plus the v1 prompts. Override in the
  console to change prompts/thresholds without a redeploy.
- **Auth:** enable **Anonymous** sign-in (the app signs in anonymously on
  load; history is keyed to that uid).

### 6. Deploy to Firebase Hosting (free Spark plan)

```bash
npm run build
npx firebase login            # once, on a machine with browser access
npx firebase deploy --only hosting,firestore:rules
```

`firebase.json` serves `dist/` as a single-page app.

## How the AI calls work (`src/lib/ai.ts`)

| Function | Engine | Notes |
|---|---|---|
| `getEngineStatus()` | — | `LanguageModel.availability()` + current mode |
| `initDeviceModel(onProgress?)` | on-device | User gesture only; progress is a 0–1 fraction |
| `triageFast(text)` | prefer on-device | JSON-schema structured output (GO / MAYBE / SKIP) |
| `analyzeDeep(text, fast)` | cloud only | `ONLY_IN_CLOUD`, same cloud model |
| `saveTriage(...)` / `listTriages(...)` | Firestore | Anonymous Auth, newest first |

Key SDK facts (verified against the installed SDK, not just the docs):

- Hybrid params: `{ mode, inCloudParams: { model, generationConfig } }`.
  There is **no top-level `model`** in hybrid mode — it is ignored.
- Structured output (`responseMimeType: 'application/json'` +
  `responseSchema`) lives inside `inCloudParams`.
- `engine` is read from `result.response.inferenceSource`.
- On-device = single-turn `generateContent` only, no chat, no tools.

## Project layout

```
src/
  main.tsx            # entry
  App.tsx             # full Lane B UX (header, input + samples + URL fetch,
                      #   triage + deep-analysis cards, engine status, history)
  index.css           # polished dark theme, plain CSS
  lib/
    firebase-config.ts  # PLACEHOLDER web config — replace with real values
    firebase.ts         # app init, App Check, anonymous Auth, Firestore, Remote Config
    ai.ts               # Firebase AI Logic contract (PLAN §5) — Lane B consumes as-is
    samples.ts          # 3 built-in samples (verbatim from docs/demo-video-script.md)
  components/
    EngineBadge.tsx     # engine badge — engine ONLY from ai.ts `engine` field
    ScoreGauge.tsx      # SVG quickScore ring gauge
firebase.json         # Hosting (dist/) + Firestore rules deploy
firestore.rules       # per-user history rules
.firebaserc           # placeholder project id — replace with real one
```

## Rules

- Free tier only. No billing, no payment details anywhere.
- No secrets in the repo. No mock AI results presented as real.
- Every AI call goes through `firebase/ai` — the repo must prove runtime usage.
