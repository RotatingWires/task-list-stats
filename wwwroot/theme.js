/* Shared persistent theme controller for TaskList Stats. */
(() => {
'use strict';

const STORAGE_KEY = 'task-ui-theme';
const VALID = new Set(['light', 'dark', 'system']);
const media = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null;

function ensureStylesheet() {
  const existing = document.querySelector('link[data-task-theme-styles]');
  if (existing) {
    if (existing.sheet) return Promise.resolve();
    return new Promise(resolve => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', resolve, { once: true });
    });
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/theme.css';
  link.dataset.taskThemeStyles = '';
  const ready = new Promise(resolve => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
  });
  document.head.append(link);
  return ready;
}

function readPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return VALID.has(saved) ? saved : 'light';
  } catch {
    return 'light';
  }
}

function effectiveTheme(preference) {
  if (preference !== 'system') return preference;
  return media?.matches ? 'dark' : 'light';
}

function applyTheme(preference, persist = false) {
  const selected = VALID.has(preference) ? preference : 'light';
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, selected); } catch {}
  }

  const root = document.documentElement;
  const previousPreference = root.dataset.themePreference;
  const previousEffective = root.dataset.themeEffective;
  const effective = effectiveTheme(selected);
  root.dataset.themePreference = selected;
  root.dataset.themeEffective = effective;
  root.style.colorScheme = effective;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#111858' : '#000080');

  if (previousPreference !== undefined && (previousPreference !== selected || previousEffective !== effective)) {
    window.dispatchEvent(new CustomEvent('task-theme-change', {
      detail: { preference: selected, effective }
    }));
  }
  return effective;
}

function getPreference() {
  return document.documentElement.dataset.themePreference || readPreference();
}

function getEffective() {
  return document.documentElement.dataset.themeEffective || effectiveTheme(getPreference());
}

function setPreference(preference) {
  return applyTheme(preference, true);
}

function handleSystemThemeChange() {
  if (getPreference() === 'system') applyTheme('system', false);
}

if (media?.addEventListener) media.addEventListener('change', handleSystemThemeChange);
else media?.addListener?.(handleSystemThemeChange);

window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY) applyTheme(readPreference(), false);
});

const ready = ensureStylesheet();
applyTheme(readPreference(), false);
window.TaskTheme = {
  ready,
  getPreference,
  getEffective,
  setPreference,
  options: ['light', 'dark', 'system']
};
})();
