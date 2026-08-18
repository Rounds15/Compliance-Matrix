const {useState,useEffect,useMemo} = React;
const {Icon,Avatar,Risk,Modal,PageHead,Field,Stat,RoleCard,Empty,fmtDate,dayDiff,dueState,fiscalQ,RISK_COLOR,useMedia} = window;

/* ================= HOME ================= */
function Home({go,role,fns,gaps,deadlines,flags,openFn,me,filter,setFilter}){
  const openGaps = gaps.filter(g=>g.status==="Open");
  const up90 = deadlines.filter(d=>!d.complete && dayDiff(d.due)>=0 && dayDiff(d.due)<=90);
  const late = deadlines.filter(d=>!d.complete && dayDiff(d.due)<0);
  const mine = fns.filter(f=>f.owner.n===me.n || (f.unitOwner&&f.unitOwner.n===me.n) || f.exec.n===me.n);
  const myDl = deadlines.filter(d=>d.owner.n===me.n && !d.complete).sort((a,b)=>a.due-b.due).slice(0,4);
  const [q,setQ] = useState("");
  const search = e => { e.preventDefault(); setFilter({...filter,q,topic:"All",risk:"All"}); go("Functions"); };
  const dest = [
    {t:"Compliance Functions",d:"Every obligation in the matrix with statute, owner, requirement, and risk rating.",s:fns.length+" records",go:"Functions"},
    {t:"Topics",d:"Browse by compliance topic — research, health and safety, privacy, Title IX, and more.",s:window.TOPICS.length+" topics",go:"Topics"},
    {t:"Functional Areas",d:"See obligations grouped by the university unit that carries them.",s:"By unit",go:"Areas"},
    {t:"Deadlines",d:"Filings, certifications, and reports on the calendar, with automatic reminders.",s:up90.length+" in 90 days",go:"Deadlines"},
    {t:"Owner Directory",d:"Every compliance owner, unit owner, and executive sponsor in the matrix.",s:"Contacts",go:"Directory"},
    {t:"Risk Dashboard",d:"Risk concentration by topic and unit, gap trends, and executive reporting.",s:role==="Administrator"?"Administrator":"Restricted",go:"Risk Dashboard"}
  ];
  return <>
    <section className="hm-hero">
      <div className="wrap hm-hero-in">
        <div>
          <div className="hm-eyebrow">Office of Compliance &amp; Enterprise Risk Management</div>
          <h1 className="hm-h1">Who is responsible<br/>for what — and are<br/>we on top of it.</h1>
          <p className="hm-lede">The Compliance Matrix maps every obligation Syracuse University carries to its owner, the law behind it, what it requires, when it is due, and the risk it carries.</p>
          <form className="hm-search" onSubmit={search}>
            <Icon n="search" s={18}/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search a function, statute, citation, or owner…" aria-label="Search the compliance matrix"/>
            <button type="submit" className="button button-primary">Search</button>
          </form>
          <div className="hm-acts">
            <button className="hm-link" onClick={()=>go("Deadlines")}><Icon n="calendar" s={15}/>What&rsquo;s coming due</button>
            <button className="hm-link" onClick={()=>go("Topics")}><Icon n="grid" s={15}/>Browse by topic</button>
            {role==="Administrator" && <button className="hm-link" onClick={()=>go("Gap Tracker")}><Icon n="flag" s={15}/>{"Open gaps ("+openGaps.length+")"}</button>}
          </div>
        </div>
        <img className="hm-blocks" src="assets/SYRACUSE_BlockS_ORANGE_RGB.png" alt="" aria-hidden="true"/>
      </div>
    </section>

    <section className="hm-band">
      <div className="wrap hm-band-in">
        <div className="hm-fig"><span className="hm-n">{fns.length}</span><span className="hm-fl">Compliance functions</span></div>
        <div className="hm-fig"><span className="hm-n">{window.TOPICS.length}</span><span className="hm-fl">Compliance topics</span></div>
        <div className="hm-fig"><span className="hm-n">{up90.length}</span><span className="hm-fl">Due within 90 days</span></div>
        <div className="hm-fig"><span className="hm-n">{late.length}</span><span className="hm-fl">Past due today</span></div>
        <div className="hm-asof">As of {fmtDate(window.TODAY)}<br/>{fiscalQ(window.TODAY)}</div>
      </div>
    </section>

    <div className="wrap page">
      <div className="sec-h"><span className="lbl">Start here</span><span className="rule"></span>
        <span>Six ways into the matrix</span></div>
      <div className="hm-dest">
        {dest.map(d=><button key={d.t} className="hm-card" onClick={()=>go(d.go)}>
          <span className="hm-ct">{d.t}</span>
          <span className="hm-cd">{d.d}</span>
          <span className="hm-cm">{d.s}<Icon n="arrow-right" s={14}/></span>
        </button>)}
      </div>

      <div className="sec-h"><span className="lbl">Assigned to you</span><span className="rule"></span>
        <span>{me.n} · {role}</span></div>
      <div className="cm-grid" style={{gridTemplateColumns:"minmax(0,1.55fr) minmax(0,1fr)"}}>
        <div className="cm-panel hm-assigned" style={{overflow:"hidden"}}>
          {mine.length? mine.slice(0,5).map(f=>{
            const fl = flags.find(x=>x.functionId===f.id);
            const g = gaps.filter(x=>x.functionId===f.id&&x.status==="Open").length;
            return <button key={f.id} className="srow" onClick={()=>openFn(f)}>
              <div style={{minWidth:0,flex:1}}>
                <div className="fname">{f.name}</div>
                <div className="sub">{f.topic} · {f.area}</div>
              </div>
              {g>0&&<span className="gapbadge" title={g+" open gap(s)"}>{g}</span>}
              {fl&&<span className="flagb"><Icon n="flag" s={11} sw={2.2}/>Flagged</span>}
              <Risk r={f.risk}/>
            </button>;}) : <Empty title="Nothing assigned" sub="No functions list this person in the ownership chain."/>}
          {mine.length>5 && <button className="srow" style={{color:"#D74100",fontWeight:700,fontSize:14,justifyContent:"center"}} onClick={()=>go("Functions")}>View all {mine.length} assigned functions →</button>}
          {!!mine.length && <div className="endlist">End of list</div>}
        </div>
        <div className="cm-panel" style={{padding:16}}>
          <div style={{fontSize:12,letterSpacing:".12em",textTransform:"uppercase",color:"var(--orange)",fontWeight:700,marginBottom:12}}>Your next deadlines</div>
          {myDl.length?myDl.map(d=>{const st=dueState(d);const fn=fns.find(x=>x.id===d.functionId);return <button key={d.id} className="dlmini" onClick={()=>fn&&openFn(fn)} title={fn?"Open "+fn.name:""}>
            <div style={{minWidth:0,flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--navy)",lineHeight:1.3}}>{d.title}</div>
              <div className="sub">{fmtDate(d.due)} · {d.cadence}</div>
              <div className="sub dlmini-fn">{d.functionName}</div>
            </div><span className={"pill "+st.cls}>{st.label}</span>
          </button>;}):<p className="sub">No open deadlines for this person.</p>}
          <div className="note" style={{marginTop:14}}><b>Reminders</b> are sent automatically at 90 days, 30 days, on the due date, and weekly once overdue.</div>
        </div>
      </div>
    </div>

    <section className="wrap hm-help">
      <div>
        <h3>Something look wrong?</h3>
        <p>Owners can flag any record for review from its detail page. The compliance office responds within five business days.</p>
        <button className="button button-secondary-outline" onClick={()=>go("Functions")}>Find a record to flag</button>
      </div>
      <div>
        <h3>New to the matrix?</h3>
        <p>Start with the topic view to see how obligations are organized, then check the directory for the owner of a given area.</p>
        <button className="button button-secondary-outline" onClick={()=>go("Directory")}>Open the directory</button>
      </div>
    </section>
  </>;
}

/* ================= FUNCTIONS ================= */
function FunctionsScreen({fns,gaps,flags,openFn,filter,setFilter}){
  const [view,setView]=useState("table");
  const narrow = useMedia("(max-width:900px)");
  const [page,setPage]=useState(0);
  const PER=15;
  const {q,topic,risk} = filter;
  const rows = useMemo(()=>fns.filter(f=>
    (!q || (f.name+f.statute+f.citation+f.owner.n+f.area+f.topic).toLowerCase().includes(q.toLowerCase())) &&
    (topic==="All"||f.topic===topic) && (risk==="All"||f.risk===risk)),[fns,q,topic,risk]);
  const set = (k,v)=>{setFilter({...filter,[k]:v});setPage(0);};
  const pages = Math.max(1,Math.ceil(rows.length/PER));
  const pageRows = rows.slice(page*PER,page*PER+PER);
  const meta = f => ({g:gaps.filter(x=>x.functionId===f.id&&x.status==="Open").length, fl:flags.some(x=>x.functionId===f.id)});
  return <div className="page wrap" style={{paddingTop:14}}>
    <PageHead eyebrow="Browse" title="Compliance Functions"
      sub="Every obligation in the matrix. Search by name, statute, or owner; filter by topic and risk. Select a function to view or edit the full record."/>
    <div className="fbar">
      <div className="srch"><Icon n="search" s={16}/>
        <input placeholder="Search functions, statutes, citations, owners…" value={q} onChange={e=>set("q",e.target.value)}/></div>
      <select className="fs" style={{width:254,height:45}} value={topic} onChange={e=>set("topic",e.target.value)}>
        <option value="All">All topics</option>{window.TOPICS.map(t=><option key={t.name}>{t.name}</option>)}</select>
      <select className="fs" style={{width:197,height:51}} value={filter.area||"All"} onChange={e=>set("area",e.target.value)}>
        <option value="All">All Areas</option></select>
      <div style={{display:"flex",gap:4}}>
        <button className={"button button-sm "+(view==="table"?"button-secondary":"button-ghost")} onClick={()=>setView("table")}><Icon n="list" s={14}/>Table</button>
        <button className={"button button-sm "+(view==="cards"?"button-secondary":"button-ghost")} onClick={()=>setView("cards")}><Icon n="grid" s={14}/>Cards</button>
      </div>
    </div>
    {!rows.length && <Empty title="No matching functions" sub="Try a broader search or clear the topic and risk filters."/>}
    {!!rows.length && view==="table" && <div className="tblwrap" style={{marginTop:14}}>
      <table className="table-simple" role="table"><thead><tr>
        <th style={{width:"38%"}}>Compliance function</th><th>Topic / area</th><th>Statute / Citation</th><th>Deadline</th><th style={{width:110}}>Risk</th>
      </tr></thead><tbody>
      {pageRows.map(f=>{const m=meta(f);return <tr key={f.id} onClick={()=>openFn(f)}>
        <td><div className="fname">{f.name}</div>
          <div style={{display:"flex",gap:6,marginTop:4,alignItems:"center",flexWrap:"wrap"}}>
            <span className="sub" style={{whiteSpace:"nowrap"}}>{f.id}</span>
            {m.g>0&&<span className="gapbadge">{m.g}</span>}
            {m.fl&&<span className="flagb"><Icon n="flag" s={10} sw={2.4}/>Flagged</span>}</div></td>
        <td><div style={{fontSize:13,color:"#2b3345"}}>{f.topic}</div><div className="sub">{f.area}</div></td>
        <td><div style={{fontSize:13,color:"#2b3345"}}>{f.statute}</div><div className="sub">{f.citation}</div></td>
        <td><div className="owner"><Avatar person={f.owner} size={30}/><div style={{minWidth:0}}>
          <div className="nm">{f.owner.n}</div><div className="ti">{f.owner.u}</div></div></div></td>
        <td><Risk r={f.risk}/></td></tr>;})}
      </tbody></table></div>}
    {!!rows.length && (view==="cards") && <div className="cm-grid g-wide" style={{marginTop:14}}>
      {pageRows.map(f=><FnCard key={f.id} f={f} m={meta(f)} onClick={()=>openFn(f)}/>)}</div>}
    {!!rows.length && view==="table" && narrow && <div className="mobcards" style={{marginTop:14}}>
      {pageRows.map(f=><FnCard key={f.id} f={f} m={meta(f)} onClick={()=>openFn(f)}/>)}</div>}
    {rows.length>PER && <div className="pager">
      <button className="button button-secondary-outline button-sm" disabled={page===0} onClick={()=>{setPage(page-1);window.scrollTo(0,0);}}>Previous</button>
      <span className="count">Page {page+1} of {pages} · {rows.length} functions</span>
      <button className="button button-secondary-outline button-sm" disabled={page>=pages-1} onClick={()=>{setPage(page+1);window.scrollTo(0,0);}}>Next</button>
    </div>}
  </div>;
}
const FnCard = ({f,m,onClick}) => <button className="fcard" onClick={onClick}>
  <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
    <div style={{flex:1,minWidth:0}}><div className="t">{f.name}</div>
      <div className="sub" style={{marginTop:3}}>{f.topic} · {f.area}</div></div>
    <Risk r={f.risk}/></div>
  <div className="m"><span className="chip"><Icon n="scale" s={12}/>{f.statute}</span>
    {m.g>0&&<span className="gapbadge">{m.g} gap</span>}
    {m.fl&&<span className="flagb"><Icon n="flag" s={10} sw={2.4}/>Flagged</span>}</div>
  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:11,paddingTop:11,borderTop:"1px solid #EEF0F4"}}>
    <Avatar person={f.owner} size={28}/><div style={{minWidth:0}}>
      <div className="nm" style={{fontSize:12.5}}>{f.owner.n}</div><div className="ti">{f.owner.t}</div></div></div>
