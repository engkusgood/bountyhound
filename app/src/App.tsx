// BountyHound — full Lane B UI.
//
// Consumes src/lib/ai.ts exactly as specified in PLAN §5 — no local
// re-implementation of AI calls. Every engine badge comes from the `engine`
// field of the ai.ts result (authoritative `response.inferenceSource`).
//
// With the placeholder Firebase config the app shows an honest
// "Firebase config not set yet" state and AI calls fail visibly —
// no mock results, no invented data, ever.

import { useCallback, useEffect, useState } from 'react';
import {
  analyzeDeep,
  getEngineStatus,
  getMode,
  initDeviceModel,
  listTriages,
  saveTriage,
  setMode,
  triageFast,
  type DeepAnalysis,
  type EngineStatus,
  type TriageFast,
  type TriageRecord,
} from './lib/ai';
import {
  getDeepAnalysisMinScore,
  getPromptVersion,
  initFirebase,
} from './lib/firebase';
import { CONFIG_MISSING_ERROR, isFirebaseConfigured } from './lib/firebase-config';
import { SAMPLES } from './lib/samples';
import { EngineBadge } from './components/EngineBadge';
import { ScoreGauge } from './components/ScoreGauge';
import './index.css';

type BusyKind = 'triage' | 'deep' | 'save' | 'fetch-url' | 'prepare' | null;
type UrlState = 'idle' | 'fetching' | 'ok' | 'error';

function verdictClass(v: 'GO' | 'MAYBE' | 'SKIP'): string {
  return v === 'GO' ? 'go' : v === 'MAYBE' ? 'maybe' : 'skip';
}

