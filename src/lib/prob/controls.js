// ================================================================
//  Probability figures — controls.js
//  The controls every page with the shared model has: the case toggle
//  (any number of `.ex-case` groups), the p_X preset menu (#ex-preset)
//  and reset (#ex-reset). Each element is optional. A page adds its
//  own controls around these through the hooks.
// ================================================================

import { DISC_PRESETS, CONT_PRESETS } from './model.js';

const $ = id => document.getElementById(id);

// A group of buttons with aria-pressed, calling onChange(value).
export function seg(box, onChange) {
    if (!box) return;
    const btns = [...box.querySelectorAll('button')];
    btns.forEach(b => b.addEventListener('click', () => {
        btns.forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        onChange(b.dataset.v);
    }));
}

// hooks: beforeCase(k) runs before the model switches case, afterCase(k) once the presets
// are refilled (before the redraw), onReset() before the model resets, stopPlay() first on
// any action here.
export function bindCommonControls({ model, pos, redraw }, { beforeCase, afterCase, onReset, stopPlay = () => {} } = {}) {
    const preset = $('ex-preset');
    function fillPresets() {
        if (!preset) return;
        const disc = model.kase === 'disc', src = disc ? DISC_PRESETS : CONT_PRESETS, cur = disc ? model.discKey : model.contKey;
        const opts = Object.entries(src).map(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v.label; return o; });
        // discrete: custom is a choice, the last edited pmf; continuous: shown only once edited
        const custom = document.createElement('option'); custom.value = 'custom'; custom.textContent = 'custom'; custom.hidden = !disc && cur !== 'custom';
        preset.replaceChildren(...opts, custom);
        preset.value = cur;
    }
    const cases = [...document.querySelectorAll('.ex-case')];
    for (const box of cases) seg(box, k => {
        if (k === model.kase) return;
        stopPlay();
        beforeCase?.(k);
        model.setCase(k); fillPresets();
        afterCase?.(k);
        redraw();
    });
    preset?.addEventListener('change', () => { stopPlay(); model.setPreset(preset.value); });
    fillPresets();

    // reset: everything as the page loads
    $('ex-reset')?.addEventListener('click', () => {
        stopPlay();
        onReset?.();
        model.reset(); // first: the position's start (x = 4.1) is a discrete one
        pos.reset();
        fillPresets();
        redraw();
    });

    // keep the case attribute and the preset menu in step with the model
    function update() {
        document.body.dataset.exCase = model.kase;
        for (const b of cases.flatMap(box => [...box.querySelectorAll('button')])) b.setAttribute('aria-pressed', b.dataset.v === model.kase ? 'true' : 'false');
        const key = model.kase === 'disc' ? model.discKey : model.contKey;
        if (preset && preset.value !== key) preset.value = key;
    }

    return { update, fillPresets };
}
