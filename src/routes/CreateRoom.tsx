import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { socketClient } from '@/services/socketClient';
import { SeoHead } from '@/components/SeoHead';
import { Button, Field, Input, NativeSelect, Segmented, Textarea } from '@/components/ui';
import type { Difficulty, RoomVisibility } from '@/types';

export default function CreateRoom() {
  const { t, path } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const cfg = { defaultRounds: 3, minRoundSeconds: 30, maxRoundSeconds: 180 };

  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<RoomVisibility>('public');
  const [password, setPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [rounds, setRounds] = useState(cfg.defaultRounds);
  const [roundSeconds, setRoundSeconds] = useState(80);
  const [difficulty, setDifficulty] = useState<Difficulty | 'mixed'>('mixed');
  const [wordMode, setWordMode] = useState<'all' | 'easy' | 'medium' | 'hard' | 'custom'>('all');
  const [customWords, setCustomWords] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return <Navigate to={path('/play')} replace />;

  const submit = async () => {
    if (visibility === 'private' && password.trim().length > 0 && password.trim().length < 4) {
      setError(t('create.passwordHint'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const room = await socketClient.request<{ code: string }>('room:create', {
        name, visibility, password: visibility === 'private' ? password.trim() || undefined : undefined,
        maxPlayers, rounds, roundSeconds, difficulty, wordMode,
        customWords: wordMode === 'custom' ? customWords.split('\n').map((word) => word.trim()).filter(Boolean) : [],
      });
      toast(t('create.created'), 'success');
      navigate(path(`/room/${room.code}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <SeoHead title={`${t('create.title')} · DrawSpace`} description={t('seo.create')} noindex />
      <div className="container container-narrow">
        <div className="page-head">
          <h1 className="page-title">{t('create.title')}</h1>
          <p className="page-sub">{t('create.sub')}</p>
        </div>

        <div className="panel panel-pad">
          <div className="form-grid">
            <div className="field-full">
              <Field label={t('common.roomName')} htmlFor="room-name">
                <Input id="room-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${user.username}'s room`} maxLength={32} />
              </Field>
            </div>

            <Field label={t('create.visibility')}>
              <Segmented
                label={t('create.visibility')}
                value={visibility}
                onChange={setVisibility}
                options={[
                  { value: 'public', label: t('common.public') },
                  { value: 'private', label: t('common.private') },
                ]}
              />
            </Field>

            <Field label={`${t('common.password')} (${t('common.optional')})`} hint={t('create.passwordHint')} error={error} htmlFor="room-password">
              <Input id="room-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
            </Field>

            <Field label={t('common.maxPlayers')} htmlFor="max-players">
              <NativeSelect id="max-players" value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
                {[2, 4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
              </NativeSelect>
            </Field>

            <Field label={t('common.rounds')} htmlFor="rounds">
              <NativeSelect id="rounds" value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
                {[2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </NativeSelect>
            </Field>

            <Field label={`${t('common.roundDuration')}: ${roundSeconds}s`} htmlFor="round-seconds">
              <input
                id="round-seconds"
                type="range"
                min={cfg.minRoundSeconds}
                max={cfg.maxRoundSeconds}
                step={5}
                value={roundSeconds}
                onChange={(e) => setRoundSeconds(Number(e.target.value))}
                className="range"
                aria-valuetext={`${roundSeconds} ${t('common.seconds')}`}
              />
            </Field>

            <Field label={t('common.difficulty')}>
              <Segmented
                label={t('common.difficulty')}
                value={difficulty}
                onChange={setDifficulty}
                options={[
                  { value: 'easy', label: t('common.easy') },
                  { value: 'medium', label: t('common.medium') },
                  { value: 'hard', label: t('common.hard') },
                  { value: 'mixed', label: t('common.mixed') },
                ]}
              />
            </Field>

            <div className="field-full">
              <Field label={t('create.wordSelection')} htmlFor="word-mode">
                <NativeSelect id="word-mode" value={wordMode} onChange={(e) => setWordMode(e.target.value as typeof wordMode)}>
                  <option value="all">{t('create.wordAll')}</option>
                  <option value="easy">{t('create.wordEasy')}</option>
                  <option value="medium">{t('create.wordMedium')}</option>
                  <option value="hard">{t('create.wordHard')}</option>
                  <option value="custom">{t('create.customWords')}</option>
                </NativeSelect>
              </Field>
            </div>

            {wordMode === 'custom' && (
              <div className="field-full">
                <Field label={t('create.customWords')} hint={t('create.customWordsHint')} htmlFor="custom-words">
                  <Textarea id="custom-words" value={customWords} onChange={(e) => setCustomWords(e.target.value)} placeholder={'guitar\nbridge\nrocket'} />
                </Field>
              </div>
            )}
          </div>

          <div className="form-actions">
            <Button variant="ghost" onClick={() => navigate(path('/play'))}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => void submit()} loading={busy}>{t('common.createRoom')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
