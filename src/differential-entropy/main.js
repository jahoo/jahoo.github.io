// ================================================================
//  Differential entropy — main.js
//  Each figure binds to its own elements and no-ops if they're absent.
// ================================================================

import { initUniform } from './fig-uniform.js';
import { initDiscrete } from './fig-discrete.js';
import { initDensity } from './fig-density.js';
import { initQuantize } from './fig-quantize.js';
import { initStretch } from './fig-stretch.js';
import { initMI } from './fig-mi.js';

export function init() {
    initUniform();
    initDiscrete();
    initDensity();
    initQuantize();
    initStretch();
    initMI();
}
