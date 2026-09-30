import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { createEditor } from './edit.js';

// A plain-data adapter: 100 px per unit of x across, 100 px per unit of density up from y = 200.
const adapter = {
    rotated: false,
    toScreen: (x, d) => [x * 100, 200 - d * 100],
    frame: () => ({}),
    fromScreen: (f, px, py) => [px / 100, (200 - py) / 100],
    xSpan: () => [-10, 10],
    dTop: () => 2,
    densPx: pt => -pt.y,
    contains: () => true,
};

describe('p_X editor hit test', () => {
    it('a step chunk is grabbed only at its top edge, not anywhere in its column', () => {
        const m = createModel(); m.setCase('cont'); m.setPreset('steps');
        const ed = createEditor({ model: m, adapter });
        // chunk 2 is on [−0.1, 0.1] with height 0.34 / 0.2 = 1.7: its top is at y = 200 − 170 = 30
        assert.equal(ed.hit({ x: 0, y: 32 })?.type, 'level');     // at the grip
        assert.equal(ed.hit({ x: 0, y: 150 }), null);              // inside the shaded column
    });
    it('atoms that are not drawn cannot be grabbed', () => {
        const m = createModel();
        const ed = createEditor({ model: m, adapter, visible: i => i < 3 });
        const [px, py] = adapter.toScreen(5, m.p[4]);
        assert.equal(ed.hit({ x: px, y: py }), null);
        const [qx, qy] = adapter.toScreen(2, m.p[1]);
        assert.equal(ed.hit({ x: qx, y: qy })?.type, 'atom');
    });
});
