const {useState,useEffect} = React;

function App(){
  const [screen,setScreen]=useState("Home");
  const [role,setRole]=useState("Administrator");
  const [fns,setFns]=useState(window.FUNCTIONS);
  const [gaps,setGaps]=useState(window.GAPS);
  const [flags,setFlags]=useState(window.FLAGS);
  const [deadlines,setDeadlines]=useState(window.DEADLINES);
  const [sel,setSel]=useState(null);
  const [topicNav,setTopicNav]=useState({});
  const [filter,setFilter]=useState({q:"",topic:"All",risk:"All"});
  const [toast,setToast]=useState(null);
  const [hist,setHist]=useState([]);

  const openGaps = gaps.filter(g=>g.status==="Open").length;
  const admin = role==="Administrator";
  const me = role==="Administrator" ? window.PEOPLE.find(p=>p.n==="Camila Ruiz")
    : role==="Executive" ? window.PEOPLE.find(p=>p.n==="Brett Padgett")
    : window.PEOPLE.find(p=>p.n==="Marta Hollis");

  const push = () => setHist(h=>[...h.slice(-24),{screen,sel,topicNav}]);
  const go = s => { push(); setSel(null); setScreen(s); if(s==="Topics") setTopicNav({}); window.scrollTo(0,0); };
  const back = () => { const p=hist[hist.length-1]; if(!p) return;
    setHist(hist.slice(0,-1)); setScreen(p.screen); setSel(p.sel); setTopicNav(p.topicNav||{}); window.scrollTo(0,0); };
  const flash = m => { setToast(m); setTimeout(()=>setToast(null),2600); };

  const saveFn = d => {
    setFns(fns.map(f=>f.id===d.id?d:f));
    setDeadlines(deadlines.map(x=>x.functionId===d.id?{...x,owner:d.owner,risk:d.risk}:x));
    setSel(d);
    flash("Saved. Owner fields on "+deadlines.filter(x=>x.functionId===d.id).length+" deadline record(s) updated.");
  };
  const addFlag = (id,reason) => { setFlags([{functionId:id,reason,by:me.n,at:window.TODAY},...flags.filter(f=>f.functionId!==id)]); flash("Flagged for review. The compliance office has been notified."); };
  const clearFlag = id => { setFlags(flags.filter(f=>f.functionId!==id)); flash("Flag cleared."); };
  const logGap = (id,form) => {
    const f = fns.find(x=>x.id===id);
    setGaps([{id:"GAP-"+(300+gaps.length),functionId:id,functionName:f.name,topic:f.topic,title:form.title,
      severity:form.severity,opened:window.TODAY,status:"Open",note:form.note,closeNote:"",owner:f.owner,closed:null},...gaps]);
    flash("Gap opened on "+f.name+".");
  };
  const closeGap = (id,note) => { setGaps(gaps.map(g=>g.id===id?{...g,status:"Closed",closeNote:note,closed:window.TODAY}:g)); flash("Gap closed. Open gap count updated."); };

  const openFn = f => { push(); setSel(f); window.scrollTo(0,0); };
  const shared = {fns,gaps,flags,deadlines,openFn,go,role,me};
  const selIdx = sel ? fns.findIndex(f=>f.id===sel.id) : -1;
  const adminOnly = ["Gap Tracker","Risk Dashboard","Reporting"];
  const s = adminOnly.includes(screen)&&!admin ? "NoAccess" : screen;

  return <>
    <window.Header screen={screen} go={go} role={role} setRole={setRole} openGaps={openGaps}/>
    {!!hist.length && <div className="backbar"><div className="wrap">
      <button onClick={back}><window.Icon n="arrow-right" s={14} style={{transform:"rotate(180deg)"}}/>Back</button>
      <span className="sub">{sel ? sel.name : screen}</span>
    </div></div>}
    {sel ? <window.FunctionDetailScreen f={sel} role={role} people={window.PEOPLE}
      deadlines={deadlines} gaps={gaps} flags={flags} go={g=>{setSel(null);go(g);}}
      onBack={()=>{setSel(null);go("Functions");}}
      prev={selIdx>0?fns[selIdx-1]:null} next={selIdx>=0&&selIdx<fns.length-1?fns[selIdx+1]:null}
      onJump={openFn} onSave={saveFn} onFlag={addFlag} onUnflag={clearFlag} onLogGap={logGap}/> : <>
    {s==="Home" && <window.Home {...shared} filter={filter} setFilter={setFilter}/>}
    {s==="Functions" && <window.FunctionsScreen {...shared} filter={filter} setFilter={setFilter}/>}
    {s==="Topics" && <window.Topics {...shared} nav={topicNav} setNav={setTopicNav}/>}
    {s==="Areas" && <window.Areas {...shared}/>}
    {s==="Deadlines" && <window.Deadlines {...shared}/>}
    {s==="Directory" && <window.Directory {...shared} people={window.PEOPLE}/>}
    {s==="Executive Team" && <window.ExecutiveTeam {...shared}/>}
    {s==="Gap Tracker" && <window.GapTracker {...shared} onCloseGap={closeGap} onUnflag={clearFlag}/>}
    {s==="Risk Dashboard" && <window.RiskDashboard {...shared}/>}
    {s==="Reporting" && <window.Reporting {...shared}/>}
    {s==="NoAccess" && <window.NoAccess go={go}/>}
    </>}
    {toast && <div style={{position:"fixed",left:"50%",bottom:24,transform:"translateX(-50%)",background:"#000E54",color:"#fff",
      padding:"12px 18px",borderRadius:5,boxShadow:"0 12px 34px rgba(0,14,84,.35)",fontSize:13.5,fontWeight:600,zIndex:200,
      maxWidth:"min(560px,92vw)",borderLeft:"4px solid #F76900",lineHeight:1.4}}>{toast}</div>}
    <footer className="ftr">
      <div className="wrap cols">
        <div style={{minWidth:230,flex:"1 1 260px"}}>
          <img src={(window.__resources&&window.__resources.wordmark)||"https://assets.cdn.syr.edu/logos/SYRACUSE_Horizontal_1Line_KNOCKOUT.svg"} alt="Syracuse University"/>
          <div className="fh" style={{marginTop:16}}>Compliance and Enterprise Risk Management</div>
        </div>
        <div><div className="fh">Browse</div>
          {["Functions","Topics","Deadlines","Directory"].map(x=><a key={x} href="#" onClick={e=>{e.preventDefault();go(x);}}>{x}</a>)}</div>
        <div><div className="fh">Resources</div>
          <a href="https://policies.syr.edu" target="_blank" rel="noopener">University Policies</a>
          <a href="https://compliance.syr.edu" target="_blank" rel="noopener">Report a Concern</a>
          <a href="https://app.powerbi.com" target="_blank" rel="noopener">Power BI Reports</a></div>
        <div style={{marginLeft:"auto",fontSize:12,color:"#7286B4",maxWidth:"26ch"}}>Prototype with sample data. Production data is stored in Dataverse.</div>
      </div>
    </footer>
  </>;
}
ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
