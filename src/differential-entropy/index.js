// ================================================================
//  Differential entropy — index.js
//  Entry point: esbuild bundles this to /assets/js/differential-entropy.bundle.js.
// ================================================================

import { init } from './main.js';

if (document.readyState !== 'loading') {
    init();
} else {
    document.addEventListener('DOMContentLoaded', init);
}
