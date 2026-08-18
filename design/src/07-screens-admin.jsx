const {useState,useMemo} = React;
const {Icon,Avatar,Risk,Modal,PageHead,Field,Stat,Empty,fmtDate,dayDiff,fiscalQ,RISK_COLOR} = window;

/* ================= GAP TRACKER ================= */
function GapTracker({gaps,flags,fns,openFn,onCloseGap,onUnflag}){
  const [tab,setTab]=useState("open");
  const [sev,setSev]=useState("All");
  const [sel,setSel]=useState(null);
  const [note,setNote]=useState("");
  const open = gaps.filter(g=>g.status==="Open");
  const closed = gaps.filter(g=>g.status==="Closed");
  const list = (tab==="open"?open:closed).filter(g=>sev==="All"||g.severity===sev)
    .sort((a,b)=>["Critical","High","Medium","Low"].indexOf(a.severity)-["Critical","High","Medium","Low"].indexOf(b.severity)||a.opened-b.opened);
  const byTopic = useMemo(()=>{const m={};open.forEach(g=>m[g.topic]=(m[g.topic]||0)+1);
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);},[gaps]);
  const jump = g => { const f=fns.find(x=>x.id===g.functionId); if(f) openFn(f); };
  return <div className="page wrap">
    <PageHead eyebrow="Risk and Reporting · Administrator" title="Gap Tracker"
      sub="Every open compliance gap across the institution, tied to the function it came from. Close a gap with documented notes; the count badge updates everywhere it appears."
      right={<><span className="pill late">{open.length} open</span><span className="pill ok">{closed.length} closed</span></>}/>
    <div className="cm-grid g-stat" style={{marginBottom:8}}>
      <Stat n={open.filter(g=>g.severity==="Critical").length} l="Critical" s="Immediate attention" tone="bad"/>
      <Stat n={open.filter(g=>g.severity==="High").length} l="High" tone="bad"/>
      <Stat n={open.filter(g=>g.severity==="Medium").length} l="Medium" tone="warn"/>
      <Stat n={Math.round(open.reduce((s,g)=>s+Math.abs(dayDiff(g.opened)),0)/Math.max(1,open.length))} l="Avg days open" s="Across open gaps"/>
    </div>
    <div className="sec-h"><span className="lbl">Open gaps by topic</span><span className="rule"></span></div>
    <div className="cm-panel" style={{padding:16,marginBottom:8}}>
      <div className="bars">{byTopic.map(([t,n])=>
        <div className="bar" key={t}><span style={{color:"#2b3345",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t}>{t}</span>
          <span className="tr"><span className="fl" style={{width:(n/byTopic[0][1]*100)+"%",background:"#F76900"}}></span></span>
          <span style={{fontWeight:700,color:"#000E54",textAlign:"right"}}>{n}</span></div>)}
      </div></div>
    <div className="tabs" style={{marginTop:22}}>
      <button className={"tab"+(tab==="open"?" on":"")} onClick={()=>setTab("open")}>Open gaps ({open.length})</button>
      <button className={"tab"+(tab==="closed"?" on":"")} onClick={()=>setTab("closed")}>Closed ({closed.length})</button>
      <button className={"tab"+(tab==="flags"?" on":"")} onClick={()=>setTab("flags")}>Flagged for review ({flags.length})</button>
    </div>
    {tab!=="flags" && <>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        <select className="fs" value={sev} onChange={e=>setSev(e.target.value)}>
          <option value="All">All severities</option>{["Critical","High","Medium","Low"].map(s=><option key={s}>{s}</option>)}</select>
        <span className="count">{list.length} shown</span></div>
      {!list.length && <Empty title="No gaps" sub="Nothing matches this filter."/>}
      <div className="cm-grid" style={{gridTemplateColumns:"repeat(auto-fill,minmax(360px,1fr))"}}>
        {list.map(g=><div key={g.id} className="cm-panel" style={{padding:15,borderLeft:"4px solid "+(g.status==="Open"?RISK_COLOR[g.severity]:"#16A34A")}}>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:9}}>
            <Risk r={g.severity}/>
            <span className="sub">{g.id}</span>
            <span className="sub">· opened {fmtDate(g.opened)} ({Math.abs(dayDiff(g.opened))}d)</span>
            {g.status==="Closed"&&<span className="pill ok" style={{marginLeft:"auto"}}>Closed {g.closed?fmtDate(g.closed):""}</span>}
          </div>
          <div style={{fontFamily:"var(--font-display)",fontWeight:700,color:"#000E54",fontSize:15,lineHeight:1.3}}>{g.title}</div>
          <p style={{fontSize:13,color:"#5b6373",marginTop:6}}>{g.note}</p>
          {g.status==="Closed"&&<div className="note" style={{borderLeftColor:"#16A34A",marginTop:8}}><b>Closure note</b> — {g.closeNote}</div>}
          <div style={{display:"flex",gap:8,alignItems:"center",marginTop:12,paddingTop:12,borderTop:"1px solid #EEF0F4",flexWrap:"wrap"}}>
            <Avatar person={g.owner} size={26}/>
            <div style={{minWidth:0,flex:1}}><div className="nm" style={{fontSize:12.5,fontWeight:600}}>{g.owner.n}</div>
              <div className="ti">{g.functionName}</div></div>
            <button className="button button-secondary-outline button-sm" onClick={()=>jump(g)}>Function</button>
            {g.status==="Open"&&<button className="button button-primary button-sm" onClick={()=>{setSel(g);setNote("");}}><Icon n="check" s={13}/>Close</button>}
          </div></div>)}
      </div></>}
    {tab==="flags" && <>
      {!flags.length && <Empty title="Nothing flagged" sub="Users can flag any function for review from its detail overlay."/>}
      <div className="cm-panel" style={{overflow:"hidden"}}>
        {flags.map(fl=>{const f=fns.find(x=>x.id===fl.functionId);if(!f)return null;
          return <div key={fl.functionId} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"14px 15px",borderBottom:"1px solid #E2E5EA",flexWrap:"wrap"}}>
            <Icon n="flag" s={18} style={{color:"#F76900",marginTop:2}}/>
            <div style={{flex:1,minWidth:220}}>
              <div className="fname">{f.name}</div>
              <div className="sub">{f.topic} · flagged by {fl.by} on {fmtDate(fl.at)}</div>
              <p style={{fontSize:13,color:"#5b6373",marginTop:6}}>{fl.reason}</p></div>
            <div style={{display:"flex",gap:8}}>
              <button className="button button-secondary-outline button-sm" onClick={()=>openFn(f)}>Review</button>
              <button className="button button-primary button-sm" onClick={()=>onUnflag(fl.functionId)}><Icon n="check" s={13}/>Clear</button></div>
          </div>;})}
      </div></>}
    {sel && <Modal onClose={()=>setSel(null)} size="sm">
      <div className="mhd"><div><h2>Close gap</h2>
        <div style={{fontSize:12.5,color:"#C3CCE4",marginTop:4}}>{sel.id} · {sel.functionName}</div></div>
        <button className="cl" onClick={()=>setSel(null)}>✕</button></div>
      <div className="mbd">
        <div className="note" style={{marginBottom:14}}><b>{sel.title}</b></div>
        <label className="flab">Closure notes (required)</label>
        <textarea className="ti" value={note} onChange={e=>setNote(e.target.value)} placeholder="What was remediated, and what prevents recurrence?"/>
        <p className="sub" style={{marginTop:10}}>Closing records the date, the closing user, and these notes on the gap record. The open-gap count updates immediately.</p>
      </div>
      <div className="mft"><button className="button button-primary" disabled={!note.trim()} onClick={()=>{onCloseGap(sel.id,note);setSel(null);}}><Icon n="check" s={15}/>Mark closed</button>
        <button className="button button-secondary-outline" onClick={()=>setSel(null)}>Cancel</button></div>
    </Modal>}
  </div>;
}

