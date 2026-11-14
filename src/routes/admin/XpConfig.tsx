import { useState } from 'react';
import { Save } from 'lucide-react';
import type { XpConfig as XpConfigType } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService, levelForXp } from '@/services';
import { commit } from '@/services/db';
import { Button, Input } from '@/components/ui';
import { AdminPage, FieldRow, useAdmin } from './shared';
import { UnavailableFeature } from './UnavailableFeature';

export default function XpConfig() {
  return <UnavailableFeature title="XP configuration" explanation="There is no production XP configuration table. Match XP rules are server-owned; this demo editor is disabled." />;
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [form, setForm] = useState<XpConfigType>({ ...db.xpConfig });

  const num = (key: keyof XpConfigType, min: number, max: number, step = 1) => ({
    type: 'number' as const,
    min, max, step,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) setForm({ ...form, [key]: Math.min(max, Math.max(min, v)) });
    },
  });

  const save = () => {
    if (form.levelGrowth < 1) { toast('Level growth must be at least 1.', 'error'); return; }
    adminService.audit(name, 'config.xp', 'xp', JSON.stringify(db.xpConfig), JSON.stringify(form));
    Object.assign(db.xpConfig, form);
    commit();
    toast('XP configuration saved.', 'success');
  };

  const previewXp = [0, 100, 500, 1500, 5000, 12000];

  return (
    <AdminPage
      title="XP configuration"
      sub="Rewards and the level curve. Changes apply to future matches and claims."
      actions={<Button variant="primary" icon={<Save size={15} />} onClick={save}>Save changes</Button>}
    >
      <div className="admin-grid-2">
        <div className="panel panel-pad">
          <h2 className="admin-panel-title">Rewards</h2>
          <FieldRow label="Correct guess" hint="Base XP for guessing the word.">
            <Input {...num('correctGuess', 0, 200)} />
          </FieldRow>
          <FieldRow label="First guess bonus" hint="Extra XP for the first correct guess each round.">
            <Input {...num('firstGuessBonus', 0, 200)} />
          </FieldRow>
          <FieldRow label="Drawing, per correct guess" hint="XP the drawer earns each time someone guesses.">
            <Input {...num('drawingPerGuess', 0, 200)} />
          </FieldRow>
          <FieldRow label="Match win bonus">
            <Input {...num('winBonus', 0, 500)} />
          </FieldRow>
          <FieldRow label="Challenge multiplier" hint="Scales challenge rewards.">
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
              <thead><tr><th>Total XP</th><th>Level with current curve</th></tr></thead>
              <tbody>
                {previewXp.map((xp) => (
                  <tr key={xp}>
                    <td className="mono">{xp.toLocaleString()}</td>
                    <td className="mono">{levelForXp(xp).level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="faint admin-field-hint">Preview uses the saved curve. Save to see your changes here.</p>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
