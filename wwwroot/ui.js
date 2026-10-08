const EVENT_HISTORY_TABS = new Set(['history', 'compare', 'sessions', 'milestones']);

function activeTabNeedsEvents(name = state.activeTab) {
  return EVENT_HISTORY_TABS.has(name);
}

function eventHistoryStatusText() {
  if (!state.snapshot?.eventLogAvailable) return 'event log unavailable';
  if (!state.eventsLoaded) return 'event history on demand';
  if (state.eventsNeedRefresh) return 'event history refresh on demand';
  return `${numberFmt.format(state.snapshot.events.length)} events`;
}

function resetEventCache() {
  if (state.snapshot) state.snapshot.events = [];
  state.eventsLoaded = false;
  state.eventsLoading = null;
  state.eventsNeedRefresh = Boolean(state.snapshot?.eventLogAvailable);
  state.lastEventId = 0;
  state.eventCursor = null;
}

async function ensureEventsLoaded() {
  if (!state.snapshot?.eventLogAvailable) {
    resetEventCache();
    return;
  }
  if (state.eventsLoaded && !state.eventsNeedRefresh) return;
  if (state.eventsLoading) return state.eventsLoading;

  const canIncrement =
    state.eventsLoaded &&
    state.lastEventId > 0 &&
    typeof state.eventCursor === 'string' &&
    state.eventCursor.length > 0;

  $('#databaseStatus').textContent =
    `${numberFmt.format(state.snapshot.items.length)} current items • ${canIncrement ? 'checking for new events...' : 'loading event history...'}`;

  state.eventsLoading = (async () => {
    const query = canIncrement
      ? `?afterId=${encodeURIComponent(state.lastEventId)}&cursor=${encodeURIComponent(state.eventCursor)}`
      : '';
    const response = await fetch(`/api/events${query}`, { cache: 'no-store', credentials: 'same-origin' });
    if (response.status === 401) {
      window.location.replace(loginUrl());
      return;
    }
    if (!response.ok) {
      let message = `Server returned ${response.status}`;
      try {
        const body = await response.json();
        message = body.detail || body.title || message;
      } catch {}
      throw new Error(message);
    }

    const batch = await response.json();
    const incoming = Array.isArray(batch.events) ? batch.events : [];

    if (!state.eventsLoaded || batch.resetRequired) {
      state.snapshot.events = incoming;
    } else {
      state.snapshot.events.push(...incoming);
    }

    state.lastEventId = Number(batch.lastEventId) || 0;
    state.eventCursor = typeof batch.cursor === 'string' && batch.cursor ? batch.cursor : null;
    state.eventsLoaded = true;
    state.eventsNeedRefresh = false;
  })();

  try {
    await state.eventsLoading;
  } finally {
    state.eventsLoading = null;
  }
}

function renderAll() {
  if (!state.snapshot) return;
  const currentScopeLabel = scopeLabel();
  $('#titleScope').textContent = currentScopeLabel;
  $('#listFilterLabel').textContent = currentScopeLabel;
  $('#listFilterButton').title = scopeDetailLabel();
  const renderers = {
    overview: renderOverview,
    trends: renderTrends,
    calendar: renderCalendar,
    lists: renderLists,
    patterns: renderPatterns,
    trees: renderTrees,
    history: renderHistoryExplorer,
    compare: renderCompare,
    sessions: renderActivitySessions,
    milestones: renderMilestones,
    fun: () => Fun.render()
  };
  renderers[state.activeTab]?.();
  $('#statusLeft').textContent = `${numberFmt.format(scopedItems().length)} current items • ${scopeLabel()}`;
  const eventText = state.snapshot.eventLogAvailable
    ? ` • ${state.eventsLoaded && !state.eventsNeedRefresh
        ? `${numberFmt.format(state.snapshot.events.length)} recorded events`
        : state.eventsLoaded
          ? 'event history refresh on demand'
          : 'event history on demand'}`
    : '';
  $('#statusRight').textContent = `DB updated ${formatDateTime(parseDate(state.snapshot.databaseLastWriteUtc))} • Task data read-only${eventText}`;
}

function switchTab(name) {
  state.activeTab = name;
  $$('.tabs [role="tab"]').forEach(btn => btn.setAttribute('aria-selected', btn.dataset.tab === name ? 'true' : 'false'));
  $$('.tab-panel').forEach(panel => panel.hidden = panel.dataset.panel !== name);
  closeMenus();
  Charts.hideTooltip?.();

  requestAnimationFrame(async () => {
    try {
      if (activeTabNeedsEvents(name)) await ensureEventsLoaded();
      renderAll();
      $('#databaseStatus').textContent =
        `${numberFmt.format(state.snapshot.items.length)} current items • ${eventHistoryStatusText()}`;
    } catch (error) {
      const panel = $('#errorPanel');
      panel.hidden = false;
      panel.textContent = `Could not load event history: ${error.message}`;
      renderAll();
    }
  });
}

