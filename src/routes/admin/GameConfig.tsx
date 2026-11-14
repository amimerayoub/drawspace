import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { backendAdminService } from '@/services/backendAdmin.service';
import { useToast } from '@/context/ToastContext';
import { Button, Field, Input, Switch } from '@/components/ui';
import { AdminPage, FieldRow } from './shared';

type Settings={maxPlayers:number;guessRateLimitPerMinute:number;chatRateLimitPerMinute:number;allowCustomWords:boolean};
const initial:Settings={maxPlayers:12,guessRateLimitPerMinute:60,chatRateLimitPerMinute:30,allowCustomWords:true};
export default function GameConfig(){
  const [form,setForm]=useState(initial);const [busy,setBusy]=useState(false);const {toast}=useToast();
  useEffect(()=>{void backendAdminService.gameSettings().then(setForm).catch(e=>toast(e instanceof Error?e.message:'Game settings could not be loaded.','error'));},[]);
  const save=async()=>{try{setBusy(true);await backendAdminService.saveGameSettings(form);toast('Game settings saved. The server enforces room capacity, word access, and guess rate limits.','success');}catch(e){toast(e instanceof Error?e.message:'Settings could not be saved.','error');}finally{setBusy(false);}};
  return <AdminPage title="Game configuration" sub="Persisted settings are applied by the game server to new room and guess requests." actions={<Button variant="primary" icon={<Save size={15}/>} disabled={busy} onClick={()=>void save()}>Save changes</Button>}>
    <div className="admin-grid-2"><div className="panel panel-pad"><h2 className="admin-panel-title">Supported server rules</h2>
      <FieldRow label="Maximum players per room" hint="Existing platform_settings.maxRoomCapacity column; 2–32."><Input type="number" min={2} max={32} value={form.maxPlayers} onChange={e=>setForm({...form,maxPlayers:Number(e.target.value)})}/></FieldRow>
      <FieldRow label="Guesses per minute" hint="Per connected account, enforced by the socket server."><Input type="number" min={5} max={300} value={form.guessRateLimitPerMinute} onChange={e=>setForm({...form,guessRateLimitPerMinute:Number(e.target.value)})}/></FieldRow>
      <FieldRow label="Chat messages per minute" hint="Persisted in the existing settings schema; socket chat limit is not currently applied separately."><Input type="number" min={5} max={300} value={form.chatRateLimitPerMinute} onChange={e=>setForm({...form,chatRateLimitPerMinute:Number(e.target.value)})}/></FieldRow>
      <Switch checked={form.allowCustomWords} onChange={v=>setForm({...form,allowCustomWords:v})} label="Allow custom word rooms" description="The socket server rejects custom-word rooms when disabled."/>
    </div><div className="panel panel-pad"><h2 className="admin-panel-title">Pending schema support</h2><p className="muted">Round duration, round count, scoring rules, XP reward rules, minimum players, hint rules, drawing limits, and choice timing have no corresponding persisted fields in the inspected Appwrite schema. Current gameplay defaults remain server-defined. These controls need an approved schema design before they can be administered.</p></div></div>
  </AdminPage>;
}
