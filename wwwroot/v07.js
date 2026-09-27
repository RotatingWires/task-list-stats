(() => {
'use strict';

const style=document.createElement('style');
style.textContent=`
  .fun-panel .note{font-size:13px;line-height:1.45}
  .fun-record-cards .stat-card{min-height:94px;padding:10px}
  .fun-record-cards .stat-card .value{font-size:22px;line-height:1.15}
  .fun-record-cards .stat-card .sub{font-size:12px;line-height:1.35}
  #dejavuResult table{font-size:14px}
  #dejavuResult th,#dejavuResult td{padding:7px 8px}
  .fun-result-box .table-wrap table tr:last-child td{border-bottom:1px solid #c8c8c8!important}
`;
document.head.append(style);

const TASK_LIST_ORIGIN='http://tasklist.lehighradio.com:8711';
function makeTaskLink(item,label=`#${item.displayId}`){
  const a=document.createElement('a');
  a.className='task-id-link';
  a.href=`${TASK_LIST_ORIGIN}/task/${encodeURIComponent(item.universalId)}`;
  a.target='_blank';
  a.rel='noopener';
  a.textContent=label;
  a.title=`Open ${listName(item.listId)} task #${item.displayId} in a new tab`;
  return a;
}

function pickRandom(values){return values.length?values[Math.floor(Math.random()*values.length)]:null;}
function maxEntryOf(map){return [...map.entries()].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))[0]||null;}
function incrementLocal(map,key){map.set(key,(map.get(key)||0)+1);}
function fullDate(d){return d?formatDate(d):'Unknown';}
function statusWithTimestampNote(item){
  if(item.status==='Done'&&!item.completedDate)return 'Done (completion date unknown)';
  if(item.status==='Cancelled'&&!item.cancelledDate)return 'Cancelled (cancellation date unknown)';
  return item.status;
}

function eventDaysV07(items){
  const days=new Set();
  for(const item of items){
    for(const d of [item.createdDate,item.completedDate,item.cancelledDate,item.reopenedDate])
      if(d)days.add(localDayKey(d));
  }
  return [...days];
}

function eventsOnV07(day){
  const rows=[];
  for(const item of scopedItems()){
    const events=[];
    if(localDayKey(item.createdDate)===day)events.push('Created');
    if(localDayKey(item.completedDate)===day)events.push('Completed');
    if(localDayKey(item.cancelledDate)===day)events.push('Cancelled');
    if(localDayKey(item.reopenedDate)===day)events.push('Reopened');
    if(events.length)rows.push([item,events.join(', ')]);
  }
  return rows;
}

function wrapperTableV07(headers,rows,numeric=[]){
  const wrap=document.createElement('div');
  wrap.className='table-wrap';
  const table=document.createElement('table');
  setTable(table,headers,rows,numeric);
  wrap.append(table);
  return wrap;
}

function renderTimeMachineV07(){
  const result=$('#timemachineResult');
  if(!result)return;
  const day=state.fun.timeMachine;
  if(!day){
    const emptyNode=document.createElement('div');
    emptyNode.className='fun-empty';
    emptyNode.textContent='Pick a historical date.';
    result.replaceChildren(emptyNode);
    return;
  }
  const heading=document.createElement('div');
  heading.className='fun-day-heading';
  heading.textContent=`You on ${formatDate(new Date(`${day}T12:00:00`))}`;
  const rows=eventsOnV07(day).map(([item,event])=>[
    listName(item.listId),makeTaskLink(item),item.title,event,statusWithTimestampNote(item)
  ]);
  result.replaceChildren(heading,wrapperTableV07(['List','ID','Task','Event on this date','Current status'],rows));
}

