import { useEffect, useRef, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { contentService, type ExportFormat, type ImportReport, type ImportStrategy } from '@/services/content.service';
import { Badge, Button, Field, Modal, NativeSelect, Segmented } from '@/components/ui';

const MAX_BYTES = 2_000_000;
const STRATEGY_HINTS: Record<ImportStrategy, string> = {
  skip: 'Existing records are left untouched and reported as skipped.',
  insert: 'Only new records are created. Duplicates are reported as errors.',
  upsert: 'New records are created and matching records are updated.',
  replace: 'Only matching existing records are overwritten. Nothing is inserted or deleted.',
};

interface TransferProps { kind: 'words' | 'blogs'; open: boolean; onClose: () => void }

export function ImportModal({ kind, open, onClose, onImported }: TransferProps & { onImported: () => Promise<void> | void }) {
  const { toast } = useToast();
  const [fileName, setFileName] = useState('');
  const [content, setContent] = useState('');
  const [strategy, setStrategy] = useState<ImportStrategy>('skip');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setFileName(''); setContent(''); setReport(null); setError(''); setConfirmReplace(false); setStrategy('skip'); };
  const close = () => { reset(); onClose(); };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setReport(null);
    if (!/\.(json|csv)$/i.test(file.name)) { setError('Only .json and .csv files are supported.'); return; }
    if (file.size > MAX_BYTES) { setError('File exceeds the 2 MB import limit.'); return; }
    setFileName(file.name);
    setContent(await file.text());
  };

  const run = async (dryRun: boolean) => {
    if (!content) { setError('Choose a JSON or CSV file first.'); return; }
    if (!dryRun && strategy === 'replace' && !confirmReplace) { setError('Confirm that matching records may be overwritten.'); return; }
    setBusy(true); setError('');
    try {
      const payload = { content, filename: fileName, strategy, dryRun, confirm: !dryRun && strategy === 'replace' ? true : undefined };
      const result = kind === 'words' ? await contentService.importWords(payload) : await contentService.importBlogs(payload);
      setReport(result);
      if (!dryRun) {
        toast(`Import finished: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed.`, result.failed > 0 ? 'error' : 'success');
        await onImported();
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed.'); }
    finally { setBusy(false); }
  };

  const applied = report !== null && !report.dryRun;
  const label = (record: ImportReport['results'][number]) => record.word ?? record.title ?? record.slug ?? `Record ${record.index + 1}`;

  return (
    <Modal open={open} onClose={close} title={kind === 'words' ? 'Import words' : 'Import blog posts'} wide
      footer={<>
        <Button variant="ghost" onClick={close}>{applied ? 'Close' : 'Cancel'}</Button>
        {!applied && <Button variant="ghost" loading={busy} onClick={() => void run(true)}>Preview</Button>}
        {!applied && <Button variant="primary" icon={<FileUp size={15} />} loading={busy} disabled={!report?.dryRun} onClick={() => void run(false)}>Confirm import</Button>}
      </>}>
      <input ref={inputRef} type="file" accept=".json,.csv" hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="admin-form-grid">
        <Field label="File" hint="JSON or CSV, up to 2 MB. Words: 1000 records. Blogs: 200 records.">
          <Button variant="ghost" icon={<FileUp size={15} />} onClick={() => inputRef.current?.click()}>{fileName || 'Choose file'}</Button>
        </Field>
        <Field label="Strategy" htmlFor="import-strategy" hint={STRATEGY_HINTS[strategy]}>
          <NativeSelect id="import-strategy" value={strategy} onChange={(e) => { setStrategy(e.target.value as ImportStrategy); setReport(null); }}>
            <option value="skip">Skip duplicates</option>
            <option value="insert">Insert only</option>
            <option value="upsert">Update existing</option>
            <option value="replace">Replace selected matches</option>
          </NativeSelect>
        </Field>
      </div>
      {strategy === 'replace' && !applied && (
        <label className="admin-check-row">
          <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />
          <span>I understand that matching existing records will be overwritten. Unrelated records are never touched.</span>
        </label>
      )}
      {error && <p role="alert" className="admin-form-error">{error}</p>}
      {report && (
        <div className="admin-import-report">
          <div className="admin-import-counts">
            <Badge tone="accent">{report.created} created</Badge>
            <Badge tone="accent">{report.updated} updated</Badge>
            <Badge tone="neutral">{report.skipped} skipped</Badge>
            <Badge tone={report.failed > 0 ? 'outline' : 'neutral'}>{report.failed} failed</Badge>
            <Badge tone="neutral">{report.dryRun ? 'Preview only' : 'Applied'}</Badge>
            <Badge tone="neutral">{report.format.toUpperCase()}</Badge>
          </div>
          {report.warnings.length > 0 && (
            <ul className="admin-import-warnings">
              {report.warnings.slice(0, 20).map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
          <table className="admin-import-table">
            <thead><tr><th>#</th><th>Record</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>
              {report.results.slice(0, 100).map((record) => (
                <tr key={record.index}>
                  <td className="mono">{record.index + 1}</td>
                  <td>{label(record)}</td>
                  <td><Badge tone={record.status === 'failed' ? 'outline' : record.status === 'skipped' ? 'neutral' : 'accent'}>{record.status}</Badge></td>
                  <td className="muted">{record.error || (record.id ? record.id : '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.results.length > 100 && <p className="muted">Showing the first 100 of {report.results.length} records.</p>}
          {report.dryRun && <p className="muted">Nothing has been written yet. Review the preview, then confirm the import.</p>}
        </div>
      )}
    </Modal>
  );
}

export function ExportModal({ kind, open, onClose, selectedIds }: TransferProps & { selectedIds: string[] }) {
  const { toast } = useToast();
  const [format, setFormat] = useState<ExportFormat>('json');
  const [scope, setScope] = useState('all');
  const [category, setCategory] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope('all'); setCategory('all'); setDifficulty('all');
    const load = kind === 'words' ? contentService.wordCategories() : contentService.blogCategories();
    void load.then(setCategories).catch(() => setCategories([]));
  }, [open, kind]);

  const run = async (categoriesOnly = false) => {
    setBusy(true);
    try {
      const ids = scope === 'selected' ? selectedIds : undefined;
      const filename = categoriesOnly
        ? await contentService.exportCategories(format)
        : kind === 'words'
          ? await contentService.exportWords({ format, category: category === 'all' ? undefined : category, difficulty: difficulty === 'all' ? undefined : difficulty, ids })
          : await contentService.exportBlogs({ format, scope: scope as 'all' | 'published' | 'draft' | 'selected', category: category === 'all' ? undefined : category, ids });
      toast(`Exported ${filename}.`, 'success');
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : 'Export failed.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={kind === 'words' ? 'Export words' : 'Export blog posts'}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {kind === 'words' && <Button variant="ghost" loading={busy} onClick={() => void run(true)}>Categories only</Button>}
        <Button variant="primary" icon={<Download size={15} />} loading={busy} disabled={scope === 'selected' && selectedIds.length === 0} onClick={() => void run(false)}>Export {format.toUpperCase()}</Button>
      </>}>
      <Field label="Format" hint="CSV is UTF-8 with BOM and spreadsheet formula protection. JSON carries the schema version and export timestamp.">
        <Segmented options={[{ value: 'json', label: 'JSON' }, { value: 'csv', label: 'CSV' }]} value={format} onChange={(value) => setFormat(value as ExportFormat)} label="Export format" />
      </Field>
      <div className="admin-form-grid">
        <Field label="Scope" htmlFor="export-scope">
          <NativeSelect id="export-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">All records</option>
            {kind === 'blogs' && <option value="published">Published only</option>}
            {kind === 'blogs' && <option value="draft">Drafts only</option>}
            <option value="selected">Selected rows ({selectedIds.length})</option>
          </NativeSelect>
        </Field>
        <Field label="Category" htmlFor="export-category">
          <NativeSelect id="export-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        {kind === 'words' && (
          <Field label="Difficulty" htmlFor="export-difficulty">
            <NativeSelect id="export-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="all">All difficulties</option>
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </NativeSelect>
          </Field>
        )}
      </div>
      {kind === 'words' && <p className="muted">JSON exports also include the category list and record metadata.</p>}
    </Modal>
  );
}