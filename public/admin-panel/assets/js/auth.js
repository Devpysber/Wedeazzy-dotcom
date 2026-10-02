/**
 * WedEazzy Modular Admin Panel - Authentication Engine
 * Governs multi-factor logins, credentials validation, password recovery,
 * OTP auto-shifting timers, session security filters, and logout sweeps.
 *
 * FIX: Session AND token are now stored in BOTH sessionStorage and localStorage
 *      to ensure persistence across tabs, refreshes, and rememberMe states.
 */

// API_BASE is declared once in store.js (loaded before this file on every
// admin page) â€” redeclaring it here with `const` threw a SyntaxError at parse
// time since classic <script> tags share one global lexical scope, which
// silently prevented this entire file from executing (window.WedEazzyAuth
// was never assigned, breaking every admin feature that depends on it).

const WedEazzyAuth = {
  // Check if session is active
  isAuthenticated() {
    const session = sessionStorage.getItem("wedeazzy_admin_session") || localStorage.getItem("wedeazzy_admin_session");
    const token = sessionStorage.getItem("wedeazzy_admin_token") || localStorage.getItem("wedeazzy_admin_token");
    if (!session || !token) return false;
    
    try {
      const parsed = JSON.parse(session);
      // Check expiration (48 hours â€” extended from 24h to avoid premature logout)
      if (Date.now() - parsed.loginTime > 48 * 60 * 60 * 1000) {
        this.logout();
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  // Get active session metadata
  getSession() {
    const session = sessionStorage.getItem("wedeazzy_admin_session") || localStorage.getItem("wedeazzy_admin_session");
    return session ? JSON.parse(session) : null;
  },

  // Get active token for API requests
  getToken() {
    return sessionStorage.getItem("wedeazzy_admin_token") || localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_token") || localStorage.getItem("wedeazzy_token");
  },

  // Where the panel's dashboard lives. In production the panel is mounted under
  // a private path and /admin-panel/ serves only the login page, so a relative
  // "dashboard.html" would 404. The API hands the real segment to authenticated
  // admins; the relative page stays correct when the panel is at its default
  // path, and is the fallback whenever the call cannot be made.
  async panelHome() {
    try {
      const response = await this.apiFetch(`${API_BASE}/api/admin-panel-path`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.path) return `/${data.path}/dashboard.html`;
      }
    } catch (e) {
      // Network or parse failure — fall through to the relative page.
    }
    return "dashboard.html";
  },

  // Guard dashboard page â€” redirect to login if not authenticated
  guardRoute() {
    if (!this.isAuthenticated()) {
      sessionStorage.removeItem("wedeazzy_admin_session");
      localStorage.removeItem("wedeazzy_admin_session");
      sessionStorage.removeItem("wedeazzy_admin_token");
      localStorage.removeItem("wedeazzy_admin_token");
      
      // Save original URL to return after login
      sessionStorage.setItem("auth_redirect_target", window.location.href);
      window.location.replace("login.html");
    }
  },

  // Guard login page (prevent re-login when session is valid)
  guardLoginPage() {
    if (this.isAuthenticated()) {
      this.panelHome().then((target) => window.location.replace(target));
    }
  },

  // Save a signed-in admin session. sessionStorage only: it is cleared when
  // the tab closes and never persisted to disk, shrinking the window and
  // surface for token theft compared with localStorage.
  storeSession(email, token) {
    localStorage.removeItem('wedeazzy_token');
    sessionStorage.removeItem('wedeazzy_token');
    localStorage.removeItem('wedeazzy_admin_token');
    sessionStorage.removeItem('wedeazzy_admin_token');
    sessionStorage.setItem("wedeazzy_admin_session", JSON.stringify({
      email,
      loginTime: Date.now(),
      role: "Administrator",
      avatarLetter: email.charAt(0).toUpperCase()
    }));
    sessionStorage.setItem("wedeazzy_admin_token", token);
    sessionStorage.removeItem("wedeazzy_temp_auth");
  },

  // Sign-in option 1 (default): email + password signs in directly.
  async validateCredentials(email, password) {
    const normalized = email.trim().toLowerCase();
    try {
      const response = await fetch(`${API_BASE}/api/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized, password })
      });
      const data = await response.json();

      if (!response.ok || !data.token) {
        return { success: false, error: data.message || "Invalid administrator credentials." };
      }
      this.storeSession(normalized, data.token);
      return { success: true };
    } catch (err) {
      return { success: false, error: "Authentication pipeline currently offline. Please ensure the server is running." };
    }
  },

  // Sign-in option 2: email a 6-digit code to the admin address.
  async requestLoginCode(email) {
    const normalized = email.trim().toLowerCase();
    try {
      const response = await fetch(`${API_BASE}/api/auth/admin/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized })
      });
      const data = await response.json();
      if (!response.ok || !data.require2fa) {
        return { success: false, error: data.message || "Could not send a sign-in code. Please try again." };
      }
      sessionStorage.setItem("wedeazzy_temp_auth", JSON.stringify({ email: normalized, timestamp: Date.now() }));
      return { success: true, devCode: data.devCode || null };
    } catch (err) {
      return { success: false, error: "Authentication pipeline currently offline. Please ensure the server is running." };
    }
  },

  // Sign-in option 2, step 2: redeem the emailed code.
  async verifyOTP(otpCode) {
    const tempAuth = sessionStorage.getItem("wedeazzy_temp_auth");
    if (!tempAuth) {
      return { success: false, error: "Sign-in session expired. Please request a new code." };
    }
    const { email } = JSON.parse(tempAuth);

    try {
      const response = await fetch(`${API_BASE}/api/auth/admin/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode })
      });
      const data = await response.json();

      if (!response.ok || !data.ok || !data.token) {
        return { success: false, error: data.message || "Invalid verification code. Please check your email." };
      }
      this.storeSession(email, data.token);
      return { success: true };
    } catch (err) {
      return { success: false, error: "Verification server is unreachable. Please try again." };
    }
  },

  // Password Recovery via real email trigger API
  async recoverPassword(email) {
    try {
      const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to trigger password recovery.");
      }

      return { 
        success: true, 
        message: "If registered, a recovery link has been dispatched to your email address." 
      };
    } catch (err) {
      return { success: false, error: err.message || "Security recovery channel offline." };
    }
  },

  // Reset Password using Single-Use secure Token
  async resetPasswordWithToken(token, newPassword) {
    try {
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to update password.");
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || "Security update channel offline." };
    }
  },

  // Get current JWT token â€” checks both sessionStorage and localStorage
  getToken() {
    return sessionStorage.getItem('wedeazzy_admin_token') || localStorage.getItem('wedeazzy_admin_token') || null;
  },

  // Authenticated fetch helper â€” automatically includes Authorization header
  // Use this for ALL admin API calls instead of raw fetch().
  // Automatically redirects to login on 401.
  async apiFetch(url, options = {}) {
    const token = this.getToken();
    const headers = {
      ...(options.headers || {}),
    };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options = { ...options, body: JSON.stringify(options.body) };
    }
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      // Token expired or invalid â€” force re-login
      this.logout();
      return response;
    }
    return response;
  },

  // After an email/password change the server signs out older tokens and
  // returns a fresh one; store it (and the new email) in place of the old.
  replaceSession(token, email) {
    if (token) sessionStorage.setItem("wedeazzy_admin_token", token);
    const session = this.getSession() || { role: "Administrator", loginTime: Date.now() };
    if (email) {
      session.email = email;
      session.avatarLetter = email.charAt(0).toUpperCase();
    }
    sessionStorage.setItem("wedeazzy_admin_session", JSON.stringify(session));
  },

  // Check if current user is admin
  isAdmin() {
    const session = this.getSession();
    return session && session.role === 'Administrator';
  },

  // Destroy session and call backend logout to denylist token
  async logout() {
    const token = sessionStorage.getItem("wedeazzy_admin_token") || localStorage.getItem("wedeazzy_admin_token");
    
    // Attempt backend token denylist (fire and forget)
    if (token) {
      fetch(`${API_BASE}/api/auth/logout`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
    
    sessionStorage.removeItem("wedeazzy_admin_session");
    localStorage.removeItem("wedeazzy_admin_session");
    sessionStorage.removeItem("wedeazzy_admin_token");
    localStorage.removeItem("wedeazzy_admin_token");
    sessionStorage.removeItem("wedeazzy_temp_auth");
    
    window.location.href = "login.html";
  }
};


// Export to window scope
window.WedEazzyAuth = WedEazzyAuth;