</button>;

/* ================= FUNCTION DETAIL / EDIT OVERLAY ================= */
function FunctionOverlay({f,onClose,onSave,role,deadlines,gaps,flags,onFlag,onUnflag,onLogGap,people}){
  const [mode,setMode]=useState("read");
  const [d,setD]=useState(f);
  const [flagOpen,setFlagOpen]=useState(false);
  const [flagText,setFlagText]=useState("");
  const [gapOpen,setGapOpen]=useState(false);
  const [gapForm,setGapForm]=useState({title:"",severity:"Medium",note:""});
  useEffect(()=>{setD(f);setMode("read");},[f]);
  const admin = role==="Administrator";
  const flag = flags.find(x=>x.functionId===f.id);
  const dls = deadlines.filter(x=>x.functionId===f.id);
  const gs = gaps.filter(x=>x.functionId===f.id);
  const set=(k,v)=>setD({...d,[k]:v});
  const setP=(role_,k,v)=>setD({...d,[role_]:{...(d[role_]||{n:"",t:"",u:"",e:""}),[k]:v}});
  return <Modal onClose={onClose}>
    <div className="mhd">
      <div style={{minWidth:0}}>
        <div className="eyebrow" style={{color:"#FF8E00"}}>{d.topic} · {d.area}</div>
        <h2 style={{marginTop:6}}>{mode==="edit"?"Editing: ":""}{d.name}</h2>
        <div style={{display:"flex",gap:8,marginTop:9,flexWrap:"wrap",alignItems:"center"}}>
          <Risk r={d.risk}/>
          <span className="chip" style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.25)",color:"#C7D2EA"}}>{d.id}</span>
          {gs.filter(g=>g.status==="Open").length>0&&<span className="gapbadge">{gs.filter(g=>g.status==="Open").length} open gap</span>}
          {flag&&<span className="flagb"><Icon n="flag" s={11} sw={2.2}/>Flagged for review</span>}
        </div>
      </div>
      <button className="cl" onClick={onClose} aria-label="Close">✕</button>
    </div>
    <div className="mbd">
      {flag && <div className="note" style={{borderLeftColor:"#F76900",marginBottom:18}}>
        <b>Flagged for review</b> by {flag.by} on {fmtDate(flag.at)} — {flag.reason}
        {admin&&<div style={{marginTop:8}}><button className="button button-secondary-outline button-sm" onClick={()=>onUnflag(f.id)}><Icon n="check" s={13}/>Clear flag</button></div>}
      </div>}

      {mode==="read" ? <>
        <Field label="Ownership chain">
          <div className="roles">
            <RoleCard label="Executive Owner" person={d.exec}/>
            <RoleCard label="Unit Owner" person={d.unitOwner}/>
            <RoleCard label="Compliance Owner" person={d.owner}/>
          </div>
          {d.owner&&<div style={{display:"flex",gap:16,marginTop:10,flexWrap:"wrap",fontSize:12.5,color:"#707780"}}>
            <span><Icon n="mail" s={13} style={{verticalAlign:-2,marginRight:5}}/>{d.owner.ph}</span>
            <span>{d.owner.l}</span></div>}
        </Field>
        <Field label="Legal questions">
          {(()=>{const gc=window.counselFor(d);return <div className="gccard">
            <div className="gc-lede">Counsel of record for {d.topic}. Reach out before responding to a regulator, signing an agreement, or interpreting the statute.</div>
            <div style={{display:"flex",gap:11,alignItems:"flex-start",marginTop:11}}>
              <Avatar person={gc} size={40}/>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:700,color:"#000E54",fontSize:13.5,lineHeight:1.3}}>{gc.n}</div>
                <div style={{fontSize:12.5,color:"#5b6373",marginTop:3,lineHeight:1.35}}>{gc.t}</div>
                <div className="sub" style={{marginTop:4}}>{gc.ph} · {gc.l}</div>
              </div>
            </div>
            <a className="gc-esc" href={"mailto:"+gc.e+"?subject="+encodeURIComponent("Legal question — "+d.id+" "+d.name)}>Email a question about this function</a>
          </div>;})()}
        </Field>
        <Field label="Governing statute">
          <dl className="kv">
            <dt>Statute</dt><dd>{d.statute}</dd>
            <dt>Citation</dt><dd>{d.citation}</dd>
            <dt>Reference</dt><dd><a href={d.statuteUrl} target="_blank" rel="noopener">{d.statuteUrl.replace(/^https?:\/\//,"")} <Icon n="ext" s={12} style={{verticalAlign:-1}}/></a></dd>
          </dl>
        </Field>
        <Field label="What the obligation is"><p>{d.description}</p></Field>
        <Field label="Reporting requirement"><p>{d.reporting}</p></Field>
        <Field label="Deadline and cadence">
          <p style={{marginBottom:dls.length?12:0}}>{d.deadline}</p>
          {dls.map(x=>{const st=dueState(x);return <div key={x.id} style={{display:"flex",gap:10,alignItems:"center",padding:"9px 12px",border:"1px solid #E2E5EA",borderRadius:4,marginBottom:6,background:st.cls==="late"?"#FFF7F7":"#fff",flexWrap:"wrap"}}>
            <Icon n="clock" s={15} style={{color:"#707780"}}/>
            <div style={{flex:1,minWidth:140}}><div style={{fontSize:13.5,fontWeight:600,color:"#000E54"}}>{x.title}</div>
              <div className="sub">{fmtDate(x.due)} · {fiscalQ(x.due)} · {x.cadence}</div></div>
            <span className={"pill "+st.cls}>{st.label}</span></div>;})}
        </Field>
        <Field label="Syracuse University resource">
          <a href={d.resourceUrl} target="_blank" rel="noopener" style={{fontSize:14,fontWeight:600}}>{d.resourceLabel} <Icon n="ext" s={12} style={{verticalAlign:-1}}/></a>
          <div className="sub" style={{marginTop:3}}>{d.resourceUrl.replace(/^https?:\/\//,"")}</div>
        </Field>
        {!!gs.length && <Field label="Gaps on this function">
          {gs.map(g=><div key={g.id} style={{border:"1px solid #E2E5EA",borderLeft:"3px solid "+(g.status==="Open"?RISK_COLOR[g.severity]||"#DC2626":"#16A34A"),borderRadius:4,padding:"10px 12px",marginBottom:8}}>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span className={"pill "+(g.status==="Open"?"late":"ok")}>{g.status}</span>
              <span className="sub">{g.id} · opened {fmtDate(g.opened)} · {g.severity}</span></div>
            <div style={{fontSize:13.5,fontWeight:600,color:"#000E54",marginTop:6}}>{g.title}</div>
            <p style={{fontSize:13,color:"#5b6373",marginTop:4}}>{g.status==="Closed"?g.closeNote:g.note}</p>
          </div>)}
        </Field>}
      </> : <>
        <div className="note" style={{marginBottom:18}}><b>Editing.</b> Changing an owner also updates the owner fields copied onto this function's deadline records when you save.</div>
        <Field label="Identification">
          <div className="frow">
            <div><label className="flab">Compliance function</label><input className="ti" value={d.name} onChange={e=>set("name",e.target.value)}/></div>
            <div><label className="flab">Risk rating</label><select className="ti" value={d.risk} onChange={e=>set("risk",e.target.value)}>{["Critical","High","Medium","Low"].map(r=><option key={r}>{r}</option>)}</select></div>
          </div>
          <div className="frow">
            <div><label className="flab">Topic</label><select className="ti" value={d.topic} onChange={e=>set("topic",e.target.value)}>{window.TOPICS.map(t=><option key={t.name}>{t.name}</option>)}</select></div>
            <div><label className="flab">Compliance area</label><input className="ti" value={d.area} onChange={e=>set("area",e.target.value)}/></div>
          </div>
        </Field>
        <Field label="Ownership chain">
          {[["exec","Executive Owner"],["unitOwner","Unit Owner"],["owner","Compliance Owner"]].map(([k,lab])=>
            <div key={k} style={{marginBottom:12}}>
              <label className="flab" style={{color:"#000E54"}}>{lab}</label>
              <div className="frow" style={{marginBottom:0}}>
                <select className="ti" value={d[k]?d[k].n:""} onChange={e=>{const p=people.find(x=>x.n===e.target.value);set(k,p||null);}}>
                  <option value="">— Not assigned —</option>
                  {people.map(p=><option key={p.n}>{p.n}</option>)}</select>
                <input className="ti" value={d[k]?d[k].t:""} placeholder="Title" onChange={e=>setP(k,"t",e.target.value)}/>
                <input className="ti" value={d[k]?d[k].e:""} placeholder="Email" onChange={e=>setP(k,"e",e.target.value)}/>
              </div></div>)}
        </Field>
        <Field label="Statute">
          <div className="frow">
            <div><label className="flab">Statute</label><input className="ti" value={d.statute} onChange={e=>set("statute",e.target.value)}/></div>
            <div><label className="flab">Citation</label><input className="ti" value={d.citation} onChange={e=>set("citation",e.target.value)}/></div>
          </div>
          <label className="flab">Statute URL</label><input className="ti" value={d.statuteUrl} onChange={e=>set("statuteUrl",e.target.value)}/>
        </Field>
        <Field label="Description"><textarea className="ti" value={d.description} onChange={e=>set("description",e.target.value)}/></Field>
        <Field label="Reporting requirement"><textarea className="ti" value={d.reporting} onChange={e=>set("reporting",e.target.value)}/></Field>
        <Field label="Deadline"><input className="ti" value={d.deadline} onChange={e=>set("deadline",e.target.value)}/></Field>
        <Field label="Syracuse University resource">
          <div className="frow">
            <div><label className="flab">Label</label><input className="ti" value={d.resourceLabel} onChange={e=>set("resourceLabel",e.target.value)}/></div>
            <div><label className="flab">URL</label><input className="ti" value={d.resourceUrl} onChange={e=>set("resourceUrl",e.target.value)}/></div>
          </div>
        </Field>
      </>}
    </div>
    <div className="mft">
      {mode==="read" ? <>
        {admin && <button className="button button-secondary" onClick={()=>setMode("edit")}><Icon n="edit" s={15}/>Edit function</button>}
        {!flag && <button className="button button-secondary-outline" onClick={()=>setFlagOpen(true)}><Icon n="flag" s={15}/>Flag for review</button>}
        <button className="button button-danger-outline" onClick={()=>setGapOpen(true)}><Icon n="alert" s={15}/>Log a gap</button>
        <button className="button button-secondary-outline" style={{marginLeft:"auto"}} onClick={onClose}>Close</button>
      </> : <>
        <button className="button button-primary" onClick={()=>{onSave(d);setMode("read");}}><Icon n="check" s={15}/>Save changes</button>
        <button className="button button-secondary-outline" onClick={()=>{setD(f);setMode("read");}}>Cancel</button>
        <span className="sub" style={{marginLeft:"auto"}}>Last reviewed {fmtDate(window.TODAY)}</span>
      </>}
    </div>

    {flagOpen && <Modal onClose={()=>setFlagOpen(false)} size="sm">
      <div className="mhd"><div><h2>Flag for review</h2>
        <div style={{fontSize:12.5,color:"#C3CCE4",marginTop:4}}>{f.name}</div></div>
        <button className="cl" onClick={()=>setFlagOpen(false)}>✕</button></div>
      <div className="mbd"><label className="flab">Why does this need review?</label>
        <textarea className="ti" value={flagText} onChange={e=>setFlagText(e.target.value)} placeholder="e.g. Citation may be superseded by the 2026 final rule."/>
        <div className="note" style={{marginTop:12}}>Flagging notifies the compliance office and adds this function to the admin review queue.</div></div>
      <div className="mft"><button className="button button-primary" disabled={!flagText.trim()} onClick={()=>{onFlag(f.id,flagText);setFlagOpen(false);setFlagText("");}}><Icon n="flag" s={15}/>Submit flag</button>
        <button className="button button-secondary-outline" onClick={()=>setFlagOpen(false)}>Cancel</button></div>
    </Modal>}

    {gapOpen && <Modal onClose={()=>setGapOpen(false)} size="sm">
      <div className="mhd"><div><h2>Log a gap</h2>
        <div style={{fontSize:12.5,color:"#C3CCE4",marginTop:4}}>{f.name}</div></div>
        <button className="cl" onClick={()=>setGapOpen(false)}>✕</button></div>
      <div className="mbd">
        <label className="flab">Gap summary</label>
        <input className="ti" value={gapForm.title} onChange={e=>setGapForm({...gapForm,title:e.target.value})} placeholder="What is out of compliance?"/>
        <label className="flab" style={{marginTop:12}}>Severity</label>
        <select className="ti" value={gapForm.severity} onChange={e=>setGapForm({...gapForm,severity:e.target.value})}>{["Critical","High","Medium","Low"].map(r=><option key={r}>{r}</option>)}</select>
        <label className="flab" style={{marginTop:12}}>Detail</label>
        <textarea className="ti" value={gapForm.note} onChange={e=>setGapForm({...gapForm,note:e.target.value})}/>
      </div>
      <div className="mft"><button className="button button-primary" disabled={!gapForm.title.trim()} onClick={()=>{onLogGap(f.id,gapForm);setGapOpen(false);setGapForm({title:"",severity:"Medium",note:""});}}><Icon n="plus" s={15}/>Open gap</button>
        <button className="button button-secondary-outline" onClick={()=>setGapOpen(false)}>Cancel</button></div>
    </Modal>}
  </Modal>;
}

/* ================= TOPICS + STATUTES ================= */
function Topics({fns,go,openFn,nav,setNav}){
  const [tab,setTab]=useState("topics");
  const {topic,area} = nav;
  const areasOf = t => [...new Set(fns.filter(f=>f.topic===t).map(f=>f.area))];
  if(topic){
    const inTopic = fns.filter(f=>f.topic===topic);
    const rows = area? inTopic.filter(f=>f.area===area) : [];
    return <div className="page wrap">
      <div className="crumb"><button onClick={()=>setNav({})}>Topics</button><span>›</span>
        {area? <><button onClick={()=>setNav({topic})}>{topic}</button><span>›</span><span style={{color:"#000E54",fontWeight:600}}>{area}</span></> : <span style={{color:"#000E54",fontWeight:600}}>{topic}</span>}</div>
      <PageHead eyebrow={area?"Compliance area":"Topic"} title={area||topic}
        sub={area?`${rows.length} sample function${rows.length===1?"":"s"} in this area.`:`${(window.TOPICS.find(t=>t.name===topic)||{}).count} functions across ${areasOf(topic).length} compliance areas.`}/>
      {!area ? <div className="cm-grid g-card">{areasOf(topic).map(a=>{
        const n = inTopic.filter(f=>f.area===a).length;
        return <button key={a} className="tcard" onClick={()=>setNav({topic,area:a})}>
          <div className="bar" style={{background:"#203299"}}></div>
          <div className="bd"><h3>{a}</h3>
            <div className="ft"><span className="sub">{n} function{n===1?"":"s"}</span><span className="cnt" style={{fontSize:26}}>{n}</span></div></div></button>;})}
      </div> : <div className="cm-grid g-wide">{rows.map(f=><FnCard key={f.id} f={f} m={{g:0,fl:false}} onClick={()=>openFn(f)}/>)}</div>}
    </div>;
  }
  return <div className="page wrap">
    <PageHead eyebrow="Browse" title="Topics" sub="Thirteen top-level topics organize the matrix. Drill into a topic to see its compliance areas, then the functions inside."/>
    <div className="tabs">
      <button className={"tab"+(tab==="topics"?" on":"")} onClick={()=>setTab("topics")}>Topics</button>
      <button className={"tab"+(tab==="statutes"?" on":"")} onClick={()=>setTab("statutes")}>Statutes</button>
    </div>
    {tab==="topics" ? <div className="cm-grid g-card">{window.TOPICS.map(t=>{
      const max = window.TOPICS[0].count;
      return <button key={t.name} className="tcard" onClick={()=>setNav({topic:t.name})}>
        <div className="bar" style={{width:Math.max(18,Math.round(t.count/max*100))+"%"}}></div>
        <div className="bd"><h3>{t.name}</h3>
          <div className="ft"><span className="sub">{areasOf(t.name).length} compliance area{areasOf(t.name).length===1?"":"s"}</span>
            <span className="cnt">{t.count}</span></div></div></button>;})}
    </div> : <StatuteView fns={fns} openFn={openFn}/>}
  </div>;
}

function StatuteView({fns,openFn}){
  const [open,setOpen]=useState(null);
  const groups = useMemo(()=>{
    const m = new Map();
    fns.forEach(f=>{const k=f.statute; if(!m.has(k)) m.set(k,{statute:k,citations:new Set(),url:f.statuteUrl,fns:[]});
      const g=m.get(k); g.citations.add(f.citation); g.fns.push(f);});
    return [...m.values()].sort((a,b)=>b.fns.length-a.fns.length||a.statute.localeCompare(b.statute));
  },[fns]);
  return <>
    <div className="note" style={{marginBottom:14}}><b>Deduplicated.</b> {groups.length} distinct statutes govern the functions in the matrix — many obligations cite the same law. Expand a statute to see every function that references it.</div>
    <div className="cm-panel" style={{overflow:"hidden"}}>
      {groups.map(g=><div key={g.statute}>
        <button className="srow" onClick={()=>setOpen(open===g.statute?null:g.statute)}>
          <Icon n="scale" s={17} style={{color:"#F76900"}}/>
          <div style={{flex:1,minWidth:0}}>
            <div className="fname">{g.statute}</div>
            <div className="sub">{[...g.citations].join(" · ")}</div></div>
          <span className="chip">{g.fns.length} function{g.fns.length===1?"":"s"}</span>
          <Icon n="chev" s={15} style={{color:"#707780",transform:open===g.statute?"rotate(180deg)":""}}/>
        </button>
        {open===g.statute && <div style={{background:"#FAFBFD",borderBottom:"1px solid #E2E5EA",padding:"4px 15px 12px 44px"}}>
          {g.fns.map(f=><button key={f.id} onClick={()=>openFn(f)} style={{display:"flex",gap:10,alignItems:"center",width:"100%",background:"none",border:0,borderBottom:"1px solid #EEF0F4",padding:"9px 0",textAlign:"left"}}>
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:13.5,fontWeight:600,color:"#000E54"}}>{f.name}</div>
              <div className="sub">{f.topic} · {f.area}</div></div><Risk r={f.risk}/></button>)}
          <a href={g.url} target="_blank" rel="noopener" style={{fontSize:12.5,display:"inline-block",marginTop:10}}>Open the statute <Icon n="ext" s={11} style={{verticalAlign:-1}}/></a>
        </div>}
      </div>)}
    </div></>;
}

