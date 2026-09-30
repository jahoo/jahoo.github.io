// ================================================================
//  Expectation — menu.js
//  A small listbox for the control bar whose options can hold typeset
//  math (a native <select> shows only plain text). Markup:
//    <div class="ex-menu"><button class="ex-menu-btn">
//        <span class="ex-menu-cur">…</span><span class="ex-menu-caret">▾</span></button>
//      <ul class="ex-menu-list" role="listbox" hidden><li role="option" data-v="…">…</li>…</ul></div>
//  The button shows a copy of the chosen option. The list opens below the
//  button in fixed position (the bar may scroll sideways, which would clip
//  it), and closes on a choice, Escape, a click elsewhere or a scroll.
// ================================================================

export function createMenu(root) {
    const btn = root.querySelector('.ex-menu-btn'), cur = root.querySelector('.ex-menu-cur');
    const list = root.querySelector('.ex-menu-list'), items = [...list.querySelectorAll('[role=option]')];
    const listeners = [];
    let value = (items.find(li => li.getAttribute('aria-selected') === 'true') || items[0]).dataset.v;
    items.forEach(li => { li.tabIndex = -1; });

    const shown = () => items.filter(li => !li.hidden);
    function render() {
        for (const li of items) li.setAttribute('aria-selected', li.dataset.v === value ? 'true' : 'false');
        const li = items.find(x => x.dataset.v === value);
        if (li) cur.replaceChildren(...[...li.childNodes].map(n => n.cloneNode(true)));
    }
    function open() {
        const r = btn.getBoundingClientRect();
        Object.assign(list.style, { left: r.left + 'px', top: r.bottom + 4 + 'px', minWidth: r.width + 'px' });
        list.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        (items.find(x => x.dataset.v === value && !x.hidden) || shown()[0])?.focus();
    }
    function close(refocus) {
        if (list.hidden) return;
        list.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        if (refocus) btn.focus();
    }
    function choose(v) {
        close(true);
        if (v === value) return;
        value = v; render();
        listeners.forEach(f => f());
    }

    btn.addEventListener('click', () => (list.hidden ? open() : close(false)));
    btn.addEventListener('keydown', e => {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
    });
    list.addEventListener('click', e => { const li = e.target.closest('[role=option]'); if (li && !li.hidden) choose(li.dataset.v); });
    list.addEventListener('keydown', e => {
        const vis = shown(), i = vis.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); vis[Math.min(vis.length - 1, i + 1)]?.focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); vis[Math.max(0, i - 1)]?.focus(); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (vis[i]) choose(vis[i].dataset.v); }
        else if (e.key === 'Escape') { e.preventDefault(); close(true); }
        else if (e.key === 'Tab') close(false);
    });
    document.addEventListener('pointerdown', e => { if (!root.contains(e.target)) close(false); });
    addEventListener('scroll', () => close(false), { passive: true });
    addEventListener('resize', () => close(false));

    return {
        get value() { return value; },
        set value(v) { if (v !== value) { value = v; render(); } },
        // show or hide one option (a hidden option can still be the value, set by the page)
        hide(v, hidden) { const li = items.find(x => x.dataset.v === v); if (li) li.hidden = hidden; },
        addEventListener(type, f) { if (type === 'change') listeners.push(f); },
    };
}
