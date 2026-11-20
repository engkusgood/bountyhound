// BountyHound — quickScore gauge (SVG ring, no dependencies).

export function ScoreGauge({
  score,
  verdict,
}: {
  score: number;
  verdict: 'GO' | 'MAYBE' | 'SKIP';
}) {
  const size = 132;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  const color =
    verdict === 'GO' ? 'var(--go)' : verdict === 'MAYBE' ? 'var(--maybe)' : 'var(--skip)';

  return (
    <div
      className="gauge"
      role="img"
      aria-label={`Quick score ${clamped} out of 100, verdict ${verdict}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="gauge-arc"
        />
      </svg>
      <div className="gauge-label">
        <span className="gauge-score" style={{ color }}>
          {clamped}
        </span>
        <span className="gauge-of">/ 100</span>
      </div>
    </div>
  );
}
