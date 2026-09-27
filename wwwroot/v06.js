(() => {
  'use strict';
  const core = document.createElement('script');
  core.src = '/v06-core.js';
  core.onload = () => {
    const v07 = document.createElement('script');
    v07.src = '/v07.js';
    v07.onload = () => {
      const v08 = document.createElement('script');
      v08.src = '/v08.js';
      v08.onload = () => {
        const v09 = document.createElement('script');
        v09.src = '/v09.js';
        v09.onload = () => {
          const v10 = document.createElement('script');
          v10.src = '/v10.js';
          document.body.append(v10);
        };
        document.body.append(v09);
      };
      document.body.append(v08);
    };
    document.body.append(v07);
  };
  document.body.append(core);
})();
