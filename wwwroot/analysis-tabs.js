'use strict';

const ANALYSIS_EVENT_TYPES = ['Created', 'Completed', 'Cancelled', 'Reopened'];

function allRecordedEvents() {
  const events = state.snapshot?.events ?? [];
  for (const event of events) {
    if (!Object.prototype.hasOwnProperty.call(event, 'eventDate'))
      event.eventDate = parseDate(event.eventAt);
  }
  return events;
}

function scopedRecordedEvents() {
  const events = allRecordedEvents();
  if (isAllListScope()) return events;
  return events.filter(event => state.selectedListIds.has(event.listId));
}

function eventLogReady() {
  return Boolean(state.snapshot?.eventLogAvailable);
}

function currentItemForEvent(event) {
  return state.snapshot?.items.find(item => item.universalId === event.universalId) ?? null;
}

function eventTaskNode(event) {
  const item = currentItemForEvent(event);
  if (item) return taskLink(item, `#${event.displayId}`);
  const span = document.createElement('span');
  span.textContent = `#${event.displayId}`;
  span.title = 'This task is no longer present in the current TaskList snapshot.';
  return span;
}

function eventTransition(event) {
  if (!event.fromStatus && !event.toStatus) return '—';
  return `${event.fromStatus ?? '—'} → ${event.toStatus ?? '—'}`;
}

function eventSourceLabel(event) {
  return event.source === 'live' ? 'Recorded live' : 'Legacy backfill';
}

function parseAnalysisDate(value) {
  const match = /^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\s*$/.exec(value);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  let year;
  if (!match[3]) year = new Date().getFullYear();
  else {
    year = Number(match[3]);
    if (match[3].length === 2) year += 2000;
  }

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return null;
  return date;
}

function parseOptionalAnalysisDate(value, endOfDay = false) {
  const text = value.trim();
  if (!text) return { specified: false, date: null };
  const date = parseAnalysisDate(text);
  if (!date) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return { specified: true, date };
}

function readAnalysisRange(fromValue, toValue) {
  const from = parseOptionalAnalysisDate(fromValue, false);
  const to = parseOptionalAnalysisDate(toValue, true);
  if (from === null || to === null)
    return { error: 'Use m/d, m/d/yy, or m/d/yyyy for dates.' };
  if (from.specified && to.specified && from.date > to.date)
    return { error: 'Start date must be on or before End date.' };
  return { from: from.date, to: to.date, error: null };
}

function inDateRange(date, range) {
  if (!date || range.error) return false;
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

function formatAnalysisInputDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
}

function setAnalysisEmpty(table, message) {
  setTable(table, ['Message'], [[message]]);
}

function renderHistoryExplorer() {
  const table = $('#historyExplorerTable');
  const summary = $('#historyExplorerSummary');
  if (!eventLogReady()) {
    summary.textContent = 'TaskList 1.5 event log is not available in this database yet.';
    setAnalysisEmpty(table, 'Run the TaskList 1.5 server once to create and backfill the event log.');
    return;
  }

  const range = readAnalysisRange($('#historyFrom').value, $('#historyTo').value);
  if (range.error) {
    summary.textContent = range.error;
    setAnalysisEmpty(table, range.error);
    return;
  }

  const type = $('#historyEventType').value;
  const query = $('#historyQuery').value.trim().toLowerCase();
  const ascending = $('#historyOrder').value === 'oldest';

  let events = scopedRecordedEvents().filter(event => event.eventDate && inDateRange(event.eventDate, range));
  if (type !== 'all') events = events.filter(event => event.eventType === type);
  if (query) {
    events = events.filter(event =>
      event.title.toLowerCase().includes(query) ||
      event.displayId.toLowerCase().includes(query) ||
      String(event.universalId).includes(query) ||
      listName(event.listId).toLowerCase().includes(query));
  }
  events.sort((a, b) => ascending ? (a.eventDate - b.eventDate || a.id - b.id) : (b.eventDate - a.eventDate || b.id - a.id));

  const total = events.length;
  const shown = events.slice(0, 500);
  summary.textContent = `${numberFmt.format(total)} matching recorded events${total > shown.length ? ` • showing first ${numberFmt.format(shown.length)}` : ''}`;
  setTable(table, ['When', 'Event', 'List', 'ID', 'Task', 'Transition', 'Source'], shown.map(event => [
    hasConfirmedClockTime(event.eventAt) ? formatDateTime(event.eventDate) : formatDate(event.eventDate),
    event.eventType,
    listName(event.listId),
    eventTaskNode(event),
    event.title,
    eventTransition(event),
    eventSourceLabel(event)
  ]));
}

