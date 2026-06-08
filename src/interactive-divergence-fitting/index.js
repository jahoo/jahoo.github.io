// ================================================================
//  Interactive divergence fitting — index.js
//  Entry point: esbuild bundles this to
//  /assets/js/interactive-divergence-fitting.bundle.js, which the
//  frozen HTML page (assets/frozen/interactive-divergence-fitting.html)
//  loads. main.js holds the state and wiring; init() starts the loop.
// ================================================================

import { init } from './main.js';

if (document.readyState !== 'loading') {
    init();
} else {
    document.addEventListener('DOMContentLoaded', init);
}
