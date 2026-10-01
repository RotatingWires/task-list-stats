function renderPatterns() {
  const items = scopedItems();
  const createWeek = Array(7).fill(0), doneWeek = Array(7).fill(0);
  const createHour = Array(24).fill(0), doneHour = Array(24).fill(0);
  for (const item of items) {
    if (item.createdDate) {
      createWeek[item.createdDate.getDay()]++;
      if (hasConfirmedClockTime(item.createdAt)) createHour[item.createdDate.getHours()]++;
    }
    if (item.completedDate) {
      doneWeek[item.completedDate.getDay()]++;
      if (hasConfirmedClockTime(item.completedAt)) doneHour[item.completedDate.getHours()]++;
    }
  }
  Charts.drawGroupedBarChart($('#weekdayChart'), WEEKDAYS, createWeek, doneWeek, '#000080', '#008000', 'Tasks');
  Charts.drawGroupedBarChart($('#hourChart'), Array.from({length:24},(_,h)=>formatHour(h)), createHour, doneHour, '#000080', '#008000', 'Tasks');
  renderWeekdayHourHeatmap(items);

  const bestCreationWeekCount = Math.max(...createWeek);
  const bestCreationWeek = bestCreationWeekCount > 0 ? createWeek.indexOf(bestCreationWeekCount) : null;
  const bestCreationHourCount = Math.max(...createHour);
  const bestCreationHour = bestCreationHourCount > 0 ? createHour.indexOf(bestCreationHourCount) : null;
  const bestCompletionWeekCount = Math.max(...doneWeek);
  const bestCompletionWeek = bestCompletionWeekCount > 0 ? doneWeek.indexOf(bestCompletionWeekCount) : null;
  const bestCompletionHourCount = Math.max(...doneHour);
  const bestCompletionHour = bestCompletionHourCount > 0 ? doneHour.indexOf(bestCompletionHourCount) : null;
  const activeWeeks = new Set(items.map(x=>x.createdDate && weekKey(x.createdDate)).filter(Boolean));
  const activeMonths = new Set(items.map(x=>x.createdDate && monthKey(x.createdDate)).filter(Boolean));
  const datedCount = items.filter(x=>x.createdDate).length;
  const streaks = longestCreationStreaks(items);
  renderMetricList($('#rhythmMetrics'), [
    ['Busiest creation weekday', bestCreationWeek == null ? '—' : `${WEEKDAYS[bestCreationWeek]} (${createWeek[bestCreationWeek]})`, 'The weekday with the highest total number of task creation timestamps in the selected scope.'],
    ['Busiest creation hour', bestCreationHour == null ? '—' : `${formatHour(bestCreationHour)} (${createHour[bestCreationHour]})`, "The hour of the day in which the most tasks with confirmed creation times were created, using your browser's local time. Date-only history is excluded."],
    ['Busiest completion weekday', bestCompletionWeek == null ? '—' : `${WEEKDAYS[bestCompletionWeek]} (${doneWeek[bestCompletionWeek]})`, 'The weekday with the highest total number of completion timestamps for tasks that are currently Done in the selected scope. This uses the same completion population as the Day-of-Week Patterns chart.'],
    ['Busiest completion hour', bestCompletionHour == null ? '—' : `${formatHour(bestCompletionHour)} (${doneHour[bestCompletionHour]})`, "The hour of the day with the most confirmed completion times for tasks that are currently Done in the selected scope, using your browser's local time. Date-only history is excluded. This uses the same completion population as the Hour-of-Day Patterns chart."],
    ['Average per active week', activeWeeks.size ? oneDecimal.format(datedCount / activeWeeks.size) : '—', 'Dated task creations divided by the number of calendar weeks that contain at least one creation. Weeks with no creations are not included.'],
    ['Average per active month', activeMonths.size ? oneDecimal.format(datedCount / activeMonths.size) : '—', 'Dated task creations divided by the number of months that contain at least one creation. Months with no creations are not included.'],
    ['Longest quiet streak', `${streaks.quiet} days`, 'The longest run of consecutive days with zero task creations between the first and latest dated task creation.'],
    ['Longest active streak', `${streaks.active} days`, 'The longest run of consecutive days where at least one task was created each day.']
  ]);
  renderExamMetrics(items);
}

