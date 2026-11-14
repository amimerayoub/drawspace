import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, Check, Copy, KeyRound, Plus, RotateCw, ScrollText, ShieldCheck } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { MCP_READ_ONLY_SCOPES, MCP_SCOPES, mcpService, type McpAuditEntry, type McpKeyView, type McpStatus } from '@/services/mcp.service';
import { Badge, Button, ConfirmDialog, Field, Input, Modal } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage, StatCard } from './shared';

const fmtDate = (value: string, empty = 'None') => value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : empty;

export default function McpAdmin() {
  const { toast } = useToast();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [keys, setKeys] = useState<McpKeyView[]>([]);
  const [audit, setAudit] = useState<McpAuditEntry[]>([]);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<string>>(new Set(MCP_READ_ONLY_SCOPES));
  const [expiresInDays, setExpiresInDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [secret, setSecret] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<McpKeyView | null>(null);
  const [rotating, setRotating] = useState<McpKeyView | null>(null);

  const reload = useCallback(async () => {
    try {
      const [statusResult, keyList, auditList] = await Promise.all([mcpService.status(), mcpService.keys().catch(() => []), mcpService.audit().catch(() => [])]);
      setStatus(statusResult); setKeys(keyList); setAudit(auditList); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'MCP status could not be loaded.'); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const toggleScope = (scope: string) => setScopes((current) => { const next = new Set(current); if (next.has(scope)) next.delete(scope); else next.add(scope); return next; });

  const openCreate = () => { setName(''); setScopes(new Set(MCP_READ_ONLY_SCOPES)); setExpiresInDays(''); setFormError(''); setCreateOpen(true); };

  const submitCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setFormError('Give the key a name.'); return; }
    if (scopes.size === 0) { setFormError('Select at least one scope.'); return; }
    const days = expiresInDays.trim() === '' ? undefined : Number(expiresInDays);
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 3650)) { setFormError('Expiration must be a whole number of days between 1 and 3650.'); return; }
    setSaving(true);
    try {
      const result = await mcpService.createKey({ name: trimmed, scopes: [...scopes], expiresInDays: days });
      setCreateOpen(false);
      setCopied(false);
      setSecret({ key: result.key, name: result.data.name });
      await reload();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Key could not be created.'); }
    finally { setSaving(false); }
  };

  const runRevoke = async () => {
    if (!revoking) return;
    try { await mcpService.revokeKey(revoking.id); toast('Key revoked.', 'success'); setRevoking(null); await reload(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Key could not be revoked.', 'error'); }
  };

  const runRotate = async () => {
    if (!rotating) return;
    try {
      const result = await mcpService.rotateKey(rotating.id);
      setRotating(null); setCopied(false);
      setSecret({ key: result.key, name: result.data.name });
      toast('Key rotated. The previous key is now revoked.', 'success');
      await reload();
    } catch (e) { toast(e instanceof Error ? e.message : 'Key could not be rotated.', 'error'); }
  };

  const copySecret = async () => {
    if (!secret) return;
    try { await navigator.clipboard.writeText(secret.key); setCopied(true); toast('Key copied to clipboard.', 'success'); }
    catch { toast('Copy failed. Select the key and copy it manually.', 'error'); }
  };

  const keyColumns: Column<McpKeyView>[] = [
    { key: 'name', header: 'Name', render: (k) => <span className="admin-user-name">{k.name}</span>, sortValue: (k) => k.name },
    { key: 'prefix', header: 'Key id', render: (k) => <span className="mono muted">{k.keyPrefix}…</span>, sortValue: (k) => k.keyPrefix },
    {
      key: 'scopes', header: 'Scopes', width: '26%',
      render: (k) => <span className="admin-mcp-scopes">{k.scopes.map((scope) => <Badge key={scope} tone="outline">{scope}</Badge>)}</span>,
    },
    { key: 'status', header: 'Status', render: (k) => <Badge tone={k.status === 'active' ? 'accent' : 'neutral'}>{k.status}</Badge>, sortValue: (k) => k.status },
    { key: 'created', header: 'Created', render: (k) => <span className="muted mono admin-audit-time">{fmtDate(k.createdAt)}</span>, sortValue: (k) => k.createdAt },
    { key: 'expires', header: 'Expires', render: (k) => <span className="muted mono admin-audit-time">{fmtDate(k.expiresAt, 'Never')}</span>, sortValue: (k) => k.expiresAt },
    { key: 'used', header: 'Last used', render: (k) => <span className="muted mono admin-audit-time">{fmtDate(k.lastUsedAt, 'Never')}</span>, sortValue: (k) => k.lastUsedAt },
    {
      key: 'actions', header: '', align: 'end', width: '90px',
      render: (k) => (
        <span className="admin-row-actions">
          <Button size="sm" variant="ghost" icon={<RotateCw size={13} />} disabled={k.status !== 'active'} onClick={() => setRotating(k)} aria-label={`Rotate ${k.name}`} />
          <Button size="sm" variant="ghost" icon={<Ban size={13} />} disabled={k.status !== 'active'} onClick={() => setRevoking(k)} aria-label={`Revoke ${k.name}`} />
        </span>
      ),
    },
  ];

  const auditColumns: Column<McpAuditEntry>[] = [
    { key: 'at', header: 'Time', width: '16%', render: (a) => <span className="muted mono admin-audit-time">{fmtDate(a.createdAt)}</span>, sortValue: (a) => a.createdAt },
    { key: 'actor', header: 'Actor', render: (a) => <span className="admin-user-name">{a.actorUsername}</span>, sortValue: (a) => a.actorUsername },
    { key: 'action', header: 'Action', render: (a) => <span className="mono">{a.action}</span>, sortValue: (a) => a.action },
    { key: 'resource', header: 'Resource', render: (a) => <span className="muted mono">{a.resourceType}{a.resourceId ? `:${a.resourceId}` : ''}</span>, sortValue: (a) => a.resourceType },
    { key: 'reason', header: 'Detail', width: '28%', render: (a) => <span className="muted admin-clamp">{a.reason}</span> },
    { key: 'status', header: 'Result', render: (a) => <Badge tone={a.status === 'success' ? 'neutral' : 'outline'}>{a.status}</Badge>, sortValue: (a) => a.status },
  ];

  const activeCount = useMemo(() => keys.filter((k) => k.status === 'active').length, [keys]);

  return (
    <AdminPage
      title="MCP server"
      sub="Scoped API keys for MCP-compatible AI clients. Keys are hashed server-side and shown only once. The Appwrite key is never exposed."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={openCreate} disabled={status ? !status.tableAvailable : false}>Create key</Button>}
    >
      {error && <p role="alert" className="muted">{error}</p>}
      {status && !status.tableAvailable && (
        <div className="panel panel-pad admin-mcp-banner" role="alert">
          <AlertTriangle size={16} className="accent" aria-hidden />
          <span>The mcp_api_keys table is not available yet. Apply the content schema migration to create and manage stored keys. Until then only an optional environment bootstrap key can authenticate.</span>
        </div>
      )}
      {status?.bootstrapConfigured && (
        <div className="panel panel-pad admin-mcp-banner">
          <ShieldCheck size={16} className="accent" aria-hidden />
          <span>An environment bootstrap key is configured. Prefer scoped stored keys, and restrict or remove the bootstrap key once they are in use.</span>
        </div>
      )}

      <div className="admin-stat-grid">
        <StatCard label="Transport" value={status?.transport ?? 'streamable-http'} hint="Stateless Streamable HTTP at /mcp" icon={<KeyRound size={17} />} />
        <StatCard label="Active keys" value={status?.activeKeys ?? activeCount} icon={<ShieldCheck size={17} />} />
        <StatCard label="Revoked keys" value={status?.revokedKeys ?? 0} icon={<Ban size={17} />} />
        <StatCard label="Tools" value={status?.tools.length ?? 0} hint="Explicit operations only" icon={<ScrollText size={17} />} />
      </div>

      <div className="panel">
        <DataTable
          columns={keyColumns}
          rows={keys}
          rowKey={(k) => k.id}
          searchable
          searchPlaceholder="Search name, prefix, or scope"
          searchLabel="Search MCP keys"
          searchValue={(k) => `${k.name} ${k.keyPrefix} ${k.scopes.join(' ')} ${k.status}`}
          pageSize={10}
          emptyTitle="No MCP keys yet"
        />
      </div>

      <h2 className="admin-section-title">Audit history</h2>
      <div className="panel">
        <DataTable
          columns={auditColumns}
          rows={audit}
          rowKey={(a) => a.id}
          searchable
          searchPlaceholder="Search actor, action, resource"
          searchLabel="Search MCP audit"
          searchValue={(a) => `${a.actorUsername} ${a.action} ${a.resourceType} ${a.reason}`}
          pageSize={10}
          emptyTitle="No MCP activity yet"
        />
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create MCP key" wide
        footer={<>
          <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={() => void submitCreate()}>Generate key</Button>
        </>}>
        <Field label="Key name" htmlFor="mcp-name" hint="A label to identify this integration, for example CI reader.">
          <Input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="CI reader" />
        </Field>
        <Field label="Expiration (optional)" htmlFor="mcp-expiry" hint="Days until the key expires, 1 to 3650. Leave blank for no expiration.">
          <Input id="mcp-expiry" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} inputMode="numeric" placeholder="90" />
        </Field>
        <Field label="Scopes" hint="Least privilege: grant only what this integration needs.">
          <div className="admin-mcp-scope-actions">
            <Button size="sm" variant="ghost" onClick={() => setScopes(new Set(MCP_READ_ONLY_SCOPES))}>Read-only</Button>
            <Button size="sm" variant="ghost" onClick={() => setScopes(new Set(MCP_SCOPES))}>All scopes</Button>
            <Button size="sm" variant="ghost" onClick={() => setScopes(new Set())}>Clear</Button>
          </div>
          <div className="admin-mcp-scope-grid">
            {MCP_SCOPES.map((scope) => (
              <label key={scope} className="admin-check-row">
                <input type="checkbox" checked={scopes.has(scope)} onChange={() => toggleScope(scope)} />
                <span className="mono">{scope}</span>
              </label>
            ))}
          </div>
        </Field>
        {formError && <p role="alert" className="admin-form-error">{formError}</p>}
      </Modal>

      <Modal open={Boolean(secret)} onClose={() => setSecret(null)} title="Copy your new MCP key" wide
        footer={<Button variant="primary" onClick={() => setSecret(null)}>Done</Button>}>
        <p className="muted">This is the only time the key for <strong>{secret?.name}</strong> is shown. Store it in a secret manager now. It cannot be retrieved later, only rotated or revoked.</p>
        <div className="admin-mcp-secret">
          <code className="mono">{secret?.key}</code>
          <Button size="sm" variant="secondary" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copySecret()}>{copied ? 'Copied' : 'Copy'}</Button>
        </div>
        <p className="faint admin-field-hint">Use it as Authorization: Bearer YOUR_DRAWSPACE_MCP_API_KEY against the /mcp endpoint.</p>
      </Modal>

      <ConfirmDialog
        open={Boolean(revoking)} onClose={() => setRevoking(null)} onConfirm={() => void runRevoke()}
        title="Revoke MCP key" body={`Revoke "${revoking?.name}"? Clients using it will immediately lose access. This cannot be undone.`}
        confirmLabel="Revoke"
      />
      <ConfirmDialog
        open={Boolean(rotating)} onClose={() => setRotating(null)} onConfirm={() => void runRotate()}
        title="Rotate MCP key" body={`Rotate "${rotating?.name}"? A replacement key with the same scopes is generated and the current key is revoked. The new key is shown only once.`}
        confirmLabel="Rotate"
      />
    </AdminPage>
  );
}