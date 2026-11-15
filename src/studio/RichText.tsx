/* Inline rich text editing for paragraph, callout and card blocks.
   contentEditable + execCommand; output is always allowlist-sanitized. */
import { useEffect, useRef, useState } from 'react';
import { Bold, Code, Eraser, Italic, Link2, Strikethrough, Underline } from 'lucide-react';
import { sanitizeHtml } from './sanitize';

export function RichText({ value, onChange, placeholder = 'Write something…', minHeight = 60 }: {
  value: string; onChange: (html: string) => void; placeholder?: string; minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');

  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  const emit = () => onChange(sanitizeHtml(ref.current?.innerHTML ?? '', 'inline'));
  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };
  const applyLink = () => {
    const url = linkUrl.trim();
    if (/^(https?:\/\/|\/|#|mailto:)/i.test(url)) exec('createLink', url);
    setLinkOpen(false);
  };

  return (
    <div className={`st-richtext ${focused ? 'focused' : ''}`}>
      <div className="st-rt-toolbar" role="toolbar" aria-label="Text formatting">
        <button type="button" aria-label="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><Bold size={13} /></button>
        <button type="button" aria-label="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><Italic size={13} /></button>
        <button type="button" aria-label="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}><Underline size={13} /></button>
        <button type="button" aria-label="Strikethrough" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('strikeThrough')}><Strikethrough size={13} /></button>
        <button type="button" aria-label="Inline code" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertHTML', `<code>${window.getSelection()?.toString() || 'code'}</code>`)}><Code size={13} /></button>
        <button type="button" aria-label="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={() => setLinkOpen(!linkOpen)}><Link2 size={13} /></button>
        <button type="button" aria-label="Clear formatting" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('removeFormat')}><Eraser size={13} /></button>
        {linkOpen && (
          <span className="st-rt-link">
            <input
              value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } if (e.key === 'Escape') setLinkOpen(false); }}
              aria-label="Link URL"
            />
            <button type="button" onClick={applyLink}>Apply</button>
          </span>
        )}
      </div>
      <div
        ref={ref}
        className="st-rt-area"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        style={{ minHeight }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); if (ref.current) ref.current.innerHTML = sanitizeHtml(ref.current.innerHTML, 'inline'); emit(); }}
        onInput={emit}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          emit();
        }}
      />
    </div>
  );
}