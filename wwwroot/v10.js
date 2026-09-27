(() => {
  'use strict';
  const style = document.createElement('style');
  style.textContent = `
    .single-arrow-select { position:relative; display:inline-block; vertical-align:middle; }
    .single-arrow-select .native-retro-select {
      -webkit-appearance:none; appearance:none;
      min-width:92px; padding:4px 28px 4px 8px;
      background:var(--face); box-shadow:1px 1px 0 #000;
    }
    .single-arrow-select .single-arrow-select-icon {
      position:absolute; right:8px; top:50%; transform:translateY(-50%);
      font-size:9px; line-height:1; pointer-events:none;
    }
  `;
  document.head.append(style);
  for (const select of document.querySelectorAll('select.native-retro-select')) {
    if (select.closest('.single-arrow-select')) continue;
    const wrapper = document.createElement('span');
    wrapper.className = 'single-arrow-select';
    select.before(wrapper);
    wrapper.append(select);
    const arrow = document.createElement('span');
    arrow.className = 'single-arrow-select-icon';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '▼';
    wrapper.append(arrow);
  }
  document.title = 'TaskList Stats v0.10';
  const title = document.querySelector('.title-left');
  if (title) title.textContent = 'TaskList Stats v0.10';
  const status = document.querySelector('#statusLeft');
  if (status) status.textContent = 'TaskList Stats v0.10';
  const about = document.querySelector('#aboutDialog strong');
  if (about) about.textContent = 'TaskList Stats v0.10';
  if (state?.snapshot) renderAll();
})();
