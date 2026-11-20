# BountyHound

**Paste any bounty / hackathon / grant listing → instant verdict: is it worth your time?**

Built for [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/)
($30,000, Devpost). Solo entry.

## The idea

Triage locally first, spend cloud only when the opportunity is worth it.

1. **Fast triage — on-device (Gemini Nano).** Paste a listing; the model in
   your browser returns structured JSON: type, prize, deadline,
   requirements, a 0–100 score, a GO / MAYBE / SKIP verdict, and reasons.
   Private, free, instant. Badge: "On-device · Gemini Nano · Xs · $0.00".
2. **Deep analysis — cloud (Gemini).** On request (auto-suggested when the
   fast score is ≥ 70): winner-pattern match, effort estimate in hours,
   red flags, and a 3-step plan. Badge: "Cloud · Gemini · Xs".

Every result is labelled with the engine that actually produced it
(`response.inferenceSource`), so you always know where an answer came from.

## Tech

- Vite + React + TypeScript, plain CSS
- Firebase AI Logic (`firebase/ai`) — hybrid on-device + cloud inference
- Firebase App Check, Authentication (anonymous), Firestore (history),
  Remote Config (prompt version + routing thresholds), Hosting
- Free tier only: Spark plan + Gemini Developer API

## Setup

```bash
cd app
npm install
npm run dev
```

### On-device inference (Chrome)

On-device triage needs Chrome on desktop, version 139 or higher:

1. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and set
   it to **Enabled**, then restart Chrome.
2. The Gemini Nano model downloads on demand the first time the app calls
   `initializeDeviceModel()` (triggered by a button click in the app).
   You can check status in DevTools with `await LanguageModel.availability()`.

If on-device inference is unavailable, the app falls back to the cloud model
automatically — it works in any modern browser.

### Firebase config

Copy your Firebase web config into `app/src/lib/firebase-config.ts`
(see `firebase-config.example.ts`). The web config is public by design;
**never commit API keys, private keys, or tokens.** For local development,
App Check uses the debug provider — register the printed debug token in the
Firebase console (App Check → Apps → Manage debug tokens).

## Project docs

- `docs/sdk-verification.md` — SDK API details verified against
  `firebase` 13.3.0 / `@firebase/ai` 3.1.0 and the official docs
  (including one correction to the original plan: the default cloud
  fallback model is `gemini-3.5-flash-lite`, passed via `inCloudParams`).
- `docs/devpost-description.md` — Devpost submission text (draft).
- `docs/demo-video-script.md` — demo video script + storyboard (≤ 3 min).
- `docs/judging-map.md` — judging criteria mapped to evidence in the app.
- `docs/test-checklist.md` — end-to-end "judge path" test checklist.

## Samples

The three built-in samples are fictional, realistic-style listings, clearly
labelled "Sample" in the app. They are not real bounties and no results in
the app are presented as real outcomes.

## License

Apache-2.0.
