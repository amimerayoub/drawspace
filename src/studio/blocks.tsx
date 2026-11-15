/* Shared studio renderer: used by the editor live preview and the public article.
   All HTML-bearing fields pass through the allowlist sanitizer before injection. */
import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlertTriangle, Check, CheckCircle2, Code2, Copy, Globe, Heart, Info, Lightbulb,
  PenLine, Rocket, Shield, Sparkles, Star, Trophy, Users, Zap,
} from 'lucide-react';
import { sanitizeHtml, isSafeUrl } from './sanitize';
import { escapeHtml, type Block, type DesignConfig, type StudioDoc } from './types';
import { ResponsiveImage } from '@/components/ResponsiveImage';

export interface RelatedItem { slug: string; title: string; publishedAt?: string }
export interface RenderContext {
  related?: RelatedItem[];
  pathFor?: (path: string) => string;
  preview?: boolean;
}

/* ---------- Design -> CSS variables ---------- */
const fontStack = (family: string, fallback: string) => `"${family.replace(/["';]/g, '')}", ${fallback}`;
const SHADOWS = { none: 'none', soft: '0 8px 30px rgba(0,0,0,0.18)', strong: '0 18px 60px rgba(0,0,0,0.45)' };

export function designVars(design: DesignConfig): CSSProperties {
  const { typography: t, layout: l, colors: c } = design;
  const bgImage = [c.gradient, c.backgroundImage ? `url("${c.backgroundImage.replace(/["')]/g, '')}")` : '']
    .filter(Boolean).join(', ');
  return {
    '--st-font': fontStack(t.fontFamily, 'Inter, ui-sans-serif, system-ui, sans-serif'),
    '--st-size': `${t.fontSize}px`,
    '--st-weight': String(t.fontWeight),
    '--st-lh': String(t.lineHeight),
    '--st-ls': `${t.letterSpacing}em`,
    '--st-color': t.textColor || 'inherit',
    '--st-hfont': fontStack(t.headingFamily, 'Manrope, Inter, ui-sans-serif, system-ui, sans-serif'),
    '--st-hweight': String(t.headingWeight),
    '--st-hcolor': t.headingColor || 'inherit',
    '--st-gap': `${l.sectionSpacing}px`,
    '--st-pad': `${l.padding}px`,
    '--st-radius': `${l.radius}px`,
    '--st-shadow': SHADOWS[l.shadow],
    '--st-section-bg': c.sectionBackground || 'rgba(127,127,127,0.06)',
    '--st-border': c.borderColor || 'var(--border)',
    '--st-accent': c.accent || '#06b6d4',
    '--st-width': l.fullWidth ? '100%' : `${l.contentWidth}px`,
    background: c.background || undefined,
    backgroundImage: bgImage || undefined,
  } as CSSProperties;
}

/* ---------- Syntax highlighting (dependency-free) ---------- */
const KEYWORDS: Record<string, string> = {
  js: 'const let var function return if else for while class new import export from default async await try catch throw typeof instanceof of in do switch case break continue yield delete void this super extends static get set null undefined true false',
  ts: 'const let var function return if else for while class new import export from default async await try catch throw typeof instanceof of in do switch case break continue interface type enum implements extends static get set null undefined true false readonly as keyof namespace declare abstract public private protected',
  py: 'def return if elif else for while class import from as try except finally raise with lambda yield pass break continue and or not in is None True False global nonlocal assert async await',
  bash: 'if then else elif fi for while do done case esac function echo exit return local export set source alias cd',
  sql: 'select from where insert into values update set delete create table alter drop join left right inner outer on group by order having limit distinct as and or not null primary key index',
  css: '',
  json: 'true false null',
};
const ALIAS: Record<string, string> = { javascript: 'js', typescript: 'ts', jsx: 'js', tsx: 'ts', python: 'py', sh: 'bash', shell: 'bash', zsh: 'bash', postgres: 'sql', postgresql: 'sql', scss: 'css', html: 'html', xml: 'html' };

