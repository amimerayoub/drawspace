import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Pencil, RotateCw, Shapes, Trash2, Upload } from 'lucide-react';
import type { MediaAsset } from '@/types';
import { useToast } from '@/context/ToastContext';
import { backendAdminService } from '@/services/backendAdmin.service';
import { baseUrl } from '@/services/apiClient';
import { Badge, Button, ConfirmDialog, Field, IconButton, Input, Modal, SearchInput, Spinner } from '@/components/ui';
import { ResponsiveImage } from '@/components/ResponsiveImage';
import { AdminPage, NoAccess, useAdmin } from './shared';

const KIND_ICON = { image: ImageIcon, avatar: Shapes, document: FileText } as const;

function formatSize(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function kindFor(file: File): MediaAsset['kind'] {
  if (!file.type.startsWith('image/')) return 'document';
  return file.name.startsWith('avatar') ? 'avatar' : 'image';
}

export default function Media() {
  const { can } = useAdmin();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState<MediaAsset | null>(null);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setAssets(await backendAdminService.media()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'The media library could not be loaded.'); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!can('content.media')) return <NoAccess />;

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    let failed = 0;
    for (const file of Array.from(files)) {
      try { await backendAdminService.uploadMedia(file, kindFor(file)); ok += 1; }
      catch (e) { failed += 1; toast(e instanceof Error ? e.message : `Could not upload ${file.name}.`, 'error'); }
    }
    await load();
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (ok > 0) toast(ok === 1 ? 'File uploaded to storage.' : `${ok} files uploaded to storage.`, 'success');
    if (failed > 0 && ok === 0) setError('Uploads failed. Confirm the media storage bucket is provisioned.');
  };

  const rename = async () => {
    if (!renaming) return;
    if (!newName.trim()) { toast('The file name cannot be empty.', 'error'); return; }
    setBusy(true);
    try { await backendAdminService.renameMedia(renaming.id, newName.trim()); await load(); toast('File renamed.', 'success'); setRenaming(null); }
    catch (e) { toast(e instanceof Error ? e.message : 'File could not be renamed.', 'error'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!deleting) return;
    try { await backendAdminService.deleteMedia(deleting.id); await load(); toast('File deleted from storage.', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'File could not be deleted.', 'error'); }
    setDeleting(null);
  };

  const filtered = assets.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <AdminPage
      title="Media library"
      sub="Images and documents stored in Appwrite Storage and used by the blog and site."
      actions={<>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.txt,.md" className="sr-only" aria-label="Choose files" onChange={(e) => void onFiles(e.target.files)} />
        <Button variant="secondary" icon={<RotateCw size={15} />} loading={refreshing} onClick={() => void load()}>Refresh</Button>
        <Button variant="primary" icon={<Upload size={15} />} loading={uploading} onClick={() => fileRef.current?.click()}>Upload files</Button>
      </>}
    >
      {error && <p role="alert" className="muted">{error}</p>}
      <div className="panel panel-pad">
        <div className="admin-media-toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Search files" label="Search media" />
          <span className="faint">{filtered.length} of {assets.length} files</span>
        </div>
        {refreshing && assets.length === 0 ? <div className="page"><Spinner /></div> : (
          <div className="admin-media-grid">
            {filtered.map((m) => {
              const Icon = KIND_ICON[m.kind];
              return (
                <div key={m.id} className="admin-media-card">
                  <div className="admin-media-thumb">
                    {m.kind !== 'document' ? <ResponsiveImage src={`${baseUrl}${m.url}`} alt={m.name} thumb /> : <Icon size={26} aria-hidden />}
                  </div>
                  <span className="admin-media-name" title={m.name}>{m.name}</span>
                  <span className="faint admin-media-meta">{formatSize(m.size)} · {new Date(m.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <div className="admin-row-actions">
                    <Badge tone="neutral">{m.kind}</Badge>
                    <span className="admin-media-spacer" />
                    <IconButton label={`Rename ${m.name}`} onClick={() => { setRenaming(m); setNewName(m.name); }}><Pencil size={13} /></IconButton>
                    <IconButton label={`Delete ${m.name}`} onClick={() => setDeleting(m)}><Trash2 size={13} /></IconButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!refreshing && filtered.length === 0 && <p className="muted admin-media-empty">{assets.length === 0 ? 'No files yet. Upload images or documents to use them across the site.' : 'No files match.'}</p>}
      </div>

      <Modal open={Boolean(renaming)} onClose={() => { if (!busy) setRenaming(null); }} title="Rename file"
        footer={<>
          <Button variant="ghost" onClick={() => setRenaming(null)} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void rename()}>Rename</Button>
        </>}>
        <Field label="File name" htmlFor="md-name">
          <Input id="md-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title="Delete file" body={`Delete ${deleting?.name} from storage? Pages referencing it lose the asset.`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}