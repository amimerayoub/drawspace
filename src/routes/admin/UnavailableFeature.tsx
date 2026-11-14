import { AlertTriangle } from 'lucide-react';
import { AdminPage } from './shared';

export function UnavailableFeature({ title, explanation }: { title: string; explanation: string }) {
  return <AdminPage title={title} sub="This screen is retained from the Phase 1 admin UI."><div className="panel panel-pad"><AlertTriangle size={18} className="accent" aria-hidden /><p role="status" className="muted">{explanation}</p></div></AdminPage>;
}
