/* Server-side backstop sanitizer for studio HTML (no DOM available).
   The browser sanitizer is the primary gate; this runs before persisting so a
   crafted API payload cannot store active content. Conservative by design. */

const INLINE = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'a', 'code', 'br', 'span', 'sub', 'sup', 'mark']);
const BLOCK = new Set([...INLINE, 'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'figure', 'figcaption', 'hr']);
const EMBED = new Set([...BLOCK, 'iframe', 'video', 'source', 'audio']);
const DROP_CONTENT = new Set(['script', 'style', 'object', 'embed', 'form', 'textarea', 'select', 'button', 'link', 'meta', 'base']);
const ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  iframe: new Set(['src', 'width', 'height', 'title', 'loading']),
  video: new Set(['src', 'controls', 'width', 'height', 'poster']),
  source: new Set(['src', 'type']),
  audio: new Set(['src', 'controls']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
};
const GLOBAL_ATTRS = new Set(['class', 'title', 'align', 'dir', 'lang']);
const EMBED_HOSTS = ['youtube.com', 'www.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'open.spotify.com', 'codepen.io'];

function safeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith('https://') || v.startsWith('http://') || v.startsWith('/') || v.startsWith('#') || v.startsWith('mailto:') || v.startsWith('data:image/');
}
function hostOf(value: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(value.trim());
  return m ? m[1].toLowerCase() : '';
}

export type SanitizeMode = 'inline' | 'block' | 'embed';

export function sanitizeHtmlServer(input: string, mode: SanitizeMode = 'inline'): string {
  if (!input) return '';
  const allowed = mode === 'inline' ? INLINE : mode === 'block' ? BLOCK : EMBED;
  // Remove dangerous elements together with their content.
  let html = input.replace(/<(script|style|object|embed|form|textarea|select|button)\b[\s\S]*?<\/\1\s*>/gi, '');
  html = html.replace(/<\/?(script|style|object|embed|form|textarea|select|button|link|meta|base)\b[^>]*>/gi, '');
  // Rebuild remaining tags with an attribute allowlist.
  html = html.replace(/<(\/?)([a-zA-Z0-9-]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_whole, slash: string, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    if (DROP_CONTENT.has(tag)) return '';
    if (!allowed.has(tag)) return ''; // unwrap: keep inner text
    if (slash) return `</${tag}>`;
    const attrs: string[] = [];
    const attrRe = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(rawAttrs))) {
      const name = m[1].toLowerCase();
      const value = m[3] ?? m[4] ?? '';
      if (name.startsWith('on')) continue;
      if (!(GLOBAL_ATTRS.has(name) || ATTRS[tag]?.has(name))) continue;
      if (name === 'href' || name === 'src' || name === 'poster') {
        if (!safeUrl(value)) continue;
        if (tag === 'iframe' && !EMBED_HOSTS.includes(hostOf(value))) continue;
      }
      if (name === 'style') continue;
      attrs.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
    }
    if (tag === 'a') attrs.push('rel="noopener noreferrer"');
    if (tag === 'iframe') attrs.push('sandbox="allow-scripts allow-presentation"', 'loading="lazy"', 'referrerpolicy="no-referrer"');
    return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
  });
  return html;
}

/* Sanitize a whole studio document's HTML-bearing fields before persisting.
   Traversal is iterative so arbitrarily nested columns cannot overflow the
   stack, and every block is cleaned regardless of depth. */
export function sanitizeStudioHtml(doc: { blocks?: unknown }): unknown {
  const cleanBlock = (block: Record<string, unknown>): void => {
    const type = String(block.type || '');
    if (type === 'paragraph' || type === 'callout' || type === 'card') block.html = sanitizeHtmlServer(String(block.html || ''), 'inline');
    else if (type === 'html') block.html = sanitizeHtmlServer(String(block.html || ''), 'block');
    else if (type === 'embed') block.html = sanitizeHtmlServer(String(block.html || ''), 'embed');
  };
  const clone = (raw: unknown): unknown => (raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : raw);
  const walk = (blocks: unknown): unknown => {
    if (!Array.isArray(blocks)) return blocks;
    const out = blocks.map(clone);
    const stack: unknown[] = [...out];
    while (stack.length > 0) {
      const item = stack.pop();
      if (!item || typeof item !== 'object') continue;
      const block = item as Record<string, unknown>;
      cleanBlock(block);
      if (String(block.type || '') === 'columns' && Array.isArray(block.children)) {
        block.children = (block.children as unknown[]).map((column) => {
          if (!Array.isArray(column)) return column;
          const col = column.map(clone);
          stack.push(...col);
          return col;
        });
      }
    }
    return out;
  };
  return { ...doc, blocks: walk((doc as { blocks?: unknown }).blocks) };
}