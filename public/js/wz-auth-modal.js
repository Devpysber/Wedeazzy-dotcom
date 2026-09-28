/* ============================================================================
 * WedEazzy sign-in / sign-up modal.
 *
 * Moved out of the old index.html so any page can host it. Include this script
 * at the end of <body> (after /js/wedeazzy-notify.js). It injects the modal
 * and its styles, exposes openAuthModal(mode, role) and the other handlers the
 * markup calls, and opens itself for ?auth=login|signup (&as=couple|vendor) and
 * for ?google_error=… redirects from the Google sign-in callback.
 * ========================================================================== */
(function injectAuthModal() {
  if (document.getElementById('authModal')) return;
  var style = document.createElement('style');
  style.id = 'wz-auth-modal-style';
  style.textContent = "#authModal {\n  --ink: #1A1A1A; --text: #1A1A1A; --text-mute: #4E4A49; --text-light: #7E7674;\n  --line: #EAE1D7; --cream: #FAF8F5; --cream-2: #F6F3EE; --blush: #FCF5F6; --blush-2: #F3DDE0;\n  --gold: #C1272D; --gold-dark: #8B1E3F; --red: #8B1E3F;\n  --serif: 'Playfair Display', Georgia, serif;\n  --r: 16px; --r-l: 24px; --r-pill: 999px;\n  --shadow: 0 12px 30px -10px rgba(40,20,25,0.06); --shadow-lg: 0 24px 60px -15px rgba(40,20,25,0.12);\n  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--ink);\n}\n#authModal *, #authModal *::before, #authModal *::after { box-sizing: border-box; }\n/* Utility class names the markup carries (never had stylesheet rules of their own). */\n#authModal .text-center { text-align: center; }\n#authModal .font-serif { font-family: var(--serif); }\n#authModal .font-semibold { font-weight: 600; }\n#authModal .italic { font-style: italic; }\n#authModal .text-2xl { font-size: 1.5rem; line-height: 1.25; }\n#authModal .text-xs { font-size: 0.8rem; }\n#authModal .text-ink { color: var(--ink); }\n#authModal .text-text-mute { color: var(--text-mute); }\n#authModal .text-red { color: #C1272D; }\n#authModal .mt-2 { margin-top: 0.5rem; } #authModal .mb-2 { margin-bottom: 0.5rem; }\n#authModal .mt-6 { margin-top: 1.5rem; } #authModal .mb-6 { margin-bottom: 1.5rem; }\n\n.auth-overlay {\r\n    position: fixed;\r\n    inset: 0;\r\n    z-index: 1000;\r\n    background: rgba(20, 8, 10, 0.65);\r\n    backdrop-filter: blur(12px);\r\n    -webkit-backdrop-filter: blur(12px);\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    opacity: 0;\r\n    pointer-events: none;\r\n    transition: opacity 0.3s ease-in-out;\r\n  }\n\n.auth-overlay.active {\r\n    opacity: 1;\r\n    pointer-events: auto;\r\n  }\n\n.auth-modal {\r\n    width: 100%;\r\n    max-width: 480px;\r\n    background: #FFFFFF;\r\n    border: 1px solid var(--line);\r\n    border-radius: var(--r-l);\r\n    padding: 36px;\r\n    box-shadow: var(--shadow-lg);\r\n    transform: scale(0.94) translateY(20px);\r\n    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);\r\n    position: relative;\r\n    max-height: 90vh;\r\n    overflow-y: auto;\r\n  }\n\n.auth-overlay.active .auth-modal {\r\n    transform: scale(1) translateY(0);\r\n  }\n\n.auth-close {\r\n    position: absolute;\r\n    top: 24px;\r\n    right: 24px;\r\n    width: 32px;\r\n    height: 32px;\r\n    border-radius: 50%;\r\n    background: var(--cream);\r\n    color: var(--text-mute);\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    font-size: 20px;\r\n    font-weight: 500;\r\n    transition: all 0.2s;\r\n  }\n\n.auth-close:hover {\r\n    background: var(--blush-2);\r\n    color: #B3131F;\r\n  }\n\n.role-grid {\r\n    display: grid;\r\n    grid-template-columns: 1fr;\r\n    gap: 16px;\r\n    margin-top: 24px;\r\n  }\n\n.role-card-ui {\r\n    background: var(--cream);\r\n    border: 1.5px solid var(--line);\r\n    border-radius: var(--r);\r\n    padding: 24px 20px;\r\n    text-align: center;\r\n    cursor: pointer;\r\n    transition: all 0.25s ease-out;\r\n    display: flex;\r\n    flex-direction: column;\r\n    align-items: center;\r\n    gap: 12px;\r\n  }\n\n.role-card-ui:hover {\r\n    transform: translateY(-2px);\r\n    border-color: #DC1F30;\r\n    box-shadow: var(--shadow);\r\n  }\n\n.role-card-ui.couple:hover {\r\n    background: var(--blush);\r\n  }\n\n.role-card-ui.vendor:hover {\r\n    background: #FFFBF0;\r\n    border-color: var(--gold);\r\n  }\n\n.role-icon-wrap {\r\n    width: 60px;\r\n    height: 60px;\r\n    border-radius: 50%;\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    font-size: 28px;\r\n  }\n\n.role-card-ui.couple .role-icon-wrap {\r\n    background: var(--blush-2);\r\n    color: #DC1F30;\r\n  }\n\n.role-card-ui.vendor .role-icon-wrap {\r\n    background: #F3ECE2;\r\n    color: var(--gold-dark, #97762E);\r\n  }\n\n.role-card-ui h3 {\r\n    font-family: var(--serif);\r\n    font-size: 19px;\r\n    font-weight: 600;\r\n    color: var(--ink);\r\n  }\n\n.role-card-ui p {\r\n    font-size: 13px;\r\n    color: var(--text-mute);\r\n  }\n\n.auth-form-group {\r\n    margin-bottom: 18px;\r\n    text-align: left;\r\n  }\n\n.auth-form-group label {\r\n    display: block;\r\n    font-size: 11px;\r\n    font-weight: 700;\r\n    text-transform: uppercase;\r\n    letter-spacing: 0.8px;\r\n    color: var(--text-mute);\r\n    margin-bottom: 6px;\r\n  }\n\n.auth-input {\r\n    width: 100%;\r\n    background: var(--cream);\r\n    border: 1px solid var(--line);\r\n    border-radius: 8px;\r\n    padding: 11px 14px;\r\n    font-size: 14.5px;\r\n    color: var(--ink);\r\n    font-family: inherit;\r\n    outline: none;\r\n    transition: all 0.15s;\r\n  }\n\n.auth-input:focus {\r\n    border-color: #DC1F30;\r\n    background: #FFF;\r\n    box-shadow: 0 0 0 3px rgba(166,28,38,0.08);\r\n  }\n\n.auth-input.error {\r\n    border-color: #DC1F30;\r\n    background: #FFF5F6;\r\n  }\n\n.btn-submit-premium {\r\n    width: 100%;\r\n    background: #DC1F30;\r\n    color: #FFFFFF;\r\n    padding: 12px 24px;\r\n    border-radius: var(--r-pill);\r\n    font-weight: 600;\r\n    font-size: 14.5px;\r\n    box-shadow: 0 6px 16px rgba(166,28,38,0.2);\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    gap: 8px;\r\n    transition: all 0.2s;\r\n  }\n\n.btn-submit-premium:hover {\r\n    background: #B3131F;\r\n    transform: translateY(-1px);\r\n    box-shadow: 0 8px 20px rgba(166,28,38,0.25);\r\n  }\n\n.btn-oauth-google {\r\n    width: 100%;\r\n    background: #FFFFFF;\r\n    color: var(--ink);\r\n    border: 1px solid var(--line);\r\n    padding: 11px 24px;\r\n    border-radius: var(--r-pill);\r\n    font-weight: 600;\r\n    font-size: 13.5px;\r\n    display: flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    gap: 8px;\r\n    transition: all 0.2s;\r\n    margin-top: 14px;\r\n  }\n\n.btn-oauth-google:hover {\r\n    background: var(--cream);\r\n    border-color: var(--text-light);\r\n  }\n\n.login-role { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: var(--cream-2); border: 1px solid var(--line); border-radius: 16px; padding: 5px; margin-bottom: 18px; }\n\n.login-role button { border: 0; background: transparent; border-radius: 12px; padding: 10px 8px; cursor: pointer; font-family: inherit; text-align: center; color: var(--text-mute); transition: background .2s, color .2s, box-shadow .2s; }\n\n.login-role button strong { display: block; font-size: 14.5px; color: inherit; }\n\n.login-role button small { display: block; font-size: 11.5px; opacity: .85; margin-top: 1px; }\n\n.login-role button[aria-checked=\"true\"] { background: #fff; color: #DC1F30; box-shadow: 0 4px 14px rgba(40,20,25,.10); }\n\n.login-role button[aria-checked=\"true\"][data-login-role=\"vendor\"] { color: #1B2A4A; }\n\n.oauth-divider { display: flex; align-items: center; gap: 12px; margin: 16px 0 12px; color: var(--text-light); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }\n\n.oauth-divider::before, .oauth-divider::after { content: \"\"; flex: 1; height: 1px; background: var(--line); }\n\n#loginError { margin: 0 0 14px; }\n\n.oauth-error.is-ok { background: #E8F5EE; color: #1F6B45; }\n\n.oauth-error { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: #FDECEE; color: #A61C26; font-size: 13px; line-height: 1.45; text-align: left; }\n\n@media (max-width: 480px) {\n  .auth-modal {\r\n      padding: 24px;\r\n      margin: 16px;\r\n      border-radius: 16px;\r\n    }\n}";
  document.head.appendChild(style);
  var wrap = document.createElement('div');
  wrap.innerHTML = "<div class=\"auth-overlay\" id=\"authModal\" onclick=\"closeAuthModalOnBackdrop(event)\">\n  <div class=\"auth-modal\">\n    <button class=\"auth-close\" onclick=\"closeAuthModal()\">&times;</button>\n    \n    <!-- Screen 1: Role Selection -->\n    <div id=\"screenRolePick\">\n      <h2 class=\"font-serif text-2xl text-center text-ink font-semibold mb-2\" style=\"margin-top: 10px;\">Create your account</h2>\n      <p class=\"text-xs text-center text-text-mute mb-6\" style=\"font-size: 13.5px; color: var(--text-mute);\">Join WedEazzy to plan your wedding or grow your business</p>\n      \n      <div class=\"role-grid\">\n        <div class=\"role-card-ui couple\" onclick=\"selectRole('couple')\">\n          <div class=\"role-icon-wrap\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" width=\"28\" height=\"28\"><circle cx=\"9\" cy=\"14\" r=\"6\"/><circle cx=\"15\" cy=\"14\" r=\"6\"/></svg></div>\n          <h3>I am a Couple</h3>\n          <p>Looking to search, shortlist, and book verified wedding vendors directly.</p>\n        </div>\n\n        <div class=\"role-card-ui vendor\" onclick=\"selectRole('vendor')\">\n          <div class=\"role-icon-wrap\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" width=\"28\" height=\"28\"><rect x=\"3\" y=\"7\" width=\"18\" height=\"13\" rx=\"2\"/><path d=\"M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2\"/><line x1=\"3\" y1=\"12\" x2=\"21\" y2=\"12\"/></svg></div>\n          <h3>I am a Vendor / Venue</h3>\n          <p>Looking to list my business, showcase my portfolio, and get direct leads.</p>\n        </div>\n      </div>\n      \n      <p class=\"text-xs text-center text-text-mute mt-6\" style=\"margin-top: 28px; font-size: 13.5px; color: var(--text-mute); text-align: center;\">Already have an account? <button onclick=\"toggleAuthMode('login')\" style=\"color: #DC1F30; font-weight: 700; background: none; border: none; cursor: pointer; font-family: inherit; font-size: inherit;\">Sign In</button></p>\n    </div>\n\n    <!-- Screen 2: Login Form -->\n    <div id=\"screenLogin\" style=\"display: none;\">\n      <h2 class=\"font-serif text-2xl text-center text-ink font-semibold mb-2\" style=\"margin-top: 10px;\">Sign in to WedEazzy</h2>\n      <p class=\"text-xs text-center text-text-mute\" style=\"font-size: 13.5px; color: var(--text-mute); margin-bottom: 16px;\">Who are you signing in as?</p>\n\n      <!-- Account type: applies to password AND Google sign-in; the server enforces it -->\n      <div class=\"login-role\" role=\"radiogroup\" aria-label=\"Sign in as\">\n        <button type=\"button\" role=\"radio\" aria-checked=\"true\" data-login-role=\"couple\" onclick=\"setLoginRole('couple')\">\n          <strong>Couple</strong><small>Planning my wedding</small>\n        </button>\n        <button type=\"button\" role=\"radio\" aria-checked=\"false\" data-login-role=\"vendor\" onclick=\"setLoginRole('vendor')\">\n          <strong>Vendor</strong><small>I run a wedding business</small>\n        </button>\n      </div>\n\n      <div id=\"loginError\" class=\"oauth-error\" role=\"alert\" hidden></div>\n\n      <form onsubmit=\"handleAuthSubmit(event, 'login')\">\n        <div class=\"auth-form-group\">\n          <label for=\"loginEmailPhone\" id=\"loginIdLabel\">Mobile Number or Email</label>\n          <input type=\"text\" id=\"loginEmailPhone\" class=\"auth-input\" placeholder=\"e.g. +91 98765 43210 or priya@gmail.com\" autocomplete=\"username\">\n        </div>\n        <div class=\"auth-form-group\">\n          <div style=\"display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;\">\n            <label for=\"loginPassword\" style=\"margin: 0;\">Password</label>\n            <button type=\"button\" onclick=\"toggleModalPasswordVisibility('loginPassword')\" style=\"font-size: 12.5px; color: var(--gold); font-weight: 600; background: none; border: none; cursor: pointer; font-family: inherit;\">Show</button>\n          </div>\n          <input type=\"password\" id=\"loginPassword\" class=\"auth-input\" placeholder=\"••••••••\" autocomplete=\"current-password\">\n        </div>\n\n        <div style=\"display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin-bottom: 20px;\">\n          <label style=\"display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--text-mute); user-select: none;\">\n            <input type=\"checkbox\" id=\"loginRemember\" checked style=\"accent-color: #DC1F30; width: 14px; height: 14px;\"> Remember me\n          </label>\n          <button type=\"button\" onclick=\"showForgotPassword()\" style=\"color: var(--gold); font-weight: 600; background: none; border: none; cursor: pointer; font-family: inherit; font-size: 13px;\">Forgot password?</button>\n        </div>\n\n        <button type=\"submit\" class=\"btn-submit-premium\">\n          <span id=\"loginSubmitLabel\">Sign in as Couple</span>\n        </button>\n\n        <div class=\"oauth-divider\"><span>or</span></div>\n        <button type=\"button\" class=\"btn-oauth-google\" style=\"margin-top: 0;\" onclick=\"startGoogleAuth(loginRole)\">\n          <svg style=\"width: 16px; height: 16px;\" viewBox=\"0 0 24 24\"><path fill=\"#4285F4\" d=\"M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.927h6.6c-.285 1.5-1.127 2.772-2.39 3.623v3.01h3.864c2.26-2.08 3.67-5.14 3.67-8.73z\"/><path fill=\"#34A853\" d=\"M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3.01c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.11C3.26 22.19 7.37 24 12 24z\"/><path fill=\"#FBBC05\" d=\"M5.27 14.28A7.17 7.17 0 0 1 4.9 12c0-.79.13-1.57.37-2.28V6.61H1.29A11.97 11.97 0 0 0 0 12c0 2 .5 3.9 1.29 5.39l3.98-3.11z\"/><path fill=\"#EA4335\" d=\"M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 1.81 1.29 5.39l3.98 3.22c.95-2.85 3.6-4.96 6.73-4.96z\"/></svg>\n          <span id=\"loginGoogleLabel\">Continue with Google as Couple</span>\n        </button>\n      </form>\n\n      <p class=\"text-xs text-center text-text-mute mt-6\" style=\"margin-top: 22px; font-size: 13px; color: var(--text-mute); text-align: center;\"><span id=\"loginSignupText\">New to WedEazzy?</span> <button onclick=\"selectRole(loginRole)\" style=\"color: #DC1F30; font-weight: 700; background: none; border: none; cursor: pointer; font-family: inherit; font-size: inherit;\" id=\"loginSignupBtn\">Create a couple account</button></p>\n    </div>\n\n    <!-- Forgot password: emailed 6-digit code, then a new password -->\n    <div id=\"screenForgotPassword\" style=\"display: none;\">\n      <h2 class=\"font-serif text-2xl text-center text-ink font-semibold mb-2\" style=\"margin-top: 10px;\">Reset your password</h2>\n      <p id=\"fpSub\" class=\"text-xs text-center text-text-mute\" style=\"font-size: 13.5px; color: var(--text-mute); margin-bottom: 18px;\">Enter the email you registered with and we'll send you a 6-digit code.</p>\n      <div id=\"fpError\" class=\"oauth-error\" role=\"alert\" hidden style=\"margin: 0 0 14px;\"></div>\n\n      <form id=\"fpStepEmail\" onsubmit=\"fpSendCode(event)\">\n        <div class=\"auth-form-group\">\n          <label for=\"fpEmail\">Registered Email Address</label>\n          <input type=\"email\" id=\"fpEmail\" class=\"auth-input\" placeholder=\"e.g. priya@gmail.com\" autocomplete=\"email\" required>\n        </div>\n        <button type=\"submit\" class=\"btn-submit-premium\" id=\"fpSendBtn\"><span>Send code</span></button>\n      </form>\n\n      <form id=\"fpStepCode\" onsubmit=\"fpReset(event)\" hidden>\n        <div class=\"auth-form-group\">\n          <label for=\"fpCode\">6-digit code</label>\n          <input type=\"text\" id=\"fpCode\" class=\"auth-input\" inputmode=\"numeric\" autocomplete=\"one-time-code\" maxlength=\"6\" pattern=\"[0-9]{6}\" placeholder=\"e.g. 123456\" required style=\"letter-spacing: .3em; font-weight: 600;\">\n        </div>\n        <div class=\"auth-form-group\">\n          <label for=\"fpNew\">New Password</label>\n          <input type=\"password\" id=\"fpNew\" class=\"auth-input\" autocomplete=\"new-password\" placeholder=\"At least 8 characters\" required>\n          <small style=\"display: block; margin-top: 6px; font-size: 11.5px; color: var(--text-light);\">Use 8+ characters with an uppercase letter, a lowercase letter, a number and a symbol.</small>\n        </div>\n        <div class=\"auth-form-group\">\n          <label for=\"fpConfirm\">Confirm New Password</label>\n          <input type=\"password\" id=\"fpConfirm\" class=\"auth-input\" autocomplete=\"new-password\" placeholder=\"Re-enter your new password\" required>\n        </div>\n        <button type=\"submit\" class=\"btn-submit-premium\" id=\"fpResetBtn\"><span>Reset password</span></button>\n        <p style=\"margin-top: 14px; font-size: 13px; color: var(--text-mute); text-align: center;\">Didn't get it? <button type=\"button\" id=\"fpResend\" onclick=\"fpSendCode()\" style=\"color: #DC1F30; font-weight: 700; background: none; border: none; cursor: pointer; font-family: inherit; font-size: inherit;\">Resend code</button></p>\n      </form>\n\n      <p style=\"margin-top: 20px; font-size: 13px; color: var(--text-mute); text-align: center;\">Remembered it? <button type=\"button\" onclick=\"toggleAuthMode('login')\" style=\"color: #DC1F30; font-weight: 700; background: none; border: none; cursor: pointer; font-family: inherit; font-size: inherit;\">Back to sign in</button></p>\n    </div>\n\n    <!-- Screen 3: Couple Signup Form -->\n    <div id=\"screenSignupCouple\" style=\"display: none;\">\n      <h2 class=\"font-serif text-2xl text-center text-ink font-semibold mb-2\" style=\"margin-top: 10px;\">Join as <span class=\"italic text-red\">Couple</span></h2>\n      <p class=\"text-xs text-center text-text-mute mb-6\" style=\"font-size: 13px; color: var(--text-mute);\">Plan your beautiful wedding stress-free</p>\n      \n      <form onsubmit=\"handleAuthSubmit(event, 'signup-couple')\">\n        <div class=\"auth-form-group\">\n          <label for=\"cNameInput\">Full Name *</label>\n          <input type=\"text\" id=\"cNameInput\" class=\"auth-input\" placeholder=\"e.g. Priya Sharma\">\n        </div>\n        <div class=\"auth-form-group\">\n          <label for=\"cEmailInput\">Email Address *</label>\n          <input type=\"email\" id=\"cEmailInput\" class=\"auth-input\" placeholder=\"e.g. priya@gmail.com\">\n        </div>\n        <div class=\"auth-form-group\">\n          <label for=\"cPhoneInput\">WhatsApp Mobile Number *</label>\n          <input type=\"tel\" id=\"cPhoneInput\" class=\"auth-input\" placeholder=\"e.g. 9876543210\">\n        </div>\n        <div class=\"auth-form-group\">\n          <div style=\"display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;\">\n            <label for=\"cPasswordInput\" style=\"margin: 0;\">Create Password *</label>\n            <button type=\"button\" onclick=\"toggleModalPasswordVisibility('cPasswordInput')\" style=\"font-size: 12.5px; color: var(--gold); font-weight: 600; background: none; border: none; cursor: pointer; font-family: inherit;\">Show</button>\n          </div>\n          <input type=\"password\" id=\"cPasswordInput\" class=\"auth-input\" placeholder=\"••••••••\">\n        </div>\n        \n        <button type=\"submit\" class=\"btn-submit-premium\">\n          <span>Register & Start Planning</span>\n        </button>\n        <button type=\"button\" class=\"btn-oauth-google\" onclick=\"startGoogleAuth('couple', 'signup')\">\n          <svg style=\"width: 16px; height: 16px;\" viewBox=\"0 0 24 24\"><path fill=\"#4285F4\" d=\"M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.927h6.6c-.285 1.5-1.127 2.772-2.39 3.623v3.01h3.864c2.26-2.08 3.67-5.14 3.67-8.73z\"/><path fill=\"#34A853\" d=\"M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3.01c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.11C3.26 22.19 7.37 24 12 24z\"/><path fill=\"#FBBC05\" d=\"M5.27 14.28A7.17 7.17 0 0 1 4.9 12c0-.79.13-1.57.37-2.28V6.61H1.29A11.97 11.97 0 0 0 0 12c0 2 .5 3.9 1.29 5.39l3.98-3.11z\"/><path fill=\"#EA4335\" d=\"M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 1.81 1.29 5.39l3.98 3.22c.95-2.85 3.6-4.96 6.73-4.96z\"/></svg>\n          <span>Sign up with Google</span>\n        </button>\n      </form>\n      \n      <p class=\"text-xs text-center text-text-mute mt-6\" style=\"margin-top: 24px; font-size: 13px; color: var(--text-mute); text-align: center;\">Want to list your business? <button onclick=\"selectRole('vendor')\" style=\"color: var(--gold); font-weight: 700; background: none; border: none; cursor: pointer; font-family: inherit; font-size: inherit;\">Become a Vendor</button></p>\n      <p class=\"text-xs text-center text-text-mute mt-2\" style=\"margin-top: 8px; font-size: 13px; color: var(--text-mute); text-align: center;\">Already have an account? <button onclick=\"toggleAuthMode('login')\" style=\"color: #DC1F30; font-weight: 700; background: none; border: none; cursor: pointer; font-family: inherit; font-size: inherit;\">Sign In</button></p>\n    </div>\n\n    <!-- Screen 4: Vendor Signup Form -->\n    <div id=\"screenSignupVendor\" style=\"display: none;\">\n      <h2 class=\"font-serif text-2xl text-center text-ink font-semibold mb-2\" style=\"margin-top: 10px;\">Register <span class=\"italic text-red\">Business</span></h2>\n      <p class=\"text-xs text-center text-text-mute mb-6\" style=\"font-size: 13px; color: var(--text-mute);\">Receive high-intent leads with zero commissions</p>\n      \n      <form onsubmit=\"handleAuthSubmit(event, 'signup-vendor')\">\n        <div class=\"auth-form-group\">\n          <label for=\"vBusinessName\">Business / Venue Name *</label>\n          <input type=\"text\" id=\"vBusinessName\" class=\"auth-input\" placeholder=\"e.g. Royal Banquet Hall\">\n        </div>\n        <div class=\"auth-form-group\" style=\"display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px;\">\n          <div>\n            <label for=\"vCategory\" style=\"display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-mute); margin-bottom: 6px;\">Category *</label>\n            <select id=\"vCategory\" class=\"auth-input\" style=\"padding-top: 10px; padding-bottom: 10px; height: 42px;\">\n              <option value=\"\">Select category…</option>\n              <option>Banquet Halls</option><option>Marriage Gardens</option><option>Wedding Lawns</option>\n              <option>Wedding Planners</option><option>Wedding Photographers</option>\n              <option>Bridal Makeup</option><option>Bridal Mehndi</option>\n              <option>Wedding Decorators</option><option>Wedding Caterers</option>\n              <option>Wedding Invitations</option><option>Wedding Entertainment</option>\n            </select>\n          </div>\n          <div>\n            <label for=\"vCity\" style=\"display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-mute); margin-bottom: 6px;\">City *</label>\n            <select id=\"vCity\" class=\"auth-input\" style=\"padding-top: 10px; padding-bottom: 10px; height: 42px;\">\n              <option value=\"\">Select city…</option>\n              <option>Mumbai</option><option>Delhi NCR</option><option>Goa</option>\n              <option>Jaipur</option><option>Udaipur</option><option>Jodhpur</option><option>Ahmedabad</option>\n            </select>\n          </div>\n        </div>\n        <div class=\"auth-form-group\">\n          <label for=\"vPhone\">WhatsApp Contact Number *</label>\n          <input type=\"tel\" id=\"vPhone\" class=\"auth-input\" placeholder=\"e.g. 9876543210\">\n        </div>\n        <div class=\"auth-form-group\">\n          <label for=\"vEmail\">Email Address *</label>\n          <input type=\"email\" id=\"vEmail\" class=\"auth-input\" placeholder=\"e.g. sales@venue.com\">\n        </div>\n        <div class=\"auth-form-group\">\n          <div style=\"display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;\">\n            <label for=\"vPassword\" style=\"margin: 0;\">Create Password *</label>\n            <button type=\"button\" onclick=\"toggleModalPasswordVisibility('vPassword')\" style=\"font-size: 12.5px; color: var(--gold); font-weight: 600; background: none; border: none; cursor: pointer; font-family: inherit;\">Show</button>\n          </div>\n          <input type=\"password\" id=\"vPassword\" class=\"auth-input\" placeholder=\"••••••••\">\n        </div>\n        \n        <button type=\"submit\" class=\"btn-submit-premium\">\n          <span>List My Business Free</span>\n        </button>\n      </form>\n      \n      <p class=\"text-xs text-center text-text-mute mt-6\" style=\"margin-top: 24px; font-size: 13px; color: var(--text-mute); text-align: center;\">Registering as a Couple? <button onclick=\"selectRole('couple')\" style=\"color: var(--gold); font-weight: 700; background: none; border: none; cursor: pointer; font-family: inherit; font-size: inherit;\">Plan my Wedding</button></p>\n      <p class=\"text-xs text-center text-text-mute mt-2\" style=\"margin-top: 8px; font-size: 13px; color: var(--text-mute); text-align: center;\">Already have an account? <button onclick=\"toggleAuthMode('login')\" style=\"color: #DC1F30; font-weight: 700; background: none; border: none; cursor: pointer; font-family: inherit; font-size: inherit;\">Sign In</button></p>\n    </div>\n\n    <!-- Screen 5: Email OTP Verification -->\n    <div id=\"screenVerifyEmailOtp\" style=\"display: none;\">\n      <h2 class=\"font-serif text-2xl text-center text-ink font-semibold mb-2\" style=\"margin-top: 10px;\">Verify <span class=\"italic text-red\">Your Email</span></h2>\n      <p class=\"text-xs text-center text-text-mute mb-6\" style=\"font-size: 13px; color: var(--text-mute);\" id=\"otpEmailSub\">We sent a 6-digit verification code to your email.</p>\n      \n      <form onsubmit=\"handleAuthSubmit(event, 'verify-email-otp')\">\n        <div class=\"auth-form-group\">\n          <label for=\"emailOtpInput\">Verification Code</label>\n          <input type=\"text\" id=\"emailOtpInput\" class=\"auth-input\" placeholder=\"e.g. 123456\" inputmode=\"numeric\" maxlength=\"6\" pattern=\"[0-9]{6}\">\n        </div>\n        \n        <button type=\"submit\" class=\"btn-submit-premium\">\n          <span>Verify &amp; Continue</span>\n        </button>\n        <button type=\"button\" class=\"btn-oauth-google\" style=\"margin-top: 8px;\" onclick=\"resendEmailOtp()\">\n          <span>Resend Code</span>\n        </button>\n      </form>\n    </div>\n\n    <div id=\"screenForcePasswordChange\" style=\"display: none;\">\n      <h2 class=\"font-serif text-2xl text-center text-ink font-semibold mb-2\" style=\"margin-top: 10px;\">Set a New <span class=\"italic text-red\">Password</span></h2>\n      <p class=\"text-xs text-center text-text-mute mb-6\" style=\"font-size: 13px; color: var(--text-mute);\">For your security, please set your own password before continuing.</p>\n\n      <form onsubmit=\"handleAuthSubmit(event, 'force-password-change')\">\n        <div class=\"auth-form-group\">\n          <div style=\"display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;\">\n            <label for=\"forcePwNew\" style=\"margin: 0;\">New Password *</label>\n            <button type=\"button\" onclick=\"toggleModalPasswordVisibility('forcePwNew', this)\" style=\"font-size: 12.5px; color: var(--gold); font-weight: 600; background: none; border: none; cursor: pointer; font-family: inherit;\">Show</button>\n          </div>\n          <input type=\"password\" id=\"forcePwNew\" class=\"auth-input\" placeholder=\"At least 8 characters, mixed case, number, symbol\" required>\n        </div>\n        <div class=\"auth-form-group\">\n          <div style=\"display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;\">\n            <label for=\"forcePwConfirm\" style=\"margin: 0;\">Confirm New Password *</label>\n            <button type=\"button\" onclick=\"toggleModalPasswordVisibility('forcePwConfirm', this)\" style=\"font-size: 12.5px; color: var(--gold); font-weight: 600; background: none; border: none; cursor: pointer; font-family: inherit;\">Show</button>\n          </div>\n          <input type=\"password\" id=\"forcePwConfirm\" class=\"auth-input\" placeholder=\"Re-enter your new password\" required>\n        </div>\n\n        <button type=\"submit\" class=\"btn-submit-premium\">\n          <span>Set Password &amp; Continue</span>\n        </button>\n      </form>\n    </div>\n\n  </div>\n</div>";
  document.body.appendChild(wrap.firstElementChild);
})();

