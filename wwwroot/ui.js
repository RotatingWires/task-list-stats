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
    explorer: renderSearchExplorer,
    sessions: renderActivitySessions,
    flow: renderFlow,
    insights: renderInsights,
    milestones: renderMilestones,
    fun: () => Fun.render()
  };
  renderers[state.activeTab]?.();
  $('#statusLeft').textContent = `${numberFmt.format(scopedItems().length)} current items • ${scopeLabel()}`;
  const eventText = state.snapshot.eventLogAvailable ? ` • ${numberFmt.format(state.snapshot.events?.length || 0)} recorded events` : '';
  $('#statusRight').textContent = `DB updated ${formatDateTime(parseDate(state.snapshot.databaseLastWriteUtc))} • Read-only${eventText}`;
}

function switchTab(name) {
  state.activeTab = name;
  $$('.tabs [role="tab"]').forEach(btn => btn.setAttribute('aria-selected', btn.dataset.tab === name ? 'true' : 'false'));
  $$('.tab-panel').forEach(panel => panel.hidden = panel.dataset.panel !== name);
  closeMenus();
  requestAnimationFrame(() => renderAll());
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

function populateViewMenu() {
  const labels = [
    ['overview','Overview'],['trends','Trends'],['calendar','Calendar'],['lists','Lists'],['patterns','Patterns'],['trees','Trees & Titles'],
    ['history','History Explorer'],['compare','Compare'],['explorer','Search / Explorer'],['sessions','Activity Sessions'],['flow','Flow'],['insights','Insights'],['milestones','Milestones'],['fun','Fun']
  ];
  const menu=$('#viewMenu'); menu.replaceChildren();
  for(const [value,label] of labels){
    const button=document.createElement('button'); button.type='button'; button.setAttribute('role','menuitemradio'); button.setAttribute('aria-checked',value===state.activeTab?'true':'false');
    const check=document.createElement('span');check.className='menu-check';const text=document.createElement('span');text.className='menu-label';text.textContent=label;
    button.append(check,text); button.addEventListener('click',()=>{switchTab(value);populateViewMenu();}); menu.append(button);
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
  try {
    const response = await fetch('/api/snapshot', { cache: 'no-store', credentials: 'same-origin' });
    if (response.status === 401) { window.location.replace(loginUrl()); return; }
    if (!response.ok) {
      let message = `Server returned ${response.status}`;
      try { const body = await response.json(); message = body.detail || body.title || message; } catch {}
      throw new Error(message);
    }
    state.snapshot = normalizeSnapshot(await response.json());
    applyReleaseLabel(await frontendReleaseVersion(state.snapshot.version));
    const validListIds = new Set(state.snapshot.lists.map(list => list.id));
    state.selectedListIds = new Set([...state.selectedListIds].filter(id => validListIds.has(id)));
    populateListFilter();
    populateViewMenu();
    $('#databaseStatus').textContent = `${numberFmt.format(state.snapshot.items.length)} current items${state.snapshot.eventLogAvailable ? ` • ${numberFmt.format(state.snapshot.events?.length || 0)} events` : ' • event log unavailable'}`;
    $('#loadingPanel').hidden = true;
    renderAll();
  } catch (error) {
    $('#loadingPanel').hidden = true;
    const panel = $('#errorPanel'); panel.hidden = false; panel.textContent = error.message;
    $('#databaseStatus').textContent = 'Database unavailable';
  }
}

function downloadSnapshot() {
  if(!state.snapshot)return;
  const blob=new Blob([JSON.stringify(state.snapshot,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`task-list-stats-snapshot-${localDayKey(new Date())}.json`; a.click(); URL.revokeObjectURL(url);
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
$('#heatmapYear').addEventListener('change',()=>{renderYearHeatmap(scopedItems());const y=$('#heatmapYear').value;const m=$('#calendarMonth').value?.split('-')[1]||'01';$('#calendarMonth').value=`${y}-${m}`;renderMonthCalendar(scopedItems());});
$('#heatmapMode').addEventListener('change',()=>renderYearHeatmap(scopedItems()));
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

const STATIC_SINGLE_SELECT_OPTIONS = {
  trendGroup: [['day', 'Day'], ['week', 'Week'], ['month', 'Month']],
  heatmapMode: [['created', 'Created'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['activity', 'All activity']],
  hourHeatmapMode: [['created', 'Created'], ['completed', 'Completed']]
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
    const button = document.createElement('button'); button.type = 'button'; button.dataset.value = option.value; button.setAttribute('role', 'menuitemradio'); button.setAttribute('aria-checked', option.value === selected.value ? 'true' : 'false');
    const check = document.createElement('span'); check.className = 'menu-check'; const text = document.createElement('span'); text.className = 'menu-label'; text.textContent = option.label; button.append(check, text);
    button.addEventListener('click', event => { event.stopPropagation(); const changed = parts.input.value !== option.value; parts.input.value = option.value; parts.label.textContent = option.label; for (const choice of parts.menu.querySelectorAll('[data-value]')) choice.setAttribute('aria-checked', choice.dataset.value === option.value ? 'true' : 'false'); parts.menu.hidden = true; parts.button.setAttribute('aria-expanded', 'false'); parts.button.focus(); if (changed) parts.input.dispatchEvent(new Event('change', { bubbles: true })); });
    parts.menu.append(button);
  }
}

function initializeCustomSingleSelects() {
  for (const [id, options] of Object.entries(STATIC_SINGLE_SELECT_OPTIONS)) setSingleSelectOptions(id, options, $(`#${id}`).value);
  $$('[data-single-select]').forEach(host => { const button = host.querySelector('[data-single-select-button]'); const menu = host.querySelector('[data-single-select-menu]'); button.addEventListener('click', event => { event.stopPropagation(); if (button.disabled) return; toggleMenu(button, menu); }); });
}

let appStarted = false;
function startApp() {
  if (appStarted) return;
  appStarted = true;
  Fun.initialize();
  initializeCustomSingleSelects();
  initializeTouchHelp();
  initializeAnalysisTabs();
  loadSnapshot();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startApp, { once: true }); else startApp();
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
