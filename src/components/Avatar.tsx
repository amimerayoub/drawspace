import { db } from '@/services';
import type { AvatarDef } from '@/types';
import { avatarImage } from '@/data/assets';
import { Check } from 'lucide-react';

/* Avatar library. The ten generated portraits render as transparent PNGs;
   legacy IDs without a generated image fall back to the geometric vector mark. */

const INK = 'currentColor';
const CYAN = '#06b6d4';

export function Shape({ shape }: { shape: number }) {
  const s = shape % 12;
  const eye = (cx: number, cy: number, r = 2.6) => <circle cx={cx} cy={cy} r={r} fill={INK} />;
  switch (s) {
    case 0: return (<g><circle cx="24" cy="26" r="14" fill="none" stroke={INK} strokeWidth="2.5" />{eye(19, 24)}{eye(29, 24)}<path d="M19 31q5 4 10 0" stroke={CYAN} strokeWidth="2.5" fill="none" strokeLinecap="round" /></g>);
    case 1: return (<g><rect x="11" y="13" width="26" height="26" rx="6" fill="none" stroke={INK} strokeWidth="2.5" />{eye(19, 25)}{eye(29, 25)}<rect x="19" y="31" width="10" height="2.6" rx="1.3" fill={CYAN} /></g>);
    case 2: return (<g><path d="M24 10l14 24H10z" fill="none" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />{eye(20, 27)}{eye(28, 27)}<circle cx="24" cy="32" r="1.8" fill={CYAN} /></g>);
    case 3: return (<g><rect x="12" y="14" width="24" height="24" rx="2" fill="none" stroke={INK} strokeWidth="2.5" /><rect x="17" y="22" width="5" height="5" fill={INK} /><rect x="26" y="22" width="5" height="5" fill={CYAN} /><path d="M18 32h12" stroke={INK} strokeWidth="2.5" strokeLinecap="round" /></g>);
    case 4: return (<g><circle cx="24" cy="26" r="14" fill="none" stroke={INK} strokeWidth="2.5" /><path d="M10 26h28" stroke={INK} strokeWidth="2" /><circle cx="19" cy="21" r="2.4" fill={INK} /><circle cx="29" cy="21" r="2.4" fill={INK} /><path d="M38 12l4-4M40 16l5-2" stroke={CYAN} strokeWidth="2.2" strokeLinecap="round" /></g>);
    case 5: return (<g><path d="M24 11l12 7v14l-12 7-12-7V18z" fill="none" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />{eye(19, 25)}{eye(29, 25)}<path d="M21 31h6" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round" /></g>);
    case 6: return (<g><circle cx="24" cy="26" r="14" fill="none" stroke={INK} strokeWidth="2.5" /><path d="M16 24q3-3 6 0M26 24q3-3 6 0" stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" /><circle cx="24" cy="31" r="2.2" fill={CYAN} /></g>);
    case 7: return (<g><path d="M12 38V22a12 12 0 0124 0v16" fill="none" stroke={INK} strokeWidth="2.5" />{eye(19, 26)}{eye(29, 26)}<path d="M20 32q4 3 8 0" stroke={CYAN} strokeWidth="2.4" fill="none" strokeLinecap="round" /></g>);
    case 8: return (<g><ellipse cx="24" cy="27" rx="15" ry="12" fill="none" stroke={INK} strokeWidth="2.5" /><ellipse cx="24" cy="12" rx="9" ry="3" fill="none" stroke={CYAN} strokeWidth="2.2" />{eye(19, 26)}{eye(29, 26)}<path d="M21 31h6" stroke={INK} strokeWidth="2.4" strokeLinecap="round" /></g>);
    case 9: return (<g><rect x="11" y="13" width="26" height="26" rx="13" fill={INK} opacity="0.12" /><rect x="11" y="13" width="26" height="26" rx="13" fill="none" stroke={INK} strokeWidth="2.5" /><circle cx="19" cy="25" r="2.4" fill={INK} /><circle cx="29" cy="25" r="2.4" fill={CYAN} /><path d="M19 31q5 3 10 0" stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" /></g>);
    case 10: return (<g><path d="M12 20l12-8 12 8v16H12z" fill="none" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />{eye(19, 25)}{eye(29, 25)}<path d="M24 30v4" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round" /></g>);
    default: return (<g><circle cx="24" cy="26" r="14" fill="none" stroke={INK} strokeWidth="2.5" /><path d="M17 22l4 4M21 22l-4 4" stroke={INK} strokeWidth="2.2" strokeLinecap="round" /><circle cx="29" cy="24" r="2.4" fill={INK} /><path d="M18 31q6 5 12 0" stroke={CYAN} strokeWidth="2.5" fill="none" strokeLinecap="round" /></g>);
  }
}

export function Avatar({ avatarId, size = 40, className = '' }: { avatarId: string; size?: number; className?: string }) {
  const def = db.avatars.find((a) => a.id === avatarId);
  const src = def?.image ?? avatarImage(avatarId);
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={def ? `${def.name} avatar` : 'Player avatar'}
    >
      {src ? (
        <img className="avatar-img" src={src} alt="" width={size} height={size} loading="lazy" decoding="async" />
      ) : (
        <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
          <Shape shape={def?.shape ?? 0} />
        </svg>
      )}
    </span>
  );
}

export function AvatarPicker({ value, onChange, label }: { value: string; onChange: (id: string) => void; label: string }) {
  const avatars: AvatarDef[] = [...db.avatars].filter((a) => a.enabled).sort((a, b) => a.order - b.order);
  return (
    <div className="avatar-picker" role="radiogroup" aria-label={label}>
      {avatars.map((a) => (
        <button
          key={a.id}
          type="button"
          role="radio"
          aria-checked={value === a.id}
          aria-label={a.name}
          title={a.name}
          className={`avatar-option ${value === a.id ? 'selected' : ''}`}
          onClick={() => onChange(a.id)}
        >
          <Avatar avatarId={a.id} size={44} />
          {value === a.id && <span className="avatar-check"><Check size={11} /></span>}
        </button>
      ))}
    </div>
  );
}