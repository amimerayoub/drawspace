import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import type { Locale, SystemSettings } from '@/types';
import { useToast } from '@/context/ToastContext';
import { backendAdminService } from '@/services/backendAdmin.service';
import { LOCALES } from '@/i18n/I18nContext';
import { Button, Input, NativeSelect, Switch } from '@/components/ui';
import { AdminPage, FieldRow } from './shared';

export default function Settings() {
  const { toast } = useToast();
  const [form, setForm] = useState<SystemSettings>({ siteName: '', tagline: '', maintenance: false, registrationOpen: false, guestPlay: false, defaultLocale: 'en-US', contactEmail: '' });
  const [error, setError] = useState('');
  useEffect(() => { void backendAdminService.settings().then((settings) => { if (settings) setForm(settings); }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Platform settings could not be loaded.')); }, []);

  const save = async () => {
    if (!form.siteName.trim()) { toast('Site name cannot be empty.', 'error'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.contactEmail)) { toast('Enter a valid contact email.', 'error'); return; }
    try { await backendAdminService.saveSettings(form); toast('Platform settings saved.', 'success'); setError(''); }
    catch (e) { toast(e instanceof Error ? e.message : 'Platform settings could not be saved.', 'error'); }
  };

  return (
    <AdminPage
      title="System settings"
      sub="Site identity and access switches are stored in the platform settings table."
      actions={<Button variant="primary" icon={<Save size={15} />} onClick={() => void save()} disabled={Boolean(error)}>Save changes</Button>}
    >
      {error && <p role="alert" className="muted">{error}</p>}
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
            <p className="muted">Reset is disabled in the connected production admin. It only applied to local mock data.</p>
            <Button variant="danger" icon={<Save size={15} />} disabled>Reset demo data unavailable</Button>
          </div>
        </div>
      </div>

    </AdminPage>
  );
}
