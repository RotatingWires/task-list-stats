function scopeLabel() {
  if (isAllListScope()) return 'All lists';
  if (state.selectedListIds.size === 1) return listName([...state.selectedListIds][0]);
  return `${state.selectedListIds.size} lists`;
}

function scopeDetailLabel() {
  return isAllListScope() ? 'All lists' : selectedListNames().join(', ');
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

function applyReleaseLabel(version) {
  if (!version) return;
  document.title = `TaskList Stats v${version}`;
  const title = document.querySelector('.title-left');
  if (title) title.textContent = `TaskList Stats v${version}`;
  const about = document.querySelector('#aboutVersion');
  if (about) about.textContent = `TaskList Stats v${version}`;
}

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

function renderOverview() {
  const items = scopedItems();
  const total = items.length;
  const open = items.filter(x => x.status === 'Open').length;
  const done = items.filter(x => x.status === 'Done').length;
  const cancelled = items.filter(x => x.status === 'Cancelled').length;
  const roots = items.filter(x => !x.parentDisplayId).length;
  const subtasks = total - roots;
  const deletedEstimate = isAllListScope()
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

  renderRecordLists(items);

  const durations = items.map(durationMs).filter(x => x != null);
  const fastest = durations.length ? Math.min(...durations) : null;
  const slowest = durations.length ? Math.max(...durations) : null;
  renderMetricList($('#completionBehavior'), [
    ['Completion percentage', percent(done, total), 'Current Done tasks divided by all current tasks in the selected scope, including Open and Cancelled tasks.'],
    ['Cancellation percentage', percent(cancelled, total), 'Current Cancelled tasks divided by all current tasks in the selected scope.'],
    ['Average observed completion time', formatDuration(average(durations)), 'The arithmetic mean of completed_at minus created_at for tasks with confirmed creation and completion times. Date-only history is excluded.'],
    ['Median observed completion time', formatDuration(median(durations)), 'The middle created-to-completed duration among tasks with confirmed creation and completion times. Date-only history is excluded.'],
    ['Fastest observed completion', formatDuration(fastest), 'The shortest non-negative created-to-completed duration among tasks with confirmed creation and completion times.'],
    ['Slowest observed completion', formatDuration(slowest), 'The longest created-to-completed duration among tasks with confirmed creation and completion times.']
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

