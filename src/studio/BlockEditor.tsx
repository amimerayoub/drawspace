/* Per-block editing cards + drag-drop block list, shared by the studio center panel. */
import { useState, type DragEvent, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, Code2, Columns2, Copy, FileCode, Globe, GripVertical, Heading, Image as ImageIcon,
  Images, Info, LayoutGrid, LayoutTemplate, List, ListTree, Mail, Megaphone, Minus, MousePointerClick,
  MoveVertical, Newspaper, Plus, Quote, Square, Table, Trash2, Type, UserRound, Video, X, type LucideIcon,
} from 'lucide-react';
import { Button, Field, Input, NativeSelect, Segmented, Switch, Textarea } from '@/components/ui';
import { newBlock, uid, type Block, type BlockType } from './types';
import { RichText } from './RichText';

export type MediaTarget =
  | { kind: 'image'; blockId: string }
  | { kind: 'gallery'; blockId: string; index: number }
  | { kind: 'hero'; blockId: string }
  | { kind: 'avatar'; blockId: string }
  | { kind: 'cover' }
  | { kind: 'design-bg' }
  | { kind: 'og' };

export const BLOCK_META: Record<BlockType, { label: string; icon: LucideIcon; group: 'text' | 'media' | 'layout' | 'components' }> = {
  paragraph: { label: 'Paragraph', icon: Type, group: 'text' },
  heading: { label: 'Heading', icon: Heading, group: 'text' },
  quote: { label: 'Quote', icon: Quote, group: 'text' },
  list: { label: 'List', icon: List, group: 'text' },
  code: { label: 'Code', icon: Code2, group: 'text' },
  table: { label: 'Table', icon: Table, group: 'text' },
  image: { label: 'Image', icon: ImageIcon, group: 'media' },
  gallery: { label: 'Gallery', icon: Images, group: 'media' },
  video: { label: 'Video', icon: Video, group: 'media' },
  embed: { label: 'Embed', icon: Globe, group: 'media' },
  separator: { label: 'Separator', icon: Minus, group: 'layout' },
  spacer: { label: 'Spacer', icon: MoveVertical, group: 'layout' },
  callout: { label: 'Callout', icon: Info, group: 'components' },
  html: { label: 'Custom HTML', icon: FileCode, group: 'layout' },
  buttons: { label: 'Buttons', icon: MousePointerClick, group: 'components' },
  columns: { label: 'Columns', icon: Columns2, group: 'layout' },
  hero: { label: 'Hero', icon: LayoutTemplate, group: 'components' },
  features: { label: 'Features', icon: LayoutGrid, group: 'components' },
  card: { label: 'Card', icon: Square, group: 'components' },
  author: { label: 'Author', icon: UserRound, group: 'components' },
  toc: { label: 'Table of contents', icon: ListTree, group: 'components' },
  newsletter: { label: 'Newsletter', icon: Mail, group: 'components' },
  cta: { label: 'Call to action', icon: Megaphone, group: 'components' },
  related: { label: 'Related posts', icon: Newspaper, group: 'components' },
};

const ALIGN_OPTIONS = [{ value: 'start', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'end', label: 'Right' }] as const;
const LANGUAGES = ['ts', 'js', 'py', 'bash', 'sql', 'css', 'html', 'json', 'text'];
const FEATURE_ICON_NAMES = ['spark', 'bolt', 'star', 'heart', 'shield', 'globe', 'code', 'pen', 'check', 'rocket', 'trophy', 'users'];

function AlignSeg({ value, onChange }: { value: 'start' | 'center' | 'end'; onChange: (v: 'start' | 'center' | 'end') => void }) {
  return <Segmented options={[...ALIGN_OPTIONS]} value={value} onChange={onChange} label="Alignment" />;
}

function RowEditor({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <div className="st-row-editor">
      <div className="st-row-fields">{children}</div>
      <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={onRemove} aria-label="Remove item" />
    </div>
  );
}

