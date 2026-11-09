/** Creates an element with an optional class and text; buttons get type="button". The same helper in every app. */
export function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (tag === 'button') node.type = 'button';
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export const state = {
  snapshot: null,
  selectedListIds: new Set(),
  activeTab: 'overview',
  eventsLoaded: false,
  eventsLoading: null,
  eventsNeedRefresh: false,
  lastEventId: 0,
  eventCursor: null,
  snapshotLoading: null
};

export const $ = selector => document.querySelector(selector);
export const $$ = selector => [...document.querySelectorAll(selector)];
export const numberFmt = new Intl.NumberFormat();
export const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const HEATMAP_EVENT_OPTIONS = [
  ['created', 'Created'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
  ['reopened', 'Reopened'],
  ['activity', 'All activity']
];

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

export const STOPWORDS = new Set([
  'the','a','an','and','or','to','of','for','in','on','at','with','from','by','is','it','this','that','these','those',
  'my','your','our','their','be','do','does','did','done','task','tasks','homework','assignment','assignments','class',
  'chapter','week','day','new','make','add','finish','complete','read','write','about','into','up','out','as','due'
]);

export function parseDate(value) {
  if (!value || typeof value !== 'string' || value.toLowerCase() === 'unknown') return null;
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})(?=$|T)/.exec(value);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const d = new Date(0);
    d.setHours(0, 0, 0, 0);
    d.setFullYear(Number(year), Number(month) - 1, Number(day));
    if (d.getFullYear() !== Number(year) || d.getMonth() !== Number(month) - 1 || d.getDate() !== Number(day))
      return null;
    if (value.length === 10) return d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function hasConfirmedClockTime(value) {
  return typeof value === 'string' && /T\d{2}:\d{2}/.test(value);
}

export function* heatmapDates(items, mode, { requireClockTime = false } = {}) {
  const events = mode === 'activity'
    ? HEATMAP_EVENT_OPTIONS.map(([value]) => value).filter(value => value !== 'activity')
    : [mode];
  for (const item of items) {
    for (const event of events) {
      const date = item[`${event}Date`];
      if (date && (!requireClockTime || hasConfirmedClockTime(item[`${event}At`]))) yield date;
    }
  }
}

