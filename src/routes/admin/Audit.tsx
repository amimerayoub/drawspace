import { useState } from 'react';
import type { AuditEntry } from '@/types';
import { useDb } from '@/hooks/useDb';
import { Badge, NativeSelect } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { AdminPage } from './shared';

export default function Audit() {
  const db = useDb();
  const [actionFilter, setActionFilter] = useState('all');

  const groups = [...new Set(db.audit.map((a) => a.action.split('.')[0]))].sort();
  const rows = actionFilter === 'all' ? db.audit : db.audit.filter((a) => a.action.startsWith(`${actionFilter}.`));

  const columns: Column<AuditEntry>[] = [
    {
      key: 'at', header: 'Time', width: '15%',
      render: (a) => <span className="muted mono admin-audit-time">{new Date(a.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>,
      sortValue: (a) => a.at,
    },
    { key: 'admin', header: 'Admin', render: (a) => <span className="admin-user-name">{a.admin}</span>, sortValue: (a) => a.admin },
    { key: 'action', header: 'Action', render: (a) => <span className="mono">{a.action}</span>, sortValue: (a) => a.action },
    { key: 'target', header: 'Target', render: (a) => <span className="muted">{a.target}</span>, sortValue: (a) => a.target },
    {
      key: 'change', header: 'Change', width: '26%',
      render: (a) => (
        <span className="admin-audit-change">
          <span className="mono faint">{a.before || 'empty'}</span>
          <span className="faint" aria-hidden>→</span>
          <span className="mono">{a.after || 'empty'}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Result', render: (a) => <Badge tone={a.status === 'success' ? 'neutral' : 'outline'}>{a.status}</Badge>, sortValue: (a) => a.status },
  ];

  return (
    <AdminPage title="Audit logs" sub={`${db.audit.length} entries. Every admin mutation records before and after values.`}>
      <div className="panel">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(a) => a.id}
          searchable
          searchPlaceholder="Search admin, action, target"
          searchLabel="Search audit log"
          searchValue={(a) => `${a.admin} ${a.action} ${a.target} ${a.before} ${a.after}`}
          pageSize={15}
          toolbar={
            <NativeSelect value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} aria-label="Filter by area" className="admin-audit-filter">
              <option value="all">All areas</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </NativeSelect>
          }
          emptyTitle="No entries match"
        />
      </div>
    </AdminPage>
  );
}