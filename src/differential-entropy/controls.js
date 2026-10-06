// ================================================================
//  Differential entropy — controls.js
//  This post's control bar: the common controls (case, p_X, reset)
//  plus β, which tempers the pmf (discrete only; the bar hides it in
//  the continuous case through body[data-ex-case]).
// ================================================================

import { bindCommonControls } from '../lib/prob/controls.js';

const $ = id => document.getElementById(id);

export function bindControls({ model, pos, redraw }) {
    const slider = $('de-beta'), label = $('de-betav');
    const common = bindCommonControls({ model, pos, redraw });
    // setBeta notifies the model's subscribers, which redraw
    slider?.addEventListener('input', () => model.setBeta(+slider.value));

    function update() {
        common.update();
        if (slider && +slider.value !== model.beta) slider.value = String(model.beta);
        if (label) label.textContent = model.beta.toFixed(2);
    }

    return { update };
}