function formatDate(ts: number): string {
  if (!ts) return 'unknown date';
  return new Date(ts).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function App() {
  const [input, setInput] = useState('');
  const [activeSampleId, setActiveSampleId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [urlState, setUrlState] = useState<UrlState>('idle');
  const [urlNote, setUrlNote] = useState('');

  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [deepThreshold, setDeepThreshold] = useState(70);
  const [promptVersion, setPromptVersion] = useState('1');

  const [fast, setFast] = useState<TriageFast | null>(null);
  const [deep, setDeep] = useState<DeepAnalysis | null>(null);
  const [history, setHistory] = useState<TriageRecord[]>([]);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatus(await getEngineStatus());
  }, []);

  const refreshHistory = useCallback(async () => {
    if (!isFirebaseConfigured) return;
    try {
      setHistory(await listTriages(20));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void initFirebase().then(() => {
      void refreshStatus();
      setDeepThreshold(getDeepAnalysisMinScore());
      setPromptVersion(getPromptVersion());
      void refreshHistory();
    });
  }, [refreshStatus, refreshHistory]);

  // --- actions -----------------------------------------------------------

  const runTriage = async () => {
    setError(null);
    setNotice(null);
    setDeep(null);
    setSavedId(null);
    setBusy('triage');
    try {
      // User gesture: warm up / download the on-device model first.
      // Skipped in cloud-only mode (nothing on-device to prepare).
      // A prepare failure is non-fatal: PREFER_ON_DEVICE falls back
      // to cloud inside triageFast.
      if (getMode() === 'prefer-on-device') {
        try {
          await initDeviceModel((p) => setDownloadProgress(p));
        } catch (err) {
          setNotice(
            `On-device model could not be prepared (${err instanceof Error ? err.message : String(err)}) — continuing; the triage may fall back to cloud.`,
          );
        } finally {
          setDownloadProgress(null);
        }
      }
      const result = await triageFast(input);
      setFast(result);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const runDeep = async () => {
    if (!fast) return;
    setError(null);
    setBusy('deep');
    try {
      const result = await analyzeDeep(input, fast);
      setDeep(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const runSave = async () => {
    if (!fast) return;
    setError(null);
    setBusy('save');
    try {
      const id = await saveTriage(input, fast, deep ?? undefined);
      setSavedId(id);
      await refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const prepareModel = async () => {
    setError(null);
    setNotice(null);
    setBusy('prepare');
    try {
      await initDeviceModel((p) => setDownloadProgress(p));
      setNotice('On-device model is ready.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadProgress(null);
      setBusy(null);
      await refreshStatus();
    }
  };

  const loadSample = (id: string) => {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    setInput(sample.text);
    setActiveSampleId(id);
    setFast(null);
    setDeep(null);
    setSavedId(null);
    setError(null);
    setNotice(null);
  };

  const reopenHistory = (record: TriageRecord) => {
    setInput(record.input);
    setActiveSampleId(null);
    setFast(record.fast);
    setDeep(record.deep ?? null);
    setSavedId(record.id);
    setError(null);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchUrl = async () => {
    const target = url.trim();
    if (!target) return;
    setUrlState('fetching');
    setUrlNote('');
    setBusy('fetch-url');
    try {
      const res = await fetch(target, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get('content-type') ?? '';
      const raw = await res.text();
      let text = raw;
      if (contentType.includes('html') || raw.trimStart().startsWith('<')) {
        const doc = new DOMParser().parseFromString(raw, 'text/html');
        text = (doc.body?.innerText ?? '').trim();
      }
      text = text.replace(/\n{3,}/g, '\n\n').trim();
      if (text.length < 20) throw new Error('no readable text found at that URL');
      setInput(text.slice(0, 8000));
      setActiveSampleId(null);
      setFast(null);
      setDeep(null);
      setSavedId(null);
      setUrlState('ok');
      setUrlNote(
        `Fetched ${text.length.toLocaleString()} characters from the page. Check it below, then hit Triage.`,
      );
    } catch (err) {
      setUrlState('error');
      setUrlNote(
        `Couldn't fetch that URL from the browser (${err instanceof Error ? err.message : 'fetch failed'}) — most listing sites block cross-origin reads (CORS). Copy the listing text and paste it below instead.`,
      );
    } finally {
      setBusy(null);
    }
  };

  // --- derived -----------------------------------------------------------

  const headerPill = !isFirebaseConfigured
    ? { text: 'Setup needed', cls: 'warn' }
    : status?.onDeviceAvailable
      ? { text: 'On-device ready', cls: 'ok' }
      : status?.onDeviceState === 'downloading'
        ? { text: 'Model downloading', cls: 'warn' }
        : status?.onDeviceState === 'downloadable'
          ? { text: 'Model downloadable', cls: 'warn' }
          : { text: 'Cloud fallback', cls: 'cloud' };

  const deepSuggested = fast !== null && !deep && fast.quickScore >= deepThreshold;
  const inputEmpty = input.trim() === '';
  const activeSample = SAMPLES.find((s) => s.id === activeSampleId) ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
              <circle cx="17" cy="17" r="16" fill="#0f2e22" stroke="#34d399" strokeWidth="1.5" />
              <circle cx="12.5" cy="14" r="2.2" fill="#34d399" />
              <circle cx="21.5" cy="14" r="2.2" fill="#34d399" />
              <path d="M11 21.5c2 2.4 4 3.5 6 3.5s4-1.1 6-3.5" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M17 17.5v3" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h1>BountyHound</h1>
            <p className="tagline">
              Is this bounty worth your time? Triage locally first — spend
              cloud only when it&rsquo;s worth it.
            </p>
          </div>
        </div>
        <span className={`status-pill ${headerPill.cls}`} title="Live engine status — see the Engine status panel">
          <span className="pill-dot" aria-hidden="true" />
          {headerPill.text}
        </span>
      </header>

      {!isFirebaseConfigured && (
        <section className="banner warn" role="alert">
          <strong>Firebase config not set yet.</strong> Paste the real web app
          config from the Firebase console into{' '}
          <code>src/lib/firebase-config.ts</code> (see <code>app/README.md</code>
          ). AI calls will fail visibly until then — no mock results are shown.
        </section>
      )}

      <div className="layout">
        <main className="main-col">
          {/* ------------------------------ Input ------------------------------ */}
          <section className="panel" aria-label="Opportunity input">
            <div className="panel-head">
              <h2>Opportunity</h2>
              <span className="steps-hint">1 · Paste &nbsp;→&nbsp; 2 · Triage on-device &nbsp;→&nbsp; 3 · Deep analysis in the cloud</span>
            </div>

            <div className="url-row">
              <label htmlFor="url-field" className="sr-only">
                Listing URL (optional)
              </label>
              <input
                id="url-field"
                type="url"
                className="url-input"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setUrlState('idle');
                  setUrlNote('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void fetchUrl();
                }}
                placeholder="Optional: paste a listing URL — https://…"
                aria-label="Listing URL (optional)"
              />
              <button
                type="button"
                className="btn ghost"
                onClick={() => void fetchUrl()}
                disabled={busy !== null || url.trim() === ''}
              >
                {busy === 'fetch-url' ? 'Fetching…' : 'Fetch URL'}
              </button>
            </div>
            {urlNote && (
              <p className={`url-note ${urlState}`} role="status">
                {urlNote}
              </p>
            )}

            <label className="textarea-label" htmlFor="opportunity-text">
              Listing text
              {activeSample && (
                <span className="sample-tag">
                  Sample — {activeSample.kind} (fictional listing for demo)
                </span>
              )}
            </label>
            <textarea
              id="opportunity-text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setActiveSampleId(null);
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void runTriage();
              }}
              rows={9}
              aria-label="Opportunity text"
              placeholder="Paste a bounty, hackathon, grant or gig description… (Ctrl+Enter to triage)"
            />
            <div className="input-meta">
              <span>{input.length.toLocaleString()} characters</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setInput('');
                  setActiveSampleId(null);
                  setFast(null);
                  setDeep(null);
                  setSavedId(null);
                }}
                disabled={inputEmpty && fast === null}
              >
                Clear
              </button>
            </div>

            <div className="sample-row" aria-label="Built-in samples">
              <span className="sample-label">Try a sample:</span>
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`chip ${activeSampleId === s.id ? 'active' : ''}`}
                  onClick={() => loadSample(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="actions">
              <button
                type="button"
                className="btn primary"
                onClick={() => void runTriage()}
                disabled={busy !== null || inputEmpty}
                title="Runs initDeviceModel on this click, then triages (on-device first)"
              >
                {busy === 'triage'
                  ? downloadProgress !== null
                    ? `Downloading model ${Math.round(downloadProgress * 100)}%…`
                    : 'Triaging…'
                  : 'Triage — on-device first'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void runDeep()}
                disabled={busy !== null || fast === null || deep !== null}
              >
                {busy === 'deep' ? 'Analysing…' : 'Deep analysis — cloud'}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => void runSave()}
                disabled={busy !== null || fast === null}
              >
                {busy === 'save'
                  ? 'Saving…'
                  : savedId
                    ? 'Saved ✓ — save again'
                    : 'Save to history'}
              </button>
            </div>

            {busy === 'triage' && downloadProgress !== null && (
              <div className="progress-wrap" aria-label="Model download progress">
                <div
                  className="progress-bar"
                  style={{ width: `${Math.round(downloadProgress * 100)}%` }}
                />
              </div>
            )}
            {notice && (
              <p className="banner info" role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className="banner error" role="alert">
                {error === CONFIG_MISSING_ERROR
                  ? 'Firebase config missing — see the banner at the top. No AI call was made.'
                  : error}
              </p>
            )}
          </section>

          {/* ------------------------- Deep suggestion ------------------------- */}
          {deepSuggested && (
            <section className="suggest" role="status">
              <div>
                <strong>Score {fast.quickScore} ≥ {deepThreshold}</strong> — this
                one looks worth a deeper look. Deep analysis is recommended
                (Remote Config threshold).
              </div>
              <button
                type="button"
                className="btn primary small"
                onClick={() => void runDeep()}
                disabled={busy !== null}
              >
                {busy === 'deep' ? 'Analysing…' : 'Run deep analysis'}
              </button>
            </section>
          )}

          {/* --------------------------- Triage result --------------------------- */}
          {fast ? (
            <section
              className={`panel result-card verdict-${verdictClass(fast.verdict)}`}
              aria-label="Triage result"
            >
              <div className="result-head">
                <div>
                  <span className={`verdict-badge ${verdictClass(fast.verdict)}`}>
                    {fast.verdict}
                  </span>
                  <h2>Triage verdict</h2>
                  <p className="result-sub">
                    {fast.verdict === 'GO'
                      ? 'Worth pursuing — strong expected value for the effort.'
                      : fast.verdict === 'MAYBE'
                        ? 'Borderline — weigh the effort against the prize before committing.'
                        : 'Not worth it — low value or suspicious. Spend your time elsewhere.'}
                  </p>
                </div>
                <ScoreGauge score={fast.quickScore} verdict={fast.verdict} />
              </div>

              <EngineBadge engine={fast.engine} latencyMs={fast.latencyMs} />

              <dl className="facts">
                <div>
                  <dt>Type</dt>
                  <dd>{fast.type}</dd>
                </div>
                <div>
                  <dt>Prize</dt>
                  <dd>{fast.prize}</dd>
                </div>
                <div>
                  <dt>Deadline</dt>
                  <dd>{fast.deadline}</dd>
                </div>
              </dl>

              <h3>Requirements</h3>
              {fast.requirements.length === 0 ? (
                <p className="muted">None stated in the text.</p>
              ) : (
                <ul className="check-list">
                  {fast.requirements.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}

              <h3>Why this verdict</h3>
              <ul className="reason-list">
                {fast.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>

              <details className="raw-json">
                <summary>Raw JSON</summary>
                <pre>{JSON.stringify(fast, null, 2)}</pre>
              </details>
            </section>
          ) : (
            <section className="panel empty-state" aria-label="No triage yet">
              <h2>No triage yet</h2>
              <p className="muted">
                Paste a listing — or load one of the three samples above —
                then hit <strong>Triage</strong>. The on-device model reads it
                right here in your browser and returns a structured verdict:
                type, prize, deadline, a 0–100 score and a GO / MAYBE / SKIP
                call, with reasons.
              </p>
            </section>
          )}

          {/* --------------------------- Deep result --------------------------- */}
          {deep && (
            <section className="panel result-card deep-card" aria-label="Deep analysis result">
              <div className="result-head">
                <div>
                  <h2>Deep analysis</h2>
                  <p className="result-sub">
                    Winner-pattern match, effort estimate, red flags and a
                    concrete plan — from the cloud model.
                  </p>
                </div>
              </div>

              <EngineBadge engine={deep.engine} latencyMs={deep.latencyMs} />

              <h3>Winner-pattern match</h3>
              <p>{deep.patternMatch}</p>

              <h3>Effort estimate</h3>
              <p>
                <strong>{deep.effortHours}</strong>
              </p>

              <h3>Red flags</h3>
              {deep.redFlags.length === 0 ? (
                <p className="muted">None found in the text.</p>
              ) : (
                <ul className="flag-list">
                  {deep.redFlags.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}

              <h3>3-step plan</h3>
              <ol className="plan-list">
                {deep.plan.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>

              <details className="raw-json">
                <summary>Raw JSON</summary>
                <pre>{JSON.stringify(deep, null, 2)}</pre>
              </details>
            </section>
          )}
        </main>

        {/* ------------------------------ Sidebar ------------------------------ */}
        <aside className="side-col">
          <section className="panel" aria-label="Engine status">
            <div className="panel-head">
              <h2>Engine status</h2>
              <span className={`live-dot ${isFirebaseConfigured ? 'on' : 'off'}`} title={isFirebaseConfigured ? 'Firebase configured' : 'Firebase config not set yet'} />
            </div>

            <dl className="status-list">
              <div>
                <dt>Firebase</dt>
                <dd className={isFirebaseConfigured ? 'ok-text' : 'warn-text'}>
                  {isFirebaseConfigured ? 'Configured' : 'Not set yet'}
                </dd>
              </div>
              <div>
                <dt>On-device model</dt>
                <dd>
                  {status ? (
                    <>
                      {status.onDeviceState}
                      {status.onDeviceAvailable ? ' · ready' : ''}
                    </>
                  ) : (
                    'Checking…'
                  )}
                </dd>
              </div>
              <div>
                <dt>Cloud model</dt>
                <dd>{isFirebaseConfigured ? 'Gemini · ready' : 'Needs Firebase config'}</dd>
              </div>
              <div>
                <dt>Remote Config</dt>
                <dd>
                  prompt v{promptVersion} · deep ≥ {deepThreshold}
                </dd>
              </div>
            </dl>

            {downloadProgress !== null && (
              <div className="progress-wrap" aria-label="Model download progress">
                <div
                  className="progress-bar"
                  style={{ width: `${Math.round(downloadProgress * 100)}%` }}
                />
                <span className="progress-label">
                  Downloading Gemini Nano — {Math.round(downloadProgress * 100)}%
                </span>
              </div>
            )}

            <div className="mode-group" role="group" aria-label="Inference mode">
              <span className="mode-label">Inference mode</span>
              <div className="segmented">
                <button
                  type="button"
                  className={status?.mode === 'prefer-on-device' ? 'active' : ''}
                  aria-pressed={status?.mode === 'prefer-on-device'}
                  onClick={() => {
                    setMode('prefer-on-device');
                    void refreshStatus();
                  }}
                >
                  Prefer on-device
                </button>
                <button
                  type="button"
                  className={status?.mode === 'cloud-only' ? 'active' : ''}
                  aria-pressed={status?.mode === 'cloud-only'}
                  onClick={() => {
                    setMode('cloud-only');
                    void refreshStatus();
                  }}
                >
                  Cloud only
                </button>
              </div>
            </div>

            <button
              type="button"
              className="btn ghost wide"
              onClick={() => void prepareModel()}
              disabled={
                busy !== null ||
                !isFirebaseConfigured ||
                status?.mode === 'cloud-only'
              }
              title="Downloads / warms up Gemini Nano on this click"
            >
              {busy === 'prepare' ? 'Preparing…' : 'Prepare on-device model'}
            </button>

            <p className="hint">
              On-device needs Chrome Desktop 139+ with the flag{' '}
              <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code>{' '}
              enabled. First use downloads Gemini Nano on demand; while it
              downloads, Prefer on-device falls back to cloud automatically.
            </p>
          </section>

          <section className="panel" aria-label="History">
            <div className="panel-head">
              <h2>History</h2>
              <span className="count-badge">{history.length}</span>
            </div>
            {!isFirebaseConfigured ? (
              <p className="muted">
                History needs Firebase config + Firestore. Saved triages will
                appear here once it is set up.
              </p>
            ) : history.length === 0 ? (
              <p className="muted">
                No saved triages yet. Run a triage, then hit{' '}
                <strong>Save to history</strong> — it is stored in Firestore
                under an anonymous account, no sign-up needed.
              </p>
            ) : (
              <ul className="history">
                {history.map((h) => (
                  <li key={h.id}>
                    <button type="button" onClick={() => reopenHistory(h)}>
                      <span className="history-top">
                        <span className={`mini-verdict ${verdictClass(h.fast.verdict)}`}>
                          {h.fast.verdict}
                        </span>
                        <span className="history-score">{h.fast.quickScore}/100</span>
                        {h.deep && <span className="history-deep">Deep ✓</span>}
                        <span className="history-date">{formatDate(h.createdAt)}</span>
                      </span>
                      <span className="history-snippet">
                        {h.input.slice(0, 110)}
                        {h.input.length > 110 ? '…' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <footer className="app-footer">
        <p>
          <strong>BountyHound</strong> — #BuildHybridAI 2026. All AI calls go
          through Firebase AI Logic (<code>firebase/ai</code>): on-device
          Gemini Nano for triage, cloud Gemini for deep analysis, Gemini
          Developer API free tier. History: Firestore + anonymous Auth.
          Routing: Remote Config. No account, no payment, no data leaves
          your device until you ask for cloud analysis.
        </p>
      </footer>
    </div>
  );
}
