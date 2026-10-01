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

function dateInputStart(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateInputEnd(value) {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inDateRange(date, fromValue, toValue) {
  if (!date) return false;
  const from = dateInputStart(fromValue);
  const to = dateInputEnd(toValue);
  return (!from || date >= from) && (!to || date <= to);
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

  const from = $('#historyFrom').value;
  const to = $('#historyTo').value;
  const type = $('#historyEventType').value;
  const query = $('#historyQuery').value.trim().toLowerCase();
  const ascending = $('#historyOrder').value === 'oldest';

  let events = scopedRecordedEvents().filter(event => event.eventDate && inDateRange(event.eventDate, from, to));
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
    formatDateTime(event.eventDate), event.eventType, listName(event.listId), eventTaskNode(event), event.title,
    eventTransition(event), eventSourceLabel(event)
  ]));
}

function populateCompareLists() {
  const available = state.snapshot?.lists.filter(list => isAllListScope() || state.selectedListIds.has(list.id)) ?? [];
  for (const id of ['compareListA', 'compareListB']) {
    const select = $(`#${id}`);
    const previous = select.value;
    select.replaceChildren();
    const all = document.createElement('option'); all.value = 'all'; all.textContent = 'All selected lists'; select.append(all);
    for (const list of available) {
      const option = document.createElement('option'); option.value = String(list.id); option.textContent = list.name; select.append(option);
    }
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  }
  if ($('#compareListB').value === 'all' && available.length > 1) $('#compareListB').value = String(available[1].id);
  if ($('#compareListA').value === 'all' && available.length) $('#compareListA').value = String(available[0].id);
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

function renderCompare() {
  const table = $('#compareTable');
  if (!eventLogReady()) {
    setAnalysisEmpty(table, 'TaskList 1.5 event log is required for Compare.');
    return;
  }
  populateCompareLists();
  const mode = $('#compareMode').value;
  $('#compareListControls').hidden = mode !== 'lists';
  $('#comparePeriodControls').hidden = mode !== 'periods';

  let aEvents, bEvents, aLabel, bLabel, aItems = null, bItems = null;
  if (mode === 'lists') {
    const a = $('#compareListA').value;
    const b = $('#compareListB').value;
    aEvents = compareEventsForList(a);
    bEvents = compareEventsForList(b);
    aItems = compareItemsForList(a);
    bItems = compareItemsForList(b);
    aLabel = a === 'all' ? 'All selected lists' : listName(Number(a));
    bLabel = b === 'all' ? 'All selected lists' : listName(Number(b));
  } else {
    const all = scopedRecordedEvents();
    aEvents = all.filter(event => inDateRange(event.eventDate, $('#compareAFrom').value, $('#compareATo').value));
    bEvents = all.filter(event => inDateRange(event.eventDate, $('#compareBFrom').value, $('#compareBTo').value));
    aLabel = 'Period A';
    bLabel = 'Period B';
  }

  const a = compareEventCounts(aEvents);
  const b = compareEventCounts(bEvents);
  const rows = [
    ['Recorded events', a.total, b.total, a.total - b.total],
    ['Unique tasks touched', a.unique, b.unique, a.unique - b.unique],
    ['Created', a.Created, b.Created, a.Created - b.Created],
    ['Completed transitions', a.Completed, b.Completed, a.Completed - b.Completed],
    ['Cancelled transitions', a.Cancelled, b.Cancelled, a.Cancelled - b.Cancelled],
    ['Reopened transitions', a.Reopened, b.Reopened, a.Reopened - b.Reopened],
    ['Net recorded flow', a.net, b.net, a.net - b.net]
  ];
  if (aItems && bItems) {
    rows.push(
      ['Current items', aItems.length, bItems.length, aItems.length - bItems.length],
      ['Currently Open', aItems.filter(x => x.status === 'Open').length, bItems.filter(x => x.status === 'Open').length, aItems.filter(x => x.status === 'Open').length - bItems.filter(x => x.status === 'Open').length],
      ['Currently Done', aItems.filter(x => x.status === 'Done').length, bItems.filter(x => x.status === 'Done').length, aItems.filter(x => x.status === 'Done').length - bItems.filter(x => x.status === 'Done').length],
      ['Currently Cancelled', aItems.filter(x => x.status === 'Cancelled').length, bItems.filter(x => x.status === 'Cancelled').length, aItems.filter(x => x.status === 'Cancelled').length - bItems.filter(x => x.status === 'Cancelled').length]
    );
  }
  setTable(table, ['Metric', aLabel, bLabel, 'A − B'], rows, [1, 2, 3]);
}

function renderSearchExplorer() {
  const table = $('#searchExplorerTable');
  const summary = $('#searchExplorerSummary');
  const dataset = $('#explorerDataset').value;
  const query = $('#explorerQuery').value.trim().toLowerCase();
  const from = $('#explorerFrom').value;
  const to = $('#explorerTo').value;
  $('#explorerTaskFilters').hidden = dataset !== 'tasks';
  $('#explorerEventFilters').hidden = dataset !== 'events';

  if (dataset === 'tasks') {
    const status = $('#explorerStatus').value;
    const minDepth = Math.max(0, Number($('#explorerMinDepth').value) || 0);
    let items = scopedItems().filter(item => {
      if (status !== 'all' && item.status !== status) return false;
      if (item.depth < minDepth) return false;
      if ((from || to) && !inDateRange(item.createdDate, from, to)) return false;
      if (!query) return true;
      return item.title.toLowerCase().includes(query) || item.description.toLowerCase().includes(query) ||
        item.displayId.toLowerCase().includes(query) || String(item.universalId).includes(query);
    }).sort((a, b) => b.universalId - a.universalId);
    const total = items.length;
    items = items.slice(0, 500);
    summary.textContent = `${numberFmt.format(total)} matching current tasks${total > items.length ? ` • showing ${items.length}` : ''}`;
    setTable(table, ['List', 'ID', 'Task', 'Status', 'Depth', 'Created'], items.map(item => [
      listName(item.listId), taskLink(item), item.title, item.status, item.depth, formatDate(item.createdDate)
    ]), [4]);
    return;
  }

  if (!eventLogReady()) {
    summary.textContent = 'Event log unavailable.';
    setAnalysisEmpty(table, 'Run TaskList 1.5 once to enable event searching.');
    return;
  }
  const type = $('#explorerEventType').value;
  let events = scopedRecordedEvents().filter(event => {
    if (type !== 'all' && event.eventType !== type) return false;
    if ((from || to) && !inDateRange(event.eventDate, from, to)) return false;
    if (!query) return true;
    return event.title.toLowerCase().includes(query) || event.displayId.toLowerCase().includes(query) ||
      String(event.universalId).includes(query) || listName(event.listId).toLowerCase().includes(query);
  }).sort((a, b) => b.eventDate - a.eventDate || b.id - a.id);
  const total = events.length;
  events = events.slice(0, 500);
  summary.textContent = `${numberFmt.format(total)} matching events${total > events.length ? ` • showing ${events.length}` : ''}`;
  setTable(table, ['When', 'Event', 'List', 'ID', 'Task', 'Transition', 'Source'], events.map(event => [
    formatDateTime(event.eventDate), event.eventType, listName(event.listId), eventTaskNode(event), event.title,
    eventTransition(event), eventSourceLabel(event)
  ]));
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
    { label: 'Average events / session', value: oneDecimal.format(average(sessions.map(s => s.events.length)) || 0) },
    { label: 'Median session span', value: formatDuration(median(durations) || 0) },
    { label: 'Longest session span', value: formatDuration(Math.max(0, ...durations)) }
  ]);

  const rows = [...sessions].sort((a, b) => b.start - a.start).slice(0, 100).map(session => {
    const created = session.events.filter(e => e.eventType === 'Created').length;
    const closed = session.events.filter(e => e.eventType === 'Completed' || e.eventType === 'Cancelled').length;
    const reopened = session.events.filter(e => e.eventType === 'Reopened').length;
    return [formatDateTime(session.start), formatDateTime(session.end), formatDuration(session.end - session.start), session.events.length, created, closed, reopened];
  });
  setTable(table, ['Start', 'End', 'Span', 'Events', 'Created', 'Closed', 'Reopened'], rows, [3,4,5,6]);
}

