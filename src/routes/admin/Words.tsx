import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderTree, Layers, Pencil, Plus, Power, Trash2, Upload, Download, FileUp } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { contentService, normalizeWordText, type BulkStrategy, type ContentDifficulty, type ContentWord, type WordCategory, type WordInput, type WordStats } from '@/services/content.service';
import { Badge, Button, ConfirmDialog, Field, Input, Modal, NativeSelect, Segmented, Switch, Textarea } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, StatCard } from './shared';
import { ExportModal, ImportModal } from './ContentTransfer';

const DIFFICULTIES: ContentDifficulty[] = ['easy', 'medium', 'hard'];
const LANGUAGES = ['en', 'en-US', 'en-GB', 'fr', 'es', 'de', 'ar', 'pt-BR', 'ru'];

interface WordForm { word: string; difficulty: ContentDifficulty; category: string; language: string; hint: string; active: boolean }
const emptyForm: WordForm = { word: '', difficulty: 'easy', category: '', language: 'en', hint: '', active: true };

export default function Words() {
  const { toast } = useToast();
  const [words, setWords] = useState<ContentWord[]>([]);
  const [stats, setStats] = useState<WordStats | null>(null);
  const [categories, setCategories] = useState<WordCategory[]>([]);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ContentWord | 'new' | null>(null);
  const [form, setForm] = useState<WordForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ContentWord | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkStrategy, setBulkStrategy] = useState<BulkStrategy>('skip');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [categoryDeleting, setCategoryDeleting] = useState<WordCategory | null>(null);
  const [reassignTo, setReassignTo] = useState('');

  const reload = useCallback(async () => {
    try {
      const [wordList, wordStats, categoryList] = await Promise.all([contentService.words(), contentService.wordStats(), contentService.wordCategories()]);
      setWords(wordList); setStats(wordStats); setCategories(categoryList); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Word bank could not be loaded.'); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const filtered = useMemo(() => words.filter((w) =>
    (categoryFilter === 'all' || w.category === categoryFilter) &&
    (difficultyFilter === 'all' || w.difficulty === difficultyFilter) &&
    (activeFilter === 'all' || (activeFilter === 'active' ? w.active : !w.active)),
  ), [words, categoryFilter, difficultyFilter, activeFilter]);

  const toggleSelected = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allFilteredSelected = filtered.length > 0 && filtered.every((w) => selected.has(w.id));
  const toggleAll = () => setSelected(allFilteredSelected ? new Set() : new Set(filtered.map((w) => w.id)));

  const open = (w: ContentWord | 'new') => {
    setFormError('');
    setForm(w === 'new' ? emptyForm : { word: w.word, difficulty: w.difficulty, category: w.category, language: w.language, hint: w.hint, active: w.active });
    setEditing(w);
  };

  const save = async () => {
    const word = form.word.trim();
    if (word.length < 2) { setFormError('The word needs at least 2 characters.'); return; }
    const normalized = normalizeWordText(word);
    if (!normalized) { setFormError('The word needs at least one letter or number.'); return; }
    const duplicate = words.find((w) => normalizeWordText(w.word) === normalized && (editing === 'new' || w.id !== (editing as ContentWord).id));
    if (duplicate) { setFormError(`"${duplicate.word}" already exists in the word bank.`); return; }
    if (!form.category.trim()) { setFormError('Choose or type a category.'); return; }
    setSaving(true);
    try {
      const input: WordInput = { word, category: form.category.trim(), difficulty: form.difficulty, language: form.language, hint: form.hint.trim(), active: form.active };
      if (editing === 'new') await contentService.createWord(input);
      else await contentService.updateWord((editing as ContentWord).id, input);
      toast('Word saved.', 'success');
      setEditing(null);
      await reload();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Word could not be saved.'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (word: ContentWord) => {
    try { await contentService.updateWord(word.id, { active: !word.active }); setWords((current) => current.map((item) => item.id === word.id ? { ...item, active: !item.active } : item)); }
    catch (e) { toast(e instanceof Error ? e.message : 'Word status could not be updated.', 'error'); }
  };

  const runBulkActive = async (active: boolean) => {
    try {
      const result = await contentService.bulkActive([...selected], active);
      toast(`${result.updated.length} words ${active ? 'activated' : 'deactivated'}.`, 'success');
      setSelected(new Set());
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'Bulk update failed.', 'error'); }
  };

  const parseBulkLines = (): WordInput[] => bulkText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [word, category, difficulty] = line.split(',').map((part) => part.trim());
    return { word, category: category || 'General', difficulty: (DIFFICULTIES.includes(difficulty as ContentDifficulty) ? difficulty : 'easy') as ContentDifficulty };
  });

  const runBulkAdd = async () => {
    const inputs = parseBulkLines();
    if (inputs.length === 0) { toast('Add at least one word, one per line.', 'error'); return; }
    if (inputs.length > 500) { toast('A bulk add accepts at most 500 words.', 'error'); return; }
    setBulkBusy(true);
    try {
      const report = await contentService.bulkWords(inputs, bulkStrategy);
      toast(`Bulk add: ${report.created} created, ${report.updated} updated, ${report.skipped} skipped, ${report.failed} failed.`, report.failed > 0 ? 'error' : 'success');
      setBulkAddOpen(false); setBulkText('');
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'Bulk add failed.', 'error'); }
    finally { setBulkBusy(false); }
  };

  const columns: Column<ContentWord>[] = [
    {
      key: 'select', header: '', width: '36px',
      render: (w) => <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggleSelected(w.id)} aria-label={`Select ${w.word}`} onClick={(e) => e.stopPropagation()} />,
    },
    { key: 'word', header: 'Word', width: '20%', render: (w) => <span className="mono admin-word-text">{w.word}</span>, sortValue: (w) => w.word },
    { key: 'difficulty', header: 'Difficulty', render: (w) => <Badge tone={w.difficulty === 'hard' ? 'accent' : 'neutral'}>{w.difficulty}</Badge>, sortValue: (w) => w.difficulty },
    { key: 'category', header: 'Category', render: (w) => <span className="muted">{w.category}</span>, sortValue: (w) => w.category },
    { key: 'language', header: 'Language', render: (w) => <span className="muted mono">{w.language}</span>, sortValue: (w) => w.language },
    { key: 'hint', header: 'Hint', width: '24%', render: (w) => <span className="muted admin-clamp">{w.hint || 'None'}</span> },
    {
      key: 'active', header: 'In game', align: 'center',
      render: (w) => <Switch checked={w.active} onChange={() => void toggleActive(w)} label={`Toggle ${w.word}`} />,
      sortValue: (w) => (w.active ? 1 : 0),
    },
    {
      key: 'actions', header: '', align: 'end', width: '90px',
      render: (w) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => open(w)} aria-label={`Edit ${w.word}`} />
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(w)} aria-label={`Delete ${w.word}`} />
        </span>
      ),
    },
  ];

  const selectHeader = (
    <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select all filtered words" />
  );
  const columnsWithSelect: Column<ContentWord>[] = [{ ...columns[0], header: selectHeader }, ...columns.slice(1)];

  return (
    <AdminPage
      title="Word bank"
      sub="Manage the words players draw and guess. Duplicates are detected with case and accent insensitive comparison."
      actions={<>
        <Button variant="ghost" icon={<FolderTree size={15} />} onClick={() => setCategoriesOpen(true)}>Categories</Button>
        <Button variant="ghost" icon={<Upload size={15} />} onClick={() => setBulkAddOpen(true)}>Bulk add</Button>
        <Button variant="ghost" icon={<FileUp size={15} />} onClick={() => setImportOpen(true)}>Import</Button>
        <Button variant="ghost" icon={<Download size={15} />} onClick={() => setExportOpen(true)}>Export</Button>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => open('new')}>Add word</Button>
      </>}
    >
      {error && <p role="alert" className="muted">{error}</p>}
      <div className="admin-stat-grid">
        <StatCard label="Total words" value={stats?.total ?? words.length} icon={<Layers size={17} />} />
        <StatCard label="Active" value={stats?.active ?? 0} hint="Available in matches" />
        <StatCard label="Inactive" value={stats?.inactive ?? 0} hint="Hidden from matches" />
        <StatCard label="Categories" value={categories.length} hint={stats ? `${stats.byDifficulty.easy ?? 0} easy, ${stats.byDifficulty.medium ?? 0} medium, ${stats.byDifficulty.hard ?? 0} hard` : undefined} />
      </div>

      <div className="panel">
        <DataTable
          columns={columnsWithSelect}
          rows={filtered}
          rowKey={(w) => w.id}
          searchable
          searchPlaceholder="Search word, category, or hint"
          searchLabel="Search words"
          searchValue={(w) => `${w.word} ${w.category} ${w.hint} ${w.difficulty}`}
          pageSize={12}
          emptyTitle="No words match"
          toolbar={<>
            <NativeSelect value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name} ({c.wordCount})</option>)}
            </NativeSelect>
            <NativeSelect value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} aria-label="Filter by difficulty">
              <option value="all">All difficulties</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </NativeSelect>
            <Segmented options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} value={activeFilter} onChange={setActiveFilter} label="Filter by status" />
            {selected.size > 0 && <>
              <Button size="sm" variant="ghost" icon={<Power size={13} />} onClick={() => void runBulkActive(true)}>Activate {selected.size}</Button>
              <Button size="sm" variant="ghost" icon={<Power size={13} />} onClick={() => void runBulkActive(false)}>Deactivate {selected.size}</Button>
              <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => setBulkDeleteOpen(true)}>Delete {selected.size}</Button>
            </>}
          </>}
        />
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add word' : `Edit ${form.word}`} wide
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>Save word</Button>
        </>}>
        <div className="admin-form-grid">
          <Field label="Word" htmlFor="w-word" hint="This is what players guess. English words work best.">
            <Input id="w-word" value={form.word} onChange={(e) => setForm({ ...form, word: e.target.value })} maxLength={32} />
          </Field>
          <Field label="Difficulty" htmlFor="w-diff">
            <NativeSelect id="w-diff" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as ContentDifficulty })}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Category" htmlFor="w-cat">
            <Input id="w-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} list="w-cats" placeholder="Animals, Food, Objects" />
          </Field>
          <Field label="Language" htmlFor="w-lang" hint="Gameplay words are English. This label is metadata.">
            <NativeSelect id="w-lang" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
              {LANGUAGES.map((language) => <option key={language} value={language}>{language}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <datalist id="w-cats">{categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        <Field label="Hint" htmlFor="w-hint" hint="Optional. Stored once the content schema migration is applied.">
          <Input id="w-hint" value={form.hint} onChange={(e) => setForm({ ...form, hint: e.target.value })} maxLength={255} />
        </Field>
        <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active in game" description="Inactive words never appear in matches." />
        {formError && <p role="alert" className="admin-form-error">{formError}</p>}
      </Modal>

      <Modal open={bulkAddOpen} onClose={() => setBulkAddOpen(false)} title="Bulk add words" wide
        footer={<>
          <Button variant="ghost" onClick={() => setBulkAddOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={bulkBusy} onClick={() => void runBulkAdd()}>Import {parseBulkLines().length} words</Button>
        </>}>
        <Field label="Words" htmlFor="w-bulk" hint="One word per line. Optionally add category and difficulty: word,category,difficulty">
          <Textarea id="w-bulk" value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={10} placeholder={'Cat,Animals,easy\nElephant,Animals,medium\nMountain,Nature,hard'} />
        </Field>
        <Field label="Duplicate handling" htmlFor="w-bulk-strategy">
          <NativeSelect id="w-bulk-strategy" value={bulkStrategy} onChange={(e) => setBulkStrategy(e.target.value as BulkStrategy)}>
            <option value="skip">Skip duplicates</option>
            <option value="insert">Insert only, report duplicates as errors</option>
            <option value="upsert">Update existing words</option>
          </NativeSelect>
        </Field>
      </Modal>

      <Modal open={categoriesOpen} onClose={() => { setCategoriesOpen(false); setRenaming(null); }} title="Word categories" wide
        footer={<Button variant="ghost" onClick={() => { setCategoriesOpen(false); setRenaming(null); }}>Close</Button>}>
        <div className="admin-form-grid">
          <Field label="New category" htmlFor="w-new-cat">
            <Input id="w-new-cat" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Technology" maxLength={32} />
          </Field>
          <div className="admin-field-action">
            <Button variant="primary" onClick={() => { void contentService.createWordCategory(newCategory.trim()).then(() => { setNewCategory(''); toast('Category created.', 'success'); return reload(); }).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Category could not be created.', 'error')); }}>Create</Button>
          </div>
        </div>
        <div className="admin-category-list">
          {categories.map((c) => (
            <div key={c.id} className="admin-category-row">
              {renaming?.id === c.id ? (
                <>
                  <Input value={renaming.name} onChange={(e) => setRenaming({ id: c.id, name: e.target.value })} aria-label={`Rename ${c.name}`} maxLength={32} />
                  <Button size="sm" variant="primary" onClick={() => { void contentService.renameWordCategory(c.id, renaming.name.trim()).then(() => { setRenaming(null); toast('Category renamed.', 'success'); return reload(); }).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Rename failed.', 'error')); }}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <span className="admin-category-name">{c.name}</span>
                  <span className="muted mono">{c.wordCount} words</span>
                  <span className="admin-row-actions">
                    <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setRenaming({ id: c.id, name: c.name })} aria-label={`Rename ${c.name}`} />
                    <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => { setCategoryDeleting(c); setReassignTo(''); }} aria-label={`Delete ${c.name}`} />
                  </span>
                </>
              )}
            </div>
          ))}
          {categories.length === 0 && <p className="muted">No categories yet. Categories appear as words are added.</p>}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) void contentService.deleteWord(deleting.id).then(() => { setDeleting(null); toast('Word deleted.', 'success'); return reload(); }).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Word could not be deleted.', 'error')); }}
        title="Delete word" body={`Remove "${deleting?.word}" from the word bank?`}
        confirmLabel="Delete"
      />
      <ConfirmDialog
        open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)}
        onConfirm={() => { void contentService.bulkDeleteWords([...selected]).then((result) => { setBulkDeleteOpen(false); setSelected(new Set()); toast(`${result.deleted.length} words deleted.`, 'success'); return reload(); }).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Bulk delete failed.', 'error')); }}
        title="Delete selected words" body={`Permanently delete ${selected.size} selected words? This cannot be undone.`}
        confirmLabel={`Delete ${selected.size} words`}
      />
      <ConfirmDialog
        open={Boolean(categoryDeleting)} onClose={() => setCategoryDeleting(null)}
        onConfirm={() => { if (categoryDeleting) void contentService.deleteWordCategory(categoryDeleting.id, reassignTo || undefined).then((result) => { setCategoryDeleting(null); toast(`Category deleted. ${result.reassigned} words reassigned.`, 'success'); return reload(); }).catch((e: unknown) => toast(e instanceof Error ? e.message : 'Category could not be deleted.', 'error')); }}
        title="Delete category"
        body={categoryDeleting && categoryDeleting.wordCount > 0 ? `"${categoryDeleting.name}" is used by ${categoryDeleting.wordCount} words. Choose a category to move them to.` : `Delete "${categoryDeleting?.name}"?`}
        confirmLabel="Delete category"
      >
        {categoryDeleting && categoryDeleting.wordCount > 0 && (
          <NativeSelect value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} aria-label="Reassign words to">
            <option value="">Choose a category</option>
            {categories.filter((c) => c.id !== categoryDeleting.id).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </NativeSelect>
        )}
      </ConfirmDialog>
      <ImportModal kind="words" open={importOpen} onClose={() => setImportOpen(false)} onImported={reload} />
      <ExportModal kind="words" open={exportOpen} onClose={() => setExportOpen(false)} selectedIds={[...selected]} />
    </AdminPage>
  );
}