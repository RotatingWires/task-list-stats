'use strict';

const MILESTONE_EVENT_BASE_THRESHOLDS = [1, 100, 500, 1000, 2000, 3000, 5000, 10000];
const MILESTONE_UID_BASE_THRESHOLDS = [1, 100, 500, 1000, 2000, 2500, 3000, 5000, 10000];
const MILESTONE_LIST_BASE_THRESHOLDS = [100, 500, 1000, 2000, 5000];
const MILESTONE_YEAR_BASE_THRESHOLDS = [100, 500, 1000, 2000];
const MILESTONE_ICON_PATHS = {
  Created: 'M5 3h9l5 5v13H5z M14 3v5h5 M9 14h6 M12 11v6',
  Completed: 'M4 4h16v16H4z M8 12l3 3 5-6',
  Cancelled: 'M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0 M9 9l6 6 M15 9l-6 6',
  Reopened: 'M4 10a8 8 0 1 1 1 8 M4 10V4 M4 10h6',
  Deleted: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 10v7 M14 10v7',
  'Recorded events': 'M7 4h13 M7 8h13 M7 12h1 M3 4h.01 M3 8h.01 M3 12h.01 M21 17a5 5 0 1 1-10 0a5 5 0 1 1 10 0 M16 14v3l2 1',
  'Universal ID': 'M10 3L8 21 M16 3l-2 18 M4 9h17 M3 15h17'
};