function renderFlow() {
  const table = $('#flowTransitionsTable');
  const reopenTable = $('#flowReopenTable');
  const items = scopedItems();
  renderCards($('#flowCards'), [
    { label: 'Currently Open', value: numberFmt.format(items.filter(x => x.status === 'Open').length) },
    { label: 'Currently Done', value: numberFmt.format(items.filter(x => x.status === 'Done').length) },
    { label: 'Currently Cancelled', value: numberFmt.format(items.filter(x => x.status === 'Cancelled').length) },
    { label: 'Current items', value: numberFmt.format(items.length) }
  ]);
  if (!eventLogReady()) {
    setAnalysisEmpty(table, 'TaskList 1.5 event log is required for transition flow.');
    setAnalysisEmpty(reopenTable, 'No event log available.');
    return;
  }

  const transitions = new Map();
  for (const event of scopedRecordedEvents()) {
    if (!event.fromStatus || !event.toStatus || event.fromStatus === event.toStatus) continue;
    const key = `${event.fromStatus}|${event.toStatus}`;
    if (!transitions.has(key)) transitions.set(key, { total: 0, live: 0, legacy: 0 });
    const entry = transitions.get(key); entry.total++; entry[event.source === 'live' ? 'live' : 'legacy']++;
  }
  const rows = [...transitions.entries()].map(([key, counts]) => {
    const [from, to] = key.split('|');
    return [from, to, counts.total, counts.live, counts.legacy];
  }).sort((a, b) => b[2] - a[2]);
  setTable(table, ['From', 'To', 'Transitions', 'Live', 'Legacy backfill'], rows, [2,3,4]);

  const reopenCounts = new Map();
  for (const event of scopedRecordedEvents()) if (event.eventType === 'Reopened') increment(reopenCounts, event.universalId);
  const reopenRows = [...reopenCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,50).map(([uid,count]) => {
    const item = state.snapshot.items.find(x => x.universalId === uid);
    const latest = [...scopedRecordedEvents()].reverse().find(e => e.universalId === uid);
    return [item ? listName(item.listId) : latest ? listName(latest.listId) : '—', item ? taskLink(item) : latest ? eventTaskNode(latest) : `UID ${uid}`, item?.title ?? latest?.title ?? 'Deleted task', count];
  });
  setTable(reopenTable, ['List', 'ID', 'Task', 'Recorded reopens'], reopenRows, [3]);
}

