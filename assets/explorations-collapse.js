/**
 * Collapsible sections for .exploration-content
 *
 * Kramdown outputs flat heading+content (no <section> wrappers),
 * so we first auto-wrap each heading and its following siblings
 * into <section> elements, then wire up click-to-collapse.
 */
(function () {
  'use strict';

  var root = document.querySelector('.exploration-content');
  if (!root) return;

  /**
   * Wrap flat headings into <section> elements.
   * Each h2 (or h3, h4) and all following siblings until the next
   * heading of the same or higher level get wrapped in a <section>.
   */
  function wrapSections(container, headingLevel) {
    var tag = 'H' + headingLevel;
    var headings = Array.prototype.slice.call(container.querySelectorAll(':scope > ' + tag.toLowerCase()));
    // Also check uppercase
    if (headings.length === 0) {
      headings = [];
      var children = container.children;
      for (var i = 0; i < children.length; i++) {
        if (children[i].tagName === tag) headings.push(children[i]);
      }
    }

    for (var h = headings.length - 1; h >= 0; h--) {
      var heading = headings[h];
      var section = document.createElement('section');
      // Collect heading + all following siblings until next heading of same/higher level
      var sibling = heading.nextElementSibling;
      heading.parentNode.insertBefore(section, heading);
      section.appendChild(heading);
      while (sibling) {
        var next = sibling.nextElementSibling;
        // Stop at next heading of same or higher level
        if (/^H[1-9]$/.test(sibling.tagName) && parseInt(sibling.tagName[1]) <= headingLevel) break;
        // Also stop at a section that was already wrapped around a same-level heading
        if (sibling.tagName === 'SECTION') {
          var innerH = sibling.querySelector(':scope > h' + headingLevel);
          if (innerH) break;
        }
        section.appendChild(sibling);
        sibling = next;
      }
      // Copy ID from heading to section for hash navigation
      if (heading.id) {
        section.id = 'sec-' + heading.id;
      }
    }
  }

  /**
   * Wire up click-to-collapse on sections with headings.
   */
  function setupCollapsible() {
    var sections = root.querySelectorAll('section');
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      // Find the first heading child
      var heading = null;
      for (var c = 0; c < sec.children.length; c++) {
        if (/^H[1-6]$/.test(sec.children[c].tagName)) {
          heading = sec.children[c];
          break;
        }
      }
      if (!heading) continue;
      if (heading.dataset.collapsible) continue;
      heading.dataset.collapsible = 'true';
      heading.style.cursor = 'pointer';
      heading.addEventListener('click', (function (theSec) {
        return function () { theSec.classList.toggle('collapsed'); };
      })(sec));
    }
  }

  function uncollapseAncestors(el) {
    var node = el;
    while (node && node !== root) {
      if (node.tagName === 'SECTION' && node.classList.contains('collapsed')) {
        node.classList.remove('collapsed');
      }
      node = node.parentElement;
    }
  }

  function handleHash() {
    if (!location.hash) return;
    try {
      var target = document.querySelector(location.hash);
      if (target && root.contains(target)) uncollapseAncestors(target);
    } catch (e) { /* invalid selector */ }
  }

  function init() {
    // Wrap flat headings into sections (h2 first, then h3 within those)
    wrapSections(root, 2);
    var h2sections = root.querySelectorAll(':scope > section');
    for (var i = 0; i < h2sections.length; i++) {
      wrapSections(h2sections[i], 3);
    }
    setupCollapsible();
    handleHash();
  }

  // Wait for MathJax to finish typesetting before wrapping sections,
  // since MathJax can move elements around (display math becomes <mjx-container>).
  function initAfterMath() {
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) {
      MathJax.startup.promise.then(init);
    } else {
      // No MathJax or already done — init immediately
      init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAfterMath);
  } else {
    initAfterMath();
  }

  window.addEventListener('hashchange', handleHash);
})();
