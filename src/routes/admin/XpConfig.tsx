import { useCallback, useEffect, useState } from 'react';
import { RotateCw, Save } from 'lucide-react';
import type { XpSettings } from '@/types';
import { useToast } from '@/context/ToastContext';
import { backendAdminService } from '@/services/backendAdmin.service';
import { Button, Input, Spinner } from '@/components/ui';
import { AdminPage, FieldRow } from './shared';

const levelFor = (totalXp: number, base: number, growth: number) => {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  let needed = base;
  while (remaining >= needed && level < 99) { remaining -= needed; level += 1; needed = Math.round(base * growth ** (level - 1)); }
  return level;
};
const previewXp = [0, 100, 500, 1500, 5000, 12000];

export default function XpConfig() {
  const { toast } = useToast();
  const [form, setForm] = useState<XpSettings | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setForm(await backendAdminService.xpConfig());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'XP configuration could not be loaded.');
    } finally {
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const num = (key: keyof XpSettings, min: number, max: number, step = 1) => ({
    type: 'number' as const,
    min, max, step,
    value: form ? form[key] : 0,
    disabled: !form || saving,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(e.target.value);
      if (form && Number.isFinite(value)) setForm({ ...form, [key]: Math.min(max, Math.max(min, value)) });
    },
  });

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      setForm(await backendAdminService.saveXpConfig(form));
      toast('XP configuration saved. Applies to future matches and claims.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'XP configuration could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPage
      title="XP configuration"
      sub="Match rewards and the level curve used by the game server. Changes apply to future matches and claims."
      actions={<>
        <Button variant="secondary" icon={<RotateCw size={15} />} loading={refreshing} onClick={() => void load()}>Refresh</Button>
        <Button variant="primary" icon={<Save size={15} />} loading={saving} disabled={!form} onClick={() => void save()}>Save changes</Button>
      </>}
    >
      {error && <p role="alert" className="muted">{error}</p>}
      {!form && !error && <div className="page"><Spinner /></div>}

      {form && (
        <div className="admin-grid-2">
          <div className="panel panel-pad">
            <h2 className="admin-panel-title">Rewards</h2>
            <FieldRow label="Correct guess XP" hint="XP per correct guess, awarded when a match finishes.">
              <Input {...num('correctGuessXp', 0, 200)} />
            </FieldRow>
            <FieldRow label="Match win bonus" hint="Extra XP for the player who finishes first.">
              <Input {...num('winBonusXp', 0, 500)} />
            </FieldRow>
            <FieldRow label="Challenge multiplier" hint="Scales XP granted when a challenge is claimed.">
              <Input {...num('challengeMultiplier', 0.5, 5, 0.25)} />
            </FieldRow>
          </div>
          <div className="panel panel-pad">
            <h2 className="admin-panel-title">Level curve</h2>
            <FieldRow label="Base XP for level 2">
              <Input {...num('levelBase', 10, 5000)} />
            </FieldRow>
            <FieldRow label="Growth factor" hint="Each level needs this times more XP than the last.">
              <Input {...num('levelGrowth', 1, 2, 0.01)} />
            </FieldRow>
            <div className="admin-xp-preview">
              <p className="admin-form-label">Curve preview</p>
              <table className="admin-mini-table">
                <thead><tr><th>Total XP</th><th>Level with these settings</th></tr></thead>
                <tbody>
                  {previewXp.map((xp) => (
                    <tr key={xp}>
                      <td className="mono">{xp.toLocaleString()}</td>
                      <td className="mono">{levelFor(xp, form.levelBase, form.levelGrowth)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="faint admin-field-hint">Preview updates as you edit. Save to apply it to the game server.</p>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}