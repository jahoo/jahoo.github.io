// ================================================================
//  Probability figures — area-notes.js
//  The words the area figure carries, per post. The expectation post
//  speaks of a general g and "the expectation"; the entropy post has
//  g fixed to −log p_X and calls the expectation (differential) entropy.
//  Pure strings and string functions: no DOM. Every variant has every
//  key (area-notes.test.js checks), so a figure never falls back to
//  another post's wording.
//    gtex: the TeX of g(x) for the chosen g (null when g is custom)
//    mn:   what E[g(X)] is called, { tex, name }, or null
//    val:  the typeset number (already wrapped in \class{ex-neg} if negative)
// ================================================================

const MAP = '\\(F_X\\) rescales the real line into \\([0, 1]\\), so that each outcome takes up as much room as its probability. This gives us our horizontal axis.';

export const NOTES = {
    expectation: {
        dist: 'The distribution of \\(X\\): what the expectation averages over.',
        map: MAP,
        g: () => 'The function \\(g\\) gives the height to integrate.',
        gLabel: gtex => (gtex ? 'g(x) = ' + gtex : 'g(x)'),
        aLabel: () => 'g(F_X^{-1}(u))',
        avg: () => '\\mathbb{E}[g(X)]', // the average-height line in the area panel
        area: (done1, uTex) => (done1 ? 'The expectation is the whole area:' : `The area up to \\(u = \\class{ex-now}{${uTex}}\\) is:`),
        rest: 'The expectation is the whole area (slide \\(u\\) to 1).',
        integrand: () => 'g\\big(F_X^{-1}(v)\\big)',
        // the label under the brace takes no width, so a long name doesn't spread the equation
        result: ({ mn, val, unit }) => `\\mathbb{E}[g(X)] \\;=\\; ${mn ? `\\underbrace{${mn.tex}}_{\\mathclap{\\text{${mn.name}}}} \\;=\\; ` : ''}${val}${unit}`,
    },
    entropy: {
        dist: 'The distribution of \\(X\\): what the entropy averages over.',
        map: MAP,
        // surprisal names the information of an event; a density gives only a log-density
        g: disc => `The height is the ${disc ? 'surprisal' : 'negative log-density'}, \\(-\\log_2 p_X(x)\\).`,
        gLabel: gtex => gtex,
        aLabel: () => '-\\log_2 p_X(F_X^{-1}(u))',
        avg: disc => (disc ? 'H(X)' : 'h(X)'),
        area: () => 'The entropy is the whole area:',
        rest: '', // never shown: this figure is always at u = 1
        integrand: () => '-\\log_2 p_X\\big(F_X^{-1}(v)\\big)',
        result: ({ val, unit, disc }) => `${disc ? 'H(X)' : 'h(X)'} \\;=\\; \\mathbb{E}[-\\log_2 p_X(X)] \\;=\\; ${val}${unit}`,
    },
};