export function BlockEditor({ block, selected, depth = 0, onSelect, onChange, onDelete, onDuplicate, onMove, onPickMedia }: {
  block: Block; selected: boolean; depth?: number;
  onSelect: () => void; onChange: (block: Block) => void; onDelete: () => void; onDuplicate: () => void;
  onMove: (delta: number) => void; onPickMedia: (target: MediaTarget) => void;
}) {
  const meta = BLOCK_META[block.type];
  const patch = (partial: Partial<Block>) => onChange({ ...block, ...partial } as Block);

  const body = () => {
    switch (block.type) {
      case 'paragraph':
        return (
          <>
            <RichText value={block.html} onChange={(html) => patch({ html })} />
            <AlignSeg value={block.align} onChange={(align) => patch({ align })} />
          </>
        );
      case 'heading':
        return (
          <>
            <div className="st-field-row">
              <Field label="Level" htmlFor={`h-l-${block.id}`}>
                <NativeSelect id={`h-l-${block.id}`} value={block.level} onChange={(e) => patch({ level: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6 })}>
                  {[1, 2, 3, 4, 5, 6].map((l) => <option key={l} value={l}>H{l}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Text" htmlFor={`h-t-${block.id}`}>
                <Input id={`h-t-${block.id}`} value={block.text} onChange={(e) => patch({ text: e.target.value })} placeholder="Section heading" />
              </Field>
            </div>
            <AlignSeg value={block.align} onChange={(align) => patch({ align })} />
          </>
        );
      case 'quote':
        return (
          <>
            <Textarea value={block.text} onChange={(e) => patch({ text: e.target.value })} rows={2} placeholder="Quotation" aria-label="Quote text" />
            <Input value={block.cite} onChange={(e) => patch({ cite: e.target.value })} placeholder="Attribution (optional)" aria-label="Quote attribution" />
          </>
        );
      case 'list':
        return (
          <>
            <Switch checked={block.ordered} onChange={(ordered) => patch({ ordered })} label="Numbered list" />
            <Textarea value={block.items.join('\n')} onChange={(e) => patch({ items: e.target.value.split('\n') })} rows={4} placeholder={'One item per line'} aria-label="List items" />
          </>
        );
      case 'code':
        return (
          <>
            <Field label="Language" htmlFor={`c-l-${block.id}`}>
              <NativeSelect id={`c-l-${block.id}`} value={block.language} onChange={(e) => patch({ language: e.target.value })}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </NativeSelect>
            </Field>
            <Textarea className="mono" value={block.code} onChange={(e) => patch({ code: e.target.value })} rows={6} placeholder="Paste code…" aria-label="Code" spellCheck={false} />
          </>
        );
      case 'table': {
        const cols = Math.max(1, ...block.rows.map((r) => r.length));
        const setCell = (r: number, c: number, value: string) => {
          const rows = block.rows.map((row) => [...row]);
          while (rows[r].length < cols) rows[r].push('');
          rows[r][c] = value;
          patch({ rows });
        };
        const addRow = () => patch({ rows: [...block.rows, Array(cols).fill('')] });
        const addCol = () => patch({ rows: block.rows.map((row) => [...row, '']) });
        const removeRow = (r: number) => patch({ rows: block.rows.filter((_, i) => i !== r) });
        const removeCol = (c: number) => patch({ rows: block.rows.map((row) => row.filter((_, i) => i !== c)) });
        return (
          <>
            <div className="st-table-tools">
              <Switch checked={block.header} onChange={(header) => patch({ header })} label="Header row" />
              <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={addRow}>Row</Button>
              <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={addCol}>Column</Button>
            </div>
            <div className="st-table-edit">
              {block.rows.map((row, r) => (
                <div key={r} className="st-table-edit-row">
                  {Array.from({ length: cols }, (_, c) => (
                    <input key={c} value={row[c] ?? ''} onChange={(e) => setCell(r, c, e.target.value)} aria-label={`Row ${r + 1} column ${c + 1}`} placeholder={r === 0 && block.header ? `Header ${c + 1}` : ''} />
                  ))}
                  <button type="button" className="st-mini-x" onClick={() => removeRow(r)} aria-label={`Remove row ${r + 1}`} disabled={block.rows.length <= 1}><X size={11} /></button>
                </div>
              ))}
              <div className="st-table-edit-row st-table-col-tools">
                {Array.from({ length: cols }, (_, c) => (
                  <button key={c} type="button" className="st-mini-x" onClick={() => removeCol(c)} aria-label={`Remove column ${c + 1}`} disabled={cols <= 1}><X size={11} /></button>
                ))}
              </div>
            </div>
          </>
        );
      }
      case 'image':
        return (
          <>
            <div className="st-field-row">
              <Field label="Image URL" htmlFor={`i-s-${block.id}`}>
                <Input id={`i-s-${block.id}`} value={block.src} onChange={(e) => patch({ src: e.target.value })} placeholder="https://… or pick from media" />
              </Field>
              <Button size="sm" variant="secondary" icon={<ImageIcon size={13} />} onClick={() => onPickMedia({ kind: 'image', blockId: block.id })}>Media</Button>
            </div>
            <div className="st-field-row">
              <Field label="Alt text" htmlFor={`i-a-${block.id}`}>
                <Input id={`i-a-${block.id}`} value={block.alt} onChange={(e) => patch({ alt: e.target.value })} />
              </Field>
              <Field label="Caption" htmlFor={`i-c-${block.id}`}>
                <Input id={`i-c-${block.id}`} value={block.caption} onChange={(e) => patch({ caption: e.target.value })} />
              </Field>
            </div>
            <Field label={`Width: ${block.width}%`} htmlFor={`i-w-${block.id}`}>
              <input id={`i-w-${block.id}`} type="range" min={20} max={100} step={5} value={block.width} onChange={(e) => patch({ width: Number(e.target.value) })} />
            </Field>
          </>
        );
      case 'gallery':
        return (
          <>
            <Segmented options={[{ value: '2', label: '2 columns' }, { value: '3', label: '3 columns' }]} value={String(block.columns) as '2' | '3'} onChange={(v) => patch({ columns: Number(v) as 2 | 3 })} label="Gallery columns" />
            {block.images.map((img, i) => (
              <RowEditor key={i} onRemove={() => patch({ images: block.images.filter((_, j) => j !== i) })}>
                <div className="st-field-row">
                  <Input value={img.src} onChange={(e) => patch({ images: block.images.map((x, j) => j === i ? { ...x, src: e.target.value } : x) })} placeholder="Image URL" aria-label={`Gallery image ${i + 1} URL`} />
                  <Button size="sm" variant="ghost" icon={<ImageIcon size={13} />} onClick={() => onPickMedia({ kind: 'gallery', blockId: block.id, index: i })} aria-label="Pick from media" />
                </div>
                <div className="st-field-row">
                  <Input value={img.alt} onChange={(e) => patch({ images: block.images.map((x, j) => j === i ? { ...x, alt: e.target.value } : x) })} placeholder="Alt text" aria-label={`Gallery image ${i + 1} alt`} />
                  <Input value={img.caption} onChange={(e) => patch({ images: block.images.map((x, j) => j === i ? { ...x, caption: e.target.value } : x) })} placeholder="Caption" aria-label={`Gallery image ${i + 1} caption`} />
                </div>
              </RowEditor>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => patch({ images: [...block.images, { src: '', alt: '', caption: '' }] })}>Add image</Button>
          </>
        );
      case 'video':
        return (
          <>
            <Input value={block.url} onChange={(e) => patch({ url: e.target.value })} placeholder="YouTube, Vimeo or .mp4 URL" aria-label="Video URL" />
            <Input value={block.caption} onChange={(e) => patch({ caption: e.target.value })} placeholder="Caption (optional)" aria-label="Video caption" />
          </>
        );
      case 'embed':
        return (
          <>
            <Textarea className="mono" value={block.html} onChange={(e) => patch({ html: e.target.value })} rows={4} placeholder='<iframe src="https://www.youtube.com/embed/…"></iframe>' aria-label="Embed HTML" spellCheck={false} />
            <Field label="Min height (px)" htmlFor={`e-h-${block.id}`}>
              <Input id={`e-h-${block.id}`} type="number" min={120} max={1200} value={block.height} onChange={(e) => patch({ height: Math.max(120, Math.min(1200, Number(e.target.value) || 320)) })} />
            </Field>
            <p className="faint st-note">Only whitelisted embed hosts run: YouTube, Vimeo, Spotify, Codepen. Scripts are stripped.</p>
          </>
        );
      case 'separator':
        return <Segmented options={[{ value: 'line', label: 'Line' }, { value: 'dots', label: 'Dots' }, { value: 'space', label: 'Space' }]} value={block.style} onChange={(style) => patch({ style })} label="Separator style" />;
      case 'spacer':
        return (
          <Field label={`Height: ${block.height}px`} htmlFor={`sp-${block.id}`}>
            <input id={`sp-${block.id}`} type="range" min={8} max={200} step={4} value={block.height} onChange={(e) => patch({ height: Number(e.target.value) })} />
          </Field>
        );
      case 'callout':
        return (
          <>
            <div className="st-field-row">
              <Field label="Tone" htmlFor={`co-t-${block.id}`}>
                <NativeSelect id={`co-t-${block.id}`} value={block.tone} onChange={(e) => patch({ tone: e.target.value as 'info' | 'tip' | 'warning' | 'success' })}>
                  {['info', 'tip', 'warning', 'success'].map((t) => <option key={t} value={t}>{t}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Title" htmlFor={`co-i-${block.id}`}>
                <Input id={`co-i-${block.id}`} value={block.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Good to know" />
              </Field>
            </div>
            <RichText value={block.html} onChange={(html) => patch({ html })} minHeight={44} />
          </>
        );
      case 'html':
        return (
          <>
            <Textarea className="mono" value={block.html} onChange={(e) => patch({ html: e.target.value })} rows={6} placeholder="<div>…</div>" aria-label="Custom HTML" spellCheck={false} />
            <p className="faint st-note">Sanitized on save and on render. Scripts, forms and event handlers are removed.</p>
          </>
        );
      case 'buttons':
        return (
          <>
            <AlignSeg value={block.align} onChange={(align) => patch({ align })} />
            {block.items.map((item, i) => (
              <RowEditor key={i} onRemove={() => patch({ items: block.items.filter((_, j) => j !== i) })}>
                <div className="st-field-row">
                  <Input value={item.label} onChange={(e) => patch({ items: block.items.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} placeholder="Label" aria-label={`Button ${i + 1} label`} />
                  <Input value={item.href} onChange={(e) => patch({ items: block.items.map((x, j) => j === i ? { ...x, href: e.target.value } : x) })} placeholder="/play or https://…" aria-label={`Button ${i + 1} link`} />
                  <NativeSelect value={item.variant} onChange={(e) => patch({ items: block.items.map((x, j) => j === i ? { ...x, variant: e.target.value as 'primary' | 'secondary' | 'ghost' } : x) })} aria-label={`Button ${i + 1} style`}>
                    <option value="primary">Primary</option><option value="secondary">Secondary</option><option value="ghost">Ghost</option>
                  </NativeSelect>
                </div>
              </RowEditor>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => patch({ items: [...block.items, { label: 'Button', href: '#', variant: 'secondary' }] })}>Add button</Button>
          </>
        );
      case 'columns':
        return (
          <>
            <Segmented options={[{ value: '2', label: '2 columns' }, { value: '3', label: '3 columns' }]} value={String(block.count) as '2' | '3'} onChange={(v) => { const count = Number(v) as 2 | 3; const children = [...block.children]; while (children.length < count) children.push([]); patch({ count, children: children.slice(0, count) }); }} label="Column count" />
            <div className={`st-columns st-columns-${block.count} st-columns-edit`}>
              {block.children.slice(0, block.count).map((child, i) => (
                <div key={i} className="st-column-edit">
                  <span className="faint st-column-label">Column {i + 1}</span>
                  <BlockList blocks={child} depth={depth + 1} onChange={(children) => patch({ children: block.children.map((c, j) => j === i ? children : c) })} onPickMedia={onPickMedia} />
                </div>
              ))}
            </div>
          </>
        );
      case 'hero':
        return (
          <>
            <Input value={block.eyebrow} onChange={(e) => patch({ eyebrow: e.target.value })} placeholder="Eyebrow (e.g. Feature)" aria-label="Hero eyebrow" />
            <Input value={block.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Hero title" aria-label="Hero title" />
            <Textarea value={block.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} rows={2} placeholder="Subtitle" aria-label="Hero subtitle" />
            <div className="st-field-row">
              <Segmented options={[{ value: 'start', label: 'Left' }, { value: 'center', label: 'Center' }]} value={block.align} onChange={(align) => patch({ align })} label="Hero alignment" />
              <Field label="Background" htmlFor={`he-b-${block.id}`}>
                <Input id={`he-b-${block.id}`} type="color" value={block.bg || '#101014'} onChange={(e) => patch({ bg: e.target.value })} />
              </Field>
              <Button size="sm" variant="secondary" icon={<ImageIcon size={13} />} onClick={() => onPickMedia({ kind: 'hero', blockId: block.id })}>Image</Button>
            </div>
          </>
        );
      case 'features':
        return (
          <>
            <Segmented options={[{ value: '2', label: '2 columns' }, { value: '3', label: '3 columns' }]} value={String(block.columns) as '2' | '3'} onChange={(v) => patch({ columns: Number(v) as 2 | 3 })} label="Feature columns" />
            {block.items.map((item, i) => (
              <RowEditor key={i} onRemove={() => patch({ items: block.items.filter((_, j) => j !== i) })}>
                <div className="st-field-row">
                  <NativeSelect value={item.icon} onChange={(e) => patch({ items: block.items.map((x, j) => j === i ? { ...x, icon: e.target.value } : x) })} aria-label={`Feature ${i + 1} icon`}>
                    {FEATURE_ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </NativeSelect>
                  <Input value={item.title} onChange={(e) => patch({ items: block.items.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} placeholder="Title" aria-label={`Feature ${i + 1} title`} />
                </div>
                <Input value={item.body} onChange={(e) => patch({ items: block.items.map((x, j) => j === i ? { ...x, body: e.target.value } : x) })} placeholder="Short description" aria-label={`Feature ${i + 1} body`} />
              </RowEditor>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => patch({ items: [...block.items, { icon: 'spark', title: '', body: '' }] })}>Add feature</Button>
          </>
        );
      case 'card':
        return (
          <>
            <Input value={block.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Card title" aria-label="Card title" />
            <RichText value={block.html} onChange={(html) => patch({ html })} minHeight={44} />
            <Switch checked={block.accent} onChange={(accent) => patch({ accent })} label="Accent border" />
          </>
        );
      case 'author':
        return (
          <>
            <div className="st-field-row">
              <Input value={block.name} onChange={(e) => patch({ name: e.target.value })} placeholder="Author name" aria-label="Author name" />
              <Button size="sm" variant="secondary" icon={<ImageIcon size={13} />} onClick={() => onPickMedia({ kind: 'avatar', blockId: block.id })}>Avatar</Button>
            </div>
            <Textarea value={block.bio} onChange={(e) => patch({ bio: e.target.value })} rows={2} placeholder="Short bio" aria-label="Author bio" />
            {block.avatar && <Input value={block.avatar} onChange={(e) => patch({ avatar: e.target.value })} aria-label="Avatar URL" />}
          </>
        );
      case 'toc':
        return (
          <>
            <Input value={block.title} onChange={(e) => patch({ title: e.target.value })} placeholder="On this page" aria-label="TOC title" />
            <p className="faint st-note">Links are generated from the heading blocks in this article.</p>
          </>
        );
      case 'newsletter':
        return (
          <>
            <Input value={block.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Title" aria-label="Newsletter title" />
            <Textarea value={block.body} onChange={(e) => patch({ body: e.target.value })} rows={2} placeholder="One line pitch" aria-label="Newsletter body" />
            <div className="st-field-row">
              <Input value={block.buttonLabel} onChange={(e) => patch({ buttonLabel: e.target.value })} placeholder="Button label" aria-label="Newsletter button label" />
              <Input value={block.href} onChange={(e) => patch({ href: e.target.value })} placeholder="Link (mailto: or URL)" aria-label="Newsletter link" />
            </div>
          </>
        );
      case 'cta':
        return (
          <>
            <Input value={block.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Title" aria-label="CTA title" />
            <Input value={block.body} onChange={(e) => patch({ body: e.target.value })} placeholder="Supporting line" aria-label="CTA body" />
            <div className="st-field-row">
              <Input value={block.buttonLabel} onChange={(e) => patch({ buttonLabel: e.target.value })} placeholder="Button label" aria-label="CTA button label" />
              <Input value={block.href} onChange={(e) => patch({ href: e.target.value })} placeholder="/play or https://…" aria-label="CTA link" />
              <NativeSelect value={block.variant} onChange={(e) => patch({ variant: e.target.value as 'primary' | 'secondary' })} aria-label="CTA style">
                <option value="primary">Primary</option><option value="secondary">Secondary</option>
              </NativeSelect>
            </div>
          </>
        );
      case 'related':
        return (
          <div className="st-field-row">
            <Field label="Title" htmlFor={`re-t-${block.id}`}>
              <Input id={`re-t-${block.id}`} value={block.title} onChange={(e) => patch({ title: e.target.value })} />
            </Field>
            <Field label="Max posts" htmlFor={`re-l-${block.id}`}>
              <Input id={`re-l-${block.id}`} type="number" min={1} max={6} value={block.limit} onChange={(e) => patch({ limit: Math.max(1, Math.min(6, Number(e.target.value) || 3)) })} />
            </Field>
          </div>
        );
    }
  };

  return (
    <div className={`st-block-card ${selected ? 'selected' : ''} ${depth > 0 ? 'nested' : ''}`} onClick={onSelect} data-block-id={block.id}>
      <div className="st-block-head">
        <span className="st-block-type"><meta.icon size={13} aria-hidden /> {meta.label}</span>
        <span className="st-block-actions">
          <button type="button" aria-label="Move up" onClick={(e) => { e.stopPropagation(); onMove(-1); }}><ArrowUp size={12} /></button>
          <button type="button" aria-label="Move down" onClick={(e) => { e.stopPropagation(); onMove(1); }}><ArrowDown size={12} /></button>
          <button type="button" aria-label="Duplicate block" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}><Copy size={12} /></button>
          <button type="button" aria-label="Delete block" className="danger" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 size={12} /></button>
        </span>
      </div>
      <div className="st-block-body" onClick={(e) => e.stopPropagation()}>{body()}</div>
    </div>
  );
}

/* Reorderable block list with an add-block control; used at root and inside columns. */
export function BlockList({ blocks, onChange, onPickMedia, depth = 0, selectedId, onSelect }: {
  blocks: Block[]; onChange: (blocks: Block[]) => void; onPickMedia: (target: MediaTarget) => void;
  depth?: number; selectedId?: string | null; onSelect?: (id: string) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= blocks.length || to > blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, item);
    onChange(next);
  };
  const handleDrop = (e: DragEvent, index: number) => {
    e.preventDefault();
    const newType = e.dataTransfer.getData('text/studio-new') as BlockType;
    if (newType && BLOCK_META[newType]) {
      const next = [...blocks];
      next.splice(index, 0, newBlock(newType));
      onChange(next);
    } else {
      const from = Number(e.dataTransfer.getData('text/studio-block'));
      if (Number.isInteger(from)) move(from, index);
    }
    setDragIndex(null); setOverIndex(null);
  };
  const addBlock = (type: BlockType) => onChange([...blocks, newBlock(type)]);
  const duplicate = (index: number) => {
    const copy = JSON.parse(JSON.stringify(blocks[index])) as Block;
    copy.id = uid();
    if (copy.type === 'columns') copy.children = copy.children.map((child) => child.map((b) => ({ ...b, id: uid() })));
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    onChange(next);
  };

  return (
    <div className={`st-block-list ${depth > 0 ? 'nested' : ''}`}>
      {blocks.map((block, index) => (
        <div
          key={block.id}
          className={`st-block-wrap ${overIndex === index && dragIndex !== null ? 'drop-target' : ''} ${dragIndex === index ? 'dragging' : ''}`}
          draggable
          onDragStart={(e) => { e.dataTransfer.setData('text/studio-block', String(index)); e.dataTransfer.effectAllowed = 'move'; setDragIndex(index); }}
          onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
          onDragOver={(e) => { e.preventDefault(); setOverIndex(index); }}
          onDrop={(e) => handleDrop(e, index)}
        >
          <span className="st-drag-handle" aria-hidden><GripVertical size={13} /></span>
          <BlockEditor
            block={block}
            selected={selectedId === block.id}
            depth={depth}
            onSelect={() => onSelect?.(block.id)}
            onChange={(updated) => onChange(blocks.map((b) => b.id === block.id ? updated : b))}
            onDelete={() => onChange(blocks.filter((b) => b.id !== block.id))}
            onDuplicate={() => duplicate(index)}
            onMove={(delta) => move(index, index + delta + (delta > 0 ? 1 : 0))}
            onPickMedia={onPickMedia}
          />
        </div>
      ))}
      <div
        className={`st-block-add ${overIndex === blocks.length && dragIndex !== null ? 'drop-target' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOverIndex(blocks.length); }}
        onDrop={(e) => handleDrop(e, blocks.length)}
      >
        <NativeSelect value="" onChange={(e) => { if (e.target.value) addBlock(e.target.value as BlockType); }} aria-label="Add block">
          <option value="">+ Add block…</option>
          {(['text', 'media', 'layout', 'components'] as const).map((group) => (
            <optgroup key={group} label={group}>
              {(Object.keys(BLOCK_META) as BlockType[]).filter((t) => BLOCK_META[t].group === group && (depth === 0 || t !== 'columns')).map((t) => (
                <option key={t} value={t}>{BLOCK_META[t].label}</option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}