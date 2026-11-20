// BountyHound — hybrid AI via Firebase AI Logic (`firebase/ai`).
//
// Every AI call in this app goes through Firebase AI Logic. Backend is
// the Gemini Developer API (GoogleAIBackend, free tier) — NEVER Vertex AI.
//
// Hybrid inference (verified against installed firebase 13.3.0 /
// @firebase/ai 3.1.0 — see docs/sdk-verification.md):
// - `getGenerativeModel(ai, { mode, inCloudParams })`. HybridParams has NO
//   top-level `model` field — a top-level model is ignored with a warning.
//   The cloud fallback model goes in `inCloudParams: { model }`; the SDK
//   default is 'gemini-3.5-flash-lite' (DEFAULT_HYBRID_IN_CLOUD_MODEL) and
//   we pass it explicitly for determinism.
// - Structured output (responseMimeType + responseSchema) also lives
//   inside `inCloudParams`.
// - `initializeDeviceModel(progressCb)` must be called on a user gesture
//   BEFORE generateContent; progress is a 0–1 fraction.
// - Which engine actually answered comes from
//   `result.response.inferenceSource` ('on_device' | 'in_cloud') — the
//   authoritative source, never the requested mode or latency.
//
// If Firebase is not configured yet, every function here throws a visible
// "config missing" error. No mock results, no invented data — ever.

import {
  collection,
  addDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
  type GenerativeModel,
} from 'firebase/ai';
import {
  getDb,
  getFirebaseApp,
  getAuthInstance,
  getTriagePrompt,
  getDeepPrompt,
  requireFirebase,
} from './firebase';

/** Cloud fallback model — the SDK default, passed explicitly (see header). */
export const CLOUD_MODEL = 'gemini-3.5-flash-lite';

export type Engine = 'on-device' | 'cloud';

export interface EngineStatus {
  onDeviceAvailable: boolean;
  onDeviceState: 'available' | 'downloading' | 'downloadable' | 'unavailable';
  mode: 'prefer-on-device' | 'cloud-only';
}

export interface TriageFast {
  type: string;
  prize: string;
  deadline: string;
  requirements: string[];
  quickScore: number;
  verdict: 'GO' | 'MAYBE' | 'SKIP';
  reasons: string[];
  engine: Engine;
  latencyMs: number;
}

export interface DeepAnalysis {
  patternMatch: string;
  effortHours: string;
  redFlags: string[];
  plan: string[];
  engine: Engine;
  latencyMs: number;
}

export interface TriageRecord {
  id: string;
  input: string;
  fast: TriageFast;
  deep?: DeepAnalysis;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Engine status + mode
// ---------------------------------------------------------------------------

type OnDeviceState = EngineStatus['onDeviceState'];

// Chrome Prompt API global (Chrome Desktop 139+ with the Gemini Nano flag).
// Declared locally because lib.dom has no Prompt API types yet.
interface LanguageModelGlobal {
  availability: () => Promise<OnDeviceState>;
}

declare global {
  interface Window {
    LanguageModel?: LanguageModelGlobal;
  }
}

let mode: EngineStatus['mode'] = 'prefer-on-device';

export function setMode(next: EngineStatus['mode']): void {
  if (next !== mode) {
    mode = next;
    // The hybrid model bakes the mode in at creation; drop the cached
    // instance so the next triage uses the new mode.
    triageModel = null;
  }
}

export function getMode(): EngineStatus['mode'] {
  return mode;
}

/**
 * On-device availability via `LanguageModel.availability()`.
 * Returns 'unavailable' outside Chrome / without the flag / without the model.
 */
export async function getEngineStatus(): Promise<EngineStatus> {
  let onDeviceState: OnDeviceState = 'unavailable';
  try {
    const lm = window.LanguageModel;
    if (lm && typeof lm.availability === 'function') {
      onDeviceState = await lm.availability();
    }
  } catch {
    onDeviceState = 'unavailable';
  }
  return {
    onDeviceAvailable: onDeviceState === 'available',
    onDeviceState,
    mode,
  };
}

// ---------------------------------------------------------------------------
// Model construction (lazy, one instance per purpose)
// ---------------------------------------------------------------------------

let triageModel: GenerativeModel | null = null;
let deepModel: GenerativeModel | null = null;

const triageSchema = Schema.object({
  properties: {
    type: Schema.string(),
    prize: Schema.string(),
    deadline: Schema.string(),
    requirements: Schema.array({ items: Schema.string() }),
    quickScore: Schema.integer(),
    verdict: Schema.enumString({ enum: ['GO', 'MAYBE', 'SKIP'] }),
    reasons: Schema.array({ items: Schema.string() }),
  },
  required: [
    'type',
    'prize',
    'deadline',
    'requirements',
    'quickScore',
    'verdict',
    'reasons',
  ],
});

const deepSchema = Schema.object({
  properties: {
    patternMatch: Schema.string(),
    effortHours: Schema.string(),
    redFlags: Schema.array({ items: Schema.string() }),
    plan: Schema.array({ items: Schema.string() }),
  },
  required: ['patternMatch', 'effortHours', 'redFlags', 'plan'],
});

function getTriageModel(): GenerativeModel {
  requireFirebase();
  if (triageModel) return triageModel;
  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  triageModel = getGenerativeModel(ai, {
    mode:
      mode === 'cloud-only'
        ? InferenceMode.ONLY_IN_CLOUD
        : InferenceMode.PREFER_ON_DEVICE,
    // HybridParams: no top-level `model`. Cloud model + structured output
    // live in inCloudParams (Lane C correction, sdk-verification.md).
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: triageSchema,
      },
    },
  });
  return triageModel;
}

