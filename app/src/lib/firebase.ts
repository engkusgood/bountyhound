// BountyHound — Firebase bootstrap (AI Logic, App Check, Auth, Firestore,
// Remote Config). Free tier only: Gemini Developer API via GoogleAIBackend
// (NEVER Vertex AI — that needs billing). Spark plan, anonymous Auth.
//
// With the placeholder config (see firebase-config.ts) nothing is
// initialised: every consumer gets a clear "config missing" error instead
// of a crash or a fake success.

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  fetchAndActivate,
  getRemoteConfig,
  getString,
  type RemoteConfig,
} from 'firebase/remote-config';
import {
  CONFIG_MISSING_ERROR,
  firebaseConfig,
  isFirebaseConfigured,
  recaptchaEnterpriseSiteKey,
} from './firebase-config';

let app: FirebaseApp | null = null;
let appCheck: AppCheck | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let remoteConfig: RemoteConfig | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialise Firebase once. Safe to call repeatedly.
 * With the placeholder config this is a no-op — callers must check
 * `isFirebaseConfigured` / call `requireFirebase()` before doing real work.
 */
export function initFirebase(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!isFirebaseConfigured) return;
    app = initializeApp(firebaseConfig);

    // App Check. Local dev: set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`
    // in the browser console (or via main.tsx in DEV) BEFORE this call;
    // the SDK then uses the debug provider and prints a debug token to
    // register in Firebase console > App Check > Apps. Production uses
    // reCAPTCHA Enterprise (site key in firebase-config.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (import.meta.env.DEV && w.FIREBASE_APPCHECK_DEBUG_TOKEN === undefined) {
      w.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    void appCheck;

    auth = getAuth(app);
    await signInAnonymously(auth);

    db = getFirestore(app);

    // Remote Config: prompt version + routing thresholds, with safe defaults.
    remoteConfig = getRemoteConfig(app);
    remoteConfig.settings.minimumFetchIntervalMillis = 60_000;
    remoteConfig.defaultConfig = {
      prompt_version: '1',
      deep_analysis_min_score: '70',
      triage_prompt_v1: TRIAGE_PROMPT_V1,
      deep_prompt_v1: DEEP_PROMPT_V1,
    };
    try {
      await fetchAndActivate(remoteConfig);
    } catch {
      // Offline / not yet configured in console: defaults apply.
    }
  })();
  return initPromise;
}

/** Throw a visible error when Firebase is not configured. Never fake success. */
export function requireFirebase(): void {
  if (!isFirebaseConfigured) throw new Error(CONFIG_MISSING_ERROR);
}

export function getFirebaseApp(): FirebaseApp {
  requireFirebase();
  if (!app) throw new Error(CONFIG_MISSING_ERROR);
  return app;
}

export function getDb(): Firestore {
  requireFirebase();
  if (!db) throw new Error(CONFIG_MISSING_ERROR);
  return db;
}

export function getAuthInstance(): Auth {
  requireFirebase();
  if (!auth) throw new Error(CONFIG_MISSING_ERROR);
  return auth;
}

export function getRemoteConfigInstance(): RemoteConfig | null {
  return remoteConfig;
}

/** Prompt version from Remote Config (default '1'). */
export function getPromptVersion(): string {
  return remoteConfig ? getString(remoteConfig, 'prompt_version') || '1' : '1';
}

/** quickScore at/above which deep analysis is auto-suggested (default 70). */
export function getDeepAnalysisMinScore(): number {
  const raw = remoteConfig
    ? getString(remoteConfig, 'deep_analysis_min_score') || '70'
    : '70';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 70;
}

export function getTriagePrompt(): string {
  return remoteConfig
    ? getString(remoteConfig, 'triage_prompt_v1') || TRIAGE_PROMPT_V1
    : TRIAGE_PROMPT_V1;
}

export function getDeepPrompt(): string {
  return remoteConfig
    ? getString(remoteConfig, 'deep_prompt_v1') || DEEP_PROMPT_V1
    : DEEP_PROMPT_V1;
}

/** Default triage prompt (v1). Remote Config can override per version. */
export const TRIAGE_PROMPT_V1 = `You are BountyHound, a bounty/hackathon triage assistant. Read the opportunity text below and extract a structured verdict. Be factual: copy the prize and deadline from the text; if a field is not stated, write "not stated" instead of inventing one. Score 0-100 on expected value vs effort: prize size and credibility up, vague requirements / red flags / unrealistic promises down. Verdict GO if clearly worth pursuing, MAYBE if borderline, SKIP if low value or suspicious. Give 1-4 short reasons.

Opportunity text:
---
{{TEXT}}
---`;

/** Default deep-analysis prompt (v1). Remote Config can override per version. */
export const DEEP_PROMPT_V1 = `You are BountyHound, a bounty/hackathon analyst. The fast triage below was already done for this opportunity. Now do a deep analysis: (1) patternMatch — how this opportunity matches the patterns of past winning entries (be concrete, cite what the text actually says); (2) effortHours — realistic effort estimate as a range like "8-15 hours"; (3) redFlags — concrete risks found in the text, empty array if none; (4) plan — exactly 3 concrete next steps.

Fast triage:
{{FAST_JSON}}

Opportunity text:
---
{{TEXT}}
---`;
