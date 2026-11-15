/* DrawSpace Blog Studio content model.
   A studio document is stored in blog_posts.content as sentinel-prefixed JSON.
   Legacy posts keep plain paragraph text and render unchanged. */

export const STUDIO_SENTINEL = 'DS-STUDIO-1';

export type BlockType =
  | 'paragraph' | 'heading' | 'quote' | 'list' | 'code' | 'table'
  | 'image' | 'gallery' | 'video' | 'embed' | 'separator' | 'spacer'
  | 'callout' | 'html' | 'buttons' | 'columns'
  | 'hero' | 'features' | 'card' | 'author' | 'toc' | 'newsletter' | 'cta' | 'related';

interface Base { id: string; type: BlockType }

export interface ParagraphBlock extends Base { type: 'paragraph'; html: string; align: 'start' | 'center' | 'end' }
export interface HeadingBlock extends Base { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string; align: 'start' | 'center' | 'end' }
export interface QuoteBlock extends Base { type: 'quote'; text: string; cite: string }
export interface ListBlock extends Base { type: 'list'; ordered: boolean; items: string[] }
export interface CodeBlock extends Base { type: 'code'; language: string; code: string }
export interface TableBlock extends Base { type: 'table'; header: boolean; rows: string[][] }
export interface ImageBlock extends Base { type: 'image'; src: string; alt: string; caption: string; width: number }
export interface GalleryBlock extends Base { type: 'gallery'; columns: 2 | 3; images: { src: string; alt: string; caption: string }[] }
export interface VideoBlock extends Base { type: 'video'; url: string; caption: string }
export interface EmbedBlock extends Base { type: 'embed'; html: string; height: number }
export interface SeparatorBlock extends Base { type: 'separator'; style: 'line' | 'dots' | 'space' }
export interface SpacerBlock extends Base { type: 'spacer'; height: number }
export interface CalloutBlock extends Base { type: 'callout'; tone: 'info' | 'tip' | 'warning' | 'success'; title: string; html: string }
export interface HtmlBlock extends Base { type: 'html'; html: string }
export interface ButtonsBlock extends Base { type: 'buttons'; align: 'start' | 'center' | 'end'; items: { label: string; href: string; variant: 'primary' | 'secondary' | 'ghost' }[] }
export interface ColumnsBlock extends Base { type: 'columns'; count: 2 | 3; children: Block[][] }
export interface HeroBlock extends Base { type: 'hero'; eyebrow: string; title: string; subtitle: string; align: 'start' | 'center'; bg: string; image: string }
export interface FeaturesBlock extends Base { type: 'features'; columns: 2 | 3; items: { icon: string; title: string; body: string }[] }
export interface CardBlock extends Base { type: 'card'; title: string; html: string; accent: boolean }
export interface AuthorBlock extends Base { type: 'author'; name: string; bio: string; avatar: string }
export interface TocBlock extends Base { type: 'toc'; title: string }
export interface NewsletterBlock extends Base { type: 'newsletter'; title: string; body: string; buttonLabel: string; href: string }
export interface CtaBlock extends Base { type: 'cta'; title: string; body: string; buttonLabel: string; href: string; variant: 'primary' | 'secondary' }
export interface RelatedBlock extends Base { type: 'related'; title: string; limit: number }

export type Block =
  | ParagraphBlock | HeadingBlock | QuoteBlock | ListBlock | CodeBlock | TableBlock
  | ImageBlock | GalleryBlock | VideoBlock | EmbedBlock | SeparatorBlock | SpacerBlock
  | CalloutBlock | HtmlBlock | ButtonsBlock | ColumnsBlock
  | HeroBlock | FeaturesBlock | CardBlock | AuthorBlock | TocBlock | NewsletterBlock | CtaBlock | RelatedBlock;

