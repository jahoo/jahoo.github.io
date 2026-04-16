// ================================================================
//  SMC Resampling — index.js
//  Entry point. Imports main.js (which wires everything up) and
//  calls init to trigger the first render.
//  Re-exports createPFViz so the bundled output exposes it for
//  inline <script> blocks that create particle filter instances.
// ================================================================

import { init } from './main.js';
import { initPFInstances } from './pf-instances.js';
export { createPFViz } from './particle-filter.js';
export { resample } from './algorithms.js';

// main.js does most setup at import time (event wiring, toolbar init).
// init() triggers the first redrawAll. Then init PF instances.
function startup() {
    init();
    initPFInstances();
}

if (document.readyState !== 'loading') {
    startup();
} else {
    document.addEventListener('DOMContentLoaded', startup);
}
