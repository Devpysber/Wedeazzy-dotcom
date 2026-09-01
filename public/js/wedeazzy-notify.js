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
 * 'info' (default).
 *
 * wedeazzyConfirm(message, opts) is the confirm() replacement. It returns a
 * Promise<boolean> rather than a synchronous boolean, so each caller had to
 * be converted to await it — every one of them was already an async function.
 * It resolves false for anything that is not an explicit click on the confirm
 * button (Escape, backdrop click, Cancel), so a destructive action can never
 * proceed by accident.
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
      '@media (prefers-reduced-motion:reduce){.wz-toast{transition:none;}}',
      /* confirm dialog */
      '.wz-backdrop{position:fixed;inset:0;z-index:2147483100;background:rgba(30,16,12,.55);',
      'display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .18s ease;}',
      '.wz-backdrop.wz-in{opacity:1;}',
      '.wz-dialog{background:#fff;border-radius:16px;max-width:440px;width:100%;padding:26px 26px 20px;',
      'box-shadow:0 24px 60px rgba(40,15,10,.3);border:1px solid #E8DFD4;',
      "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2A2320;",
      'transform:translateY(10px) scale(.97);transition:transform .18s ease;}',
      '.wz-backdrop.wz-in .wz-dialog{transform:translateY(0) scale(1);}',
      '.wz-dialog-title{font-size:17.5px;font-weight:700;margin:0 0 8px;}',
      '.wz-dialog-msg{font-size:14.5px;line-height:1.6;margin:0 0 22px;white-space:pre-wrap;color:#5A514B;}',
      '.wz-dialog-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;}',
      '.wz-btn{font:inherit;font-size:14px;font-weight:600;padding:10px 20px;border-radius:999px;',
      'cursor:pointer;border:1px solid transparent;transition:filter .15s ease;}',
      '.wz-btn:hover{filter:brightness(.94);}',
      '.wz-btn-cancel{background:#F4EFEA;color:#4A423C;border-color:#E2D8CE;}',
      '.wz-btn-ok{background:#8B1E3F;color:#fff;}',
      '.wz-btn-ok.wz-danger{background:#C1272D;}',
      '@media (prefers-reduced-motion:reduce){.wz-backdrop,.wz-dialog{transition:none;}}'
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

  /**
   * Promise<boolean> replacement for confirm().
   * opts: { title, confirmText, cancelText, danger }
   */
  window.wedeazzyConfirm = function (message, opts) {
    var o = opts || {};
    // Without a body there is nothing to render into; refusing (false) is the
    // safe answer, since every caller guards a destructive action.
    if (!document.body) return Promise.resolve(false);
    injectStyle();

    return new Promise(function (resolve) {
      var settled = false;
      function finish(result) {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey, true);
        backdrop.classList.remove('wz-in');
        setTimeout(function () {
          if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
          if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
        }, 190);
        resolve(result);
      }

      var lastFocus = document.activeElement;

      var backdrop = document.createElement('div');
      backdrop.className = 'wz-backdrop';
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) finish(false);
      });

      var dialog = document.createElement('div');
      dialog.className = 'wz-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');

      var title = document.createElement('p');
      title.className = 'wz-dialog-title';
      title.textContent = o.title || 'Please confirm';

      var msg = document.createElement('p');
      msg.className = 'wz-dialog-msg';
      msg.textContent = String(message == null ? '' : message);

      var actions = document.createElement('div');
      actions.className = 'wz-dialog-actions';

      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'wz-btn wz-btn-cancel';
      cancel.textContent = o.cancelText || 'Cancel';
      cancel.addEventListener('click', function () { finish(false); });

      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'wz-btn wz-btn-ok' + (o.danger ? ' wz-danger' : '');
      ok.textContent = o.confirmText || 'Confirm';
      ok.addEventListener('click', function () { finish(true); });

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.key === 'Enter' && document.activeElement !== cancel) { e.preventDefault(); finish(true); }
        else if (e.key === 'Tab') {
          // Keep focus inside the dialog.
          e.preventDefault();
          (document.activeElement === ok ? cancel : ok).focus();
        }
      }
      document.addEventListener('keydown', onKey, true);

      actions.appendChild(cancel);
      actions.appendChild(ok);
      dialog.appendChild(title);
      dialog.appendChild(msg);
      dialog.appendChild(actions);
      backdrop.appendChild(dialog);
      document.body.appendChild(backdrop);
      requestAnimationFrame(function () {
        backdrop.classList.add('wz-in');
        // Cancel takes initial focus so a stray Enter/Space does not destroy anything.
        cancel.focus();
      });
    });
  };
})();
