const {useState,useEffect,useMemo,useRef} = React;

const IP = {
  home:"M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5",
  "arrow-right":"M4 12h15m-6-6 6 6-6 6",
  grid:"M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  list:"M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  layers:"M12 3 3 7.5l9 4.5 9-4.5zM3 12.5 12 17l9-4.5M3 17 12 21.5 21 17",
  folder:"M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  calendar:"M4 6h16v15H4zM4 10h16M9 3v4M15 3v4",
  users:"M16.5 20v-1.5a3.5 3.5 0 0 0-3.5-3.5H7a3.5 3.5 0 0 0-3.5 3.5V20M10 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5M17 5.2a3.5 3.5 0 0 1 0 6.6M20.5 20v-1.5a3.4 3.4 0 0 0-2-3",
  alert:"M12 4 2.5 20.5h19zM12 10v4.5M12 17.5h.01",
  flag:"M5 21V4h9l-1 3h6l-1.5 5H21l-2 5H5",
  chart:"M4 20V4M4 20h16M8 17V11M12.5 17V7M17 17v-4",
  shield:"M12 3 5 5.5v5c0 5 3.2 8.4 7 10 3.8-1.6 7-5 7-10v-5z",
  search:"M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20.5 20.5 16 16",
  chev:"M6 9.5 12 15.5l6-6",
  menu:"M4 7h16M4 12h16M4 17h16",
  edit:"M4 20h4L20 8l-4-4L4 16zM14.5 5.5 18.5 9.5",
  ext:"M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  check:"M4.5 12.5 9.5 17.5 20 6.5",
  clock:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7.5V12l3.5 2",
  scale:"M12 4v16M7 20h10M12 6 5 9l3 4.5L11 9zM12 6l7 3-3 4.5L13 9z",
  plus:"M12 5v14M5 12h14",
  book:"M4 5.5A2 2 0 0 1 6 4h13v16H6a2 2 0 0 0-2 2zM19 16.5H6",
  mail:"M3.5 6h17v12h-17zM3.5 6.5 12 13l8.5-6.5",
  bell:"M18 16V10.5a6 6 0 0 0-12 0V16l-1.5 2.5h15zM10 19a2 2 0 0 0 4 0"
};
function Icon({n,s=17,sw=1.8,style}){return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true"><path d={IP[n]}/></svg>;}

const AV_BG = ["#000E54","#203299","#2B72D7","#D74100","#404040","#7C3AED","#0F766E","#9A3412"];
const initials = n => n ? n.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase() : "?";
function Avatar({person,size=32,photo}){
  const n = person ? person.n : "";
  const hue = AV_BG[(n.charCodeAt(0)+n.length)%AV_BG.length];
  return <div className="av" style={{width:size,height:size,fontSize:Math.round(size*.38),background:hue}} title={n}>
    {photo ? <img src={photo} alt={n}/> : initials(n)}
  </div>;
}
const Risk = ({r}) => <span className={"risk "+r}>{r}</span>;

const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = d => `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const dayDiff = d => Math.round((d - window.TODAY)/86400000);
const fiscalQ = d => { const m=d.getMonth(); const q=Math.floor(((m+6)%12)/3)+1; const fy=m>=6?d.getFullYear()+1:d.getFullYear(); return `FY${String(fy).slice(2)} Q${q}`; };
function dueState(dl){
  if(dl.complete) return {cls:"ok",label:"Complete"};
  const d = dayDiff(dl.due);
  if(d<0) return {cls:"late",label:`Overdue ${Math.abs(d)}d`};
  if(d<=30) return {cls:"warn",label:`Due in ${d}d`};
  if(d<=90) return {cls:"due",label:`Due in ${d}d`};
  return {cls:"",label:`Due in ${d}d`};
}
const RISK_COLOR = {Critical:"#B91C1C",High:"#DC2626",Medium:"#D97706",Low:"#16A34A"};

function useMedia(q){
  const [m,setM]=useState(()=>window.matchMedia(q).matches);
  useEffect(()=>{const mq=window.matchMedia(q);const h=e=>setM(e.matches);mq.addEventListener("change",h);return()=>mq.removeEventListener("change",h);},[q]);
  return m;
}

/* ---------------- header ---------------- */
const BROWSE = [
  ["Functions","list","All 404 compliance obligations"],
  ["Topics","layers","13 topics and their areas"],
  ["Areas","folder","Grouped by compliance area"],
  ["Deadlines","calendar","Upcoming and recurring due dates"],
  ["Directory","users","Owners, titles, units, contacts"]
];
const ADMIN_NAV = [
  ["Gap Tracker","alert","Open gaps and closure workflow"],
  ["Risk Dashboard","chart","Heat map and risk rollups"],
  ["Reporting","shield","Power BI datasets and exports"]
];

function Dropdown({label,icon,items,active,go,openGaps}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  const on = items.some(i=>i[0]===active);
  return <div ref={ref} style={{position:"relative"}}>
    <button className={"navbtn"+(on?" on":"")} onClick={()=>setOpen(!open)} aria-expanded={open}>
      <Icon n={icon}/>{label}<Icon n="chev" s={13} sw={2.2} style={{opacity:.65}}/>
    </button>
    {open && <div className="menu">{items.map(([n,ic,sub])=>
      <button key={n} className="mi" onClick={()=>{go(n);setOpen(false);}}>
        <Icon n={ic}/><span>{n}{n==="Gap Tracker"&&openGaps?<span className="gapbadge" style={{marginLeft:8}}>{openGaps}</span>:null}<span className="mi-sub">{sub}</span></span>
      </button>)}</div>}
  </div>;
}

function Header({screen,go,role,setRole,openGaps}){
  const [drawer,setDrawer]=useState(false);
  const admin = role==="Administrator";
  useEffect(()=>{setDrawer(false)},[screen]);
  return <>
  <div className="util">
    <div className="util-in">
      <a href="https://www.syracuse.edu" target="_blank" rel="noopener">Syracuse.edu</a>
      <a href="https://policies.syr.edu" target="_blank" rel="noopener">Policies</a>
      <a className="sp" href="https://compliance.syr.edu" target="_blank" rel="noopener">Report a Concern</a>
      <label className="util-role">Viewing as
        <select value={role} onChange={e=>setRole(e.target.value)} title="Prototype: switch role to see access gating">
          <option>Administrator</option><option>Compliance Owner</option><option>Executive</option>
        </select></label>
    </div>
  </div>
  <header className="hdr">
    <div className="hdr-in">
      <button className="lockup" onClick={()=>go("Home")} title="Home">
        <img className="block-s" src="assets/SYRACUSE_BlockS_ORANGE_RGB.png" alt="" aria-hidden="true"/>
        <span><span className="app">Syracuse University</span><span className="unit">Compliance Matrix</span></span>
      </button>
      <nav className="cm-nav">
        <button className={"navbtn"+(screen==="Home"?" on":"")} onClick={()=>go("Home")}><Icon n="home"/>Home</button>
        <Dropdown label="Browse" icon="grid" items={BROWSE} active={screen} go={go}/>
        {admin && <Dropdown label="Risk and Reporting" icon="chart" items={ADMIN_NAV} active={screen} go={go} openGaps={openGaps}/>}
        <button className={"navbtn"+(screen==="Executive Team"?" on":"")} onClick={()=>go("Executive Team")}><Icon n="users"/>Executive Team</button>
      </nav>
      <div className="hdr-right">
        <button className="hamb" onClick={()=>setDrawer(!drawer)} aria-label="Menu"><Icon n={drawer?"chev":"menu"} s={20}/></button>
      </div>
    </div>
  </header>
  {drawer && <div className="drawer">
    <button className="di" onClick={()=>go("Home")}><Icon n="home" s={20}/>Home</button>
    <button className="di" onClick={()=>go("Executive Team")}><Icon n="users" s={20}/>Executive Team</button>
    <div className="dgrp">Browse</div>
    {BROWSE.map(([n,ic])=><button key={n} className="di" onClick={()=>go(n)}><Icon n={ic} s={20}/>{n}</button>)}
    {admin && <><div className="dgrp">Risk and Reporting</div>
      {ADMIN_NAV.map(([n,ic])=><button key={n} className="di" onClick={()=>go(n)}><Icon n={ic} s={20}/>{n}{n==="Gap Tracker"&&openGaps?<span className="gapbadge" style={{marginLeft:6}}>{openGaps}</span>:null}</button>)}</>}
  </div>}
  </>;
}

/* ---------------- shells ---------------- */
function Modal({children,onClose,size}){
  useEffect(()=>{const h=e=>{if(e.key==="Escape")onClose()};document.addEventListener("keydown",h);
    document.body.style.overflow="hidden";return()=>{document.removeEventListener("keydown",h);document.body.style.overflow="";};},[onClose]);
  return <div className="scrim" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className={"cm-modal"+(size==="sm"?" sm":"")}>{children}</div>
  </div>;
}
const PageHead = ({eyebrow,title,sub,right}) => <div className="ph">
  <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{sub&&<p>{sub}</p>}</div>
  {right&&<div className="ph-r">{right}</div>}
</div>;
const Field = ({label,children,right}) => <div className="fldg"><div className="lb">{label}<span className="rule"></span>{right}</div>{children}</div>;
const Stat = ({n,l,s,tone,onClick}) => React.createElement(onClick?"button":"div",
  {className:"stat"+(tone?" "+tone:""),onClick},
  <div className="n">{n}</div>,<div className="l">{l}</div>,s?<div className="s">{s}</div>:null);
function RoleCard({label,person}){
  if(!person) return <div className="role empty"><div className="rl">{label}</div>
    <div style={{color:"#8A929E",fontSize:13,fontStyle:"italic"}}>Not assigned</div>
    <div style={{fontSize:11.5,color:"#9AA2AE",marginTop:4}}>No owner recorded at this level</div></div>;
  return <div className="role"><div className="rl">{label}</div>
    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
      <Avatar person={person} size={38}/>
      <div style={{minWidth:0}}>
        <div className="rn">{person.n}</div>
        <div style={{fontSize:12.5,color:"#5b6373",lineHeight:1.35,marginTop:2}}>{person.t}</div>
        <div style={{fontSize:12,color:"#707780",marginTop:4}}>{person.u}</div>
        <a href={"mailto:"+person.e} style={{fontSize:12,display:"inline-block",marginTop:5,wordBreak:"break-all"}}>{person.e}</a>
      </div>
    </div></div>;
}
const Empty = ({title,sub}) => <div className="empty"><h3>{title}</h3><p style={{color:"#707780"}}>{sub}</p></div>;

Object.assign(window,{Icon,Avatar,Risk,Header,Modal,PageHead,Field,Stat,RoleCard,Empty,Dropdown,
  initials,fmtDate,dayDiff,dueState,fiscalQ,RISK_COLOR,useMedia,BROWSE,ADMIN_NAV});
