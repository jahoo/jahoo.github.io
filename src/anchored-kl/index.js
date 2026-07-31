// ================================================================
//  Anchored forward KL — index.js
//  Entry point: esbuild bundles this to /assets/js/anchored-kl.bundle.js.
// ================================================================

import { init } from './main.js';

if (document.readyState !== 'loading') {
    init();
} else {
    document.addEventListener('DOMContentLoaded', init);
}