/* ================= AREAS ================= */
function Areas({fns,openFn}){
  const [sel,setSel]=useState(null);
  const groups = useMemo(()=>{
    const m=new Map();
    fns.forEach(f=>{if(!m.has(f.area))m.set(f.area,{area:f.area,topic:f.topic,fns:[]});m.get(f.area).fns.push(f);});
    return [...m.values()].sort((a,b)=>a.area.localeCompare(b.area));
  },[fns]);
  if(sel){const g=groups.find(x=>x.area===sel);
    return <div className="page wrap">
      <div className="crumb"><button onClick={()=>setSel(null)}>Areas</button><span>›</span><span style={{color:"#000E54",fontWeight:600}}>{sel}</span></div>
      <PageHead eyebrow={g.topic} title={sel} sub={`${g.fns.length} function${g.fns.length===1?"":"s"} in this compliance area.`}/>
      <div className="cm-grid g-wide">{g.fns.map(f=><FnCard key={f.id} f={f} m={{g:0,fl:false}} onClick={()=>openFn(f)}/>)}</div>
    </div>;}
  return <div className="page wrap">
    <PageHead eyebrow="Browse" title="Compliance Areas" sub="For users who think in areas rather than topics. Areas group related obligations regardless of which topic they sit under."/>
    <div className="cm-grid g-card">{groups.map(g=>
      <button key={g.area} className="tcard" onClick={()=>setSel(g.area)}>
        <div className="bar" style={{background:"#F76900"}}></div>
        <div className="bd"><div className="eyebrow" style={{fontSize:10.5,marginBottom:5}}>{g.topic}</div>
          <h3>{g.area}</h3>
          <div className="ft"><span className="sub">{g.fns.length} function{g.fns.length===1?"":"s"}</span>
            <div style={{display:"flex",gap:3}}>{g.fns.slice(0,4).map(f=><span key={f.id} title={f.risk} style={{width:8,height:8,borderRadius:2,background:RISK_COLOR[f.risk]}}></span>)}</div></div></div></button>)}
    </div></div>;
}

