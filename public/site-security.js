(function () {
  // Attach the server-issued double-submit CSRF token to same-origin writes.
  var nativeFetch = window.fetch.bind(window);
  function csrfToken() {
    var match = document.cookie.match(/(?:^|;\s*)helicase_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }
  window.fetch = function (input, init) {
    var request = input instanceof Request ? input : null;
    var method = String((init && init.method) || (request && request.method) || 'GET').toUpperCase();
    var url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    if (url.origin === window.location.origin && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      var token = csrfToken();
      if (token) {
        var headers = new Headers((init && init.headers) || (request && request.headers) || {});
        if (!headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', token);
        init = Object.assign({}, init || {}, { headers: headers });
      }
    }
    return nativeFetch(input, init);
  };

  function refreshHomeClock() {
    document.querySelectorAll('#home-live-clock').forEach(function (node) {
      node.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    });
  }
  function startHomeClock() {
    refreshHomeClock();
    if (window.__helicaseHomeClock) clearInterval(window.__helicaseHomeClock);
    window.__helicaseHomeClock = setInterval(refreshHomeClock, 1000);
  }
  document.addEventListener('astro:page-load', startHomeClock);
  startHomeClock();

  function refreshProjectActivity() {
    document.querySelectorAll('[data-project-activity]').forEach(function (node) {
      var series;
      try { series = JSON.parse(node.getAttribute('data-project-activity') || '[]'); }
      catch (_) { return; }
      node.querySelectorAll('[data-project-days]').forEach(function (output) {
        var days = Number(output.getAttribute('data-project-days'));
        var cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        var count = series.reduce(function (total, event) {
          var occurredAt = Date.parse(event[0]);
          return occurredAt >= cutoff && occurredAt <= Date.now() ? total + Math.max(1, Number(event[1]) || 1) : total;
        }, 0);
        output.textContent = String(count);
      });
    });
  }
  document.addEventListener('astro:page-load', refreshProjectActivity);
  refreshProjectActivity();
})();
