const {useState,useEffect,useMemo} = React;
const {Icon,Avatar,Risk,Header,PageHead,Field,RoleCard,Empty,fmtDate,dayDiff,dueState,fiscalQ,RISK_COLOR,counselFor} = window;

/* ============================================================
   FUNCTION DETAIL — full screen (replaces the overlay).
   Drill-down carried over: inline edit, flag / clear flag,
   log a gap, gap history, deadlines, ownership chain.
   ============================================================ */
function FunctionDetailScreen({f,role,people,deadlines,gaps,flags,onSave,onFlag,onUnflag,onLogGap,go,onBack,prev,next,onJump}){
  const [mode,setMode]=useState("read");
  const [d,setD]=useState(f);
  const [panel,setPanel]=useState(null); // "flag" | "gap" | null
  const [flagText,setFlagText]=useState("");
  const [gapForm,setGapForm]=useState({title:"",severity:"Medium",note:""});
  const [toast,setToast]=useState("");
  useEffect(()=>{setD(f);setMode("read");setPanel(null);window.scrollTo(0,0);},[f]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),2600);return()=>clearTimeout(t);},[toast]);

  const admin = role==="Administrator";
  const flag = flags.find(x=>x.functionId===f.id);
  const dls  = deadlines.filter(x=>x.functionId===f.id);
  const gs   = gaps.filter(x=>x.functionId===f.id);
  const openGaps = gs.filter(g=>g.status==="Open");
  const nextDue = dls.filter(x=>!x.complete).sort((a,b)=>a.due-b.due)[0];
  const set=(k,v)=>setD({...d,[k]:v});
  const setP=(k,kk,v)=>setD({...d,[k]:{...(d[k]||{n:"",t:"",u:"",e:""}),[kk]:v}});

  return <div className="fd">
    {/* --- context bar: breadcrumb + record stepper --- */}
    <div className="fd-crumb">
      <div className="wrap fd-crumb-in">
        <button className="crumb-back" onClick={onBack}><Icon n="arrow-right" s={14} style={{transform:"rotate(180deg)"}}/>All functions</button>
        <span className="crumb-sep">/</span>
        <button className="crumb-link" onClick={()=>go("Topics")}>{f.topic}</button>
        <span className="crumb-sep">/</span>
        <span className="crumb-here">{f.name}</span>
        <div className="fd-step">
          <button className="button button-ghost button-sm" disabled={!prev} onClick={()=>onJump(prev)}>Previous</button>
          <button className="button button-ghost button-sm" disabled={!next} onClick={()=>onJump(next)}>Next record</button>
        </div>
      </div>
    </div>

    {/* --- navy record header --- */}
    <div className="fd-head">
      <div className="wrap">
        <div className="eyebrow" style={{color:"#FF8E00"}}>{f.topic} · {f.area}</div>
        <h1>{mode==="edit"?"Editing — "+d.name:d.name}</h1>
        <div className="fd-tags">
          <Risk r={d.risk}/>
          <span className="fd-chip">{d.id}</span>
          <span className="fd-chip">{d.statute}</span>
          {openGaps.length>0 && <span className="gapbadge">{openGaps.length} open {openGaps.length===1?"gap":"gaps"}</span>}
          {flag && <span className="flagb"><Icon n="flag" s={11} sw={2.2}/>Flagged for review</span>}
        </div>
        <div className="fd-actions">
          {mode==="read" ? null : <>
            <button className="button button-primary" onClick={()=>{onSave(d);setMode("read");setToast("Changes saved to the matrix.");}}><Icon n="check" s={15}/>Save changes</button>
            <button className="button button-secondary-outline fd-onnavy" onClick={()=>{setD(f);setMode("read");}}>Cancel</button>
          </>}
        </div>
      </div>
    </div>
    <div className="fd-rule"></div>

    {/* --- inline action panels (were nested modals) --- */}
    {panel==="flag" && <div className="fd-panel">
      <div className="wrap">
        <div className="fd-panel-t"><Icon n="flag" s={16}/>Flag this function for review</div>
        <label className="flab">Why does this need review?</label>
        <textarea className="ti" value={flagText} onChange={e=>setFlagText(e.target.value)} placeholder="e.g. Citation may be superseded by the 2026 final rule."/>
        <div className="note" style={{marginTop:10}}>Flagging notifies the compliance office and adds this function to the admin review queue. The office responds within five business days.</div>
        <div className="fd-panel-a">
          <button className="button button-primary" disabled={!flagText.trim()} onClick={()=>{onFlag(f.id,flagText);setPanel(null);setFlagText("");setToast("Flag submitted to the compliance office.");}}><Icon n="flag" s={15}/>Submit flag</button>
          <button className="button button-secondary-outline" onClick={()=>setPanel(null)}>Cancel</button>
        </div>
      </div>
    </div>}

    {panel==="gap" && <div className="fd-panel gap">
      <div className="wrap">
        <div className="fd-panel-t"><Icon n="alert" s={16}/>Log a compliance gap</div>
        <div className="frow">
          <div style={{flex:2}}><label className="flab">Gap summary</label>
            <input className="ti" value={gapForm.title} onChange={e=>setGapForm({...gapForm,title:e.target.value})} placeholder="What is out of compliance?"/></div>
          <div><label className="flab">Severity</label>
            <select className="ti" value={gapForm.severity} onChange={e=>setGapForm({...gapForm,severity:e.target.value})}>
              {["Critical","High","Medium","Low"].map(s=><option key={s}>{s}</option>)}</select></div>
        </div>
        <label className="flab">Detail and remediation plan</label>
        <textarea className="ti" value={gapForm.note} onChange={e=>setGapForm({...gapForm,note:e.target.value})} placeholder="What was found, how it was identified, and what happens next."/>
        <div className="note" style={{marginTop:10}}>Opens a gap record against {f.id} and notifies {f.owner.n} and the compliance office.</div>
        <div className="fd-panel-a">
          <button className="button button-danger" disabled={!gapForm.title.trim()} onClick={()=>{onLogGap(f.id,gapForm);setPanel(null);setGapForm({title:"",severity:"Medium",note:""});setToast("Gap logged and routed to the gap tracker.");}}><Icon n="alert" s={15}/>Log gap</button>
          <button className="button button-secondary-outline" onClick={()=>setPanel(null)}>Cancel</button>
        </div>
      </div>
    </div>}

    {/* --- body: main column + sticky rail --- */}
    <div className="wrap fd-body">
      <main className="fd-main">
        {flag && <div className="note fd-flagnote">
          <b>Flagged for review</b> by {flag.by} on {fmtDate(flag.at)} — {flag.reason}
          {admin && <div style={{marginTop:8}}><button className="button button-secondary-outline button-sm" onClick={()=>{onUnflag(f.id);setToast("Flag cleared.");}}><Icon n="check" s={13}/>Clear flag</button></div>}
        </div>}

        {mode==="read" ? <>
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
            {dls.map(x=>{const st=dueState(x);return <div key={x.id} className="dlrow" style={{background:st.cls==="late"?"#FFF7F7":"#fff"}}>
              <Icon n="clock" s={15} style={{color:"#707780"}}/>
              <div style={{flex:1,minWidth:140}}>
                <div style={{fontSize:13.5,fontWeight:600,color:"#000E54"}}>{x.title}</div>
                <div className="sub">{fmtDate(x.due)} · {fiscalQ(x.due)} · {x.cadence}</div></div>
              <span className={"pill "+st.cls}>{st.label}</span></div>;})}
          </Field>
          <window.OwnershipChain f={d} admin={admin} onNotify={setToast}/>
          <Field label={"Gap history ("+gs.length+")"}>
            {gs.length ? gs.map(g=><div key={g.id} className="gaprow" style={{borderLeftColor:g.status==="Open"?(RISK_COLOR[g.severity]||"#DC2626"):"#16A34A"}}>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span className={"pill "+(g.status==="Open"?"late":"ok")}>{g.status}</span>
                <span className="sub">{g.id} · opened {fmtDate(g.opened)} · {g.severity} severity{g.closed?" · closed "+fmtDate(g.closed):""}</span></div>
              <div style={{fontSize:13.5,fontWeight:600,color:"#000E54",marginTop:6}}>{g.title}</div>
              <p style={{fontSize:13,color:"#5b6373",marginTop:4}}>{g.status==="Closed"?g.closeNote:g.note}</p>
            </div>) : <Empty title="No gaps recorded" sub="Nothing has been logged against this function. Use “Log a gap” if you find something out of compliance."/>}
          </Field>
          <Field label="Syracuse University resource">
            <a href={d.resourceUrl} target="_blank" rel="noopener" style={{fontSize:14,fontWeight:600}}>{d.resourceLabel} <Icon n="ext" s={12} style={{verticalAlign:-1}}/></a>
            <div className="sub" style={{marginTop:3}}>{d.resourceUrl.replace(/^https?:\/\//,"")}</div>
          </Field>
        </> : <>
          <div className="note" style={{marginBottom:18}}><b>Editing.</b> Changing an owner also updates the owner fields copied onto this function’s deadline records when you save.</div>
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
            <div className="note">People and sub-roles are managed on the record itself. Save or cancel these edits, then use <b>Manage people</b> in the ownership chain.</div>
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
      </main>

      <aside className="fd-rail">
        <div className="rail-card">
          <div className="rail-t">Record status</div>
          <dl className="rail-kv">
            <dt>Risk rating</dt><dd><Risk r={d.risk}/></dd>
            <dt>Open gaps</dt><dd>{openGaps.length ? <span className="gapbadge">{openGaps.length}</span> : <span className="sub">None</span>}</dd>
            <dt>Next deadline</dt><dd>{nextDue ? <><div style={{fontWeight:600,color:"#000E54",fontSize:13}}>{fmtDate(nextDue.due)}</div><span className={"pill "+dueState(nextDue).cls}>{dueState(nextDue).label}</span></> : <span className="sub">None scheduled</span>}</dd>
            <dt>Under review</dt><dd>{flag ? <span className="flagb"><Icon n="flag" s={11} sw={2.2}/>Yes</span> : <span className="sub">No</span>}</dd>
            <dt>Last reviewed</dt><dd className="sub">{fmtDate(window.TODAY)}</dd>
          </dl>
        </div>
        <div className="rail-card">
          <div className="rail-t">Take action</div>
          <div className="rail-acts">
            {admin && <button className="button button-secondary-outline button-sm" onClick={()=>setMode("edit")}><Icon n="edit" s={14}/>Edit this record</button>}
            {!flag && <button className="button button-secondary-outline button-sm" onClick={()=>setPanel("flag")}><Icon n="flag" s={14}/>Flag for review</button>}
            <button className="button button-danger-outline button-sm" onClick={()=>setPanel("gap")}><Icon n="alert" s={14}/>Log a gap</button>
            <button className="button button-ghost button-sm" onClick={()=>go("Deadlines")}><Icon n="calendar" s={14}/>See all deadlines</button>
          </div>
        </div>
        <div className="rail-card gc">
          <div className="rail-t">Legal questions</div>
          <div className="gc-lede">Counsel of record for {f.topic}. Reach out before responding to a regulator, signing an agreement, or interpreting the statute.</div>
          {(()=>{const gc=counselFor(f);return <div style={{display:"flex",gap:10,alignItems:"flex-start",marginTop:12}}>
            <Avatar person={gc} size={40}/>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:700,color:"#000E54",fontSize:13.5,lineHeight:1.3}}>{gc.n}</div>
              <div style={{fontSize:12,color:"#5b6373",marginTop:3,lineHeight:1.35}}>{gc.t}</div>
              <a href={"mailto:"+gc.e} style={{fontSize:12,display:"inline-block",marginTop:5,wordBreak:"break-all"}}>{gc.e}</a>
              <div className="sub" style={{marginTop:3}}>{gc.ph} · {gc.l}</div>
            </div></div>;})()}
          <a className="gc-esc" href={"mailto:"+counselFor(f).e+"?subject="+encodeURIComponent("Legal question — "+f.id+" "+f.name)}>Email a question about this function</a>
        </div>
        <div className="rail-card quiet">
          <div className="rail-t">Related in {f.topic}</div>
          {window.FUNCTIONS.filter(x=>x.topic===f.topic&&x.id!==f.id).slice(0,4).map(x=>
            <button key={x.id} className="rail-rel" onClick={()=>onJump(x)}>
              <span>{x.name}</span><Risk r={x.risk}/>
            </button>)}
        </div>
      </aside>
    </div>

    {toast && <div className="fd-toast"><Icon n="check" s={16}/>{toast}</div>}
  </div>;
}

Object.assign(window,{FunctionDetailScreen});