/* ================= DEADLINES ================= */
function Deadlines({deadlines,openFn,fns}){
  const [sort,setSort]=useState("due");
  const [scope,setScope]=useState("open");
  const [q,setQ]=useState("");
  const rows = useMemo(()=>{
    let r = deadlines.filter(d=>scope==="all"||(scope==="open"&&!d.complete)||(scope==="late"&&!d.complete&&dayDiff(d.due)<0)||(scope==="done"&&d.complete));
    if(q) r=r.filter(d=>(d.title+d.functionName+d.owner.n).toLowerCase().includes(q.toLowerCase()));
    return r.sort((a,b)=> sort==="due"? a.due-b.due : sort==="owner"? a.owner.n.localeCompare(b.owner.n) : a.cadence.localeCompare(b.cadence));
  },[deadlines,sort,scope,q]);
  const narrowDl = useMedia("(max-width:900px)");
  const [view,setView] = useState("calendar");
  const late = deadlines.filter(d=>!d.complete&&dayDiff(d.due)<0).length;
  const n30 = deadlines.filter(d=>!d.complete&&dayDiff(d.due)>=0&&dayDiff(d.due)<=30).length;
  const open = f => { const x=fns.find(y=>y.id===f.functionId); if(x) openFn(x); };
  return <div className="page wrap" style={{paddingTop:14}}>
    <PageHead eyebrow="Browse" title="Deadlines"
      sub="Every recurring and one-off due date in the matrix. Reminder emails go out automatically at 90 days, 30 days, on the due date, and weekly once an item is overdue."
      right={<><span className="pill late">{late} overdue</span><span className="pill warn">{n30} due in 30 days</span></>}/>
    <div className="fbar">
      <div className="srch"><Icon n="search" s={16}/><input placeholder="Search deadlines, functions, owners…" value={q} onChange={e=>setQ(e.target.value)}/></div>
      <select className="fs" value={scope} onChange={e=>setScope(e.target.value)}>
        <option value="open">Open</option><option value="late">Overdue only</option><option value="done">Completed</option><option value="all">All</option></select>
      <select className="fs" value={sort} onChange={e=>setSort(e.target.value)}>
        <option value="due">Sort by due date</option><option value="owner">Sort by owner</option><option value="cadence">Sort by cadence</option></select>
      <span className="count">{rows.length} items</span>
      <div style={{display:"flex",gap:4}}>
        <button className={"button button-sm "+(view==="calendar"?"button-secondary":"button-ghost")} onClick={()=>setView("calendar")}><Icon n="calendar" s={14}/>Calendar</button>
        <button className={"button button-sm "+(view==="list"?"button-secondary":"button-ghost")} onClick={()=>setView("list")}><Icon n="list" s={14}/>List</button>
      </div>
    </div>
    {view==="calendar" ? <DeadlineCalendar rows={rows} open={open}/> : <>
    {!rows.length && <Empty title="Nothing here" sub="No deadlines match this filter."/>}
    {!!rows.length && <><div className="tblwrap" style={{marginTop:14}}>
      <table className="table-simple" role="table"><thead><tr>
        <th style={{width:150}}>Due date</th><th>Deadline</th><th style={{width:120}}>Cadence</th><th>Owner</th><th style={{width:130}}>Status</th></tr></thead>
      <tbody>{rows.map(d=>{const st=dueState(d);return <tr key={d.id} className={"dl-row"+(st.cls==="late"?" late":"")} onClick={()=>open(d)}>
        <td><div style={{fontWeight:600,color:"#000E54",fontSize:13.5}}>{fmtDate(d.due)}</div><div className="sub">{fiscalQ(d.due)}</div></td>
        <td><div className="fname" style={{fontSize:13.5}}>{d.title}</div><div className="sub">{d.functionName}</div></td>
        <td><span className="chip">{d.cadence}</span></td>
        <td><div className="owner"><Avatar person={d.owner} size={28}/><div style={{minWidth:0}}>
          <div className="nm">{d.owner.n}</div><div className="ti">{d.owner.u}</div></div></div></td>
        <td><span className={"pill "+st.cls}>{st.label}</span></td></tr>;})}
      </tbody></table></div>
      {narrowDl && <div className="mobcards" style={{marginTop:14}}>{rows.map(d=>{const st=dueState(d);return <button key={d.id} className="fcard" onClick={()=>open(d)} style={st.cls==="late"?{borderLeft:"3px solid #DC2626"}:null}>
        <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
          <div style={{flex:1,minWidth:0}}><div className="t" style={{fontSize:14.5}}>{d.title}</div>
            <div className="sub" style={{marginTop:3}}>{d.functionName}</div></div><span className={"pill "+st.cls}>{st.label}</span></div>
        <div className="m"><span className="chip"><Icon n="calendar" s={12}/>{fmtDate(d.due)}</span><span className="chip">{d.cadence}</span><span className="chip">{fiscalQ(d.due)}</span></div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:11,paddingTop:11,borderTop:"1px solid #EEF0F4"}}>
          <Avatar person={d.owner} size={26}/><div className="nm" style={{fontSize:12.5}}>{d.owner.n}</div></div></button>;})}
      </div>}</>}</>}
  </div>;
}