function populateCompareLists() {
  const available = state.snapshot?.lists.filter(list => isAllListScope() || state.selectedListIds.has(list.id)) ?? [];
  const options = [...available.map(list => [String(list.id), list.name]), ['all', 'All selected lists']];
  const validValues = new Set(options.map(([value]) => String(value)));
  const aPrevious = $('#compareListA').value;
  const bPrevious = $('#compareListB').value;
  const aPreferred = validValues.has(aPrevious) && aPrevious ? aPrevious : (available[0] ? String(available[0].id) : 'all');
  const bPreferred = validValues.has(bPrevious) && bPrevious ? bPrevious : (available[1] ? String(available[1].id) : 'all');
  setSingleSelectOptions('compareListA', options, aPreferred);
  setSingleSelectOptions('compareListB', options, bPreferred);
}

function compareEventsForList(value) {
  const events = scopedRecordedEvents();
  return value === 'all' ? events : events.filter(event => event.listId === Number(value));
}

function compareItemsForList(value) {
  const items = scopedItems();
  return value === 'all' ? items : items.filter(item => item.listId === Number(value));
}

function compareEventCounts(events) {
  const counts = Object.fromEntries(ANALYSIS_EVENT_TYPES.map(type => [type, 0]));
  for (const event of events) if (Object.hasOwn(counts, event.eventType)) counts[event.eventType]++;
  return {
    ...counts,
    total: events.length,
    unique: new Set(events.map(event => event.universalId)).size,
    net: counts.Created + counts.Reopened - counts.Completed - counts.Cancelled
  };
}

function compareMetricRows(counts, items = null) {
  const rows = [
    ['Recorded events', numberFmt.format(counts.total)],
    ['Unique tasks touched', numberFmt.format(counts.unique)],
    ['Created', numberFmt.format(counts.Created)],
    ['Completed transitions', numberFmt.format(counts.Completed)],
    ['Cancelled transitions', numberFmt.format(counts.Cancelled)],
    ['Reopened transitions', numberFmt.format(counts.Reopened)],
    ['Net recorded flow', counts.net > 0 ? `+${numberFmt.format(counts.net)}` : numberFmt.format(counts.net)]
  ];
  if (items) {
    rows.push(
      ['Current items', numberFmt.format(items.length)],
      ['Currently Open', numberFmt.format(items.filter(x => x.status === 'Open').length)],
      ['Currently Done', numberFmt.format(items.filter(x => x.status === 'Done').length)],
      ['Currently Cancelled', numberFmt.format(items.filter(x => x.status === 'Cancelled').length)]
    );
  }
  return rows;
}

