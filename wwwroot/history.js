function groupKey(date, mode) {
  if (mode === 'day') return localDayKey(date);
  if (mode === 'week') return weekKey(date);
  return monthKey(date);
}

function groupLabel(key, mode) {
  if (mode === 'month') {
    const [year, month] = key.split('-').map(Number);
    return `${MONTHS[month - 1]} ${year}`;
  }
  if (mode === 'week') {
    const d = new Date(`${key}T12:00:00`);
    return `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
  }
  const d = new Date(`${key}T12:00:00`);
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function groupedEvents(items, mode) {
  const maps = { created: new Map(), completed: new Map(), cancelled: new Map() };
  for (const item of items) {
    if (item.createdDate) increment(maps.created, groupKey(item.createdDate, mode));
    if (item.completedDate) increment(maps.completed, groupKey(item.completedDate, mode));
    if (item.cancelledDate) increment(maps.cancelled, groupKey(item.cancelledDate, mode));
  }
  let keys = [...new Set([...maps.created.keys(), ...maps.completed.keys(), ...maps.cancelled.keys()])].sort();
  const limit = mode === 'day' ? 180 : mode === 'week' ? 156 : 120;
  if (keys.length > limit) keys = keys.slice(-limit);
  return { keys, maps };
}

function renderTrends() {
  const items = scopedItems();
  const mode = $('#trendGroup').value;
  const grouped = groupedEvents(items, mode);
  Charts.drawMultiLineChart($('#trendChart'), grouped.keys.map(k => groupLabel(k, mode)), [
    { name: 'Created', values: grouped.keys.map(k => grouped.maps.created.get(k) || 0), color: '#000080' },
    { name: 'Completed', values: grouped.keys.map(k => grouped.maps.completed.get(k) || 0), color: '#008000' },
    { name: 'Cancelled', values: grouped.keys.map(k => grouped.maps.cancelled.get(k) || 0), color: '#800000' }
  ], 'Tasks per period');

  const backlog = approximateBacklog(items);
  Charts.drawLineChart($('#backlogChart'), backlog.labels, backlog.values, '#000080', 'Approx. open tasks', 'Approx. backlog');

  const monthly = new Map();
  const monthlyCompleted = new Map();
  for (const item of items) {
    if (item.createdDate) increment(monthly, monthKey(item.createdDate));
    if (item.completedDate) increment(monthlyCompleted, monthKey(item.completedDate));
  }
  const topMonths = [...monthly.entries()].sort((a,b)=>b[1]-a[1] || b[0].localeCompare(a[0])).slice(0,10);
  setTable($('#topMonthsTable'), ['Rank', 'Month', 'Created', 'Completed'], topMonths.map((x,i)=>[
    i+1, formatMonthKey(x[0]), numberFmt.format(x[1]), numberFmt.format(monthlyCompleted.get(x[0]) || 0)
  ]), [0,2,3]);

  const monthDurations = new Map();
  for (const item of items) {
    const ms = durationMs(item);
    if (ms == null || !item.completedDate) continue;
    const key = monthKey(item.completedDate);
    if (!monthDurations.has(key)) monthDurations.set(key, []);
    monthDurations.get(key).push(ms);
  }
  const monthSpeeds = [...monthDurations.entries()].map(([key, arr]) => ({ key, avg: average(arr), count: arr.length }))
    .filter(x => x.count >= 2);
  const fast = [...monthSpeeds].sort((a,b)=>a.avg-b.avg).slice(0,5);
  const slow = [...monthSpeeds].sort((a,b)=>b.avg-a.avg).slice(0,5);
  const speedRows = [];
  for (let i=0; i<Math.max(fast.length, slow.length); i++) {
    speedRows.push([
      fast[i] ? formatMonthKey(fast[i].key) : '—', fast[i] ? formatDuration(fast[i].avg) : '—',
      slow[i] ? formatMonthKey(slow[i].key) : '—', slow[i] ? formatDuration(slow[i].avg) : '—'
    ]);
  }
  setTable($('#monthSpeedTable'), ['Fast month', 'Avg', 'Slow month', 'Avg'], speedRows);

  renderYearComparison(items);
}

function approximateBacklog(items) {
  const deltas = new Map();
  for (const item of items) {
    const events = [];
    if (item.createdDate) events.push({ date: item.createdDate, state: 'open', priority: 0 });

    const completed = parseDate(item.completedAt);
    const cancelled = parseDate(item.cancelledAt);
    const reopened = parseDate(item.reopenedAt);
    if (completed) events.push({ date: completed, state: 'closed', priority: 1 });
    if (cancelled) events.push({ date: cancelled, state: 'closed', priority: 1 });
    if (reopened) events.push({ date: reopened, state: 'open', priority: 2 });

    events.sort((a, b) => a.date - b.date || a.priority - b.priority);
    let taskState = null;
    for (const event of events) {
      if (event.state === taskState) continue;
      increment(deltas, monthKey(event.date), event.state === 'open' ? 1 : -1);
      taskState = event.state;
    }
  }

  const keys = [...deltas.keys()].sort();
  if (!keys.length) return { labels: [], values: [] };
  const [sy, sm] = keys[0].split('-').map(Number);
  const [ey, em] = keys.at(-1).split('-').map(Number);
  const labels = [], values = [];
  let running = 0;
  const cursor = new Date(sy, sm - 1, 1);
  const end = new Date(ey, em - 1, 1);
  while (cursor <= end) {
    const key = monthKey(cursor);
    running += deltas.get(key) || 0;
    labels.push(`${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`);
    values.push(Math.max(0, running));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return { labels, values };
}

function renderYearComparison(items) {
  const years = [...new Set(items.map(x=>x.createdDate?.getFullYear()).filter(Boolean))].sort((a,b)=>b-a).slice(0,6).reverse();
  const counts = new Map();
  for (const item of items) if (item.createdDate) increment(counts, monthKey(item.createdDate));
  const rows = years.map(year => [String(year), ...MONTHS.map((_, m) => numberFmt.format(counts.get(`${year}-${String(m+1).padStart(2,'0')}`) || 0))]);
  setTable($('#yearComparisonTable'), ['Year', ...MONTHS], rows, Array.from({length:12}, (_,i)=>i+1));
}

function parseCalendarMonth(value) {
  const match = /^\s*(\d{1,2})\/(\d{2}|\d{4})\s*$/.exec(value || '');
  if (!match) return null;
  const month = Number(match[1]);
  let year = Number(match[2]);
  if (match[2].length === 2) year += 2000;
  if (month < 1 || month > 12 || year < 1) return null;
  return { year, month };
}

function formatCalendarMonthValue(year, month) {
  return `${month}/${year}`;
}

function populateCalendarControls(items) {
  const years = allValidYears(items);
  const currentYear = new Date().getFullYear();
  const availableYears = years.length ? years : [currentYear];
  const requestedYear = Number($('#heatmapYear').value) || currentYear;
  const selectedYear = availableYears.includes(requestedYear)
    ? requestedYear
    : availableYears.includes(currentYear)
      ? currentYear
      : availableYears.at(-1);

  setSingleSelectOptions(
    'heatmapYear',
    availableYears.map(year => [String(year), String(year)]),
    String(selectedYear)
  );

  const monthInput = $('#calendarMonth');
  if (!parseCalendarMonth(monthInput.value)) {
    const latest = items
      .map(item => item.createdDate)
      .filter(date => date && date.getFullYear() === selectedYear)
      .sort((a,b)=>b-a)[0];
    const fallback = latest || new Date(selectedYear, selectedYear === currentYear ? new Date().getMonth() : 0, 1);
    monthInput.value = formatCalendarMonthValue(fallback.getFullYear(), fallback.getMonth() + 1);
  }
}

function renderCalendar() {
  const items = scopedItems();
  populateCalendarControls(items);
  renderYearHeatmap(items);
  renderMonthCalendar(items);
  renderMonthYearHeatmap(items);
  renderSeasonality(items);
}

function dailyMap(items, mode) {
  const map = new Map();
  for (const item of items) {
    if ((mode === 'created' || mode === 'activity') && item.createdDate) increment(map, localDayKey(item.createdDate));
    if ((mode === 'completed' || mode === 'activity') && item.completedDate) increment(map, localDayKey(item.completedDate));
    if ((mode === 'cancelled' || mode === 'activity') && item.cancelledDate) increment(map, localDayKey(item.cancelledDate));
    if ((mode === 'reopened' || mode === 'activity') && item.reopenedDate) increment(map, localDayKey(item.reopenedDate));
  }
  return map;
}

function heatClass(value, max) {
  if (!value) return 'h0';
  const ratio = value / Math.max(1, max);
  if (ratio <= .25) return 'h1';
  if (ratio <= .5) return 'h2';
  if (ratio <= .75) return 'h3';
  return 'h4';
}

function renderYearHeatmap(items) {
  const container = $('#yearHeatmap');
  const year = Number($('#heatmapYear').value);
  const mode = $('#heatmapMode').value;
  const map = dailyMap(items, mode);
  const jan1 = new Date(year, 0, 1);
  const start = new Date(year, 0, 1 - jan1.getDay());
  const dec31 = new Date(year, 11, 31);
  const weeks = Math.ceil(((dec31 - start) / 86_400_000 + 1) / 7);
  let max = 0;
  for (const [key, value] of map) if (key.startsWith(`${year}-`)) max = Math.max(max, value);

  const grid = document.createElement('div');
  grid.className = 'heatmap-grid';
  grid.style.gridTemplateColumns = `42px repeat(${weeks}, 24px)`;
  grid.style.gridTemplateRows = '20px repeat(7, 24px)';
  grid.style.gridAutoFlow = 'row';

  const corner = document.createElement('div'); grid.append(corner);
  for (let w=0; w<weeks; w++) {
    const d = new Date(start); d.setDate(start.getDate() + w*7);
    const label = document.createElement('div'); label.className = 'heat-month';
    label.textContent = (d.getDate() <= 7 && d.getFullYear() === year) ? MONTHS[d.getMonth()] : '';
    grid.append(label);
  }
  for (let dow=0; dow<7; dow++) {
    const label = document.createElement('div'); label.className = 'heat-label';
    label.textContent = WEEKDAYS[dow];
    grid.append(label);
    for (let w=0; w<weeks; w++) {
      const d = new Date(start); d.setDate(start.getDate() + w*7 + dow);
      const cell = document.createElement('span');
      const inYear = d.getFullYear() === year;
      const value = inYear ? (map.get(localDayKey(d)) || 0) : 0;
      cell.className = `heat ${inYear ? heatClass(value, max) : 'h0'}`;
      if (!inYear) cell.style.visibility = 'hidden';
      else cell.textContent = String(value);
      grid.append(cell);
    }
  }
  container.replaceChildren(grid);
}

function renderMonthCalendar(items) {
  const selected = parseCalendarMonth($('#calendarMonth').value);
  if (!selected) {
    $('#monthCalendar').replaceChildren();
    return;
  }
  const { year, month } = selected;
  const created = dailyMap(items, 'created');
  const completed = dailyMap(items, 'completed');
  const cancelled = dailyMap(items, 'cancelled');
  const grid = $('#monthCalendar');
  grid.replaceChildren();
  for (const day of WEEKDAYS) {
    const head = document.createElement('div'); head.className = 'calendar-head'; head.textContent = day; grid.append(head);
  }
  const first = new Date(year, month - 1, 1);
  const days = new Date(year, month, 0).getDate();
  for (let i=0;i<first.getDay();i++) { const e=document.createElement('div'); e.className='calendar-day empty'; grid.append(e); }
  for (let day=1; day<=days; day++) {
    const d = new Date(year, month - 1, day); const key = localDayKey(d);
    const cell = document.createElement('div'); cell.className = 'calendar-day';
    const date = document.createElement('div'); date.className='calendar-date'; date.textContent=day; cell.append(date);
    const values = [
      ['created','Created',created.get(key)||0], ['done','Done',completed.get(key)||0], ['cancelled','Cancelled',cancelled.get(key)||0]
    ];
    for (const [cls,label,count] of values) {
      if (!count) continue;
      const line = document.createElement('div'); line.className=`calendar-count ${cls}`; line.textContent=`${label}: ${count}`; cell.append(line);
    }
    grid.append(cell);
  }
}

function renderMonthYearHeatmap(items) {
  const years = [...new Set(items.map(x=>x.createdDate?.getFullYear()).filter(Boolean))].sort((a,b)=>a-b);
  const counts = new Map();
  for (const item of items) if (item.createdDate) increment(counts, monthKey(item.createdDate));
  const max = Math.max(0, ...counts.values());
  const grid = document.createElement('div');
  grid.className = 'month-year-grid';
  grid.style.gridTemplateColumns = `58px repeat(12, 56px)`;
  const blank = document.createElement('div'); grid.append(blank);
  for (const m of MONTHS) { const h=document.createElement('div'); h.className='month-year-head'; h.textContent=m; grid.append(h); }
  for (const year of years) {
    const yl = document.createElement('div'); yl.className='month-year-year'; yl.textContent=year; grid.append(yl);
    for (let m=1;m<=12;m++) {
      const value = counts.get(`${year}-${String(m).padStart(2,'0')}`) || 0;
      const cell = document.createElement('div'); cell.className=`month-year-cell heat ${heatClass(value,max)}`; cell.textContent=String(value); grid.append(cell);
    }
  }
  $('#monthYearHeatmap').replaceChildren(grid);
}

function renderSeasonality(items) {
  const years = [...new Set(items.map(x=>x.createdDate?.getFullYear()).filter(Boolean))].sort();
  const counts = Array(12).fill(0);
  if (years.length) {
    for (const item of items) if (item.createdDate) counts[item.createdDate.getMonth()]++;
    for (let i=0;i<12;i++) counts[i] /= years.length;
  }
  Charts.drawBarChart($('#seasonalityChart'), MONTHS, counts, '#000080', true, 'Average tasks created');
}

function renderLists() {
  const allItems = state.snapshot.items;
  const currentIds = isAllListScope() ? null : state.selectedListIds;
  const lists = state.snapshot.lists.filter(l => !currentIds || currentIds.has(l.id));
  const totalScope = lists.reduce((sum,l)=>sum+allItems.filter(i=>i.listId===l.id).length,0);
  const rows = [];
  const shareLabels = [], shareValues = [];
  for (const list of lists) {
    const items = allItems.filter(i=>i.listId===list.id);
    const open = items.filter(i=>i.status==='Open').length;
    const done = items.filter(i=>i.status==='Done').length;
    const cancelled = items.filter(i=>i.status==='Cancelled').length;
    const durations = items.map(durationMs).filter(x=>x!=null);
    rows.push([
      list.name, numberFmt.format(items.length), numberFmt.format(open), numberFmt.format(done), numberFmt.format(cancelled),
      percent(done, items.length), formatDuration(average(durations)), percent(items.length,totalScope)
    ]);
    shareLabels.push(list.name); shareValues.push(items.length);
  }
  rows.sort((a,b)=>Number(b[1].replaceAll(',',''))-Number(a[1].replaceAll(',','')));
  setTable($('#listStatsTable'), ['List','Total','Open','Done','Cancelled','Completion','Avg completion','Share'], rows, [1,2,3,4]);
  Charts.drawBarChart($('#listShareChart'), shareLabels, shareValues, '#000080', false, 'Current entries');

  const monthListCounts = new Map();
  for (const item of allItems) {
    if (!item.createdDate || (currentIds && !currentIds.has(item.listId))) continue;
    const mk = monthKey(item.createdDate);
    if (!monthListCounts.has(mk)) monthListCounts.set(mk, new Map());
    increment(monthListCounts.get(mk), item.listId);
  }
  const activeRows = [...monthListCounts.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,36).map(([month,map]) => {
    const best = maxEntry(map);
    return [formatMonthKey(month), best ? listName(best[0]) : '—', best ? numberFmt.format(best[1]) : '0'];
  });
  setTable($('#activeListByMonthTable'), ['Month','Most active list','Created'], activeRows, [2]);
}

function calendarDayKeyFromCell(cell) {
  const selected = parseCalendarMonth($('#calendarMonth').value);
  const day = Number(cell.querySelector('.calendar-date')?.textContent);
  if (!selected || !Number.isInteger(day) || day < 1 || day > 31) return null;
  return `${selected.year}-${String(selected.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function calendarItemsForDay(dayKey, dateField) {
  return scopedItems()
    .filter(item => localDayKey(item[dateField]) === dayKey)
    .sort((a, b) => b.universalId - a.universalId);
}

function calendarDaySection(label, items) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'groupbox calendar-detail-group';
  const legend = document.createElement('legend');
  legend.textContent = `${label} (${numberFmt.format(items.length)})`;
  fieldset.append(legend);

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  setTable(table, ['List', 'ID', 'Task', 'Current status'], items.map(item => [
    listName(item.listId),
    taskLink(item),
    item.title || '(Untitled task)',
    item.status
  ]));
  wrap.append(table);
  fieldset.append(wrap);
  return fieldset;
}

function openCalendarDayDetails(dayKey) {
  const date = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return;

  const categories = [
    ['Created', calendarItemsForDay(dayKey, 'createdDate')],
    ['Completed', calendarItemsForDay(dayKey, 'completedDate')],
    ['Cancelled', calendarItemsForDay(dayKey, 'cancelledDate')]
  ].filter(([, items]) => items.length);

  $('#calendarDayTitle').textContent = date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const scope = document.createElement('div');
  scope.className = 'calendar-detail-scope';
  scope.textContent = `Scope: ${isAllListScope() ? 'All lists' : selectedListNames().join(', ')}`;

  $('#calendarDayBody').replaceChildren(
    scope,
    ...categories.map(([label, items]) => calendarDaySection(label, items))
  );
  $('#calendarDayDialog').showModal();
}

$('#monthCalendar').addEventListener('click', event => {
  const cell = event.target.closest('.calendar-day:not(.empty)');
  if (!cell || !$('#monthCalendar').contains(cell)) return;
  const dayKey = calendarDayKeyFromCell(cell);
  if (dayKey) openCalendarDayDetails(dayKey);
});