function highlightCode(code: string, language: string): string {
  const lang = ALIAS[language.toLowerCase()] || language.toLowerCase();
  if (lang === 'html') {
    return escapeHtml(code)
      .replace(/(&lt;\/?)([a-zA-Z][\w-]*)/g, '$1<span class="tok-k">$2</span>')
      .replace(/([a-zA-Z-]+)=(&quot;.*?&quot;)/g, '<span class="tok-b">$1</span>=<span class="tok-s">$2</span>');
  }
  if (lang === 'css') {
    return escapeHtml(code)
      .replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="tok-c">${m}</span>`)
      .replace(/([a-zA-Z-]+)(\s*:)/g, '<span class="tok-b">$1</span>$2')
      .replace(/(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|s|vh|vw)?)/g, '<span class="tok-n">$1</span>');
  }
  const keywords = new Set((KEYWORDS[lang] ?? KEYWORDS.js).split(' ').filter(Boolean));
  const hashComment = ['py', 'bash', 'yaml', 'ruby'].includes(lang);
  const comment = hashComment ? '#[^\\n]*' : lang === 'sql' ? '--[^\\n]*' : '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
  const re = new RegExp(`(${comment})|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_$][\\w$]*)`, 'g');
  let out = ''; let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    out += escapeHtml(code.slice(last, m.index));
    const text = escapeHtml(m[0]);
    if (m[1]) out += `<span class="tok-c">${text}</span>`;
    else if (m[2]) out += `<span class="tok-s">${text}</span>`;
    else if (m[3]) out += `<span class="tok-n">${text}</span>`;
    else if (keywords.has(m[0])) out += `<span class="tok-k">${text}</span>`;
    else out += text;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(code.slice(last));
}

/* ---------- Media helpers ---------- */
function videoSource(url: string): { kind: 'iframe' | 'video'; src: string } | null {
  const u = url.trim();
  const yt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(u);
  if (yt) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const vimeo = /vimeo\.com\/(\d+)/.exec(u);
  if (vimeo) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}` };
  if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(u) && isSafeUrl(u)) return { kind: 'video', src: u };
  return null;
}

const FEATURE_ICONS: Record<string, typeof Sparkles> = {
  spark: Sparkles, bolt: Zap, star: Star, heart: Heart, shield: Shield, globe: Globe,
  code: Code2, pen: PenLine, check: Check, rocket: Rocket, trophy: Trophy, users: Users,
};
const CALLOUT_ICONS = { info: Info, tip: Lightbulb, warning: AlertTriangle, success: CheckCircle2 };

export function collectHeadings(blocks: Block[]): { id: string; text: string; level: number }[] {
  const out: { id: string; text: string; level: number }[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (b.type === 'heading' && b.text.trim()) out.push({ id: b.id, text: b.text, level: b.level });
      else if (b.type === 'columns') b.children.forEach(walk);
    }
  };
  walk(blocks);
  return out;
}

