'use strict';

// TaskList Stats v1.0.2 release compatibility layer for Overview records and terminal-status semantics.
// Loaded after app.js but before DOMContentLoaded startup.
(() => {
  const RELEASE = '1.0.2';
  const baseRenderOverview = renderOverview;
  const baseNormalizeSnapshot = normalizeSnapshot;

  function applyReleaseLabel() {
    document.title = `TaskList Stats v${RELEASE}`;
    const title = document.querySelector('.title-left');
    if (title) title.textContent = `TaskList Stats v${RELEASE}`;
    const about = document.querySelector('#aboutDialog strong');
    if (about) about.textContent = `TaskList Stats v${RELEASE}`;
    const status = document.querySelector('#statusLeft');
    if (status) status.textContent = `TaskList Stats v${RELEASE}`;
  }

  // TaskList preserves old completed_at/cancelled_at values when a task later
  // changes status. Stats should treat the current terminal status as authoritative
  // so corrected/reopened tasks do not inflate completion/cancellation metrics.
  normalizeSnapshot = function normalizeSnapshotV102(raw) {
    const normalized = baseNormalizeSnapshot(raw);
    for (const item of normalized.items) {
      if (item.status !== 'Done') item.completedDate = null;
      if (item.status !== 'Cancelled') item.cancelledDate = null;
    }
    return normalized;
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

  renderOverview = function renderOverviewV102() {
    baseRenderOverview();
    renderRecordLists(scopedItems());
  };

  applyReleaseLabel();
})();