/* ================= RISK DASHBOARD ================= */
const LEVELS = ["Critical","High","Medium","Low"];
function RiskDashboard({fns,gaps,deadlines,openFn}){
  const [cell,setCell]=useState(null);
  const topics = window.TOPICS.map(t=>t.name).filter(t=>fns.some(f=>f.topic===t));
  const cellFns = (t,l)=>fns.filter(f=>f.topic===t&&f.risk===l);
  const max = Math.max(...topics.flatMap(t=>LEVELS.map(l=>cellFns(t,l).length)));
  const byRisk = l=>fns.filter(f=>f.risk===l).length;
  const shade = (l,n)=>{ if(!n) return null; const a=.32+.68*(n/max); const c=RISK_COLOR[l];
    return {background:c,opacity:1,boxShadow:"inset 0 0 0 999px rgba(255,255,255,"+(1-a)+")",color:a>.55?"#fff":"#3d2b1f"};};
  const sel = cell?cellFns(cell[0],cell[1]):[];
  return <div className="page wrap">
    <PageHead eyebrow="Risk and Reporting · Administrator" title="Risk Dashboard"
      sub="The executive risk picture: where the institution's critical and high-risk obligations sit, and how gaps and deadlines cluster against them."/>
    <div className="cm-grid g-stat">
      {LEVELS.map(l=><Stat key={l} n={byRisk(l)} l={l+" risk"} s={`${Math.round(byRisk(l)/fns.length*100)}% of the sample`} tone={l==="Critical"||l==="High"?"bad":l==="Medium"?"warn":null}/>)}
    </div>
    <div className="sec-h"><span className="lbl">Heat map — topic by risk rating</span><span className="rule"></span>
      <span style={{fontSize:12,fontWeight:400,color:"#707780"}}>select a cell to list the functions</span></div>
    <div className="cm-panel" style={{padding:16,overflowX:"auto"}}>
      <table className="heat"><thead><tr><th className="rw"></th>{LEVELS.map(l=><th key={l}>{l}</th>)}<th>Total</th></tr></thead>
        <tbody>{topics.map(t=>{const tot=LEVELS.reduce((s,l)=>s+cellFns(t,l).length,0);
          return <tr key={t}><th className="rw">{t}</th>
            {LEVELS.map(l=>{const n=cellFns(t,l).length;
              return <td key={l} className={n?"":"z"} style={shade(l,n)} onClick={()=>n&&setCell([t,l])}>{n||"·"}</td>;})}
            <td style={{background:"#F1F3F6",color:"#000E54"}}>{tot}</td></tr>;})}
        </tbody></table>
      <div className="legend">
        {LEVELS.map(l=><span key={l}><i style={{background:RISK_COLOR[l]}}></i>{l}</span>)}
        <span style={{marginLeft:"auto"}}>Shade intensity = number of functions in the cell</span>
      </div>
    </div>
    <div className="cm-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",marginTop:22}}>
      <div className="cm-panel" style={{padding:16}}>
        <div className="eyebrow" style={{marginBottom:12}}>Critical and high risk by topic</div>
        <div className="bars">{topics.map(t=>({t,n:cellFns(t,"Critical").length+cellFns(t,"High").length}))
          .sort((a,b)=>b.n-a.n).filter(x=>x.n).map(({t,n})=>
          <div className="bar" key={t}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={t}>{t}</span>
            <span className="tr"><span className="fl" style={{width:(n/6*100)+"%",background:"#DC2626"}}></span></span>
            <span style={{fontWeight:700,color:"#000E54",textAlign:"right"}}>{n}</span></div>)}
        </div></div>
      <div className="cm-panel" style={{padding:16}}>
        <div className="eyebrow" style={{marginBottom:12}}>Risk exposure signals</div>
        <dl className="kv" style={{gridTemplateColumns:"1fr auto",rowGap:11}}>
          <dt>Functions with an open gap</dt><dd style={{fontWeight:700,color:"#000E54"}}>{new Set(gaps.filter(g=>g.status==="Open").map(g=>g.functionId)).size}</dd>
          <dt>Critical functions with an open gap</dt><dd style={{fontWeight:700,color:"#B91C1C"}}>{new Set(gaps.filter(g=>g.status==="Open"&&fns.find(f=>f.id===g.functionId&&f.risk==="Critical")).map(g=>g.functionId)).size}</dd>
          <dt>Overdue deadlines</dt><dd style={{fontWeight:700,color:"#DC2626"}}>{deadlines.filter(d=>!d.complete&&dayDiff(d.due)<0).length}</dd>
          <dt>Due this fiscal quarter</dt><dd style={{fontWeight:700,color:"#D97706"}}>{deadlines.filter(d=>!d.complete&&fiscalQ(d.due)===fiscalQ(window.TODAY)).length}</dd>
          <dt>Unassigned unit-owner roles</dt><dd style={{fontWeight:700,color:"#707780"}}>{fns.filter(f=>!f.unitOwner).length}</dd>
        </dl>
        <div className="note" style={{marginTop:14}}>Percentages reflect the {fns.length}-function sample loaded in this prototype, not the full 404-function matrix.</div>
      </div>
    </div>
    {cell && <Modal onClose={()=>setCell(null)}>
      <div className="mhd"><div><div className="eyebrow" style={{color:"#FF8E00"}}>{cell[1]} risk</div>
        <h2 style={{marginTop:5}}>{cell[0]}</h2>
        <div style={{fontSize:12.5,color:"#C3CCE4",marginTop:4}}>{sel.length} function{sel.length===1?"":"s"}</div></div>
        <button className="cl" onClick={()=>setCell(null)}>✕</button></div>
      <div className="mbd">{sel.map(f=><button key={f.id} className="srow" style={{border:"1px solid #E2E5EA",borderRadius:4,marginBottom:6}} onClick={()=>{setCell(null);openFn(f);}}>
        <div style={{flex:1,minWidth:0}}><div className="fname" style={{fontSize:13.5}}>{f.name}</div>
          <div className="sub">{f.area} · {f.owner.n}</div></div><Risk r={f.risk}/></button>)}</div>
      <div className="mft"><button className="button button-secondary-outline" style={{marginLeft:"auto"}} onClick={()=>setCell(null)}>Close</button></div>
    </Modal>}
  </div>;
}