function getDeepModel(): GenerativeModel {
  requireFirebase();
  if (deepModel) return deepModel;
  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  deepModel = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: deepSchema,
      },
    },
  });
  return deepModel;
}

/**
 * Download / warm up the on-device model (Gemini Nano).
 * MUST be called on a user gesture (button click) and BEFORE any
 * generateContent() call. `onProgress` receives a 0–1 fraction.
 * For PREFER_ON_DEVICE this may be fire-and-forget: an unready device
 * model simply falls back to cloud.
 */
export async function initDeviceModel(
  onProgress?: (p: number) => void,
): Promise<void> {
  requireFirebase();
  await getTriageModel().initializeDeviceModel(onProgress);
}

// ---------------------------------------------------------------------------
// Inference helpers
// ---------------------------------------------------------------------------

/** Authoritative engine for a response — from inferenceSource, never guessed. */
function engineFromResponse(
  result: Awaited<ReturnType<GenerativeModel['generateContent']>>,
): Engine {
  return result.response.inferenceSource === 'on_device'
    ? 'on-device'
    : 'cloud';
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`AI returned malformed JSON for ${label}: ${text.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`AI returned a non-object payload for ${label}`);
  }
  return parsed as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`AI payload missing string field "${field}"`);
  return value;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`AI payload missing string[] field "${field}"`);
  }
  return value as string[];
}

function validateTriage(payload: Record<string, unknown>): Omit<TriageFast, 'engine' | 'latencyMs'> {
  const quickScore = payload.quickScore;
  if (typeof quickScore !== 'number' || !Number.isFinite(quickScore)) {
    throw new Error('AI payload missing numeric field "quickScore"');
  }
  const verdict = payload.verdict;
  if (verdict !== 'GO' && verdict !== 'MAYBE' && verdict !== 'SKIP') {
    throw new Error('AI payload has invalid verdict (expected GO | MAYBE | SKIP)');
  }
  return {
    type: asString(payload.type, 'type'),
    prize: asString(payload.prize, 'prize'),
    deadline: asString(payload.deadline, 'deadline'),
    requirements: asStringArray(payload.requirements, 'requirements'),
    quickScore: Math.max(0, Math.min(100, Math.round(quickScore))),
    verdict,
    reasons: asStringArray(payload.reasons, 'reasons'),
  };
}

function validateDeep(payload: Record<string, unknown>): Omit<DeepAnalysis, 'engine' | 'latencyMs'> {
  return {
    patternMatch: asString(payload.patternMatch, 'patternMatch'),
    effortHours: asString(payload.effortHours, 'effortHours'),
    redFlags: asStringArray(payload.redFlags, 'redFlags'),
    plan: asStringArray(payload.plan, 'plan'),
  };
}

// ---------------------------------------------------------------------------
// Public contract (PLAN §5)
// ---------------------------------------------------------------------------

/** Fast triage — on-device preferred (Gemini Nano), cloud fallback. JSON schema. */
export async function triageFast(text: string): Promise<TriageFast> {
  requireFirebase();
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Triage needs some opportunity text to analyse.');
  const model = getTriageModel();
  const prompt = getTriagePrompt().replace('{{TEXT}}', trimmed);
  const started = performance.now();
  const result = await model.generateContent(prompt);
  const latencyMs = Math.round(performance.now() - started);
  const payload = parseJsonObject(result.response.text(), 'triageFast');
  const validated = validateTriage(payload);
  return { ...validated, engine: engineFromResponse(result), latencyMs };
}

/** Deep analysis — cloud only (Gemini via Firebase AI Logic). */
export async function analyzeDeep(
  text: string,
  fast: TriageFast,
): Promise<DeepAnalysis> {
  requireFirebase();
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Deep analysis needs some opportunity text to analyse.');
  const model = getDeepModel();
  const prompt = getDeepPrompt()
    .replace('{{FAST_JSON}}', JSON.stringify(fast))
    .replace('{{TEXT}}', trimmed);
  const started = performance.now();
  const result = await model.generateContent(prompt);
  const latencyMs = Math.round(performance.now() - started);
  const payload = parseJsonObject(result.response.text(), 'analyzeDeep');
  const validated = validateDeep(payload);
  return { ...validated, engine: engineFromResponse(result), latencyMs };
}

/** Save a triage to Firestore (anonymous Auth). Returns the document id. */
export async function saveTriage(
  input: string,
  fast: TriageFast,
  deep?: DeepAnalysis,
): Promise<string> {
  requireFirebase();
  const db = getDb();
  const uid = getAuthInstance().currentUser?.uid ?? 'anonymous';
  const docRef = await addDoc(collection(db, 'triages'), {
    uid,
    input,
    fast,
    ...(deep ? { deep } : {}),
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/** List the current user's past triages, newest first. */
export async function listTriages(limitCount = 20): Promise<TriageRecord[]> {
  requireFirebase();
  const db = getDb();
  const uid = getAuthInstance().currentUser?.uid ?? 'anonymous';
  const q = query(
    collection(db, 'triages'),
    orderBy('createdAt', 'desc'),
    firestoreLimit(limitCount),
  );
  const snap = await getDocs(q);
  const records: TriageRecord[] = [];
  for (const docSnap of snap.docs) {
    const data = docSnap.data() as {
      uid?: string;
      input?: string;
      fast?: TriageFast;
      deep?: DeepAnalysis;
      createdAt?: { toMillis?: () => number } | number;
    };
    if (data.uid !== uid) continue;
    const createdAt =
      typeof data.createdAt === 'number'
        ? data.createdAt
        : (data.createdAt?.toMillis?.() ?? 0);
    if (!data.input || !data.fast) continue;
    records.push({
      id: docSnap.id,
      input: data.input,
      fast: data.fast,
      deep: data.deep,
      createdAt,
    });
  }
  return records;
}
