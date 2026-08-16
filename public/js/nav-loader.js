/* WedEazzy nav-loader — a slim top progress bar that gives instant feedback on
   click, before the browser actually finishes navigating to the next page.
   Drop-in: just add <script src="js/nav-loader.js"></script> to any page. */
(function () {
  if (document.getElementById('wedeazzy-navloader')) return;

  var style = document.createElement('style');
  style.innerHTML = [
    '#wedeazzy-navloader { position: fixed; top: 0; left: 0; height: 3px; width: 0%;',
    '  background: linear-gradient(90deg, var(--red, #DC1F30), var(--gold, #C9A33A)); z-index: 100000;',
    '  transition: width 0.25s ease, opacity 0.3s ease; opacity: 0; pointer-events: none; }',
    '#wedeazzy-navloader.active { opacity: 1; }',
    // Subtle whole-page fade-in on load, matching the top progress bar so a
    // click-through feels like one continuous motion rather than a hard cut.
    // Skipped entirely for users who prefer reduced motion.
    '@media (prefers-reduced-motion: no-preference) {',
    '  body { animation: wedeazzy-page-fade 0.35s ease both; }',
    '  @keyframes wedeazzy-page-fade { from { opacity: 0; } to { opacity: 1; } }',
    '}',
  ].join('\n');
  document.head.appendChild(style);

  var bar = document.createElement('div');
  bar.id = 'wedeazzy-navloader';
  document.documentElement.appendChild(bar);

  var trickleTimer = null;
  var safetyTimer = null;

  function start() {
    clearInterval(trickleTimer);
    clearTimeout(safetyTimer);
    bar.style.width = '0%';
    bar.classList.add('active');
    // Force reflow so the width transition actually animates from 0%.
    void bar.offsetWidth;
    bar.style.width = '30%';

    var pct = 30;
    trickleTimer = setInterval(function () {
      pct += (90 - pct) * 0.1;
      bar.style.width = Math.min(pct, 90) + '%';
    }, 200);

    // Safety net: if nothing actually navigates (e.g. the link was
    // intercepted by other JS), don't leave the bar stuck forever.
    safetyTimer = setTimeout(finish, 8000);
  }

  function finish() {
    clearInterval(trickleTimer);
    clearTimeout(safetyTimer);
    bar.style.width = '100%';
    setTimeout(function () {
      bar.classList.remove('active');
      setTimeout(function () { bar.style.width = '0%'; }, 300);
    }, 200);
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (a.target && a.target !== '' && a.target !== '_self') return; // new tab/window
    if (a.hasAttribute('download')) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0 || href.indexOf('javascript:') === 0) return;
    if (a.origin && a.origin !== window.location.origin) return; // external site
    start();
  }, true);

  // Covers back/forward-cache restores where a bar could otherwise be left stuck.
  window.addEventListener('pageshow', finish);
})();

/* Keep the floating action buttons (WhatsApp pill, FAQ chat launcher, support
   widget trigger) out of the way of hero content on short/laptop-height
   screens, where their fixed bottom-corner position can visually overlap the
   hero's own CTA/search bar. Fades them in once the user scrolls past the
   first screenful, a standard pattern for this exact overlap problem. */
(function () {
  var SELECTORS = '.float-wa, .wf-trigger, .we-support-trigger';
  var THRESHOLD = 420;
  var ticking = false;

  function apply() {
    ticking = false;
    // On pages too short to scroll past the threshold at all (there's no tall
    // hero to overlap), just show the buttons — hiding them with nowhere to
    // scroll to would make them permanently unreachable.
    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    var show = maxScroll <= THRESHOLD || window.scrollY > THRESHOLD;
    document.querySelectorAll(SELECTORS).forEach(function (el) {
      el.style.transition = 'opacity 0.25s ease';
      el.style.opacity = show ? '' : '0';
      el.style.pointerEvents = show ? '' : 'none';
    });
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(apply);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('load', apply);
  window.addEventListener('pageshow', apply);
  apply();
  // Re-check shortly after load in case images/late content changed the
  // page's scrollable height (affects the "too short to scroll" fallback).
  setTimeout(apply, 1000);
})();

/* Newsletter signup — shared by the footer form on index.html, category.html,
   city.html, marketing.html and vendor.html. It used to fake success with a
   bare alert() and never send the email anywhere. Reuses the existing
   /api/contact endpoint (no new backend/DB table needed) so a real
   notification reaches the team and the success message reflects what
   actually happened. */
window.wedeazzySubscribeNewsletter = function (form) {
  var input = form.querySelector('input[type="email"]');
  var email = input ? input.value.trim() : '';
  if (!email) return false;

  var API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:4000' : window.location.origin;
  var btn = form.querySelector('button[type="submit"]');
  var originalText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Subscribing...'; }

  fetch(API_BASE + '/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Newsletter Subscriber',
      email: email,
      subject: 'Newsletter Signup',
      message: 'New newsletter subscription request from ' + email + ' on ' + location.pathname
    })
  })
    .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
    .then(function (res) {
      if (res.ok && res.data && res.data.ok) {
        alert('Thank you for subscribing to the WedEazzy newsletter!');
        form.reset();
      } else {
        alert((res.data && res.data.message) || 'Could not subscribe right now. Please try again shortly.');
      }
    })
    .catch(function () {
      alert('Could not subscribe right now — please check your connection and try again.');
    })
    .then(function () {
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    });

  return false;
};
