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
      window.location.replace("dashboard.html");
    }
  },

  // Step 1: Credentials Check against backend API
  // On success, backend sends OTP to the admin's registered email.
  async validateCredentials(email, password) {
    try {
      const response = await fetch(`${API_BASE}/api/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password })
      });
      const data = await response.json();

      if (!response.ok || (!data.token && !data.require2fa)) {
        return { success: false, error: data.message || "Invalid administrator credentials." };
      }

      // Save temporary details (email, and token if returned) to be used on MFA confirmation step
      sessionStorage.setItem("wedeazzy_temp_auth", JSON.stringify({
        email: email.trim().toLowerCase(),
        token: data.token || null,
        timestamp: Date.now()
      }));
      return { success: true };
    } catch (err) {
      return { success: false, error: "Authentication pipeline currently offline. Please ensure the server is running." };
    }
  },

  // Step 2: 2FA OTP Check against backend email OTP endpoint
  async verifyOTP(otpCode, rememberMe = false) {
    const tempAuth = sessionStorage.getItem("wedeazzy_temp_auth");
    if (!tempAuth) {
      return { success: false, error: "Authentication session expired. Please log in again." };
    }

    const { email, token } = JSON.parse(tempAuth);

    try {
      const response = await fetch(`${API_BASE}/api/auth/email/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode })
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        return { success: false, error: data.message || "Invalid verification code. Please check your email." };
      }

      // Use the fresh token from OTP verify if available, otherwise use the one from step 1
      const finalToken = data.token || token;

      const sessionData = {
        email: email,
        loginTime: Date.now(),
        role: "Administrator",
        avatarLetter: email.charAt(0).toUpperCase()
      };

      // Store session AND token in sessionStorage only. sessionStorage is
      // cleared when the tab closes and is not persisted to disk, shrinking the
      // window and surface for token theft compared with localStorage.
      localStorage.removeItem('wedeazzy_token');
      sessionStorage.removeItem('wedeazzy_token');
      localStorage.removeItem('wedeazzy_admin_token');
      sessionStorage.removeItem('wedeazzy_admin_token');

      sessionStorage.setItem("wedeazzy_admin_session", JSON.stringify(sessionData));
      sessionStorage.setItem("wedeazzy_admin_token", finalToken);

      // Cleanup temp states
      sessionStorage.removeItem("wedeazzy_temp_auth");

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