// ==========================================
// PREMIUM AUTHENTICATION MODAL CONTROLLER
// ==========================================
const AUTH_API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:4000'
  : window.location.origin;
const AUTH_TOKEN_KEY = 'wedeazzy_token';

let currentVerifyEmail = '';
let pendingPasswordChange = null; // { currentPassword, redirectUrl } set right after a mustChangePassword login

function openAuthModal(mode, rolePref = '') {
  const modal = document.getElementById('authModal');
  modal.classList.add('active');
  
  if (mode === 'login') {
    toggleAuthMode('login');
    let role = rolePref;
    if (!role) { try { role = localStorage.getItem('wedeazzy_login_role'); } catch (_) {} }
    setLoginRole(role || 'couple');
  } else {
    if (rolePref === 'vendor') {
      selectRole('vendor');
    } else if (rolePref === 'couple') {
      selectRole('couple');
    } else {
      toggleAuthMode('signup');
    }
  }
}

// Google sign-in for a specific account type. Google only signs in to an
// account that already exists for that type; intent=signup is honoured for
// couples only (vendors register through the claim/register flow).
function startGoogleAuth(role, intent) {
  let url = AUTH_API_BASE + '/api/auth/google?role=' + encodeURIComponent(role);
  if (intent === 'signup') url += '&intent=signup';
  window.location.href = url;
}