function insightRow(title, text) {
  const row = document.createElement('div'); row.className = 'insight-row';
  const heading = document.createElement('strong'); heading.textContent = title;
  const body = document.createElement('span'); body.textContent = text;
  row.append(heading, body); return row;
}

function renderInsights() {
  const container = $('#insightsList');
  const items = scopedItems();
  const events = eventLogReady() ? scopedRecordedEvents().filter(e => e.eventDate) : [];
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d60 = new Date(now.getTime() - 60 * 86_400_000);
  const recent = events.filter(e => e.eventDate >= d30);
  const previous = events.filter(e => e.eventDate >= d60 && e.eventDate < d30);
  const recentCreated = recent.filter(e => e.eventType === 'Created').length;
  const prevCreated = previous.filter(e => e.eventType === 'Created').length;
  const recentClosed = recent.filter(e => e.eventType === 'Completed' || e.eventType === 'Cancelled').length;
  const staleOpen = items.filter(item => item.status === 'Open' && item.createdDate && now - item.createdDate >= 30 * 86_400_000).length;

  const weekday = new Map();
  const hour = new Map();
  for (const event of events) {
    increment(weekday, event.eventDate.getDay());
    if (hasConfirmedClockTime(event.eventAt)) increment(hour, event.eventDate.getHours());
  }
  const busiestDay = maxEntry(weekday);
  const busiestHour = maxEntry(hour);
  const listCounts = new Map();
  for (const item of items) increment(listCounts, item.listId);
  const topList = maxEntry(listCounts);
  const live = events.filter(e => e.source === 'live').length;
  const legacy = events.filter(e => e.source !== 'live').length;

  const rows = [
    insightRow('Current backlog', `${numberFmt.format(items.filter(x => x.status === 'Open').length)} of ${numberFmt.format(items.length)} current items are Open (${percent(items.filter(x => x.status === 'Open').length, items.length)}).`),
    insightRow('Open-task age', `${numberFmt.format(staleOpen)} currently Open tasks are at least 30 days old.`)
  ];
  if (eventLogReady()) {
    const delta = recentCreated - prevCreated;
    rows.push(
      insightRow('Recent creation volume', `${numberFmt.format(recentCreated)} creations were recorded in the last 30 days, ${Math.abs(delta)} ${delta >= 0 ? 'more' : 'fewer'} than the preceding 30 days.`),
      insightRow('Recent closures', `${numberFmt.format(recentClosed)} completion/cancellation transitions were recorded in the last 30 days.`),
      insightRow('Event-log coverage', `${numberFmt.format(live)} live transitions and ${numberFmt.format(legacy)} legacy-backfilled events are in the selected scope.`)
    );
    if (busiestDay) rows.push(insightRow('Most active recorded weekday', `${WEEKDAYS[busiestDay[0]]} has ${numberFmt.format(busiestDay[1])} recorded events.`));
    if (busiestHour) rows.push(insightRow('Most active recorded hour', `${formatHour(busiestHour[0])} has ${numberFmt.format(busiestHour[1])} recorded events with confirmed clock times.`));
  } else {
    rows.push(insightRow('Event log', 'Run TaskList 1.5 once to enable transition-based insights.'));
  }
  if (topList) rows.push(insightRow('Largest current list in scope', `${listName(topList[0])} contains ${numberFmt.format(topList[1])} current items.`));
  container.replaceChildren(...rows);
}

