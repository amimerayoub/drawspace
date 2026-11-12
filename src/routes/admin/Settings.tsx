import { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import type { Locale, SystemSettings } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services';
import { commit, resetDb } from '@/services/db';
import { LOCALES } from '@/i18n/I18nContext';
import { Button, ConfirmDialog, Field, Input, NativeSelect, Switch } from '@/components/ui';
import { AdminPage, FieldRow, useAdmin } from './shared';

export default function Settings() {
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [form, setForm] = useState<SystemSettings>({ ...db.settings });
  const [resetting, setResetting] = useState(false);

  const save = () => {
    if (!form.siteName.trim()) { toast('Site name cannot be empty.', 'error'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.contactEmail)) { toast('Enter a valid contact email.', 'error'); return; }
    adminService.audit(name, 'settings.update', 'system', JSON.stringify(db.settings), JSON.stringify(form));
    Object.assign(db.settings, form);
    commit();
    toast('System settings saved.', 'success');
  };

  return (
    <AdminPage
      title="System settings"
      sub="Site identity, access switches, and demo data."
      actions={<Button variant="primary" icon={<Save size={15} />} onClick={save}>Save changes</Button>}
    >
      <div className="admin-grid-2">
        <div className="panel panel-pad">
          <h2 className="admin-panel-title">Identity</h2>
          <FieldRow label="Site name">
            <Input value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} maxLength={30} />
          </FieldRow>
          <FieldRow label="Tagline">
            <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={80} />
          </FieldRow>
          <FieldRow label="Contact email">
            <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </FieldRow>
          <FieldRow label="Default locale" hint="Used for visitors without a language preference.">
            <NativeSelect value={form.defaultLocale} onChange={(e) => setForm({ ...form, defaultLocale: e.target.value as Locale })} aria-label="Default locale">
              {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </NativeSelect>
          </FieldRow>
        </div>
        <div className="panel panel-pad">
          <h2 className="admin-panel-title">Access</h2>
          <div className="admin-switches">
            <Switch checked={form.maintenance} onChange={(v) => setForm({ ...form, maintenance: v })}
              label="Maintenance mode" description="Show a maintenance notice on the landing page." />
            <Switch checked={form.registrationOpen} onChange={(v) => setForm({ ...form, registrationOpen: v })}
              label="Open registration" description="Allow new accounts to be created." />
            <Switch checked={form.guestPlay} onChange={(v) => setForm({ ...form, guestPlay: v })}
              label="Guest play" description="Let visitors play without an account." />
          </div>
          <div className="admin-danger-zone">
            <h2 className="admin-panel-title">Demo data</h2>
            <p className="muted">Restore the original seed data. All local changes, including accounts and matches, are replaced.</p>
            <Button variant="danger" icon={<RotateCcw size={15} />} onClick={() => setResetting(true)}>Reset demo data</Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={resetting} onClose={() => setResetting(false)}
        onConfirm={() => { resetDb(); toast('Demo data restored to the original seed.', 'success'); }}
        title="Reset demo data" body="Replace all local data with the original seed? This cannot be undone."
        confirmLabel="Reset data"
      />
    </AdminPage>
  );
}