// Sign-in account type. Chosen first on the login screen and sent with both
// password and Google sign-in; the server refuses the wrong type.
let loginRole = 'couple';
function setLoginRole(role) {
  loginRole = role === 'vendor' ? 'vendor' : 'couple';
  const vendor = loginRole === 'vendor';
  document.querySelectorAll('[data-login-role]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.loginRole === loginRole)));
  document.getElementById('loginIdLabel').textContent = vendor ? 'Business Email or Mobile Number' : 'Mobile Number or Email';
  document.getElementById('loginEmailPhone').placeholder = vendor ? 'e.g. sales@yourbusiness.com' : 'e.g. +91 98765 43210 or priya@gmail.com';
  document.getElementById('loginSubmitLabel').textContent = 'Sign in as ' + (vendor ? 'Vendor' : 'Couple');
  document.getElementById('loginGoogleLabel').textContent = 'Continue with Google as ' + (vendor ? 'Vendor' : 'Couple');
  document.getElementById('loginSignupText').textContent = vendor ? 'Business not on WedEazzy yet?' : 'New to WedEazzy?';
  document.getElementById('loginSignupBtn').textContent = vendor ? 'Register your business' : 'Create a couple account';
  try { localStorage.setItem('wedeazzy_login_role', loginRole); } catch (_) {}
  hideLoginError();
}

function hideLoginError() {
  const box = document.getElementById('loginError');
  if (box) { box.hidden = true; box.textContent = ''; }
}

// Message + optional action button (e.g. "Switch to Vendor"), built with
// textContent only — messages can come from the server.
function showLoginError(message, actionLabel, action) {
  const box = document.getElementById('loginError');
  box.classList.remove('is-ok');
  box.textContent = message;
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'oauth-error-action';
    btn.textContent = actionLabel;
    btn.onclick = action;
    box.appendChild(btn);
  }
  box.hidden = false;
}

