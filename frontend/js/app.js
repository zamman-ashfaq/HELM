app.js
// HELM frontend. Scoring mirrors backend/score.py so it works fully offline (no server needed).
const C={NOM:70,CAU:40,OK:100,WARN:55,CRIT:20,DRIFT:20,CAP:60,MAXD:1200,LIGHT:299792.458};
const SYSTEMS={
 structure:{label:'Structure',body:'Bones and muscle',keys:['exercise_min'],why:'Without gravity, bones break down and become more brittle. Exercise counteracts losses in bone density, muscle strength and heart performance.',src:'NASA HRP: Spaceflight-Induced Bone Changes; Reduced Cardiorespiratory and Musculoskeletal Fitness'},
 life_support:{label:'Life support',body:'Heart and circulation',keys:['heart_rate','blood_pressure_sys','blood_pressure_dia','co2_mmhg','o2_partial_pressure_mmhg'],why:'Weightlessness alters blood circulation and how the heart and blood vessels work. Low oxygen and high carbon dioxide are also flagged risks.',src:'NASA HRP: Cardiovascular Adaptations; Hypoxia'},
 shielding:{label:'Shielding',body:'Immune system and radiation',keys:['radiation_total_msv','radiation_event_msv','temperature'],why:'Spaceflight stress can awaken dormant viruses and change microbiomes. Radiation adds up over the whole mission, and neutrons are about 30% of radiation on the ISS.',src:'NASA HRP: Altered Immune System Responses; Host-Microorganism Interactions; CSA: Monitoring Radiation for Astronaut Health'},
 power:{label:'Power',body:'Metabolism and nutrition',keys:['blood_sugar'],why:'A healthy, balanced diet is essential to crew health and performance on long missions.',src:'NASA HRP: Inadequate Food and Nutrition'},
 flight_computer:{label:'Flight computer',body:'Sleep, stress and mood',keys:['sleep_hours','stress_score'],why:'Isolation, confinement and disrupted light cycles affect sleep and behavioral health. NASA tracks sleep and activity with wearables on Artemis II.',src:'NASA HRP: Sensorimotor and Vestibular Function; ARCHeR study; CSA: Preparing for deep-space destinations'}};
const CUM=['radiation_total_msv','radiation_event_msv'];
const MODES={iss:{label:'ISS',km:400},moon:{label:'Moon',km:384400},mars:{label:'Mars',km:225e6}};
const SYM={NOMINAL:'\u2713',CAUTION:'\u25B2',WARNING:'\u25A0','NO DATA':'\u2013'};
const $=s=>document.querySelector(s);
let T,R,B={},i=0,mode='mars',open=null;
const st=s=>s==null?'NO DATA':s>=C.NOM?'NOMINAL':s>=C.CAU?'CAUTION':'WARNING';
const cls=s=>'s-'+s.replace(' ','');
const num=(v,d=1)=>Math.abs(v)>=100?Math.round(v):+v.toFixed(d);
const fmtDelay=s=>s<1?'under 1 s':s<60?s.toFixed(1)+' s':Math.round(s/60)+' min';

function indScore(v,t){const h=x=>x!=null;
 if(h(t.critical_high)&&v>=t.critical_high||h(t.critical_low)&&v<=t.critical_low)return C.CRIT;
 if(h(t.warning_high)&&v>=t.warning_high||h(t.warning_low)&&v<=t.warning_low)return C.WARN;
 return C.OK}
function compute(r,km){const ind={};
 for(const k in T){const v=r[k];if(v==null)continue;let s=indScore(v,T[k]);const b=B[k];
  const d=b?(v-b)/b*100:null;if(d!=null&&Math.abs(d)>=C.DRIFT)s=Math.min(s,60);ind[k]={v,s,d,b}}
 const sys={};for(const id in SYSTEMS){const a=SYSTEMS[id].keys.filter(k=>ind[k]).map(k=>ind[k].s);sys[id]=a.length?Math.min(...a):null}
 const sc=Object.values(sys).filter(x=>x!=null),worst=sc.length?Math.min(...sc):100;
 let w=sc.length?Math.round(sc.reduce((a,b)=>a+b)/sc.length):100;if(worst<C.CAU)w=Math.min(w,C.CAP);
 const delay=km/C.LIGHT,auto=Math.round(100*(.4*Math.min(1,delay/C.MAXD)+.6*(100-worst)/100));
 return{ind,sys,w,worst,auto,delay}}

function spark(a,w=120,h=28){const v=a.filter(x=>x!=null);if(v.length<2)return'';
 const lo=Math.min(...v),hi=Math.max(...v),sp=hi-lo||1;
 const p=a.map((x,j)=>x==null?null:[j/(a.length-1)*w,h-2-(x-lo)/sp*(h-4)]).filter(Boolean).map(q=>q.map(n=>n.toFixed(1)).join(',')).join(' ');
 return`<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${p}" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`}

function advice(c){const s=st(c.worst),m=Math.max(1,Math.round(c.delay/60));
 const A={
  iss:{WARNING:'Contact the flight surgeon now. Pause strenuous work and recheck the flagged readings.',CAUTION:'Recheck the flagged readings and log them for your next ground call.',NOMINAL:'All systems nominal. Keep up your daily routine.'},
  moon:{WARNING:'Call Earth now. The signal takes about 1.3 seconds, so a live conversation is possible. Follow your mission medical protocol.',CAUTION:'Follow the self-care steps for the flagged systems and mention them on your next call.',NOMINAL:'All systems nominal. Keep up your daily routine.'},
  mars:{WARNING:`Start your mission medical protocol first. A report is queued for Earth: it arrives in about ${m} min and a reply takes about ${2*m} min.`,CAUTION:'Follow the self-care steps for the flagged systems and add them to your next report to Earth.',NOMINAL:'All systems nominal. Keep up your daily routine.'}};
 return[s,A[mode][s]||A[mode].NOMINAL]}

