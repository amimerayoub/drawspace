import { useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Pencil, Shapes, Trash2, Upload } from 'lucide-react';
import type { MediaAsset } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services';
import { Badge, Button, ConfirmDialog, Field, IconButton, Input, Modal, SearchInput } from '@/components/ui';
import { AdminPage, useAdmin } from './shared';

const KIND_ICON = { image: ImageIcon, avatar: Shapes, document: FileText } as const;

function formatSize(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function Media() {
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<MediaAsset | null>(null);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const kind: MediaAsset['kind'] = file.type.startsWith('image/')
        ? (file.name.startsWith('avatar') ? 'avatar' : 'image')
        : 'document';
      const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
      adminService.addMedia({ name: file.name, kind, size: file.size, url }, name);
    });
    toast(files.length === 1 ? 'File added to the library.' : `${files.length} files added.`, 'success');
    if (fileRef.current) fileRef.current.value = '';
  };

  const filtered = db.media.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <AdminPage
      title="Media library"
      sub="Images and documents used by the blog and site. Files stay in this browser session."
      actions={<>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.txt,.md" className="sr-only" aria-label="Choose files" onChange={(e) => onFiles(e.target.files)} />
        <Button variant="primary" icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>Upload files</Button>
      </>}
    >
      <div className="panel panel-pad">
        <div className="admin-media-toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Search files" label="Search media" />
          <span className="faint">{filtered.length} of {db.media.length} files</span>
        </div>
        <div className="admin-media-grid">
          {filtered.map((m) => {
            const Icon = KIND_ICON[m.kind];
            return (
              <div key={m.id} className="admin-media-card">
                <div className="admin-media-thumb">
                  {m.url ? <img src={m.url} alt={m.name} loading="lazy" /> : <Icon size={26} aria-hidden />}
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
        {filtered.length === 0 && <p className="muted admin-media-empty">No files match.</p>}
      </div>

      <Modal open={Boolean(renaming)} onClose={() => setRenaming(null)} title="Rename file"
        footer={<>
          <Button variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => {
            if (!renaming) return;
            if (!newName.trim()) { toast('The file name cannot be empty.', 'error'); return; }
            adminService.renameMedia(renaming.id, newName.trim(), name);
            toast('File renamed.', 'success');
            setRenaming(null);
          }}>Rename</Button>
        </>}>
        <Field label="File name" htmlFor="md-name">
          <Input id="md-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)} onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { adminService.removeMedia(deleting.id, name); toast('File deleted.', 'success'); } }}
        title="Delete file" body={`Delete ${deleting?.name}? Pages referencing it lose the asset.`}
        confirmLabel="Delete"
      />
    </AdminPage>
  );
}