'use strict';

const state = {
  snapshot: null,
  selectedListIds: new Set(),
  activeTab: 'overview'
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const numberFmt = new Intl.NumberFormat();
const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATISTIC_TOOLTIPS = new Map([
  ['Universal ID', 'The permanent global ID assigned across every TaskList list. Universal IDs are never reused, even after deletion.'],
  ['Type', 'Whether this item is a top-level root task or a subtask nested under another item.'],
  ['Nesting depth', 'How many levels below a root task this item sits. Root tasks are depth 0, their direct subtasks are depth 1, and so on.'],
  ['Parent', 'The immediate task that directly contains this subtask. Root tasks do not have a parent.'],
  ['Direct children', 'The number of immediate subtasks directly under this item. Deeper nested subtasks are not included.'],
  ['Descendants', 'The total number of subtasks nested anywhere below this item, across every deeper level.'],
  ['Siblings', 'Other items with the same immediate parent. For a root task, this means the other root tasks in the same list.'],
  ['Root tree size', "The total size of this item's top-level task tree: the root task plus every descendant beneath that root."],
  ['Current age', 'For an Open item, the elapsed time since it was created. Closed items show a dash.'],
  ['Terminal time', 'For a currently Done or Cancelled item, the elapsed time from creation to its current terminal event. This requires confirmed clock times; date-only imports show a dash.']
]);

const STOPWORDS = new Set([
  'the','a','an','and','or','to','of','for','in','on','at','with','from','by','is','it','this','that','these','those',
  'my','your','our','their','be','do','does','did','done','task','tasks','homework','assignment','assignments','class',
  'chapter','week','day','new','make','add','finish','complete','read','write','about','into','up','out','as','due'
]);

function parseDate(value) {
  if (!value || typeof value !== 'string' || value.toLowerCase() === 'unknown') return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hasConfirmedClockTime(value) {
  return typeof value === 'string' && /T\d{2}:\d{2}/.test(value);
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
  if (!created || !completed || !hasConfirmedClockTime(item.createdAt) || !hasConfirmedClockTime(item.completedAt)) return null;
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
  if (!item.createdDate || !hasConfirmedClockTime(item.createdAt)) return null;
  const terminal = item.status === 'Done'
    ? item.completedDate
    : item.status === 'Cancelled'
      ? item.cancelledDate
      : null;
  const terminalRaw = item.status === 'Done'
    ? item.completedAt
    : item.status === 'Cancelled'
      ? item.cancelledAt
      : null;
  if (!terminal || !hasConfirmedClockTime(terminalRaw)) return null;
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
    completedDate: item.status === 'Done' ? parseDate(item.completedAt) : null,
    cancelledDate: item.status === 'Cancelled' ? parseDate(item.cancelledAt) : null,
    reopenedDate: parseDate(item.reopenedAt),
    depth: Math.max(0, String(item.displayId).split('.').length - 1)
  }));
  return raw;
}

function isAllListScope() {
  return state.selectedListIds.size === 0;
}

function selectedListNames() {
  return [...state.selectedListIds]
    .map(id => listName(id))
    .sort((a, b) => a.localeCompare(b));
}

function scopedItems() {
  if (!state.snapshot) return [];
  if (isAllListScope()) return state.snapshot.items;
  return state.snapshot.items.filter(item => state.selectedListIds.has(item.listId));
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
        if (!linked) {
          td.textContent = value == null ? '—' : String(value);
          if (headers[i] === 'Statistic') {
            const tooltip = STATISTIC_TOOLTIPS.get(String(value));
            if (tooltip) {
              td.classList.add('has-tooltip');
              td.title = tooltip;
              td.tabIndex = 0;
            }
          }
        }
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
