// Inject a clickable "§" self-link into each h1-h4 in <main>. Runs
// client-side so it doesn't pollute Pandoc's TOC (the TOC copies
// heading content — including raw inlines — so putting the anchor
// in the AST via a Lua filter creates <a><a>§</a>Title</a>, which
// browsers flatten, killing the outer TOC link).
//
// Styled via `.section-mark` in assets/css/overrides.css.
(function () {
  function run() {
    const main = document.querySelector('main');
    if (!main) return;
    const headings = main.querySelectorAll('h1:not(.title), h2, h3, h4');
    headings.forEach((h) => {
      // Resolve the id either from the heading or from the wrapping section.
      let id = h.id;
      if (!id) {
        const section = h.closest('section[id]');
        if (section) id = section.id;
      }
      if (!id) return;
      if (h.querySelector('.section-mark')) return; // idempotent
      const a = document.createElement('a');
      a.className = 'section-mark';
      a.href = '#' + id;
      a.setAttribute('aria-hidden', 'true');
      a.textContent = '§';
      h.insertBefore(a, h.firstChild);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