export interface TypographyDesign {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  textColor: string;
  headingFamily: string;
  headingWeight: number;
  headingColor: string;
}
export interface LayoutDesign {
  contentWidth: number;
  sectionSpacing: number;
  padding: number;
  radius: number;
  shadow: 'none' | 'soft' | 'strong';
  align: 'start' | 'center';
  fullWidth: boolean;
}
export interface ColorDesign {
  background: string;
  gradient: string;
  backgroundImage: string;
  sectionBackground: string;
  borderColor: string;
  accent: string;
}
export interface DesignConfig {
  preset: string;
  typography: TypographyDesign;
  layout: LayoutDesign;
  colors: ColorDesign;
}
export interface CodeConfig {
  enabled: boolean;
  html: string;
  css: string;
  js: string;
  headerScript: string;
  footerScript: string;
  placement: 'post' | 'header' | 'footer' | 'section';
  height: number;
}
export interface StudioMeta { canonical: string; ogImage: string }
export interface StudioDoc {
  version: 1;
  blocks: Block[];
  design: DesignConfig;
  code: CodeConfig;
  meta?: StudioMeta;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const defaultDesign = (): DesignConfig => ({
  preset: 'cinematic',
  typography: {
    fontFamily: 'Inter', fontSize: 17, fontWeight: 400, lineHeight: 1.75, letterSpacing: 0,
    textColor: '', headingFamily: 'Manrope', headingWeight: 800, headingColor: '',
  },
  layout: { contentWidth: 720, sectionSpacing: 28, padding: 0, radius: 12, shadow: 'none', align: 'start', fullWidth: false },
  colors: { background: '', gradient: '', backgroundImage: '', sectionBackground: '', borderColor: '', accent: '#06b6d4' },
});

export const defaultCode = (): CodeConfig => ({
  enabled: false, html: '', css: '', js: '', headerScript: '', footerScript: '', placement: 'post', height: 320,
});

export const defaultMeta = (): StudioMeta => ({ canonical: '', ogImage: '' });

export const emptyDoc = (): StudioDoc => ({ version: 1, blocks: [], design: defaultDesign(), code: defaultCode(), meta: defaultMeta() });

export function newBlock(type: BlockType): Block {
  const id = uid();
  switch (type) {
    case 'paragraph': return { id, type, html: '', align: 'start' };
    case 'heading': return { id, type, level: 2, text: '', align: 'start' };
    case 'quote': return { id, type, text: '', cite: '' };
    case 'list': return { id, type, ordered: false, items: [''] };
    case 'code': return { id, type, language: 'ts', code: '' };
    case 'table': return { id, type, header: true, rows: [['', ''], ['', '']] };
    case 'image': return { id, type, src: '', alt: '', caption: '', width: 100 };
    case 'gallery': return { id, type, columns: 3, images: [] };
    case 'video': return { id, type, url: '', caption: '' };
    case 'embed': return { id, type, html: '', height: 320 };
    case 'separator': return { id, type, style: 'line' };
    case 'spacer': return { id, type, height: 32 };
    case 'callout': return { id, type, tone: 'info', title: '', html: '' };
    case 'html': return { id, type, html: '' };
    case 'buttons': return { id, type, align: 'start', items: [{ label: 'Click me', href: '#', variant: 'primary' }] };
    case 'columns': return { id, type, count: 2, children: [[], []] };
    case 'hero': return { id, type, eyebrow: '', title: '', subtitle: '', align: 'center', bg: '', image: '' };
    case 'features': return { id, type, columns: 3, items: [{ icon: 'spark', title: '', body: '' }] };
    case 'card': return { id, type, title: '', html: '', accent: false };
    case 'author': return { id, type, name: '', bio: '', avatar: '' };
    case 'toc': return { id, type, title: 'On this page' };
    case 'newsletter': return { id, type, title: 'Stay in the loop', body: '', buttonLabel: 'Subscribe', href: '' };
    case 'cta': return { id, type, title: '', body: '', buttonLabel: 'Play now', href: '/play', variant: 'primary' };
    case 'related': return { id, type, title: 'Related articles', limit: 3 };
  }
}

/* Serialize / parse the studio document against the legacy content column. */
export function serializeDoc(doc: StudioDoc): string {
  return `${STUDIO_SENTINEL}\n${JSON.stringify(doc)}`;
}
export function parseDoc(content: string): StudioDoc | null {
  if (!content.startsWith(STUDIO_SENTINEL)) return null;
  try {
    const parsed = JSON.parse(content.slice(STUDIO_SENTINEL.length).trim()) as StudioDoc;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.blocks)) {
      const base = defaultDesign();
      const design: DesignConfig = {
        ...base,
        ...parsed.design,
        typography: { ...base.typography, ...parsed.design?.typography },
        layout: { ...base.layout, ...parsed.design?.layout },
        colors: { ...base.colors, ...parsed.design?.colors },
      };
      return { version: 1, blocks: parsed.blocks, design, code: { ...defaultCode(), ...parsed.code }, meta: { ...defaultMeta(), ...parsed.meta } };
    }
    return null;
  } catch { return null; }
}
export function legacyToDoc(content: string): StudioDoc {
  const doc = emptyDoc();
  doc.blocks = content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
    .map((text) => ({ id: uid(), type: 'paragraph', html: escapeHtml(text), align: 'start' }) as ParagraphBlock);
  return doc;
}
export function docToPlainText(doc: StudioDoc): string {
  const parts: string[] = [];
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.type === 'paragraph' || b.type === 'callout' || b.type === 'card') parts.push(stripHtml(b.html));
      else if (b.type === 'heading') parts.push(b.text);
      else if (b.type === 'quote') parts.push(b.text);
      else if (b.type === 'list') parts.push(b.items.join('\n'));
      else if (b.type === 'columns') b.children.forEach(walk);
      else if (b.type === 'hero') parts.push([b.title, b.subtitle].filter(Boolean).join('\n'));
      else if (b.type === 'cta' || b.type === 'newsletter') parts.push([b.title, b.body].filter(Boolean).join('\n'));
    }
  };
  walk(doc.blocks);
  return parts.filter(Boolean).join('\n\n');
}
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ---------- Design presets ---------- */
export interface Preset { id: string; name: string; design: DesignConfig }
const preset = (id: string, name: string, over: Partial<DesignConfig>): Preset => ({
  id, name, design: { ...defaultDesign(), ...over, typography: { ...defaultDesign().typography, ...over.typography }, layout: { ...defaultDesign().layout, ...over.layout }, colors: { ...defaultDesign().colors, ...over.colors } },
});
export const PRESETS: Preset[] = [
  preset('cinematic', 'Cinematic Dark', {}),
  preset('editorial', 'Editorial Light', {
    typography: { fontFamily: 'Georgia', fontSize: 18, fontWeight: 400, lineHeight: 1.8, letterSpacing: 0, textColor: '#18181b', headingFamily: 'Manrope', headingWeight: 800, headingColor: '#09090b' },
    colors: { background: '#fafafa', gradient: '', backgroundImage: '', sectionBackground: '#ffffff', borderColor: '#e4e4e7', accent: '#0891b2' },
    layout: { contentWidth: 680, sectionSpacing: 26, padding: 32, radius: 8, shadow: 'soft', align: 'start', fullWidth: false },
  }),
  preset('magazine', 'Magazine', {
    typography: { fontFamily: 'Inter', fontSize: 17, fontWeight: 400, lineHeight: 1.7, letterSpacing: 0, textColor: '', headingFamily: 'Manrope', headingWeight: 800, headingColor: '' },
    layout: { contentWidth: 860, sectionSpacing: 34, padding: 0, radius: 14, shadow: 'soft', align: 'start', fullWidth: false },
    colors: { background: '', gradient: 'linear-gradient(180deg, rgba(6,182,212,0.10), transparent 320px)', backgroundImage: '', sectionBackground: '', borderColor: '', accent: '#06b6d4' },
  }),
  preset('minimal', 'Minimal', {
    typography: { fontFamily: 'Inter', fontSize: 16, fontWeight: 400, lineHeight: 1.7, letterSpacing: 0, textColor: '', headingFamily: 'Inter', headingWeight: 600, headingColor: '' },
    layout: { contentWidth: 620, sectionSpacing: 20, padding: 0, radius: 0, shadow: 'none', align: 'start', fullWidth: false },
    colors: { background: '', gradient: '', backgroundImage: '', sectionBackground: '', borderColor: '', accent: '#a1a1aa' },
  }),
  preset('neon', 'Neon Space', {
    typography: { fontFamily: 'Inter', fontSize: 17, fontWeight: 400, lineHeight: 1.75, letterSpacing: 0, textColor: '#e4e4e7', headingFamily: 'Manrope', headingWeight: 800, headingColor: '#fafafa' },
    colors: { background: '#080808', gradient: 'radial-gradient(600px 300px at 20% 0%, rgba(6,182,212,0.16), transparent), radial-gradient(500px 260px at 90% 10%, rgba(168,85,247,0.12), transparent)', backgroundImage: '', sectionBackground: 'rgba(255,255,255,0.03)', borderColor: 'rgba(6,182,212,0.35)', accent: '#22d3ee' },
    layout: { contentWidth: 760, sectionSpacing: 30, padding: 24, radius: 16, shadow: 'strong', align: 'start', fullWidth: false },
  }),
];

