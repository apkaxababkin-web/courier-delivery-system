import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Building2, ChevronRight, Edit2, MapPin, Phone, Plus, Search, Store, Trash2, UserRound, X } from 'lucide-react';
import * as api from '../lib/api';

type Client = { id:number; name:string; address:string; contactPerson?:string; phone?:string; email?:string };
type Point = { id:string; name:string; address:string; contactPerson?:string; phone?:string; isPrimary?:boolean };
type ClientForm = { name:string; address:string; contactPerson:string; phone:string; email:string };
type PointForm = { name:string; address:string; contactPerson:string; phone:string };

const emptyClient:ClientForm={name:'',address:'',contactPerson:'',phone:'',email:''};
const emptyPoint:PointForm={name:'',address:'',contactPerson:'',phone:''};
const inputClass='h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white';
const buttonPrimary='inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white shadow-lg shadow-slate-950/10 hover:opacity-95';
const buttonSecondary='inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50';

function pointKey(id:number){return `client-points:${id}`}
function primaryPoint(client:Client):Point{return {id:'primary',name:'Основная точка',address:client.address,contactPerson:client.contactPerson,phone:client.phone,isPrimary:true}}

export default function ClientsViewV2(){
 const [clients,setClients]=useState<Client[]>([]);
 const [loading,setLoading]=useState(true);
 const [query,setQuery]=useState('');
 const [selected,setSelected]=useState<Client|null>(null);
 const [points,setPoints]=useState<Point[]>([]);
 const [showClientModal,setShowClientModal]=useState(false);
 const [editingClientId,setEditingClientId]=useState<number|null>(null);
 const [clientForm,setClientForm]=useState<ClientForm>(emptyClient);
 const [showPointModal,setShowPointModal]=useState(false);
 const [editingPointId,setEditingPointId]=useState<string|null>(null);
 const [pointForm,setPointForm]=useState<PointForm>(emptyPoint);

 useEffect(()=>{loadClients()},[]);

 async function loadClients(){
  try{setLoading(true);const data=await api.getAllClients();setClients(data||[]);if(selected){const fresh=(data||[]).find((c:Client)=>c.id===selected.id);if(fresh){setSelected(fresh);loadPoints(fresh)}}}
  catch(e){console.error(e);alert('Ошибка при загрузке клиентов')}
  finally{setLoading(false)}
 }

 function loadPoints(client:Client){
  try{const saved=localStorage.getItem(pointKey(client.id));const parsed=saved?JSON.parse(saved):[];setPoints([primaryPoint(client),...parsed.filter((x:Point)=>!x.isPrimary)])}
  catch{setPoints([primaryPoint(client)])}
 }

 function openClient(client:Client){setSelected(client);loadPoints(client)}
 function savePoints(next:Point[]){if(!selected)return;setPoints(next);localStorage.setItem(pointKey(selected.id),JSON.stringify(next.filter(x=>!x.isPrimary)))}

 function openClientForm(client?:Client){
  if(client){setEditingClientId(client.id);setClientForm({name:client.name,address:client.address,contactPerson:client.contactPerson||'',phone:client.phone||'',email:client.email||''})}
  else{setEditingClientId(null);setClientForm(emptyClient)}
  setShowClientModal(true)
 }

 async function submitClient(e:React.FormEvent){
  e.preventDefault();
  if(!clientForm.name.trim()||!clientForm.address.trim())return alert('Название и адрес обязательны');
  try{
   if(editingClientId)await api.updateClient(editingClientId,clientForm); else await api.createClient(clientForm);
   setShowClientModal(false);setEditingClientId(null);setClientForm(emptyClient);await loadClients();
  }catch(err){console.error(err);alert('Ошибка при сохранении клиента')}
 }

 async function deleteClient(client:Client){
  if(!confirm(`Удалить клиента «${client.name}»?`))return;
  try{await api.deleteClient(client.id);localStorage.removeItem(pointKey(client.id));setSelected(null);await loadClients()}catch(e){console.error(e);alert('Ошибка при удалении клиента')}
 }

 function openPointForm(point?:Point){
  if(point){setEditingPointId(point.id);setPointForm({name:point.name,address:point.address,contactPerson:point.contactPerson||'',phone:point.phone||''})}
  else{setEditingPointId(null);setPointForm(emptyPoint)}
  setShowPointModal(true)
 }

 function submitPoint(e:React.FormEvent){
  e.preventDefault();
  if(!pointForm.name.trim()||!pointForm.address.trim())return alert('Название точки и адрес обязательны');
  const payload={name:pointForm.name.trim(),address:pointForm.address.trim(),contactPerson:pointForm.contactPerson.trim()||undefined,phone:pointForm.phone.trim()||undefined};
  const next=editingPointId?points.map(p=>p.id===editingPointId?{...p,...payload}:p):[...points,{id:String(Date.now()),...payload}];
  savePoints(next);setShowPointModal(false);setEditingPointId(null);setPointForm(emptyPoint);
 }

 const filtered=useMemo(()=>{const q=query.toLowerCase().trim();if(!q)return clients;return clients.filter(c=>[c.name,c.address,c.phone,c.contactPerson,c.email].filter(Boolean).join(' ').toLowerCase().includes(q))},[clients,query]);

 if(selected){return <div className='space-y-5'>
  <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
   <div className='flex items-start gap-4'><button onClick={()=>setSelected(null)} className='inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'><ArrowLeft className='h-4 w-4'/></button><div><h1 className='text-2xl font-semibold tracking-tight text-slate-950'>{selected.name}</h1><p className='mt-1 text-sm text-slate-500'>Магазины, точки, руководители и будущие кабинеты.</p></div></div>
   <div className='flex flex-wrap gap-2'><button onClick={()=>openClientForm(selected)} className={buttonSecondary}><Edit2 className='h-4 w-4'/>Редактировать</button><button onClick={()=>deleteClient(selected)} className={buttonSecondary}><Trash2 className='h-4 w-4'/>Удалить</button><button onClick={()=>openPointForm()} className={buttonPrimary}><Plus className='h-4 w-4'/>Добавить точку</button></div>
  </div>

  <div className='grid gap-4 lg:grid-cols-[1.2fr_0.8fr]'><div className='rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm'><div className='flex items-center gap-2 text-sm font-semibold text-slate-950'><Building2 className='h-4 w-4'/>Основная информация</div><div className='mt-4 grid gap-3 sm:grid-cols-2'><Info label='Адрес' value={selected.address} full/><Info label='Контакт' value={selected.contactPerson||'—'}/><Info label='Телефон' value={selected.phone||'—'}/><Info label='Email' value={selected.email||'—'} full/></div></div><div className='grid gap-3'><Metric label='Точек' value={points.length}/><Metric label='Магазинов' value={Math.max(points.length-1,0)}/><Metric label='Статус' value='Активен'/></div></div>

  <div className='rounded-[28px] border border-slate-200 bg-white shadow-sm'><div className='flex items-center justify-between border-b border-slate-200 px-5 py-4'><div><h2 className='text-sm font-semibold text-slate-950'>Точки и магазины</h2><p className='mt-1 text-xs text-slate-500'>Карточка открывается кликом по всей области. Действия не мешают открытию.</p></div><div className='text-xs text-slate-400'>{points.length} точек</div></div><div className='grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3'>{points.map(point=><button key={point.id} onClick={()=>alert(`Точка: ${point.name}`)} className='group rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-md'><div className='flex items-start justify-between gap-3'><div className='flex items-center gap-3'><div className='flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700'><Store className='h-4 w-4'/></div><div><p className='text-sm font-semibold text-slate-950'>{point.name}</p><p className='mt-1 text-xs text-slate-500'>{point.isPrimary?'Основная точка':'Магазин / филиал'}</p></div></div><ChevronRight className='h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-950'/></div><div className='mt-4 rounded-2xl border border-slate-200 bg-white p-3'><div className='flex items-start gap-2 text-sm text-slate-700'><MapPin className='mt-0.5 h-4 w-4 shrink-0 text-slate-400'/><span>{point.address}</span></div>{(point.contactPerson||point.phone)&&<div className='mt-3 space-y-1 text-xs text-slate-500'>{point.contactPerson&&<div className='flex items-center gap-2'><UserRound className='h-3.5 w-3.5'/>{point.contactPerson}</div>}{point.phone&&<div className='flex items-center gap-2'><Phone className='h-3.5 w-3.5'/>{point.phone}</div>}</div>}</div><div className='mt-4 flex gap-2'><button type='button' onClick={(e)=>{e.stopPropagation();openPointForm(point)}} className='inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50'><Edit2 className='h-3.5 w-3.5'/>Редактировать</button>{!point.isPrimary&&<button type='button' onClick={(e)=>{e.stopPropagation();if(confirm(`Удалить точку «${point.name}»?`))savePoints(points.filter(x=>x.id!==point.id))}} className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100'><Trash2 className='h-3.5 w-3.5'/></button>}</div></button>)}</div></div>

  <div className='rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm'><div className='flex items-center gap-2 text-sm font-semibold text-slate-950'><UserRound className='h-4 w-4'/>Архитектура под руководителя</div><div className='mt-4 grid gap-3 md:grid-cols-3'><Architecture title='Руководитель' text='Будущий кабинет директора с отчётами и аналитикой.'/><Architecture title='Магазин' text='Отдельный доступ магазина к своим заявкам.'/><Architecture title='Операции' text='Назначения, доставка и KPI по точкам.'/></div></div>
  {showClientModal&&<ClientModal form={clientForm} setForm={setClientForm} editing={Boolean(editingClientId)} onSubmit={submitClient} onClose={()=>setShowClientModal(false)}/>} {showPointModal&&<PointModal form={pointForm} setForm={setPointForm} editing={Boolean(editingPointId)} onSubmit={submitPoint} onClose={()=>setShowPointModal(false)}/>} </div>}

 return <div className='space-y-5'><div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'><div><h1 className='text-2xl font-semibold tracking-tight text-slate-950'>Клиенты</h1><p className='mt-1 text-sm text-slate-500'>Компании, магазины, точки и будущие кабинеты.</p></div><button onClick={()=>openClientForm()} className={buttonPrimary}><Plus className='h-4 w-4'/>Добавить клиента</button></div><div className='overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm'><div className='flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between'><div className='relative w-full max-w-md'><Search className='absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400'/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder='Поиск по клиенту или адресу...' className='h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-slate-300 focus:bg-white'/></div><div className='text-xs text-slate-400'>{filtered.length} клиентов</div></div>{loading?<div className='space-y-3 p-5'>{Array.from({length:6}).map((_,i)=><div key={i} className='skeleton-block h-20'/>)}</div>:filtered.length===0?<div className='flex min-h-72 flex-col items-center justify-center p-8 text-center'><Building2 className='mb-3 h-8 w-8 text-slate-300'/><p className='text-sm font-medium text-slate-950'>Клиенты не найдены</p></div>:<div className='overflow-x-auto'><table className='w-full min-w-[920px] text-sm'><thead className='border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500'><tr><th className='px-5 py-3 font-semibold'>Клиент</th><th className='px-5 py-3 font-semibold'>Адрес</th><th className='px-5 py-3 font-semibold'>Контакт</th><th className='px-5 py-3 font-semibold'>Телефон</th><th className='px-5 py-3 text-right font-semibold'>Открыть</th></tr></thead><tbody className='divide-y divide-slate-100'>{filtered.map(client=><tr key={client.id} onClick={()=>openClient(client)} className='group cursor-pointer hover:bg-slate-50/80'><td className='px-5 py-4'><p className='font-semibold text-slate-950'>{client.name}</p><p className='mt-1 text-xs text-slate-500'>Вся строка кликабельна</p></td><td className='px-5 py-4 text-slate-600'>{client.address}</td><td className='px-5 py-4 text-slate-600'>{client.contactPerson||'—'}</td><td className='px-5 py-4 text-slate-600'>{client.phone||'—'}</td><td className='px-5 py-4 text-right'><span className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition group-hover:bg-slate-950 group-hover:text-white'><ChevronRight className='h-4 w-4'/></span></td></tr>)}</tbody></table></div>}</div>{showClientModal&&<ClientModal form={clientForm} setForm={setClientForm} editing={Boolean(editingClientId)} onSubmit={submitClient} onClose={()=>setShowClientModal(false)}/>}</div>
}

