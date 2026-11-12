import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Difficulty, Locale, Word } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { wordService } from '@/services';
import { uid } from '@/services/db';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, NativeSelect, Switch, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, useAdmin } from './shared';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const TRANSLATION_LOCALES: { locale: Locale; label: string }[] = [
  { locale: 'fr', label: 'French' }, { locale: 'es', label: 'Spanish' }, { locale: 'de', label: 'German' },
  { locale: 'ar', label: 'Arabic' }, { locale: 'pt-BR', label: 'Portuguese' }, { locale: 'ru', label: 'Russian' },
];

interface WordForm {
  text: string; difficulty: Difficulty; category: string; definition: string; hint: string;
  active: boolean; translations: Partial<Record<Locale, string>>;
}

const emptyForm: WordForm = { text: '', difficulty: 'easy', category: '', definition: '', hint: '', active: true, translations: {} };

export default function Words() {
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Word | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Word | null>(null);
  const [form, setForm] = useState<WordForm>(emptyForm);

  const open = (w: Word | 'new') => {
    setForm(w === 'new' ? emptyForm : {
      text: w.text, difficulty: w.difficulty, category: w.category, definition: w.definition,
      hint: w.hint, active: w.active, translations: { ...w.translations },
    });
    setEditing(w);
  };

  const save = () => {
    if (!form.text.trim()) { toast('The word cannot be empty.', 'error'); return; }
    if (!form.definition.trim()) { toast('Add a short definition. Players see it after each round.', 'error'); return; }
    const word: Word = {
      id: editing === 'new' ? uid('w') : (editing as Word).id,
      text: form.text.trim().toLowerCase(),
      difficulty: form.difficulty,
      category: form.category.trim() || 'general',
      definition: form.definition.trim(),
      hint: form.hint.trim(),
      active: form.active,
      translations: form.translations,
    };
    wordService.save(word, name);
    toast(editing === 'new' ? 'Word added to the bank.' : 'Word updated.', 'success');
    setEditing(null);
  };

  const columns: Column<Word>[] = [
    { key: 'text', header: 'Word', width: '22%', render: (w) => <span className="mono admin-word-text">{w.text}</span>, sortValue: (w) => w.text },
    { key: 'difficulty', header: 'Difficulty', render: (w) => <Badge tone={w.difficulty === 'hard' ? 'accent' : 'neutral'}>{w.difficulty}</Badge>, sortValue: (w) => w.difficulty },
    { key: 'category', header: 'Category', render: (w) => <span className="muted">{w.category}</span>, sortValue: (w) => w.category },
    { key: 'definition', header: 'Definition', width: '30%', render: (w) => <span className="muted admin-clamp">{w.definition}</span> },
    {
      key: 'active', header: 'In game', align: 'center',
      render: (w) => (
        <Switch checked={w.active} onChange={() => { wordService.toggle(w.id, name); toast(w.active ? `${w.text} removed from play.` : `${w.text} is now playable.`, 'success'); }} label={`Toggle ${w.text}`} />
      ),
      sortValue: (w) => (w.active ? 1 : 0),
    },
    {
      key: 'actions', header: '', align: 'end', width: '110px',
      render: (w) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => open(w)} aria-label={`Edit ${w.text}`} />
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(w)} aria-label={`Delete ${w.text}`} />
        </span>
      ),
    },
  ];

  const activeCount = db.words.filter((w) => w.active).length;

  return (
    <AdminPage
      title="Word bank"
      sub={`${db.words.length} words, ${activeCount} active. Gameplay words stay in English. Translations are used for hints only.`}
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={() => open('new')}>Add word</Button>}
    >
      <div className="panel">
        <DataTable
          columns={columns}
          rows={db.words}
          rowKey={(w) => w.id}
          searchable
          searchPlaceholder="Search word or category"
          searchLabel="Search words"
          searchValue={(w) => `${w.text} ${w.category} ${w.difficulty}`}
          pageSize={12}
          emptyTitle="No words match"
        />
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add word' : `Edit ${form.text}`} wide
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save word</Button>
        </>}>
        <div className="admin-form-grid">
          <Field label="Word" htmlFor="w-text" hint="English only. This is what players guess.">
            <Input id="w-text" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} maxLength={32} />
          </Field>
          <Field label="Difficulty" htmlFor="w-diff">
            <NativeSelect id="w-diff" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as Difficulty })}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Category" htmlFor="w-cat">
            <Input id="w-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="animals, objects, places" />
          </Field>
          <Field label="Hint" htmlFor="w-hint" hint="Optional. Shown on request in the room.">
            <Input id="w-hint" value={form.hint} onChange={(e) => setForm({ ...form, hint: e.target.value })} maxLength={80} />
          </Field>
        </div>
        <Field label="Definition" htmlFor="w-def" hint="Shown on the reveal card after the round.">
          <Textarea id="w-def" value={form.definition} onChange={(e) => setForm({ ...form, definition: e.target.value })} rows={2} />
        </Field>
        <div className="admin-form-section">
          <p className="admin-form-label">Hint translations</p>
          <div className="admin-form-grid">
            {TRANSLATION_LOCALES.map(({ locale, label }) => (
              <Field key={locale} label={label} htmlFor={`w-tr-${locale}`}>
                <Input
                  id={`w-tr-${locale}`}
                  value={form.translations[locale] ?? ''}
                  onChange={(e) => setForm({ ...form, translations: { ...form.translations, [locale]: e.target.value } })}
                  dir={locale === 'ar' ? 'rtl' : 'ltr'}
                />
              </Field>
            ))}
          </div>
        </div>
        <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active in game" description="Inactive words never appear in matches." />
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { wordService.remove(deleting.id, name); toast('Word deleted.', 'success'); } }}
        title="Delete word" body={`Remove "${deleting?.text}" from the word bank?`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}