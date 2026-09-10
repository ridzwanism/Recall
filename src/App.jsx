import { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, Mic, MicOff, Moon, Sun, Download, Upload, X, MapPin,
  Building2, Users, Sparkles, Trash2, Edit2, ChevronDown, ChevronUp,
  User, Calendar, Clock, BookOpen
} from 'lucide-react';

const GRADS = [
  'from-purple-500 to-pink-500','from-blue-500 to-cyan-500',
  'from-amber-500 to-orange-500','from-emerald-500 to-teal-500',
  'from-rose-500 to-red-500','from-indigo-500 to-purple-500',
  'from-fuchsia-500 to-pink-500','from-cyan-500 to-blue-500',
];
const getGrad = n => { let h=0; for(let i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))%GRADS.length; return GRADS[Math.abs(h)%GRADS.length]; };
const getInit = n => n.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')||'?';
const toLocal = iso => { const d=iso?new Date(iso):new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); };
const fmtDT = iso => { if(!iso)return ''; try{return new Date(iso).toLocaleString('en-MY',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch{return new Date(iso).toLocaleString();} };
const fmtD  = iso => { if(!iso)return ''; try{return new Date(iso).toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'});}catch{return new Date(iso).toLocaleDateString();} };

const EMPTY = { name:'',location:'',company:'',connection:'',notes:'',physicalFeatures:[],character:[],dateMet:new Date().toISOString().split('T')[0] };

export default function App() {
  const [people,setPeople]=useState([]);
  const [loading,setLoading]=useState(true);
  const [dark,setDark]=useState(false);
  const [q,setQ]=useState('');
  const [filters,setFilters]=useState({location:[],physical:[],character:[],company:[],connection:[]});
  const [fOpen,setFOpen]=useState(false);
  const [addOpen,setAddOpen]=useState(false);
  const [editing,setEditing]=useState(null);
  const [detail,setDetail]=useState(null);
  const [form,setForm]=useState(EMPTY);
  const [rec,setRec]=useState(false);
  const [transcript,setTrans]=useState('');
  const [processing,setProc]=useState(false);
  const [vErr,setVErr]=useState('');
  const [lang,setLang]=useState('en-US');
  const [speechOK,setSpeechOK]=useState(true);
  const recRef=useRef(null);
  const importRef=useRef(null);
  const [showLog,setShowLog]=useState(false);
  const [newLog,setNewLog]=useState({datetime:toLocal(),note:'',location:''});
  const [editLogId,setEditLogId]=useState(null);
  const [editLogData,setEditLogData]=useState({});
  const [toast,setToast]=useState('');

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(''),2800); };

  const T = dark ? {
    bg:'bg-slate-950',card:'bg-slate-900',text:'text-slate-100',muted:'text-slate-400',
    border:'border-slate-800',inp:'bg-slate-900 border-slate-800 text-slate-100 placeholder-slate-500',
    tag:'bg-slate-800 text-slate-300',vbg:'bg-slate-800',hbg:'bg-slate-950',dbg:'bg-slate-800/60'
  }:{
    bg:'bg-gray-50',card:'bg-white',text:'text-gray-900',muted:'text-gray-500',
    border:'border-gray-200',inp:'bg-white border-gray-200 text-gray-900 placeholder-gray-400',
    tag:'bg-gray-100 text-gray-600',vbg:'bg-purple-50',hbg:'bg-white',dbg:'bg-gray-50'
  };

  /* ── Persistence (localStorage) ── */
  useEffect(()=>{
    try{ const s=localStorage.getItem('rcl-people'); if(s) setPeople(JSON.parse(s)); }catch{}
    try{ const t=localStorage.getItem('rcl-theme');  if(t) setDark(t==='dark'); }catch{}
    setLoading(false);
  },[]);
  useEffect(()=>{ if(loading)return; try{localStorage.setItem('rcl-people',JSON.stringify(people));}catch{} },[people,loading]);
  useEffect(()=>{ if(loading)return; try{localStorage.setItem('rcl-theme',dark?'dark':'light');}catch{} },[dark,loading]);

  /* ── Speech Recognition ── */
  useEffect(()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){setSpeechOK(false);return;}
    const r=new SR(); r.continuous=true; r.interimResults=true;
    r.onresult=e=>{ let t=''; for(let i=0;i<e.results.length;i++) t+=e.results[i][0].transcript+' '; setTrans(t.trim()); };
    r.onerror=e=>{setVErr('Error: '+e.error);setRec(false);};
    r.onend=()=>setRec(false);
    recRef.current=r;
  },[]);

  const startRec=()=>{ if(!recRef.current){setVErr('Not supported.');return;} setTrans('');setVErr(''); recRef.current.lang=lang; try{recRef.current.start();setRec(true);}catch{setVErr('Could not start mic.');} };
  const stopRec=()=>{ try{recRef.current?.stop();}catch{} setRec(false); };

  /* ── Voice AI Auto-fill ── */
  const processVoice=async()=>{
    if(!transcript.trim())return;
    setProc(true); setVErr('');
    const apiKey=import.meta.env.VITE_ANTHROPIC_KEY;
    if(!apiKey){ setVErr('Add VITE_ANTHROPIC_KEY to your .env file to enable voice auto-fill.'); setProc(false); return; }
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,messages:[{role:'user',content:`Extract structured info about a person from this spoken note (English, Malay, or mix). Return ONLY raw JSON, no markdown. Keys: name, location, company, connection, notes, physicalFeatures (string[]), character (string[]). Use "" or [] for missing. Note: "${transcript}"`}]})
      });
      const data=await res.json();
      const txt=data.content?.find(b=>b.type==='text')?.text||'{}';
      const p=JSON.parse(txt.replace(/```json|```/g,'').trim());
      setForm(f=>({...f,name:f.name||p.name||'',location:f.location||p.location||'',company:f.company||p.company||'',connection:f.connection||p.connection||'',notes:[f.notes,p.notes].filter(Boolean).join(' ').trim(),physicalFeatures:[...new Set([...f.physicalFeatures,...(p.physicalFeatures||[])])],character:[...new Set([...f.character,...(p.character||[])])]}));
      showToast('Fields filled from voice!');
    }catch{ setVErr('Auto-fill failed — added to notes.'); setForm(f=>({...f,notes:[f.notes,transcript].filter(Boolean).join(' ').trim()})); }
    setProc(false);
  };

  /* ── Import / Export ── */
  const handleImport=e=>{
    const file=e.target.files[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        if(Array.isArray(data)){ setPeople(prev=>{ const ids=new Set(prev.map(p=>p.id)); const n=data.filter(p=>!ids.has(p.id)); setTimeout(()=>showToast(`Imported ${n.length} new, ${data.length-n.length} skipped`),100); return[...prev,...n]; }); }
        else showToast('Invalid file format.');
      }catch{showToast('Could not read file.');}
    };
    reader.readAsText(file); e.target.value='';
  };
  const exportData=()=>{
    const blob=new Blob([JSON.stringify(people,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`recall-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast('Data exported!');
  };

  /* ── Filters ── */
  const toggleF=(cat,val)=>setFilters(p=>({...p,[cat]:p[cat].includes(val)?p[cat].filter(v=>v!==val):[...p[cat],val]}));
  const clearF=()=>setFilters({location:[],physical:[],character:[],company:[],connection:[]});

  /* ── Save Person ── */
  const save=()=>{
    if(!form.name.trim())return;
    if(editing){ setPeople(p=>p.map(x=>x.id===editing.id?{...x,...form}:x)); showToast('Person updated!'); }
    else{
      const log=form.notes.trim()?[{id:Date.now()+'-0',datetime:form.dateMet?new Date(form.dateMet+'T00:00').toISOString():new Date().toISOString(),note:form.notes,location:form.location}]:[];
      setPeople(p=>[{id:Date.now().toString(),...form,meetupLog:log,dateAdded:Date.now()},...p]);
      showToast('Person added!');
    }
    closeAdd();
  };
  const openEdit=person=>{ setForm({name:person.name||'',location:person.location||'',company:person.company||'',connection:person.connection||'',notes:person.notes||'',physicalFeatures:person.physicalFeatures||[],character:person.character||[],dateMet:person.dateMet||new Date().toISOString().split('T')[0]}); setEditing(person); setDetail(null); setAddOpen(true); };
  const del=id=>{ if(!confirm('Remove this person?'))return; setPeople(p=>p.filter(x=>x.id!==id)); setDetail(null); showToast('Removed.'); };
  const closeAdd=()=>{ setAddOpen(false); setEditing(null); setForm(EMPTY); setTrans(''); setVErr(''); if(rec)stopRec(); };

  /* ── Meetup Log ── */
  const openAddLog=()=>{ setNewLog({datetime:toLocal(),note:'',location:''}); setShowLog(true); };
  const addLog=()=>{
    if(!newLog.note.trim()&&!newLog.location.trim())return;
    const entry={id:Date.now().toString(),datetime:newLog.datetime?new Date(newLog.datetime).toISOString():new Date().toISOString(),note:newLog.note,location:newLog.location};
    const upd={...detail,meetupLog:[entry,...(detail.meetupLog||[])]};
    setPeople(p=>p.map(x=>x.id===detail.id?upd:x)); setDetail(upd); setShowLog(false); showToast('Entry logged!');
  };
  const startEditLog=m=>{ setEditLogId(m.id); setEditLogData({datetime:toLocal(m.datetime),note:m.note||'',location:m.location||''}); };
  const saveLogEdit=()=>{
    const upd={...detail,meetupLog:(detail.meetupLog||[]).map(m=>m.id===editLogId?{...m,...editLogData,datetime:editLogData.datetime?new Date(editLogData.datetime).toISOString():m.datetime}:m)};
    setPeople(p=>p.map(x=>x.id===detail.id?upd:x)); setDetail(upd); setEditLogId(null); showToast('Entry updated!');
  };
  const delLog=mid=>{ const upd={...detail,meetupLog:(detail.meetupLog||[]).filter(m=>m.id!==mid)}; setPeople(p=>p.map(x=>x.id===detail.id?upd:x)); setDetail(upd); };

  /* ── Derived state ── */
  const locs=[...new Set(people.map(p=>p.location).filter(Boolean))];
  const cos=[...new Set(people.map(p=>p.company).filter(Boolean))];
  const cons=[...new Set(people.map(p=>p.connection).filter(Boolean))];
  const phys=[...new Set(people.flatMap(p=>p.physicalFeatures||[]))];
  const chars=[...new Set(people.flatMap(p=>p.character||[]))];
  const afc=Object.values(filters).reduce((s,a)=>s+a.length,0);
  const totalLogs=people.reduce((s,p)=>s+(p.meetupLog||[]).length,0);
  const shown=people.filter(p=>{
    if(q){const h=`${p.name} ${p.notes} ${p.location} ${p.company} ${p.connection} ${(p.meetupLog||[]).map(m=>m.note).join(' ')}`.toLowerCase();if(!h.includes(q.toLowerCase()))return false;}
    if(filters.location.length&&!filters.location.includes(p.location))return false;
    if(filters.company.length&&!filters.company.includes(p.company))return false;
    if(filters.connection.length&&!filters.connection.includes(p.connection))return false;
    if(filters.physical.length&&!filters.physical.some(f=>(p.physicalFeatures||[]).includes(f)))return false;
    if(filters.character.length&&!filters.character.some(f=>(p.character||[]).includes(f)))return false;
    return true;
  });

  if(loading)return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"/></div>;

  const Chip=({label,active,onClick})=>(
    <button onClick={onClick} className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${active?'bg-gradient-to-r from-purple-500 to-pink-500 text-white border-transparent':`${T.card} ${T.border} ${T.text}`}`}>{label}</button>
  );

  return (
    <div className={`min-h-screen ${T.bg} ${T.text} transition-colors`}>
      {toast&&<div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium shadow-lg">{toast}</div>}
      <div className="max-w-2xl mx-auto pb-28">

        {/* HEADER */}
        <div className={`sticky top-0 z-20 ${T.hbg} border-b ${T.border}`}>
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center"><Sparkles className="w-5 h-5 text-white"/></div>
              <div><h1 className="font-bold text-lg leading-tight">Recall</h1><p className={`text-xs ${T.muted}`}>{people.length} people · {totalLogs} logs</p></div>
            </div>
            <div className="flex gap-1.5">
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport}/>
              <button onClick={()=>importRef.current?.click()} title="Import" className={`p-2 rounded-xl ${T.tag} hover:opacity-80`}><Upload className="w-4 h-4"/></button>
              <button onClick={exportData} title="Export" className={`p-2 rounded-xl ${T.tag} hover:opacity-80`}><Download className="w-4 h-4"/></button>
              <button onClick={()=>setDark(!dark)} className={`p-2 rounded-xl ${T.tag} hover:opacity-80`}>{dark?<Sun className="w-4 h-4"/>:<Moon className="w-4 h-4"/>}</button>
            </div>
          </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-4 gap-2 px-4 py-3">
          {[{icon:<Users className="w-4 h-4"/>,label:'People',value:people.length,g:'from-purple-500 to-indigo-500'},{icon:<MapPin className="w-4 h-4"/>,label:'Places',value:locs.length,g:'from-pink-500 to-rose-500'},{icon:<Building2 className="w-4 h-4"/>,label:'Companies',value:cos.length,g:'from-cyan-500 to-blue-500'},{icon:<BookOpen className="w-4 h-4"/>,label:'Logs',value:totalLogs,g:'from-amber-500 to-orange-500'}].map(s=>(
            <div key={s.label} className={`rounded-2xl p-2.5 ${T.card} border ${T.border}`}>
              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${s.g} flex items-center justify-center text-white mb-1.5`}>{s.icon}</div>
              <div className="text-lg font-bold leading-tight">{s.value}</div>
              <div className={`text-[10px] ${T.muted}`}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* SEARCH */}
        <div className="px-4 pb-2">
          <div className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 border ${T.inp}`}>
            <Search className={`w-4 h-4 ${T.muted} flex-shrink-0`}/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name, place, notes, logs…" className="flex-1 bg-transparent outline-none text-sm"/>
            {q&&<button onClick={()=>setQ('')}><X className="w-4 h-4"/></button>}
          </div>
        </div>

        {/* FILTERS */}
        <div className="px-4 pb-2">
          <button onClick={()=>setFOpen(!fOpen)} className={`flex items-center justify-between w-full rounded-2xl px-3 py-2.5 border ${T.inp} text-sm font-medium`}>
            <span className="flex items-center gap-2">Filters {afc>0&&<span className="px-1.5 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs">{afc}</span>}</span>
            {fOpen?<ChevronUp className="w-4 h-4"/>:<ChevronDown className="w-4 h-4"/>}
          </button>
          {fOpen&&(
            <div className={`mt-2 p-3 rounded-2xl border ${T.border} ${T.card} space-y-3`}>
              {[[locs,'location','Location',<MapPin className="w-3.5 h-3.5"/>],[phys,'physical','Physical',<User className="w-3.5 h-3.5"/>],[chars,'character','Character',<Sparkles className="w-3.5 h-3.5"/>],[cos,'company','Company',<Building2 className="w-3.5 h-3.5"/>],[cons,'connection','Connection',<Users className="w-3.5 h-3.5"/>]].map(([opts,key,label,icon])=>opts.length?(
                <div key={key}><div className={`flex items-center gap-1.5 text-xs font-semibold ${T.muted} mb-1.5`}>{icon}{label}</div><div className="flex flex-wrap gap-1.5">{opts.map(o=><Chip key={o} label={o} active={filters[key].includes(o)} onClick={()=>toggleF(key,o)}/>)}</div></div>
              ):null)}
              {locs.length+phys.length+chars.length+cos.length+cons.length===0&&<p className={`text-xs ${T.muted}`}>Filters appear as you add people.</p>}
              {afc>0&&<button onClick={clearF} className="text-xs font-semibold text-pink-500">Clear all</button>}
            </div>
          )}
        </div>

        {/* GRID */}
        <div className="px-4 pt-1">
          {shown.length===0?(
            <div className="flex flex-col items-center py-16 text-center px-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4"><Users className="w-8 h-8 text-white"/></div>
              <h3 className="font-semibold mb-1">{people.length===0?'No one yet':'No matches'}</h3>
              <p className={`text-sm ${T.muted} mb-4 max-w-xs`}>{people.length===0?'Start your people directory — add someone by hand or by voice.':'Try adjusting filters.'}</p>
              {people.length===0&&<button onClick={()=>setAddOpen(true)} className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium">Add first person</button>}
            </div>
          ):(
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {shown.map(p=>{
                const tags=[...(p.physicalFeatures||[]),...(p.character||[])].slice(0,2);
                const lc=(p.meetupLog||[]).length;
                return(
                  <button key={p.id} onClick={()=>setDetail(p)} className={`text-left rounded-2xl p-3 border ${T.border} ${T.card} hover:scale-[1.02] active:scale-[0.98] transition-transform`}>
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getGrad(p.name)} flex items-center justify-center text-white font-bold text-sm mb-2`}>{getInit(p.name)}</div>
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    {p.dateMet&&<div className={`text-xs ${T.muted} flex items-center gap-1 mt-0.5`}><Calendar className="w-3 h-3 flex-shrink-0"/><span className="truncate">{fmtD(p.dateMet)}</span></div>}
                    {p.location&&<div className={`text-xs ${T.muted} flex items-center gap-1 mt-0.5 truncate`}><MapPin className="w-3 h-3 flex-shrink-0"/><span className="truncate">{p.location}</span></div>}
                    {lc>0&&<div className={`text-xs ${T.muted} flex items-center gap-1 mt-0.5`}><BookOpen className="w-3 h-3"/>{lc} log{lc!==1?'s':''}</div>}
                    {tags.length>0&&<div className="flex flex-wrap gap-1 mt-2">{tags.map(t=><span key={t} className={`text-[10px] px-1.5 py-0.5 rounded-full ${T.tag} truncate`}>{t}</span>)}</div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      <button onClick={()=>setAddOpen(true)} className="fixed bottom-5 right-5 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 shadow-xl flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform z-30"><Plus className="w-6 h-6"/></button>

      {/* ADD/EDIT MODAL */}
      {addOpen&&(
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeAdd}/>
          <div className={`relative w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto ${T.card} ${T.text} p-4 pb-6`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">{editing?'Edit Person':'Add Person'}</h2>
              <button onClick={closeAdd} className={`p-1.5 rounded-full ${T.tag}`}><X className="w-4 h-4"/></button>
            </div>
            <div className={`rounded-2xl p-4 mb-4 border ${T.border} ${T.vbg}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold flex items-center gap-1.5"><Mic className="w-4 h-4"/>Voice Capture</span>
                {speechOK&&<div className="flex gap-1">{['en-US','ms-MY'].map(l=><button key={l} onClick={()=>setLang(l)} className={`text-xs px-2 py-0.5 rounded-full ${lang===l?'bg-gradient-to-r from-purple-500 to-pink-500 text-white':T.tag}`}>{l==='en-US'?'EN':'BM'}</button>)}</div>}
              </div>
              {speechOK?(
                <div className="flex flex-col items-center gap-2">
                  <button onClick={rec?stopRec:startRec} className={`w-16 h-16 rounded-full flex items-center justify-center text-white transition-all ${rec?'bg-red-500 animate-pulse scale-105':'bg-gradient-to-br from-purple-600 to-pink-600'}`}>{rec?<MicOff className="w-7 h-7"/>:<Mic className="w-7 h-7"/>}</button>
                  <p className={`text-xs ${T.muted} text-center`}>{rec?'Listening… tap to stop':'Tap and describe this person'}</p>
                  {transcript&&<div className={`w-full rounded-xl p-2.5 text-sm ${T.tag}`}>"{transcript}"</div>}
                  {transcript&&!rec&&<button onClick={processVoice} disabled={processing} className="text-sm font-medium px-4 py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white disabled:opacity-50 flex items-center gap-1.5">{processing?'Filling…':<><Sparkles className="w-3.5 h-3.5"/>Auto-fill fields</>}</button>}
                  {vErr&&<p className="text-xs text-red-500 text-center">{vErr}</p>}
                </div>
              ):<p className={`text-xs ${T.muted} text-center`}>Voice not supported in this browser. Try Chrome on Android.</p>}
            </div>
            <div className="space-y-3">
              <FField label="Name *" val={form.name} set={v=>setForm(f=>({...f,name:v}))} placeholder="e.g. Farah Nadia" T={T}/>
              <div>
                <label className={`text-sm font-medium ${T.muted} flex items-center gap-1.5 mb-1.5`}><Calendar className="w-3.5 h-3.5"/>Date Met</label>
                <input type="date" value={form.dateMet} onChange={e=>setForm(f=>({...f,dateMet:e.target.value}))} className={`w-full rounded-xl border p-2.5 text-sm outline-none ${T.inp}`}/>
              </div>
              <FField label="Location" icon={<MapPin className="w-3.5 h-3.5"/>} val={form.location} set={v=>setForm(f=>({...f,location:v}))} placeholder="e.g. KL — Pavilion Mall" T={T}/>
              <FField label="Company / Org" icon={<Building2 className="w-3.5 h-3.5"/>} val={form.company} set={v=>setForm(f=>({...f,company:v}))} placeholder="e.g. Maybank" T={T}/>
              <FField label="Connection" icon={<Users className="w-3.5 h-3.5"/>} val={form.connection} set={v=>setForm(f=>({...f,connection:v}))} placeholder="e.g. Friend of Ahmad" T={T}/>
              <TInput label="Physical Features" icon={<User className="w-3.5 h-3.5"/>} tags={form.physicalFeatures} set={t=>setForm(f=>({...f,physicalFeatures:t}))} T={T}/>
              <TInput label="Character" icon={<Sparkles className="w-3.5 h-3.5"/>} tags={form.character} set={t=>setForm(f=>({...f,character:t}))} T={T}/>
              <div>
                <label className={`text-sm font-medium ${T.muted} mb-1.5 block`}>First Meeting Notes</label>
                <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={3} className={`w-full rounded-xl border p-2.5 text-sm outline-none ${T.inp}`} placeholder="How you met, what you talked about…"/>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={closeAdd} className={`flex-1 py-2.5 rounded-xl font-medium border ${T.border}`}>Cancel</button>
              <button onClick={save} disabled={!form.name.trim()} className="flex-1 py-2.5 rounded-xl font-medium bg-gradient-to-r from-purple-600 to-pink-600 text-white disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detail&&(
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={()=>{setDetail(null);setShowLog(false);setEditLogId(null);}}/>
          <div className={`relative w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto ${T.card} ${T.text} p-4 pb-6`}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={()=>{setDetail(null);setShowLog(false);setEditLogId(null);}} className={`p-1.5 rounded-full ${T.tag}`}><X className="w-4 h-4"/></button>
              <div className="flex gap-2">
                <button onClick={()=>openEdit(detail)} className={`p-1.5 rounded-full ${T.tag}`}><Edit2 className="w-4 h-4"/></button>
                <button onClick={()=>del(detail.id)} className="p-1.5 rounded-full bg-red-100 text-red-500"><Trash2 className="w-4 h-4"/></button>
              </div>
            </div>
            <div className="flex flex-col items-center text-center mb-5">
              <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${getGrad(detail.name)} flex items-center justify-center text-white font-bold text-2xl mb-3`}>{getInit(detail.name)}</div>
              <h2 className="font-bold text-xl">{detail.name}</h2>
              {detail.dateMet&&<p className={`text-xs ${T.muted} flex items-center gap-1 mt-1`}><Calendar className="w-3.5 h-3.5"/>First met {fmtD(detail.dateMet)}</p>}
              {detail.location&&<p className={`text-xs ${T.muted} flex items-center gap-1 mt-0.5`}><MapPin className="w-3.5 h-3.5"/>{detail.location}</p>}
            </div>
            <div className="space-y-3 mb-5">
              {detail.company&&<DR icon={<Building2 className="w-4 h-4"/>} label="Company" value={detail.company} T={T}/>}
              {detail.connection&&<DR icon={<Users className="w-4 h-4"/>} label="Connection" value={detail.connection} T={T}/>}
              {detail.physicalFeatures?.length>0&&<TDR icon={<User className="w-4 h-4"/>} label="Physical Features" tags={detail.physicalFeatures} T={T}/>}
              {detail.character?.length>0&&<TDR icon={<Sparkles className="w-4 h-4"/>} label="Character" tags={detail.character} T={T}/>}
            </div>
            <div className={`border-t ${T.border} pt-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-purple-500"/>Meetup Diary <span className={`text-xs font-normal ${T.muted}`}>({(detail.meetupLog||[]).length})</span></h3>
                <button onClick={openAddLog} className="flex items-center gap-1 text-sm font-semibold text-purple-500"><Plus className="w-4 h-4"/>Log</button>
              </div>
              {showLog&&(
                <div className={`rounded-2xl p-3 border ${T.border} ${T.dbg} mb-3 space-y-2`}>
                  <p className={`text-xs font-semibold ${T.muted} flex items-center gap-1.5`}><Clock className="w-3.5 h-3.5"/>New Entry — time auto-logged</p>
                  <input type="datetime-local" value={newLog.datetime} onChange={e=>setNewLog(l=>({...l,datetime:e.target.value}))} className={`w-full rounded-xl border p-2 text-sm outline-none ${T.inp}`}/>
                  <input value={newLog.location} onChange={e=>setNewLog(l=>({...l,location:e.target.value}))} placeholder="Location (optional)" className={`w-full rounded-xl border p-2 text-sm outline-none ${T.inp}`}/>
                  <textarea value={newLog.note} onChange={e=>setNewLog(l=>({...l,note:e.target.value}))} rows={2} placeholder="What happened, what did you discuss…" className={`w-full rounded-xl border p-2 text-sm outline-none ${T.inp}`}/>
                  <div className="flex gap-2">
                    <button onClick={()=>setShowLog(false)} className={`flex-1 py-1.5 rounded-xl text-sm border ${T.border}`}>Cancel</button>
                    <button onClick={addLog} className="flex-1 py-1.5 rounded-xl text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium">Save Entry</button>
                  </div>
                </div>
              )}
              {(detail.meetupLog||[]).length===0&&!showLog&&<p className={`text-sm ${T.muted} text-center py-6`}>No entries yet. Tap "Log" to record a meetup.</p>}
              <div className="space-y-2">
                {[...(detail.meetupLog||[])].sort((a,b)=>new Date(b.datetime)-new Date(a.datetime)).map((m,i)=>(
                  <div key={m.id} className={`rounded-2xl border ${T.border} ${T.dbg} p-3`}>
                    {editLogId===m.id?(
                      <div className="space-y-2">
                        <p className={`text-xs font-semibold ${T.muted}`}>Edit Entry</p>
                        <input type="datetime-local" value={editLogData.datetime} onChange={e=>setEditLogData(d=>({...d,datetime:e.target.value}))} className={`w-full rounded-xl border p-2 text-sm outline-none ${T.inp}`}/>
                        <input value={editLogData.location} onChange={e=>setEditLogData(d=>({...d,location:e.target.value}))} placeholder="Location" className={`w-full rounded-xl border p-2 text-sm outline-none ${T.inp}`}/>
                        <textarea value={editLogData.note} onChange={e=>setEditLogData(d=>({...d,note:e.target.value}))} rows={2} className={`w-full rounded-xl border p-2 text-sm outline-none ${T.inp}`}/>
                        <div className="flex gap-2">
                          <button onClick={()=>setEditLogId(null)} className={`flex-1 py-1.5 rounded-xl text-sm border ${T.border}`}>Cancel</button>
                          <button onClick={saveLogEdit} className="flex-1 py-1.5 rounded-xl text-sm bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium">Save</button>
                        </div>
                      </div>
                    ):(
                      <>
                        <div className="flex items-start justify-between mb-1.5">
                          <div>
                            <span className={`text-xs font-medium ${T.muted} flex items-center gap-1`}><Clock className="w-3 h-3"/>{fmtDT(m.datetime)}</span>
                            {i===0&&<span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white">Latest</span>}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={()=>startEditLog(m)} className={`p-1 rounded-full ${T.tag}`}><Edit2 className="w-3 h-3"/></button>
                            <button onClick={()=>delLog(m.id)} className="p-1 rounded-full bg-red-100 text-red-400"><Trash2 className="w-3 h-3"/></button>
                          </div>
                        </div>
                        {m.location&&<div className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${T.tag} mb-1.5`}><MapPin className="w-3 h-3"/>{m.location}</div>}
                        {m.note&&<p className="text-sm leading-relaxed">{m.note}</p>}
                      </>
                    )}
                  </div>
                ))}
              </div>
              <p className={`text-xs ${T.muted} mt-4 pt-3 border-t ${T.border}`}>Added to Recall {new Date(detail.dateAdded).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FField({label,icon,val,set,placeholder,T}){
  return(<div><label className={`text-sm font-medium ${T.muted} flex items-center gap-1.5 mb-1.5`}>{icon}{label}</label><input value={val} onChange={e=>set(e.target.value)} placeholder={placeholder} className={`w-full rounded-xl border p-2.5 text-sm outline-none ${T.inp}`}/></div>);
}
function TInput({label,icon,tags,set,T}){
  const [inp,setInp]=useState('');
  const add=()=>{const v=inp.trim();if(v&&!tags.includes(v))set([...tags,v]);setInp('');};
  return(<div><label className={`text-sm font-medium ${T.muted} flex items-center gap-1.5 mb-1.5`}>{icon}{label}</label><div className={`flex flex-wrap gap-1.5 p-2 rounded-xl border ${T.inp}`}>{tags.map(t=><span key={t} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white">{t}<button onClick={()=>set(tags.filter(x=>x!==t))}><X className="w-3 h-3"/></button></span>)}<input value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();add();}}} onBlur={add} placeholder="Type & press Enter" className="flex-1 min-w-[80px] bg-transparent outline-none text-sm py-1"/></div></div>);
}
function DR({icon,label,value,T}){return(<div className="flex items-start gap-2.5"><div className={`mt-0.5 ${T.muted}`}>{icon}</div><div><div className={`text-xs font-medium ${T.muted}`}>{label}</div><div className="text-sm">{value}</div></div></div>);}
function TDR({icon,label,tags,T}){return(<div className="flex items-start gap-2.5"><div className={`mt-0.5 ${T.muted}`}>{icon}</div><div className="flex-1"><div className={`text-xs font-medium ${T.muted} mb-1`}>{label}</div><div className="flex flex-wrap gap-1.5">{tags.map(t=><span key={t} className={`text-xs px-2 py-0.5 rounded-full ${T.tag}`}>{t}</span>)}</div></div></div>);}