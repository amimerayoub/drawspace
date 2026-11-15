/* Server-side studio document handling: sentinel detection, HTML sanitizing,
   role-gated custom JavaScript, and plain-text extraction for the content column. */
import { HttpError } from '../middleware/errors';
import { sanitizeStudioHtml } from './sanitizeHtml';

export const STUDIO_SENTINEL = 'DS-STUDIO-1';
export const STUDIO_JS_ROLES = ['admin', 'superadmin'];
export const STUDIO_DOC_MAX = 500_000;

export interface PreparedStudio { isStudio: boolean; serialized: string; plain: string }

/* Parse a sentinel-prefixed studio payload into its document object, or null
   when the content is legacy plain text. */
export function studioToObject(content: string): Record<string, unknown> | null {
  if (!content.startsWith(STUDIO_SENTINEL)) return null;
  try {
    const parsed = JSON.parse(content.slice(STUDIO_SENTINEL.length).trim());
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch { return null; }
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function plainText(blocks: unknown, depth = 0): string[] {
  if (!Array.isArray(blocks) || depth > 4) return [];
  const parts: string[] = [];
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue;
    const block = raw as Record<string, unknown>;
    const type = String(block.type || '');
    if (type === 'paragraph' || type === 'callout' || type === 'card') parts.push(stripTags(String(block.html || '')));
    else if (type === 'heading' || type === 'quote') parts.push(String(block.text || ''));
    else if (type === 'list' && Array.isArray(block.items)) parts.push(block.items.map((i) => String(i)).join('\n'));
    else if (type === 'hero' || type === 'cta' || type === 'newsletter') parts.push([block.title, block.subtitle ?? block.body].filter(Boolean).map(String).join('\n'));
    else if (type === 'columns' && Array.isArray(block.children)) for (const child of block.children) parts.push(...plainText(child, depth + 1));
  }
  return parts.filter(Boolean);
}

/* Sanitize and gate a studio payload. Non-admin roles never persist executable
   scripts; custom code stays disabled unless explicitly enabled. */
export function prepareStudio(content: string, actorRole: string): PreparedStudio {
  if (!content.startsWith(STUDIO_SENTINEL)) return { isStudio: false, serialized: content, plain: content };
  let parsed: unknown;
  try { parsed = JSON.parse(content.slice(STUDIO_SENTINEL.length).trim()); }
  catch { throw new HttpError(400, 'Studio content is not valid JSON.', 'VALIDATION_ERROR'); }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { blocks?: unknown }).blocks)) {
    throw new HttpError(400, 'Studio content must contain a blocks array.', 'VALIDATION_ERROR');
  }
  const doc = sanitizeStudioHtml(parsed) as Record<string, unknown>;
  const code = { ...((doc.code as Record<string, unknown>) || {}) };
  if (!STUDIO_JS_ROLES.includes(actorRole)) {
    code.js = '';
    code.headerScript = '';
    code.footerScript = '';
  }
  code.enabled = code.enabled === true;
  doc.code = code;
  const serialized = `${STUDIO_SENTINEL}\n${JSON.stringify(doc)}`;
  if (serialized.length > STUDIO_DOC_MAX) throw new HttpError(400, 'The studio document is too large to store.', 'VALIDATION_ERROR');
  return { isStudio: true, serialized, plain: plainText(doc.blocks).join('\n\n') };
}