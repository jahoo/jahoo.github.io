// Entry point: esbuild bundles this to /assets/js/resampling-trained-proposals.bundle.js.
import { init } from './main.js';

if (document.readyState !== 'loading') {
    init();
} else {
    document.addEventListener('DOMContentLoaded', init);
}