function populateListFilter() {
  const menu = $('#listFilterMenu');
  menu.replaceChildren();
  const options = [['all','All lists'], ...state.snapshot.lists.map(l=>[String(l.id),l.name])];
  for (const [value,label] of options) {
    const id = value === 'all' ? null : Number(value);
    const checked = value === 'all' ? isAllListScope() : state.selectedListIds.has(id);
    const button=document.createElement('button');
    button.type='button';
    button.dataset.value=value;
    button.setAttribute('role','menuitemcheckbox');
    button.setAttribute('aria-checked',checked?'true':'false');
    const check=document.createElement('span'); check.className='menu-check';
    const text=document.createElement('span'); text.className='menu-label'; text.textContent=label;
    button.append(check,text);
    button.addEventListener('click',event=>{
      event.stopPropagation();
      if(value==='all') state.selectedListIds.clear();
      else if(state.selectedListIds.has(id)) state.selectedListIds.delete(id);
      else state.selectedListIds.add(id);
      populateListFilter();
      renderAll();
    });
    menu.append(button);
  }
}

function menuRadioButton(value, label, checked, onClick) {
  const button=document.createElement('button');
  button.type='button';
  button.setAttribute('role','menuitemradio');
  button.setAttribute('aria-checked',checked?'true':'false');
  const check=document.createElement('span'); check.className='menu-check';
  const text=document.createElement('span'); text.className='menu-label'; text.textContent=label;
  button.append(check,text);
  button.addEventListener('click',onClick);
  return button;
}

function populateViewMenu() {
  const labels = [
    ['overview','Overview'],['trends','Trends'],['calendar','Calendar'],['lists','Lists'],['patterns','Patterns'],['trees','Trees & Titles'],
    ['history','History Explorer'],['compare','Compare'],['sessions','Activity Sessions'],['milestones','Milestones'],['fun','Fun']
  ];
  const menu=$('#viewMenu'); menu.replaceChildren();
  for(const [value,label] of labels){
    menu.append(menuRadioButton(value,label,value===state.activeTab,()=>{switchTab(value);populateViewMenu();}));
  }

  const separator=document.createElement('div'); separator.className='menu-separator'; separator.setAttribute('role','separator');
  const heading=document.createElement('div'); heading.className='menu-heading'; heading.textContent='Theme'; heading.setAttribute('role','presentation');
  menu.append(separator,heading);

  const preference=window.TaskTheme?.getPreference?.() ?? 'light';
  for(const [value,label] of [['light','Light'],['dark','Dark']]){
    menu.append(menuRadioButton(value,label,value===preference,event=>{
      event.stopPropagation();
      window.TaskTheme?.setPreference?.(value);
      populateViewMenu();
      closeMenus();
    }));
  }
}

function toggleMenu(button, menu) {
  const open=menu.hidden;
  closeMenus();
  menu.hidden=!open;
  button.setAttribute('aria-expanded',open?'true':'false');
}

function closeMenus() {
  $$('.menu-dropdown').forEach(menu => { menu.hidden = true; });
  $$('[aria-haspopup="menu"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
}

function loginUrl() {
  const returnUrl = `${location.pathname}${location.search}${location.hash}`;
  return `/login.html?returnUrl=${encodeURIComponent(returnUrl || '/')}`;
}

async function logout() {
  closeMenus();
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  } finally {
    window.location.replace('/login.html');
  }
}