function render(){
 const r=R[i],m=MODES[mode],c=compute(r,m.km),ws=st(c.worst),[as,at]=advice(c);
 $('#modes').innerHTML=Object.keys(MODES).map(k=>`<button class="${k===mode?'on':''}" data-m="${k}" aria-pressed="${k===mode}">${MODES[k].label}</button>`).join('');
 $('#meta').innerHTML=`<span>Day ${r.day} of ${R[R.length-1].day}</span><span>Signal to Earth: ${fmtDelay(c.delay)} one way</span>`;
 const circ=2*Math.PI*52;
 const label=c.auto<35?'Self-manageable':c.auto<=65?'Monitor and report':'Act now, inform Earth';
 const cards=Object.keys(SYSTEMS).map(id=>{const s=c.sys[id],t=st(s),hist=R.slice(0,i+1).map(x=>compute(x,m.km).sys[id]);
  return`<button class="card ${cls(t)} ${open===id?'open':''}" data-s="${id}" aria-expanded="${open===id}"><span>${SYSTEMS[id].label}</span><small>${SYSTEMS[id].body}</small><span class="sc">${s==null?'--':s}</span><span class="badge">${SYM[t]} ${t}</span>${spark(hist)}</button>`}).join('');
 let detail='';
 if(open){const S=SYSTEMS[open];const rows=S.keys.filter(k=>c.ind[k]).map(k=>{const x=c.ind[k],t=st(x.s),vals=R.slice(0,i+1).map(q=>q[k]);
  const drift=CUM.includes(k)?'adds up over the mission':x.d==null?'no baseline':`${x.d>0?'+':''}${num(x.d)}% from your baseline`;
  return`<div class="row ${cls(t)}"><span>${T[k].label}</span><span>${num(x.v)} ${T[k].unit||''}</span><span>${drift}</span><span class="badge">${SYM[t]} ${t}</span>${spark(vals,110,24)}</div>`}).join('');
  detail=`<section class="detail"><h2>${S.label}: ${S.body}</h2><p class="why">${S.why}</p>${rows||'<p class="note">No readings for this system yet. Add a check-in below.</p>'}<p class="note">Source: ${S.src}. Follow your mission medical protocol for treatment.</p></section>`}
 const keys=[...new Set(Object.values(SYSTEMS).flatMap(s=>s.keys))].filter(k=>T[k]);
 const form=keys.map(k=>`<label>${T[k].label}${T[k].unit?' ('+T[k].unit+')':''}<input type="number" step="any" name="${k}"></label>`).join('');
 $('#app').innerHTML=`
 <section class="hero ${cls(ws)}"><svg class="ring" viewBox="0 0 120 120" role="img" aria-label="Wellness score ${c.w} out of 100"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" stroke-dasharray="${(c.w/100*circ).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 60 60)"/><text x="60" y="62" class="num">${c.w}</text><text x="60" y="78" class="lab">wellness score</text></svg>
 <div><div class="banner ${cls(as)}"><b>${SYM[as]} ${as}</b>${at}</div>
 <div class="auto"><h3>Can you handle this alone? Autonomy meter</h3><div class="bar"><i style="left:calc(${c.auto}% - 3px)"></i></div><p><b>${label}</b> (${c.auto}/100). The meter rises as signal delay and health problems grow.</p></div></div></section>
 <div class="day"><button data-d="-1" aria-label="Previous day">Previous</button><input type="range" id="day" min="0" max="${R.length-1}" value="${i}" aria-label="Mission day"><button data-d="1" aria-label="Next day">Next</button><button data-d="demo">Jump to latest day</button></div>
 <div class="grid">${cards}</div>${detail}
 <details class="checkin"><summary>Add today's check-in</summary><form id="ci">${form}<button class="go" type="submit">Save check-in</button></form></details>`;
}

document.addEventListener('click',e=>{
 const m=e.target.closest('[data-m]'),s=e.target.closest('[data-s]'),d=e.target.closest('[data-d]');
 if(m){mode=m.dataset.m;render()}
 else if(s){open=open===s.dataset.s?null:s.dataset.s;render()}
 else if(d){const v=d.dataset.d;i=v==='demo'?R.length-1:Math.max(0,Math.min(R.length-1,i+ +v));render()}});
document.addEventListener('input',e=>{if(e.target.id==='day'){i=+e.target.value;render();$('#day').focus()}});
document.addEventListener('submit',e=>{if(e.target.id!=='ci')return;e.preventDefault();
 const r={day:R[R.length-1].day+1};new FormData(e.target).forEach((v,k)=>{if(v!=='')r[k]=+v});
 R.push(r);i=R.length-1;render()});

Promise.all([fetch('../data/medical_thresholds.json'),fetch('../data/demo_readings.json')])
 .then(rs=>Promise.all(rs.map(r=>{if(!r.ok)throw new Error(r.url);return r.json()})))
 .then(([t,d])=>{T=t.indicators;R=d.readings;
  const first=R.slice(0,3);for(const k in T){if(CUM.includes(k))continue;
   const v=first.map(r=>r[k]).filter(x=>x!=null);if(v.length&&v.reduce((a,b)=>a+b)!==0)B[k]=v.reduce((a,b)=>a+b)/v.length}
  i=R.length-1;render()})
 .catch(err=>{$('#app').innerHTML=`<p class="err">Could not load data (${err.message}). Open this page through a local server: run <code>python -m http.server 8000</code> in the repo root, then visit http://localhost:8000/frontend/</p>`});