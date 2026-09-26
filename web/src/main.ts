/**
 * Entry point. The dictionary must be in place before anything renders.
 *
 * Static imports on purpose: a dynamic `import('./app')` would be a separate
 * chunk and one more serial round trip on slow 3G. In production `initI18n`
 * reads the dictionary inlined in the shell, so it resolves on the next
 * microtask; only `vite dev` actually waits for a fetch. Consequence for every
 * module: `t()` is never called at module top level, only inside functions.
 */

import './styles/tokens.css';
import './styles/base.css';
import { initI18n, loadFull } from './i18n';
import { start } from './app';
import { startTour } from './tour';

void initI18n().then(() => {
  document.getElementById('tour-button')?.addEventListener('click', () => {
    void loadFull().then(startTour);
  });
  start();
});
