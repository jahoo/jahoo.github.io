// ================================================================
//  Differential entropy — controls.js
//  This post's control bar: the common controls (case, p_X, reset)
//  plus β, which tempers the pmf (discrete only; the bar hides it in
//  the continuous case through body[data-ex-case]).
// ================================================================

import { bindCommonControls } from '../lib/prob/controls.js';
// The temperature post's slider scale, so β slides the same way there and
// here: log-scaled, 1 at the center, snapping to 0 and ∞ at the ends. It
// speaks in T = 1/β, and 1/∞ = 0 and 1/0 = ∞ carry the snaps across.
import { sliderToT, tToSlider, SLIDER_MAX } from '../temperature/sliderscale.js';

const $ = id => document.getElementById(id);

const sliderToBeta = v => 1 / sliderToT(v, false);
const betaToSlider = b => tToSlider(1 / b, false);

// the temperature post's β readout: the snaps by name, else three figures
const fmtBeta = b => (b === Infinity ? '∞' : String(Number(b.toPrecision(3))));

export function bindControls({ model, pos, redraw, onReset }) {
    const slider = $('de-beta'), label = $('de-betav');
    const common = bindCommonControls({ model, pos, redraw }, { afterCase: () => pos.setU(0.6), onReset });
    if (slider) slider.max = String(SLIDER_MAX);
    // setBeta notifies the model's subscribers, which redraw
    slider?.addEventListener('input', () => model.setBeta(sliderToBeta(+slider.value)));

    function update() {
        common.update();
        if (slider && sliderToBeta(+slider.value) !== model.beta) slider.value = String(betaToSlider(model.beta));
        if (label) label.textContent = fmtBeta(model.beta);
    }

    return { update };
}
