/* ============================================================================
 * WedEazzy notification popups
 *
 * The site used native alert() in 39 places — a browser-chrome dialog that
 * blocks the page, looks nothing like the brand, and on mobile reads as
 * "wedeazzy.com says". This replaces it with a styled toast.
 *
 * window.alert is overridden rather than editing every call site, so existing
 * and future alert() calls are upgraded automatically. Call
 * wedeazzyNotify(message, type) directly to pick a type: 'success', 'error',
 * 'info' (default). Native confirm() is left alone — it returns a boolean
 * synchronously and cannot be replaced without rewriting each caller.
 * ========================================================================== */
(function () {
  if (window.wedeazzyNotify) return;

  var STYLE_ID = 'wz-notify-style';
  var WRAP_ID = 'wz-notify-wrap';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '#' + WRAP_ID + '{position:fixed;top:20px;right:20px;z-index:2147483000;',
      'display:flex;flex-direction:column;gap:10px;max-width:min(380px,calc(100vw - 32px));pointer-events:none;}',
      '.wz-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:12px;',
      'background:#fff;color:#2A2320;border:1px solid #E8DFD4;border-left:4px solid #8B1E3F;',
      'border-radius:12px;padding:14px 16px;box-shadow:0 12px 32px rgba(60,25,15,.16);',
      "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14.5px;line-height:1.5;",
      'opacity:0;transform:translateY(-8px) scale(.98);transition:opacity .22s ease,transform .22s ease;}',
      '.wz-toast.wz-in{opacity:1;transform:translateY(0) scale(1);}',
      '.wz-toast.wz-success{border-left-color:#1E7A4B;}',
      '.wz-toast.wz-error{border-left-color:#C1272D;}',
      '.wz-toast-icon{flex:0 0 auto;width:20px;height:20px;border-radius:50%;display:flex;',
      'align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;background:#8B1E3F;margin-top:1px;}',
      '.wz-success .wz-toast-icon{background:#1E7A4B;}',
      '.wz-error .wz-toast-icon{background:#C1272D;}',
      '.wz-toast-msg{flex:1 1 auto;word-break:break-word;white-space:pre-wrap;}',
      '.wz-toast-close{flex:0 0 auto;background:none;border:none;cursor:pointer;color:#9A8F87;',
      'font-size:18px;line-height:1;padding:0 2px;font-family:inherit;}',
      '.wz-toast-close:hover{color:#2A2320;}',
      '@media (max-width:520px){#' + WRAP_ID + '{top:12px;right:12px;left:12px;max-width:none;}}',
      '@media (prefers-reduced-motion:reduce){.wz-toast{transition:none;}}'
    ].join('');
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function wrapper() {
    var w = document.getElementById(WRAP_ID);
    if (!w) {
      w = document.createElement('div');
      w.id = WRAP_ID;
      w.setAttribute('role', 'status');
      w.setAttribute('aria-live', 'polite');
      document.body.appendChild(w);
    }
    return w;
  }

  function dismiss(toast) {
    if (!toast || toast.dataset.closing) return;
    toast.dataset.closing = '1';
    toast.classList.remove('wz-in');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 240);
  }

  window.wedeazzyNotify = function (message, type) {
    var text = String(message == null ? '' : message);
    if (!text) return;
    // Before <body> exists (a script in <head>), fall back rather than throw.
    if (!document.body) {
      try { console.log('[WedEazzy] ' + text); } catch (e) {}
      return;
    }
    injectStyle();

    var kind = type === 'success' || type === 'error' ? type : 'info';
    var toast = document.createElement('div');
    toast.className = 'wz-toast wz-' + kind;

    var icon = document.createElement('span');
    icon.className = 'wz-toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = kind === 'success' ? '✓' : kind === 'error' ? '!' : 'i';

    var msg = document.createElement('div');
    msg.className = 'wz-toast-msg';
    msg.textContent = text; // textContent, never innerHTML — messages carry user input

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'wz-toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';
    close.addEventListener('click', function () { dismiss(toast); });

    toast.appendChild(icon);
    toast.appendChild(msg);
    toast.appendChild(close);
    wrapper().appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('wz-in'); });

    // Longer messages need longer to read.
    var ms = Math.min(9000, Math.max(4000, text.length * 70));
    setTimeout(function () { dismiss(toast); }, ms);
  };

  // Upgrade every existing alert() call site in one move.
  window.alert = function (message) {
    window.wedeazzyNotify(message, 'info');
  };
})();