function renderCompare() {
  const table = $('#compareTable');
  const summary = $('#compareSummary');
  if (!eventLogReady()) {
    summary.textContent = 'TaskList 1.5 event log is required for Compare.';
    renderMetricList($('#compareAMetrics'), []);
    renderMetricList($('#compareBMetrics'), []);
    setAnalysisEmpty(table, 'Run TaskList 1.5 once to enable recorded comparisons.');
    return;
  }

  populateCompareLists();
  const mode = $('#compareMode').value;
  $('#compareListControls').hidden = mode !== 'lists';
  $('#comparePeriodControls').hidden = mode !== 'periods';

  let aEvents, bEvents, aLabel, bLabel, aItems = null, bItems = null;
  if (mode === 'lists') {
    const aValue = $('#compareListA').value;
    const bValue = $('#compareListB').value;
    aEvents = compareEventsForList(aValue);
    bEvents = compareEventsForList(bValue);
    aItems = compareItemsForList(aValue);
    bItems = compareItemsForList(bValue);
    aLabel = aValue === 'all' ? 'All selected lists' : listName(Number(aValue));
    bLabel = bValue === 'all' ? 'All selected lists' : listName(Number(bValue));
    summary.textContent = `${aLabel} compared with ${bLabel}.`;
  } else {
    const rangeA = readAnalysisRange($('#compareAFrom').value, $('#compareATo').value);
    const rangeB = readAnalysisRange($('#compareBFrom').value, $('#compareBTo').value);
    const error = rangeA.error || rangeB.error;
    if (error) {
      summary.textContent = error;
      renderMetricList($('#compareAMetrics'), []);
      renderMetricList($('#compareBMetrics'), []);
      setAnalysisEmpty(table, error);
      return;
    }
    const all = scopedRecordedEvents();
    aEvents = all.filter(event => inDateRange(event.eventDate, rangeA));
    bEvents = all.filter(event => inDateRange(event.eventDate, rangeB));
    aLabel = 'Period A';
    bLabel = 'Period B';
    summary.textContent = 'Recorded event activity in Period A compared with Period B.';
  }

  const a = compareEventCounts(aEvents);
  const b = compareEventCounts(bEvents);
  $('#compareALegend').textContent = aLabel;
  $('#compareBLegend').textContent = bLabel;
  renderMetricList($('#compareAMetrics'), compareMetricRows(a, aItems));
  renderMetricList($('#compareBMetrics'), compareMetricRows(b, bItems));

  const differences = [
    ['Recorded events', a.total - b.total],
    ['Unique tasks touched', a.unique - b.unique],
    ['Created', a.Created - b.Created],
    ['Completed transitions', a.Completed - b.Completed],
    ['Cancelled transitions', a.Cancelled - b.Cancelled],
    ['Reopened transitions', a.Reopened - b.Reopened],
    ['Net recorded flow', a.net - b.net]
  ];
  if (aItems && bItems) {
    differences.push(
      ['Current items', aItems.length - bItems.length],
      ['Currently Open', aItems.filter(x => x.status === 'Open').length - bItems.filter(x => x.status === 'Open').length],
      ['Currently Done', aItems.filter(x => x.status === 'Done').length - bItems.filter(x => x.status === 'Done').length],
      ['Currently Cancelled', aItems.filter(x => x.status === 'Cancelled').length - bItems.filter(x => x.status === 'Cancelled').length]
    );
  }
  setTable(table, ['Metric', 'A − B'], differences.map(([label, value]) => [
    label,
    value > 0 ? `+${numberFmt.format(value)}` : numberFmt.format(value)
  ]), [1]);
}

function inferSessions(events, gapMinutes) {
  const timed = events
    .filter(event => event.eventDate && hasConfirmedClockTime(event.eventAt))
    .sort((a, b) => a.eventDate - b.eventDate || a.id - b.id);
  const sessions = [];
  const gapMs = gapMinutes * 60_000;
  for (const event of timed) {
    const last = sessions.at(-1);
    if (!last || event.eventDate - last.end > gapMs) {
      sessions.push({ start: event.eventDate, end: event.eventDate, events: [event] });
    } else {
      last.end = event.eventDate;
      last.events.push(event);
    }
  }
  return sessions;
}

function formatSessionTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatSessionDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function ensureSessionEventsDialog() {
  let dialog = $('#sessionEventsDialog');
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.id = 'sessionEventsDialog';
  dialog.className = 'retro-dialog session-events-dialog';

  const form = document.createElement('form');
  form.method = 'dialog';
  form.className = 'dialog-window session-events-window';

  const title = document.createElement('div');
  title.id = 'sessionEventsTitle';
  title.className = 'dialog-title';
  title.textContent = 'Activity Session';

  const body = document.createElement('div');
  body.id = 'sessionEventsBody';
  body.className = 'dialog-body session-events-body';

  const buttons = document.createElement('div');
  buttons.className = 'dialog-buttons';
  const close = document.createElement('button');
  close.type = 'submit';
  close.textContent = 'OK';
  buttons.append(close);

  form.append(title, body, buttons);
  dialog.append(form);
  document.body.append(dialog);
  return dialog;
}

function makeSessionEventRow(event) {
  const row = document.createElement('div');
  row.className = 'session-event-row';

  const heading = document.createElement('div');
  heading.className = 'session-event-heading';

  const type = document.createElement('strong');
  type.textContent = event.eventType;

  const when = document.createElement('span');
  when.className = 'session-event-when';
  when.textContent = formatSessionTime(event.eventDate);

  heading.append(type, when);

  const task = document.createElement('div');
  task.className = 'session-event-task';

  const list = document.createElement('span');
  list.textContent = `${listName(event.listId)} • `;
  task.append(list, eventTaskNode(event));

  const title = document.createElement('span');
  title.textContent = ` • ${event.title}`;
  task.append(title);

  const meta = document.createElement('div');
  meta.className = 'session-event-meta';
  const transition = eventTransition(event);
  meta.textContent = `${transition !== '—' ? `${transition} • ` : ''}${eventSourceLabel(event)}`;

  row.append(heading, task, meta);
  return row;
}

