import {
  useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes,
  type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';

/* ---------- Button ---------- */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

/* ---------- Form fields ---------- */

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}

export function Field({ label, hint, error, required, children, htmlFor }: FieldProps) {
  return (
    <div className={`field ${error ? 'field-error' : ''}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="field-required" aria-hidden> *</span>}
      </label>
      {children}
      {error ? <p className="field-message field-message-error" role="alert">{error}</p> : hint ? <p className="field-message">{hint}</p> : null}
    </div>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input textarea ${className}`} {...rest} />;
}

export function SearchInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string }) {
  return (
    <div className="search-input">
      <Search size={15} aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} type="search" />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear search" className="search-clear">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/* ---------- Glass select ---------- */

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface GlassSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label: string;
  id?: string;
  compact?: boolean;
  align?: 'start' | 'end';
}

export function GlassSelect({ value, onChange, options, label, id, compact, align = 'start' }: GlassSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const autoId = useId();
  const listId = id ?? autoId;
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActive(Math.max(0, options.findIndex((o) => o.value === value)));
      listRef.current?.focus();
    }
  }, [open, options, value]);

  const commit = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(options[active].value); }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
  };

  return (
    <div className={`glass-select ${compact ? 'glass-select-compact' : ''}`} ref={rootRef}>
      <button
        type="button"
        id={listId}
        className="glass-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="glass-select-value">{selected?.label ?? label}</span>
        <ChevronDown size={15} className={`glass-select-chevron ${open ? 'open' : ''}`} aria-hidden />
      </button>
      {open && (
        <ul
          className={`glass-menu ${align === 'end' ? 'glass-menu-end' : ''}`}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          ref={listRef}
          onKeyDown={onKey}
        >
          {options.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={`glass-menu-item ${i === active ? 'active' : ''} ${o.value === value ? 'selected' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(o.value)}
              >
                <span className="glass-menu-item-text">
                  <span>{o.label}</span>
                  {o.description && <span className="glass-menu-desc">{o.description}</span>}
                </span>
                {o.value === value && <Check size={14} className="accent" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Native select styled to match, for dense admin forms */
export function NativeSelect({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`native-select ${className}`}>
      <select {...rest}>{children}</select>
      <ChevronDown size={14} aria-hidden />
    </div>
  );
}

/* ---------- Switch ---------- */

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="switch-row">
      <div className="switch-text">
        <span className="switch-label">{label}</span>
        {description && <span className="switch-desc">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}

/* ---------- Modal ---------- */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, onClose, title, children, footer, wide }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className={`modal-panel ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
          <IconButton label="Close dialog" onClick={onClose}><X size={17} /></IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  children?: ReactNode;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', children }: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
          <Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="muted">{body}</p>
      {children}
    </Modal>
  );
}

/* ---------- Tabs ---------- */

export function Tabs({ tabs, active, onChange, label }: { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={`tab ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {typeof t.count === 'number' && <span className="tab-count mono">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Badge, progress, empty, spinner ---------- */

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'outline' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Progress({ value, max, label, className = '' }: { value: number; max: number; label: string; className?: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div className={`progress ${className}`} role="progressbar" aria-valuenow={value} aria-valuemax={max} aria-label={label}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon" aria-hidden>{icon}</div>}
      <p className="empty-title">{title}</p>
      {body && <p className="empty-body muted">{body}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status" aria-label={label}>
      <Loader2 size={22} className="spin" />
    </div>
  );
}

/* ---------- Segmented control ---------- */

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} className={`segment ${value === o.value ? 'active' : ''}`} onClick={() => onChange(o.value)} aria-pressed={value === o.value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Pagination ---------- */

export function Pagination({ page, pages, onChange, label }: { page: number; pages: number; onChange: (p: number) => void; label: string }) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label={label}>
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
      <span className="pagination-info mono">{page} / {pages}</span>
      <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</Button>
    </nav>
  );
}