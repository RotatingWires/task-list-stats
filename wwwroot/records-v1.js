'use strict';

// TaskList Stats v1.0.5 release compatibility layer for Overview records, terminal-status semantics, backlog reconstruction, clearer contextual labeling, and faster tree analysis.
// Loaded after app.js but before DOMContentLoaded startup.
(() => {
  const RELEASE = '1.0.5';
  const baseRenderOverview = renderOverview;
  const baseNormalizeSnapshot = normalizeSnapshot;
  const baseGroupLabel = groupLabel;

  function applyReleaseLabel() {
    document.title = `TaskList Stats v${RELEASE}`;
    const title = document.querySelector('.title-left');
    if (title) title.textContent = `TaskList Stats v${RELEASE}`;
    const about = document.querySelector('#aboutDialog strong');
    if (about) about.textContent = `TaskList Stats v${RELEASE}`;
    const status = document.querySelector('#statusLeft');
    if (status) status.textContent = `TaskList Stats v${RELEASE}`;
  }

  function applyTaskTypeScopeNote() {
    const chart = document.querySelector('#taskTypeChart');
    const frame = chart?.closest('.chart-frame');
    if (!frame || frame.parentElement?.querySelector('.task-type-scope-note')) return;

    const note = document.createElement('div');
    note.className = 'note exam-scope-note has-tooltip task-type-scope-note';
    note.title = 'School or homework lists';
    note.tabIndex = 0;
    note.textContent = 'Make sure to select the correct list for the context of these stats.';
    frame.before(note);
  }

  // TaskList preserves old completed_at/cancelled_at values when a task later
  // changes status. Stats should treat the current terminal status as authoritative
  // so corrected/reopened tasks do not inflate completion/cancellation metrics.
  normalizeSnapshot = function normalizeSnapshotV105(raw) {
    const normalized = baseNormalizeSnapshot(raw);
    for (const item of normalized.items) {
      if (item.status !== 'Done') item.completedDate = null;
      if (item.status !== 'Cancelled') item.cancelledDate = null;
    }
    return normalized;
  };

  // Month labels on Trends use a four-digit year so labels such as "Sep 26"
  // cannot be mistaken for a calendar date.
  groupLabel = function groupLabelV105(key, mode) {
    if (mode === 'month') {
      const [year, month] = key.split('-').map(Number);
      return `${MONTHS[month - 1]} ${year}`;
    }
    return baseGroupLabel(key, mode);
  };

  // Backlog is a historical state reconstruction rather than a current-status
  // statistic. Rebuild each task's stored transitions from the raw timestamps so
  // Reopen adds a task back only after a terminal state, while Done -> Cancelled
  // (or Cancelled -> Done) remains closed instead of subtracting twice.
  approximateBacklog = function approximateBacklogV105(items) {
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
      let state = null;
      for (const event of events) {
        if (event.state === state) continue;
        increment(deltas, monthKey(event.date), event.state === 'open' ? 1 : -1);
        state = event.state;
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
  };

  function busiestCompletionPeriod(items, keyFn) {
    const counts = new Map();
    for (const item of items) {
      if (!item.completedDate) continue;
      increment(counts, keyFn(item.completedDate));
    }
    return maxEntry(counts);
  }

  function longestEventStreak(items, dateField) {
    const counts = new Map();
    for (const item of items) {
      const date = item[dateField];
      if (date) increment(counts, localDayKey(date));
    }
    const keys = [...counts.keys()].sort();
    if (!keys.length) return null;

    let best = null;
    let currentStart = null;
    let currentDays = 0;
    let currentTotal = 0;
    let previous = null;

    for (const key of keys) {
      const date = new Date(`${key}T12:00:00`);
      const consecutive = previous && Math.round((date - previous) / 86_400_000) === 1;
      if (!consecutive) {
        currentStart = date;
        currentDays = 0;
        currentTotal = 0;
      }

      currentDays++;
      currentTotal += counts.get(key) || 0;
      if (!best || currentDays > best.days || (currentDays === best.days && currentTotal > best.total)) {
        best = {
          days: currentDays,
          total: currentTotal,
          start: new Date(currentStart),
          end: new Date(date)
        };
      }
      previous = date;
    }
    return best;
  }

  function biggestHour(items, dateField, rawField) {
    const counts = new Map();
    for (const item of items) {
      const date = item[dateField];
      if (!date || !hasConfirmedClockTime(item[rawField])) continue;
      const key = `${localDayKey(date)}T${String(date.getHours()).padStart(2, '0')}`;
      increment(counts, key);
    }
    return maxEntry(counts);
  }

  function formatHourRecord(key) {
    if (!key) return '—';
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2})$/.exec(key);
    if (!match) return '—';
    const date = new Date(`${match[1]}T${match[2]}:00:00`);
    return date.toLocaleString(undefined, {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', hour12: true
    });
  }

  function formatRecord(value, detail = '') {
    if (!value || value === '—') return '—';
    return detail ? `${value} • ${detail}` : value;
  }

  function formatStreak(streak, verb) {
    if (!streak) return '—';
    const range = streak.days === 1
      ? formatDate(streak.start)
      : `${formatDate(streak.start)} – ${formatDate(streak.end)}`;
    return `${numberFmt.format(streak.days)} days • ${range} • ${numberFmt.format(streak.total)} tasks ${verb}`;
  }

  function makeRecordGroup(title, rows) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'groupbox';
    const legend = document.createElement('legend');
    legend.textContent = title;
    const list = document.createElement('div');
    list.className = 'metric-list';
    renderMetricList(list, rows);
    fieldset.append(legend, list);
    return fieldset;
  }

  function renderRecordLists(items) {
    const creationMonth = busiestPeriod(items, monthKey);
    const creationWeek = busiestPeriod(items, weekKey);
    const creationDay = busiestPeriod(items, localDayKey);
    const creationHour = biggestHour(items, 'createdDate', 'createdAt');
    const creationStreak = longestEventStreak(items, 'createdDate');
    const quietStreak = longestCreationStreaks(items).quiet;

    const completionMonth = busiestCompletionPeriod(items, monthKey);
    const completionWeek = busiestCompletionPeriod(items, weekKey);
    const completionDay = busiestCompletionPeriod(items, localDayKey);
    const completionHour = biggestHour(items, 'completedDate', 'completedAt');
    const completionStreak = longestEventStreak(items, 'completedDate');

    const firstCreated = items.map(x => x.createdDate).filter(Boolean).sort((a, b) => a - b)[0] || null;
    const lastCreated = items.map(x => x.createdDate).filter(Boolean).sort((a, b) => b - a)[0] || null;

    const creationRows = [
      ['Most creations in one month', creationMonth ? formatRecord(formatMonthKey(creationMonth[0]), `${numberFmt.format(creationMonth[1])} tasks created`) : '—'],
      ['Most creations in one week', creationWeek ? formatRecord(formatWeekKey(creationWeek[0]), `${numberFmt.format(creationWeek[1])} tasks created`) : '—'],
      ['Most creations in one day', creationDay ? formatRecord(formatDate(new Date(`${creationDay[0]}T12:00:00`)), `${numberFmt.format(creationDay[1])} tasks created`) : '—'],
      ['Biggest creation hour', creationHour ? formatRecord(formatHourRecord(creationHour[0]), `${numberFmt.format(creationHour[1])} tasks created`) : '—'],
      ['Longest creation streak', formatStreak(creationStreak, 'created')],
      ['Longest quiet streak', `${numberFmt.format(quietStreak)} days`]
    ];

    const completionRows = [
      ['Most completions in one month', completionMonth ? formatRecord(formatMonthKey(completionMonth[0]), `${numberFmt.format(completionMonth[1])} tasks completed`) : '—'],
      ['Most completions in one week', completionWeek ? formatRecord(formatWeekKey(completionWeek[0]), `${numberFmt.format(completionWeek[1])} tasks completed`) : '—'],
      ['Most completions in one day', completionDay ? formatRecord(formatDate(new Date(`${completionDay[0]}T12:00:00`)), `${numberFmt.format(completionDay[1])} tasks completed`) : '—'],
      ['Biggest completion hour', completionHour ? formatRecord(formatHourRecord(completionHour[0]), `${numberFmt.format(completionHour[1])} tasks completed`) : '—'],
      ['Longest completion streak', formatStreak(completionStreak, 'completed')]
    ];

    const timelineRows = [
      ['First dated task', formatDate(firstCreated)],
      ['Latest dated task', formatDate(lastCreated)]
    ];

    const container = $('#recordCards');
    container.className = 'records-layout';
    const columns = document.createElement('div');
    columns.className = 'two-column';
    columns.append(
      makeRecordGroup('Creation Records', creationRows),
      makeRecordGroup('Completion Records', completionRows)
    );
    container.replaceChildren(columns, makeRecordGroup('Timeline', timelineRows));
  }

  // The original Trees & Titles renderer repeatedly scanned the full scoped item
  // array for every parent and every root. Build hierarchy counts once instead.
  renderTrees = function renderTreesV105() {
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
  };

  renderOverview = function renderOverviewV105() {
    baseRenderOverview();
    renderRecordLists(scopedItems());
  };

  applyReleaseLabel();
  applyTaskTypeScopeNote();
})();