function openSessionEvents(session) {
  const dialog = ensureSessionEventsDialog();
  const title = $('#sessionEventsTitle');
  const body = $('#sessionEventsBody');

  title.textContent = `Activity Session — ${formatSessionDate(session.start)}`;

  const summary = document.createElement('div');
  summary.className = 'session-dialog-summary';
  summary.textContent = `${formatSessionTime(session.start)} – ${formatSessionTime(session.end)} • ${formatDuration(session.end - session.start)} • ${numberFmt.format(session.events.length)} event${session.events.length === 1 ? '' : 's'}`;

  const list = document.createElement('div');
  list.className = 'session-event-list';
  const ordered = [...session.events].sort((a, b) => a.eventDate - b.eventDate || a.id - b.id);
  list.replaceChildren(...ordered.map(makeSessionEventRow));

  body.replaceChildren(summary, list);
  dialog.showModal();
}

function makeSessionRow(session) {
  const created = session.events.filter(event => event.eventType === 'Created').length;
  const completed = session.events.filter(event => event.eventType === 'Completed').length;
  const cancelled = session.events.filter(event => event.eventType === 'Cancelled').length;
  const reopened = session.events.filter(event => event.eventType === 'Reopened').length;

  const row = document.createElement('div');
  row.className = 'session-row';

  const heading = document.createElement('div');
  heading.className = 'session-heading';

  const date = document.createElement('strong');
  date.textContent = formatSessionDate(session.start);

  const times = document.createElement('span');
  times.className = 'session-when';
  times.textContent = `${formatSessionTime(session.start)} – ${formatSessionTime(session.end)}`;

  heading.append(date, times);

  const detail = document.createElement('div');
  detail.className = 'session-detail';

  const span = document.createElement('span');
  span.textContent = `${formatDuration(session.end - session.start)} • `;
  detail.append(span);

  const eventButton = document.createElement('button');
  eventButton.type = 'button';
  eventButton.className = 'session-event-count';
  eventButton.textContent = `${numberFmt.format(session.events.length)} event${session.events.length === 1 ? '' : 's'}`;
  eventButton.title = 'Open this session and view its recorded events in chronological order.';
  eventButton.addEventListener('click', () => openSessionEvents(session));
  detail.append(eventButton);

  const counts = document.createElement('span');
  counts.textContent = ` • ${created} created • ${completed} completed • ${cancelled} cancelled • ${reopened} reopened`;
  detail.append(counts);

  row.append(heading, detail);
  return row;
}

function renderActivitySessions() {
  const table = $('#sessionsTable');
  if (!eventLogReady()) {
    renderCards($('#sessionCards'), []);
    setAnalysisEmpty(table, 'TaskList 1.5 event log is required for Activity Sessions.');
    return;
  }

  const gap = Number($('#sessionGap').value) || 30;
  const sessions = inferSessions(scopedRecordedEvents(), gap);
  const durations = sessions.map(session => session.end - session.start);
  const multi = sessions.filter(session => session.events.length > 1);

  renderCards($('#sessionCards'), [
    { label: 'Inferred sessions', value: numberFmt.format(sessions.length), sub: `${gap}-minute gap threshold` },
    { label: 'Multi-event sessions', value: numberFmt.format(multi.length), sub: percent(multi.length, sessions.length) },
    { label: 'Average events / session', value: oneDecimal.format(average(sessions.map(session => session.events.length)) || 0) },
    { label: 'Median session span', value: formatDuration(median(durations) || 0) },
    { label: 'Longest session span', value: formatDuration(Math.max(0, ...durations)) }
  ]);

  const recent = [...sessions]
    .sort((a, b) => b.start - a.start)
    .slice(0, 100);

  setTable(table, ['Session'], recent.map(session => [makeSessionRow(session)]));
}

