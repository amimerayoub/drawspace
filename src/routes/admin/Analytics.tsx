import { Activity, Clock, Gamepad2, Users } from 'lucide-react';
import { ANALYTICS } from '@/data/mock';
import { BarChart, Donut, LineChart } from '@/components/charts';
import { AdminPage, StatCard } from './shared';
import { UnavailableFeature } from './UnavailableFeature';

const DAY_LABELS = ['Oct 29', 'Nov 11'];

function recentDayLabels(count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000);
    out.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }
  return out;
}

export default function Analytics() {
  return <UnavailableFeature title="Analytics" explanation="No production event analytics or aggregate reporting API is connected. Demo charts are disabled." />;
  const lastDau = ANALYTICS.dau[ANALYTICS.dau.length - 1];
  const lastMatches = ANALYTICS.matches[ANALYTICS.matches.length - 1];
  const weekLabels = recentDayLabels(7);

  return (
    <AdminPage title="Analytics" sub="Last 14 days. Demo data, refreshed nightly in production.">
      <div className="admin-stat-grid">
        <StatCard label="Daily active players" value={lastDau.toLocaleString()} hint="Yesterday" icon={<Users size={17} />} />
        <StatCard label="Matches played" value={lastMatches.toLocaleString()} hint="Yesterday" icon={<Gamepad2 size={17} />} />
        <StatCard label="7 day retention" value={`${ANALYTICS.retention}%`} hint="New players returning" icon={<Activity size={17} />} />
        <StatCard label="Avg match length" value={`${ANALYTICS.avgMatchMinutes} min`} hint="All rooms" icon={<Clock size={17} />} />
      </div>

      <div className="admin-grid-2">
        <div className="panel panel-pad">
          <h2 className="admin-panel-title">Daily active players</h2>
          <LineChart data={ANALYTICS.dau} labels={DAY_LABELS} label="Daily active players over 14 days" />
        </div>
        <div className="panel panel-pad">
          <h2 className="admin-panel-title">New signups</h2>
          <LineChart data={ANALYTICS.signups} labels={DAY_LABELS} label="New signups over 14 days" />
        </div>
      </div>

      <div className="admin-grid-2">
        <div className="panel panel-pad">
          <h2 className="admin-panel-title">Matches per day</h2>
          <BarChart data={ANALYTICS.matches.slice(-7).map((v, i) => ({ label: weekLabels[i], value: v }))} label="Matches per day, last 7 days" />
        </div>
        <div className="panel panel-pad">
          <h2 className="admin-panel-title">Most guessed words</h2>
          <BarChart data={ANALYTICS.topWords.map((w) => ({ label: w.word, value: w.guesses }))} label="Most guessed words" />
        </div>
      </div>

      <div className="admin-grid-2">
        <div className="panel panel-pad">
          <h2 className="admin-panel-title">Players by locale</h2>
          <Donut data={ANALYTICS.locales.map((l) => ({ label: l.locale, value: l.share }))} label="Share of players by locale" />
        </div>
        <div className="panel panel-pad">
          <h2 className="admin-panel-title">Vocabulary</h2>
          <div className="admin-analytics-facts">
            <div><span className="admin-stat-value mono">{ANALYTICS.wordsGuessed.toLocaleString()}</span><span className="admin-stat-label">Words guessed, all time</span></div>
            <div><span className="admin-stat-value mono">{ANALYTICS.topWords[0].word}</span><span className="admin-stat-label">Most guessed word</span></div>
            <div><span className="admin-stat-value mono">{ANALYTICS.locales.length}</span><span className="admin-stat-label">Active locales</span></div>
          </div>
          <p className="faint admin-field-hint">Gameplay words are always English. Locale affects the interface only.</p>
        </div>
      </div>
    </AdminPage>
  );
}
