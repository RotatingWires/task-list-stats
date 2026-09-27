(() => {
'use strict';

const style=document.createElement('style');
style.textContent=`
  :root,body{background:var(--face)!important}
  body{background:var(--face)!important}
  .window{width:100%;max-width:none}

  .tabs{padding-bottom:5px}
  .tabs button,.subtabs button{padding-bottom:10px!important}
  .tabs button[aria-selected="true"],.subtabs button[aria-selected="true"]{padding-bottom:10px!important}

  #helpMenu{width:max-content;min-width:0;max-width:calc(100vw - 20px)}
  #helpMenu button{grid-template-columns:18px max-content;width:auto;min-width:0}
  #helpMenu .menu-label{overflow:visible;text-overflow:clip;white-space:nowrap}

  .tap-help-tooltip,.chart-tap-tooltip{
    position:fixed;
    z-index:1000;
    max-width:min(360px,calc(100vw - 20px));
    padding:7px 9px;
    border-top:2px solid #fff;
    border-left:2px solid #fff;
    border-right:2px solid #404040;
    border-bottom:2px solid #404040;
    box-shadow:1px 1px 0 #000;
    font:13px Tahoma,"MS Sans Serif",Arial,sans-serif;
    line-height:1.4;
    white-space:pre-line;
    pointer-events:none;
  }
  .tap-help-tooltip{background:#ffffe1;color:#000}
  .chart-tap-tooltip{background:#111;color:#fff;border-top-color:#555;border-left-color:#555;border-right-color:#000;border-bottom-color:#000}
  .has-tooltip{touch-action:manipulation}

  #hourChart{min-width:1900px!important}

  .fun-v09-summary{font-weight:700;font-size:15px;margin:4px 2px 8px}
  .fun-v09-sub{font-size:13px;line-height:1.4;margin:0 2px 9px;color:#333}

  @media(max-width:780px){
    body{background:var(--face)!important}
    .window{width:100%;max-width:none}
  }
`;
document.head.append(style);

const helpTip=document.createElement('div');
helpTip.className='tap-help-tooltip';
helpTip.hidden=true;
document.body.append(helpTip);

function positionPopup(popup,x,y){
  popup.hidden=false;
  const margin=10;
  const width=popup.offsetWidth||260;
  const height=popup.offsetHeight||60;
  const left=Math.max(margin,Math.min(window.innerWidth-width-margin,x-width/2));
  let top=y+12;
  if(top+height+margin>window.innerHeight)top=Math.max(margin,y-height-12);
  popup.style.left=`${left}px`;
  popup.style.top=`${top}px`;
}
function showHelpFor(el){
  const text=el.getAttribute('title');
  if(!text)return;
  helpTip.textContent=text;
  const rect=el.getBoundingClientRect();
  positionPopup(helpTip,rect.left+rect.width/2,rect.bottom);
}
function hideHelp(){helpTip.hidden=true;}

document.addEventListener('click',event=>{
  const target=event.target.closest?.('.has-tooltip[title],.word-chip[title]');
  if(target){showHelpFor(target);return;}
  hideHelp();
},true);
document.addEventListener('keydown',event=>{
  if((event.key==='Enter'||event.key===' ')&&event.target.matches?.('.has-tooltip[title],.word-chip[title]')){
    event.preventDefault();showHelpFor(event.target);
  }else if(event.key==='Escape')hideHelp();
});
$('#workspace')?.addEventListener('scroll',hideHelp,{passive:true});

const chartTip=document.createElement('div');
chartTip.className='chart-tap-tooltip';
chartTip.hidden=true;
document.body.append(chartTip);
function hideChartTip(){chartTip.hidden=true;}
function chartIndex(config,x){
  const count=config.labels.length;
  if(count<=1)return 0;
  return Math.max(0,Math.min(count-1,Math.round(((x-config.left)/config.plotW)*(count-1))));
}
function showChartTip(canvas,event){
  const config=canvas._tooltipConfig;
  if(!config||!config.labels?.length)return;
  const rect=canvas.getBoundingClientRect();
  const x=event.clientX-rect.left;
  if(x<config.left-10||x>config.left+config.plotW+10){hideChartTip();return;}
  const idx=chartIndex(config,x);
  chartTip.textContent=[String(config.labels[idx]),...config.series.map(series=>`${series.name}: ${numberFmt.format(series.values[idx]??0)}`)].join('\n');
  positionPopup(chartTip,event.clientX,event.clientY);
}
function installChartTap(canvas){
  if(!canvas||canvas._v09ChartTap)return;
  canvas._v09ChartTap=true;
  canvas.addEventListener('pointermove',event=>{if(event.pointerType!=='touch')showChartTip(canvas,event);});
  canvas.addEventListener('pointerleave',event=>{if(event.pointerType!=='touch')hideChartTip();});
  canvas.addEventListener('click',event=>showChartTip(canvas,event));
}
window.ensureChartTooltip=function(canvas){installChartTap(canvas);return chartTip;};

drawBarChart=function(canvas,labels,values,color='#000080',decimal=false,yLabel='Tasks'){
  if(!canvas||canvas.closest('[hidden]'))return;
  const {ctx,width,height}=prepareCanvas(canvas);
  if(!values.length){ctx.fillStyle='#333';ctx.textAlign='center';ctx.fillText('No data',width/2,height/2);return;}
  const rawMax=Math.max(...values,decimal?0.1:1);
  const a=axes(ctx,width,height,rawMax*1.14,yLabel,78,54,32,44,decimal);
  const n=values.length,slot=a.plotW/n,barW=Math.max(4,slot*.70);
  values.forEach((value,i)=>{
    const h=a.plotH*(value/a.max),x=a.left+i*slot+(slot-barW)/2,y=height-a.bottom-h;
    ctx.fillStyle=color;ctx.fillRect(x,y,barW,h);
    drawBarValue(ctx,decimal?oneDecimal.format(value):numberFmt.format(value),x+barW/2,y);
  });
  const step=Math.max(1,Math.ceil(n/12));
  ctx.fillStyle='#222';ctx.textAlign='center';ctx.textBaseline='middle';
  labels.forEach((label,i)=>{if(i%step===0||i===n-1)ctx.fillText(String(label),a.left+(i+.5)*slot,height-19);});
};

drawGroupedBarChart=function(canvas,labels,aValues,bValues,aColor,bColor,yLabel='Tasks'){
  if(!canvas||canvas.closest('[hidden]'))return;
  const {ctx,width,height}=prepareCanvas(canvas);
  const rawMax=Math.max(1,...aValues,...bValues);
  const a=axes(ctx,width,height,rawMax*1.16,yLabel);
  const n=labels.length,slot=a.plotW/n;
  const hourChart=canvas.id==='hourChart';
  const bw=Math.max(4,slot*(hourChart ? .38 : .34));
  for(let i=0;i<n;i++){
    const h1=a.plotH*aValues[i]/a.max,h2=a.plotH*bValues[i]/a.max,center=a.left+(i+.5)*slot;
    const y1=height-a.bottom-h1,y2=height-a.bottom-h2;
    ctx.fillStyle=aColor;ctx.fillRect(center-bw,y1,bw,h1);
    ctx.fillStyle=bColor;ctx.fillRect(center,y2,bw,h2);
    const labelsClose=aValues[i]&&bValues[i]&&Math.abs(y1-y2)<16;
    if(aValues[i])drawBarValue(ctx,numberFmt.format(aValues[i]),center-bw/2,y1);
    if(bValues[i])drawBarValue(ctx,numberFmt.format(bValues[i]),center+bw/2,labelsClose?y2-15:y2);
  }
  const step=n>=24?2:Math.max(1,Math.ceil(n/12));
  ctx.fillStyle='#222';ctx.textAlign='center';ctx.textBaseline='middle';
  labels.forEach((label,i)=>{if(i%step===0||i===n-1)ctx.fillText(String(label),a.left+(i+.5)*slot,height-19);});
};

function v09TaskLink(item,label=`#${item.displayId}`){
  const a=document.createElement('a');
  a.className='task-id-link';
  a.href=`http://tasklist.lehighradio.com:8711/task/${encodeURIComponent(item.universalId)}`;
  a.target='_blank';a.rel='noopener';a.textContent=label;
  return a;
}
function v09Table(headers,rows){
  const wrap=document.createElement('div');wrap.className='table-wrap';
  const table=document.createElement('table'),thead=document.createElement('thead'),trh=document.createElement('tr');
  for(const header of headers){const th=document.createElement('th');th.textContent=header;trh.append(th);}thead.append(trh);
  const tbody=document.createElement('tbody');
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=headers.length;td.textContent='No data.';tr.append(td);tbody.append(tr);}
  else for(const row of rows){const tr=document.createElement('tr');for(const value of row){const td=document.createElement('td');if(value instanceof Node)td.append(value);else td.textContent=value==null?'—':String(value);tr.append(td);}tbody.append(tr);}
  table.append(thead,tbody);wrap.append(table);return wrap;
}
function addFunPanel(key,label,note){
  if(document.querySelector(`[data-fun-tab="${key}"]`))return;
  const tabs=document.querySelector('.subtabs'),funRoot=tabs?.parentElement;if(!tabs||!funRoot)return;
  const button=document.createElement('button');button.type='button';button.setAttribute('role','tab');button.setAttribute('aria-selected','false');button.dataset.funTab=key;button.textContent=label;button.addEventListener('click',()=>switchFunTab(key));tabs.append(button);
  const panel=document.createElement('section');panel.className='fun-panel';panel.dataset.funPanel=key;panel.hidden=true;
  const fieldset=document.createElement('fieldset');fieldset.className='groupbox';const legend=document.createElement('legend');legend.textContent=label;const description=document.createElement('div');description.className='note';description.textContent=note;const result=document.createElement('div');result.className='fun-content';result.id=`${key}Result`;fieldset.append(legend,description,result);panel.append(fieldset);funRoot.append(panel);
}
addFunPanel('nightowl','Night Owl','Recent task creation/completion activity during night-owl hours, from 9 PM through 4:59 AM.');
addFunPanel('earlybird','Early Bird','Recent task creation/completion activity during early-morning hours, from 5 AM through 8:59 AM.');
addFunPanel('samedayspeed','Same-Day Speedrun','The fastest tasks that were created and completed on the same local calendar day.');
addFunPanel('cleanupday','Cleanup Day','The historical day with the largest completed-minus-created count, using stored creation and completion timestamps.');
function v09Events(items){
  const events=[];
  for(const item of items)for(const [event,date] of [['Created',item.createdDate],['Completed',item.completedDate]])if(date)events.push({item,event,date,hour:date.getHours()});
  return events;
}
function renderNightOwl(){
  const result=$('#nightowlResult');if(!result)return;
  const all=v09Events(scopedItems()).filter(x=>x.hour>=21||x.hour<5).sort((a,b)=>b.date-a.date);const events=all.slice(0,20);
  const summary=document.createElement('div');summary.className='fun-v09-summary';summary.textContent=`${numberFmt.format(all.length)} night-owl events • showing ${numberFmt.format(events.length)} most recent`;
  result.replaceChildren(summary,v09Table(['Event','When','List','ID','Task'],events.map(x=>[x.event,formatDateTime(x.date),listName(x.item.listId),v09TaskLink(x.item),x.item.title])));
}
function renderEarlyBird(){
  const result=$('#earlybirdResult');if(!result)return;
  const all=v09Events(scopedItems()).filter(x=>x.hour>=5&&x.hour<9).sort((a,b)=>b.date-a.date);const events=all.slice(0,20);
  const summary=document.createElement('div');summary.className='fun-v09-summary';summary.textContent=`${numberFmt.format(all.length)} early-bird events • showing ${numberFmt.format(events.length)} most recent`;
  result.replaceChildren(summary,v09Table(['Event','When','List','ID','Task'],events.map(x=>[x.event,formatDateTime(x.date),listName(x.item.listId),v09TaskLink(x.item),x.item.title])));
}
function renderSameDaySpeedrun(){
  const result=$('#samedayspeedResult');if(!result)return;
  const rows=scopedItems().map(item=>[item,durationMs(item)]).filter(([item,ms])=>ms!=null&&item.createdDate&&item.completedDate&&localDayKey(item.createdDate)===localDayKey(item.completedDate)).sort((a,b)=>a[1]-b[1]).slice(0,20);
  const summary=document.createElement('div');summary.className='fun-v09-summary';summary.textContent=rows.length?`Fastest same-day finish: ${formatDuration(rows[0][1])}`:'No same-day completed tasks with both timestamps.';
  result.replaceChildren(summary,v09Table(['Elapsed','Date','List','ID','Task'],rows.map(([item,ms])=>[formatDuration(ms),formatDate(item.completedDate),listName(item.listId),v09TaskLink(item),item.title])));
}
function renderCleanupDay(){
  const result=$('#cleanupdayResult');if(!result)return;
  const items=scopedItems(),days=new Map();
  function row(day){if(!days.has(day))days.set(day,{created:0,completed:0});return days.get(day);}
  for(const item of items){if(item.createdDate)row(localDayKey(item.createdDate)).created++;if(item.completedDate)row(localDayKey(item.completedDate)).completed++;}
  const ranked=[...days.entries()].map(([day,v])=>({day,...v,net:v.completed-v.created})).sort((a,b)=>b.net-a.net||b.completed-a.completed||b.day.localeCompare(a.day));
  const best=ranked[0];
  if(!best){const empty=document.createElement('div');empty.className='fun-empty';empty.textContent='No dated activity.';result.replaceChildren(empty);return;}
  const heading=document.createElement('div');heading.className='fun-v09-summary';heading.textContent=`${formatDate(new Date(`${best.day}T12:00:00`))} — net cleanup ${best.net>=0?'+':''}${best.net}`;
  const sub=document.createElement('div');sub.className='fun-v09-sub';sub.textContent=`${numberFmt.format(best.completed)} completed • ${numberFmt.format(best.created)} created`;
  const completed=items.filter(item=>localDayKey(item.completedDate)===best.day).sort((a,b)=>a.completedDate-b.completedDate);
  result.replaceChildren(heading,sub,v09Table(['Completed','List','ID','Task'],completed.map(item=>[formatDateTime(item.completedDate),listName(item.listId),v09TaskLink(item),item.title])));
}
function renderV09(){
  if(!state.snapshot)return;
  renderNightOwl();renderEarlyBird();renderSameDaySpeedrun();renderCleanupDay();
}
const previousRenderAll=renderAll;
renderAll=function(){previousRenderAll();renderV09();};

loadSnapshot();
})();
