// Highlight the active nav link based on current URL path
(function() {
  var path = location.pathname;
  var links = document.querySelectorAll('.site-nav .page-link');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href');
    if (href === '/') {
      if (path === '/' || path === '/index.html') links[i].classList.add('active');
    } else if (path.indexOf(href) === 0 || path.indexOf(href.replace(/\/$/, '')) === 0) {
      links[i].classList.add('active');
    }
  }
})();