async function frontendReleaseVersion(fallback = '') {
  try {
    const response = await fetch('/version.json', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return fallback;
    const body = await response.json();
    return body.version || fallback;
  } catch { return fallback; }
}

async function loadSnapshot() {
  $('#loadingPanel').hidden = false;
  $('#errorPanel').hidden = true;
  $('#databaseStatus').textContent = 'Loading database...';

  const cachedEvents = state.eventsLoaded ? (state.snapshot?.events ?? []) : [];
  const cachedLastEventId = state.lastEventId;
  const cachedEventCursor = state.eventCursor;
  const hadLoadedEvents = state.eventsLoaded;

  try {
    const response = await fetch('/api/snapshot', { cache: 'no-store', credentials: 'same-origin' });
    if (response.status === 401) { window.location.replace(loginUrl()); return; }
    if (!response.ok) {
      let message = `Server returned ${response.status}`;
      try { const body = await response.json(); message = body.detail || body.title || message; } catch {}
      throw new Error(message);
    }

    state.snapshot = normalizeSnapshot(await response.json());
    state.eventsLoading = null;

    if (state.snapshot.eventLogAvailable && hadLoadedEvents) {
      state.snapshot.events = cachedEvents;
      state.eventsLoaded = true;
      state.eventsNeedRefresh = true;
      state.lastEventId = cachedLastEventId;
      state.eventCursor = cachedEventCursor;
    } else {
      resetEventCache();
    }

    applyReleaseLabel(await frontendReleaseVersion(state.snapshot.version));
    const validListIds = new Set(state.snapshot.lists.map(list => list.id));
    state.selectedListIds = new Set([...state.selectedListIds].filter(id => validListIds.has(id)));
    populateListFilter();
    populateViewMenu();

    if (activeTabNeedsEvents()) await ensureEventsLoaded();

    $('#databaseStatus').textContent =
      `${numberFmt.format(state.snapshot.items.length)} current items • ${eventHistoryStatusText()}`;
    $('#loadingPanel').hidden = true;
    renderAll();
  } catch (error) {
    $('#loadingPanel').hidden = true;
    const panel = $('#errorPanel'); panel.hidden = false; panel.textContent = error.message;
    $('#databaseStatus').textContent = 'Database unavailable';
  }
}

async function downloadSnapshot() {
  if (!state.snapshot) return;
  try {
    await ensureEventsLoaded();
  } catch (error) {
    const panel = $('#errorPanel');
    panel.hidden = false;
    panel.textContent = `Could not load event history for export: ${error.message}`;
    return;
  }

  const blob = new Blob([JSON.stringify(state.snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `task-list-stats-snapshot-${localDayKey(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

$('#fileMenuButton').addEventListener('click',e=>{e.stopPropagation();toggleMenu($('#fileMenuButton'),$('#fileMenu'));});
$('#viewMenuButton').addEventListener('click',e=>{e.stopPropagation();populateViewMenu();toggleMenu($('#viewMenuButton'),$('#viewMenu'));});
$('#helpMenuButton').addEventListener('click',e=>{e.stopPropagation();toggleMenu($('#helpMenuButton'),$('#helpMenu'));});
$('#listFilterButton').addEventListener('click',e=>{e.stopPropagation();toggleMenu($('#listFilterButton'),$('#listFilterMenu'));});
$('#refreshButton').addEventListener('click',()=>{closeMenus();loadSnapshot();});
$('#exportButton').addEventListener('click',()=>{closeMenus();downloadSnapshot();});
$('#logoutButton').addEventListener('click', logout);
$('#aboutButton').addEventListener('click',()=>{closeMenus();$('#aboutDialog').showModal();});
$$('.tabs [role="tab"]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));
$('#trendGroup').addEventListener('change',renderTrends);
$('#heatmapYear').addEventListener('change',()=>{
  renderYearHeatmap(scopedItems());
  const year = Number($('#heatmapYear').value);
  const selected = parseCalendarMonth($('#calendarMonth').value);
  $('#calendarMonth').value = formatCalendarMonthValue(year, selected?.month || 1);
  renderMonthCalendar(scopedItems());
});
$('#heatmapMode').addEventListener('change',()=>renderYearHeatmap(scopedItems()));
$('#monthYearHeatmapMode').addEventListener('change',()=>renderMonthYearHeatmap(scopedItems()));
$('#calendarMonth').addEventListener('input',()=>renderMonthCalendar(scopedItems()));
$('#calendarMonth').addEventListener('change',()=>renderMonthCalendar(scopedItems()));
$('#hourHeatmapMode').addEventListener('change',()=>renderWeekdayHourHeatmap(scopedItems()));
document.addEventListener('click',closeMenus);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenus();});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>renderAll(),120);});

function initializeTouchHelp() {
  const popup = document.createElement('div'); popup.className = 'tap-help-tooltip'; popup.hidden = true; document.body.append(popup);
  function hide() { popup.hidden = true; }
  function showFor(element) {
    const text = element.getAttribute('title'); if (!text) return;
    popup.textContent = text; popup.hidden = false;
    const rect = element.getBoundingClientRect(); const margin = 10; const width = popup.offsetWidth || 260; const height = popup.offsetHeight || 60;
    const x = rect.left + rect.width / 2; const left = Math.max(margin, Math.min(window.innerWidth - width - margin, x - width / 2));
    let top = rect.bottom + 12; if (top + height + margin > window.innerHeight) top = Math.max(margin, rect.top - height - 12);
    popup.style.left = `${left}px`; popup.style.top = `${top}px`;
  }
  document.addEventListener('click', event => { const target = event.target.closest?.('.has-tooltip[title], .word-chip[title]'); if (target) { showFor(target); return; } hide(); }, true);
  document.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.('.has-tooltip[title], .word-chip[title]')) { event.preventDefault(); showFor(event.target); } else if (event.key === 'Escape') hide(); });
  $('#workspace')?.addEventListener('scroll', hide, { passive: true });
}

function initializeRowHover() {
  const root = document.documentElement;
  const button = $('#highlightRowsButton');
  const storageKey = 'task-list-stats-highlight-rows';
  let enabled = true;
  try { enabled = localStorage.getItem(storageKey) !== 'false'; } catch {}

  function applyPreference() {
    root.classList.toggle('row-hover-enabled', enabled);
    button.setAttribute('aria-checked', String(enabled));
  }
  applyPreference();

  button.addEventListener('click', event => {
    event.stopPropagation();
    enabled = !enabled;
    try { localStorage.setItem(storageKey, String(enabled)); } catch {}
    applyPreference();
  });

  // Match TaskList's actual-mouse detection on touchscreen laptops.
  let ignoreSyntheticMouseUntil = 0;
  document.addEventListener('touchstart', () => {
    ignoreSyntheticMouseUntil = performance.now() + 1200;
    root.classList.remove('mouse-hover-capable');
  }, { passive: true, capture: true });
  document.addEventListener('mousemove', () => {
    if (performance.now() >= ignoreSyntheticMouseUntil)
      root.classList.add('mouse-hover-capable');
  }, { passive: true });
}

const STATIC_SINGLE_SELECT_OPTIONS = {
  trendGroup: [['day', 'Day'], ['week', 'Week'], ['month', 'Month']],
  heatmapMode: HEATMAP_EVENT_OPTIONS,
  monthYearHeatmapMode: HEATMAP_EVENT_OPTIONS,
  hourHeatmapMode: HEATMAP_EVENT_OPTIONS,
  historyEventType: [['all', 'All events'], ['Created', 'Created'], ['Completed', 'Completed'], ['Cancelled', 'Cancelled'], ['Reopened', 'Reopened'], ['Deleted', 'Deleted']],
  historyOrder: [['newest', 'Newest first'], ['oldest', 'Oldest first']],
  compareMode: [['lists', 'Lists'], ['periods', 'Time periods']],
  sessionGap: [['15', '15 minutes'], ['30', '30 minutes'], ['60', '60 minutes']]
};

function singleSelectParts(id) {
  const input = $(`#${id}`); const host = document.querySelector(`[data-single-select="${id}"]`); if (!input || !host) return null;
  return { input, host, button: host.querySelector('[data-single-select-button]'), label: host.querySelector('[data-single-select-label]'), menu: host.querySelector('[data-single-select-menu]') };
}

function setSingleSelectOptions(id, options, preferredValue = null) {
  const parts = singleSelectParts(id); if (!parts) return;
  const normalized = options.map(([value, label]) => ({ value: String(value), label: String(label) })); parts.menu.replaceChildren();
  if (!normalized.length) { parts.input.value = ''; parts.label.textContent = '—'; parts.button.disabled = true; return; }
  parts.button.disabled = false; const wanted = preferredValue == null ? parts.input.value : String(preferredValue); const selected = normalized.find(option => option.value === wanted) ?? normalized[0];
  parts.input.value = selected.value; parts.label.textContent = selected.label;
  for (const option of normalized) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.value = option.value; button.setAttribute('role','menuitemradio'); button.setAttribute('aria-checked', option.value === selected.value ? 'true' : 'false');
    const check=document.createElement('span'); check.className='menu-check'; const text=document.createElement('span'); text.className='menu-label'; text.textContent=option.label; button.append(check,text);
    button.addEventListener('click', event => { event.stopPropagation(); const changed = parts.input.value !== option.value; parts.input.value = option.value; parts.label.textContent = option.label; for (const choice of parts.menu.querySelectorAll('[data-value]')) choice.setAttribute('aria-checked', choice.dataset.value === option.value ? 'true' : 'false'); parts.menu.hidden = true; parts.button.setAttribute('aria-expanded','false'); parts.button.focus(); if (changed) parts.input.dispatchEvent(new Event('change',{bubbles:true})); });
    parts.menu.append(button);
  }
}

function initializeCustomSingleSelects() {
  for (const [id, options] of Object.entries(STATIC_SINGLE_SELECT_OPTIONS)) setSingleSelectOptions(id, options, $(`#${id}`).value);
  $$('[data-single-select]').forEach(host => { const button = host.querySelector('[data-single-select-button]'); const menu = host.querySelector('[data-single-select-menu]'); button.addEventListener('click', event => { event.stopPropagation(); if (button.disabled) return; toggleMenu(button, menu); }); });
}

window.addEventListener('task-theme-change', () => {
  populateViewMenu();
  Charts.hideTooltip?.();
  if (state.snapshot) requestAnimationFrame(() => renderAll());
});

let appStarted = false;
async function startApp() {
  if (appStarted) return;
  appStarted = true;
  initializeRowHover();
  try {
    await import('/theme.js');
    await window.TaskTheme?.ready;
  } catch {}
  Fun.initialize();
  initializeCustomSingleSelects();
  initializeTouchHelp();
  initializeAnalysisTabs();
  await loadSnapshot();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApp, { once: true }); else startApp();
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
