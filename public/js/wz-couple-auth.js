/* WedEazzy couple sign-in for enquiry forms.
 *
 *   WZCoupleAuth.ensure(host, { name, email, phone }) -> Promise<token>
 *
 * Resolves straight away for a signed-in couple. Otherwise emails a 6-digit
 * code (creating a free couple account for a new email via
 * /api/auth/register-and-send-otp, or signing in an existing one via
 * /api/auth/check-user), renders the code step inside `host`, and resolves
 * once /api/auth/verify-otp-login succeeds. details.onCodeStep(), if given, is
 * called when the code step is shown. Rejects with { cancelled: true }
 * when the visitor goes back to edit their details.
 */
(function () {
  var TOKEN_KEY = 'wedeazzy_token';

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch (_) { return null; } }
  function saveToken(t) { try { sessionStorage.removeItem(TOKEN_KEY); localStorage.setItem(TOKEN_KEY, t); } catch (_) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function postJson(url, body, token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
    });
  }

  // Current account if the stored token is a signed-in couple, else null
  function currentCouple() {
    var t = getToken();
    if (!t) return Promise.resolve(null);
    return fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (p) { var u = p && p.user; return u && u.role === 'couple' ? { token: t, user: u } : null; })
      .catch(function () { return null; });
  }

  var cssDone = false;
  function injectCss() {
    if (cssDone) return; cssDone = true;
    var st = document.createElement('style');
    st.textContent =
      '.wz-code{text-align:center;padding:4px 2px}' +
      '.wz-code h4{font-family:var(--serif,Georgia,serif);font-weight:500;font-size:24px;margin:0 0 6px;color:var(--ink,#1F1A17)}' +
      '.wz-code p{font-size:14px;color:var(--muted,#7A6F68);margin:0 auto 16px;max-width:360px}' +
      '.wz-code p b{color:var(--ink,#1F1A17)}' +
      '.wz-code input{display:block;width:100%;max-width:240px;margin:0 auto 10px;text-align:center;font:inherit;font-size:24px;font-weight:600;letter-spacing:.4em;padding:12px;border:1px solid var(--line-2,#DDD2C6);border-radius:12px;background:#fff;color:var(--ink,#1F1A17)}' +
      '.wz-code input:focus{outline:none;border-color:var(--ink,#1F1A17)}' +
      '.wz-code .wz-note{font-size:12px}' +
      '.wz-code .wz-err{color:#B42318;font-size:13.5px;min-height:18px;margin:0 0 8px}' +
      '.wz-code .wz-go{width:100%}' +
      '.wz-code .wz-links{display:flex;gap:10px;justify-content:center;margin-top:12px;font-size:13px}' +
      '.wz-code .wz-links button{background:none;border:0;color:var(--accent,#8E3B4A);font:inherit;font-weight:600;cursor:pointer;padding:4px}';
    document.head.appendChild(st);
  }

  function ensure(host, details) {
    return currentCouple().then(function (acc) {
      if (acc) return acc.token;
      return postJson('/api/auth/check-user', { email: details.email }).then(function (check) {
        if (!check.res.ok) throw new Error(check.data.message || 'Could not verify your email right now.');
        if (check.data.userExists) return showCode(host, details, false, check.data.devCode);
        return postJson('/api/auth/register-and-send-otp', { email: details.email, name: details.name, mobile: details.phone }).then(function (reg) {
          if (!reg.res.ok) {
            if (reg.data.code === 'ERR_USER_EXISTS') throw new Error('This phone number is already registered with a different email. Please use that email.');
            throw new Error(reg.data.message || 'Could not create your account right now.');
          }
          return showCode(host, details, true, reg.data.devCode);
        });
      });
    });
  }

  function showCode(host, details, isNew, devCode) {
    injectCss();
    return new Promise(function (resolve, reject) {
      host.innerHTML =
        '<div class="wz-code">' +
          '<h4>' + (isNew ? 'Verify your email' : 'Welcome back') + '</h4>' +
          '<p>We sent a 6-digit code to <b>' + esc(details.email) + '</b>. Enter it to ' + (isNew ? 'create your free account' : 'sign in') + ' and send your enquiry.</p>' +
          '<input class="wz-in" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="6-digit code" />' +
          (devCode ? '<p class="wz-note">Local testing: the email could not be sent, so the code was filled in.</p>' : '') +
          '<p class="wz-err" role="alert"></p>' +
          '<button type="button" class="btn btn-ink wz-go">Verify &amp; send enquiry</button>' +
          '<div class="wz-links"><button type="button" class="wz-resend">Resend code</button><button type="button" class="wz-back">Edit details</button></div>' +
        '</div>';
      // Let the caller swap its form out for the code step
      if (typeof details.onCodeStep === 'function') details.onCodeStep();
      var input = host.querySelector('.wz-in'), go = host.querySelector('.wz-go'), err = host.querySelector('.wz-err');
      if (devCode) input.value = devCode;
      setTimeout(function () { input.focus(); }, 50);

      host.querySelector('.wz-back').addEventListener('click', function () { reject({ cancelled: true }); });
      host.querySelector('.wz-resend').addEventListener('click', function () {
        err.textContent = '';
        postJson('/api/auth/check-user', { email: details.email }).then(function (r) {
          if (r.res.ok) { if (r.data.devCode) input.value = r.data.devCode; err.style.color = '#1F7A45'; err.textContent = 'New code sent.'; }
          else { err.style.color = ''; err.textContent = r.data.message || 'Could not resend right now.'; }
        });
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
      go.addEventListener('click', function () {
        var code = input.value.replace(/\D/g, '');
        err.style.color = '';
        if (code.length !== 6) { err.textContent = 'Enter the 6-digit code from your email.'; input.focus(); return; }
        go.disabled = true; err.textContent = '';
        postJson('/api/auth/verify-otp-login', { email: details.email, otp: code }).then(function (v) {
          if (!v.res.ok || !v.data.token) throw new Error(v.data.message || 'That code is not right. Please try again.');
          if (!v.data.userData || v.data.userData.role !== 'couple') throw new Error('This email belongs to a vendor account. Please use a different email for wedding enquiries.');
          saveToken(v.data.token);
          resolve(v.data.token);
        }).catch(function (e) { err.textContent = e.message; go.disabled = false; });
      });
    });
  }

  window.WZCoupleAuth = { ensure: ensure, currentCouple: currentCouple, getToken: getToken, postJson: postJson };
})();
