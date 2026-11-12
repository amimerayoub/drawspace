const CYAN = '#06b6d4';

export function BlogCover({ cover, title }: { cover: string; title: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const };
  let art: React.ReactNode;
  switch (cover) {
    case 'guess':
      art = (
        <g>
          <circle cx="60" cy="52" r="26" {...common} />
          <path d="M52 52l6 6 12-14" stroke={CYAN} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M96 34h40M96 50h56M96 66h30" {...common} opacity="0.45" />
        </g>
      );
      break;
    case 'draw':
      art = (
        <g>
          <path d="M40 78c14-30 34-44 60-46-6 22-24 40-48 48l-12 4z" {...common} />
          <circle cx="98" cy="34" r="3" fill={CYAN} />
          <path d="M110 60h40M110 74h28" {...common} opacity="0.45" />
        </g>
      );
      break;
    case 'learn':
      art = (
        <g>
          <path d="M44 40h44v52H44zM88 40h44v52H88" {...common} />
          <path d="M52 52h28M52 62h28M96 52h28M96 62h20" {...common} opacity="0.45" />
          <path d="M66 78l8 8 14-16" stroke={CYAN} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
      break;
    case 'update':
      art = (
        <g>
          <path d="M88 30l8 18 20 2-14 14 4 20-18-10-18 10 4-20-14-14 20-2z" {...common} />
          <circle cx="88" cy="58" r="6" fill={CYAN} opacity="0.9" />
          <path d="M130 40h24M130 56h16" {...common} opacity="0.45" />
        </g>
      );
      break;
    case 'community':
      art = (
        <g>
          <circle cx="66" cy="46" r="12" {...common} />
          <circle cx="110" cy="46" r="12" {...common} />
          <path d="M48 84c2-14 9-22 18-22s16 8 18 22M92 84c2-14 9-22 18-22s16 8 18 22" {...common} />
          <path d="M82 34h12" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
      break;
    default:
      art = (
        <g>
          <rect x="44" y="30" width="88" height="56" rx="6" {...common} />
          <path d="M56 46h64M56 58h44M56 70h56" {...common} opacity="0.45" />
          <circle cx="122" cy="70" r="4" fill={CYAN} />
        </g>
      );
  }
  return (
    <svg viewBox="0 0 176 112" className="blog-cover" role="img" aria-label={title} preserveAspectRatio="xMidYMid slice">
      <rect width="176" height="112" fill="var(--bg-subtle)" />
      {art}
    </svg>
  );
}