function Metric({label,value}:{label:string;value:string|number}){return <div className='rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm'><p className='text-xs font-medium text-slate-500'>{label}</p><p className='mt-1 text-2xl font-semibold tracking-tight text-slate-950'>{value}</p></div>}
function Info({label,value,full=false}:{label:string;value:string;full?:boolean}){return <div className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${full?'sm:col-span-2':''}`}><p className='text-xs font-medium text-slate-500'>{label}</p><p className='mt-2 text-sm font-medium text-slate-900'>{value}</p></div>}
function Architecture({title,text}:{title:string;text:string}){return <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'><p className='text-sm font-semibold text-slate-950'>{title}</p><p className='mt-2 text-xs leading-5 text-slate-500'>{text}</p></div>}
function Field({label,value,onChange,required=false,type='text'}:{label:string;value:string;onChange:(v:string)=>void;required?:boolean;type?:string}){return <div><label className='mb-2 block text-sm font-medium text-slate-700'>{label}</label><input type={type} value={value} onChange={e=>onChange(e.target.value)} required={required} className={inputClass}/></div>}
function ClientModal({form,setForm,editing,onSubmit,onClose}:{form:ClientForm;setForm:React.Dispatch<React.SetStateAction<ClientForm>>;editing:boolean;onSubmit:(e:React.FormEvent)=>void;onClose:()=>void}){return createPortal(<div className='modal-overlay'><div className='w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20'><div className='mb-5 flex items-center justify-between'><div><h3 className='text-lg font-semibold text-slate-950'>{editing?'Редактировать клиента':'Добавить клиента'}</h3><p className='mt-1 text-sm text-slate-500'>Основная карточка клиента.</p></div><button onClick={onClose} className='rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50'><X className='h-4 w-4'/></button></div><form onSubmit={onSubmit} className='space-y-4'><Field label='Название *' value={form.name} onChange={v=>setForm(p=>({...p,name:v}))} required/><Field label='Адрес *' value={form.address} onChange={v=>setForm(p=>({...p,address:v}))} required/><Field label='Контактное лицо' value={form.contactPerson} onChange={v=>setForm(p=>({...p,contactPerson:v}))}/><Field label='Телефон' value={form.phone} onChange={v=>setForm(p=>({...p,phone:v}))} type='tel'/><Field label='Email' value={form.email} onChange={v=>setForm(p=>({...p,email:v}))} type='email'/><div className='flex gap-3 pt-2'><button className={`flex-1 ${buttonPrimary}`}>{editing?'Сохранить':'Добавить'}</button><button type='button' onClick={onClose} className={`flex-1 ${buttonSecondary}`}>Отмена</button></div></form></div></div>,document.body)}
function PointModal({form,setForm,editing,onSubmit,onClose}:{form:PointForm;setForm:React.Dispatch<React.SetStateAction<PointForm>>;editing:boolean;onSubmit:(e:React.FormEvent)=>void;onClose:()=>void}){return createPortal(<div className='modal-overlay'><div className='w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20'><div className='mb-5 flex items-center justify-between'><div><h3 className='text-lg font-semibold text-slate-950'>{editing?'Редактировать точку':'Добавить точку'}</h3><p className='mt-1 text-sm text-slate-500'>Магазин, склад или адрес клиента.</p></div><button onClick={onClose} className='rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50'><X className='h-4 w-4'/></button></div><form onSubmit={onSubmit} className='space-y-4'><Field label='Название точки *' value={form.name} onChange={v=>setForm(p=>({...p,name:v}))} required/><Field label='Адрес *' value={form.address} onChange={v=>setForm(p=>({...p,address:v}))} required/><Field label='Контактное лицо' value={form.contactPerson} onChange={v=>setForm(p=>({...p,contactPerson:v}))}/><Field label='Телефон' value={form.phone} onChange={v=>setForm(p=>({...p,phone:v}))} type='tel'/><div className='flex gap-3 pt-2'><button className={`flex-1 ${buttonPrimary}`}>{editing?'Сохранить':'Добавить'}</button><button type='button' onClick={onClose} className={`flex-1 ${buttonSecondary}`}>Отмена</button></div></form></div></div>,document.body)}