function roleMismatchAction(accountRole) {
  if (accountRole !== 'couple' && accountRole !== 'vendor') return [null, null];
  const label = accountRole === 'vendor' ? 'Vendor' : 'Couple';
  return ['Switch to ' + label + ' sign-in →', () => setLoginRole(accountRole)];
}

// ---- Forgot password: email a 6-digit code, then set a new password ----
let fpEmailValue = '';
let fpResendTimer = null;

function fpShowError(message) {
  const box = document.getElementById('fpError');
  box.textContent = message;
  box.hidden = !message;
}

function showForgotPassword() {
  const screens = ['screenRolePick', 'screenLogin', 'screenSignupCouple', 'screenSignupVendor', 'screenVerifyEmailOtp', 'screenForcePasswordChange', 'screenForgotPassword'];
  screens.forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('screenForgotPassword').style.display = 'block';
  document.getElementById('fpStepEmail').hidden = false;
  document.getElementById('fpStepCode').hidden = true;
  document.getElementById('fpSub').textContent = "Enter the email you registered with and we'll send you a 6-digit code.";
  fpShowError('');
  const typed = (document.getElementById('loginEmailPhone').value || '').trim();
  document.getElementById('fpEmail').value = typed.includes('@') ? typed : '';
  setTimeout(() => document.getElementById('fpEmail').focus(), 50);
}

