/* Allowlist HTML sanitizer for studio rich text, HTML blocks and embeds.
   Runs in the browser (editor preview + public article). The server applies an
   independent backstop sanitizer before persisting. */

const INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'a', 'code', 'br', 'span', 'sub', 'sup', 'mark']);
const BLOCK_TAGS = new Set([...INLINE_TAGS, 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'figure', 'figcaption', 'hr']);
const EMBED_TAGS = new Set([...BLOCK_TAGS, 'iframe', 'video', 'source', 'audio']);
const GLOBAL_ATTRS = new Set(['class', 'title', 'align', 'dir', 'lang']);
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  iframe: new Set(['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'loading']),
  video: new Set(['src', 'controls', 'width', 'height', 'poster', 'preload']),
  source: new Set(['src', 'type']),
  audio: new Set(['src', 'controls']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  span: new Set(['style']),
};
const EMBED_HOSTS = ['youtube.com', 'www.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'open.spotify.com', 'codepen.io'];

export function isSafeUrl(value: string, allowDataImage = false): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith('https://') || v.startsWith('http://') || v.startsWith('/') || v.startsWith('#') || v.startsWith('mailto:')) return true;
  if (allowDataImage && v.startsWith('data:image/')) return true;
  return false;
}
const safeUrl = isSafeUrl;

export type SanitizeMode = 'inline' | 'block' | 'embed';

export function sanitizeHtml(input: string, mode: SanitizeMode = 'inline'): string {
  if (!input) return '';
  const allowed = mode === 'inline' ? INLINE_TAGS : mode === 'block' ? BLOCK_TAGS : EMBED_TAGS;
  const doc = new DOMParser().parseFromString(input, 'text/html');

  const walk = (node: Element) => {
    for (const child of [...node.children]) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'object' || tag === 'embed' || tag === 'form' || tag === 'input' || tag === 'button') {
        child.remove();
        continue;
      }
      if (!allowed.has(tag)) {
        // Unwrap unknown tags, keeping their (sanitized) children.
        walk(child);
        while (child.firstChild) node.insertBefore(child.firstChild, child);
        child.remove();
        continue;
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        const keep = (GLOBAL_ATTRS.has(name) || TAG_ATTRS[tag]?.has(name)) && !name.startsWith('on');
        if (!keep) { child.removeAttribute(attr.name); continue; }
        if (name === 'href' || name === 'src' || name === 'poster') {
          const isImg = tag === 'img';
          if (!safeUrl(attr.value, isImg)) { child.removeAttribute(attr.name); continue; }
          if (tag === 'iframe') {
            try {
              const host = new URL(attr.value, 'https://drawspace.cloud').hostname;
              if (!EMBED_HOSTS.includes(host)) { child.removeAttribute(attr.name); continue; }
            } catch { child.removeAttribute(attr.name); continue; }
          }
        }
        if (name === 'style') {
          // Only a tiny safe subset of inline style; drop anything with url()/expression.
          const v = attr.value.toLowerCase();
          if (v.includes('url(') || v.includes('expression') || v.includes('javascript')) child.removeAttribute(attr.name);
        }
      }
      if (tag === 'a') {
        child.setAttribute('rel', 'noopener noreferrer');
        if (child.getAttribute('target') === '_blank') child.setAttribute('rel', 'noopener noreferrer');
      }
      if (tag === 'iframe') {
        child.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
        child.setAttribute('loading', 'lazy');
        child.setAttribute('referrerpolicy', 'no-referrer');
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/* Strip active directives from author CSS before it is injected into a page. */
export function sanitizeCss(input: string): string {
  return input
    .replace(/@import[^;]+;?/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/behavior\s*:[^;}]+/gi, '')
    .replace(/-moz-binding\s*:[^;}]+/gi, '')
    .replace(/url\(\s*['"]?\s*javascript:[^)]*\)/gi, 'url(about:blank)');
}

/* Build a sandboxed srcdoc document for previewing custom HTML/CSS/JS.
   The iframe is sandboxed without allow-same-origin so scripts cannot reach
   the parent app, its storage, or its credentials. */
export function buildPreviewDoc(opts: { html: string; css: string; js: string; headerScript: string; footerScript: string; baseCss?: string }): string {
  const safeJs = opts.js.replace(/<\/script/gi, '<\\/script');
  const safeHeader = opts.headerScript.replace(/<\/script/gi, '<\\/script');
  const safeFooter = opts.footerScript.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; script-src 'unsafe-inline'; font-src https:; connect-src 'none'; frame-src https:;">
<style>${opts.baseCss ?? ''}</style><style>${opts.css}</style>${safeHeader ? `<script>${safeHeader}</script>` : ''}</head>
<body>${opts.html}${safeFooter ? `<script>${safeFooter}</script>` : ''}${safeJs ? `<script>${safeJs}</script>` : ''}</body></html>`;
}