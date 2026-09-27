'use strict';

const VERSION = '0.14';
const state = {
  snapshot: null,
  selectedListId: 'all',
  activeTab: 'overview'
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const numberFmt = new Intl.NumberFormat();
const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STOPWORDS = new Set([
  'the','a','an','and','or','to','of','for','in','on','at','with','from','by','is','it','this','that','these','those',
  'my','your','our','their','be','do','does','did','done','task','tasks','homework','assignment','assignments','class',
  'chapter','week','day','new','make','add','finish','complete','read','write','about','into','up','out','as','due'
]);

function parseDate(value) {
  if (!value || typeof value !== 'string' || value.toLowerCase() === 'unknown') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function localDayKey(date) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthKey(date) {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function weekKey(date) {
  if (!date) return null;
  return localDayKey(startOfWeek(date));
}

function formatDate(date) {
  return date ? date.toLocaleDateString() : '—';
}

function formatDateTime(date) {
  return date ? date.toLocaleString(undefined, {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
  }) : '—';
}

function formatHour(hour) {
  const d = new Date(2000, 0, 1, hour, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true });
}

function durationMs(item) {
  const created = item.createdDate;
  const completed = item.completedDate;
  if (!created || !completed) return null;
  const ms = completed - created;
  return ms >= 0 ? ms : null;
}

function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (ms < hour) return `${Math.max(1, Math.round(ms / minute))} min`;
  if (ms < day) return `${oneDecimal.format(ms / hour)} hr`;
  return `${oneDecimal.format(ms / day)} days`;
}

function terminalDurationMs(item) {
  if (!item.createdDate) return null;
  const terminal = item.status === 'Done'
    ? item.completedDate
    : item.status === 'Cancelled'
      ? item.cancelledDate
      : null;
  if (!terminal) return null;
  const ms = terminal - item.createdDate;
  return ms >= 0 ? ms : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percent(part, total) {
  return total ? `${oneDecimal.format((part / total) * 100)}%` : '0%';
}

function increment(map, key, amount = 1) {
  if (key == null) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function maxEntry(map) {
  let best = null;
  for (const [key, value] of map) {
    if (!best || value > best[1]) best = [key, value];
  }
  return best;
}

function listName(id) {
  return state.snapshot?.lists.find(x => x.id === id)?.name ?? `List ${id}`;
}


const TASKLIST_ORIGIN = 'http://tasklist.lehighradio.com:8711';
function taskUrl(item) {
  return `${TASKLIST_ORIGIN}/task/${encodeURIComponent(item.universalId)}`;
}
function taskLink(item, label = `#${item.displayId}`) {
  const a = document.createElement('a');
  a.className = 'task-id-link';
  a.href = taskUrl(item);
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = label;
  a.title = `Open ${listName(item.listId)} task #${item.displayId} in a new tab`;
  return a;
}

function normalizeSnapshot(raw) {
  raw.lists = raw.lists ?? [];
  raw.items = (raw.items ?? []).map(item => ({
    ...item,
    createdDate: parseDate(item.createdAt),
    updatedDate: parseDate(item.updatedAt),
    completedDate: parseDate(item.completedAt),
    cancelledDate: parseDate(item.cancelledAt),
    reopenedDate: parseDate(item.reopenedAt),
    depth: Math.max(0, String(item.displayId).split('.').length - 1)
  }));
  return raw;
}

function scopedItems() {
  if (!state.snapshot) return [];
  if (state.selectedListId === 'all') return state.snapshot.items;
  const id = Number(state.selectedListId);
  return state.snapshot.items.filter(item => item.listId === id);
}

function allValidYears(items = scopedItems()) {
  const years = new Set();
  for (const item of items) {
    for (const d of [item.createdDate, item.completedDate, item.cancelledDate, item.reopenedDate]) {
      if (d) years.add(d.getFullYear());
    }
  }
  return [...years].sort((a, b) => a - b);
}

function makeStatCard(label, value, sub = '', kind = '') {
  const card = document.createElement('div');
  card.className = `stat-card${kind ? ` ${kind}` : ''}`;
  const l = document.createElement('div'); l.className = 'label'; l.textContent = label;
  const v = document.createElement('div'); v.className = 'value'; v.textContent = value;
  card.append(l, v);
  if (sub) { const s = document.createElement('div'); s.className = 'sub'; s.textContent = sub; card.append(s); }
  return card;
}

function renderCards(container, cards) {
  container.replaceChildren(...cards.map(c => makeStatCard(c.label, c.value, c.sub || '', c.kind || '')));
}

function renderMetricList(container, rows) {
  container.replaceChildren();
  for (const row of rows) {
    const [label, value, tooltip = ''] = row;
    const l = document.createElement('div'); l.className = 'metric-label'; l.textContent = label;
    if (tooltip) {
      l.classList.add('has-tooltip');
      l.title = tooltip;
      l.tabIndex = 0;
    }
    const v = document.createElement('div'); v.className = 'metric-value'; v.textContent = value;
    container.append(l, v);
  }
}

function setTable(table, headers, rows, numericColumns = []) {
  table.replaceChildren();
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  headers.forEach((header, i) => {
    const th = document.createElement('th');
    if (numericColumns.includes(i)) th.className = 'num';
    th.textContent = header;
    trh.append(th);
  });
  thead.append(trh);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    row.forEach((value, i) => {
      const td = document.createElement('td');
      if (numericColumns.includes(i)) td.className = 'num';
      if (value instanceof Node) {
        td.append(value);
      } else {
        let linked = false;
        if ((headers[i] === 'ID' || headers[i] === 'Root') && typeof value === 'string' && value.startsWith('#')) {
          const displayId = value.slice(1);
          const listIndex = headers.indexOf('List');
          const listLabel = listIndex >= 0 ? String(row[listIndex]) : null;
          const item = state.snapshot?.items.find(x => x.displayId === displayId && (!listLabel || listName(x.listId) === listLabel));
          if (item) {
            td.append(taskLink(item));
            linked = true;
          }
        }
        if (!linked) td.textContent = value == null ? '—' : String(value);
      }
      tr.append(td);
    });
    tbody.append(tr);
  }
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = headers.length;
    td.textContent = 'No data.';
    tr.append(td);
    tbody.append(tr);
  }
  table.append(thead, tbody);
}

function scopeLabel() {
  return state.selectedListId === 'all' ? 'All lists' : listName(Number(state.selectedListId));
}

function eventMaps(items) {
  const created = new Map(), completed = new Map(), cancelled = new Map(), reopened = new Map();
  for (const item of items) {
    if (item.createdDate) increment(created, localDayKey(item.createdDate));
    if (item.completedDate) increment(completed, localDayKey(item.completedDate));
    if (item.cancelledDate) increment(cancelled, localDayKey(item.cancelledDate));
    if (item.reopenedDate) increment(reopened, localDayKey(item.reopenedDate));
  }
  return { created, completed, cancelled, reopened };
}

function longestCreationStreaks(items) {
  const dates = items.map(x => x.createdDate).filter(Boolean).sort((a, b) => a - b);
  if (!dates.length) return { quiet: 0, active: 0, activeTotal: 0 };
  const counts = new Map();
  for (const d of dates) increment(counts, localDayKey(d));
  let cursor = new Date(dates[0].getFullYear(), dates[0].getMonth(), dates[0].getDate());
  const end = new Date(dates.at(-1).getFullYear(), dates.at(-1).getMonth(), dates.at(-1).getDate());
  let quiet = 0, quietMax = 0, active = 0, activeMax = 0, activeTotal = 0, activeTotalBest = 0;
  while (cursor <= end) {
    const count = counts.get(localDayKey(cursor)) || 0;
    if (count === 0) {
      quiet++;
      quietMax = Math.max(quietMax, quiet);
      active = 0;
      activeTotal = 0;
    } else {
      active++;
      activeTotal += count;
      if (active > activeMax || (active === activeMax && activeTotal > activeTotalBest)) {
        activeMax = active;
        activeTotalBest = activeTotal;
      }
      quiet = 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return { quiet: quietMax, active: activeMax, activeTotal: activeTotalBest };
}

function busiestPeriod(items, keyFn) {
  const map = new Map();
  for (const item of items) if (item.createdDate) increment(map, keyFn(item.createdDate));
  return maxEntry(map);
}

function formatMonthKey(key) {
  if (!key) return '—';
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatWeekKey(key) {
  if (!key) return '—';
  const d = new Date(`${key}T12:00:00`);
  return `Week of ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function renderOverview() {
  const items = scopedItems();
  const total = items.length;
  const open = items.filter(x => x.status === 'Open').length;
  const done = items.filter(x => x.status === 'Done').length;
  const cancelled = items.filter(x => x.status === 'Cancelled').length;
  const roots = items.filter(x => !x.parentDisplayId).length;
  const subtasks = total - roots;
  const deletedEstimate = state.selectedListId === 'all'
    ? Math.max(0, state.snapshot.highestUniversalId - state.snapshot.items.length)
    : null;

  renderCards($('#activityCards'), [
    { label: 'Current entries', value: numberFmt.format(total) },
    { label: 'Open', value: numberFmt.format(open) },
    { label: 'Done', value: numberFmt.format(done) },
    { label: 'Cancelled', value: numberFmt.format(cancelled) },
    { label: 'Root tasks', value: numberFmt.format(roots) },
    { label: 'Subtasks', value: numberFmt.format(subtasks) },
    { label: 'Lifetime entries', value: numberFmt.format(state.snapshot.highestUniversalId), sub: 'All lists, counting deletions' },
    { label: 'Deleted estimate', value: deletedEstimate == null ? '—' : numberFmt.format(deletedEstimate), sub: deletedEstimate == null ? 'Only knowable globally' : 'Lifetime IDs minus current items' }
  ]);

  const month = busiestPeriod(items, monthKey);
  const week = busiestPeriod(items, weekKey);
  const day = busiestPeriod(items, localDayKey);
  const streaks = longestCreationStreaks(items);
  const firstCreated = items.map(x => x.createdDate).filter(Boolean).sort((a,b)=>a-b)[0] || null;
  const lastCreated = items.map(x => x.createdDate).filter(Boolean).sort((a,b)=>b-a)[0] || null;
  renderCards($('#recordCards'), [
    { label: 'Busiest month', value: month ? formatMonthKey(month[0]) : '—', sub: month ? `${numberFmt.format(month[1])} tasks created` : '', kind: 'subject-first' },
    { label: 'Busiest week', value: week ? formatWeekKey(week[0]) : '—', sub: week ? `${numberFmt.format(week[1])} tasks created` : '', kind: 'subject-first' },
    { label: 'Busiest day', value: day ? formatDate(new Date(`${day[0]}T12:00:00`)) : '—', sub: day ? `${numberFmt.format(day[1])} tasks created` : '', kind: 'subject-first' },
    { label: 'Longest quiet streak', value: `${streaks.quiet} days`, sub: 'Between first and latest dated creation' },
    { label: 'Longest active streak', value: `${streaks.active} days`, sub: streaks.active ? `${streaks.activeTotal} tasks during best streak` : '' },
    { label: 'First dated task', value: formatDate(firstCreated) },
    { label: 'Latest dated task', value: formatDate(lastCreated) }
  ]);

  const durations = items.map(durationMs).filter(x => x != null);
  const fastest = durations.length ? Math.min(...durations) : null;
  const slowest = durations.length ? Math.max(...durations) : null;
  renderMetricList($('#completionBehavior'), [
    ['Completion percentage', percent(done, total), 'Current Done tasks divided by all current tasks in the selected scope, including Open and Cancelled tasks.'],
    ['Cancellation percentage', percent(cancelled, total), 'Current Cancelled tasks divided by all current tasks in the selected scope.'],
    ['Average observed completion time', formatDuration(average(durations)), 'The arithmetic mean of completed_at minus created_at for tasks that have both valid timestamps.'],
    ['Median observed completion time', formatDuration(median(durations)), 'The middle observed created-to-completed duration after sorting all valid completion times. Half were faster and half were slower.'],
    ['Fastest observed completion', formatDuration(fastest), 'The shortest non-negative time between created_at and completed_at among tasks with both timestamps.'],
    ['Slowest observed completion', formatDuration(slowest), 'The longest time between created_at and completed_at among tasks with both timestamps.']
  ]);

  const now = new Date();
  const openItems = items.filter(x => x.status === 'Open' && x.createdDate);
  const ages = openItems.map(x => Math.max(0, now - x.createdDate));
  const dayMs = 86_400_000;
  renderMetricList($('#openAging'), [
    ['Average age of open tasks', formatDuration(average(ages))],
    ['Median age of open tasks', formatDuration(median(ages))],
    ['Open 7+ days', numberFmt.format(ages.filter(x => x >= 7 * dayMs).length)],
    ['Open 30+ days', numberFmt.format(ages.filter(x => x >= 30 * dayMs).length)],
    ['Open 90+ days', numberFmt.format(ages.filter(x => x >= 90 * dayMs).length)],
    ['Oldest current open task', formatDuration(ages.length ? Math.max(...ages) : null)]
  ]);

  const buckets = [
    ['Same day (<24h)', 0], ['1–3 days', 0], ['4–7 days', 0], ['8–30 days', 0], ['31+ days', 0]
  ];
  for (const ms of durations) {
    const days = ms / dayMs;
    if (days < 1) buckets[0][1]++;
    else if (days <= 3) buckets[1][1]++;
    else if (days <= 7) buckets[2][1]++;
    else if (days <= 30) buckets[3][1]++;
    else buckets[4][1]++;
  }
  Charts.drawBarChart($('#completionBucketsChart'), buckets.map(x => x[0]), buckets.map(x => x[1]), '#000080', false, 'Completed tasks');

  const oldest = openItems.sort((a,b)=>a.createdDate-b.createdDate).slice(0, 15);
  setTable($('#oldestOpenTable'), ['List', 'ID', 'Task', 'Created', 'Age'], oldest.map(item => [
    listName(item.listId), `#${item.displayId}`, item.title, formatDate(item.createdDate), formatDuration(now - item.createdDate)
  ]));
}

function groupKey(date, mode) {
  if (mode === 'day') return localDayKey(date);
  if (mode === 'week') return weekKey(date);
  return monthKey(date);
}

function groupLabel(key, mode) {
  if (mode === 'month') {
    const [year, month] = key.split('-').map(Number);
    return `${MONTHS[month - 1]} ${String(year).slice(-2)}`;
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
    if (item.createdDate) increment(deltas, monthKey(item.createdDate), 1);
    if (item.completedDate) increment(deltas, monthKey(item.completedDate), -1);
    if (item.cancelledDate) increment(deltas, monthKey(item.cancelledDate), -1);
    if (item.reopenedDate) increment(deltas, monthKey(item.reopenedDate), 1);
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
    labels.push(`${MONTHS[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(-2)}`);
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

function renderCalendar() {
  const items = scopedItems();
  populateYearSelector(items);
  renderYearHeatmap(items);
  renderMonthCalendar(items);
  renderMonthYearHeatmap(items);
  renderSeasonality(items);
}

function populateYearSelector(items) {
  const select = $('#heatmapYear');
  const years = allValidYears(items);
  const current = Number(select.value) || new Date().getFullYear();
  select.replaceChildren();
  for (const year of years.length ? years : [new Date().getFullYear()]) {
    const option = document.createElement('option'); option.value = year; option.textContent = year; select.append(option);
  }
  if (years.includes(current)) select.value = current;
  else select.value = years.includes(new Date().getFullYear()) ? new Date().getFullYear() : years.at(-1) || new Date().getFullYear();

  const monthInput = $('#calendarMonth');
  if (!monthInput.value) {
    const y = Number(select.value);
    const latest = items.map(x=>x.createdDate).filter(d=>d && d.getFullYear()===y).sort((a,b)=>b-a)[0];
    const d = latest || new Date(y, new Date().getMonth(), 1);
    monthInput.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
}

function dailyMap(items, mode) {
  const map = new Map();
  for (const item of items) {
    if ((mode === 'created' || mode === 'activity') && item.createdDate) increment(map, localDayKey(item.createdDate));
    if ((mode === 'completed' || mode === 'activity') && item.completedDate) increment(map, localDayKey(item.completedDate));
    if ((mode === 'cancelled' || mode === 'activity') && item.cancelledDate) increment(map, localDayKey(item.cancelledDate));
    if (mode === 'activity' && item.reopenedDate) increment(map, localDayKey(item.reopenedDate));
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
  grid.style.gridTemplateColumns = `32px repeat(${weeks}, 24px)`;
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
    label.textContent = dow % 2 ? WEEKDAYS[dow].slice(0,1) : '';
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
  const value = $('#calendarMonth').value;
  if (!value) return;
  const [year, month] = value.split('-').map(Number);
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
  const currentIds = state.selectedListId === 'all' ? null : new Set([Number(state.selectedListId)]);
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

function renderPatterns() {
  const items = scopedItems();
  const createWeek = Array(7).fill(0), doneWeek = Array(7).fill(0);
  const createHour = Array(24).fill(0), doneHour = Array(24).fill(0);
  for (const item of items) {
    if (item.createdDate) { createWeek[item.createdDate.getDay()]++; createHour[item.createdDate.getHours()]++; }
    if (item.completedDate) { doneWeek[item.completedDate.getDay()]++; doneHour[item.completedDate.getHours()]++; }
  }
  Charts.drawGroupedBarChart($('#weekdayChart'), WEEKDAYS, createWeek, doneWeek, '#000080', '#008000', 'Tasks');
  Charts.drawGroupedBarChart($('#hourChart'), Array.from({length:24},(_,h)=>formatHour(h)), createHour, doneHour, '#000080', '#008000', 'Tasks');
  renderWeekdayHourHeatmap(items);

  const bestWeek = createWeek.indexOf(Math.max(...createWeek));
  const bestHour = createHour.indexOf(Math.max(...createHour));
  const activeWeeks = new Set(items.map(x=>x.createdDate && weekKey(x.createdDate)).filter(Boolean));
  const activeMonths = new Set(items.map(x=>x.createdDate && monthKey(x.createdDate)).filter(Boolean));
  const datedCount = items.filter(x=>x.createdDate).length;
  const streaks = longestCreationStreaks(items);
  renderMetricList($('#rhythmMetrics'), [
    ['Busiest creation weekday', `${WEEKDAYS[bestWeek]} (${createWeek[bestWeek] || 0})`, 'The weekday with the highest total number of task creation timestamps in the selected scope.'],
    ['Busiest creation hour', `${formatHour(bestHour)} (${createHour[bestHour] || 0})`, "The hour of the day in which the most tasks were created, using your browser\'s local time."],
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
    if (d) matrix[d.getDay()][d.getHours()]++;
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
    ['Titles containing exam/test/midterm/final', numberFmt.format(examItems.length), 'Counts dated tasks whose titles contain exam, test, midterm, or final.'],
    ['Average creations/day near those tasks (±7 days)', oneDecimal.format(windowAvg), 'For every matching exam/test task, take the 7 days before through 7 days after. Overlapping dates are counted once, then all creations in those dates are divided by the number of unique dates.'],
    ['Baseline creations/active day', oneDecimal.format(baseline), 'All dated task creations divided by the number of days that contain at least one creation. Quiet days are not included in this baseline.'],
    ['Exam-window activity vs baseline', ratio == null ? '—' : `${oneDecimal.format(ratio)}×`, 'The exam-window average creations per day divided by the baseline active-day average. Above 1× means those windows were busier than a typical active day.']
  ]);
}

function renderTrees() {
  const items = scopedItems();
  const roots = items.filter(x=>!x.parentDisplayId);
  const parents = items.filter(parent => items.some(child => child.listId===parent.listId && child.parentDisplayId===parent.displayId));
  const rootTrees = roots.map(root => {
    const prefix = `${root.displayId}.`;
    const descendants = items.filter(x=>x.listId===root.listId && x.displayId.startsWith(prefix));
    return { root, descendants, size: descendants.length + 1, maxDepth: Math.max(root.depth, ...descendants.map(x=>x.depth)) };
  });
  const deepest = Math.max(0, ...items.map(x=>x.depth));
  const directChildCounts = parents.map(parent => items.filter(x=>x.listId===parent.listId && x.parentDisplayId===parent.displayId).length);
  const reopened = items.filter(x=>x.reopenedDate).length;
  renderCards($('#treeCards'), [
    { label:'Deepest nesting level', value:String(deepest) },
    { label:'Roots with subtasks', value:percent(rootTrees.filter(x=>x.size>1).length, roots.length) },
    { label:'Average subtasks per root', value:roots.length?oneDecimal.format((items.length-roots.length)/roots.length):'0' },
    { label:'Average direct children per parent', value:directChildCounts.length?oneDecimal.format(average(directChildCounts)):'0' },
    { label:'Tasks ever reopened (known)', value:numberFmt.format(reopened) },
    { label:'Highest Universal ID', value:numberFmt.format(state.snapshot.highestUniversalId), sub:'Lifetime counter across all lists' }
  ]);

  const depthCounts = new Map();
  for(const item of items) increment(depthCounts,item.depth);
  const depths=[...depthCounts.keys()].sort((a,b)=>a-b);
  Charts.drawBarChart($('#depthChart'),depths.map(d=>d===0?'Root':`Depth ${d}`),depths.map(d=>depthCounts.get(d)),'#000080',false,'Tasks');

  const typeCounts = inferTaskTypes(items);
  Charts.drawBarChart($('#taskTypeChart'),typeCounts.map(x=>x[0]),typeCounts.map(x=>x[1]),'#000080',false,'Tasks');

  const largest=[...rootTrees].sort((a,b)=>b.size-a.size).slice(0,12);
  setTable($('#largestTreesTable'),['List','Root','Title','Tree size','Max depth'],largest.map(x=>[
    listName(x.root.listId),`#${x.root.displayId}`,x.root.title,numberFmt.format(x.size),x.maxDepth
  ]),[3,4]);

  const deepestTasks=[...items].sort((a,b)=>b.depth-a.depth || b.universalId-a.universalId).slice(0,15);
  setTable($('#deepestTasksTable'),['List','ID','Depth','Task'],deepestTasks.map(x=>[
    listName(x.listId),`#${x.displayId}`,x.depth,x.title
  ]),[2]);

  renderCommonWords(items);
  const reopenedItems=items.filter(x=>x.reopenedDate).sort((a,b)=>b.reopenedDate-a.reopenedDate).slice(0,15);
  setTable($('#reopenedTable'),['List','ID','Task','Reopened'],reopenedItems.map(x=>[
    listName(x.listId),`#${x.displayId}`,x.title,formatDateTime(x.reopenedDate)
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

function renderAll() {
  if (!state.snapshot) return;
  $('#titleScope').textContent = scopeLabel();
  $('#listFilterLabel').textContent = scopeLabel();
  renderOverview();
  renderTrends();
  renderCalendar();
  renderLists();
  renderPatterns();
  renderTrees();
  Fun.render();
  $('#statusLeft').textContent = `${numberFmt.format(scopedItems().length)} current items • ${scopeLabel()}`;
  $('#statusRight').textContent = `DB updated ${formatDateTime(parseDate(state.snapshot.databaseLastWriteUtc))} • Read-only`;
}

function switchTab(name) {
  state.activeTab = name;
  $$('.tabs [role="tab"]').forEach(btn => btn.setAttribute('aria-selected', btn.dataset.tab === name ? 'true' : 'false'));
  $$('.tab-panel').forEach(panel => panel.hidden = panel.dataset.panel !== name);
  closeMenus();
  // Redraw canvases after their hidden panel becomes visible.
  requestAnimationFrame(() => renderAll());
}

function populateListFilter() {
  const menu = $('#listFilterMenu');
  menu.replaceChildren();
  const options = [['all','All lists'], ...state.snapshot.lists.map(l=>[String(l.id),l.name])];
  for (const [value,label] of options) {
    const button=document.createElement('button'); button.type='button'; button.dataset.value=value; button.setAttribute('role','menuitemradio');
    button.setAttribute('aria-checked', value===state.selectedListId?'true':'false');
    const check=document.createElement('span'); check.className='menu-check';
    const text=document.createElement('span'); text.className='menu-label'; text.textContent=label;
    button.append(check,text);
    button.addEventListener('click',()=>{
      state.selectedListId=value;
      populateListFilter();
      $('#listFilterLabel').textContent=scopeLabel();
      $('#listFilterMenu').hidden=true; $('#listFilterButton').setAttribute('aria-expanded','false');
      renderAll();
    });
    menu.append(button);
  }
}

function populateViewMenu() {
  const labels = [['overview','Overview'],['trends','Trends'],['calendar','Calendar'],['lists','Lists'],['patterns','Patterns'],['trees','Trees & Titles'],['fun','Fun']];
  const menu=$('#viewMenu'); menu.replaceChildren();
  for(const [value,label] of labels){
    const button=document.createElement('button'); button.type='button'; button.setAttribute('role','menuitemradio'); button.setAttribute('aria-checked',value===state.activeTab?'true':'false');
    const check=document.createElement('span');check.className='menu-check';const text=document.createElement('span');text.className='menu-label';text.textContent=label;
    button.append(check,text); button.addEventListener('click',()=>{switchTab(value);populateViewMenu();}); menu.append(button);
  }
}

function toggleMenu(button, menu) {
  const open=menu.hidden;
  closeMenus();
  menu.hidden=!open;
  button.setAttribute('aria-expanded',open?'true':'false');
}

function closeMenus() {
  for(const id of ['fileMenu','viewMenu','helpMenu','listFilterMenu']) $(id.startsWith('#')?id:`#${id}`).hidden=true;
  for(const id of ['fileMenuButton','viewMenuButton','helpMenuButton','listFilterButton']) $(`#${id}`).setAttribute('aria-expanded','false');
}

async function loadSnapshot() {
  $('#loadingPanel').hidden=false; $('#errorPanel').hidden=true;
  $('#databaseStatus').textContent='Loading database...';
  try {
    const response=await fetch('/api/snapshot',{cache:'no-store'});
    if(!response.ok){
      let message=`Server returned ${response.status}`;
      try{const body=await response.json(); message=body.detail||body.title||message;}catch{}
      throw new Error(message);
    }
    state.snapshot=normalizeSnapshot(await response.json());
    if(state.selectedListId!=='all'&&!state.snapshot.lists.some(l=>String(l.id)===state.selectedListId)) state.selectedListId='all';
    populateListFilter(); populateViewMenu();
    $('#databaseStatus').textContent=`${numberFmt.format(state.snapshot.items.length)} current items`;
    $('#loadingPanel').hidden=true;
    renderAll();
  } catch(error) {
    $('#loadingPanel').hidden=true;
    const panel=$('#errorPanel'); panel.hidden=false; panel.textContent=error.message;
    $('#databaseStatus').textContent='Database unavailable';
  }
}

function downloadSnapshot() {
  if(!state.snapshot)return;
  const blob=new Blob([JSON.stringify(state.snapshot,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`task-list-stats-snapshot-${localDayKey(new Date())}.json`; a.click(); URL.revokeObjectURL(url);
}

// ---------- events ----------
$('#fileMenuButton').addEventListener('click',e=>{e.stopPropagation();toggleMenu($('#fileMenuButton'),$('#fileMenu'));});
$('#viewMenuButton').addEventListener('click',e=>{e.stopPropagation();populateViewMenu();toggleMenu($('#viewMenuButton'),$('#viewMenu'));});
$('#helpMenuButton').addEventListener('click',e=>{e.stopPropagation();toggleMenu($('#helpMenuButton'),$('#helpMenu'));});
$('#listFilterButton').addEventListener('click',e=>{e.stopPropagation();toggleMenu($('#listFilterButton'),$('#listFilterMenu'));});
$('#refreshButton').addEventListener('click',()=>{closeMenus();loadSnapshot();});
$('#exportButton').addEventListener('click',()=>{closeMenus();downloadSnapshot();});
$('#aboutButton').addEventListener('click',()=>{closeMenus();$('#aboutDialog').showModal();});
$$('.tabs [role="tab"]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
$('#trendGroup').addEventListener('change',renderTrends);
$('#heatmapYear').addEventListener('change',()=>{renderYearHeatmap(scopedItems());const y=$('#heatmapYear').value;const m=$('#calendarMonth').value?.split('-')[1]||'01';$('#calendarMonth').value=`${y}-${m}`;renderMonthCalendar(scopedItems());});
$('#heatmapMode').addEventListener('change',()=>renderYearHeatmap(scopedItems()));
$('#calendarMonth').addEventListener('change',()=>renderMonthCalendar(scopedItems()));
$('#hourHeatmapMode').addEventListener('change',()=>renderWeekdayHourHeatmap(scopedItems()));
document.addEventListener('click',closeMenus);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenus();});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>renderAll(),120);});



function initializeTouchHelp() {
  const popup = document.createElement('div');
  popup.className = 'tap-help-tooltip';
  popup.hidden = true;
  document.body.append(popup);

  function hide() { popup.hidden = true; }
  function showFor(element) {
    const text = element.getAttribute('title');
    if (!text) return;
    popup.textContent = text;
    popup.hidden = false;
    const rect = element.getBoundingClientRect();
    const margin = 10;
    const width = popup.offsetWidth || 260;
    const height = popup.offsetHeight || 60;
    const x = rect.left + rect.width / 2;
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, x - width / 2));
    let top = rect.bottom + 12;
    if (top + height + margin > window.innerHeight) top = Math.max(margin, rect.top - height - 12);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  document.addEventListener('click', event => {
    const target = event.target.closest?.('.has-tooltip[title], .word-chip[title]');
    if (target) {
      showFor(target);
      return;
    }
    hide();
  }, true);
  document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('.has-tooltip[title], .word-chip[title]')) {
      event.preventDefault();
      showFor(event.target);
    } else if (event.key === 'Escape') {
      hide();
    }
  });
  $('#workspace')?.addEventListener('scroll', hide, { passive: true });
}

function initializeNativeRetroSelects(){
  for(const select of document.querySelectorAll('select.native-retro-select')){
    if(select.closest('.single-arrow-select'))continue;
    const wrapper=document.createElement('span');
    wrapper.className='single-arrow-select';
    select.before(wrapper);
    wrapper.append(select);
    const arrow=document.createElement('span');
    arrow.className='single-arrow-select-icon';
    arrow.setAttribute('aria-hidden','true');
    arrow.textContent='▼';
    wrapper.append(arrow);
  }
}
document.addEventListener('DOMContentLoaded', () => {
  Fun.initialize();
  initializeNativeRetroSelects();
  initializeTouchHelp();
  loadSnapshot();
});

if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
