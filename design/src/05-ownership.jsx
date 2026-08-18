const {useState,useMemo} = React;
const {Icon,Avatar,Field} = window;

/* ============================================================
   OWNERSHIP CHAIN — one container per role, many people per role,
   each with a sub-role (Primary / Advisory / Support).
   Admins can add or remove people, and add someone who is not yet
   in the Compliance Directory by validating them against the
   university Active Directory (name or email).
   In the Power Apps build this is su_functionownership
   (function, person, role, subrole) + an AD connector lookup.
   ============================================================ */
const ROLES = [
  {k:"exec", label:"Executive Owner", note:"Accountable at the cabinet level."},
  {k:"unit", label:"Unit Owner", note:"Runs the obligation inside the unit."},
  {k:"compliance", label:"Compliance Owner", note:"Does the work and files the record."}
];
const SUBROLES = ["Primary","Advisory","Support"];

function chainFrom(f){
  const one = (p,sub) => p ? [{...p,sub}] : [];
  return {exec:one(f.exec,"Primary"), unit:one(f.unitOwner,"Primary"), compliance:one(f.owner,"Primary")};
}

function OwnershipChain({f,admin,onNotify}){
  const [chain,setChain] = useState(()=>chainFrom(f));
  const [manage,setManage] = useState(false);
  const [addTo,setAddTo] = useState(null);
  React.useEffect(()=>{setChain(chainFrom(f));setManage(false);setAddTo(null);},[f]);

  const inChain = useMemo(()=>new Set([].concat(...ROLES.map(r=>chain[r.k].map(p=>p.e)))),[chain]);
  const add = (k,p,sub) => {
    if(chain[k].some(x=>x.e===p.e)){onNotify(p.n+" already holds this role.");return;}
    setChain({...chain,[k]:[...chain[k],{...p,sub:sub||"Support"}]});
    setAddTo(null);
    onNotify(p.n+" added as "+(sub||"Support")+" on the "+ROLES.find(r=>r.k===k).label.toLowerCase()+" role.");
  };
  const remove = (k,e) => {const p=chain[k].find(x=>x.e===e);setChain({...chain,[k]:chain[k].filter(x=>x.e!==e)});onNotify(p.n+" removed from the ownership chain.");};
  const setSub = (k,e,sub) => setChain({...chain,[k]:chain[k].map(x=>x.e===e?{...x,sub}:x)});

  return <Field label="Ownership chain" right={admin && <button className="button button-secondary-outline button-sm" onClick={()=>{setManage(!manage);setAddTo(null);}}>
      <Icon n={manage?"check":"edit"} s={13}/>{manage?"Done":"Manage people"}</button>}>
    <div className="ochain">
      {ROLES.map(r=>{
        const list = chain[r.k];
        return <section key={r.k} className="orole">
          <header className="orole-h">
            <span className="orole-t">{r.label}</span>
            <span className="orole-n">{list.length} {list.length===1?"person":"people"}</span>
          </header>
          <div className="orole-note">{r.note}</div>
          {list.length ? list.map(p=><div key={p.e} className="operson">
            <Avatar person={p} size={34}/>
            <div className="operson-b">
              <div className="operson-n">{p.n}</div>
              <div className="operson-t">{p.t}</div>
              <a href={"mailto:"+p.e}>{p.e}</a>
            </div>
            {manage
              ? <select className="ti osub" value={p.sub} onChange={e=>setSub(r.k,p.e,e.target.value)}>
                  {SUBROLES.map(s=><option key={s}>{s}</option>)}</select>
              : <span className={"osubpill "+p.sub.toLowerCase()}>{p.sub}</span>}
            {manage && <button className="orm" title={"Remove "+p.n} onClick={()=>remove(r.k,p.e)}>✕</button>}
          </div>) : <div className="oempty">No one assigned to this role.</div>}
          {manage && (addTo===r.k
            ? <PersonPicker exclude={inChain} onCancel={()=>setAddTo(null)} onPick={(p,sub)=>add(r.k,p,sub)} onNotify={onNotify}/>
            : <button className="oadd" onClick={()=>setAddTo(r.k)}>+ Add person to {r.label.toLowerCase()}</button>)}
        </section>;
      })}
    </div>
  </Field>;
}