function renderWeekdayHourHeatmap(items) {
  const mode = $('#hourHeatmapMode').value;
  const matrix = Array.from({length:7},()=>Array(24).fill(0));
  for (const item of items) {
    const d = mode === 'completed' ? item.completedDate : item.createdDate;
    const raw = mode === 'completed' ? item.completedAt : item.createdAt;
    if (d && hasConfirmedClockTime(raw)) matrix[d.getDay()][d.getHours()]++;
  }
  const max = Math.max(0, ...matrix.flat());
  const grid = document.createElement('div'); grid.className='wh-grid';
  const corner=document.createElement('div'); grid.append(corner);
  for(let h=0;h<24;h++){const el=document.createElement('div');el.className='wh-hour';el.textContent=h%3===0?formatHour(h):'';grid.append(el);}
  for(let d=0;d<7;d++){
    const l=document.createElement('div');l.className='wh-label';l.textContent=WEEKDAYS[d];grid.append(l);
    for(let h=0;h<24;h++){
      const value=matrix[d][h]; const c=document.createElement('div'); c.className=`wh-cell heat ${heatClass(value,max)}`;
      c.textContent=String(value); grid.append(c);
    }
  }
  $('#weekdayHourHeatmap').replaceChildren(grid);
}

function renderExamMetrics(items) {
  const examRe = /\b(exam|test|midterm|final)\b/i;
  const examItems = items.filter(x=>examRe.test(x.title) && x.createdDate);
  const allDated = items.filter(x=>x.createdDate);
  const dayCounts = new Map();
  for(const item of allDated) increment(dayCounts, localDayKey(item.createdDate));
  const baseline = dayCounts.size ? allDated.length / dayCounts.size : 0;
  const windowDays = new Set();
  for(const exam of examItems){
    for(let offset=-7;offset<=7;offset++){
      const d=new Date(exam.createdDate.getFullYear(),exam.createdDate.getMonth(),exam.createdDate.getDate()+offset);
      windowDays.add(localDayKey(d));
    }
  }
  let windowTasks=0;
  for(const key of windowDays) windowTasks += dayCounts.get(key)||0;
  const windowAvg = windowDays.size ? windowTasks/windowDays.size : 0;
  const ratio = baseline ? windowAvg / baseline : null;
  renderMetricList($('#examMetrics'), [
    ['Titles containing exam/test/midterm/final', numberFmt.format(examItems.length), 'Counts tasks in the selected list scope whose title contains exam, test, midterm, or final and whose creation date is known. This is used to identify likely exam/test dates from task titles; descriptions are not searched.'],
    ['Average creations/day near those tasks (±7 days)', oneDecimal.format(windowAvg), 'Builds a 15-day window around each matching exam/test task: 7 days before, the task creation day, and 7 days after. Overlapping dates are merged, then all task creations on those unique dates are divided by the number of dates. This estimates how busy task creation becomes around exam/test periods.'],
    ['Baseline creations/active day', oneDecimal.format(baseline), 'Task creations are divided by the number of calendar days that had at least one creation. Days with zero creations are excluded, so this represents a typical day when you were actively adding tasks.'],
    ['Exam-window activity vs baseline', ratio == null ? '—' : `${oneDecimal.format(ratio)}×`, 'Compares the exam/test-window creation average with the normal active-day baseline. 1.0× means the same activity, 1.5× means 50% more task creations, and 0.5× means half as many. This measures task-creation activity, not study time or exam performance.']
  ]);
}