/* ---- month calendar: day cells list function names, click a day to expand ---- */
const DAYK = d => d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function DeadlineCalendar({rows,open}){
  const first = rows.length ? rows.map(d=>d.due).sort((a,b)=>a-b)[0] : window.TODAY;
  const [cursor,setCursor] = useState(new Date(window.TODAY.getFullYear(), window.TODAY.getMonth(), 1));
  const [sel,setSel] = useState(null);
  const byDay = useMemo(()=>{const m={};rows.forEach(d=>{const k=DAYK(d.due);(m[k]=m[k]||[]).push(d);});return m;},[rows]);
  const y=cursor.getFullYear(), mo=cursor.getMonth();
  const lead = new Date(y,mo,1).getDay();
  const days = new Date(y,mo+1,0).getDate();
  const cells = [];
  for(let i=0;i<lead;i++) cells.push(null);
  for(let i=1;i<=days;i++) cells.push(new Date(y,mo,i));
  while(cells.length%7) cells.push(null);
  const monthCount = rows.filter(d=>d.due.getFullYear()===y&&d.due.getMonth()===mo).length;
  const selList = sel ? (byDay[sel]||[]) : [];
  const step = n => {setCursor(new Date(y,mo+n,1));setSel(null);};
  const todayK = DAYK(window.TODAY);
  return <div style={{marginTop:14}}>
    <div className="calbar">
      <button className="button button-secondary-outline button-sm" onClick={()=>step(-1)}>Previous</button>
      <div className="calmo">{MONTHS[mo]} {y}<span className="sub">{monthCount} deadline{monthCount===1?"":"s"} this month</span></div>
      <button className="button button-ghost button-sm" onClick={()=>{setCursor(new Date(window.TODAY.getFullYear(),window.TODAY.getMonth(),1));setSel(null);}}>Today</button>
      <button className="button button-secondary-outline button-sm" onClick={()=>step(1)}>Next</button>
    </div>
    <div className="calgrid">
      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} className="caldow">{d}</div>)}
      {cells.map((d,i)=>{
        if(!d) return <div key={"e"+i} className="calcell out"></div>;
        const k=DAYK(d), items=byDay[k]||[];
        const late=items.some(x=>!x.complete&&dayDiff(x.due)<0);
        if(!items.length) return <div key={k} className={"calcell empty"+(k===todayK?" today":"")}>
          <span className="cald">{d.getDate()}</span></div>;
        return <button key={k} className={"calcell"+(sel===k?" on":"")+(k===todayK?" today":"")}
          onClick={()=>setSel(sel===k?null:k)}>
          <span className="cald">{d.getDate()}{late&&<span className="caldot"></span>}</span>
          {items.slice(0,3).map(x=><span key={x.id} className={"calfn"+(!x.complete&&dayDiff(x.due)<0?" late":"")}>{x.functionName}</span>)}
          {items.length>3&&<span className="calmore">+{items.length-3} more</span>}
        </button>;
      })}
    </div>
    {sel && <div className="caldetail">
      <div className="caldetail-h">{fmtDate(selList[0].due)}<span className="sub">{fiscalQ(selList[0].due)} · {selList.length} due</span></div>
      {selList.map(d=>{const st=dueState(d);return <button key={d.id} className="caldrow" onClick={()=>open(d)}>
        <div style={{flex:1,minWidth:0}}>
          <div className="fname" style={{fontSize:13.5}}>{d.title}</div>
          <div className="sub" style={{marginTop:2}}>{d.functionName} · {d.topic}</div>
          <div style={{display:"flex",gap:6,marginTop:7,flexWrap:"wrap"}}>
            <span className="chip">{d.cadence}</span><Risk r={d.risk}/></div>
        </div>
        <div className="owner" style={{width:190}}><Avatar person={d.owner} size={30}/><div style={{minWidth:0}}>
          <div className="nm">{d.owner.n}</div><div className="ti">{d.owner.u}</div></div></div>
        <span className={"pill "+st.cls}>{st.label}</span>
      </button>;})}
    </div>}
    {!rows.length && <Empty title="Nothing scheduled" sub="No deadlines match this filter."/>}
  </div>;
}

