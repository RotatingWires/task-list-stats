'use strict';

// TaskList Stats v1.0 Overview record extensions.
// Loaded after app.js so it can extend the existing Overview renderer without
// duplicating the rest of the statistics application.
(() => {
  const baseRenderOverview = renderOverview;

  function busiestCompletionPeriod(items, keyFn) {
    const counts = new Map();
    for (const item of items) {
      if (!item.completedDate) continue;
      increment(counts, keyFn(item.completedDate));
    }
    return maxEntry(counts);
  }

  function longestCompletionStreak(items) {
    const counts = new Map();
    for (const item of items) {
      if (item.completedDate) increment(counts, localDayKey(item.completedDate));
    }
    const keys = [...counts.keys()].sort();
    if (!keys.length) return null;

    let best = null;
    let currentStart = null;
    let currentEnd = null;
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
      currentEnd = date;
      currentDays++;
      currentTotal += counts.get(key) || 0;

      if (!best || currentDays > best.days || (currentDays === best.days && currentTotal > best.total)) {
        best = {
          days: currentDays,
          total: currentTotal,
          start: new Date(currentStart),
          end: new Date(currentEnd)
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

  function streakRange(streak) {
    if (!streak) return '';
    if (streak.days === 1) return `${formatDate(streak.start)} • ${numberFmt.format(streak.total)} tasks completed`;
    return `${formatDate(streak.start)} – ${formatDate(streak.end)} • ${numberFmt.format(streak.total)} tasks completed`;
  }

  renderOverview = function renderOverviewV1() {
    baseRenderOverview();

    const items = scopedItems();
    const completionDay = busiestCompletionPeriod(items, localDayKey);
    const completionWeek = busiestCompletionPeriod(items, weekKey);
    const completionMonth = busiestCompletionPeriod(items, monthKey);
    const completionStreak = longestCompletionStreak(items);
    const creationHour = biggestHour(items, 'createdDate', 'createdAt');
    const completionHour = biggestHour(items, 'completedDate', 'completedAt');

    const cards = [
      {
        label: 'Most completions in one day',
        value: completionDay ? formatDate(new Date(`${completionDay[0]}T12:00:00`)) : '—',
        sub: completionDay ? `${numberFmt.format(completionDay[1])} tasks completed` : '',
        kind: 'subject-first'
      },
      {
        label: 'Most completions in one week',
        value: completionWeek ? formatWeekKey(completionWeek[0]) : '—',
        sub: completionWeek ? `${numberFmt.format(completionWeek[1])} tasks completed` : '',
        kind: 'subject-first'
      },
      {
        label: 'Most completions in one month',
        value: completionMonth ? formatMonthKey(completionMonth[0]) : '—',
        sub: completionMonth ? `${numberFmt.format(completionMonth[1])} tasks completed` : '',
        kind: 'subject-first'
      },
      {
        label: 'Longest completion streak',
        value: completionStreak ? `${numberFmt.format(completionStreak.days)} days` : '—',
        sub: streakRange(completionStreak),
        kind: 'subject-first'
      },
      {
        label: 'Biggest creation hour',
        value: creationHour ? formatHourRecord(creationHour[0]) : '—',
        sub: creationHour ? `${numberFmt.format(creationHour[1])} tasks created` : 'Only confirmed clock times',
        kind: 'subject-first'
      },
      {
        label: 'Biggest completion hour',
        value: completionHour ? formatHourRecord(completionHour[0]) : '—',
        sub: completionHour ? `${numberFmt.format(completionHour[1])} tasks completed` : 'Only confirmed clock times',
        kind: 'subject-first'
      }
    ];

    const container = $('#recordCards');
    container.append(...cards.map(card => makeStatCard(card.label, card.value, card.sub, card.kind)));
  };
})();