function continuingMilestoneThresholds(baseThresholds, maximum) {
  const thresholds = [...baseThresholds];
  for (let threshold = baseThresholds.at(-1) + 500; threshold <= maximum; threshold += 500)
    thresholds.push(threshold);
  return thresholds;
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

function milestoneEventRecords(events, eventType, thresholds = null, labelPrefix = '', listId = null) {
  const typed = events.filter(event => event.eventType === eventType).sort((a,b)=>a.id-b.id);
  const activeThresholds = thresholds ?? continuingMilestoneThresholds(MILESTONE_EVENT_BASE_THRESHOLDS, typed.length);
  const records = [];
  for (const threshold of activeThresholds) {
    if (typed.length < threshold) continue;
    const event = typed[threshold - 1];
    const base = milestoneLabel(threshold, eventType.toLowerCase());
    records.push({ label: labelPrefix ? `${labelPrefix} — ${base}` : base, type: eventType, event,
      threshold, scope: listId === null ? 'global' : 'list', scopeValue: listId });
  }
  return records;
}

function milestoneUniversalIdRecords(events) {
  const createdByUid = new Map();
  let highestCreatedUid = 0;
  for (const event of events) {
    if (event.eventType !== 'Created') continue;
    const existing = createdByUid.get(event.universalId);
    if (!existing || event.id < existing.id) createdByUid.set(event.universalId, event);
    highestCreatedUid = Math.max(highestCreatedUid, event.universalId);
  }
  return continuingMilestoneThresholds(MILESTONE_UID_BASE_THRESHOLDS, highestCreatedUid)
    .map(threshold => {
      const event = createdByUid.get(threshold);
      return event ? { label: `Universal ID #${numberFmt.format(threshold)}`, type: 'Universal ID', event,
        threshold, scope: 'global', scopeValue: null } : null;
    })
    .filter(Boolean);
}

function milestonePerListRecords(events) {
  const records = [];
  const listIds = [...new Set(events.map(event => event.listId))].sort((a,b)=>listName(a).localeCompare(listName(b)));
  for (const listId of listIds) {
    const listEvents = events.filter(event => event.listId === listId);
    const prefix = listName(listId);
    const createdCount = listEvents.filter(event => event.eventType === 'Created').length;
    const completedCount = listEvents.filter(event => event.eventType === 'Completed').length;
    records.push(
      ...milestoneEventRecords(
        listEvents,
        'Created',
        continuingMilestoneThresholds(MILESTONE_LIST_BASE_THRESHOLDS, createdCount),
        prefix,
        listId
      ),
      ...milestoneEventRecords(
        listEvents,
        'Completed',
        continuingMilestoneThresholds(MILESTONE_LIST_BASE_THRESHOLDS, completedCount),
        prefix,
        listId
      )
    );
  }
  return records;
}

function milestoneEventYear(event) {
  if (!event.eventDate || !/^\d{4}-\d{2}-\d{2}(?=$|T)/.test(event.eventAt)) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(event.eventAt)
    ? Number(event.eventAt.slice(0, 4)) : event.eventDate.getUTCFullYear();
}

function milestoneYearRecords(events) {
  const records = [];
  const years = [...new Set(events.map(milestoneEventYear).filter(year => year !== null))].sort((a,b)=>a-b);
  for (const year of years) {
    const yearEvents = events.filter(event => milestoneEventYear(event) === year);
    for (const eventType of ['Created', 'Completed']) {
      const typed = yearEvents.filter(event => event.eventType === eventType).sort((a,b)=>a.id-b.id);
      if (!typed.length) continue;
      records.push({ label: `${year} — First ${eventType.toLowerCase()}`, type: eventType, event: typed[0],
        threshold: 1, scope: 'year', scopeValue: year });
      for (const threshold of continuingMilestoneThresholds(MILESTONE_YEAR_BASE_THRESHOLDS, typed.length)) {
        if (typed.length < threshold) continue;
        records.push({ label: `${year} — ${ordinal(threshold)} ${eventType.toLowerCase()}`, type: eventType, event: typed[threshold - 1],
          threshold, scope: 'year', scopeValue: year });
      }
    }
  }
  return records;
}

function milestoneWhen(event) {
  if (!event.eventDate) return 'Unknown date';
  return hasConfirmedClockTime(event.eventAt) ? formatDateTime(event.eventDate) : formatDate(event.eventDate);
}

function milestoneGroups(records, mode) {
  const groups = new Map();
  for (const record of records) {
    const date = record.event.eventDate;
    let key, label;
    switch (mode) {
      case 'year': key = date ? date.getFullYear() : 'unknown'; label = date ? String(key) : 'Unknown date'; break;
      case 'type': key = record.type; label = key; break;
      case 'list': key = record.event.listId; label = listName(key); break;
      default:
        key = date ? monthKey(date) : 'unknown';
        label = date ? date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Unknown date';
    }
    if (!groups.has(key)) groups.set(key, { key, label, records: [] });
    groups.get(key).records.push(record);
  }
  const ordered = [...groups.values()];
  if (mode === 'type') {
    const types = [...ANALYSIS_EVENT_TYPES, 'Recorded events', 'Universal ID'];
    ordered.sort((a, b) => types.indexOf(a.key) - types.indexOf(b.key));
  } else if (mode === 'list') {
    ordered.sort((a, b) => a.label.localeCompare(b.label) || a.key - b.key);
  }
  return ordered;
}

function milestoneTypeGroups(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record.scope}:${record.scopeValue ?? ''}`;
    if (!groups.has(key)) {
      const label = record.scope === 'year' ? `Year — ${record.scopeValue}`
        : record.scope === 'list' ? `List — ${listName(record.scopeValue)}` : 'Overall';
      groups.set(key, { scope: record.scope, scopeValue: record.scopeValue, label, records: [] });
    }
    groups.get(key).records.push(record);
  }
  const ordered = [...groups.values()];
  const scopes = ['global', 'year', 'list'];
  ordered.sort((a, b) => scopes.indexOf(a.scope) - scopes.indexOf(b.scope)
    || (a.scope === 'year' ? b.scopeValue - a.scopeValue
      : a.scope === 'list' ? a.label.localeCompare(b.label) || a.scopeValue - b.scopeValue : 0));
  for (const group of ordered) group.records.sort((a, b) => a.threshold - b.threshold);
  return ordered;
}

function makeMilestoneIcon(type) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'milestone-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', MILESTONE_ICON_PATHS[type]);
  svg.append(path);
  return svg;
}

function makeMilestoneRow(record, groupedByType = false) {
  const row = document.createElement('div');
  row.className = 'milestone-row';
  const heading = document.createElement('div');
  heading.className = 'milestone-heading';
  const name = document.createElement('strong');
  name.textContent = groupedByType && record.scope !== 'global'
    ? milestoneLabel(record.threshold, record.type.toLowerCase()) : record.label;
  const when = document.createElement('span');
  when.className = 'milestone-when';
  when.textContent = milestoneWhen(record.event);
  heading.append(name, makeMilestoneIcon(record.type), when);

  const detail = document.createElement('div');
  detail.className = 'milestone-detail';
  const list = document.createElement('span');
  list.textContent = `${listName(record.event.listId)} • `;
  detail.append(list, eventTaskNode(record.event));
  const tail = document.createElement('span');
  tail.textContent = ` • ${record.event.eventType}: ${record.event.title}`;
  detail.append(tail);
  row.append(heading, detail);
  return row;
}

function makeMilestoneGrid(records, groupedByType = false) {
  const grid = document.createElement('div');
  grid.className = 'milestone-group-grid';
  grid.replaceChildren(...records.map(record => makeMilestoneRow(record, groupedByType)));
  return grid;
}

export function renderMilestones() {
  const timeline = $('#milestonesTimeline');
  const events = eventLogReady() ? [...scopedRecordedEvents()].sort((a,b)=>a.id-b.id) : [];
  renderCards($('#milestoneCards'), [
    { label: 'Highest Universal ID', value: numberFmt.format(state.snapshot?.highestUniversalId || 0) },
    { label: 'Recorded events in scope', value: numberFmt.format(events.length) },
    { label: 'Created events', value: numberFmt.format(events.filter(event => event.eventType === 'Created').length) },
    { label: 'Completed events', value: numberFmt.format(events.filter(event => event.eventType === 'Completed').length) },
    { label: 'Deleted events', value: numberFmt.format(events.filter(event => event.eventType === 'Deleted').length) }
  ]);
  if (!eventLogReady()) {
    const empty = document.createElement('div');
    empty.className = 'milestone-empty';
    empty.textContent = eventHistoryUnavailableMessage('recorded milestones');
    timeline.replaceChildren(empty);
    return;
  }

  const records = [
    ...milestoneEventRecords(events, 'Created'),
    ...milestoneEventRecords(events, 'Completed'),
    ...milestoneEventRecords(events, 'Cancelled'),
    ...milestoneEventRecords(events, 'Reopened'),
    ...milestoneEventRecords(events, 'Deleted'),
    ...milestoneUniversalIdRecords(events),
    ...milestonePerListRecords(events),
    ...milestoneYearRecords(events)
  ];
  for (const threshold of continuingMilestoneThresholds(MILESTONE_EVENT_BASE_THRESHOLDS, events.length)) {
    if (events.length < threshold) continue;
    records.push({ label: milestoneLabel(threshold, 'recorded event'), type: 'Recorded events', event: events[threshold - 1],
      threshold, scope: 'global', scopeValue: null });
  }
  records.sort((a, b) => compareEventDates(a.event, b.event) || a.label.localeCompare(b.label));
  const sections = [];
  const mode = $('#milestoneSort').value;
  for (const group of milestoneGroups(records, mode)) {
    const section = document.createElement('section');
    section.className = 'milestone-group';
    const title = document.createElement('h3');
    title.className = 'milestone-group-title';
    title.textContent = group.label;
    section.append(title);
    if (mode === 'type') {
      for (const scope of milestoneTypeGroups(group.records)) {
        const subsection = document.createElement('section');
        subsection.className = 'milestone-subgroup';
        const subtitle = document.createElement('h4');
        subtitle.className = 'milestone-subgroup-title';
        subtitle.textContent = scope.label;
        subsection.append(subtitle, makeMilestoneGrid(scope.records, true));
        section.append(subsection);
      }
    } else {
      section.append(makeMilestoneGrid(group.records));
    }
    sections.push(section);
  }
  timeline.replaceChildren(...sections);
}

$('#milestoneSort').addEventListener('change', () => { if (state.activeTab === 'milestones') renderMilestones(); });