/* ================= DIRECTORY ================= */
function Directory({people,fns,openFn}){
  const [q,setQ]=useState("");
  const [sel,setSel]=useState(null);
  const rows = people.filter(p=>!q||(p.n+p.t+p.u+p.e).toLowerCase().includes(q.toLowerCase()))
    .sort((a,b)=>a.n.split(" ").slice(-1)[0].localeCompare(b.n.split(" ").slice(-1)[0]));
  const own = p => fns.filter(f=>f.owner.n===p.n||f.exec.n===p.n||(f.unitOwner&&f.unitOwner.n===p.n));
  return <div className="page wrap" style={{paddingTop:14}}>
    <PageHead eyebrow="Browse" title="Compliance Directory" sub="The people layer of the matrix: every owner in an ownership chain, with title, unit, and contact information."/>
    <div className="fbar"><div className="srch"><Icon n="search" s={16}/>
      <input placeholder="Search people, titles, units…" value={q} onChange={e=>setQ(e.target.value)}/></div>
      <span className="count">{rows.length} people</span></div>
    <div className="cm-grid g-card" style={{marginTop:14}}>{rows.map(p=>
      <button key={p.n} className="fcard" onClick={()=>setSel(p)}>
        <div style={{display:"flex",gap:11,alignItems:"flex-start"}}>
          <Avatar person={p} size={44}/>
          <div style={{minWidth:0}}><div className="t" style={{fontSize:15}}>{p.n}</div>
            <div style={{fontSize:12.5,color:"#5b6373",marginTop:2,lineHeight:1.35}}>{p.t}</div>
            <div className="sub" style={{marginTop:4}}>{p.u}</div></div></div>
        <div className="m"><span className="chip">{own(p).length} function{own(p).length===1?"":"s"}</span>
          <span className="chip"><Icon n="mail" s={11}/>{p.e}</span></div></button>)}
    </div>
    {sel && <Modal onClose={()=>setSel(null)}>
      <div className="mhd"><Avatar person={sel} size={48}/>
        <div><h2>{sel.n}</h2><div style={{fontSize:13,color:"#C3CCE4",marginTop:4}}>{sel.t}</div></div>
        <button className="cl" onClick={()=>setSel(null)}>✕</button></div>
      <div className="mbd">
        <Field label="Contact"><dl className="kv">
          <dt>Unit</dt><dd>{sel.u}</dd><dt>Email</dt><dd><a href={"mailto:"+sel.e}>{sel.e}</a></dd>
          <dt>Phone</dt><dd>{sel.ph}</dd><dt>Location</dt><dd>{sel.l}</dd></dl></Field>
        <Field label={`Ownership portfolio (${own(sel).length})`}>
          {own(sel).map(f=><button key={f.id} className="srow" style={{border:"1px solid #E2E5EA",borderRadius:4,marginBottom:6}} onClick={()=>{setSel(null);openFn(f);}}>
            <div style={{flex:1,minWidth:0}}><div className="fname" style={{fontSize:13.5}}>{f.name}</div>
              <div className="sub">{f.topic} · {f.owner.n===sel.n?"Compliance Owner":f.exec.n===sel.n?"Executive Owner":"Unit Owner"}</div></div>
            <Risk r={f.risk}/></button>)}
          {!own(sel).length&&<p className="sub">No functions currently assigned.</p>}
        </Field></div>
      <div className="mft"><a className="button button-primary" href={"mailto:"+sel.e}><Icon n="mail" s={15}/>Email {sel.n.split(" ")[0]}</a>
        <button className="button button-secondary-outline" onClick={()=>setSel(null)}>Close</button></div>
    </Modal>}
  </div>;
}

