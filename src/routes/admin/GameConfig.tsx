import { useState } from 'react';
import { Save } from 'lucide-react';
import type { GameConfig as GameConfigType } from '@/types';
import { useDb } from '@/hooks/useDb';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services';
import { commit } from '@/services/db';
import { Button, Field, Input, Switch } from '@/components/ui';
import { AdminPage, FieldRow, useAdmin } from './shared';

export default function GameConfig() {
  const db = useDb();
  const { name } = useAdmin();
  const { toast } = useToast();
  const [form, setForm] = useState<GameConfigType>({ ...db.gameConfig });

  const num = (key: keyof GameConfigType, min: number, max: number) => ({
    type: 'number' as const,
    min, max,
    value: form[key] as number,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) setForm({ ...form, [key]: Math.min(max, Math.max(min, v)) });
    },
  });

  const save = () => {
    if (form.minPlayers > form.maxPlayers) { toast('Minimum players cannot exceed the maximum.', 'error'); return; }
    if (form.minRoundSeconds > form.maxRoundSeconds) { toast('Minimum round time cannot exceed the maximum.', 'error'); return; }
    adminService.audit(name, 'config.game', 'game', JSON.stringify(db.gameConfig), JSON.stringify(form));
    Object.assign(db.gameConfig, form);
    commit();
    toast('Game configuration saved.', 'success');
  };

  return (
    <AdminPage
      title="Game configuration"
      sub="Limits and defaults applied to new rooms. Existing matches keep their settings."
      actions={<Button variant="primary" icon={<Save size={15} />} onClick={save}>Save changes</Button>}
    >
      <div className="admin-grid-2">
        <div className="panel panel-pad">
          <h2 className="admin-panel-title">Room limits</h2>
          <FieldRow label="Minimum players" hint="Bots fill in below this count in the demo.">
            <Input {...num('minPlayers', 2, 12)} />
          </FieldRow>
          <FieldRow label="Maximum players">
            <Input {...num('maxPlayers', 2, 12)} />
          </FieldRow>
          <FieldRow label="Default rounds">
            <Input {...num('defaultRounds', 1, 10)} />
          </FieldRow>
          <FieldRow label="Round time, minimum (seconds)">
            <Input {...num('minRoundSeconds', 15, 300)} />
          </FieldRow>
          <FieldRow label="Round time, maximum (seconds)">
            <Input {...num('maxRoundSeconds', 15, 300)} />
          </FieldRow>
        </div>
        <div className="panel panel-pad">
          <h2 className="admin-panel-title">Word selection</h2>
          <FieldRow label="Choices offered to the drawer">
            <Input {...num('wordChoiceCount', 2, 5)} />
          </FieldRow>
          <FieldRow label="Choice time (seconds)">
            <Input {...num('wordChoiceSeconds', 5, 60)} />
          </FieldRow>
          <FieldRow label="Skip vote ratio" hint="Share of players needed to skip a word.">
            <Input type="number" min={0.1} max={1} step={0.05} value={form.skipVoteRatio}
              onChange={(e) => setForm({ ...form, skipVoteRatio: Math.min(1, Math.max(0.1, Number(e.target.value) || 0.5)) })} />
          </FieldRow>
          <div className="admin-switches">
            <Switch checked={form.hintReveal} onChange={(v) => setForm({ ...form, hintReveal: v })}
              label="Reveal hint letters" description="Reveal letters as the round timer runs down." />
            <Switch checked={form.allowGuests} onChange={(v) => setForm({ ...form, allowGuests: v })}
              label="Allow guests" description="Guests play without an account." />
          </div>
        </div>
      </div>
    </AdminPage>
  );
}