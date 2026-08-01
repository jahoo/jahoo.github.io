// ================================================================
//  Anchored forward KL — index.js
//  Entry point: esbuild bundles this to /assets/js/anchored-kl.bundle.js.
// ================================================================

import { init } from './main.js';
import { initContinuous } from './main-continuous.js';
import { buildTickLabels, bindDropdownClose } from './controls.js';

function boot() {
    init();
    initContinuous();
    buildTickLabels();
    bindDropdownClose();
}

if (document.readyState !== 'loading') {
    boot();
} else {
    document.addEventListener('DOMContentLoaded', boot);
}