function milestoneEventRows(events, eventType, thresholds) {
  const typed = events.filter(event => event.eventType === eventType).sort((a,b)=>a.eventDate-b.eventDate || a.id-b.id);
  const rows = [];
  for (const threshold of thresholds) {
    if (typed.length < threshold) continue;
    const event = typed[threshold - 1];
    rows.push([`${numberFmt.format(threshold)}th ${eventType.toLowerCase()}`, formatDateTime(event.eventDate), listName(event.listId), eventTaskNode(event), event.title, eventSourceLabel(event)]);
  }
  return rows;
}

function renderMilestones() {
  const table = $('#milestonesTable');
  const events = eventLogReady() ? scopedRecordedEvents().filter(e => e.eventDate).sort((a,b)=>a.eventDate-b.eventDate || a.id-b.id) : [];
  renderCards($('#milestoneCards'), [
    { label: 'Highest Universal ID', value: numberFmt.format(state.snapshot?.highestUniversalId || 0) },
    { label: 'Recorded events in scope', value: numberFmt.format(events.length) },
    { label: 'Live events', value: numberFmt.format(events.filter(e => e.source === 'live').length) },
    { label: 'Legacy-backfilled events', value: numberFmt.format(events.filter(e => e.source !== 'live').length) }
  ]);
  if (!eventLogReady()) {
    setAnalysisEmpty(table, 'TaskList 1.5 event log is required for recorded milestones.');
    return;
  }
  const thresholds = [1, 100, 500, 1000, 2000, 3000, 5000, 10000];
  let rows = [
    ...milestoneEventRows(events, 'Created', thresholds),
    ...milestoneEventRows(events, 'Completed', thresholds),
    ...milestoneEventRows(events, 'Cancelled', [1,100,500,1000]),
    ...milestoneEventRows(events, 'Reopened', [1,100,500,1000])
  ];
  for (const threshold of thresholds) {
    if (events.length < threshold) continue;
    const event = events[threshold - 1];
    rows.push([`${numberFmt.format(threshold)}th recorded event`, formatDateTime(event.eventDate), listName(event.listId), eventTaskNode(event), `${event.eventType}: ${event.title}`, eventSourceLabel(event)]);
  }
  rows.sort((a,b)=>parseDate(a[1])-parseDate(b[1]));
  setTable(table, ['Milestone', 'When', 'List', 'ID', 'Task / Event', 'Source'], rows);
}

function initializeAnalysisTabs() {
  const now = new Date();
  const today = localDayKey(now);
  const ago30 = localDayKey(new Date(now.getTime() - 29 * 86_400_000));
  const ago31 = localDayKey(new Date(now.getTime() - 30 * 86_400_000));
  const ago60 = localDayKey(new Date(now.getTime() - 59 * 86_400_000));
  if (!$('#historyFrom').value) $('#historyFrom').value = ago30;
  if (!$('#historyTo').value) $('#historyTo').value = today;
  if (!$('#compareAFrom').value) $('#compareAFrom').value = ago30;
  if (!$('#compareATo').value) $('#compareATo').value = today;
  if (!$('#compareBFrom').value) $('#compareBFrom').value = ago60;
  if (!$('#compareBTo').value) $('#compareBTo').value = ago31;

  const renderMap = {
    history: renderHistoryExplorer,
    compare: renderCompare,
    explorer: renderSearchExplorer,
    sessions: renderActivitySessions
  };
  for (const [prefix, render] of Object.entries(renderMap)) {
    document.querySelectorAll(`[id^="${prefix}"]`).forEach(control => {
      if (!['INPUT','SELECT','BUTTON'].includes(control.tagName)) return;
      control.addEventListener(control.tagName === 'INPUT' && control.type === 'text' ? 'input' : 'change', () => {
        if (state.activeTab === (prefix === 'explorer' ? 'explorer' : prefix)) render();
      });
    });
  }
  $('#compareMode').addEventListener('change', renderCompare);
  $('#sessionGap').addEventListener('change', renderActivitySessions);
}
