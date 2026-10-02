'use strict';

function calendarDayKeyFromCell(cell) {
  const selected = parseCalendarMonth($('#calendarMonth')?.value);
  const dayText = cell.querySelector('.calendar-date')?.textContent;
  const day = Number(dayText);
  if (!selected || !Number.isInteger(day) || day < 1 || day > 31) return null;
  return `${selected.year}-${String(selected.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function calendarItemsForDay(dayKey, dateField) {
  return scopedItems()
    .filter(item => localDayKey(item[dateField]) === dayKey)
    .sort((a, b) => b.universalId - a.universalId);
}

function calendarDaySection(label, items) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'groupbox calendar-detail-group';

  const legend = document.createElement('legend');
  legend.textContent = `${label} (${numberFmt.format(items.length)})`;
  fieldset.append(legend);

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'calendar-detail-empty';
    empty.textContent = `No tasks ${label.toLowerCase()} on this day.`;
    fieldset.append(empty);
    return fieldset;
  }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  setTable(table, ['List', 'ID', 'Task', 'Current status'], items.map(item => [
    listName(item.listId),
    taskLink(item),
    item.title || '(Untitled task)',
    item.status
  ]));
  wrap.append(table);
  fieldset.append(wrap);
  return fieldset;
}

function openCalendarDayDetails(dayKey) {
  const date = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return;

  const created = calendarItemsForDay(dayKey, 'createdDate');
  const completed = calendarItemsForDay(dayKey, 'completedDate');
  const cancelled = calendarItemsForDay(dayKey, 'cancelledDate');

  $('#calendarDayTitle').textContent = date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const scope = document.createElement('div');
  scope.className = 'calendar-detail-scope';
  scope.textContent = `Scope: ${isAllListScope() ? 'All lists' : selectedListNames().join(', ')}`;

  $('#calendarDayBody').replaceChildren(
    scope,
    calendarDaySection('Created', created),
    calendarDaySection('Completed', completed),
    calendarDaySection('Cancelled', cancelled)
  );
  $('#calendarDayDialog').showModal();
}

$('#monthCalendar').addEventListener('click', event => {
  const cell = event.target.closest('.calendar-day:not(.empty)');
  if (!cell || !$('#monthCalendar').contains(cell)) return;
  const dayKey = calendarDayKeyFromCell(cell);
  if (dayKey) openCalendarDayDetails(dayKey);
});