function fpStartResendCooldown() {
  const btn = document.getElementById('fpResend');
  let left = 30;
  clearInterval(fpResendTimer);
  btn.disabled = true;
  btn.textContent = 'Resend in ' + left + 's';
  fpResendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) { clearInterval(fpResendTimer); btn.disabled = false; btn.textContent = 'Resend code'; }
    else btn.textContent = 'Resend in ' + left + 's';
  }, 1000);
}

async function fpSendCode(event) {
  if (event) event.preventDefault();
  const email = event ? document.getElementById('fpEmail').value.trim().toLowerCase() : fpEmailValue;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fpShowError('Please enter a valid email address.');
  fpShowError('');
  const btn = document.getElementById('fpSendBtn');
  btn.disabled = true;
  try {
    const res = await fetch(AUTH_API_BASE + '/api/auth/password-reset/send-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Could not send the code. Please try again.');
    fpEmailValue = email;
    document.getElementById('fpStepEmail').hidden = true;
    document.getElementById('fpStepCode').hidden = false;
    document.getElementById('fpSub').textContent = 'If ' + email + ' is registered, we sent a 6-digit code to it. It is valid for 15 minutes.';
    fpStartResendCooldown();
    // Local development only: the server returns the code when email could not be sent.
    if (data.devCode) {
      document.getElementById('fpCode').value = data.devCode;
      const box = document.getElementById('fpError');
      box.textContent = 'Local testing: the email could not be sent (check SMTP settings), so the code has been filled in for you.';
      box.hidden = false;
      setTimeout(() => document.getElementById('fpNew').focus(), 50);
    } else {
      setTimeout(() => document.getElementById('fpCode').focus(), 50);
    }
  } catch (err) {
    fpShowError(err.message);
  } finally {
    btn.disabled = false;
  }
}

