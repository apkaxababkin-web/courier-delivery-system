import { useEffect, useState } from 'react';
import { getMaxManagerSettings, saveMaxManagerSetting, revokeMaxManagerSetting } from '../lib/api';

type Manager={id:number;name:string;username:string};
type Link={maxUserId:string;managerId:number;managerName:string;enabled:boolean;canApprove:boolean};
export default function MaxSettingsView(){
 const [managers,setManagers]=useState<Manager[]>([]);
 const [links,setLinks]=useState<Link[]>([]);
 const [maxId,setMaxId]=useState('');
 const [managerId,setManagerId]=useState(0);
 const [enabled,setEnabled]=useState(true);
 const [canApprove,setCanApprove]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const load=async()=>{const d=await getMaxManagerSettings();setManagers(d.managers);setLinks(d.links);setManagerId(old=>old||d.managers[0]?.id||0)};
 useEffect(()=>{void load().catch(e=>setError(String(e.message||e)))},[]);
 const save=async()=>{setError('');setBusy(true);try{await saveMaxManagerSetting(maxId,managerId,enabled,canApprove);setMaxId('');await load()}catch(e){setError(String(e instanceof Error?e.message:e))}finally{setBusy(false)}};
 const revoke=async(id:string)=>{setError('');setBusy(true);try{await revokeMaxManagerSetting(id);await load()}catch(e){setError(String(e instanceof Error?e.message:e))}finally{setBusy(false)}};
 return <div className="mx-auto max-w-4xl space-y-5 p-5">
   <header><h1 className="text-2xl font-semibold text-slate-900">Настройки MAX</h1><p className="text-sm text-slate-500">Кто может согласовывать заявки в MAX. Изменения действуют сразу.</p></header>
   {error&&<div role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
   <section className="rounded-xl border bg-white p-4 space-y-3">
    <h2 className="font-semibold">Привязать MAX-аккаунт</h2>
    <input aria-label="MAX ID" className="w-full rounded-lg border p-2" placeholder="MAX ID (только цифры)" value={maxId} onChange={e=>setMaxId(e.target.value.trim())}/>
    <select aria-label="Менеджер" className="w-full rounded-lg border p-2" value={managerId} onChange={e=>setManagerId(Number(e.target.value))}>{managers.map(m=><option key={m.id} value={m.id}>{m.name} · {m.username} · ID {m.id}</option>)}</select>
    <label className="flex gap-2"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Доступ включён</label>
    <label className="flex gap-2"><input type="checkbox" checked={canApprove} onChange={e=>setCanApprove(e.target.checked)}/> Может принимать и отклонять заявки</label>
    <button disabled={busy||!/^\d{1,20}$/.test(maxId)||!managerId} onClick={save} className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50">Сохранить привязку</button>
   </section>
   <section className="rounded-xl border bg-white p-4 space-y-3"><h2 className="font-semibold">Действующие привязки</h2>
    {links.length===0&&<p className="text-sm text-slate-500">Привязок пока нет.</p>}
    {links.map(l=><div key={l.maxUserId} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"><div><b>{l.maxUserId}</b> → {l.managerName} <span className="text-slate-500">{l.enabled&&l.canApprove?'· Согласование разрешено':'· Доступ отключён'}</span></div><div className="flex gap-2"><button disabled={busy} onClick={()=>{setMaxId(l.maxUserId);setManagerId(l.managerId);setEnabled(l.enabled);setCanApprove(l.canApprove)}} className="rounded-lg border px-3 py-2">Изменить</button><button disabled={busy||!l.enabled} onClick={()=>revoke(l.maxUserId)} className="rounded-lg border border-red-200 px-3 py-2 text-red-700 disabled:opacity-50">Отключить</button></div></div>)}
   </section>
   <p className="text-xs text-slate-500">Ссылки и переключатели клиентских чатов настраиваются в карточках клиентов раздела «Контрагенты».</p>
 </div>
}
