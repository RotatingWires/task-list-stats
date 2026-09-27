(() => {
  'use strict';
  const core = document.createElement('script');
  core.src = '/v06-core.js';
  core.onload = () => {
    const next = document.createElement('script');
    next.src = '/v07.js';
    document.body.append(next);
  };
  document.body.append(core);
})();
