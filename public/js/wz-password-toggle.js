/**
 * WedEazzy — show/hide button for every password field.
 *
 * Adds an eye button inside any <input type="password"> that doesn't already
 * have its own toggle, including fields rendered later (auth popups, modals,
 * dashboard tabs) via a MutationObserver. Fields that already have a toggle
 * (an onclick naming the field, aria-controls / data-pw-toggle pointing at
 * it, or a toggle button next to it) are left alone.
 */
(function () {
  if (window.__wzPasswordToggle) return;
  window.__wzPasswordToggle = true;

  var EYE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7c1.9 0 3.6-.6 5-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  function injectStyles() {
    if (document.getElementById('wz-pt-styles')) return;
    var style = document.createElement('style');
    style.id = 'wz-pt-styles';
    style.textContent =
      '.wz-pt-wrap{position:relative;display:block}' +
      '.wz-pt-btn{position:absolute;top:50%;right:8px;transform:translateY(-50%);width:32px;height:32px;' +
      'display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0;border:0;border-radius:8px;' +
      'background:transparent;color:#8a8f98;cursor:pointer;line-height:0;transition:color .15s ease,background .15s ease}' +
      '.wz-pt-btn:hover{color:#1f2430;background:rgba(0,0,0,.05)}' +
      '.wz-pt-btn:focus-visible{outline:2px solid #DC1F30;outline-offset:1px}' +
      '[data-theme="dark"] .wz-pt-btn{color:#9ca3af}[data-theme="dark"] .wz-pt-btn:hover{color:#f3f4f6;background:rgba(255,255,255,.08)}';
    document.head.appendChild(style);
  }

  function cssId(id) {
    return window.CSS && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
  }

  function hasOwnToggle(input) {
    if (input.dataset.wzPt) return true;
    var parent = input.parentElement;
    if (parent && parent.querySelector('.password-toggle-btn, .wz-pw-toggle, .pf-pw-toggle, .wz-pt-btn')) return true;
    var id = input.id;
    if (id) {
      var q = cssId(id);
      if (document.querySelector('[aria-controls="' + q + '"], [data-pw-toggle="' + q + '"]')) return true;
      // e.g. onclick="toggleModalPasswordVisibility('loginPassword')"
      var named = document.querySelectorAll('[onclick*="' + q + '"]');
      for (var i = 0; i < named.length; i++) {
        if (/password|toggle|show/i.test(named[i].getAttribute('onclick') || '')) return true;
      }
    }
    return false;
  }

  function enhance(input) {
    if (hasOwnToggle(input)) return;
    input.dataset.wzPt = '1';
    injectStyles();

    var wrap = document.createElement('span');
    wrap.className = 'wz-pt-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    // Keep typed text clear of the button.
    var pad = parseFloat(getComputedStyle(input).paddingRight) || 0;
    if (pad < 44) input.style.paddingRight = '44px';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wz-pt-btn';
    btn.setAttribute('aria-label', 'Show password');
    btn.title = 'Show password';
    btn.innerHTML = EYE;
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? EYE_OFF : EYE;
      btn.title = show ? 'Hide password' : 'Show password';
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      input.focus();
    });
    wrap.appendChild(btn);

    // A form reset should hide the password again.
    if (input.form) {
      input.form.addEventListener('reset', function () {
        if (input.type === 'text') btn.click();
      });
    }
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('input[type="password"]')) enhance(root);
    var list = root.querySelectorAll('input[type="password"]');
    for (var i = 0; i < list.length; i++) enhance(list[i]);
  }

  function start() {
    scan(document.body);
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) scan(added[j]);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