/* ================= REPORTING / POWER BI ================= */
function Reporting({fns,gaps,deadlines}){
  const [tab,setTab]=useState("embed");
  const DATASETS = [
    ["Compliance Functions","su_compliancefunction","One row per obligation with the full ownership chain, statute, cadence, and risk rating.",fns.length+" rows (404 in production)"],
    ["Compliance Deadlines","su_compliancedeadline","One row per due date, joined to its function; carries cadence, completion flag, and copied owner fields.",deadlines.length+" rows"],
    ["Compliance Gaps","su_compliancegap","Open and closed gaps with severity, opened/closed dates, and closure notes.",gaps.length+" rows"],
    ["Compliance Directory","su_compliancedirectory","People layer: name, title, unit, email, phone, location.",window.PEOPLE.length+" rows"]
  ];
  return <div className="page wrap">
    <PageHead eyebrow="Risk and Reporting · Administrator" title="Reporting"
      sub="The matrix is the system of record; Power BI is the visualization layer. Reports connect straight to the Dataverse tables, so what leadership sees is never a stale copy."
      right={<a className="button button-primary" href="https://app.powerbi.com" target="_blank" rel="noopener"><Icon n="ext" s={15}/>Open in Power BI</a>}/>
    <div className="tabs">
      <button className={"tab"+(tab==="embed"?" on":"")} onClick={()=>setTab("embed")}>Embedded report</button>
      <button className={"tab"+(tab==="data"?" on":"")} onClick={()=>setTab("data")}>Datasets and connection</button>
      <button className={"tab"+(tab==="export"?" on":"")} onClick={()=>setTab("export")}>Exports</button>
    </div>
    {tab==="embed" && <>
      <div className="pbi-frame">
        <Icon n="chart" s={38} style={{color:"#ADB3B8"}}/>
        <div style={{fontFamily:"var(--font-display)",fontWeight:700,color:"#000E54",fontSize:17}}>Power BI report renders here</div>
        <p className="sub" style={{maxWidth:"52ch"}}>In the deployed app this frame hosts the <b>Compliance Executive Overview</b> report, embedded with row-level security so each viewer sees only the portfolio they own. Filters set on this page pass through to the report.</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",marginTop:4}}>
          <span className="chip">Workspace: Compliance &amp; ERM</span><span className="chip">Refresh: every 3 hours</span><span className="chip">RLS: by ownership chain</span></div>
      </div>
      <div className="cm-grid pbi" style={{marginTop:14}}>
        {[["Compliance Executive Overview","Portfolio risk, gap counts, and deadline health for the senior leadership team."],
          ["Deadline Health","Overdue and upcoming obligations by unit, with reminder-response rates."],
          ["Gap Aging","Open gaps by severity and days-open, with closure throughput over time."]].map(([t,s])=>
          <div key={t} className="cm-panel" style={{padding:15}}>
            <div style={{display:"flex",gap:9,alignItems:"center"}}><Icon n="chart" s={17} style={{color:"#F76900"}}/>
              <div style={{fontFamily:"var(--font-display)",fontWeight:700,color:"#000E54",fontSize:14.5}}>{t}</div></div>
            <p style={{fontSize:13,color:"#5b6373",marginTop:8}}>{s}</p>
            <a href="https://app.powerbi.com" target="_blank" rel="noopener" style={{fontSize:12.5,fontWeight:600,display:"inline-block",marginTop:8}}>Open report <Icon n="ext" s={11} style={{verticalAlign:-1}}/></a>
          </div>)}
      </div></>}
    {tab==="data" && <>
      <div className="note" style={{marginBottom:14}}><b>Connection.</b> Power BI Desktop → Get Data → Dataverse → environment URL → select the tables below. Publish to the <b>Compliance &amp; ERM</b> workspace and schedule refresh; no intermediate export is required.</div>
      <div className="tblwrap"><table className="table-simple" role="table"><thead><tr>
        <th>Table</th><th>Logical name</th><th>Contents</th><th>Volume</th></tr></thead>
        <tbody>{DATASETS.map(([n,l,d,v])=><tr key={l} style={{cursor:"default"}}>
          <td><div className="fname" style={{fontSize:13.5}}>{n}</div></td>
          <td><code style={{fontSize:12.5,color:"#203299"}}>{l}</code></td>
          <td style={{fontSize:13,color:"#5b6373"}}>{d}</td>
          <td className="sub">{v}</td></tr>)}
        </tbody></table></div>
      <div className="cm-grid pbi" style={{marginTop:14}}>
        <div className="cm-panel" style={{padding:15}}><div className="eyebrow" style={{marginBottom:9}}>Relationships</div>
          <dl className="kv" style={{gridTemplateColumns:"1fr",rowGap:7,fontSize:13}}>
            <dd><b>Deadlines</b> → Functions on <code>su_FunctionId</code> (many-to-one)</dd>
            <dd><b>Gaps</b> → Functions on <code>su_FunctionId</code> (many-to-one)</dd>
            <dd><b>Functions</b> → Directory on three owner lookups</dd></dl></div>
        <div className="cm-panel" style={{padding:15}}><div className="eyebrow" style={{marginBottom:9}}>Measures to define</div>
          <dl className="kv" style={{gridTemplateColumns:"1fr",rowGap:7,fontSize:13}}>
            <dd>Open Gap Count, Gap Aging Days</dd><dd>Overdue Deadlines, On-Time Completion %</dd>
            <dd>Critical Exposure = Critical functions with an open gap</dd>
            <dd>Fiscal calendar starts July 1 — mark a custom date table</dd></dl></div>
      </div></>}
    {tab==="export" && <div className="cm-grid pbi">
      {[["Full matrix (CSV)","All functions with the complete column set, for offline review or audit request."],
        ["Deadline calendar (ICS)","Subscribe to due dates in Outlook; regenerated on each change."],
        ["Gap register (XLSX)","Open and closed gaps with severity, aging, and closure notes."],
        ["Executive portfolio pack (PDF)","One page per executive owner, generated from the current data."]].map(([t,s])=>
        <div key={t} className="cm-panel" style={{padding:15}}>
          <div style={{fontFamily:"var(--font-display)",fontWeight:700,color:"#000E54",fontSize:14.5}}>{t}</div>
          <p style={{fontSize:13,color:"#5b6373",marginTop:7}}>{s}</p>
          <button className="button button-secondary-outline button-sm" style={{marginTop:10}}>Generate</button></div>)}
    </div>}
  </div>;
}

function NoAccess({go}){
  return <div className="page wrap"><div className="cm-panel" style={{padding:"48px 24px",textAlign:"center"}}>
    <Icon n="shield" s={38} style={{color:"#ADB3B8"}}/>
    <h2 style={{fontFamily:"var(--font-display)",color:"#000E54",margin:"12px 0 6px"}}>Administrator access required</h2>
    <p className="sub" style={{maxWidth:"48ch",margin:"0 auto"}}>Risk and Reporting is limited to compliance office staff listed in the app administrators table. Switch the role selector in the header to Administrator to see these screens.</p>
    <button className="button button-secondary" style={{marginTop:18}} onClick={()=>go("Home")}>Back to Home</button>
  </div></div>;
}

Object.assign(window,{GapTracker,RiskDashboard,Reporting,NoAccess});