function renderRecordsV07(){
  const result=$('#recordsResult');
  if(!result)return;
  const items=scopedItems();
  const createdDay=new Map(),completedDay=new Map(),createdMonth=new Map(),completedMonth=new Map();
  for(const item of items){
    if(item.createdDate){incrementLocal(createdDay,localDayKey(item.createdDate));incrementLocal(createdMonth,monthKey(item.createdDate));}
    if(item.completedDate){incrementLocal(completedDay,localDayKey(item.completedDate));incrementLocal(completedMonth,monthKey(item.completedDate));}
  }
  const cd=maxEntryOf(createdDay),dd=maxEntryOf(completedDay),cm=maxEntryOf(createdMonth),dm=maxEntryOf(completedMonth);

  const roots=items.filter(x=>!x.parentDisplayId);
  const treeRecords=roots.map(root=>{
    const prefix=`${root.displayId}.`;
    const size=items.filter(x=>x.listId===root.listId&&(x.displayId===root.displayId||String(x.displayId).startsWith(prefix))).length;
    return [root,size];
  }).sort((a,b)=>b[1]-a[1]);
  const largestTree=treeRecords[0]||null;

  const childRecords=items.map(parent=>[
    parent,items.filter(x=>x.listId===parent.listId&&x.parentDisplayId===parent.displayId).length
  ]).sort((a,b)=>b[1]-a[1]);
  const mostChildren=childRecords.find(x=>x[1]>0)||null;

  const titleGroups=new Map();
  for(const item of items){
    const key=String(item.title||'').trim().replace(/\s+/g,' ').toLowerCase();
    if(!key)continue;
    if(!titleGroups.has(key))titleGroups.set(key,{title:item.title,count:0});
    titleGroups.get(key).count++;
  }
  const mostRepeated=[...titleGroups.values()].sort((a,b)=>b.count-a.count)[0]||null;

  const cards=document.createElement('div');
  cards.className='stat-grid compact fun-record-cards';
  renderCards(cards,[
    {label:'Most created in a day',value:cd?numberFmt.format(cd[1]):'—',sub:cd?formatDate(new Date(`${cd[0]}T12:00:00`)):''},
    {label:'Most completed in a day',value:dd?numberFmt.format(dd[1]):'—',sub:dd?formatDate(new Date(`${dd[0]}T12:00:00`)):''},
    {label:'Most created in a month',value:cm?numberFmt.format(cm[1]):'—',sub:cm?formatMonthKey(cm[0]):''},
    {label:'Most completed in a month',value:dm?numberFmt.format(dm[1]):'—',sub:dm?formatMonthKey(dm[0]):''},
    {label:'Largest task tree',value:largestTree?numberFmt.format(largestTree[1]):'—',sub:largestTree?`${listName(largestTree[0].listId)} — #${largestTree[0].displayId}`:''},
    {label:'Most reused exact title',value:mostRepeated?numberFmt.format(mostRepeated.count):'—',sub:mostRepeated?.title||''}
  ]);

  const durations=items.map(item=>[item,durationMs(item)]).filter(x=>x[1]!=null).sort((a,b)=>a[1]-b[1]);
  const fastest=durations[0]||null,slowest=durations.at(-1)||null;
  const deepest=[...items].sort((a,b)=>b.depth-a.depth)[0]||null;
  const oldestOpen=items.filter(x=>x.status==='Open'&&x.createdDate).sort((a,b)=>a.createdDate-b.createdDate)[0]||null;
  const rows=[];
  if(fastest)rows.push(['Fastest completion',makeTaskLink(fastest[0]),fastest[0].title,formatDuration(fastest[1])]);
  if(slowest)rows.push(['Slowest completion',makeTaskLink(slowest[0]),slowest[0].title,formatDuration(slowest[1])]);
  if(deepest)rows.push(['Deepest task',makeTaskLink(deepest),deepest.title,`Depth ${deepest.depth}`]);
  if(mostChildren)rows.push(['Most direct children',makeTaskLink(mostChildren[0]),mostChildren[0].title,numberFmt.format(mostChildren[1])]);
  if(oldestOpen)rows.push(['Oldest open task',makeTaskLink(oldestOpen),oldestOpen.title,formatDuration(new Date()-oldestOpen.createdDate)]);
  if(largestTree)rows.push(['Largest tree root',makeTaskLink(largestTree[0]),largestTree[0].title,`${numberFmt.format(largestTree[1])} items`]);
  result.replaceChildren(cards,wrapperTableV07(['Record','ID','Task','Value'],rows));
}

function renderOnThisDayV07(){
  const result=$('#todayResult');
  if(!result)return;
  const now=new Date(),rows=[];
  for(const item of scopedItems()){
    const events=[];
    for(const [label,d] of [['Created',item.createdDate],['Completed',item.completedDate],['Cancelled',item.cancelledDate],['Reopened',item.reopenedDate]]){
      if(d&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate())events.push(`${label} ${fullDate(d)}`);
    }
    if(events.length)rows.push([item,events]);
  }
  rows.sort((a,b)=>b[0].universalId-a[0].universalId);
  if(!rows.length){
    const emptyNode=document.createElement('div');emptyNode.className='fun-empty';emptyNode.textContent='Nothing on this date in stored history.';result.replaceChildren(emptyNode);return;
  }
  result.replaceChildren(wrapperTableV07(['List','ID','Task','History','Current status'],rows.map(([item,events])=>[
    listName(item.listId),makeTaskLink(item),item.title,events.join('; '),statusWithTimestampNote(item)
  ])));
}

function renderV07(){
  renderTimeMachineV07();
  renderRecordsV07();
  renderOnThisDayV07();
}

const tmNote=$('#timemachineNote');
if(tmNote)tmNote.textContent='Jump to a random historical date and show only the timestamps actually stored on that date. A task can currently be Done even when its completion date is different or unknown.';
const todayNote=$('#todayNote');
if(todayNote)todayNote.textContent='Task events on today’s month/day in any represented year, including the full stored month/day/year for each event.';
const recordsNote=$('#recordsNote');
if(recordsNote)recordsNote.textContent='High-water marks and task-specific records from the current list scope.';

const oldTimeMachineButton=$('#timemachineActions button');
if(oldTimeMachineButton){
  const button=oldTimeMachineButton.cloneNode(true);
  oldTimeMachineButton.replaceWith(button);
  button.addEventListener('click',()=>{
    state.fun.timeMachine=pickRandom(eventDaysV07(scopedItems()));
    renderTimeMachineV07();
    });
}

const renderAllV06=renderAll;
renderAll=function(){
  renderAllV06();
  renderV07();
};


})();
