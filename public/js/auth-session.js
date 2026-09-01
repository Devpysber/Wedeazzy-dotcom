/* ============================================================================
 * WedEazzy shared session header
 *
 * Public pages (category, city, vendor, blog, claim, marketing, home) never
 * read the auth token, so a logged-in visitor who navigated away from their
 * dashboard saw the logged-out "Sign In / Sign Up" header on every one of
 * them. This script hydrates the header from the stored token on each page,
 * so one login is visible site-wide.
 *
 * Token storage is deliberately split: "remember me" logins write to
 * localStorage, plain logins to sessionStorage. Read both, in that order,
 * everywhere.
 * ========================================================================== */
(function () {
  var TOKEN_KEYS = ['wedeazzy_token', 'wedeazzy_vendor_token', 'wedeazzy_admin_token'];
  var API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:4000'
    : window.location.origin;

  function readToken() {
    for (var i = 0; i < TOKEN_KEYS.length; i++) {
      try {
        var v = localStorage.getItem(TOKEN_KEYS[i]) || sessionStorage.getItem(TOKEN_KEYS[i]);
        if (v) return v;
      } catch (e) {
        /* storage blocked (private mode / third-party cookie policy) — treat as logged out */
      }
    }
    return null;
  }

  function clearTokens() {
    TOKEN_KEYS.concat(['wedeazzy_admin_session']).forEach(function (k) {
      try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {}
    });
  }

  function dashboardFor(role) {
    if (role === 'admin') return '/pages/admin-dashboard.html';
    if (role === 'vendor') return '/pages/bdashboard.html';
    return '/pages/user-dashboard.html';
  }

  function headerSlot() {
    return document.querySelector('.header-right') || document.querySelector('.header-nav');
  }

  /* The home page owns the auth modal; every other page has no modal to open,
     so its Sign In sends the visitor home with ?auth=login, which index.html
     already handles on DOMContentLoaded. */
  function renderLoggedOut(slot) {
    if (document.querySelector('.wz-session-chip')) return;
    if (slot.querySelector('.btn-signin-nav')) return; // home page ships its own buttons
    var a = document.createElement('a');
    a.className = 'nav-link wz-session-signin';
    a.href = '/index.html?auth=login';
    a.textContent = 'Sign In';
    slot.insertBefore(a, slot.firstChild);
  }

  function renderLoggedIn(slot, user) {
    // Retire whatever logged-out affordance this page shipped with.
    slot.querySelectorAll('.btn-signin-nav, .btn-signup-primary, .wz-session-signin')
      .forEach(function (el) { el.remove(); });
    if (document.querySelector('.wz-session-chip')) return;

    var name = (user && (user.name || user.email)) || 'My Account';
    var wrap = document.createElement('div');
    wrap.className = 'wz-session-chip';
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:10px;';

    var dash = document.createElement('a');
    dash.className = 'nav-link';
    dash.href = dashboardFor(user && user.role);
    dash.textContent = name.length > 22 ? name.slice(0, 21) + '…' : name;
    dash.title = 'Go to my dashboard';

    var out = document.createElement('button');
    out.type = 'button';
    out.className = 'nav-link wz-session-logout';
    out.style.cssText = 'background:none;border:none;cursor:pointer;font:inherit;color:var(--ink-soft,#6b6259);';
    out.textContent = 'Log out';
    out.addEventListener('click', function () {
      clearTokens();
      fetch(API_BASE + '/api/auth/logout', { method: 'POST' })
        .catch(function () {})
        .then(function () { window.location.href = '/index.html'; });
    });

    wrap.appendChild(dash);
    wrap.appendChild(out);
    slot.insertBefore(wrap, slot.firstChild);
  }

  function hydrate() {
    var slot = headerSlot();
    if (!slot) return;

    var token = readToken();
    if (!token) return renderLoggedOut(slot);

    fetch(API_BASE + '/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (res) {
        // An expired or revoked token must not leave a half-logged-in header.
        if (res.status === 401 || res.status === 403) { clearTokens(); throw new Error('unauthenticated'); }
        if (!res.ok) throw new Error('me_failed');
        return res.json();
      })
      .then(function (data) { renderLoggedIn(slot, (data && (data.user || data)) || {}); })
      .catch(function () { renderLoggedOut(slot); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrate);
  } else {
    hydrate();
  }
})();