function linkHref(href: string, ctx: RenderContext): string {
  if (!isSafeUrl(href)) return '#';
  if (href.startsWith('/') && ctx.pathFor) return ctx.pathFor(href);
  return href;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button" className="st-copy" aria-label="Copy code"
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => undefined); }}
    >
      {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

/* ---------- Individual blocks ---------- */
function renderBlock(block: Block, ctx: RenderContext, doc: StudioDoc, depth = 0): ReactNode {
  switch (block.type) {
    case 'paragraph':
      return block.html.trim()
        ? <p className="st-p" style={{ textAlign: block.align }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html, 'inline') }} />
        : ctx.preview ? <p className="st-p st-empty">Empty paragraph. Click to write.</p> : null;
    case 'heading': {
      const Tag = `h${block.level}` as 'h1';
      return <Tag id={`s-${block.id}`} className="st-h" style={{ textAlign: block.align }}>{block.text || (ctx.preview ? 'Heading' : '')}</Tag>;
    }
    case 'quote':
      return (
        <blockquote className="st-quote">
          <p>{block.text}</p>
          {block.cite && <cite>{block.cite}</cite>}
        </blockquote>
      );
    case 'list': {
      const items = block.items.filter((i) => i.trim() || ctx.preview);
      const List = block.ordered ? 'ol' : 'ul';
      return <List className="st-list">{items.map((item, i) => <li key={i}>{item}</li>)}</List>;
    }
    case 'code':
      return (
        <div className="st-code">
          <div className="st-code-head"><span className="mono">{block.language || 'text'}</span><CopyButton text={block.code} /></div>
          <pre><code dangerouslySetInnerHTML={{ __html: highlightCode(block.code, block.language) }} /></pre>
        </div>
      );
    case 'table': {
      const [head, ...body] = block.header ? block.rows : [[], ...block.rows];
      return (
        <div className="st-table-wrap">
          <table className="st-table">
            {block.header && head.length > 0 && <thead><tr>{head.map((cell, i) => <th key={i}>{cell}</th>)}</tr></thead>}
            <tbody>{(block.header ? body : block.rows).map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    case 'image':
      if (!block.src) return ctx.preview ? <div className="st-image-empty">Image block: pick a file in the Media panel.</div> : null;
      if (!isSafeUrl(block.src, true)) return null;
      return (
        <figure className="st-figure" style={{ width: `${Math.min(100, Math.max(10, block.width))}%` }}>
          <ResponsiveImage src={block.src} alt={block.alt} sizes="(max-width: 768px) 100vw, 720px" />
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      );
    case 'gallery':
      if (block.images.length === 0) return ctx.preview ? <div className="st-image-empty">Gallery: add images in the block settings.</div> : null;
      return (
        <div className={`st-gallery st-gallery-${block.columns}`}>
          {block.images.filter((img) => isSafeUrl(img.src, true)).map((img, i) => (
            <figure key={i} className="st-figure">
              <ResponsiveImage src={img.src} alt={img.alt} sizes="(max-width: 768px) 50vw, 350px" />
              {img.caption && <figcaption>{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      );
    case 'video': {
      const source = videoSource(block.url);
      if (!source) return ctx.preview ? <div className="st-image-empty">Video: paste a YouTube, Vimeo or .mp4 URL.</div> : null;
      return (
        <figure className="st-figure st-video">
          {source.kind === 'iframe'
            ? <iframe src={source.src} title={block.caption || 'Video'} loading="lazy" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="no-referrer" />
            : <video src={source.src} controls preload="metadata" />}
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      );
    }
    case 'embed':
      if (!block.html.trim()) return ctx.preview ? <div className="st-image-empty">Embed: paste iframe or media HTML.</div> : null;
      return <div className="st-embed" style={{ minHeight: block.height }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html, 'embed') }} />;
    case 'separator':
      if (block.style === 'space') return <div className="st-sep-space" aria-hidden />;
      if (block.style === 'dots') return <div className="st-sep-dots" aria-hidden><span /><span /><span /></div>;
      return <hr className="st-sep" />;
    case 'spacer':
      return <div style={{ height: block.height }} aria-hidden />;
    case 'callout': {
      const Icon = CALLOUT_ICONS[block.tone];
      return (
        <aside className={`st-callout st-callout-${block.tone}`}>
          <div className="st-callout-head"><Icon size={15} aria-hidden />{block.title && <strong>{block.title}</strong>}</div>
          <div className="st-callout-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html, 'inline') }} />
        </aside>
      );
    }
    case 'html':
      if (!block.html.trim()) return ctx.preview ? <div className="st-image-empty">Custom HTML block.</div> : null;
      return <div className="st-html" dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html, 'block') }} />;
    case 'buttons':
      return (
        <div className="st-buttons" style={{ justifyContent: block.align === 'center' ? 'center' : block.align === 'end' ? 'flex-end' : 'flex-start' }}>
          {block.items.map((item, i) => (
            <a key={i} className={`st-btn st-btn-${item.variant}`} href={linkHref(item.href, ctx)}>{item.label || 'Button'}</a>
          ))}
        </div>
      );
    case 'columns':
      return (
        <div className={`st-columns st-columns-${block.count}`}>
          {block.children.slice(0, block.count).map((child, i) => <div key={i} className="st-column">{depth < 6 ? renderBlocks(child, ctx, doc, depth + 1) : null}</div>)}
        </div>
      );
    case 'hero':
      return (
        <section
          className={`st-hero ${block.align === 'center' ? 'st-hero-center' : ''}`}
          style={{
            background: block.bg || undefined,
            backgroundImage: block.image && isSafeUrl(block.image, true) ? `linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.6)), url("${block.image.replace(/["')]/g, '')}")` : undefined,
          }}
        >
          {block.eyebrow && <span className="st-hero-eyebrow">{block.eyebrow}</span>}
          <h2 className="st-hero-title">{block.title}</h2>
          {block.subtitle && <p className="st-hero-sub">{block.subtitle}</p>}
        </section>
      );
    case 'features':
      return (
        <div className={`st-features st-features-${block.columns}`}>
          {block.items.map((item, i) => {
            const Icon = FEATURE_ICONS[item.icon] || Sparkles;
            return (
              <div key={i} className="st-feature">
                <span className="st-feature-icon"><Icon size={17} aria-hidden /></span>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </div>
            );
          })}
        </div>
      );
    case 'card':
      return (
        <div className={`st-card ${block.accent ? 'st-card-accent' : ''}`}>
          {block.title && <h3 className="st-card-title">{block.title}</h3>}
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html, 'inline') }} />
        </div>
      );
    case 'author':
      return (
        <div className="st-author">
          {block.avatar && isSafeUrl(block.avatar, true)
            ? <ResponsiveImage className="st-author-avatar" src={block.avatar} alt={block.name} />
            : <span className="st-author-avatar st-author-initials" aria-hidden>{(block.name || '?').slice(0, 1).toUpperCase()}</span>}
          <div>
            <strong className="st-author-name">{block.name || 'Author'}</strong>
            {block.bio && <p className="st-author-bio">{block.bio}</p>}
          </div>
        </div>
      );
    case 'toc': {
      const headings = collectHeadings(doc.blocks);
      if (headings.length === 0) return ctx.preview ? <div className="st-image-empty">Table of contents: add heading blocks.</div> : null;
      return (
        <nav className="st-toc" aria-label={block.title}>
          <strong className="st-toc-title">{block.title}</strong>
          <ol>
            {headings.map((h) => <li key={h.id} style={{ paddingInlineStart: `${(h.level - 1) * 12}px` }}><a href={`#s-${h.id}`}>{h.text}</a></li>)}
          </ol>
        </nav>
      );
    }
    case 'newsletter':
      return (
        <section className="st-newsletter">
          <strong>{block.title}</strong>
          {block.body && <p>{block.body}</p>}
          <a className="st-btn st-btn-primary" href={linkHref(block.href || '#', ctx)}>{block.buttonLabel || 'Subscribe'}</a>
        </section>
      );
    case 'cta':
      return (
        <section className={`st-cta ${block.variant === 'secondary' ? 'st-cta-secondary' : ''}`}>
          <div>
            <strong>{block.title}</strong>
            {block.body && <p>{block.body}</p>}
          </div>
          <a className="st-btn st-btn-primary" href={linkHref(block.href, ctx)}>{block.buttonLabel || 'Learn more'}</a>
        </section>
      );
    case 'related': {
      const items = (ctx.related || []).slice(0, Math.max(1, block.limit));
      if (items.length === 0) return ctx.preview ? <div className="st-image-empty">Related articles appear here once the post is published.</div> : null;
      return (
        <section className="st-related">
          <strong className="st-related-title">{block.title}</strong>
          <div className="st-related-list">
            {items.map((item) => (
              <a key={item.slug} className="st-related-row" href={ctx.pathFor ? ctx.pathFor(`/blog/${item.slug}`) : `/blog/${item.slug}`}>
                <span>{item.title}</span>
              </a>
            ))}
          </div>
        </section>
      );
    }
  }
}

export function renderBlocks(blocks: Block[], ctx: RenderContext, doc: StudioDoc, depth = 0): ReactNode {
  return blocks.map((block) => <div key={block.id} className="st-block">{renderBlock(block, ctx, doc, depth)}</div>);
}

export function StudioContent({ doc, related, pathFor, preview = false, className = '' }: {
  doc: StudioDoc; related?: RelatedItem[]; pathFor?: (path: string) => string; preview?: boolean; className?: string;
}) {
  const ctx: RenderContext = { related, pathFor, preview };
  const { layout } = doc.design;
  return (
    <div
      className={`studio-doc ${className}`}
      style={{
        ...designVars(doc.design),
        maxWidth: layout.fullWidth ? '100%' : `${layout.contentWidth}px`,
        marginInline: layout.align === 'center' ? 'auto' : undefined,
        padding: layout.padding || undefined,
        borderRadius: layout.radius || undefined,
      }}
    >
      {renderBlocks(doc.blocks, ctx, doc)}
    </div>
  );
}