export function localDayKey(date) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function monthKey(date) {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function weekKey(date) {
  if (!date) return null;
  return localDayKey(startOfWeek(date));
}

export function formatDate(date) {
  return date ? date.toLocaleDateString() : '—';
}

export function formatDateTime(date) {
  return date ? date.toLocaleString(undefined, {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit'
  }) : '—';
}

export function formatHour(hour) {
  const d = new Date(2000, 0, 1, hour, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric' });
}

export function durationMs(item) {
  const created = item.createdDate;
  const completed = item.completedDate;
  if (!created || !completed || !hasConfirmedClockTime(item.createdAt) || !hasConfirmedClockTime(item.completedAt)) return null;
  const ms = completed - created;
  return ms >= 0 ? ms : null;
}

export function formatDuration(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (ms < hour) return `${Math.max(1, Math.round(ms / minute))} min`;
  if (ms < day) return `${oneDecimal.format(ms / hour)} hr`;
  return `${oneDecimal.format(ms / day)} days`;
}

export function terminalDurationMs(item) {
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

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function average(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function percent(part, total) {
  return total ? `${oneDecimal.format((part / total) * 100)}%` : '0%';
}

export function increment(map, key, amount = 1) {
  if (key == null) return;
  map.set(key, (map.get(key) || 0) + amount);
}

export function maxEntry(map) {
  let best = null;
  for (const [key, value] of map) {
    if (!best || value > best[1]) best = [key, value];
  }
  return best;
}

export function listName(id) {
  const current = state.snapshot?.lists.find(x => x.id === id);
  if (current) return current.name;
  const deleted = state.snapshot?.deletedLists?.find(x => x.id === id);
  return deleted ? `${deleted.name} (deleted)` : `Deleted list #${id} (name unavailable)`;
}

// TaskList normally runs on the same host at port 8711; TaskListStats:TaskListUrl in appsettings.json overrides that.
function taskListOrigin() {
  const configured = (state.snapshot?.taskListUrl || '').replace(/\/+$/, '');
  return configured || `${location.protocol}//${location.hostname}:8711`;
}
function taskUrl(item) {
  return `${taskListOrigin()}/task/${encodeURIComponent(item.universalId)}`;
}
export function taskLink(item, label = `#${item.displayId}`) {
  const a = el('a', 'task-id-link');
  a.href = taskUrl(item);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = label;
  a.title = `Open ${listName(item.listId)} task #${item.displayId} in a new tab`;
  return a;
}

export function normalizeSnapshot(raw) {
  raw.lists = raw.lists ?? [];
  raw.deletedLists = raw.deletedLists ?? [];
  raw.events = raw.events ?? [];
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

export function isAllListScope() {
  return state.selectedListIds.size === 0;
}

export function selectedListNames() {
  return [...state.selectedListIds]
    .map(id => listName(id))
    .sort((a, b) => a.localeCompare(b));
}

export function scopedItems() {
  if (!state.snapshot) return [];
  if (isAllListScope()) return state.snapshot.items;
  return state.snapshot.items.filter(item => state.selectedListIds.has(item.listId));
}

export function allValidYears(items = scopedItems()) {
  const years = new Set();
  for (const item of items) {
    for (const d of [item.createdDate, item.completedDate, item.cancelledDate, item.reopenedDate]) {
      if (d) years.add(d.getFullYear());
    }
  }
  return [...years].sort((a, b) => a - b);
}

function makeStatCard(label, value, sub = '', kind = '') {
  const card = el('div');
  card.className = `stat-card${kind ? ` ${kind}` : ''}`;
  const l = document.createElement('div'); l.className = 'label'; l.textContent = label;
  const v = document.createElement('div'); v.className = 'value'; v.textContent = value;
  card.append(l, v);
  if (sub) { const s = document.createElement('div'); s.className = 'sub'; s.textContent = sub; card.append(s); }
  return card;
}

export function renderCards(container, cards) {
  container.replaceChildren(...cards.map(c => makeStatCard(c.label, c.value, c.sub || '', c.kind || '')));
}

export function renderMetricList(container, rows) {
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

/** Remembered sorts by table id, so a table drawn again keeps its order. */
const tableSorts = new Map();

/** What a cell sorts by: numbers as numbers (commas, %, and units after them are ignored), m/d/yyyy dates by date, dashes last. */
function sortValueOf(value) {
  if (value == null || typeof value === 'number') return value ?? null;
  const text = (value instanceof Node ? value.textContent : String(value)).trim();
  if (!text || text === '—' || text === '-') return null;
  const date = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (date) return Number(date[3]) * 10000 + Number(date[1]) * 100 + Number(date[2]);
  const number = /^([+−-])?(\d[\d,]*(?:\.\d+)?)/.exec(text.replace(/^#/, ''));
  if (number) return (number[1] === '−' || number[1] === '-' ? -1 : 1) * Number(number[2].replace(/,/g, ''));
  return text.toLowerCase();
}

/** A sorted copy, like SpendTracker's: stable, numbers before text, and empty values last in both directions. */
function sortRows(rows, index, direction) {
  const keyed = rows.map((row, position) => ({ row, position, value: sortValueOf(row[index]) }));
  keyed.sort((a, b) => {
    if (a.value == null || b.value == null) return (a.value == null) - (b.value == null) || a.position - b.position;
    const kindA = typeof a.value === 'number' ? 0 : 1;
    const kindB = typeof b.value === 'number' ? 0 : 1;
    const order = kindA - kindB || (kindA === 0 ? a.value - b.value : String(a.value).localeCompare(String(b.value), undefined, { numeric: true }));
    return order * direction || a.position - b.position;
  });
  return keyed.map(entry => entry.row);
}

/** Tables sort by a column when its heading is clicked (or Enter/Space): ascending, descending, then back to the original order, like SpendTracker. */
export function setTable(table, headers, rows, numericColumns = []) {
  const saved = table.id ? tableSorts.get(table.id) : table.sortState;
  const sort = saved && saved.index < headers.length ? saved : null;
  const shown = sort && rows.length > 1 ? sortRows(rows, sort.index, sort.direction) : rows;
  table.replaceChildren();
  const thead = el('thead');
  const trh = el('tr');
  headers.forEach((header, i) => {
    const th = el('th');
    if (numericColumns.includes(i)) th.className = 'num';
    th.textContent = header;
    if (header && rows.length > 1) {
      th.classList.add('sortable');
      th.tabIndex = 0;
      th.setAttribute('aria-sort', sort?.index === i ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none');
      const resort = () => {
        const next = sort?.index !== i ? { index: i, direction: 1 } : sort.direction === 1 ? { index: i, direction: -1 } : null;
        if (table.id) { if (next) tableSorts.set(table.id, next); else tableSorts.delete(table.id); } else table.sortState = next;
        setTable(table, headers, rows, numericColumns);
        table.querySelectorAll('th')[i]?.focus();
      };
      th.addEventListener('click', resort);
      th.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); resort(); }
      });
    }
    trh.append(th);
  });
  thead.append(trh);

  const tbody = el('tbody');
  for (const row of shown) {
    const tr = el('tr');
    row.forEach((value, i) => {
      const td = el('td');
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
    const tr = el('tr');
    const td = el('td');
    td.colSpan = headers.length;
    td.textContent = 'No data.';
    tr.append(td);
    tbody.append(tr);
  }
  table.append(thead, tbody);
}