async function fpReset(event) {
  event.preventDefault();
  const code = document.getElementById('fpCode').value.trim();
  const newPassword = document.getElementById('fpNew').value;
  const confirm = document.getElementById('fpConfirm').value;
  if (!/^[0-9]{6}$/.test(code)) return fpShowError('Enter the 6-digit code from your email.');
  if (newPassword !== confirm) return fpShowError('The two passwords do not match.');
  fpShowError('');
  const btn = document.getElementById('fpResetBtn');
  btn.disabled = true;
  try {
    const res = await fetch(AUTH_API_BASE + '/api/auth/password-reset/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fpEmailValue, code, newPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Could not reset your password. Please try again.');
    ['fpCode', 'fpNew', 'fpConfirm'].forEach(id => { document.getElementById(id).value = ''; });
    clearInterval(fpResendTimer);
    openAuthModal('login', data.role === 'vendor' ? 'vendor' : 'couple');
    document.getElementById('loginEmailPhone').value = fpEmailValue;
    document.getElementById('loginPassword').value = '';
    const box = document.getElementById('loginError');
    box.textContent = 'Password reset! Sign in with your new password.';
    box.classList.add('is-ok');
    box.hidden = false;
    document.getElementById('loginPassword').focus();
  } catch (err) {
    fpShowError(err.message);
  } finally {
    btn.disabled = false;
  }
}

// Error codes sent back by the Google callback (see googleOAuth.controller.js).
function googleAuthErrorMessage(code, as, account) {
  const label = { couple: 'Couple', vendor: 'Vendor', admin: 'Admin' };
  switch (code) {
    case 'ERR_NO_ACCOUNT':
      return as === 'couple'
        ? 'This account does not exist. No couple account is registered with this Google email — please sign up first.'
        : as === 'vendor'
          ? 'This account does not exist. No vendor account is registered with this Google email — please register your business first.'
          : 'This account does not exist. No account is registered with this Google email — please sign up first.';
    case 'ERR_ROLE_MISMATCH':
      return account && label[account] && account !== 'admin'
        ? 'This Google account is registered as a ' + label[account] + ' account, not a ' + (label[as] || 'Couple') + ' account.'
        : 'This Google account cannot be used here.';
    case 'ERR_GOOGLE_EMAIL_UNVERIFIED':
      return 'Your Google email is not verified. Please sign in with your password instead.';
    case 'ERR_GOOGLE_ACCOUNT_MISMATCH':
      return 'This email is linked to a different Google account. Please use that Google account or your password.';
    case 'ERR_ACCOUNT_SUSPENDED':
      return 'Your account has been suspended. Contact support for assistance.';
    case 'ERR_GOOGLE_CANCELLED':
      return 'Google sign-in was cancelled.';
    default:
      return 'Google sign-in failed. Please try again.';
  }
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('active');
}

function closeAuthModalOnBackdrop(e) {
  if (e.target.id === 'authModal') closeAuthModal();
}

