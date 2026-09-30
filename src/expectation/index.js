// ================================================================
//  Expectation — index.js
//  Entry point: esbuild bundles this to /assets/js/expectation.bundle.js.
// ================================================================

import { init } from './main.js';

if (document.readyState !== 'loading') {
    init();
} else {
    document.addEventListener('DOMContentLoaded', init);
}