function ordinal(value) {
  const n = Number(value);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${numberFmt.format(n)}th`;
  switch (n % 10) {
    case 1: return `${numberFmt.format(n)}st`;
    case 2: return `${numberFmt.format(n)}nd`;
    case 3: return `${numberFmt.format(n)}rd`;
    default: return `${numberFmt.format(n)}th`;
  }
}

function milestoneLabel(threshold, noun) {
  if (threshold === 1) return `First ${noun}`;
  return `${ordinal(threshold)} ${noun}`;
}

function milestoneEventRecords(events, eventType, thresholds) {
  const typed = events.filter(event => event.eventType === eventType).sort((a,b)=>a.eventDate-b.eventDate || a.id-b.id);
  const records = [];
  for (const threshold of thresholds) {
    if (typed.length < threshold) continue;
    const event = typed[threshold - 1];
    records.push({ label: milestoneLabel(threshold, eventType.toLowerCase()), event });
  }
  return records;
}

function milestoneWhen(event) {
  return hasConfirmedClockTime(event.eventAt) ? formatDateTime(event.eventDate) : formatDate(event.eventDate);
}

function makeMilestoneRow(record) {
  const row = document.createElement('div');
  row.className = 'milestone-row';
  const heading = document.createElement('div');
  heading.className = 'milestone-heading';
  const name = document.createElement('strong');
  name.textContent = record.label;
  const when = document.createElement('span');
  when.className = 'milestone-when';
  when.textContent = milestoneWhen(record.event);
  heading.append(name, when);

  const detail = document.createElement('div');
  detail.className = 'milestone-detail';
  const list = document.createElement('span');
  list.textContent = `${listName(record.event.listId)} • `;
  detail.append(list, eventTaskNode(record.event));
  const tail = document.createElement('span');
  tail.textContent = ` • ${record.event.eventType}: ${record.event.title} • ${eventSourceLabel(record.event)}`;
  detail.append(tail);
  row.append(heading, detail);
  return row;
}

function renderMilestones() {
  const timeline = $('#milestonesTimeline');
  const events = eventLogReady() ? scopedRecordedEvents().filter(e => e.eventDate).sort((a,b)=>a.eventDate-b.eventDate || a.id-b.id) : [];
  renderCards($('#milestoneCards'), [
    { label: 'Highest Universal ID', value: numberFmt.format(state.snapshot?.highestUniversalId || 0) },
    { label: 'Recorded events in scope', value: numberFmt.format(events.length) },
    { label: 'Live events', value: numberFmt.format(events.filter(e => e.source === 'live').length) },
    { label: 'Legacy-backfilled events', value: numberFmt.format(events.filter(e => e.source !== 'live').length) }
  ]);
  if (!eventLogReady()) {
    const empty = document.createElement('div');
    empty.className = 'milestone-empty';
    empty.textContent = 'TaskList 1.5 event log is required for recorded milestones.';
    timeline.replaceChildren(empty);
    return;
  }

  const thresholds = [1, 100, 500, 1000, 2000, 3000, 5000, 10000];
  const records = [
    ...milestoneEventRecords(events, 'Created', thresholds),
    ...milestoneEventRecords(events, 'Completed', thresholds),
    ...milestoneEventRecords(events, 'Cancelled', [1,100,500,1000]),
    ...milestoneEventRecords(events, 'Reopened', [1,100,500,1000])
  ];
  for (const threshold of thresholds) {
    if (events.length < threshold) continue;
    records.push({ label: milestoneLabel(threshold, 'recorded event'), event: events[threshold - 1] });
  }
  records.sort((a, b) => a.event.eventDate - b.event.eventDate || a.event.id - b.event.id);
  timeline.replaceChildren(...records.map(makeMilestoneRow));
}

function initializeAnalysisTabs() {
  const now = new Date();
  const today = formatAnalysisInputDate(now);
  const ago30 = formatAnalysisInputDate(new Date(now.getTime() - 29 * 86_400_000));
  const ago31 = formatAnalysisInputDate(new Date(now.getTime() - 30 * 86_400_000));
  const ago60 = formatAnalysisInputDate(new Date(now.getTime() - 59 * 86_400_000));
  if (!$('#historyFrom').value) $('#historyFrom').value = ago30;
  if (!$('#historyTo').value) $('#historyTo').value = today;
  if (!$('#compareAFrom').value) $('#compareAFrom').value = ago30;
  if (!$('#compareATo').value) $('#compareATo').value = today;
  if (!$('#compareBFrom').value) $('#compareBFrom').value = ago60;
  if (!$('#compareBTo').value) $('#compareBTo').value = ago31;

  $('#historyQuery').addEventListener('input', () => { if (state.activeTab === 'history') renderHistoryExplorer(); });
  for (const id of ['historyFrom', 'historyTo', 'historyEventType', 'historyOrder'])
    $(`#${id}`).addEventListener('change', () => { if (state.activeTab === 'history') renderHistoryExplorer(); });

  for (const id of ['compareMode', 'compareListA', 'compareListB', 'compareAFrom', 'compareATo', 'compareBFrom', 'compareBTo'])
    $(`#${id}`).addEventListener('change', () => { if (state.activeTab === 'compare') renderCompare(); });

  $('#sessionGap').addEventListener('change', () => { if (state.activeTab === 'sessions') renderActivitySessions(); });
}