function toggleAuthMode(mode) {
  const screens = ['screenRolePick', 'screenLogin', 'screenSignupCouple', 'screenSignupVendor', 'screenVerifyEmailOtp', 'screenForcePasswordChange', 'screenForgotPassword'];
  screens.forEach(s => document.getElementById(s).style.display = 'none');

  if (mode === 'login') {
    document.getElementById('screenLogin').style.display = 'block';
  } else {
    document.getElementById('screenRolePick').style.display = 'block';
  }
}

function selectRole(role) {
  const screens = ['screenRolePick', 'screenLogin', 'screenSignupCouple', 'screenSignupVendor', 'screenVerifyEmailOtp', 'screenForcePasswordChange', 'screenForgotPassword'];
  screens.forEach(s => document.getElementById(s).style.display = 'none');

  if (role === 'couple') {
    document.getElementById('screenSignupCouple').style.display = 'block';
  } else {
    document.getElementById('screenSignupVendor').style.display = 'block';
  }
}

function toggleModalPasswordVisibility(inputId, btnTarget) {
  const input = document.getElementById(inputId);
  const btn = btnTarget || (typeof event !== 'undefined' ? event.target : null);
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = 'Show';
  }
}

async function resendEmailOtp() {
  if (!currentVerifyEmail) return wedeazzyNotify('No email has been set.', 'error');
  try {
    const res = await fetch(AUTH_API_BASE + '/api/auth/email/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentVerifyEmail })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to resend code');
    wedeazzyNotify('Verification code resent successfully to ' + currentVerifyEmail, 'success');
  } catch (err) {
    wedeazzyNotify(err.message, 'error');
  }
}

async function handleAuthSubmit(event, action) {
  event.preventDefault();
  
  // Clear previous error styles
  const inputs = event.target.querySelectorAll('.auth-input');
  inputs.forEach(inp => inp.classList.remove('error'));
  
  let isValid = true;
  
  if (action === 'login') {
    const emailPhone = document.getElementById('loginEmailPhone');
    const pass = document.getElementById('loginPassword');
    
    if (!emailPhone.value.trim()) { emailPhone.classList.add('error'); isValid = false; }
    if (!pass.value.trim()) { pass.classList.add('error'); isValid = false; }
    if (!isValid) return wedeazzyNotify('Please enter both username/email and password.', 'error');

    try {
      const res = await fetch(AUTH_API_BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone: emailPhone.value.trim(), password: pass.value, role: loginRole })
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'ERR_ROLE_MISMATCH') {
          const [label, action] = roleMismatchAction(data.accountRole);
          showLoginError(data.message, label, action);
          return;
        }
        throw new Error(data.message || 'Invalid username or password.');
      }

      // Check if email has been verified
      if (data.user && !data.user.verified) {
        currentVerifyEmail = data.user.email;
        const screens = ['screenRolePick', 'screenLogin', 'screenSignupCouple', 'screenSignupVendor', 'screenVerifyEmailOtp', 'screenForcePasswordChange', 'screenForgotPassword'];
        screens.forEach(s => document.getElementById(s).style.display = 'none');
        document.getElementById('screenVerifyEmailOtp').style.display = 'block';
        document.getElementById('otpEmailSub').textContent = 'We sent a 6-digit verification code to ' + currentVerifyEmail;
        alert('Email verification required. We have sent a verification code to ' + currentVerifyEmail);
        return;
      }

      localStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      const remember = document.getElementById('loginRemember')?.checked;
      if (remember) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      } else {
        sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }

      const redirectUrl = data.user.role === 'admin' ? 'pages/admin-dashboard.html' : (data.user.role === 'vendor' ? 'pages/bdashboard.html' : 'pages/user-dashboard.html');

      // Admin-issued credentials require setting a real password before proceeding.
      if (data.user && data.user.mustChangePassword) {
        pendingPasswordChange = { currentPassword: pass.value, redirectUrl };
        const screens = ['screenRolePick', 'screenLogin', 'screenSignupCouple', 'screenSignupVendor', 'screenVerifyEmailOtp', 'screenForcePasswordChange', 'screenForgotPassword'];
        screens.forEach(s => document.getElementById(s).style.display = 'none');
        document.getElementById('screenForcePasswordChange').style.display = 'block';
        return;
      }

      wedeazzyNotify('Welcome back to WedEazzy!', 'success');
      // Hold briefly so the toast is readable before the page navigates away.
      setTimeout(function () { window.location.href = redirectUrl; }, 900);

    } catch (err) {
      wedeazzyNotify(err.message, 'error');
    }
    
  } else if (action === 'signup-couple') {
    const name = document.getElementById('cNameInput');
    const email = document.getElementById('cEmailInput');
    const phone = document.getElementById('cPhoneInput');
    const pass = document.getElementById('cPasswordInput');
    
    let errorMsg = '';
    if (!name.value.trim()) { name.classList.add('error'); errorMsg = 'Please enter your Full Name.'; isValid = false; }
    else if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { email.classList.add('error'); errorMsg = 'Please enter a valid email address.'; isValid = false; }
    else if (!phone.value.trim()) { phone.classList.add('error'); errorMsg = 'Please enter your WhatsApp mobile number.'; isValid = false; }
    else if (phone.value.replace(/[^0-9]/g,'').length < 10) { phone.classList.add('error'); errorMsg = 'Please enter a valid 10-digit mobile number.'; isValid = false; }
    else if (!pass.value.trim()) { pass.classList.add('error'); errorMsg = 'Please create a password.'; isValid = false; }
    else if (pass.value.length < 6) { pass.classList.add('error'); errorMsg = 'Password must be at least 6 characters.'; isValid = false; }
    
    if (!isValid) return wedeazzyNotify(errorMsg, 'error');
    
    try {
      const res = await fetch(AUTH_API_BASE + '/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'couple',
          name: name.value.trim(),
          email: email.value.trim().toLowerCase(),
          phone: phone.value.trim(),
          password: pass.value
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed.');

      currentVerifyEmail = email.value.trim().toLowerCase();
      const screens = ['screenRolePick', 'screenLogin', 'screenSignupCouple', 'screenSignupVendor', 'screenVerifyEmailOtp', 'screenForcePasswordChange', 'screenForgotPassword'];
      screens.forEach(s => document.getElementById(s).style.display = 'none');
      document.getElementById('screenVerifyEmailOtp').style.display = 'block';
      if (data.emailSent === false) {
        // Account exists but the code email failed: say so instead of "we sent".
        document.getElementById('otpEmailSub').textContent = 'We could not email a code to ' + currentVerifyEmail + ' yet. Please try again shortly.';
        wedeazzyNotify(data.message || 'The verification code email could not be delivered.', 'error');
      } else {
        document.getElementById('otpEmailSub').textContent = 'We sent a 6-digit verification code to ' + currentVerifyEmail;
        alert('Welcome! We sent a 6-digit verification code to ' + currentVerifyEmail);
      }

    } catch (err) {
      wedeazzyNotify(err.message, 'error');
    }
    
  } else if (action === 'signup-vendor') {
    const bizName = document.getElementById('vBusinessName');
    const cat = document.getElementById('vCategory');
    const city = document.getElementById('vCity');
    const phone = document.getElementById('vPhone');
    const email = document.getElementById('vEmail');
    const pass = document.getElementById('vPassword');
    
    let errorMsg = '';
    if (!bizName.value.trim()) { bizName.classList.add('error'); errorMsg = 'Please enter your Business / Venue Name.'; isValid = false; }
    else if (!cat.value) { cat.classList.add('error'); errorMsg = 'Please select a Category.'; isValid = false; }
    else if (!city.value) { city.classList.add('error'); errorMsg = 'Please select a City.'; isValid = false; }
    else if (!phone.value.trim()) { phone.classList.add('error'); errorMsg = 'Please enter your WhatsApp contact number.'; isValid = false; }
    else if (phone.value.replace(/[^0-9]/g,'').length < 10) { phone.classList.add('error'); errorMsg = 'Please enter a valid 10-digit mobile number.'; isValid = false; }
    else if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { email.classList.add('error'); errorMsg = 'Please enter a valid email address.'; isValid = false; }
    else if (!pass.value.trim()) { pass.classList.add('error'); errorMsg = 'Please create a password.'; isValid = false; }
    else if (pass.value.length < 6) { pass.classList.add('error'); errorMsg = 'Password must be at least 6 characters.'; isValid = false; }
    
    if (!isValid) return wedeazzyNotify(errorMsg, 'error');
    
    try {
      const res = await fetch(AUTH_API_BASE + '/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'vendor',
          name: bizName.value.trim(),
          businessName: bizName.value.trim(),
          category: cat.value,
          city: city.value,
          email: email.value.trim().toLowerCase(),
          phone: phone.value.trim(),
          password: pass.value
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed.');

      currentVerifyEmail = email.value.trim().toLowerCase();
      const screens = ['screenRolePick', 'screenLogin', 'screenSignupCouple', 'screenSignupVendor', 'screenVerifyEmailOtp', 'screenForcePasswordChange', 'screenForgotPassword'];
      screens.forEach(s => document.getElementById(s).style.display = 'none');
      document.getElementById('screenVerifyEmailOtp').style.display = 'block';
      if (data.emailSent === false) {
        // Account exists but the code email failed: say so instead of "we sent".
        document.getElementById('otpEmailSub').textContent = 'We could not email a code to ' + currentVerifyEmail + ' yet. Please try again shortly.';
        wedeazzyNotify(data.message || 'The verification code email could not be delivered.', 'error');
      } else {
        document.getElementById('otpEmailSub').textContent = 'We sent a 6-digit verification code to ' + currentVerifyEmail;
        alert('Welcome! We sent a 6-digit verification code to ' + currentVerifyEmail);
      }

    } catch (err) {
      wedeazzyNotify(err.message, 'error');
    }
  } else if (action === 'verify-email-otp') {
    const code = document.getElementById('emailOtpInput');
    if (!code.value.trim() || code.value.trim().length !== 6) {
      code.classList.add('error');
      return wedeazzyNotify('Please enter a valid 6-digit security code.', 'error');
    }

    try {
      const res = await fetch(AUTH_API_BASE + '/api/auth/email/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentVerifyEmail, code: code.value.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'OTP verification failed.');

      localStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      const remember = document.getElementById('loginRemember')?.checked;
      if (remember) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      } else {
        sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }
      wedeazzyNotify('Email verified successfully! Opening your dashboard...', 'success');
      var verifiedTarget = data.user.role === 'admin' ? 'pages/admin-dashboard.html' : (data.user.role === 'vendor' ? 'pages/bdashboard.html' : 'pages/user-dashboard.html');
      setTimeout(function () { window.location.href = verifiedTarget; }, 900);

    } catch (err) {
      wedeazzyNotify(err.message, 'error');
    }
  } else if (action === 'force-password-change') {
    const newPw = document.getElementById('forcePwNew');
    const confirmPw = document.getElementById('forcePwConfirm');

    if (!newPw.value || newPw.value !== confirmPw.value) {
      confirmPw.classList.add('error');
      return wedeazzyNotify('Passwords do not match.', 'error');
    }
    if (!pendingPasswordChange) {
      return wedeazzyNotify('Your session expired — please log in again.', 'error');
    }

    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
      const res = await fetch(AUTH_API_BASE + '/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ currentPassword: pendingPasswordChange.currentPassword, newPassword: newPw.value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not set your new password.');

      wedeazzyNotify('Password updated! Opening your dashboard...', 'success');
      var passwordTarget = pendingPasswordChange.redirectUrl;
      pendingPasswordChange = null;
      setTimeout(function () { window.location.href = passwordTarget; }, 900);
    } catch (err) {
      wedeazzyNotify(err.message, 'error');
    }
  }
}