/* ---- pick from the Compliance Directory, or validate against Active Directory ---- */
function PersonPicker({exclude,onPick,onCancel,onNotify}){
  const [q,setQ] = useState("");
  const [sub,setSub] = useState("Support");
  const [adHit,setAdHit] = useState(null);
  const [adState,setAdState] = useState("idle"); // idle | searching | none | found
  const dir = useMemo(()=>{
    if(q.trim().length<2) return [];
    const t=q.toLowerCase();
    return window.PEOPLE.filter(p=>!exclude.has(p.e)&&(p.n+p.t+p.u+p.e).toLowerCase().includes(t)).slice(0,5);
  },[q,exclude]);

  const lookup = () => {
    setAdState("searching"); setAdHit(null);
    setTimeout(()=>{
      const hit = window.adLookup(q);
      if(hit){setAdHit(hit);setAdState("found");}
      else setAdState("none");
    },550);
  };

  return <div className="opick">
    <div className="opick-r">
      <div className="opick-s"><Icon n="search" s={15}/>
        <input autoFocus value={q} onChange={e=>{setQ(e.target.value);setAdState("idle");setAdHit(null);}} placeholder="Search by name or email…"/></div>
      <select className="ti osub" value={sub} onChange={e=>setSub(e.target.value)}>
        {SUBROLES.map(s=><option key={s}>{s}</option>)}</select>
      <button className="button button-ghost button-sm" onClick={onCancel}>Cancel</button>
    </div>

    {!!dir.length && <div className="opick-l">
      <div className="opick-lbl">In the Compliance Directory</div>
      {dir.map(p=><button key={p.e} className="opick-row" onClick={()=>onPick(p,sub)}>
        <Avatar person={p} size={28}/>
        <div style={{minWidth:0,flex:1}}><div className="operson-n">{p.n}</div><div className="operson-t">{p.t} · {p.u}</div></div>
        <span className="opick-add">Add as {sub}</span>
      </button>)}
    </div>}

    {q.trim().length>=2 && !dir.length && adState==="idle" && <div className="opick-ad">
      <div className="sub">No one in the Compliance Directory matches “{q}”.</div>
      <button className="button button-secondary-outline button-sm" onClick={lookup}>Look up in Active Directory</button>
    </div>}

    {adState==="searching" && <div className="opick-ad"><div className="sub">Checking the university Active Directory…</div></div>}

    {adState==="none" && <div className="opick-ad">
      <div className="sub">No Active Directory match for “{q}”. Check the spelling, or use their <b>@syr.edu</b> address.</div>
      <button className="button button-ghost button-sm" onClick={()=>setAdState("idle")}>Try again</button>
    </div>}

    {adState==="found" && adHit && <div className="opick-ad ok">
      <div className="opick-lbl">Validated in Active Directory</div>
      <div className="opick-row static">
        <Avatar person={adHit} size={32}/>
        <div style={{minWidth:0,flex:1}}>
          <div className="operson-n">{adHit.n}</div>
          <div className="operson-t">{adHit.t} · {adHit.u}</div>
          <div className="sub">{adHit.e} · NetID {adHit.netid}</div>
        </div>
      </div>
      <div className="sub" style={{marginTop:8}}>Adding them creates a Compliance Directory record and assigns them as <b>{sub}</b> on this role.</div>
      <button className="button button-primary button-sm" style={{marginTop:10}} onClick={()=>{
        const p = window.addToDirectory(adHit);
        onNotify(p.n+" added to the Compliance Directory from Active Directory.");
        onPick(p,sub);
      }}>Add to Compliance Directory</button>
    </div>}
  </div>;
}

Object.assign(window,{OwnershipChain,PersonPicker,OWNERSHIP_ROLES:ROLES,SUBROLES});
