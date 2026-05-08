import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, ChevronRight, Edit2, MapPin, Phone, Plus, Search, Store, Trash2, UserRound } from 'lucide-react';
import * as api from '../lib/api';

type Client = {
  id:number;
  name:string;
  address:string;
  contactPerson?:string;
  phone?:string;
  email?:string;
};

type Point = {
  id:string;
  name:string;
  address:string;
  contactPerson?:string;
  phone?:string;
  isPrimary?:boolean;
};

const buttonPrimary='inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white';
const buttonSecondary='inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50';

function pointKey(id:number){return `client-points:${id}`}

export default function ClientsViewV2(){
 const [clients,setClients]=useState<Client[]>([]);
 const [loading,setLoading]=useState(true);
 const [query,setQuery]=useState('');
 const [selected,setSelected]=useState<Client|null>(null);
 const [points,setPoints]=useState<Point[]>([]);

 useEffect(()=>{loadClients()},[]);

 async function loadClients(){
  try{
   setLoading(true);
   const data=await api.getAllClients();
   setClients(data||[]);
  }catch(e){console.error(e)}finally{setLoading(false)}
 }

 function openClient(client:Client){
  setSelected(client);
  try{
   const saved=localStorage.getItem(pointKey(client.id));
   const parsed=saved?JSON.parse(saved):[];
   setPoints([{id:'primary',name:'Основная точка',address:client.address,contactPerson:client.contactPerson,phone:client.phone,isPrimary:true},...parsed]);
  }catch{
   setPoints([{id:'primary',name:'Основная точка',address:client.address,isPrimary:true}]);
  }
 }

 function savePoints(next:Point[]){
  if(!selected)return;
  setPoints(next);
  localStorage.setItem(pointKey(selected.id),JSON.stringify(next.filter(x=>!x.isPrimary)));
 }

 const filtered=useMemo(()=>{
  const q=query.toLowerCase().trim();
  if(!q)return clients;
  return clients.filter(c=>[c.name,c.address,c.phone,c.contactPerson].filter(Boolean).join(' ').toLowerCase().includes(q));
 },[clients,query]);

 if(selected){
  return <div className='space-y-5'>
   <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
    <div className='flex items-start gap-4'>
     <button onClick={()=>setSelected(null)} className='inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'><ArrowLeft className='h-4 w-4'/></button>
     <div>
      <h1 className='text-2xl font-semibold tracking-tight text-slate-950'>{selected.name}</h1>
      <p className='mt-1 text-sm text-slate-500'>Магазины, точки, руководители и будущие кабинеты.</p>
     </div>
    </div>
    <div className='flex gap-2'>
      <button className={buttonSecondary}><Edit2 className='h-4 w-4'/>Редактировать</button>
      <button className={buttonPrimary}><Plus className='h-4 w-4'/>Добавить точку</button>
    </div>
   </div>

   <div className='grid gap-4 lg:grid-cols-[1.2fr_0.8fr]'>
    <div className='rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm'>
      <div className='flex items-center gap-2 text-sm font-semibold text-slate-950'><Building2 className='h-4 w-4'/>Основная информация</div>
      <div className='mt-4 grid gap-3 sm:grid-cols-2'>
       <Info label='Адрес' value={selected.address} full />
       <Info label='Контакт' value={selected.contactPerson||'—'} />
       <Info label='Телефон' value={selected.phone||'—'} />
       <Info label='Email' value={selected.email||'—'} full />
      </div>
    </div>

    <div className='grid gap-3'>
      <Metric label='Точек' value={points.length}/>
      <Metric label='Магазинов' value={Math.max(points.length-1,0)}/>
      <Metric label='Статус' value='Активен'/>
    </div>
   </div>

   <div className='rounded-[28px] border border-slate-200 bg-white shadow-sm'>
    <div className='flex items-center justify-between border-b border-slate-200 px-5 py-4'>
      <div>
        <h2 className='text-sm font-semibold text-slate-950'>Точки и магазины</h2>
        <p className='mt-1 text-xs text-slate-500'>Полностью кликабельные карточки магазинов и точек.</p>
      </div>
      <div className='text-xs text-slate-400'>{points.length} точек</div>
    </div>

    <div className='grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3'>
      {points.map(point=><button key={point.id} onClick={()=>alert(`Точка: ${point.name}`)} className='group rounded-[24px] border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-md'>
        <div className='flex items-start justify-between gap-3'>
          <div className='flex items-center gap-3'>
            <div className='flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700'><Store className='h-4 w-4'/></div>
            <div>
              <p className='text-sm font-semibold text-slate-950'>{point.name}</p>
              <p className='mt-1 text-xs text-slate-500'>{point.isPrimary?'Основная точка':'Магазин / филиал'}</p>
            </div>
          </div>
          <ChevronRight className='h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-950'/>
        </div>

        <div className='mt-4 rounded-2xl border border-slate-200 bg-white p-3'>
          <div className='flex items-start gap-2 text-sm text-slate-700'><MapPin className='mt-0.5 h-4 w-4 shrink-0 text-slate-400'/><span>{point.address}</span></div>
          {(point.contactPerson||point.phone)&&<div className='mt-3 space-y-1 text-xs text-slate-500'>
            {point.contactPerson&&<div className='flex items-center gap-2'><UserRound className='h-3.5 w-3.5'/>{point.contactPerson}</div>}
            {point.phone&&<div className='flex items-center gap-2'><Phone className='h-3.5 w-3.5'/>{point.phone}</div>}
          </div>}
        </div>

        <div className='mt-4 flex gap-2'>
          <button onClick={(e)=>{e.stopPropagation();alert('Редактирование точки')}} className='inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50'><Edit2 className='h-3.5 w-3.5'/>Редактировать</button>
          {!point.isPrimary&&<button onClick={(e)=>{e.stopPropagation();savePoints(points.filter(x=>x.id!==point.id))}} className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100'><Trash2 className='h-3.5 w-3.5'/></button>}
        </div>
      </button>)}
    </div>
   </div>

   <div className='rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm'>
    <div className='flex items-center gap-2 text-sm font-semibold text-slate-950'><UserRound className='h-4 w-4'/>Архитектура под руководителя</div>
    <div className='mt-4 grid gap-3 md:grid-cols-3'>
      <Architecture title='Руководитель' text='Будущий кабинет директора с отчётами и аналитикой.'/>
      <Architecture title='Магазин' text='Отдельный доступ магазина к своим заявкам.'/>
      <Architecture title='Операции' text='Назначения, доставка и KPI по точкам.'/>
    </div>
   </div>
  </div>
 }

 return <div className='space-y-5'>
  <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
   <div>
    <h1 className='text-2xl font-semibold tracking-tight text-slate-950'>Клиенты</h1>
    <p className='mt-1 text-sm text-slate-500'>Компании, магазины, точки и будущие кабинеты.</p>
   </div>
   <button className={buttonPrimary}><Plus className='h-4 w-4'/>Добавить клиента</button>
  </div>

  <div className='overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm'>
   <div className='flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between'>
    <div className='relative w-full max-w-md'>
      <Search className='absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400'/>
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder='Поиск по клиенту или адресу...' className='h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-slate-300 focus:bg-white'/>
    </div>
    <div className='text-xs text-slate-400'>{filtered.length} клиентов</div>
   </div>

   {loading?<div className='space-y-3 p-5'>{Array.from({length:6}).map((_,i)=><div key={i} className='skeleton-block h-20'/>)}</div>:filtered.length===0?<div className='flex min-h-72 flex-col items-center justify-center p-8 text-center'><Building2 className='mb-3 h-8 w-8 text-slate-300'/><p className='text-sm font-medium text-slate-950'>Клиенты не найдены</p></div>:<div className='overflow-x-auto'>
    <table className='w-full min-w-[920px] text-sm'>
      <thead className='border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500'>
        <tr>
          <th className='px-5 py-3 font-semibold'>Клиент</th>
          <th className='px-5 py-3 font-semibold'>Адрес</th>
          <th className='px-5 py-3 font-semibold'>Контакт</th>
          <th className='px-5 py-3 font-semibold'>Телефон</th>
          <th className='px-5 py-3 text-right font-semibold'>Открыть</th>
        </tr>
      </thead>
      <tbody className='divide-y divide-slate-100'>
        {filtered.map(client=><tr key={client.id} onClick={()=>openClient(client)} className='group cursor-pointer hover:bg-slate-50/80'>
          <td className='px-5 py-4'><p className='font-semibold text-slate-950'>{client.name}</p><p className='mt-1 text-xs text-slate-500'>Вся строка кликабельна</p></td>
          <td className='px-5 py-4 text-slate-600'>{client.address}</td>
          <td className='px-5 py-4 text-slate-600'>{client.contactPerson||'—'}</td>
          <td className='px-5 py-4 text-slate-600'>{client.phone||'—'}</td>
          <td className='px-5 py-4 text-right'><span className='inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition group-hover:bg-slate-950 group-hover:text-white'><ChevronRight className='h-4 w-4'/></span></td>
        </tr>)}
      </tbody>
    </table>
   </div>}
  </div>
 </div>
}

function Metric({label,value}:{label:string;value:string|number}){
 return <div className='rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm'><p className='text-xs font-medium text-slate-500'>{label}</p><p className='mt-1 text-2xl font-semibold tracking-tight text-slate-950'>{value}</p></div>
}

function Info({label,value,full=false}:{label:string;value:string;full?:boolean}){
 return <div className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 ${full?'sm:col-span-2':''}`}><p className='text-xs font-medium text-slate-500'>{label}</p><p className='mt-2 text-sm font-medium text-slate-900'>{value}</p></div>
}

function Architecture({title,text}:{title:string;text:string}){
 return <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4'><p className='text-sm font-semibold text-slate-950'>{title}</p><p className='mt-2 text-xs leading-5 text-slate-500'>{text}</p></div>
}
