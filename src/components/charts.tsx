import { useId } from 'react';

/* Monochrome + cyan charts. Series are separated by luminance and direct labels. */

export function LineChart({ data, labels, height = 180, label }: { data: number[]; labels?: string[]; height?: number; label: string }) {
  const id = useId();
  const w = 560;
  const h = height;
  const pad = 8;
  const max = Math.max(...data) * 1.1;
  const min = Math.min(...data) * 0.9;
  const range = max - min || 1;
  const px = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const py = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const points = data.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  const area = `${pad},${h - pad} ${points} ${w - pad},${h - pad}`;
  const last = data[data.length - 1];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: latest value ${last}`} className="chart-svg">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad} x2={w - pad} y1={h * f} y2={h * f} className="chart-grid" />
        ))}
        <polygon points={area} fill={`url(#${id}-fill)`} />
        <polyline points={points} fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={px(data.length - 1)} cy={py(last)} r="3.5" fill="#06b6d4" />
      </svg>
      <div className="chart-x">
        {labels && labels.length > 0 && (
          <>
            <span>{labels[0]}</span>
            <span>{labels[labels.length - 1]}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function BarChart({ data, height = 180, label }: { data: { label: string; value: number }[]; height?: number; label: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="chart" role="img" aria-label={label}>
      <div className="bars" style={{ height }}>
        {data.map((d, i) => (
          <div key={d.label} className="bar-col" title={`${d.label}: ${d.value}`}>
            <span className="bar-value mono">{d.value}</span>
            <div
              className={`bar ${i === data.length - 1 ? 'bar-accent' : ''}`}
              style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }}
            />
            <span className="bar-label">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Donut({ data, size = 168, label }: { data: { label: string; value: number }[]; size?: number; label: string }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 60;
  const cx = 80;
  const cy = 80;
  const circumference = 2 * Math.PI * r;
  const tones = ['#06b6d4', '#67e8f9', '#a1a1aa', '#d4d4d8', '#52525b', '#e4e4e7', '#3f3f46', '#f4f4f5'];
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={label}>
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * circumference;
          const el = (
            <circle
              key={d.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={tones[i % tones.length]}
              strokeWidth="18"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset * circumference}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += frac;
          return el;
        })}
      </svg>
      <ul className="donut-legend">
        {data.map((d, i) => (
          <li key={d.label}>
            <span className="legend-dot" style={{ background: tones[i % tones.length] }} aria-hidden />
            <span className="legend-label">{d.label}</span>
            <span className="mono legend-value">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}