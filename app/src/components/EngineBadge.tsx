// BountyHound — engine badge.
//
// The engine shown here ALWAYS comes from the `engine` field of the ai.ts
// result (which itself comes from `response.inferenceSource` — the
// authoritative source), never from the requested mode or the latency.

import type { Engine } from '../lib/ai';

/** "1.8s" for >= 1s, otherwise "842 ms". */
export function formatLatency(latencyMs: number): string {
  if (latencyMs >= 1000) return `${(latencyMs / 1000).toFixed(1)}s`;
  return `${latencyMs} ms`;
}

export function EngineBadge({
  engine,
  latencyMs,
}: {
  engine: Engine;
  latencyMs: number;
}) {
  const label =
    engine === 'on-device'
      ? `On-device · Gemini Nano · ${formatLatency(latencyMs)} · $0.00 · private`
      : `Cloud · Gemini · ${formatLatency(latencyMs)}`;
  return (
    <span
      className={`engine-badge ${engine}`}
      title={
        engine === 'on-device'
          ? 'Answered by the on-device model (Gemini Nano) — the text never left this browser.'
          : 'Answered by the cloud model (Gemini via Firebase AI Logic).'
      }
    >
      <span className="engine-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