// On Page Load: Check if redirected with auth request (e.g. from expired dashboard)
window.addEventListener('DOMContentLoaded', () => {
  // For Vendors dropdown toggle
  const dropdown = document.querySelector('.vendor-nav-dropdown');
  if (dropdown) {
    const toggleBtn = dropdown.querySelector('.dropdown-toggle');
    const menu = dropdown.querySelector('.vendor-dropdown-menu');
    if (toggleBtn && menu) {
      dropdown.addEventListener('mouseenter', () => { menu.style.display = 'block'; });
      dropdown.addEventListener('mouseleave', () => { menu.style.display = 'none'; });
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      });
      document.addEventListener('click', () => { menu.style.display = 'none'; });
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const authAction = urlParams.get('auth');
  if (authAction === 'login') {
    const as = urlParams.get('as');
    openAuthModal('login', as === 'vendor' || as === 'couple' ? as : '');
  } else if (authAction === 'signup') {
    openAuthModal('signup', 'vendor');
  }

  // Google sign-in bounced back with an error (no account, wrong account type…)
  const googleError = urlParams.get('google_error');
  if (googleError) {
    const as = urlParams.get('as') === 'vendor' ? 'vendor' : 'couple';
    openAuthModal('login', as);
    const message = googleAuthErrorMessage(googleError, as, urlParams.get('account'));
    if (googleError === 'ERR_NO_ACCOUNT') {
      showLoginError(message, as === 'vendor' ? 'Register your business →' : 'Sign up as Couple →', () => selectRole(as));
    } else if (googleError === 'ERR_ROLE_MISMATCH') {
      const [label, action] = roleMismatchAction(urlParams.get('account'));
      showLoginError(message, label, action);
    } else {
      showLoginError(message);
    }
    history.replaceState(null, '', window.location.pathname);
  }
});