function renderTrees() {
  const items = scopedItems();
  const roots = [];
  const rootStats = new Map();
  const directChildCounts = new Map();
  const existingItemKeys = new Set();
  let deepest = 0;
  let reopened = 0;

  const itemKey = (listId, displayId) => `${listId}\u0000${displayId}`;

  for (const item of items) {
    existingItemKeys.add(itemKey(item.listId, item.displayId));
    deepest = Math.max(deepest, item.depth);
    if (item.reopenedDate) reopened++;

    if (!item.parentDisplayId) {
      roots.push(item);
      rootStats.set(itemKey(item.listId, item.displayId), {
        root: item,
        size: 1,
        maxDepth: item.depth
      });
    } else {
      const parentKey = itemKey(item.listId, item.parentDisplayId);
      directChildCounts.set(parentKey, (directChildCounts.get(parentKey) || 0) + 1);
    }
  }

  for (const item of items) {
    if (!item.parentDisplayId) continue;
    const rootDisplayId = String(item.displayId).split('.')[0];
    const stats = rootStats.get(itemKey(item.listId, rootDisplayId));
    if (!stats) continue;
    stats.size++;
    stats.maxDepth = Math.max(stats.maxDepth, item.depth);
  }

  const rootTrees = roots.map(root => rootStats.get(itemKey(root.listId, root.displayId)));
  const directCounts = [...directChildCounts.entries()]
    .filter(([parentKey]) => existingItemKeys.has(parentKey))
    .map(([, count]) => count);

  renderCards($('#treeCards'), [
    { label:'Deepest nesting level', value:String(deepest) },
    { label:'Roots with subtasks', value:percent(rootTrees.filter(x=>x.size>1).length, roots.length) },
    { label:'Average subtasks per root', value:roots.length?oneDecimal.format((items.length-roots.length)/roots.length):'0' },
    { label:'Average direct children per parent', value:directCounts.length?oneDecimal.format(average(directCounts)):'0' },
    { label:'Tasks ever reopened (known)', value:numberFmt.format(reopened) },
    { label:'Highest Universal ID', value:numberFmt.format(state.snapshot.highestUniversalId), sub:'Lifetime counter across all lists' }
  ]);

  const depthCounts = new Map();
  for (const item of items) increment(depthCounts, item.depth);
  const depths = [...depthCounts.keys()].sort((a,b)=>a-b);
  Charts.drawBarChart($('#depthChart'), depths.map(d=>d===0?'Root':`Depth ${d}`), depths.map(d=>depthCounts.get(d)), '#000080', false, 'Tasks');

  const typeCounts = inferTaskTypes(items);
  Charts.drawBarChart($('#taskTypeChart'), typeCounts.map(x=>x[0]), typeCounts.map(x=>x[1]), '#000080', false, 'Tasks');

  const largest = [...rootTrees].sort((a,b)=>b.size-a.size).slice(0,12);
  setTable($('#largestTreesTable'), ['List','Root','Title','Tree size','Max depth'], largest.map(x=>[
    listName(x.root.listId), `#${x.root.displayId}`, x.root.title, numberFmt.format(x.size), x.maxDepth
  ]), [3,4]);

  const deepestTasks = [...items].sort((a,b)=>b.depth-a.depth || b.universalId-a.universalId).slice(0,15);
  setTable($('#deepestTasksTable'), ['List','ID','Depth','Task'], deepestTasks.map(x=>[
    listName(x.listId), `#${x.displayId}`, x.depth, x.title
  ]), [2]);

  renderCommonWords(items);
  const reopenedItems = items.filter(x=>x.reopenedDate).sort((a,b)=>b.reopenedDate-a.reopenedDate).slice(0,15);
  setTable($('#reopenedTable'), ['List','ID','Task','Reopened'], reopenedItems.map(x=>[
    listName(x.listId), `#${x.displayId}`, x.title, formatDateTime(x.reopenedDate)
  ]));
}

function inferTaskTypes(items) {
  const categories = [
    ['Quiz', /\bquiz(zes)?\b/i],
    ['Exam / test', /\b(exam|test|midterm|final)\b/i],
    ['Reading', /\b(read|reading|chapter|pages?)\b/i],
    ['Discussion', /\b(discussion|post|reply|response)\b/i],
    ['Assignment', /\b(assignment|homework|hw)\b/i],
    ['Project', /\b(project|presentation)\b/i],
    ['Paper / essay', /\b(paper|essay|report)\b/i],
    ['Lab', /\b(lab|laboratory)\b/i]
  ];
  return categories.map(([name,re])=>[name,items.filter(x=>re.test(x.title)).length]).filter(x=>x[1]>0);
}

function renderCommonWords(items) {
  const map = new Map();
  for(const item of items){
    const words=item.title.toLowerCase().replace(/[^a-z0-9']/g,' ').split(/\s+/).filter(w=>w.length>=3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
    for(const word of words) increment(map,word);
  }
  const top=[...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,30);
  const max=top[0]?.[1]||1;
  const nodes=top.map(([word,count])=>{
    const span=document.createElement('span'); span.className='word-chip'; span.textContent=`${word} (${count})`;
    span.style.fontSize=`${10 + Math.round(7*(count/max))}px`; span.title=`${count} title occurrences`; return span;
  });
  $('#commonWords').replaceChildren(...nodes);
}