/* ================= EXECUTIVE TEAM ================= */
function ExecutiveTeam({fns,openFn}){
  const [sel,setSel]=useState(null);
  const execs = window.EXECUTIVES;
  const port = p => fns.filter(f=>f.exec.n===p.n);
  return <div className="page wrap">
    <PageHead eyebrow="Portfolio view" title="Executive Team"
      sub="Executive owners sit at the top of every ownership chain. Sorted by last name; photos come from the directory, with initials shown where no photo exists."/>
    <div className="cm-grid g-card">{execs.map(p=>{
      const fs=port(p); const crit=fs.filter(f=>f.risk==="Critical").length;
      return <button key={p.n} className="tcard" onClick={()=>setSel(p)}>
        <div className="bar"></div>
        <div className="bd" style={{alignItems:"flex-start"}}>
          <div style={{display:"flex",gap:12,alignItems:"center",width:276,height:104}}>
            <Avatar person={p} size={54}/>
            <div style={{minWidth:0,width:202,height:95}}><h3>{p.n}</h3>
              <div style={{fontSize:12,color:"#5b6373",marginTop:3,lineHeight:1.35,width:203,height:35}}>{p.t}</div>
              <span className="sub" style={{width:155,height:40,fontSize:11}}>{p.u}</span></div></div>
          <div className="ft" style={{width:276,height:31}}>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {crit>0&&<span className="risk Critical" style={{width:49,height:30}}><span className="dot"></span>{crit}</span>}</div>
            <span className="chip">{fs.length} in portfolio</span></div></div></button>;})}
    </div>
    {sel && <Modal onClose={()=>setSel(null)}>
      <div className="mhd"><Avatar person={sel} size={52}/>
        <div><div className="eyebrow" style={{color:"#FF8E00"}}>Executive Owner</div>
          <h2 style={{marginTop:4}}>{sel.n}</h2>
          <div style={{fontSize:13,color:"#C3CCE4",marginTop:4}}>{sel.t}</div></div>
        <button className="cl" onClick={()=>setSel(null)}>✕</button></div>
      <div className="mbd">
        <div className="cm-grid g-stat" style={{marginBottom:20}}>
          <Stat n={port(sel).length} l="Functions" s="In this portfolio"/>
          <Stat n={port(sel).filter(f=>f.risk==="Critical"||f.risk==="High").length} l="Critical or high" tone="bad"/>
          <Stat n={[...new Set(port(sel).map(f=>f.topic))].length} l="Topics touched"/>
        </div>
        <Field label="Portfolio">
          {port(sel).map(f=><button key={f.id} className="srow" style={{border:"1px solid #E2E5EA",borderRadius:4,marginBottom:6}} onClick={()=>{setSel(null);openFn(f);}}>
            <div style={{flex:1,minWidth:0}}><div className="fname" style={{fontSize:13.5}}>{f.name}</div>
              <div className="sub">{f.area} · {f.owner.n}</div></div><Risk r={f.risk}/></button>)}
        </Field></div>
      <div className="mft"><a className="button button-primary" href={"mailto:"+sel.e}><Icon n="mail" s={15}/>Email</a>
        <button className="button button-secondary-outline" onClick={()=>setSel(null)}>Close</button></div>
    </Modal>}
  </div>;
}

Object.assign(window,{DeadlineCalendar,Home,FunctionsScreen,FunctionOverlay,Topics,Areas,Deadlines,Directory,ExecutiveTeam,FnCard,StatuteView});