/* ---------- Built-in templates ---------- */
export interface Template { id: string; name: string; description: string; doc: StudioDoc }
const b = (type: BlockType, over: Record<string, unknown> = {}): Block => ({ ...newBlock(type), ...over } as Block);
export const BUILT_IN_TEMPLATES: Template[] = [
  { id: 'standard', name: 'Standard article', description: 'Title, intro, body, callout and conclusion.', doc: { version: 1, design: defaultDesign(), code: defaultCode(), blocks: [
    b('heading', { level: 2, text: 'Introduction' }), b('paragraph', { html: 'Open with a short, clear introduction.' }),
    b('heading', { level: 2, text: 'Main section' }), b('paragraph', { html: 'Develop the idea here.' }),
    b('callout', { tone: 'tip', title: 'Tip', html: 'Add a useful tip for readers.' }),
    b('heading', { level: 2, text: 'Conclusion' }), b('paragraph', { html: 'Wrap up with a takeaway.' }),
  ] } },
  { id: 'magazine', name: 'Magazine', description: 'Hero, columns and pull quote.', doc: { version: 1, design: PRESETS[2].design, code: defaultCode(), blocks: [
    b('hero', { eyebrow: 'Feature', title: 'A magazine headline', subtitle: 'A standfirst that sets the scene.', align: 'center' }),
    b('columns', { count: 2, children: [[b('paragraph', { html: 'Left column text.' })], [b('paragraph', { html: 'Right column text.' })]] }),
    b('quote', { text: 'A memorable pull quote.', cite: 'Author' }),
    b('paragraph', { html: 'Closing paragraph.' }),
  ] } },
  { id: 'tutorial', name: 'Tutorial', description: 'Steps, code and warnings.', doc: { version: 1, design: defaultDesign(), code: defaultCode(), blocks: [
    b('heading', { level: 2, text: 'What you will learn' }), b('list', { ordered: false, items: ['Goal one', 'Goal two'] }),
    b('heading', { level: 2, text: 'Step 1' }), b('paragraph', { html: 'Explain the first step.' }),
    b('code', { language: 'ts', code: 'const example = true;' }),
    b('callout', { tone: 'warning', title: 'Careful', html: 'Note a common pitfall.' }),
    b('heading', { level: 2, text: 'Step 2' }), b('paragraph', { html: 'Explain the second step.' }),
  ] } },
  { id: 'news', name: 'News', description: 'Lead, facts and source.', doc: { version: 1, design: PRESETS[3].design, code: defaultCode(), blocks: [
    b('paragraph', { html: 'The lead: who, what, when, where.' }),
    b('heading', { level: 2, text: 'Details' }), b('paragraph', { html: 'Supporting facts.' }),
    b('quote', { text: 'An official statement.', cite: 'Source' }),
  ] } },
  { id: 'review', name: 'Review', description: 'Verdict, pros and cons, score.', doc: { version: 1, design: defaultDesign(), code: defaultCode(), blocks: [
    b('heading', { level: 2, text: 'Verdict' }), b('paragraph', { html: 'Summarize the review.' }),
    b('columns', { count: 2, children: [[b('callout', { tone: 'success', title: 'Pros', html: 'What works.' })], [b('callout', { tone: 'warning', title: 'Cons', html: 'What does not.' })]] }),
    b('card', { title: 'Score', html: '8 / 10', accent: true }),
  ] } },
  { id: 'announcement', name: 'Announcement', description: 'Hero, highlights and CTA.', doc: { version: 1, design: PRESETS[4].design, code: defaultCode(), blocks: [
    b('hero', { eyebrow: 'Announcement', title: 'Something new is here', subtitle: 'One line about the release.', align: 'center' }),
    b('features', { columns: 3, items: [{ icon: 'spark', title: 'Highlight', body: 'Short benefit.' }, { icon: 'bolt', title: 'Highlight', body: 'Short benefit.' }, { icon: 'star', title: 'Highlight', body: 'Short benefit.' }] }),
    b('cta', { title: 'Try it now', body: 'Jump straight in.', buttonLabel: 'Play now', href: '/play', variant: 'primary' }),
  ] } },
  { id: 'image-focused', name: 'Image focused', description: 'Gallery-led visual story.', doc: { version: 1, design: PRESETS[2].design, code: defaultCode(), blocks: [
    b('image', { src: '', alt: 'Lead image', caption: 'A strong opening image.', width: 100 }),
    b('paragraph', { html: 'Brief context.' }),
    b('gallery', { columns: 3, images: [] }),
    b('paragraph', { html: 'Closing thought.' }),
  ] } },
  { id: 'minimal', name: 'Minimal', description: 'Just the words.', doc: { version: 1, design: PRESETS[3].design, code: defaultCode(), blocks: [
    b('paragraph', { html: 'First paragraph.' }), b('paragraph', { html: 'Second paragraph.' }), b('paragraph', { html: 'Third paragraph.' }),
  ] } },
];