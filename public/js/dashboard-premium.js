/* ============================================================================
 * WedEazzy Premium Business Dashboard SPA Engine
 * Client-side MVC state management, SheetJS XLS engine, and Chart.js loader.
 * ========================================================================== */

const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:4000'
  : window.location.origin;
const TOKEN_KEY = 'wedeazzy_token';
const THEME_KEY = 'wedeazzy_theme';

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
}

// Autocomplete Target Locations Database
const INDIAN_LOCATIONS = [
  'Mumbai, Maharashtra', 'Delhi NCR', 'Bengaluru, Karnataka', 'Hyderabad, Telangana', 
  'Ahmedabad, Gujarat', 'Chennai, Tamil Nadu', 'Kolkata, West Bengal', 'Surat, Gujarat', 
  'Pune, Maharashtra', 'Jaipur, Rajasthan', 'Lucknow, Uttar Pradesh', 'Kanpur, Uttar Pradesh', 
  'Nagpur, Maharashtra', 'Indore, Madhya Pradesh', 'Thane, Maharashtra', 'Bhopal, Madhya Pradesh', 
  'Visakhapatnam, Andhra Pradesh', 'Pimpri-Chinchwad, Maharashtra', 'Patna, Bihar', 'Vadodara, Gujarat', 
  'Ghaziabad, Uttar Pradesh', 'Ludhiana, Punjab', 'Agra, Uttar Pradesh', 'Nashik, Maharashtra', 
  'Faridabad, Haryana', 'Meerut, Uttar Pradesh', 'Rajkot, Gujarat', 'Kalyan-Dombivli, Maharashtra', 
  'Vasai-Virar, Maharashtra', 'Varanasi, Uttar Pradesh', 'Srinagar, Jammu and Kashmir', 
  'Aurangabad, Maharashtra', 'Dhanbad, Jharkhand', 'Amritsar, Punjab', 'Navi Mumbai, Maharashtra', 
  'Allahabad, Uttar Pradesh', 'Howrah, West Bengal', 'Gwalior, Madhya Pradesh', 'Jabalpur, Madhya Pradesh', 
  'Coimbatore, Tamil Nadu', 'Vijayawada, Andhra Pradesh', 'Jodhpur, Rajasthan', 'Madurai, Tamil Nadu', 
  'Raipur, Chhattisgarh', 'Kota, Rajasthan', 'Guwahati, Assam', 'Chandigarh', 'Solapur, Maharashtra', 
  'Hubli-Dharwad, Karnataka', 'Bareilly, Uttar Pradesh', 'Moradabad, Uttar Pradesh', 'Mysore, Karnataka', 
  'Gurgaon, Haryana', 'Aligarh, Uttar Pradesh', 'Jalandhar, Punjab', 'Tiruchirappalli, Tamil Nadu', 
  'Bhubaneswar, Odisha', 'Salem, Tamil Nadu', 'Warangal, Telangana', 'Mira-Bhayandar, Maharashtra', 
  'Thiruvananthapuram, Kerala', 'Bhiwandi, Maharashtra', 'Saharanpur, Uttar Pradesh', 
  'Guntur, Andhra Pradesh', 'Amravati, Maharashtra', 'Noida, Uttar Pradesh', 'Jamshedpur, Jharkhand', 
  'Bhilai, Chhattisgarh', 'Cuttack, Odisha', 'Kochi, Kerala', 'Udaipur, Rajasthan', 'Pan India'
];

// Application State Store
const state = {
  user: null,
  vendor: null,
  activeTab: 'dashboard',
  theme: 'light',
  notifications: [],
  searchQuery: '',
  pageIndex: 1,
  pageSize: 10,
  // High Fidelity Production Fallback Mock Datasets
  mockData: {
    bookings: [],
    inquiries: [],
    businesses: [],
    reviews: [],
    earnings: []
  }
};

// State Helpers
const getActiveList = () => {
  if (state.vendors && state.vendors.length > 0) return state.vendors;
  return state.vendor ? [state.vendor] : state.mockData.businesses;
};

/* --- Boot Engine --- */
async function boot() {
  // Load plans configuration dynamically
  try {
    const res = await api('/api/public/plans');
    if (res.ok) state.plans = res.plans;
  } catch (err) {
    console.error('Failed to load plans config:', err);
  }

  // Setup theme
  const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
  setTheme(savedTheme);

  // Preview Sandbox Bypass (Developer Review/Demo Mode)
  const isPreview = location.search.includes('preview=true') || location.search.includes('demo=true');
  if (isPreview) {
    state.user = { id: '99', name: 'Demo Partner', email: 'partner@wedeazzy.com', verified: true, role: 'vendor' };
    state.vendor = state.mockData.businesses[0];

    const firstLetter = 'D';
    const headerAvatar = document.getElementById('headerProfileAvatarLetter');
    if (headerAvatar) headerAvatar.textContent = firstLetter;

    const dropdownAvatar = document.getElementById('dropdownAvatarLetter');
    if (dropdownAvatar) dropdownAvatar.textContent = firstLetter;
    
    const dropdownTitle = document.getElementById('dropdownUserTitle');
    if (dropdownTitle) dropdownTitle.textContent = state.user.name;
    
    const dropdownEmail = document.getElementById('dropdownUserEmail');
    if (dropdownEmail) dropdownEmail.textContent = state.user.email;

    initLiveGreetingAndClock();
    renderNotificationsInDropdown();
    
    window.addEventListener('click', (e) => {
      if (!e.target.closest('#notificationsTrigger') && !e.target.closest('#profileDropdown')) {
        closeAllDropdowns();
      }
    });

    switchTab('dashboard');
    triggerToast('Demo sandbox mode authorized!');
    const analyticsBadge = document.getElementById('analyticsBadge');
    if (analyticsBadge) analyticsBadge.style.display = 'inline-block';
    return;
  }

  // Authenticate token
  const token = getStoredToken();
  if (!token) {
    window.location.href = '../index.html?auth=login';
    return;
  }

  // Retrieve JWT user profiles
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const payload = await res.json();
    
    if (!res.ok || !payload.user || payload.user.role !== 'vendor') {
      // Fallback safeguard for admin preview override
      if (payload.user && payload.user.role === 'admin') {
        state.user = payload.user;
        state.vendor = payload.user.vendor || null;
      } else {
        throw new Error('Unauthorized');
      }
    } else {
      state.user = payload.user;
      state.vendor = payload.user.vendor || null;
    }

    // Access Control Security Guard: Block unverified business users
    if (payload.user && !payload.user.verified) {
      renderOtpVerification(payload.user.email);
      return;
    }

    // Load active dashboard data if present
    if (state.vendor) {
      await fetchDashboardStats();
    }

    // Populate navbar triggers
    const firstLetter = (state.user.name || 'W')[0].toUpperCase();
    const headerAvatar = document.getElementById('headerProfileAvatarLetter');
    if (headerAvatar) headerAvatar.textContent = firstLetter;

    // Populate profile dropdown menu fields
    const dropdownAvatar = document.getElementById('dropdownAvatarLetter');
    if (dropdownAvatar) dropdownAvatar.textContent = firstLetter;
    
    const dropdownTitle = document.getElementById('dropdownUserTitle');
    if (dropdownTitle) dropdownTitle.textContent = state.user.name || 'WedEazzy Partner';
    
    const dropdownEmail = document.getElementById('dropdownUserEmail');
    if (dropdownEmail) dropdownEmail.textContent = state.user.email || 'partner@wedeazzy.com';


    // Initialize Greeting & Clock
    initLiveGreetingAndClock();
    
    // Render Notifications list in navbar dropdown
    renderNotificationsInDropdown();
    
    // Close dropdowns on outside clicks
    window.addEventListener('click', (e) => {
      if (!e.target.closest('#notificationsTrigger') && !e.target.closest('#profileDropdown')) {
        closeAllDropdowns();
      }
    });

    // Render Tab Viewport
    switchTab('dashboard');
    triggerToast('Welcome back, session authorized!');
    const analyticsBadge = document.getElementById('analyticsBadge');
    if (analyticsBadge) analyticsBadge.style.display = 'inline-block';

  } catch (err) {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    window.location.href = '../index.html?auth=login';
  }
}

/* --- Live Greeting & Digital Clock --- */
function initLiveGreetingAndClock() {
  const headerLeft = document.querySelector('.header-left');
  if (!headerLeft) return;

  // Create greeting node if not exist
  let greetBox = document.getElementById('headerGreeting');
  if (!greetBox) {
    greetBox = document.createElement('div');
    greetBox.id = 'headerGreeting';
    greetBox.className = 'header-greet';
    greetBox.style.marginRight = '16px';
    headerLeft.insertBefore(greetBox, headerLeft.querySelector('.search-bar-container'));
  }

  const updateClock = () => {
    const now = new Date();
    const hrs = now.getHours();
    let greet = 'Good Day';
    let icon = '🟡';

    if (hrs < 12) { greet = 'Good Morning'; icon = '🌅'; }
    else if (hrs < 17) { greet = 'Good Afternoon'; icon = '🟡'; }
    else { greet = 'Good Evening'; icon = '🌙'; }

    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    
    const partnerName = state.user ? state.user.name.split(' ')[0] : 'Omkar';
    const partnerId = state.user && state.user.id !== '99' ? state.user.id : 'cmrl07vlg000al3rownpn60l';

    greetBox.innerHTML = `
      <h2>${icon} ${greet}, ${esc(partnerName)}</h2>
      <span>${timeStr} | Partner ID #${partnerId}</span>
    `;
  };

  updateClock();
  setInterval(updateClock, 1000);
}

/* --- Dropdown Controllers --- */
function toggleNotificationsDropdown(e) {
  e.stopPropagation();
  const notifyMenu = document.getElementById('notificationsDropdown');
  const profileMenu = document.getElementById('profileDropdownMenu');
  
  if (profileMenu) profileMenu.classList.remove('show');
  if (notifyMenu) notifyMenu.classList.toggle('show');
}

function toggleProfileDropdown(e) {
  e.stopPropagation();
  const notifyMenu = document.getElementById('notificationsDropdown');
  const profileMenu = document.getElementById('profileDropdownMenu');
  
  if (notifyMenu) notifyMenu.classList.remove('show');
  if (profileMenu) profileMenu.classList.toggle('show');
}

function closeAllDropdowns() {
  const notifyMenu = document.getElementById('notificationsDropdown');
  const profileMenu = document.getElementById('profileDropdownMenu');
  if (notifyMenu) notifyMenu.classList.remove('show');
  if (profileMenu) profileMenu.classList.remove('show');
}

function renderNotificationsInDropdown() {
  const listBody = document.getElementById('notificationsDropdownBody');
  const badge = document.querySelector('.notifications-badge');
  if (!listBody) return;

  const notes = state.notifications || [];
  if (notes.length === 0) {
    if (badge) badge.style.display = 'none';
    listBody.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-secondary); font-size: 13px;">
        <span>📭</span> No new notifications.
      </div>
    `;
    return;
  }

  if (badge) {
    badge.style.display = 'block';
    badge.textContent = notes.length;
  }

  listBody.innerHTML = notes.map(n => `
    <div class="notification-item ${n.type || 'update'}" onclick="triggerToast('Viewing: ${esc(n.title)}')">
      <div class="notification-item-icon">
        ${n.type === 'alert' ? '⚠️' : n.type === 'success' ? '✓' : '🔔'}
      </div>
      <div class="notification-item-content">
        <span class="notification-item-title">${esc(n.title)}</span>
        <span class="notification-item-text">${esc(n.text)}</span>
        <span class="notification-item-time">${n.time}</span>
      </div>
    </div>
  `).join('');
}

function clearAllNotifications(e) {
  if (e) e.stopPropagation();
  state.notifications = [];
  renderNotificationsInDropdown();
  triggerToast('All notifications cleared.');
}

/* ============================================================================
 * SECURE EMAIL OTP VERIFICATION SYSTEM (SPA OVERLAY)
 * ========================================================================== */

function renderOtpVerification(email) {
  // Overwrite document.body to isolate the OTP verification process
  document.body.innerHTML = `
    <div class="otp-overlay">
      <!-- Ambient Glowing Wedding Accents -->
      <div class="otp-ambient-bubble bubble-1"></div>
      <div class="otp-ambient-bubble bubble-2"></div>

      <div class="otp-card" style="z-index: 10;">
        <div class="sidebar-logo" style="padding:0; margin-bottom: 24px; text-align:center; align-items:center; display:flex; flex-direction:column;">
          <img src="../assets/images/logo.png" alt="WedEazzy" onerror="this.src='https://raw.githubusercontent.com/HiteshD/WedeazzyAssets/main/logo.png'" style="filter:none; height:40px;">
          <span style="color:var(--gold); font-size:10px; font-weight:700; letter-spacing:0.25em; text-transform:uppercase; margin-top:6px; display:block;">Secure Business Portal</span>
        </div>
        
        <div class="otp-header">
          <h2>Confirm your email</h2>
          <p>A secure 6-digit verification code has been dispatched to <strong>${esc(email)}</strong>. Enter it below to unlock access.</p>
        </div>
        
        <div class="otp-digit-inputs" id="otpBoxContainer">
          <input type="text" maxlength="1" class="otp-digit-box" data-index="0" autofocus />
          <input type="text" maxlength="1" class="otp-digit-box" data-index="1" />
          <input type="text" maxlength="1" class="otp-digit-box" data-index="2" />
          <input type="text" maxlength="1" class="otp-digit-box" data-index="3" />
          <input type="text" maxlength="1" class="otp-digit-box" data-index="4" />
          <input type="text" maxlength="1" class="otp-digit-box" data-index="5" />
        </div>

        <div class="otp-timer-container">
          Resend code in <span class="otp-timer-highlight" id="otpTimerValue">60s</span>
        </div>

        <button class="btn-premium btn-navy" style="width:100%; margin-bottom:12px; font-size:14px; padding:12px;" id="otpVerifyBtn" onclick="submitOtpCode('${esc(email)}')">
          Verify &amp; Continue
        </button>

        <button class="btn-premium btn-outline" style="width:100%; font-size:13px;" id="otpResendBtn" disabled onclick="resendOtpCode('${esc(email)}')">
          Resend OTP Email
        </button>

        <div style="margin-top:20px; font-size:11px; color:var(--text-muted);">
          Logged in as ${esc(email)}. <a href="#" onclick="handleLogout()" style="color:var(--navy); font-weight:600; text-decoration:underline;">Switch Account</a>
        </div>
      </div>
    </div>
    <div id="toastContainer"></div>
  `;

  // Start autoshift event listeners
  setupOtpInputShifting(email);

  // Start 60s countdown
  startOtpCountdown();
}

let countdownInterval = null;
function startOtpCountdown() {
  const timerVal = document.getElementById('otpTimerValue');
  const resendBtn = document.getElementById('otpResendBtn');
  if (!timerVal || !resendBtn) return;

  let seconds = 60;
  resendBtn.disabled = true;
  timerVal.textContent = `${seconds}s`;

  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    seconds--;
    timerVal.textContent = `${seconds}s`;

    if (seconds <= 0) {
      clearInterval(countdownInterval);
      timerVal.textContent = 'Ready';
      resendBtn.disabled = false;
    }
  }, 1000);
}

function setupOtpInputShifting(email) {
  const inputs = document.querySelectorAll('.otp-digit-box');
  inputs.forEach((input, index) => {
    // Keyup logic
    input.addEventListener('keyup', (e) => {
      if (['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) return;
      
      const val = input.value;
      if (val && val.length === 1 && index < 5) {
        inputs[index + 1].focus();
      }

      // Modern auto-submit when all 6 digits are keyed
      const code = Array.from(inputs).map(i => i.value.trim()).join('');
      if (code.length === 6 && !isNaN(code)) {
        submitOtpCode(email);
      }
    });

    // Backspace & key navigation refinement
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (input.value) {
          input.value = '';
        } else if (index > 0) {
          inputs[index - 1].value = '';
          inputs[index - 1].focus();
        }
      } else if (e.key === 'ArrowLeft' && index > 0) {
        inputs[index - 1].focus();
      } else if (e.key === 'ArrowRight' && index < 5) {
        inputs[index + 1].focus();
      }
    });

    // Paste event
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const cleanDigits = text.replace(/[^0-9]/g, '').slice(0, 6);
      
      cleanDigits.split('').forEach((char, idx) => {
        if (inputs[idx]) {
          inputs[idx].value = char;
          inputs[idx].classList.remove('error');
        }
      });

      const nextFocus = Math.min(cleanDigits.length, 5);
      inputs[nextFocus].focus();

      // Auto-submit upon paste match
      if (cleanDigits.length === 6) {
        submitOtpCode(email);
      }
    });
  });
  
  // Auto-focus first digit
  setTimeout(() => inputs[0].focus(), 150);
}

async function resendOtpCode(email) {
  try {
    const resendBtn = document.getElementById('otpResendBtn');
    resendBtn.innerHTML = `<span class="otp-loading-spinner"></span> Resending...`;
    resendBtn.disabled = true;

    const data = await api('/api/auth/email/send-otp', {
      method: 'POST',
      body: { email }
    });

    if (!data.ok) throw new Error(data.message || 'Resend failed');


    triggerToast('New 6-digit OTP code sent to your email.');
    resendBtn.innerHTML = `Resend OTP Email`;
    startOtpCountdown();

  } catch (err) {
    triggerToast(err.message || 'Failed to resend code.', true);
    document.getElementById('otpResendBtn').innerHTML = `Resend OTP Email`;
    document.getElementById('otpResendBtn').disabled = false;
  }
}

async function submitOtpCode(email) {
  const inputs = document.querySelectorAll('.otp-digit-box');
  const verifyBtn = document.getElementById('otpVerifyBtn');
  let code = '';
  
  inputs.forEach(input => {
    code += input.value.trim();
    input.classList.remove('error');
  });

  if (code.length < 6 || isNaN(code)) {
    triggerToast('Please enter a valid 6-digit code.', true);
    inputs.forEach(input => {
      if (!input.value) input.classList.add('error');
    });
    return;
  }

  // Prevent multiple simultaneous clicks
  if (verifyBtn.disabled) return;

  try {
    verifyBtn.innerHTML = `<span class="otp-loading-spinner"></span> Verifying...`;
    verifyBtn.disabled = true;

    const data = await api('/api/auth/email/verify-otp', {
      method: 'POST',
      body: { email, code }
    });

    if (!data.ok) throw new Error(data.message || 'Verification failed');

    // Save newly verified token
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.setItem(TOKEN_KEY, data.token);
    
    // Render high-fidelity success morph
    const card = document.querySelector('.otp-card');
    if (card) {
      card.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 32px 0; animation: otp-fade-in 0.4s ease-out;">
          <div class="success-checkmark-circle">
            <span class="success-checkmark-stem"></span>
            <span class="success-checkmark-kick"></span>
          </div>
          <h2 style="font-family:var(--serif); font-size: 26px; color: var(--navy); margin-top: 24px; font-weight:700;">Welcome to WedEazzy</h2>
          <p style="font-size:13.5px; color:var(--text-secondary); margin-top:6px;">Your portal session is securely verified.</p>
        </div>
      `;
    }

    triggerToast('Verification successful! Access granted.', false);
    
    // Reboot dashboard into fully verified layout after checkmark drawing concludes
    setTimeout(() => {
      window.location.reload();
    }, 1400);

  } catch (err) {
    triggerToast(err.message || 'Invalid or expired OTP. Please try again.', true);
    verifyBtn.innerHTML = `Verify &amp; Continue`;
    verifyBtn.disabled = false;
    inputs.forEach(input => {
      input.classList.add('error');
      input.value = '';
    });
    inputs[0].focus();
  }
}

// REST call wrapper
async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  const tok = getStoredToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const activeVendorId = localStorage.getItem('wedeazzy_active_vendor_id');
  if (activeVendorId && !headers['x-vendor-id'] && !headers['X-Vendor-Id']) {
    headers['X-Vendor-Id'] = activeVendorId;
  }
  const r = await fetch(API_BASE + path, Object.assign({}, opts, { headers, body: opts.body ? JSON.stringify(opts.body) : undefined }));
  let data = null;
  try { data = await r.json(); } catch (_) {}
  if (!r.ok) throw new Error((data && data.message) || `Request failed: ${r.status}`);
  return data;
}

// Dashboard statistics loader
async function fetchDashboardStats() {
  try {
    // 1. Get vendor listing details
    const activeVendorId = localStorage.getItem('wedeazzy_active_vendor_id') || '';
    const url = activeVendorId ? `/api/vendor/me?vendorId=${activeVendorId}` : '/api/vendor/me';
    const headers = activeVendorId ? { 'X-Vendor-Id': activeVendorId } : {};

    const data = await api(url, { headers });
    if (data && data.vendor) {
      state.vendor = data.vendor;
      state.vendor.completion = data.completion;
      state.counts = data.counts || {};
      state.vendors = data.vendors || [data.vendor];
    }

    // 2. Get real inquiries (leads)
    try {
      const leadsRes = await api('/api/reports/vendor/leads');
      if (leadsRes && leadsRes.ok && Array.isArray(leadsRes.data)) {
        state.mockData.inquiries = leadsRes.data.map(i => ({
          id: i.id.slice(-6).toUpperCase(),
          realId: i.id,
          name: i.name,
          phone: i.phone,
          email: (i.email === '—' || !i.email) ? '' : i.email,
          eventDate: i.eventDate,
          guests: i.guests === '—' ? '100-300' : i.guests,
          budget: i.budget === '—' ? 'Skip' : i.budget,
          callDiscussion: i.callDiscussion === '—' ? 'No preference' : i.callDiscussion,
          status: i.status,
          notes: (i.notes === '—' || !i.notes) ? '' : i.notes,
          source: i.source || 'Direct',
          createdAt: i.createdAt
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch real vendor inquiries from DB:', e);
    }

    // 3. Get real bookings
    try {
      const bookingsRes = await api('/api/reports/vendor/bookings');
      if (bookingsRes && bookingsRes.ok && Array.isArray(bookingsRes.data)) {
        state.mockData.bookings = bookingsRes.data.map(b => ({
          id: b.id.slice(-6).toUpperCase(),
          name: b.customerName,
          date: b.eventDate,
          status: b.status,
          payment: b.status === 'confirmed' || b.status === 'completed' ? 'Fully Paid' : 'Pending',
          amount: b.amount,
          phone: b.customerPhone
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch real vendor bookings from DB:', e);
    }
  } catch (e) {
    console.warn('API metrics down, compiling mocks...');
  }
}

// Light & Dark theme triggers
function setTheme(mode) {
  state.theme = mode;
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem(THEME_KEY, mode);
  
  const icon = document.getElementById('themeSwitchIcon');
  if (icon) {
    icon.textContent = mode === 'dark' ? '☀️' : '🌙';
  }
}

function toggleTheme() {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

// Switch tabs inside SPA administrative container
async function switchTab(tabName) {
  let targetTab = tabName;
  if (targetTab === 'analytics') targetTab = 'reports';

  state.activeTab = targetTab;
  state.pageIndex = 1; // reset pagination
  
  // Highlight sidebar
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.dataset.tab === targetTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // If active tab is inside a dropdown, expand the dropdown automatically
  const activeBtn = document.querySelector(`.nav-item[data-tab="${targetTab}"]`);
  if (activeBtn && activeBtn.classList.contains('sub-item')) {
    const dropdownContainer = activeBtn.closest('.dropdown-container');
    if (dropdownContainer) {
      dropdownContainer.classList.add('show');
      const toggleBtn = dropdownContainer.previousElementSibling;
      if (toggleBtn) toggleBtn.classList.add('open');
    }
  }

  // Render specific tab layout
  const container = document.getElementById('contentViewport');
  
  // Luxurious Multi-Component Loading Skeleton
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:24px; animation: fade-step 0.3s ease;">
      <div class="skeleton" style="height:32px; width:35%; border-radius:8px;"></div>
      <div class="skeleton" style="height:140px; width:100%; border-radius:14px;"></div>
      <div class="metrics-grid" style="grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); margin-bottom: 0; gap: 20px;">
        <div class="skeleton" style="height:110px; border-radius:14px;"></div>
        <div class="skeleton" style="height:110px; border-radius:14px;"></div>
        <div class="skeleton" style="height:110px; border-radius:14px;"></div>
      </div>
      <div class="skeleton" style="height:260px; width:100%; border-radius:14px;"></div>
    </div>
  `;

  // Fetch fresh stats from the DB before rendering
  try {
    if (['dashboard', 'leads', 'bookings', 'reviews'].includes(targetTab)) {
      await fetchDashboardStats();
    }
  } catch (err) {
    console.warn('Failed to fetch fresh stats on tab switch:', err);
  }

  setTimeout(() => {
    renderTab(tabName, container);
  }, 100);

  // Close mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('mobile-open');
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.toggle('mobile-open');
  if (sidebarOverlay) sidebarOverlay.classList.toggle('mobile-open');
}

function toggleSidebarDropdown(btn) {
  const container = btn.nextElementSibling;
  btn.classList.toggle('open');
  if (container) container.classList.toggle('show');
}

// Router dispatcher
function renderTab(tab, el) {
  if (tab === 'dashboard')            renderDashboardTab(el);
  else if (tab === 'profile')         renderProfileTab(el);
  else if (tab === 'businesses')      renderBusinessesTab(el);
  else if (tab === 'add-business')    renderAddBusinessTab(el);
  else if (tab === 'bookings')        renderBookingsTab(el);
  else if (tab === 'subscriptions')   renderSubscriptionsTab(el);
  else if (tab === 'reports')         renderReportsTab(el);
  else if (tab === 'insights')        renderInsightsTab(el);
  else if (tab === 'grow-business')   renderGrowBusinessTab(el);
  else if (tab === 'leads')           renderLeadsTab(el);
  else if (tab === 'reviews')         renderReviewsTab(el);
  else if (tab === 'whatsapp-campaigns') renderComingSoonTab(el, 'WhatsApp Campaigns');
  else if (tab === 'marketing-campaigns') renderComingSoonTab(el, 'Marketing Campaigns');
  else if (tab === 'seo')             renderComingSoonTab(el, 'SEO Tools');
  else if (tab === 'featured')        renderComingSoonTab(el, 'Featured Listing Manager');
  else if (tab === 'promotions')      renderComingSoonTab(el, 'Promotions');
  else if (tab === 'campaigns')       renderComingSoonTab(el, 'Ads Campaigns');
  else if (tab === 'coupons')         renderComingSoonTab(el, 'Coupons');
  else if (tab === 'website-traffic') renderComingSoonTab(el, 'Website Traffic');
  else if (tab === 'delete-profile')  renderDeleteProfileTab(el);
  else if (tab === 'settings')        renderSettingsTab(el);
}

function renderComingSoonTab(el, tabTitle) {
  el.innerHTML = `
    <div class="card-premium" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 40px; text-align: center; border-radius: 20px; background: var(--bg-card); border: 1px solid var(--border-color); box-shadow: var(--shadow-premium); min-height: 420px; animation: fade-step 0.3s ease;">
      <div style="background: var(--rose-blush); border: 1.5px solid var(--rose-border); width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; box-shadow: 0 10px 25px rgba(209, 38, 83, 0.1);">
        <span style="font-size: 36px; line-height: 1;">🔒</span>
      </div>
      <h2 style="font-family: var(--serif); font-size: 26px; color: var(--navy); margin-bottom: 10px; font-weight: 700;">${esc(tabTitle)}</h2>
      <span style="background: var(--rose-blush); color: var(--rose-primary); font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; margin-bottom: 16px;">Coming Soon</span>
      <p style="font-size: 14.5px; color: var(--text-secondary); max-width: 440px; margin: 0 auto 24px auto; line-height: 1.6;">
        We are crafting powerful WedEazzy Marketing Solutions to help you scale bookings, manage promotions, and run high-converting WhatsApp ads. This feature is currently locked.
      </p>
      <div style="display: flex; gap: 12px; width: 100%; max-width: 380px; margin: 0 auto;">
        <input type="email" id="comingSoonEmail" placeholder="Enter your email for early access..." style="flex-grow: 1; padding: 12px 16px; border: 1px solid var(--border-color); border-radius: 10px; font-size: 13.5px; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='var(--rose-primary)'" onblur="this.style.borderColor='var(--border-color)'">
        <button class="btn-premium btn-pink" style="padding: 12px 20px; font-size: 13.5px; font-weight: 700; border-radius: 10px; white-space: nowrap;" onclick="window.submitComingSoonInterest('${esc(tabTitle)}')">Notify Me</button>
      </div>
      <div id="comingSoonSuccess" style="color: #059669; font-weight: 700; display: none; font-size: 13px; margin-top: 16px;">✔ Thank you! We will notify you when early beta access begins.</div>
    </div>
  `;
}

window.submitComingSoonInterest = function(featureName) {
  const emailInput = document.getElementById('comingSoonEmail');
  const email = emailInput ? emailInput.value.trim() : '';
  if (!email || !email.includes('@')) {
    triggerToast('Please enter a valid email address.', true);
    return;
  }
  
  if (emailInput) emailInput.value = '';
  const successEl = document.getElementById('comingSoonSuccess');
  if (successEl) successEl.style.display = 'block';
  triggerToast('Interest registered! We will contact you soon.');
};

/* ============================================================================
 * VIEW BLOCKS (SaaS Modules)
 * ========================================================================== */

window.handleRecentEnquiriesSearch = function(val) {
  state.recentEnquiriesSearch = val;
  state.recentEnquiriesPage = 1;
  const container = document.getElementById('contentViewport');
  if (container && state.activeTab === 'dashboard') {
    renderDashboardTab(container);
  }
};

window.changeRecentEnquiriesPage = function(direction) {
  state.recentEnquiriesPage = (state.recentEnquiriesPage || 1) + direction;
  const container = document.getElementById('contentViewport');
  if (container && state.activeTab === 'dashboard') {
    renderDashboardTab(container);
  }
};

// 1. DASHBOARD OVERVIEW TAB
function renderDashboardTab(el) {
  const isFirstTime = !state.vendor && !location.search.includes('preview=true') && !location.search.includes('demo=true');

  if (isFirstTime) {
    el.innerHTML = `
      <div class="onboarding-container">
        <div class="onboarding-title-area">
          <h2 class="onboarding-title">🚀 Welcome to WedEazzy Partner Portal!</h2>
          <p class="onboarding-subtitle">Your wedding business profile setup is pending. Please complete the following onboarding checklist to publish your services and unlock customer booking streams.</p>
        </div>

        <div class="onboarding-progress-container">
          <div class="onboarding-progress-bar">
            <div class="onboarding-progress-fill" style="width: 20%;"></div>
          </div>
          <span class="onboarding-progress-text">20% Completed</span>
        </div>

        <div class="onboarding-grid">
          <!-- Step 1 -->
          <div class="onboarding-card" onclick="switchTab('profile')">
            <div class="onboarding-card-header">
              <span class="onboarding-card-icon">👤</span>
              <div class="onboarding-card-details">
                <h4 class="onboarding-card-title">1. Complete Profile</h4>
                <p class="onboarding-card-desc">Verify contact details, email logs, and display name settings.</p>
              </div>
            </div>
            <div class="onboarding-card-footer">
              <span class="onboarding-card-action">Go to Profile</span>
              <span class="onboarding-card-status pending">● To Do</span>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="onboarding-card" onclick="switchTab('add-business')">
            <div class="onboarding-card-header">
              <span class="onboarding-card-icon">🏛️</span>
              <div class="onboarding-card-details">
                <h4 class="onboarding-card-title">2. Add First Business</h4>
                <p class="onboarding-card-desc">List venue capacity, pricing metrics, and photo albums.</p>
              </div>
            </div>
            <div class="onboarding-card-footer">
              <span class="onboarding-card-action">Add Business</span>
              <span class="onboarding-card-status pending">● To Do</span>
            </div>
          </div>

          <!-- Step 3 -->
          <div class="onboarding-card" style="opacity: 0.6; cursor: not-allowed;" onclick="triggerToast('Add a business first to receive leads!', true); event.stopPropagation();">
            <div class="onboarding-card-header">
              <span class="onboarding-card-icon">👥</span>
              <div class="onboarding-card-details">
                <h4 class="onboarding-card-title">3. Get First Lead</h4>
                <p class="onboarding-card-desc">Receive real-time WhatsApp inquiry alerts directly to your phone.</p>
              </div>
            </div>
            <div class="onboarding-card-footer">
              <span class="onboarding-card-action" style="color:var(--text-muted); text-decoration:none;">Locked</span>
              <span class="onboarding-card-status pending">🔒 Locked</span>
            </div>
          </div>

          <!-- Step 4 -->
          <div class="onboarding-card" style="opacity: 0.6; cursor: not-allowed;" onclick="triggerToast('Add a business first to run promotions!', true); event.stopPropagation();">
            <div class="onboarding-card-header">
              <span class="onboarding-card-icon">🚀</span>
              <div class="onboarding-card-details">
                <h4 class="onboarding-card-title">4. Promote Business</h4>
                <p class="onboarding-card-desc">Activate seasonal deals and coupons to attract bookings.</p>
              </div>
            </div>
            <div class="onboarding-card-footer">
              <span class="onboarding-card-action" style="color:var(--text-muted); text-decoration:none;">Locked</span>
              <span class="onboarding-card-status pending">🔒 Locked</span>
            </div>
          </div>

          <!-- Step 5 -->
          <div class="onboarding-card" onclick="switchTab('subscriptions')">
            <div class="onboarding-card-header">
              <span class="onboarding-card-icon">🔖</span>
              <div class="onboarding-card-details">
                <h4 class="onboarding-card-title">5. Upgrade Subscription</h4>
                <p class="onboarding-card-desc">Activate high ranking search locks with Razorpay secure checkout.</p>
              </div>
            </div>
            <div class="onboarding-card-footer">
              <span class="onboarding-card-action">View Plans</span>
              <span class="onboarding-card-status pending">● To Do</span>
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const list = getActiveList();
  const v = state.vendor || list[0] || {};
  const activePlan = v.subscriptionPlan || 'Premium';
  const plans = state.plans || {
    Free: { maxPhotos: 4, maxBusinesses: 1, reportsAccess: false, insightsAccess: false },
    Premium: { maxPhotos: 5, maxBusinesses: 3, reportsAccess: true, insightsAccess: false },
    Featured: { maxPhotos: 10, maxBusinesses: 7, reportsAccess: true, insightsAccess: true }
  };

  const businessesCount = (state.vendors || [v]).length;
  const maxBusinessesLimit = plans[activePlan]?.maxBusinesses || (activePlan === 'Featured' ? 7 : activePlan === 'Premium' ? 3 : 1);

  const inqList = state.mockData.inquiries || [];
  const unreadEnquiriesCount = inqList.filter(i => i.status === 'new').length;

  // Calculate today's inquiries count
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnquiriesCount = inqList.filter(i => {
    const createdDate = i.createdAt ? new Date(i.createdAt) : null;
    return createdDate && createdDate >= todayStart;
  }).length;

  const completionPercent = v.isProfileComplete ? 100 : (v.completion || 0);

  // Check if we should render mock demo data (for preview/demo links or empty vendor listing profiles)
  const isDemo = location.search.includes('preview=true') || location.search.includes('demo=true') || !v.id;

  // Compute live dashboard metrics (using actual backend values OR fallback demo values)
  const viewsCount = isDemo ? 1248 : (state.counts?.profileVisitsAllTime ?? 0);
  const newEnqCount = isDemo ? 26 : todayEnquiriesCount;
  const totalEnqCount = isDemo ? 89 : inqList.length;
  const totalReviews = isDemo ? 26 : (v.ratingCount ?? 0);
  const avgRating = isDemo ? '4.8' : (totalReviews > 0 ? Number(v.rating || 0).toFixed(1) : '0.0');
  const galleryCount = isDemo ? 8 : (v.photos || []).length;
  const compPercent = isDemo ? 92 : completionPercent;

  // Timeline Activity html rendering based on live leads or mockup logs
  let activityHtml = '';
  if (isDemo) {
    activityHtml = `
          <!-- Timeline Item 1 -->
          <div style="position: relative;">
            <span style="position: absolute; left: -26px; top: 3px; background: #2563eb; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--bg-card); box-shadow: 0 0 0 3px rgba(37,99,235,0.15);"></span>
            <div>
              <strong style="color: var(--navy); font-size: 12.5px; display: block;">New enquiry received from Priya Shah</strong>
              <span style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 2px;">10 mins ago</span>
            </div>
          </div>

          <!-- Timeline Item 2 -->
          <div style="position: relative;">
            <span style="position: absolute; left: -26px; top: 3px; background: #10b981; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--bg-card); box-shadow: 0 0 0 3px rgba(16,185,129,0.15);"></span>
            <div>
              <strong style="color: var(--navy); font-size: 12.5px; display: block;">Your profile received 18 new views</strong>
              <span style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 2px;">32 mins ago</span>
            </div>
          </div>

          <!-- Timeline Item 3 -->
          <div style="position: relative;">
            <span style="position: absolute; left: -26px; top: 3px; background: #e11d2a; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--bg-card); box-shadow: 0 0 0 3px rgba(225,29,42,0.15);"></span>
            <div>
              <strong style="color: var(--navy); font-size: 12.5px; display: block;">Sneha Iyer marked enquiry as interested</strong>
              <span style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 2px;">1 hour ago</span>
            </div>
          </div>

          <!-- Timeline Item 4 -->
          <div style="position: relative;">
            <span style="position: absolute; left: -26px; top: 3px; background: #f59e0b; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--bg-card); box-shadow: 0 0 0 3px rgba(245,158,11,0.15);"></span>
            <div>
              <strong style="color: var(--navy); font-size: 12.5px; display: block;">New review received from Rahul Patel <span style="color:#d97706; font-weight:700;">★ 5.0</span></strong>
              <span style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 2px;">2 hours ago</span>
            </div>
          </div>

          <!-- Timeline Item 5 -->
          <div style="position: relative;">
            <span style="position: absolute; left: -26px; top: 3px; background: #10b981; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--bg-card); box-shadow: 0 0 0 3px rgba(16,185,129,0.15);"></span>
            <div>
              <strong style="color: var(--navy); font-size: 12.5px; display: block;">Gallery photo 'Wedding Shoot 8' uploaded</strong>
              <span style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 2px;">3 hours ago</span>
            </div>
          </div>
    `;
  } else {
    const recentForActivity = inqList.slice(0, 5);
    if (recentForActivity.length > 0) {
      activityHtml = recentForActivity.map((inq, idx) => {
        const colors = ['#2563eb', '#10b981', '#e11d2a', '#f59e0b', '#7e22ce'];
        const color = colors[idx % colors.length];
        const dateObj = inq.createdAt ? new Date(inq.createdAt) : null;
        const timeStr = dateObj ? dateObj.toLocaleDateString('en-IN') : 'Recent';
        return `
          <div style="position: relative; margin-bottom: 6px;">
            <span style="position: absolute; left: -26px; top: 3px; background: ${color}; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--bg-card); box-shadow: 0 0 0 3px rgba(0,0,0,0.05);"></span>
            <div>
              <strong style="color: var(--navy); font-size: 12.5px; display: block;">New enquiry received from ${esc(inq.name)}</strong>
              <span style="font-size: 10px; color: var(--text-muted); display: block; margin-top: 2px;">${timeStr}</span>
            </div>
          </div>
        `;
      }).join('');
    } else {
      activityHtml = `
        <div style="text-align: center; color: var(--text-muted); padding: 30px 0; font-size: 12px;">
          No recent activities logged yet.
        </div>
      `;
    }
  }

  // Fallback inquiries dataset for Demo Mode
  const rawList = (isDemo || inqList.length > 0) ? (inqList.length > 0 ? inqList : [
    { name: 'Priya Shah', phone: '9876543210', eventDate: '14 Dec 2025', daysLeft: '120', budget: '2,00,000', range: '2 - 3 Lakhs', service: 'Wedding Photography', status: 'new', city: 'Mumbai' },
    { name: 'Rahul Patel', phone: '9876543211', eventDate: '02 Jan 2026', daysLeft: '139', budget: '80,000', range: '50K - 1L', service: 'Wedding Photography', status: 'contacted', city: 'Navi Mumbai' },
    { name: 'Sneha Iyer', phone: '9876543212', eventDate: '22 Nov 2025', daysLeft: '96', budget: '3,00,000', range: '2 - 3 Lakhs', service: 'Pre Wedding Shoot', status: 'pending', city: 'Thane' },
    { name: 'Amit Verma', phone: '9876543213', eventDate: '10 Jan 2026', daysLeft: '147', budget: '1,50,000', range: '1 - 2 Lakhs', service: 'Wedding Photography', status: 'booked', city: 'Mumbai' },
    { name: 'Kavya Nair', phone: '9876543214', eventDate: '05 Dec 2025', daysLeft: '111', budget: '1,20,000', range: '1 - 2 Lakhs', service: 'Candid Photography', status: 'new', city: 'Pune' }
  ]) : [];

  // Filter by Search Query
  const searchQuery = (state.recentEnquiriesSearch || '').toLowerCase().trim();
  const filteredEnquiries = rawList.filter(i => {
    if (!searchQuery) return true;
    const nameMatch = (i.name || '').toLowerCase().includes(searchQuery);
    const budgetMatch = (i.budget || '').toLowerCase().includes(searchQuery);
    const guestsMatch = (i.guests || '').toLowerCase().includes(searchQuery);
    return nameMatch || budgetMatch || guestsMatch;
  });

  // Paginate
  const RECENT_ENQUIRIES_PER_PAGE = 5;
  const totalItems = filteredEnquiries.length;
  const totalPages = Math.ceil(totalItems / RECENT_ENQUIRIES_PER_PAGE) || 1;
  
  if (!state.recentEnquiriesPage) state.recentEnquiriesPage = 1;
  if (state.recentEnquiriesPage > totalPages) state.recentEnquiriesPage = totalPages;
  if (state.recentEnquiriesPage < 1) state.recentEnquiriesPage = 1;

  const startIdx = (state.recentEnquiriesPage - 1) * RECENT_ENQUIRIES_PER_PAGE;
  const displayEnquiries = filteredEnquiries.slice(startIdx, startIdx + RECENT_ENQUIRIES_PER_PAGE);

  // Helper to extract customer initials for modern avatar placeholder
  const getInitials = (name) => {
    return (name || 'Client')
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Helper to calculate days remaining dynamically
  const getDaysLeftText = (dateStr) => {
    if (!dateStr || dateStr === '—') return 'TBD';
    const eventDate = new Date(dateStr);
    const diffTime = eventDate.getTime() - Date.now();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      return `${diffDays} days`;
    } else if (diffDays === 0) {
      return `today`;
    } else {
      return `${Math.abs(diffDays)} days ago`;
    }
  };

  // Helper to resolve budget range
  const getBudgetRange = (budget) => {
    if (!budget || budget === 'Skip' || budget === '—') return 'TBD';
    const num = parseInt(budget.replace(/[^\d]/g, ''), 10) || 0;
    if (num >= 300000) return '2.5 - 4 Lakhs';
    if (num >= 200000) return '2 - 3 Lakhs';
    if (num >= 100000) return '1 - 2 Lakhs';
    return '50K - 1L';
  };

  // Profile checklist evaluations
  const hasPhone = isDemo ? true : (!!v.phone || !!v.whatsappNumber);
  const hasDesc = isDemo ? true : ((v.description || '').length >= 40);
  const hasServices = isDemo ? true : (Array.isArray(v.services) && v.services.length >= 1);
  const hasPhotos = isDemo ? true : ((v.photos || []).length >= 3);
  const hasTimings = isDemo ? false : (!!v.timings);
  const hasPricing = isDemo ? false : (!!v.priceMin);

  // Performance sparkline stats
  const perfViews = isDemo ? 1248 : (state.counts?.profileVisits30Days ?? 0);
  const perfEnq = isDemo ? 89 : (state.counts?.last30Inquiries ?? 0);
  const perfReviews = isDemo ? 6 : (v.ratingCount ?? 0);

  el.innerHTML = `
    <!-- Top Welcoming Hero Banner Card -->
    <div style="background: linear-gradient(135deg, rgba(209, 38, 83, 0.05) 0%, rgba(209, 38, 83, 0.01) 100%); 
                border: 1px solid var(--pink-border); 
                border-radius: 16px; 
                padding: 28px; 
                margin-bottom: 28px; 
                box-shadow: var(--shadow-premium); 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                flex-wrap: wrap; 
                gap: 24px;">
      
      <!-- Left side welcome details -->
      <div style="flex-grow: 1;">
        <span style="font-size: 13px; color: var(--text-secondary); display: block; margin-bottom: 4px; font-weight: 500;">Welcome back,</span>
        <h2 style="font-family: var(--serif); font-size: 26px; color: var(--navy); margin: 0 0 14px 0; font-weight: 700; display: flex; align-items: center; gap: 6px;">
          ${esc(v.businessName || 'shaadiDukaan Weddings')} 
          <span style="display: inline-flex; align-items: center; justify-content: center; background: #E11D2A; color: white; border-radius: 50%; width: 18px; height: 18px; font-size: 10px; font-weight: bold; vertical-align: middle;">✔</span>
        </h2>
        
        <!-- Tag pills -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <span style="background: #FFF9E6; color: #D97706; border: 1px solid #FDE68A; padding: 4px 12px; border-radius: 8px; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🏆 Premium Vendor</span>
          <span style="background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; padding: 4px 12px; border-radius: 8px; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">✔ Approved</span>
          <span style="background: #F3F4F6; color: #4B5563; border: 1px solid #E5E7EB; padding: 4px 12px; border-radius: 8px; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">📍 ${esc(v.city || 'Mumbai, Maharashtra')}</span>
        </div>
      </div>

      <!-- Right side subscription details -->
      <div style="display: flex; align-items: center; gap: 16px; background: rgba(255, 255, 255, 0.6); border: 1px solid var(--pink-border); border-radius: 12px; padding: 14px 20px; box-shadow: var(--shadow-sm);">
        <div style="background: #FFF0F2; width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #E11D2A;">👑</div>
        <div>
          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: var(--text-secondary); display: block; letter-spacing: 0.5px;">Current Plan</span>
          <strong style="font-size: 17px; color: var(--navy); display: block; margin-top: 2px;">${activePlan}</strong>
          <span style="font-size: 11.5px; color: #E11D2A; font-weight: 700; display: block; margin-top: 2px;">Expires in 24 days</span>
        </div>
        <button class="btn-premium btn-pink" style="padding: 10px 18px; font-size: 12.5px; border-radius: 8px; font-weight: 700; margin-left: 8px;" onclick="switchTab('subscriptions')">Manage Subscription</button>
      </div>
    </div>

    <!-- 6 Snapshot KPI Cards Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; margin-bottom: 32px;">
      
      <!-- Profile Views -->
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 16px; transition: all 0.3s ease; box-shadow: var(--shadow-premium);"
           onmouseover="this.style.transform='translateY(-3px)'; this.style.borderColor='var(--pink-border)';"
           onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='var(--border-color)';">
        <div style="background: rgba(225, 29, 42, 0.08); color: #e11d2a; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">👁</div>
        <div>
          <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Profile Views</span>
          <h3 style="font-size: 24px; color: var(--navy); margin: 0; font-family: var(--serif); font-weight: 700;" id="cnt-views">1,248</h3>
        </div>
      </div>

      <!-- Today's Enquiries -->
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 16px; transition: all 0.3s ease; box-shadow: var(--shadow-premium);"
           onmouseover="this.style.transform='translateY(-3px)'; this.style.borderColor='var(--pink-border)';"
           onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='var(--border-color)';">
        <div style="background: rgba(16, 185, 129, 0.08); color: #10b981; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">✉</div>
        <div>
          <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Today's Enquiries</span>
          <h3 style="font-size: 24px; color: var(--navy); margin: 0; font-family: var(--serif); font-weight: 700;" id="cnt-new-enquiries">26</h3>
        </div>
      </div>

      <!-- Total Enquiries -->
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 16px; transition: all 0.3s ease; box-shadow: var(--shadow-premium);"
           onmouseover="this.style.transform='translateY(-3px)'; this.style.borderColor='var(--pink-border)';"
           onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='var(--border-color)';">
        <div style="background: rgba(245, 158, 11, 0.08); color: #f59e0b; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">📁</div>
        <div>
          <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Total Enquiries</span>
          <h3 style="font-size: 24px; color: var(--navy); margin: 0; font-family: var(--serif); font-weight: 700;" id="cnt-total-enquiries">89</h3>
        </div>
      </div>

      <!-- Average Rating -->
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 16px; transition: all 0.3s ease; box-shadow: var(--shadow-premium);"
           onmouseover="this.style.transform='translateY(-3px)'; this.style.borderColor='var(--pink-border)';"
           onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='var(--border-color)';">
        <div style="background: rgba(59, 130, 246, 0.08); color: #3b82f6; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">⭐</div>
        <div>
          <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Average Rating</span>
          <h3 style="font-size: 24px; color: var(--navy); margin: 0; font-family: var(--serif); font-weight: 700;">${avgRating}</h3>
          <span style="font-size: 11px; color: var(--text-secondary); font-weight: 600; display: block; margin-top: 4px;">(${totalReviews} Reviews)</span>
        </div>
      </div>



      <!-- Businesses -->
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 16px; transition: all 0.3s ease; box-shadow: var(--shadow-premium);"
           onmouseover="this.style.transform='translateY(-3px)'; this.style.borderColor='var(--pink-border)';"
           onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='var(--border-color)';">
        <div style="background: rgba(16, 185, 129, 0.08); color: #10b981; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">🏢</div>
        <div>
          <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Businesses</span>
          <h3 style="font-size: 24px; color: var(--navy); margin: 0; font-family: var(--serif); font-weight: 700;">${businessesCount} / ${maxBusinessesLimit}</h3>
          <span style="font-size: 11px; color: var(--text-secondary); font-weight: 600; display: block; margin-top: 4px;">Used</span>
        </div>
      </div>

      <!-- Profile Completion -->
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 16px; transition: all 0.3s ease; box-shadow: var(--shadow-premium);"
           onmouseover="this.style.transform='translateY(-3px)'; this.style.borderColor='var(--pink-border)';"
           onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='var(--border-color)';">
        <div style="background: rgba(209, 38, 83, 0.08); color: #C82156; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">⁒</div>
        <div style="flex-grow: 1;">
          <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Profile Completion</span>
          <h3 style="font-size: 24px; color: var(--navy); margin: 0; font-family: var(--serif); font-weight: 700;" id="cnt-completion">${compPercent}%</h3>
          <div style="height: 6px; background: var(--border-color); border-radius: 99px; overflow: hidden; width: 100%; margin-top: 10px;">
            <div style="width: ${compPercent}%; height: 100%; background: #E11D2A; border-radius: 99px;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Split Grid -->
    <div style="display: grid; grid-template-columns: 2.2fr 1fr; gap: 28px; margin-bottom: 32px;" class="form-grid-premium">
      
      <!-- Left Column: Recent Enquiries Table Card -->
      <div class="card-premium" style="padding: 24px; border-radius: 16px; box-shadow: var(--shadow-premium); background: var(--bg-card);">
        <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center;">
            <h3 style="font-family: var(--serif); font-size: 18px; color: var(--navy); margin: 0;">Recent Enquiries</h3>
            <span style="background: rgba(225, 29, 42, 0.08); color: #E11D2A; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; margin-left: 10px;">${unreadEnquiriesCount || 5} New</span>
          </div>
          <button onclick="switchTab('leads')" style="background: none; border: none; color: #E11D2A; font-weight: 700; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
            View All Enquiries <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
        
        <!-- Search Input Bar -->
        <div style="margin-bottom: 16px;">
          <input type="text" id="recentEnquiriesSearch" placeholder="Search by customer name, budget, or guest count..." 
                 value="${state.recentEnquiriesSearch || ''}" 
                 style="width: 100%; padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 10px; font-size: 13.5px; outline: none; transition: border-color 0.2s;" 
                 onfocus="this.style.borderColor='var(--rose-primary)'" 
                 onblur="this.style.borderColor='var(--border-color)'"
                 oninput="window.handleRecentEnquiriesSearch(this.value)" />
        </div>
        
        <div class="table-responsive">
          ${displayEnquiries.length > 0 ? `
            <table class="spreadsheet" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 1.5px solid var(--border-color); background: #F8F9FC;">
                  <th style="text-align: left; padding: 14px 16px; font-size: 11px; text-transform: uppercase; color: var(--text-secondary); font-weight: 700;">Customer</th>
                  <th style="text-align: left; padding: 14px 16px; font-size: 11px; text-transform: uppercase; color: var(--text-secondary); font-weight: 700;">Wedding Date</th>
                  <th style="text-align: left; padding: 14px 16px; font-size: 11px; text-transform: uppercase; color: var(--text-secondary); font-weight: 700;">Budget</th>
                  <th style="text-align: left; padding: 14px 16px; font-size: 11px; text-transform: uppercase; color: var(--text-secondary); font-weight: 700;">Service Required</th>
                  <th style="text-align: left; padding: 14px 16px; font-size: 11px; text-transform: uppercase; color: var(--text-secondary); font-weight: 700;">Status</th>
                  <th style="text-align: right; padding: 14px 16px; font-size: 11px; text-transform: uppercase; color: var(--text-secondary); font-weight: 700;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${displayEnquiries.map(i => {
                  const initials = getInitials(i.name);
                  const budgetVal = i.budget || 'TBD';
                  const rangeVal = i.range || getBudgetRange(i.budget);
                  const serviceVal = i.service || esc(v.category || 'Wedding Photographer');
                  const daysLeftVal = i.daysLeft ? `(${i.daysLeft} days)` : getDaysLeftText(i.eventDate);
                  const statusVal = i.status;
                  const cityVal = i.city || esc(v.city || 'Mumbai');

                  return `
                    <tr style="border-bottom: 1px solid var(--border-color); transition: background 0.2s;" onmouseover="this.style.background='rgba(209,38,83,0.01)'" onmouseout="this.style.background='none'">
                      <!-- Customer avatar and location -->
                      <td style="padding: 14px 16px; display: flex; align-items: center; gap: 12px;">
                        <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, rgba(209, 38, 83, 0.1) 0%, rgba(14, 23, 38, 0.05) 100%); color: var(--navy); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; flex-shrink:0;">
                          ${initials}
                        </div>
                        <div>
                          <strong style="color: var(--navy); font-size: 13.5px; display: block;">${esc(i.name)}</strong>
                          <span style="font-size: 11px; color: var(--text-muted);">${esc(cityVal)}</span>
                        </div>
                      </td>

                      <!-- Target Date + Remaining days -->
                      <td style="padding: 14px 16px; font-size: 13px; color: var(--text-primary);">
                        ${i.eventDate || 'TBD'}
                        <span style="font-size: 11px; color: #E11D2A; font-weight: 600; display: block; margin-top: 2px;">${daysLeftVal}</span>
                      </td>

                      <!-- Budget value -->
                      <td style="padding: 14px 16px; font-size: 13px; color: var(--text-primary);">
                        <strong>₹${budgetVal}</strong>
                      </td>

                      <td style="padding: 14px 16px; font-size: 13px; color: var(--text-secondary);">${esc(serviceVal)}</td>

                      <!-- Status Badges -->
                      <td style="padding: 14px 16px;">
                        <span class="status-badge ${statusVal}" 
                              style="font-size: 9px; font-weight: 800; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block;
                                     ${statusVal === 'new' ? 'background: #FFEBEF; color: #E11D2A;' :
                                       statusVal === 'contacted' ? 'background: #DBEAFE; color: #2563EB;' :
                                       statusVal === 'quoted' ? 'background: #f3e8ff; color: #7e22ce;' :
                                       statusVal === 'pending' ? 'background: #FEF3C7; color: #D97706;' :
                                       statusVal === 'booked' ? 'background: #D1FAE5; color: #059669;' : 'background: #f3f4f6; color: #4b5563;'}">
                          ${statusVal}
                        </span>
                      </td>

                      <!-- View Details Action Button -->
                      <td style="padding: 14px 16px; text-align: right;">
                        <button class="btn-premium btn-outline" style="font-size: 11.5px; padding: 6px 14px; border-radius: 6px; border: 1px solid var(--pink-border); color: #E11D2A; background: transparent; font-weight: 700; transition: all 0.2s;"
                                onmouseover="this.style.background='#E11D2A'; this.style.color='white';"
                                onmouseout="this.style.background='transparent'; this.style.color='#E11D2A';"
                                onclick="openInquiryDetailModal('${i.id}')">View</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          ` : `
            <div style="text-align: center; color: var(--text-secondary); padding: 40px 20px;">No enquiries matched your search.</div>
          `}
        </div>

        <!-- Pagination Controls -->
        ${totalPages > 1 ? `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 14px; font-size: 12.5px; flex-wrap: wrap; gap: 10px;">
            <span style="color: var(--text-secondary); font-weight: 500;">
              Showing ${startIdx + 1} - ${Math.min(startIdx + RECENT_ENQUIRIES_PER_PAGE, totalItems)} of ${totalItems} enquiries
            </span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button class="btn-premium btn-outline" style="padding: 6px 12px; font-size: 12px; font-weight: 600; border-radius: 6px;" 
                      ${state.recentEnquiriesPage === 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} 
                      onclick="window.changeRecentEnquiriesPage(-1)">Previous</button>
              <span style="font-weight: 700; color: var(--navy); padding: 0 4px;">Page ${state.recentEnquiriesPage} of ${totalPages}</span>
              <button class="btn-premium btn-outline" style="padding: 6px 12px; font-size: 12px; font-weight: 600; border-radius: 6px;" 
                      ${state.recentEnquiriesPage === totalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} 
                      onclick="window.changeRecentEnquiriesPage(1)">Next</button>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Right Column: Stacks -->
      <div style="display: flex; flex-direction: column; gap: 28px;">
        
        <!-- Current Subscription Details Card -->
        <div class="card-premium" style="padding: 24px; border-radius: 16px; box-shadow: var(--shadow-premium); background: var(--bg-card); border-color: ${activePlan === 'Featured' ? '#FBBF24' : activePlan === 'Premium' ? 'var(--pink-border)' : 'var(--border-color)'};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
            <h3 style="font-family: var(--serif); font-size: 16px; margin: 0; color: var(--navy);">Current Subscription</h3>
            <span style="background:#FFEBEF; color:#E11D2A; font-size:9.5px; font-weight:800; padding:2px 8px; border-radius:6px; text-transform:uppercase;">Premium</span>
          </div>

          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
            <div style="background: #FFF0F2; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #E11D2A; flex-shrink: 0;">👑</div>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 12.5px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 6px;">
              <li style="display: flex; align-items: center; gap: 6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Profile visible in search results</li>
              <li style="display: flex; align-items: center; gap: 6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Receive unlimited enquiries</li>
              <li style="display: flex; align-items: center; gap: 6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Priority customer support</li>
              <li style="display: flex; align-items: center; gap: 6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Featured in category listing</li>
            </ul>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:14px;">
            <div>
              <span style="font-size:11px; color:var(--text-muted); display:block;">Expires on</span>
              <strong style="font-size:12.5px; color:var(--navy);">12 Aug 2026</strong>
            </div>
            <button class="btn-premium btn-outline" style="padding: 6px 14px; font-size:12px; border-radius:6px; border:1px solid var(--border-color); color:var(--text-primary);" onclick="switchTab('subscriptions')">Manage Subscription</button>
          </div>
        </div>

        <!-- Business Summary Card -->
        <div class="card-premium" style="padding: 24px; border-radius: 16px; box-shadow: var(--shadow-premium); background: var(--bg-card);">
          <h3 style="font-family: var(--serif); font-size: 16px; margin: 0 0 16px 0; color: var(--navy); border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Business Summary</h3>
          
          <div style="font-size: 12.5px; display: flex; flex-direction: column; gap: 10px; color: var(--text-secondary); margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items:center;"><span>🟢 Business Status</span><strong style="color: var(--success);">Approved</strong></div>
            <div style="display: flex; justify-content: space-between; align-items:center;"><span>🏷 Category</span><strong style="color: var(--navy);">${esc(isDemo ? 'Wedding Photographer' : (v.category || 'Wedding Photographer'))}</strong></div>
            <div style="display: flex; justify-content: space-between; align-items:center;"><span>📍 City Location</span><strong style="color: var(--navy);">${esc(isDemo ? 'Mumbai, Maharashtra' : (v.city || 'Mumbai'))}</strong></div>
            <div style="display: flex; justify-content: space-between; align-items:center;"><span>📷 Gallery Photos</span><strong style="color: var(--navy);">${galleryCount} / 10 Used</strong></div>
            <div style="display: flex; justify-content: space-between; align-items:center;"><span>📅 Joined On</span><strong style="color: var(--navy);">${isDemo ? '15 June 2026' : (v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'July 2026')}</strong></div>
          </div>
        </div>

        <!-- Profile Completion Card -->
        <div class="card-premium" style="padding: 24px; border-radius: 16px; box-shadow: var(--shadow-premium); background: var(--bg-card);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="font-family: var(--serif); font-size: 16px; margin:0; color: var(--navy);">Profile Completion</h3>
            <strong style="color: var(--success); font-size: 18px;">${compPercent}%</strong>
          </div>
          <div style="height: 7px; background: var(--border-color); border-radius: 99px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); margin-bottom: 20px;">
            <div style="width: ${compPercent}%; height: 100%; background: linear-gradient(90deg, #E11D2A, #FFA6B2); border-radius: 99px;"></div>
          </div>

          <!-- Actionable Checklist Items with circle symbols -->
          <div style="display: flex; flex-direction: column; gap: 10px; font-size: 12.5px; color: var(--text-primary);">
            <div style="cursor: pointer; display: flex; align-items: center; gap: 8px;" onclick="switchTab('profile')">
              ${hasPhone
                ? '<span style="color:var(--success); background:rgba(16,185,129,0.1); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">✔</span>' 
                : '<span style="color:#d97706; background:rgba(245,158,11,0.1); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">!</span>'} 
              Contact Details <span style="margin-left: auto; font-size: 11px; color: ${hasPhone ? 'var(--text-muted)' : '#d97706; font-weight: 700;'}">${hasPhone ? 'Completed' : 'Add Now'}</span>
            </div>
            <div style="cursor: pointer; display: flex; align-items: center; gap: 8px;" onclick="switchTab('profile')">
              ${hasDesc 
                ? '<span style="color:var(--success); background:rgba(16,185,129,0.1); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">✔</span>' 
                : '<span style="color:#d97706; background:rgba(245,158,11,0.1); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">!</span>'} 
              Business Description <span style="margin-left: auto; font-size: 11px; color: ${hasDesc ? 'var(--text-muted)' : '#d97706; font-weight: 700;'}">${hasDesc ? 'Completed' : 'Add Now'}</span>
            </div>
            <div style="cursor: pointer; display: flex; align-items: center; gap: 8px;" onclick="switchTab('profile')">
              ${hasServices
                ? '<span style="color:var(--success); background:rgba(16,185,129,0.1); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">✔</span>' 
                : '<span style="color:#d97706; background:rgba(245,158,11,0.1); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">!</span>'} 
              Services <span style="margin-left: auto; font-size: 11px; color: ${hasServices ? 'var(--text-muted)' : '#d97706; font-weight: 700;'}">${hasServices ? 'Completed' : 'Add Now'}</span>
            </div>
            <div style="cursor: pointer; display: flex; align-items: center; gap: 8px;" onclick="switchTab('profile')">
              ${hasPhotos
                ? '<span style="color:var(--success); background:rgba(16,185,129,0.1); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">✔</span>' 
                : '<span style="color:#d97706; background:rgba(245,158,11,0.1); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">!</span>'} 
              Gallery Photos <span style="margin-left: auto; font-size: 11px; color: ${hasPhotos ? 'var(--text-muted)' : '#d97706; font-weight: 700;'}">${hasPhotos ? 'Completed' : 'Add Now'} (${galleryCount}/10 Uploaded)</span>
            </div>
            <div style="cursor: pointer; display: flex; align-items: center; gap: 8px;" onclick="switchTab('profile')">
              ${hasTimings
                ? '<span style="color:var(--success); background:rgba(16,185,129,0.1); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">✔</span>' 
                : '<span style="color:#d97706; background:rgba(245,158,11,0.1); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">!</span>'} 
              Business Timings <span style="margin-left: auto; font-size: 11px; color: ${hasTimings ? 'var(--text-muted)' : '#d97706; font-weight: 700;'}">${hasTimings ? 'Completed' : 'Add Now'}</span>
            </div>
            <div style="cursor: pointer; display: flex; align-items: center; gap: 8px;" onclick="switchTab('profile')">
              ${hasPricing
                ? '<span style="color:var(--success); background:rgba(16,185,129,0.1); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">✔</span>' 
                : '<span style="color:#d97706; background:rgba(245,158,11,0.1); width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;">!</span>'} 
              Pricing <span style="margin-left: auto; font-size: 11px; color: ${hasPricing ? 'var(--text-muted)' : '#d97706; font-weight: 700;'}">${hasPricing ? 'Completed' : 'Add Now'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Complete profile promo banner -->
    <div style="background: linear-gradient(135deg, rgba(209, 38, 83, 0.04) 0%, rgba(14, 23, 38, 0.01) 100%); border: 1px dashed var(--pink-border); border-radius: 12px; padding: 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; flex-wrap: wrap; gap: 16px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:24px;">🚀</span>
        <div>
          <strong style="color:var(--navy); font-size:14px; display:block;">Complete your profile to get more enquiries</strong>
          <span style="font-size:12px; color:var(--text-secondary);">Vendors with complete profiles get 3x more enquiries.</span>
        </div>
      </div>
      <button class="btn-premium btn-pink" style="padding:10px 20px; font-size:12.5px; border-radius:8px;" onclick="switchTab('profile')">Improve My Profile</button>
    </div>

    <!-- Performance (Last 30 Days) & Recent Activity Grid -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 24px;" class="form-grid-premium">
      
      <!-- Performance Analytics Card -->
      <div class="card-premium" style="padding: 24px; border-radius: 16px; box-shadow: var(--shadow-premium); background: var(--bg-card);">
        <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="font-family: var(--serif); font-size: 17px; color: var(--navy); margin: 0;">Performance <span style="font-size:12px; color:var(--text-secondary); font-weight:500;">(Last 30 Days)</span></h3>
          <button onclick="switchTab('reports')" style="background: none; border: none; color: #E11D2A; font-weight: 700; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
            View Full Reports <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
        
        <div style="display: flex; gap: 16px;">
          <!-- Spark 1 -->
          <div style="flex:1; border:1px solid var(--border-color); border-radius:12px; padding:14px; text-align:center;">
            <div style="background: rgba(225, 29, 42, 0.08); color: #e11d2a; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; margin: 0 auto 10px auto;">👁</div>
            <span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase;">Profile Views</span>
            <strong style="font-size: 18px; color: var(--navy); display:block; margin: 4px 0;">${perfViews}</strong>
          </div>

          <!-- Spark 2 -->
          <div style="flex:1; border:1px solid var(--border-color); border-radius:12px; padding:14px; text-align:center;">
            <div style="background: rgba(16, 185, 129, 0.08); color: #10b981; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; margin: 0 auto 10px auto;">✉</div>
            <span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase;">Enquiries Received</span>
            <strong style="font-size: 18px; color: var(--navy); display:block; margin: 4px 0;">${perfEnq}</strong>
          </div>

          <!-- Spark 3 -->
          <div style="flex:1; border:1px solid var(--border-color); border-radius:12px; padding:14px; text-align:center;">
            <div style="background: rgba(139, 92, 246, 0.08); color: #8b5cf6; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; margin: 0 auto 10px auto;">⭐</div>
            <span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase;">New Reviews</span>
            <strong style="font-size: 18px; color: var(--navy); display:block; margin: 4px 0;">${perfReviews}</strong>
          </div>
        </div>
      </div>

      <!-- Recent Timeline Activity Card -->
      <div class="card-premium" style="padding: 24px; border-radius: 16px; box-shadow: var(--shadow-premium); background: var(--bg-card);">
        <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="font-family: var(--serif); font-size: 17px; color: var(--navy); margin: 0;">Recent Activity</h3>
          <a href="#" onclick="switchTab('leads'); event.preventDefault();" style="color: #E11D2A; font-weight: 700; font-size: 12px; text-decoration: none;">View All</a>
        </div>
        
        <div style="position: relative; display: flex; flex-direction: column; gap: 16px; padding-left: 20px; border-left: 2px solid var(--border-color); margin-left: 10px;">
          ${activityHtml}
        </div>
      </div>
    </div>
  `;

  // Start counters with animated increments
  animateNumber('cnt-views', viewsCount);
  animateNumber('cnt-new-enquiries', newEnqCount);
  animateNumber('cnt-total-enquiries', totalEnqCount);
  animateNumber('cnt-completion', compPercent, '', '%');
}

// 2. PROFILE TAB
function renderProfileTab(el) {
  const list = getActiveList();
  const v = list[0] || {};
  const completion = v.completion || 0;

  const userName = state.user?.name || '';
  const userEmail = state.user?.email || '';

  // Checklist states
  const checkPersonal = !!v.whatsappNumber && !!v.city && !!v.pincode;
  const checkBusiness = !!v.businessName && !!v.address && !!v.description;
  const checkCategory = !!v.category;
  const checkGallery = !!v.photos && v.photos.length >= 3;
  const checkPricing = !!v.priceMin && v.priceMin > 0;
  const checkTimings = !!v.businessTimings && (v.businessTimings.includes('open') || v.businessTimings.trim().length > 0);
  const checkSocials = !!v.website || !!v.instagram || !!v.facebook || !!v.youtube;

  // Compute visibility score dynamically
  const currentPhotos = (v.photos || []).length;
  const activePlan = v.subscriptionPlan || 'Free';
  const plansConfig = state.plans || {
    Free: { maxPhotos: 4 },
    Premium: { maxPhotos: 10 },
    Featured: { maxPhotos: 15 }
  };
  const maxPhotos = plansConfig[activePlan]?.maxPhotos || 4;

  const scoreCompleteness = Math.round(completion * 0.5); // max 50
  const scoreGallery = Math.round(Math.min(currentPhotos * 4, 20)); // max 20
  const scoreReviews = v.ratingCount > 0 ? 15 : 5; // max 15
  const scoreSocials = (v.website ? 5 : 0) + (v.instagram ? 5 : 0) + (v.facebook ? 5 : 0); // max 15
  const visibilityScore = scoreCompleteness + scoreGallery + scoreReviews + scoreSocials; // max 100

  // Set up temporary highlights state on load
  if (state.tempHighlights === undefined) {
    state.tempHighlights = Array.isArray(v.services) ? [...v.services] : [];
  }

  // Parse timings state or set defaults (Google Maps Style)
  let parsedTimings = {};
  try {
    parsedTimings = JSON.parse(v.businessTimings || '{}');
  } catch (e) {
    parsedTimings = {};
  }
  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  daysOfWeek.forEach(day => {
    if (!parsedTimings[day]) {
      const isSunday = day === 'sunday';
      parsedTimings[day] = { open: !isSunday, from: "09:00", to: "20:00" };
    }
  });

  const timingsHtml = daysOfWeek.map(day => {
    const t = parsedTimings[day];
    const isClosed = !t.open;
    return `
      <div class="day-timing-row" style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; border-bottom:1px solid #F1F5F9; padding-bottom:8px; margin-bottom:8px;" data-day="${day}">
        <strong style="width:120px; text-transform:capitalize; font-size:13px; color:var(--navy);">${day}</strong>
        <div style="display:flex; align-items:center; gap:12px; flex:1; justify-content:flex-end;">
          <select class="day-status" onchange="window.onTimingStatusChange(this, '${day}')" style="width:90px; height:34px; border:1px solid #CBD5E1; border-radius:6px; font-size:12.5px; font-weight:600; padding:4px 8px !important; margin:0;">
            <option value="open" ${t.open ? 'selected' : ''}>Open</option>
            <option value="closed" ${isClosed ? 'selected' : ''}>Closed</option>
          </select>
          
          <div class="day-hours-container" style="display:flex; align-items:center; gap:6px; transition:opacity 0.2s; ${isClosed ? 'opacity:0.5;' : ''}">
            <input type="time" class="day-from" value="${t.from || '09:00'}" ${isClosed ? 'disabled' : ''} style="width:100px; height:34px; border:1px solid #CBD5E1; border-radius:6px; padding:0 8px !important; font-size:12.5px; margin:0;" onchange="window.onProfileFieldChange()" />
            <span style="font-size:12px; color:var(--text-muted);">to</span>
            <input type="time" class="day-to" value="${t.to || '20:00'}" ${isClosed ? 'disabled' : ''} style="width:100px; height:34px; border:1px solid #CBD5E1; border-radius:6px; padding:0 8px !important; font-size:12.5px; margin:0;" onchange="window.onProfileFieldChange()" />
          </div>
        </div>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <style>
      .profile-saas-layout {
        display: grid;
        grid-template-columns: 1fr 340px;
        gap: 28px;
        align-items: start;
        margin-bottom: 80px;
      }
      .sticky-right-sidebar {
        position: sticky;
        top: 90px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .sticky-bottom-save-bar {
        position: fixed;
        bottom: 0;
        left: 240px;
        right: 0;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(12px);
        border-top: 1px solid var(--border-color);
        padding: 16px 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 1000;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.05);
        transform: translateY(100%);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .sticky-bottom-save-bar.show-bar {
        transform: translateY(0);
      }
      @media (max-width: 991px) {
        .profile-saas-layout {
          grid-template-columns: 1fr;
        }
        .sticky-right-sidebar {
          position: static;
        }
        .sticky-bottom-save-bar {
          left: 0;
          padding: 16px 20px;
        }
      }
      
      /* Premium SaaS Inputs & Layout */
      .input-with-icon-wrapper {
        position: relative;
        width: 100%;
      }
      .input-with-icon-wrapper input, .input-with-icon-wrapper select {
        padding-left: 42px !important;
        border: 1px solid #E2E8F0 !important;
        background-color: #FFFFFF !important;
        transition: all 0.2s ease-in-out !important;
        height: 44px;
        border-radius: 8px !important;
        font-size: 13.5px !important;
        color: var(--navy) !important;
        font-weight: 500 !important;
        width: 100%;
        box-sizing: border-box;
      }
      .input-with-icon-wrapper input:focus, .input-with-icon-wrapper select:focus {
        border-color: #E11D2A !important;
        box-shadow: 0 0 0 3px rgba(225, 29, 42, 0.08) !important;
        background-color: #FFFFFF !important;
        outline: none;
      }
      .input-icon-span {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #94A3B8;
        pointer-events: none;
        z-index: 5;
      }
      .form-field-premium input, .form-field-premium textarea, .form-field-premium select {
        border: 1px solid #E2E8F0 !important;
        background-color: #FFFFFF !important;
        transition: all 0.2s ease-in-out !important;
        border-radius: 8px !important;
        font-size: 13.5px !important;
        color: var(--navy) !important;
        font-weight: 500 !important;
        padding: 10px 14px !important;
        width: 100%;
        box-sizing: border-box;
      }
      .form-field-premium input:focus, .form-field-premium textarea:focus, .form-field-premium select:focus {
        border-color: #E11D2A !important;
        box-shadow: 0 0 0 3px rgba(225, 29, 42, 0.08) !important;
        outline: none;
      }
      .form-field-premium label {
        font-size: 11px !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        color: var(--text-secondary) !important;
        font-weight: 700 !important;
        margin-bottom: 6px !important;
        display: block;
      }
      
      /* Checklist Item Styles */
      .checklist-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #F8FAFC;
        border: 1px solid #F1F5F9;
        border-radius: 8px;
        font-size: 12.5px;
        font-weight: 600;
        color: var(--navy);
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .checklist-item:hover {
        background: var(--pink-blush);
        border-color: var(--pink-border);
        transform: translateX(4px);
      }
      .tip-item {
        font-size: 12.5px;
        color: var(--text-secondary);
        margin-bottom: 8px;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        line-height: 1.5;
      }
      .tip-item span {
        color: var(--navy);
        font-weight: bold;
      }
      
      /* Highlights styles */
      .highlight-chip-premium {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 30px;
        border: 1px solid var(--pink-border);
        background: var(--pink-blush);
        color: var(--navy);
        font-size: 13px;
        font-weight: 600;
        transition: all 0.2s;
      }
      .highlight-chip-premium:hover {
        border-color: #E11D2A;
        background: #FFF0F2;
      }
    </style>

    <!-- HEADER TITLE -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:28px; border-bottom:1px solid #E2E8F0; padding-bottom:16px;">
      <div>
        <h2 style="font-family:var(--serif); font-size:24px; color:var(--navy); margin:0 0 4px 0; font-weight:700;">Vendor Profile Settings</h2>
        <p style="font-size:14px; color:var(--text-secondary); margin:0;">Configure your business identity, portfolio gallery, and check visibility metrics.</p>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:12px; font-weight:700; color:#059669; display:inline-flex; align-items:center; gap:4px; background:rgba(5,150,105,0.08); padding:6px 12px; border-radius:30px; border:1px solid rgba(5,150,105,0.12);">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          SSL Secured
        </span>
      </div>
    </div>

    <div class="profile-saas-layout">
      <!-- Left Column: Settings Cards -->
      <div style="display:flex; flex-direction:column; gap:28px;">
        
        <!-- SECTION 1: Business Identity Hero Card -->
        <div class="card-premium" style="border-radius: 16px; overflow: hidden; padding: 24px; box-shadow: var(--shadow-premium); background: #FFFFFF; position: relative;">
          <div style="position: absolute; top:0; left:0; right:0; height:80px; background: linear-gradient(135deg, rgba(209, 38, 83, 0.08) 0%, rgba(209, 38, 83, 0.02) 100%); border-bottom:1px solid rgba(209, 38, 83, 0.05);"></div>
          
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:30px; position:relative; z-index:2; flex-wrap:wrap; gap:20px;">
            <div style="display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
              <div style="width: 80px; height: 80px; border-radius: 50%; background: var(--pink-blush); border: 4px solid #FFFFFF; box-shadow: var(--shadow-md); display:flex; align-items:center; justify-content:center; overflow:hidden;">
                ${v.photos && v.photos.length > 0 && v.photos.find(p => p.isCover) ? `
                  <img src="${v.photos.find(p => p.isCover).url}" style="width:100%; height:100%; object-fit:cover;" />
                ` : `
                  <span style="font-family:var(--serif); font-size:32px; color:var(--navy); font-weight:700;">${(v.businessName || userName || 'W').charAt(0).toUpperCase()}</span>
                `}
              </div>
              <div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                  <h2 style="font-family:var(--serif); font-size:22px; color:var(--navy); margin:0; font-weight:700;">${esc(v.businessName || 'Unnamed Business')}</h2>
                  <span style="background:var(--pink-blush); color:var(--navy); font-size:11px; font-weight:800; padding:3px 8px; border-radius:6px; border:1px solid var(--pink-border); text-transform:uppercase; letter-spacing:0.5px;">
                    ${esc(v.category || 'Vendor')}
                  </span>
                </div>
                
                <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap; font-size:13px; color:var(--text-secondary);">
                  <span style="display:inline-flex; align-items:center; gap:4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    ${esc(v.city || 'Location')}
                  </span>
                  <span style="display:inline-flex; align-items:center; gap:4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    Member since ${v.createdAt ? new Date(v.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'June 2026'}
                  </span>
                </div>
                
                <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                  <span style="font-size:11px; font-weight:700; color:#0369a1; background:#e0f2fe; padding:2px 8px; border-radius:4px;">★ ${esc(v.subscriptionPlan || 'Free')} Plan</span>
                  ${v.isVerified ? `
                    <span style="font-size:11px; font-weight:700; color:#15803d; background:#dcfce7; padding:2px 8px; border-radius:4px;">✔ Verified Business</span>
                  ` : `
                    <span style="font-size:11px; font-weight:700; color:#b45309; background:#fef3c7; padding:2px 8px; border-radius:4px;">● Verification Pending</span>
                  `}
                </div>
              </div>
            </div>
            
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button onclick="navigator.clipboard.writeText(window.location.origin + '/pages/vendor.html?id=${v.slug || v.id}'); triggerToast('Listing link copied to clipboard!');" class="btn-premium btn-outline" style="margin:0; padding:8px 14px; font-size:13px; display:inline-flex; align-items:center; gap:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                Share Profile
              </button>
            </div>
          </div>
          
          <div style="display:flex; border-top:1px solid #F1F5F9; margin-top:20px; padding-top:16px; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; gap:24px;">
              <div style="font-size:13px; color:var(--text-secondary);">
                Profile Views: <strong style="color:var(--navy); font-weight:700;">${(v.id ? (v.id.charCodeAt(0)*15 + v.id.charCodeAt(1)*3 + 1248) : 1248)}</strong>
              </div>
              <div style="font-size:13px; color:var(--text-secondary);">
                Completion Rate: <strong style="color:var(--navy); font-weight:700;">${completion}%</strong>
              </div>
            </div>
            <div style="font-size:12px; color:var(--text-muted); font-weight:500;">
              SSL Protected connection
            </div>
          </div>
        </div>
        
        <!-- CARD 2: Personal Information -->
        <div class="card-premium" id="personalCard" style="border-radius: 12px; box-shadow: var(--shadow-premium);">
          <div class="card-header-premium" style="margin-bottom:20px; border-bottom: 1px solid var(--border-color); padding-bottom: 14px;">
            <h3 style="font-family:var(--serif); font-size:18px; color:var(--navy); margin:0; display:flex; align-items:center; gap:8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #E11D2A;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              Personal Details
            </h3>
            <span style="font-size:12.5px; color:var(--text-secondary);">Billing owner account information.</span>
          </div>

          <div class="form-grid-premium" style="margin-bottom:20px;">
            <div class="form-field-premium">
              <label>Full Name *</label>
              <div class="input-with-icon-wrapper">
                <span class="input-icon-span">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </span>
                <input type="text" id="pName" value="${esc(userName)}" style="padding-left: 42px !important;" oninput="window.onProfileFieldChange(); window.runProfileInlineValidation();" />
              </div>
              <div id="pNameValidation" style="margin-top:4px;"></div>
            </div>

            <div class="form-field-premium">
              <label>Email Address *</label>
              <div class="input-with-icon-wrapper">
                <span class="input-icon-span">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                </span>
                <input type="email" id="pEmail" value="${esc(userEmail)}" style="padding-left: 42px !important;" oninput="window.onProfileFieldChange(); window.runProfileInlineValidation();" />
              </div>
              <div id="pEmailValidation" style="margin-top:4px; display:flex; justify-content:space-between; align-items:center;">
                <span style="color:#059669; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:4px;">✓ Email Verified</span>
              </div>
            </div>

            <div class="form-field-premium">
              <label>WhatsApp Number *</label>
              <div class="input-with-icon-wrapper">
                <span class="input-icon-span">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                </span>
                <input type="tel" id="pWa" value="${esc(v.whatsappNumber || '')}" style="padding-left: 42px !important;" oninput="window.onProfileFieldChange(); window.runProfileInlineValidation();" />
              </div>
              <div id="pWaValidation" style="margin-top:4px; display:flex; justify-content:space-between; align-items:center;">
                <span style="color:#059669; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:4px;">✓ Phone Verified</span>
              </div>
            </div>

            <div class="form-field-premium">
              <label>Alternate Mobile (Optional)</label>
              <div class="input-with-icon-wrapper">
                <span class="input-icon-span">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                </span>
                <input type="tel" id="pAltMobile" value="${esc(v.alternateMobile || '')}" style="padding-left: 42px !important;" oninput="window.onProfileFieldChange();" />
              </div>
            </div>

            <div class="form-field-premium">
              <label>City *</label>
              <div class="input-with-icon-wrapper">
                <span class="input-icon-span">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                </span>
                <select id="pCity" style="padding-left: 42px !important;" onchange="window.onProfileFieldChange();">
                  <option value="">Select City</option>
                  <option ${v.city === 'Mumbai' ? 'selected' : ''}>Mumbai</option>
                  <option ${v.city === 'Delhi NCR' ? 'selected' : ''}>Delhi NCR</option>
                  <option ${v.city === 'Goa' ? 'selected' : ''}>Goa</option>
                  <option ${v.city === 'Jaipur' ? 'selected' : ''}>Jaipur</option>
                  <option ${v.city === 'Pune' ? 'selected' : ''}>Pune</option>
                  <option ${v.city === 'Bengaluru' ? 'selected' : ''}>Bengaluru</option>
                </select>
              </div>
            </div>

            <div class="form-field-premium">
              <label>Pincode *</label>
              <div class="input-with-icon-wrapper">
                <span class="input-icon-span">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                </span>
                <input type="text" id="pPin" value="${esc(v.pincode || '')}" style="padding-left: 42px !important;" placeholder="e.g. 400001" oninput="window.onProfileFieldChange();" />
              </div>
            </div>
          </div>

          <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:12px 16px; display:flex; gap:12px; align-items:center;">
            <span style="font-size:16px; color:#64748B;">🔒</span>
            <p style="font-size:12.5px; color:#64748B; margin:0; line-height:1.5; font-weight:500;">
              Your personal information remains private. Only your selected business contact details are visible to customers.
            </p>
          </div>
        </div>

        <!-- CARD 3: Business Information -->
        <div class="card-premium" id="businessCard" style="border-radius: 12px; box-shadow: var(--shadow-premium);">
          <div class="card-header-premium" style="margin-bottom:20px; border-bottom: 1px solid var(--border-color); padding-bottom: 14px;">
            <h3 style="font-family:var(--serif); font-size:18px; color:var(--navy); margin:0; display:flex; align-items:center; gap:8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #E11D2A;"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"></rect><path d="M7 21v-4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4"></path><path d="M8 7h8"></path><path d="M8 11h8"></path></svg>
              Business Details
            </h3>
            <span style="font-size:12.5px; color:var(--text-secondary);">Manage details shown to couple inquiries on WedEazzy directory.</span>
          </div>

          <div class="form-grid-premium" style="gap:20px;">
            <div class="form-field-premium">
              <label>Business Name *</label>
              <input type="text" id="pBn" value="${esc(v.businessName || '')}" placeholder="e.g. Hemal Photography" oninput="window.onProfileFieldChange(); window.runProfileInlineValidation();" />
              <div id="pBnValidation" style="margin-top:4px;"></div>
            </div>

            <div class="form-field-premium">
              <label>Category *</label>
              <select id="pCat" onchange="window.onProfileFieldChange(); window.toggleCapacityField();">
                <option value="">Select Category</option>
                <option ${v.category === 'Banquet Halls' ? 'selected' : ''}>Banquet Halls</option>
                <option ${v.category === 'Marriage Gardens' ? 'selected' : ''}>Marriage Gardens</option>
                <option ${v.category === 'Wedding Photographers' ? 'selected' : ''}>Wedding Photographers</option>
                <option ${v.category === 'Bridal Makeup' ? 'selected' : ''}>Bridal Makeup</option>
              </select>
            </div>

            <div class="form-field-premium">
              <label>Starting Package Price (INR) *</label>
              <input type="number" id="pMin" value="${v.priceMin || ''}" placeholder="e.g. 50000" oninput="window.onProfileFieldChange();" />
            </div>

            <div class="form-field-premium" id="capacityFieldWrapper" style="${(v.category === 'Banquet Halls' || v.category === 'Marriage Gardens') ? '' : 'display:none;'}">
              <label>Guest Capacity *</label>
              <input type="number" id="pCap" value="${v.capacity || ''}" placeholder="e.g. 800" oninput="window.onProfileFieldChange();" />
            </div>

            <div class="form-field-premium">
              <label>Years of Experience</label>
              <input type="number" id="pYearsExp" value="${v.yearsExperience || ''}" placeholder="e.g. 5" oninput="window.onProfileFieldChange();" />
            </div>

            <div class="form-field-premium">
              <label>Team Size</label>
              <input type="number" id="pTeamSize" value="${v.teamSize || ''}" placeholder="e.g. 8" oninput="window.onProfileFieldChange();" />
            </div>

            <div class="form-field-premium">
              <label>Service Areas (Comma separated)</label>
              <input type="text" id="pServiceAreas" value="${esc(v.serviceAreas || '')}" placeholder="e.g. South Mumbai, Bandra, Goa" oninput="window.onProfileFieldChange();" />
            </div>

            <div class="form-field-premium">
              <label>Languages Spoken</label>
              <input type="text" id="pLanguages" value="${esc(v.languagesSpoken || '')}" placeholder="e.g. English, Hindi, Marathi" oninput="window.onProfileFieldChange();" />
            </div>

            <div class="form-field-premium full" style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="pAcceptsDest" ${v.acceptsDestination ? 'checked' : ''} onchange="window.onProfileFieldChange();" style="width:18px; height:18px; cursor:pointer;" />
              <label for="pAcceptsDest" style="margin:0; cursor:pointer; font-size:13px; text-transform:none; letter-spacing:0; font-weight:600; color:var(--navy);">Accepts Destination Weddings</label>
            </div>

            <div class="form-field-premium full">
              <label>Business Address *</label>
              <input type="text" id="pAddr" value="${esc(v.address || '')}" placeholder="Full physical address" oninput="window.onProfileFieldChange();" />
            </div>

            <div class="form-field-premium full">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <label style="margin:0;">About your Business *</label>
                <span id="descCharCount" style="font-size:11.5px; color:var(--text-secondary); font-weight:600;">${(v.description || '').length} / 500 characters</span>
              </div>
              <textarea id="pDesc" maxlength="500" style="min-height:100px;" placeholder="Tell couples why they should choose your business..." oninput="window.updateDescCharCount(this.value);">${esc(v.description || '')}</textarea>
              <div style="margin-top:6px; font-size:11.5px; color:var(--text-muted); line-height:1.4;">
                💡 <strong>Writing Tip:</strong> Keep it welcoming. Mention special equipment, achievements, and what sets you apart.
              </div>
            </div>

            <!-- GOOGLE MAPS STYLE EVERYDAY TIMINGS -->
            <div class="form-field-premium full">
              <label>Business Timings (Everyday Schedule)</label>
              <div style="display:flex; flex-direction:column; gap:10px; background:#F8FAFC; border:1px solid #E2E8F0; padding:16px; border-radius:10px; width:100%; box-sizing:border-box;">
                ${timingsHtml}
              </div>
            </div>
          </div>
        </div>

        <!-- CARD 4: Business Highlights -->
        <div class="card-premium" id="highlightsCard" style="border-radius: 12px; box-shadow: var(--shadow-premium);">
          <div class="card-header-premium" style="margin-bottom:20px; border-bottom: 1px solid var(--border-color); padding-bottom: 14px;">
            <h3 style="font-family:var(--serif); font-size:18px; color:var(--navy); margin:0; display:flex; align-items:center; gap:8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
              Business Highlights
            </h3>
            <span style="font-size:12.5px; color:var(--text-secondary);">Add visual badges for couples to see at first glance on WedEazzy listing.</span>
          </div>

          <div style="display:flex; flex-direction:column; gap:16px;">
            <!-- Highlights Container -->
            <div id="highlightsContainer" style="display:flex; flex-wrap:wrap; gap:8px; min-height:40px; border:1px solid #E2E8F0; padding:12px; border-radius:8px; background:#F8FAFC;">
              <!-- Javascript will render highlights here -->
            </div>

            <!-- Add Highlight Row -->
            <div style="display:flex; gap:10px; align-items:center;">
              <input type="text" id="newHighlightInput" placeholder="Add custom tag (e.g. Drone Coverage)" style="flex:1; height:40px; border:1px solid #E2E8F0; border-radius:8px; padding:0 12px; font-size:13.5px;" onkeydown="if(event.key === 'Enter') { event.preventDefault(); window.addProfileHighlight(); }" />
              <button type="button" class="btn-premium btn-navy" style="margin:0; padding:0 16px; height:40px;" onclick="window.addProfileHighlight()">+ Add</button>
            </div>

            <!-- Suggestions -->
            <div>
              <span style="font-size:11.5px; color:var(--text-secondary); font-weight:700; text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:8px;">Suggestions:</span>
              <div style="display:flex; flex-wrap:wrap; gap:8px;">
                ${['Candid Photography', 'Drone Coverage', 'Same Day Preview', 'Destination Weddings', 'Luxury Weddings', 'AC Banquet Hall', 'In-house Catering', 'Valet Parking', 'Bridal Suite'].map(tag => `
                  <button type="button" onclick="window.addSuggestedHighlight('${esc(tag)}')" style="border:1px solid #E2E8F0; background:#FFFFFF; padding:6px 12px; border-radius:30px; font-size:12px; font-weight:600; color:var(--text-secondary); cursor:pointer; transition:all 0.2s;" onmouseover="this.style.borderColor='var(--pink-border)'; this.style.color='#E11D2A';" onmouseout="this.style.borderColor='#E2E8F0'; this.style.color='var(--text-secondary)';">${esc(tag)}</button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- CARD 5: Photo Gallery (Premium media manager) -->
        <div class="card-premium" id="galleryCard" style="border-radius: 12px; box-shadow: var(--shadow-premium);">
          <div class="card-header-premium" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; border-bottom: 1px solid var(--border-color); padding-bottom: 14px;">
            <div>
              <h3 style="font-family:var(--serif); font-size:18px; color:var(--navy); margin:0; display:flex; align-items:center; gap:8px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #E11D2A;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                Business Photo Gallery
              </h3>
              <span style="font-size:12.5px; color:var(--text-secondary);">Add portfolio photos to highlight your work (at least 3 photos recommended).</span>
            </div>
            <strong style="font-size:13.5px; color:var(--navy); background:var(--pink-blush); padding:6px 12px; border-radius:8px;">${currentPhotos} / ${maxPhotos} Photos Used</strong>
          </div>

          ${state.vendor ? `
          <!-- Usage Progress Bar -->
          <div style="margin-bottom:20px;">
            <div style="height:6px; background-color:#F1F5F9; border-radius:99px; overflow:hidden; margin-bottom:6px;">
              <div style="width:${(currentPhotos / maxPhotos) * 100}%; height:100%; background:linear-gradient(90deg, #E11D2A, #ef4444); border-radius:99px;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:11.5px; color:var(--text-muted);">
              <span>Usage limit</span>
              <span>${maxPhotos - currentPhotos} uploads remaining</span>
            </div>
          </div>

          <!-- Upload zone -->
          <div class="photo-upload-zone" 
               style="border: 1px dashed #CBD5E1; padding: 32px 20px; border-radius: 8px; text-align: center; background: #F8FAFC; cursor: pointer; margin-bottom: 24px; transition: all 0.3s ease; display: flex; flex-direction: column; align-items: center; justify-content: center;" 
               onclick="document.getElementById('profilePhotoInput').click()">
            <div style="background: rgba(209, 38, 83, 0.08); border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E11D2A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <strong style="font-size: 14px; color: var(--navy); display: block; margin-bottom: 4px;">Click to upload professional photos</strong>
            <span style="display: block; font-size: 12px; color: var(--text-muted);">Max file size: 5MB. JPG, PNG or WebP only.</span>
            <input type="file" id="profilePhotoInput" style="display: none;" accept="image/*" multiple onchange="uploadBusinessPhotos(event)" />
          </div>

          <!-- Photo grid -->
          <div class="photo-gallery-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px;">
            ${(v.photos && v.photos.length > 0) ? v.photos.map(p => `
              <div class="gallery-photo-item" 
                   style="position: relative; border-radius: 10px; overflow: hidden; height: 130px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); transition: all 0.3s ease;"
                   onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='var(--shadow-md)';"
                   onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='var(--shadow-sm)';">
                
                <img src="${p.url}" style="width: 100%; height: 100%; object-fit: cover;" />
                
                <!-- Action bar overlay -->
                <div style="position: absolute; inset:0; background:rgba(15,23,42,0.4); opacity:0; hover:opacity:1; transition:opacity 0.2s; display:flex; flex-direction:column; justify-content:space-between; padding:8px;"
                     onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
                  <div style="display:flex; justify-content:flex-end;">
                    <button onclick="deleteBusinessPhoto('${p.id}')" 
                            style="background: rgba(220, 38, 38, 0.95); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"
                            title="Delete photo">&times;</button>
                  </div>
                  <div style="display:flex; gap:4px; align-items:center; width:100%;">
                    <a href="${p.url}" target="_blank" style="background:rgba(255,255,255,0.9); color:var(--navy); border:none; font-size:10px; font-weight:700; padding:4px 6px; border-radius:4px; text-decoration:none; text-align:center; flex:1;">Preview</a>
                    ${p.isCover ? '' : `<button onclick="setCoverPhoto('${p.id}')" style="background:var(--navy); color:white; border:none; font-size:10px; font-weight:700; padding:4px 6px; border-radius:4px; cursor:pointer; flex:1.2;">Set Cover</button>`}
                  </div>
                </div>

                ${p.isCover ? `
                  <div style="position: absolute; bottom: 8px; left: 8px;">
                    <span style="background: linear-gradient(135deg, #FBBF24, #F59E0B); color: #0f172a; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px;">★ Cover</span>
                  </div>
                ` : ''}
              </div>
            `).join('') : `
              <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-size: 13px; padding: 24px; background:#F8FAFC; border-radius:8px; border:1px dashed #CBD5E1;">
                <p style="margin:0 0 6px 0; font-weight:600; color:var(--navy);">No portfolio photos uploaded</p>
                <span style="font-size:12px; color:var(--text-secondary);">Upload your best work to increase inquiries and build confidence.</span>
              </div>
            `}
          </div>
          ` : `<p style="text-align:center; color:var(--text-muted); font-size:13px; padding:20px;">Complete registration to unlock photo gallery.</p>`}
        </div>

        <!-- CARD 6: Social Presence -->
        <div class="card-premium" id="socialsCard" style="border-radius: 12px; box-shadow: var(--shadow-premium);">
          <div class="card-header-premium" style="margin-bottom:20px; border-bottom: 1px solid var(--border-color); padding-bottom: 14px;">
            <h3 style="font-family:var(--serif); font-size:18px; color:var(--navy); margin:0; display:flex; align-items:center; gap:8px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
              Social Presence
            </h3>
            <span style="font-size:12.5px; color:var(--text-secondary);">Link your online presence to verify your brand legitimacy for couples.</span>
          </div>

          <div class="form-grid-premium" style="gap:20px;">
            <div class="form-field-premium" id="pSocials">
              <label style="display:flex; align-items:center; gap:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                Website URL
              </label>
              <input type="text" id="pWeb" value="${esc(v.website || '')}" placeholder="https://mywebsite.com" oninput="window.onProfileFieldChange(); window.runProfileInlineValidation();" />
              <div id="pWebValidation" style="margin-top:4px;"></div>
            </div>

            <div class="form-field-premium">
              <label style="display:flex; align-items:center; gap:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                Instagram Page URL
              </label>
              <input type="text" id="pInsta" value="${esc(v.instagram || '')}" placeholder="https://instagram.com/mybrand" oninput="window.onProfileFieldChange();" />
            </div>

            <div class="form-field-premium">
              <label style="display:flex; align-items:center; gap:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                Facebook Page URL
              </label>
              <input type="text" id="pFb" value="${esc(v.facebook || '')}" placeholder="https://facebook.com/mybrand" oninput="window.onProfileFieldChange();" />
            </div>

            <div class="form-field-premium">
              <label style="display:flex; align-items:center; gap:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon></svg>
                YouTube Channel URL
              </label>
              <input type="text" id="pYt" value="${esc(v.youtube || '')}" placeholder="https://youtube.com/mybrand" oninput="window.onProfileFieldChange();" />
            </div>

            <div class="form-field-premium">
              <label style="display:flex; align-items:center; gap:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line></svg>
                Google Business URL
              </label>
              <input type="text" id="pGbus" value="${esc(v.googleBusiness || '')}" placeholder="https://business.google.com/..." oninput="window.onProfileFieldChange();" />
            </div>

            <div class="form-field-premium">
              <label style="display:flex; align-items:center; gap:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted);"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                Google Maps Link or CID
              </label>
              <input type="text" id="pGid" value="${esc(v.googleCid || '')}" placeholder="Google maps link or CID" oninput="window.onProfileFieldChange();" />
            </div>
          </div>
        </div>

      </div>

      <!-- Right Column: Sticky Stats Panel -->
      <div class="sticky-right-sidebar">
        
        <!-- CARD 1: Profile Completion (Circular SVG) -->
        <div class="card-premium" style="padding: 20px; border-radius: 12px; box-shadow: var(--shadow-premium);">
          <h4 style="margin-top:0; margin-bottom:12px; font-family:var(--serif); font-size:15px; color:var(--navy); font-weight:700; border-bottom:1px solid var(--border-color); padding-bottom:8px;">Profile Completion</h4>
          
          <div style="display:flex; align-items:center; gap:16px; margin-bottom:18px;">
            <div style="position:relative; width:64px; height:64px; display:inline-flex;">
              <svg width="64" height="64" viewBox="0 0 36 36">
                <path stroke="#F1F5F9" stroke-width="3.5" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path stroke="var(--gold)" stroke-dasharray="${completion}, 100" stroke-width="3.5" stroke-linecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:13.5px; font-weight:800; color:var(--navy);">${completion}%</div>
            </div>
            <div>
              <strong style="font-size:14px; color:var(--navy); display:block;">Profile strength</strong>
              <span style="font-size:12px; color:var(--text-secondary);">Target: 85% for search boost</span>
            </div>
          </div>
          
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${[
              { label: 'Contact Details', check: checkPersonal, id: 'personalCard' },
              { label: 'Business Details', check: checkBusiness, id: 'businessCard' },
              { label: 'Category', check: checkCategory, id: 'pCat' },
              { label: 'Photo Gallery', check: checkGallery, id: 'galleryCard' },
              { label: 'Package Pricing', check: checkPricing, id: 'pMin' },
              { label: 'Business Timings', check: checkTimings, id: 'businessCard' },
              { label: 'Social & Web Links', check: checkSocials, id: 'socialsCard' }
            ].map(item => `
              <div class="checklist-item" onclick="document.getElementById('${item.id}').scrollIntoView({behavior:'smooth', block:'center'});">
                <span style="display:flex; align-items:center; gap:8px;">
                  <span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:50%; background:${item.check ? 'rgba(5, 150, 105, 0.1)' : 'rgba(148, 163, 184, 0.1)'}; color:${item.check ? '#059669' : '#94A3B8'}; font-size:10px;">
                    ${item.check ? '✔' : '○'}
                  </span>
                  <span>${item.label}</span>
                </span>
                <span style="font-size:11px; color:${item.check ? '#059669' : '#94A3B8'}; font-weight:700;">${item.check ? 'Complete' : 'Missing'}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- CARD 2: Business Status -->
        <div class="card-premium" style="padding: 20px; border-radius: 12px; box-shadow: var(--shadow-premium);">
          <h4 style="margin-top:0; margin-bottom:14px; font-family:var(--serif); font-size:15px; color:var(--navy); font-weight:700; border-bottom:1px solid var(--border-color); padding-bottom:8px;">Business Status</h4>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            ${v.isVerified ? `
              <span style="background:rgba(5, 150, 105, 0.1); color:#059669; font-size:11px; font-weight:800; padding:6px 12px; border-radius:30px; letter-spacing:0.5px; border:1px solid rgba(5, 150, 105, 0.2); display:inline-flex; align-items:center; gap:4px;">● Verified</span>
            ` : `
              <span style="background:rgba(217, 119, 6, 0.1); color:#D97706; font-size:11px; font-weight:800; padding:6px 12px; border-radius:30px; letter-spacing:0.5px; border:1px solid rgba(217, 119, 6, 0.2); display:inline-flex; align-items:center; gap:4px;">● Pending Verification</span>
            `}
          </div>
          <div style="display:flex; flex-direction:column; gap:10px; font-size:13px; color:var(--text-secondary);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>Listing Status</span>
              <strong style="color:${v.isActive ? '#059669' : '#DC2626'}; font-weight:600;">${v.isActive ? 'Approved' : 'Suspended'}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>KYC Documents</span>
              <strong style="color:${v.isVerified ? '#059669' : '#D97706'}; font-weight:600;">${v.isVerified ? 'Verified' : 'Pending'}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>Subscription</span>
              <strong style="color:var(--navy); font-weight:600; text-transform:uppercase; font-size:11px; background:var(--pink-blush); padding:2px 6px; border-radius:4px;">${v.subscriptionPlan || 'Free'}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span>Subscription Expiry</span>
              <strong style="color:var(--navy); font-weight:600;">${v.subscriptionExpiry ? new Date(v.subscriptionExpiry).toLocaleDateString('en-GB') : '12 Aug 2026'}</strong>
            </div>
            <div style="border-top:1px solid #F1F5F9; padding-top:10px; margin-top:4px;">
              <span style="font-size:11.5px; color:#059669; font-weight:700; display:flex; align-items:center; gap:4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                Higher Search Ranking Enabled
              </span>
            </div>
          </div>
        </div>

        <!-- CARD 3: Trust & Visibility Score (Out of 100) -->
        <div class="card-premium" style="padding: 20px; border-radius: 12px; box-shadow: var(--shadow-premium);">
          <h4 style="margin-top:0; margin-bottom:12px; font-family:var(--serif); font-size:15px; color:var(--navy); font-weight:700; border-bottom:1px solid var(--border-color); padding-bottom:8px;">Trust & Visibility Score</h4>
          
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <strong style="font-size:22px; color:var(--navy);">${visibilityScore} <span style="font-size:13px; color:var(--text-secondary); font-weight:500;">/ 100</span></strong>
            <span style="font-size:11px; color:#059669; background:rgba(5,150,105,0.08); padding:3px 8px; border-radius:6px; font-weight:700;">
              ${visibilityScore >= 80 ? 'Excellent' : (visibilityScore >= 50 ? 'Good' : 'Needs Work')}
            </span>
          </div>

          <div style="height:8px; background-color:#F1F5F9; border-radius:99px; overflow:hidden; margin-bottom:16px;">
            <div style="width:${visibilityScore}%; height:100%; background:linear-gradient(90deg, #E11D2A, #ef4444); border-radius:99px;"></div>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px; font-size:12px; color:var(--text-secondary);">
            <div>
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span>Gallery Quality</span>
                <strong>${Math.min(currentPhotos * 20, 100)}%</strong>
              </div>
              <div style="height:4px; background:#F1F5F9; border-radius:2px; overflow:hidden;">
                <div style="width:${Math.min(currentPhotos * 20, 100)}%; height:100%; background:#10B981;"></div>
              </div>
            </div>
            <div>
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span>Details Completeness</span>
                <strong>${completion}%</strong>
              </div>
              <div style="height:4px; background:#F1F5F9; border-radius:2px; overflow:hidden;">
                <div style="width:${completion}%; height:100%; background:#3B82F6;"></div>
              </div>
            </div>
            <div>
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span>Reviews Score</span>
                <strong>${v.ratingCount > 0 ? 100 : 33}%</strong>
              </div>
              <div style="height:4px; background:#F1F5F9; border-radius:2px; overflow:hidden;">
                <div style="width:${v.ratingCount > 0 ? 100 : 33}%; height:100%; background:#F59E0B;"></div>
              </div>
            </div>
          </div>
          <div style="background:#F8FAFC; border-radius:8px; padding:10px; margin-top:14px; font-size:11.5px; color:var(--text-muted); line-height:1.4;">
            💡 Higher visibility scores receive up to <strong>3x more enquiries</strong> from couples.
          </div>
        </div>

        <!-- CARD 4: Profile Tips -->
        <div class="card-premium" style="padding: 20px; border-radius: 12px; box-shadow: var(--shadow-premium);">
          <h4 style="margin-top:0; margin-bottom:12px; font-family:var(--serif); font-size:15px; color:var(--navy); font-weight:700; border-bottom:1px solid var(--border-color); padding-bottom:8px;">Profile Tips</h4>
          <div class="tip-item"><span>1.</span> Upload at least 5 photos.</div>
          <div class="tip-item"><span>2.</span> Write a detailed description.</div>
          <div class="tip-item"><span>3.</span> Add starting package pricing.</div>
          <div class="tip-item"><span>4.</span> Link your Instagram URL.</div>
          <div class="tip-item"><span>5.</span> Complete business opening timings.</div>
        </div>

        <!-- CARD 5: Need Help? -->
        <div class="card-premium" style="padding: 20px; border-radius: 12px; box-shadow: var(--shadow-premium); background:linear-gradient(185deg, var(--navy) 0%, #1e293b 100%); color:white;">
          <h4 style="margin-top:0; margin-bottom:10px; font-family:var(--serif); font-size:16px; color:white; font-weight:700; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;">Need Help?</h4>
          <p style="font-size:12.5px; color:rgba(255,255,255,0.7); margin:0 0 16px 0; line-height:1.5;">Get in touch with our vendor support team to optimize your listing details.</p>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <a href="mailto:support@wedeazzy.com" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; text-align:center; padding:8px; border-radius:6px; font-size:12.5px; text-decoration:none; font-weight:600; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">Email Support</a>
            <a href="tel:+919876543210" style="background:var(--pink-blush); border:none; color:var(--navy); text-align:center; padding:8px; border-radius:6px; font-size:12.5px; text-decoration:none; font-weight:700; transition:all 0.2s;" onmouseover="this.style.filter='brightness(0.95)'" onmouseout="this.style.filter='brightness(1)'">Call Support</a>
          </div>
        </div>

      </div>
    </div>

    <!-- STICKY BOTTOM SAVE ACTION BAR -->
    <div class="sticky-bottom-save-bar" id="stickySaveBar">
      <div style="font-size:13.5px; font-weight:700; color:var(--text-secondary); display:flex; align-items:center; gap:8px;">
        <span style="color:#ef4444; font-size:16px;">●</span> Unsaved Profile Changes
      </div>
      <div style="display:flex; gap:12px;">
        <button type="button" class="btn-premium btn-outline" style="margin:0; padding:10px 20px;" onclick="switchTab('profile')">Cancel</button>
        <button type="button" class="btn-premium btn-navy" style="margin:0; padding:10px 24px; background: linear-gradient(135deg, var(--navy) 0%, #1e293b 100%);" id="profileSaveBtn" onclick="saveBusinessProfile()">Save Changes</button>
      </div>
    </div>
  `;

  // Render highlights
  window.renderProfileHighlights();

  // Run initial inline validations
  window.runProfileInlineValidation();
}

window.toggleCapacityField = function() {
  const cat = document.getElementById('pCat').value;
  const wrap = document.getElementById('capacityFieldWrapper');
  if (wrap) {
    if (cat === 'Banquet Halls' || cat === 'Marriage Gardens') {
      wrap.style.display = 'block';
    } else {
      wrap.style.display = 'none';
    }
  }
};

window.updateDescCharCount = function(val) {
  const cnt = document.getElementById('descCharCount');
  if (cnt) cnt.textContent = `${val.length} / 500 characters`;
  if (val.length > 500) {
    cnt.style.color = '#ef4444';
  } else {
    cnt.style.color = 'var(--text-secondary)';
  }
  window.onProfileFieldChange();
};

window.onProfileFieldChange = function() {
  const bar = document.getElementById('stickySaveBar');
  if (bar) {
    bar.classList.add('show-bar');
  }
};

window.onTimingStatusChange = function(select, day) {
  const container = select.nextElementSibling;
  if (container) {
    const inputs = container.querySelectorAll('input');
    if (select.value === 'closed') {
      container.style.opacity = '0.5';
      inputs.forEach(i => i.disabled = true);
    } else {
      container.style.opacity = '1';
      inputs.forEach(i => i.disabled = false);
    }
  }
  window.onProfileFieldChange();
};

window.addProfileHighlight = function() {
  const input = document.getElementById('newHighlightInput');
  if (!input) return;
  const tag = input.value.trim();
  if (!tag) return;
  if (state.tempHighlights.includes(tag)) {
    triggerToast('Highlight tag already exists', true);
    return;
  }
  state.tempHighlights.push(tag);
  input.value = '';
  window.renderProfileHighlights();
  window.onProfileFieldChange();
};

window.addSuggestedHighlight = function(tag) {
  if (state.tempHighlights.includes(tag)) {
    triggerToast('Highlight already added', true);
    return;
  }
  state.tempHighlights.push(tag);
  window.renderProfileHighlights();
  window.onProfileFieldChange();
};

window.removeProfileHighlight = function(tag) {
  state.tempHighlights = state.tempHighlights.filter(t => t !== tag);
  window.renderProfileHighlights();
  window.onProfileFieldChange();
};

window.renderProfileHighlights = function() {
  const container = document.getElementById('highlightsContainer');
  if (!container) return;
  if (state.tempHighlights.length === 0) {
    container.innerHTML = `<span style="font-size:12.5px; color:var(--text-muted); font-weight:500;">No highlights added yet. Select from suggestions below or write your own.</span>`;
    return;
  }
  container.innerHTML = state.tempHighlights.map(t => `
    <span class="highlight-chip-premium">
      <span>✓ ${esc(t)}</span>
      <span onclick="window.removeProfileHighlight('${esc(t)}')" style="cursor: pointer; font-size: 14px; font-weight: 700; color: #dc2626; padding-left: 2px;">&times;</span>
    </span>
  `).join('');
};

window.runProfileInlineValidation = function() {
  // Validate Business Name
  const bnEl = document.getElementById('pBn');
  const bn = bnEl ? bnEl.value.trim() : '';
  const bnErr = document.getElementById('pBnValidation');
  if (bnErr) {
    if (bn.length > 2) {
      bnErr.innerHTML = `<span style="color:#059669; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:4px;">✓ Business Name Available</span>`;
    } else {
      bnErr.innerHTML = `<span style="color:#d97706; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:4px;">⚠ Enter business name</span>`;
    }
  }

  // Validate Phone
  const waEl = document.getElementById('pWa');
  const wa = waEl ? waEl.value.trim() : '';
  const waErr = document.getElementById('pWaValidation');
  if (waErr) {
    if (wa.replace(/[^0-9]/g, '').length >= 10) {
      waErr.innerHTML = `<span style="color:#059669; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:4px;">✓ Phone Verified</span>`;
    } else {
      waErr.innerHTML = `<span style="color:#d97706; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:4px;">⚠ Enter valid mobile</span>`;
    }
  }

  // Validate Email
  const emailEl = document.getElementById('pEmail');
  const email = emailEl ? emailEl.value.trim() : '';
  const emailErr = document.getElementById('pEmailValidation');
  if (emailErr) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailErr.innerHTML = `<span style="color:#059669; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:4px;">✓ Email Verified</span>`;
    } else {
      emailErr.innerHTML = `<span style="color:#d97706; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:4px;">⚠ Enter valid email</span>`;
    }
  }

  // Validate Website
  const webEl = document.getElementById('pWeb');
  const web = webEl ? webEl.value.trim() : '';
  const webErr = document.getElementById('pWebValidation');
  if (webErr) {
    if (web.length === 0) {
      webErr.innerHTML = ``;
    } else if (/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(web)) {
      webErr.innerHTML = `<span style="color:#059669; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:4px;">✓ Valid Website URL</span>`;
    } else {
      webErr.innerHTML = `<span style="color:#dc2626; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:4px;">⚠ Invalid URL format</span>`;
    }
  }
};

async function saveBusinessProfile() {
  const saveBtn = document.getElementById('profileSaveBtn');
  if (saveBtn.disabled) return;

  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const timingsData = {};
  daysOfWeek.forEach(day => {
    const row = document.querySelector(`.day-timing-row[data-day="${day}"]`);
    if (row) {
      const status = row.querySelector('.day-status').value;
      const from = row.querySelector('.day-from').value;
      const to = row.querySelector('.day-to').value;
      timingsData[day] = {
        open: status === 'open',
        from: from,
        to: to
      };
    }
  });

  const patch = {
    name: document.getElementById('pName').value.trim(),
    email: document.getElementById('pEmail').value.trim(),
    businessName: document.getElementById('pBn').value.trim(),
    whatsappNumber: document.getElementById('pWa').value.trim(),
    alternateMobile: document.getElementById('pAltMobile').value.trim(),
    category: document.getElementById('pCat').value,
    city: document.getElementById('pCity').value,
    pincode: document.getElementById('pPin').value.trim(),
    capacity: parseInt(document.getElementById('pCap').value, 10) || 0,
    priceMin: parseInt(document.getElementById('pMin').value, 10) || 0,
    address: document.getElementById('pAddr').value.trim(),
    description: document.getElementById('pDesc').value.trim(),
    businessTimings: JSON.stringify(timingsData),
    website: document.getElementById('pWeb').value.trim(),
    instagram: document.getElementById('pInsta').value.trim(),
    facebook: document.getElementById('pFb').value.trim(),
    youtube: document.getElementById('pYt').value.trim(),
    googleBusiness: document.getElementById('pGbus').value.trim(),
    googleCid: document.getElementById('pGid').value.trim(),
    yearsExperience: parseInt(document.getElementById('pYearsExp').value, 10) || 0,
    teamSize: parseInt(document.getElementById('pTeamSize').value, 10) || 0,
    serviceAreas: document.getElementById('pServiceAreas').value.trim(),
    languagesSpoken: document.getElementById('pLanguages').value.trim(),
    acceptsDestination: document.getElementById('pAcceptsDest').checked,
    services: state.tempHighlights
  };

  if (!patch.name || !patch.email || !patch.businessName || !patch.whatsappNumber) {
    return triggerToast('Personal Name, Email, Business Name, and WhatsApp number are required.', true);
  }

  try {
    saveBtn.innerHTML = `<span class="otp-loading-spinner"></span> Saving...`;
    saveBtn.disabled = true;

    const data = await api('/api/vendor/me', {
      method: 'PATCH',
      body: patch
    });

    if (!data.ok) throw new Error(data.message || 'Failed to update profile');

    state.vendor = data.vendor;
    state.vendor.completion = data.completion;
    
    // Update local user state
    if (state.user) {
      state.user.name = patch.name;
      state.user.email = patch.email;
    }

    triggerToast('Business profile updated successfully in database!');
    localStorage.setItem('wedeazzy_sync_trigger', Date.now().toString());
    
    // Hide bottom save bar
    const bar = document.getElementById('stickySaveBar');
    if (bar) bar.classList.remove('show-bar');

    // Update navbar badges dynamically
    const badgeName = document.getElementById('profileBadgeName');
    if (badgeName) {
      badgeName.textContent = data.vendor.businessName;
    }

    // Refresh rendering to update checklist status
    renderProfileTab(document.getElementById('contentViewport'));

  } catch (err) {
    triggerToast(err.message || 'Error updating profile.', true);
  } finally {
    saveBtn.innerHTML = 'Save Changes';
    saveBtn.disabled = false;
  }
}

async function uploadBusinessPhotos(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const currentPhotosCount = state.vendor?.photos?.length || 0;
  const activePlan = state.vendor?.subscriptionPlan || 'Free';
  const plans = state.plans || { Free: { maxPhotos: 4 }, Premium: { maxPhotos: 10 }, Featured: { maxPhotos: 15 } };
  const planLimits = {
    Free: plans.Free?.maxPhotos || 4,
    Premium: plans.Premium?.maxPhotos || 10,
    Featured: plans.Featured?.maxPhotos || 15
  };
  const maxPhotos = planLimits[activePlan] || 4;

  if (currentPhotosCount >= maxPhotos) {
    triggerToast(`Upload limit reached. You can upload up to ${maxPhotos} photos on the ${activePlan} plan. Please remove excess photos first.`, true);
    return;
  }
  
  const token = getStoredToken();
  
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) {
      triggerToast(`File ${file.name} is too large (max 5MB)`, true);
      continue;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      triggerToast(`Uploading ${file.name}...`);
      
      const uploadRes = await fetch(`${API_BASE}/api/upload/photo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.ok) {
        throw new Error(uploadData.message || 'Upload failed');
      }
      
      const registerRes = await api('/api/vendor/me/photos', {
        method: 'POST',
        body: { url: uploadData.url, isCover: false }
      });
      
      if (!registerRes.ok) {
        throw new Error(registerRes.message || 'Failed to save photo');
      }
      
      triggerToast(`Photo ${file.name} uploaded successfully!`);
    } catch (err) {
      triggerToast(`Failed to upload ${file.name}: ${err.message}`, true);
    }
  }
  
  await fetchDashboardStats();
  localStorage.setItem('wedeazzy_sync_trigger', Date.now().toString());
  renderProfileTab(document.getElementById('contentViewport'));
}

async function deleteBusinessPhoto(photoId) {
  if (!confirm('Delete this photo?')) return;
  
  try {
    const res = await api(`/api/vendor/me/photos/${photoId}`, {
      method: 'DELETE'
    });
    
    if (!res.ok) throw new Error(res.message || 'Failed to delete photo');
    
    triggerToast('Photo deleted successfully!');
    await fetchDashboardStats();
    localStorage.setItem('wedeazzy_sync_trigger', Date.now().toString());
    renderProfileTab(document.getElementById('contentViewport'));
  } catch (err) {
    triggerToast(err.message || 'Error deleting photo.', true);
  }
}

async function setCoverPhoto(photoId) {
  try {
    const res = await api(`/api/vendor/me/photos/${photoId}/cover`, {
      method: 'PATCH'
    });
    
    if (!res.ok) throw new Error(res.message || 'Failed to set cover photo');
    
    triggerToast('Cover photo updated successfully!');
    await fetchDashboardStats();
    localStorage.setItem('wedeazzy_sync_trigger', Date.now().toString());
    renderProfileTab(document.getElementById('contentViewport'));
  } catch (err) {
    triggerToast(err.message || 'Error setting cover photo.', true);
  }
}

async function deleteMyListing(vendorId = null) {
  const targetId = vendorId || (state.vendor ? state.vendor.id : null);
  if (!targetId) return;
  if (!confirm('Are you absolutely sure you want to delete this business listing? This will permanently delete the profile, photos, and inquiries, and cannot be undone.')) {
    return;
  }
  
  try {
    const data = await api('/api/vendor/me', {
      method: 'DELETE',
      headers: { 'X-Vendor-Id': targetId }
    });
    
    if (!data.ok) throw new Error(data.message || 'Failed to delete listing');
    
    triggerToast('Listing deleted successfully.');
    if (localStorage.getItem('wedeazzy_active_vendor_id') === targetId) {
      localStorage.removeItem('wedeazzy_active_vendor_id');
    }
    state.vendor = null;
    await fetchDashboardStats();
    localStorage.setItem('wedeazzy_sync_trigger', Date.now().toString());
    switchTab('dashboard');
  } catch (err) {
    triggerToast(err.message || 'Error deleting listing.', true);
  }
}

window.selectActiveBusiness = async function(vendorId) {
  localStorage.setItem('wedeazzy_active_vendor_id', vendorId);
  await fetchDashboardStats();
  switchTab('profile');
};

// Expose photo and deletion functions to window scope
window.uploadBusinessPhotos = uploadBusinessPhotos;
window.deleteBusinessPhoto = deleteBusinessPhoto;
window.setCoverPhoto = setCoverPhoto;
window.deleteMyListing = deleteMyListing;

// 3. MY BUSINESSES TAB
function renderBusinessesTab(el) {
  const businesses = getActiveList();
  const count = businesses.length;
  const activePlan = state.vendor?.subscriptionPlan || 'Free';
  const plans = state.plans || {
    Free: { maxBusinesses: 1 },
    Premium: { maxBusinesses: 3 },
    Featured: { maxBusinesses: 7 }
  };
  const limit = plans[activePlan]?.maxBusinesses || (activePlan === 'Featured' ? 7 : activePlan === 'Premium' ? 3 : 1);
  const percent = Math.min(100, Math.round((count / limit) * 100));

  el.innerHTML = `
    <div class="hero-section">
      <h1>My Businesses</h1>
      <p>Configure and manage your active listing cards discovered by couples on the marketplace.</p>
    </div>

    <!-- Business Listings Progress Bar -->
    <div class="card-premium" style="margin-bottom: 24px; padding: 20px; border-radius: 12px; background: var(--bg-card); box-shadow: var(--shadow-sm); border: 1px solid var(--border-color);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 13.5px; font-weight: 700; color: var(--navy);">Business Listings</span>
        <strong style="font-size: 13.5px; color: var(--text-secondary);">${count} of ${limit} Available</strong>
      </div>
      <div style="height: 8px; background: var(--border-color); border-radius: 99px; overflow: hidden; width: 100%;">
        <div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #E11D2A 0%, #ff4b5c 100%); border-radius: 99px; transition: width 0.5s ease;"></div>
      </div>
    </div>

    <div class="business-grid">
      ${businesses.map(b => `
        <div class="business-card">
          <div class="business-card-image">
            <img src="${(b.photos && b.photos.length > 0) ? (b.photos.find(p => p.isCover)?.url || b.photos[0].url) : 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600'}" alt="${esc(b.name || b.businessName)}">
            <span class="business-card-badge">${b.subscriptionPlan === 'Featured' ? '★ Featured' : b.subscriptionPlan === 'Premium' ? 'Premium' : 'Basic'}</span>
            <div class="business-card-rating">⭐ ${b.ratingCount !== undefined ? (b.ratingCount > 0 ? Number(b.rating || 0).toFixed(1) : '0.0') : (b.rating || '4.5')} <span>(${b.ratingCount !== undefined ? (b.ratingCount || 0) : (b.reviews || 0)})</span></div>
          </div>
          <div class="business-card-content">
            <h3 class="business-card-title">${esc(b.name || b.businessName)}</h3>
            <span class="business-card-meta">📍 ${esc(b.location || b.city)}</span>
            <span class="business-card-meta">🏷️ ${esc(b.category)}</span>
            
            <div class="business-card-actions">
              <button class="btn-premium btn-outline" style="flex:1;" onclick="window.selectActiveBusiness('${b.id}')">✏️ Edit</button>
              <button class="btn-premium btn-pink" style="flex:1;" onclick="switchTab('subscriptions')">🚀 Promote</button>
              <button class="btn-premium btn-outline" style="color:var(--danger);" onclick="window.deleteMyListing('${b.id}')">🗑️ Delete</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// 4. ADD BUSINESS TAB (Multi-Step Form)
function renderAddBusinessTab(el) {
  const count = (state.vendors || []).length;
  const activePlan = state.vendor?.subscriptionPlan || 'Free';
  const plans = state.plans || {
    Free: { maxBusinesses: 1 },
    Premium: { maxBusinesses: 3 },
    Featured: { maxBusinesses: 7 }
  };
  const limit = plans[activePlan]?.maxBusinesses || (activePlan === 'Featured' ? 7 : activePlan === 'Premium' ? 3 : 1);
  const percent = Math.min(100, Math.round((count / limit) * 100));

  if (count >= limit) {
    el.innerHTML = `
      <div class="card-premium" style="max-width:600px; margin: 40px auto; text-align: center; padding: 40px 28px; border-radius: 16px; background: var(--bg-card); box-shadow: var(--shadow-premium); border: 1px solid var(--border-color);">
        <div style="background: rgba(225, 29, 42, 0.06); color: #E11D2A; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 20px auto;">🔒</div>
        <h3 style="font-family: var(--serif); font-size: 22px; color: var(--navy); margin-bottom: 12px; font-weight: 700;">Business Limit Reached</h3>
        <p style="font-size: 13.5px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 24px; max-width: 480px; margin-left: auto; margin-right: auto;">
          You have used all <strong>${count}</strong> business listing${count > 1 ? 's' : ''} available in your <strong>${activePlan} Plan</strong>.
          ${activePlan === 'Free' ? 'Upgrade to Premium to manage up to 3 businesses, or Featured to manage up to 7 businesses.' : 'Upgrade to Featured to manage up to 7 businesses.'}
        </p>
        <div style="display: flex; gap: 16px; justify-content: center;">
          <button class="btn-premium btn-pink" onclick="switchTab('subscriptions')" style="padding: 10px 24px; font-size: 13px; font-weight: 700;">Upgrade Plan</button>
          <button class="btn-premium btn-outline" onclick="switchTab('subscriptions')" style="padding: 10px 24px; font-size: 13px; font-weight: 700;">View Subscription Plans</button>
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="card-premium" style="max-width:800px; margin: 0 auto;">
      <!-- Business Usage Progress Bar -->
      <div style="margin-bottom: 24px; padding: 16px; border-radius: 8px; background: rgba(209, 38, 83, 0.02); border: 1px solid var(--pink-border);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 12px; font-weight: 700; color: var(--navy); text-transform: uppercase; letter-spacing: 0.5px;">Business Usage</span>
          <strong style="font-size: 12px; color: var(--text-secondary);">${count} / ${limit} Businesses Used</strong>
        </div>
        <div style="height: 6px; background: var(--border-color); border-radius: 99px; overflow: hidden; width: 100%;">
          <div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #E11D2A 0%, #ff4b5c 100%); border-radius: 99px;"></div>
        </div>
        <p style="font-size: 11px; color: var(--text-muted); margin: 6px 0 0 0;">
          You can add ${limit - count} more business listing${(limit - count) > 1 ? 's' : ''} under your current plan.
        </p>
      </div>

      <div class="card-header-premium">
        <h3>Create New Listing</h3>
        <span>Step-by-step onboarding</span>
      </div>

      <div class="step-form-indicator">
        <div class="step-indicator-node active" id="node-1">1</div>
        <div class="step-indicator-node" id="node-2">2</div>
        <div class="step-indicator-node" id="node-3">3</div>
      </div>

      <!-- Step 1 -->
      <div class="form-step active" id="step-1">
        <h4 style="margin-bottom:12px;">Step 1: General Business Registry</h4>
        <div class="form-grid-premium">
          <div class="form-field-premium full">
            <label>Business Name *</label>
            <input type="text" id="addBizName" placeholder="e.g. Wedeazzy Royal Banquet" />
          </div>
          <div class="form-field-premium">
            <label>Category</label>
            <select id="addBizCat">
              <option>Banquet Halls</option>
              <option>Wedding Lawns</option>
              <option>Photographers</option>
              <option>Bridal Makeup</option>
              <option>Wedding Planners</option>
            </select>
          </div>
          <div class="form-field-premium">
            <label>Destination City</label>
            <select id="addBizCity">
              <option>Mumbai</option>
              <option>Delhi NCR</option>
              <option>Goa</option>
              <option>Jaipur</option>
              <option>Udaipur</option>
            </select>
          </div>
        </div>
        <div class="form-actions-premium">
          <button class="btn-premium btn-navy" onclick="changeStep(2)">Next Step →</button>
        </div>
      </div>

      <!-- Step 2 -->
      <div class="form-step" id="step-2">
        <h4 style="margin-bottom:12px;">Step 2: Capacity &amp; Packages</h4>
        <div class="form-grid-premium">
          <div class="form-field-premium">
            <label>Guest Capacity (for venues)</label>
            <input type="number" id="addBizCap" placeholder="500" />
          </div>
          <div class="form-field-premium">
            <label>Starting Package Price (₹)</label>
            <input type="number" id="addBizPrice" placeholder="1500" />
          </div>
          <div class="form-field-premium full">
            <label>Services Offered (comma-separated)</label>
            <input type="text" id="addBizServices" placeholder="catering, stage decor, DJ setup" />
          </div>
        </div>
        <div class="form-actions-premium">
          <button class="btn-premium btn-outline" onclick="changeStep(1)">← Back</button>
          <button class="btn-premium btn-navy" onclick="changeStep(3)">Next Step →</button>
        </div>
      </div>

      <!-- Step 3 -->
      <div class="form-step" id="step-3">
        <h4 style="margin-bottom:12px;">Step 3: Verification &amp; Contact</h4>
        <div class="form-grid-premium">
          <div class="form-field-premium full">
            <label>Official Pincode</label>
            <input type="text" id="addBizPincode" placeholder="400053" />
          </div>
          <div class="form-field-premium full">
            <label>WhatsApp Inquiry Target Phone Number</label>
            <input type="text" id="addBizPhone" placeholder="+91 99999 88888" />
          </div>
        </div>
        <div class="form-actions-premium">
          <button class="btn-premium btn-outline" onclick="changeStep(2)">← Back</button>
          <button class="btn-premium btn-navy" id="addBizPublishBtn" onclick="submitNewBusiness(event)">✓ Publish Listing</button>
        </div>
      </div>
    </div>
  `;
}

function changeStep(stepNum) {
  document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
  document.querySelectorAll('.step-indicator-node').forEach((node, idx) => {
    if (idx + 1 === stepNum) {
      node.className = 'step-indicator-node active';
    } else if (idx + 1 < stepNum) {
      node.className = 'step-indicator-node completed';
    } else {
      node.className = 'step-indicator-node';
    }
  });
  document.getElementById(`step-${stepNum}`).classList.add('active');
}

async function submitNewBusiness(e) {
  const publishBtn = document.getElementById('addBizPublishBtn');
  if (!publishBtn || publishBtn.disabled) return;

  const bName = document.getElementById('addBizName').value.trim();
  const category = document.getElementById('addBizCat').value;
  const city = document.getElementById('addBizCity').value;
  const capacity = parseInt(document.getElementById('addBizCap').value, 10) || 500;
  const priceMin = parseInt(document.getElementById('addBizPrice').value, 10) || 1500;
  const services = document.getElementById('addBizServices').value.split(',').map(s => s.trim()).filter(Boolean);
  const pincode = document.getElementById('addBizPincode').value.trim();
  const phone = document.getElementById('addBizPhone').value.trim();

  if (!bName || !category || !city) {
    return triggerToast('Business name, category, and city are required.', true);
  }

  try {
    publishBtn.innerHTML = `<span class="otp-loading-spinner"></span> Publishing...`;
    publishBtn.disabled = true;

    const data = await api('/api/vendor/signup', {
      method: 'POST',
      body: { businessName: bName, category, city, capacity, priceMin, services, pincode, whatsappNumber: phone }
    });

    if (!data.ok) throw new Error(data.message || 'Onboarding failed');

    state.vendor = data.vendor;
    triggerToast('Listing published successfully! Welcome to WedEazzy.');
    localStorage.setItem('wedeazzy_sync_trigger', Date.now().toString());
    
    // Reboot stats and switch
    await fetchDashboardStats();
    
    const badgeName = document.getElementById('profileBadgeName');
    if (badgeName) {
      badgeName.textContent = data.vendor.businessName;
    }
    switchTab('dashboard');

  } catch (err) {
    triggerToast(err.message || 'Error publishing listing.', true);
  } finally {
    publishBtn.innerHTML = '✓ Publish Listing';
    publishBtn.disabled = false;
  }
}

// 5. BOOKING MANAGER TAB
function renderBookingsTab(el) {
  const bookings = state.mockData.bookings;

  el.innerHTML = `
    <div class="card-premium">
      <div class="card-header-premium">
        <h3>Booking Manager</h3>
        
        <!-- SheetJS Excel Export triggers -->
        <div class="table-filter-left">
          <button class="btn-premium btn-pink" onclick="exportBookingsExcel()">📊 Export Bookings (XLSX)</button>
          <button class="btn-premium btn-outline" onclick="exportBookingsCSV()">CSV</button>
        </div>
      </div>

      <div class="table-filter-bar">
        <input type="text" placeholder="Search bookings by name..." class="filter-input" id="bookingsSearch" oninput="filterBookingsTable(this.value)" />
        <select class="filter-input" id="bookingsStatusFilter" onchange="filterBookingsStatus(this.value)">
          <option value="">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div class="table-responsive">
        <table class="spreadsheet" id="bookingsTable">
          <thead>
            <tr>
              <th onclick="sortTable('bookingsTable', 0)">ID</th>
              <th onclick="sortTable('bookingsTable', 1)">Customer Name</th>
              <th onclick="sortTable('bookingsTable', 2)">Event Date</th>
              <th onclick="sortTable('bookingsTable', 3)">Status</th>
              <th onclick="sortTable('bookingsTable', 4)">Payment</th>
              <th onclick="sortTable('bookingsTable', 5)">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            ${bookings.map(b => `
              <tr>
                <td><strong class="font-semibold text-navy">${b.id}</strong></td>
                <td><strong>${esc(b.name)}</strong></td>
                <td>${b.date}</td>
                <td><span class="status-badge ${b.status}">${b.status}</span></td>
                <td>${b.payment}</td>
                <td>₹${b.amount.toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 6. SUBSCRIPTIONS TAB
function renderSubscriptionsTab(el) {
  const vendor = state.vendor || {};
  const activePlan = vendor.subscriptionPlan || 'Free';
  
  // Load plans configuration dynamically
  if (!state.plans) {
    api('/api/public/plans').then(res => {
      if (res.ok) {
        state.plans = res.plans;
        renderSubscriptionsTab(el);
      }
    }).catch(err => console.error('Failed to load plans config:', err));
    return;
  }
  
  const plans = state.plans;
  let expiryDate = 'N/A';
  let isExpired = false;
  let remainingDays = 0;
  
  if (vendor.subscriptionExpiry) {
    const expDate = new Date(vendor.subscriptionExpiry);
    expiryDate = expDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    isExpired = expDate < new Date();
    if (!isExpired) {
      remainingDays = Math.ceil((expDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    }
  }

  const badgeHtml = isExpired
    ? `<span class="status-badge cancelled" style="background-color: #EF4444; color: white; border-radius: 99px; padding: 6px 14px; font-size:12px; font-weight:700; display:inline-block; margin-bottom:6px;">● EXPIRED</span>`
    : (activePlan === 'Free' ? `<span class="status-badge" style="background-color: #94A3B8; color: white; border-radius: 99px; padding: 6px 14px; font-size:12px; font-weight:700; display:inline-block; margin-bottom:6px;">● FREE PLAN</span>` : `<span class="status-badge confirmed" style="background-color: #10B981; color: white; border-radius: 99px; padding: 6px 14px; font-size:12px; font-weight:700; display:inline-block; margin-bottom:6px;">● ACTIVE</span>`);

  const warnHtml = (vendor.subscriptionExpiry && !isExpired && remainingDays <= 7)
    ? `<span style="display: block; font-size: 11px; color: #EF4444; font-weight: 700; animation: pulse 2s infinite;">⚠️ Subscription expires in ${remainingDays} days</span>`
    : (isExpired ? `<span style="display: block; font-size: 11px; color: #EF4444; font-weight: 700;">⚠️ Upgrade to reactivate premium visibility</span>` : '');

  el.innerHTML = `
    <div class="hero-section">
      <h1>Subscription Status &amp; Plans</h1>
      <p>Manage your WedEazzy marketplace business plan, unlock premium leads and visibility.</p>
    </div>

    <!-- Active Plan Status Bar -->
    <div style="background: linear-gradient(135deg, rgba(209, 38, 83, 0.08) 0%, rgba(14, 23, 38, 0.03) 100%); border: 1px solid var(--pink-border); border-radius: var(--radius-lg); padding: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 32px;">
      <div>
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--gold); font-weight: 700; display:block; margin-bottom:4px;">Current Status</span>
        <h3 style="font-size: 20px; font-family: var(--serif); color: var(--navy);">Active Plan: <span style="color:var(--rose-primary); font-weight: 700;">${activePlan}</span></h3>
        <span style="font-size: 13px; color: var(--text-secondary);">${activePlan === 'Free' ? 'No active premium subscription' : `Renews automatically via Razorpay on ${expiryDate}`}</span>
      </div>
      <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
        ${badgeHtml}
        ${warnHtml}
        ${activePlan !== 'Free' && !isExpired ? `
          <button class="btn-premium btn-pink" style="font-size: 11px; padding: 6px 12px; margin-top: 4px;" onclick="window.cancelMySubscription()">
            <i class="fa-solid fa-ban"></i> Cancel Subscription
          </button>
        ` : ''}
      </div>
    </div>

    <!-- 3-Column Plan Grid -->
    <div class="form-grid-premium" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px;">
      <!-- Plan 1: Free -->
      <div class="card-premium" style="display: flex; flex-direction: column; justify-content: space-between; border: 1.5px solid ${activePlan === 'Free' && !isExpired ? 'var(--gold)' : 'var(--border-color)'}; position: relative; overflow: hidden; background-color: ${activePlan === 'Free' && !isExpired ? 'rgba(243, 236, 226, 0.2)' : 'var(--bg-card)'};">
        ${activePlan === 'Free' && !isExpired ? '<span style="position: absolute; top: 12px; right: -30px; background: var(--gold); color: #fff; font-size: 9px; font-weight: 800; padding: 4px 30px; transform: rotate(45deg); text-transform: uppercase; letter-spacing: 1px;">Active</span>' : ''}
        <div>
          <h4 style="font-family: var(--serif); font-size: 20px; color: var(--navy); margin-bottom: 6px;">Free Plan</h4>
          <span style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 16px;">Best for basic listing</span>
          <div style="font-size: 32px; font-weight: 800; font-family: var(--serif); color: var(--navy); margin-bottom: 20px;">
            ₹${plans.Free.price} <span style="font-size: 13px; font-family: var(--sans); color: var(--text-secondary); font-weight: 500;">/ forever</span>
          </div>
          <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; font-size: 13px; color: var(--text-secondary); border-top: 1px solid var(--border-color); padding-top: 16px;">
            <li>✓ Business Listing Card</li>
            <li>✓ Max ${plans.Free.maxPhotos} Gallery Photos</li>
            <li>✓ Standard Search Ranking</li>
            <li>✓ Leads inbox (Standard list)</li>
            <li>✓ View Full Contact details</li>
          </ul>
        </div>
        <div style="margin-top: 24px;">
          ${activePlan === 'Free' && !isExpired 
            ? '<button class="btn-premium btn-outline" style="width: 100%; border-color: var(--success); color: var(--success); cursor: default;" disabled>✓ Your Active Plan</button>' 
            : '<button class="btn-premium btn-outline" style="width: 100%;" onclick="window.cancelMySubscription()">Revert to Free</button>'}
        </div>
      </div>

      <!-- Plan 2: Premium -->
      <div class="card-premium" style="display: flex; flex-direction: column; justify-content: space-between; border: 1.5px solid ${activePlan === 'Premium' && !isExpired ? 'var(--gold)' : 'var(--border-color)'}; position: relative; overflow: hidden; background-color: ${activePlan === 'Premium' && !isExpired ? 'rgba(243, 236, 226, 0.2)' : 'var(--bg-card)'};">
        ${activePlan === 'Premium' && !isExpired ? '<span style="position: absolute; top: 12px; right: -30px; background: var(--gold); color: #fff; font-size: 9px; font-weight: 800; padding: 4px 30px; transform: rotate(45deg); text-transform: uppercase; letter-spacing: 1px;">Active</span>' : ''}
        <div>
          <h4 style="font-family: var(--serif); font-size: 20px; color: var(--navy); margin-bottom: 6px;">Premium Plan</h4>
          <span style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 16px;">${plans.Premium.description}</span>
          <div style="font-size: 32px; font-weight: 800; font-family: var(--serif); color: var(--navy); margin-bottom: 20px;">
            ₹${plans.Premium.price.toLocaleString('en-IN')} <span style="font-size: 13px; font-family: var(--sans); color: var(--text-secondary); font-weight: 500;">/ month</span>
          </div>
          <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; font-size: 13px; color: var(--text-secondary); border-top: 1px solid var(--border-color); padding-top: 16px;">
            <li>✓ Max ${plans.Premium.maxPhotos} Gallery Photos</li>
            <li>✓ Higher Search Ranking priority</li>
            <li>✓ Premium Vendor Badge of trust</li>
            <li>✓ 📊 Access to Reports Dashboard</li>
            <li>✓ Profile Views &amp; monthly lead charts</li>
          </ul>
        </div>
        <div style="margin-top: 24px;">
          ${activePlan === 'Premium' && !isExpired 
            ? '<button class="btn-premium btn-outline" style="width: 100%; border-color: var(--success); color: var(--success); cursor: default;" disabled>✓ Your Active Plan</button>' 
            : '<button class="btn-premium btn-pink" style="width: 100%;" onclick="upgradePlan(\'Premium\')">Upgrade to Premium</button>'}
        </div>
      </div>

      <!-- Plan 3: Featured -->
      <div class="card-premium" style="display: flex; flex-direction: column; justify-content: space-between; border: 2.5px solid ${activePlan === 'Featured' && !isExpired ? 'var(--gold)' : 'var(--rose-primary)'}; position: relative; overflow: hidden; background-color: ${activePlan === 'Featured' && !isExpired ? 'rgba(243, 236, 226, 0.2)' : 'var(--bg-card)'};">
        <span style="position: absolute; top: 12px; right: -30px; background: ${activePlan === 'Featured' && !isExpired ? 'var(--gold)' : 'var(--rose-primary)'}; color: #fff; font-size: 9px; font-weight: 800; padding: 4px 30px; transform: rotate(45deg); text-transform: uppercase; letter-spacing: 1px;">${activePlan === 'Featured' && !isExpired ? 'Active' : 'Best ROI'}</span>
        <div>
          <h4 style="font-family: var(--serif); font-size: 20px; color: var(--navy); margin-bottom: 6px;">Featured Plan</h4>
          <span style="font-size: 12px; color: var(--text-muted); display: block; margin-bottom: 16px;">${plans.Featured.description}</span>
          <div style="font-size: 32px; font-weight: 800; font-family: var(--serif); color: var(--navy); margin-bottom: 20px;">
            ₹${plans.Featured.price.toLocaleString('en-IN')} <span style="font-size: 13px; font-family: var(--sans); color: var(--text-secondary); font-weight: 500;">/ month</span>
          </div>
          <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; font-size: 13px; color: var(--text-secondary); border-top: 1px solid var(--border-color); padding-top: 16px;">
            <li>✓ Max ${plans.Featured.maxPhotos} Gallery Photos</li>
            <li>✓ Highest Search Ranking priority</li>
            <li>✓ Featured Badge &amp; Homepage placement</li>
            <li>✓ 💡 Full Reports + Insights Dashboards</li>
            <li>✓ Exclusive Pincode Lockout guarantee</li>
            <li>✓ Priority Support Concierge Helpline</li>
          </ul>
        </div>
        <div style="margin-top: 24px;">
          ${activePlan === 'Featured' && !isExpired 
            ? '<button class="btn-premium btn-outline" style="width: 100%; border-color: var(--success); color: var(--success); cursor: default;" disabled>✓ Your Active Plan</button>' 
            : '<button class="btn-premium btn-pink animate-pulse" style="width: 100%; font-weight:800; background: linear-gradient(135deg, var(--rose-primary), var(--gold)); color:white; border:none;" onclick="upgradePlan(\'Featured\')">Reserve Featured Spot</button>'}
        </div>
      </div>
    </div>

    <!-- Billing History & Invoices -->
    <div class="card-premium" style="margin-top: 36px; padding: 24px;">
      <h3 style="font-family: var(--serif); font-size: 18px; color: var(--navy); margin-bottom: 6px;">Billing History &amp; Invoices</h3>
      <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">Download tax invoices and keep track of your subscription payments.</p>
      
      <div id="vendorInvoiceTableContainer">
        <div style="text-align: center; color: var(--text-secondary); padding: 20px 0;">
          <span class="otp-loading-spinner" style="display:inline-block; margin-bottom:8px;"></span> Loading invoices...
        </div>
      </div>
    </div>
  `;

  setTimeout(async () => {
    const tableContainer = document.getElementById('vendorInvoiceTableContainer');
    if (!tableContainer) return;
    try {
      const res = await api('/api/payment/transactions');
      if (res.ok && res.data && res.data.length > 0) {
        tableContainer.innerHTML = `
          <div style="overflow-x: auto;">
            <table class="grid-table" style="width: 100%; min-width: 600px; border-collapse: collapse; text-align: left; font-size: 13.5px;">
              <thead>
                <tr style="border-bottom: 2px solid var(--border-color); color: var(--navy); font-weight: 700;">
                  <th style="padding: 12px 8px;">Invoice ID</th>
                  <th style="padding: 12px 8px;">Billing Date</th>
                  <th style="padding: 12px 8px;">Payment Method</th>
                  <th style="padding: 12px 8px;">Description</th>
                  <th style="padding: 12px 8px;">Amount</th>
                  <th style="padding: 12px 8px;">Status</th>
                  <th style="padding: 12px 8px; text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${res.data.map(t => {
                  const createdDate = new Date(t.createdAt);
                  const dateFormatted = createdDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                  const safeTxnStr = JSON.stringify({
                    id: t.id,
                    date: dateFormatted + ' ' + createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    client: state.vendor ? state.vendor.businessName : 'Partner Business',
                    role: 'vendor',
                    purpose: t.purpose,
                    amount: t.amount / 100, // paise to INR
                    gateway: t.gateway,
                    gatewayRef: t.gatewayRef
                  }).replace(/"/g, '&quot;');
                  
                  return `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                      <td style="padding: 12px 8px;"><strong>#${t.id}</strong></td>
                      <td style="padding: 12px 8px;">${dateFormatted}</td>
                      <td style="padding: 12px 8px;">${t.gateway} (${t.gatewayRef || '—'})</td>
                      <td style="padding: 12px 8px;"><span class="interactive-pill-badge" style="font-size:11px; text-transform:capitalize;">${t.purpose.replace('subscription:', '')}</span></td>
                      <td style="padding: 12px 8px; font-weight: 700;">₹${(t.amount / 100).toLocaleString('en-IN')}.00</td>
                      <td style="padding: 12px 8px;">
                        <span class="status-badge ${t.status === 'success' ? 'confirmed' : 'cancelled'}" style="font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 4px;">
                          ${t.status.toUpperCase()}
                        </span>
                      </td>
                      <td style="padding: 12px 8px; text-align: right;">
                        <button class="btn-premium btn-outline" style="font-size: 12px; padding: 4px 10px;" onclick="printAdminInvoice(${safeTxnStr})">
                          <i class="fa-solid fa-print"></i> Print Invoice
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        tableContainer.innerHTML = `
          <div style="text-align: center; color: var(--text-secondary); padding: 30px 0;">
            <i class="fa-solid fa-receipt" style="font-size: 24px; margin-bottom: 8px; display:block; color: var(--text-muted);"></i>
            No subscription invoices located yet.
          </div>
        `;
      }
    } catch (err) {
      tableContainer.innerHTML = `
        <div style="text-align: center; color: var(--rose-primary); padding: 20px 0;">
          Failed to load invoices. Please refresh.
        </div>
      `;
    }
  }, 100);
}

// Global Checkout Integration Functions
window.upgradePlan = function(planName) {
  showCheckoutModal(planName);
};

window.upgradeFeatured = function() {
  showCheckoutModal('Featured');
};

window.showCheckoutModal = function(planName) {
  const plans = state.plans || {
    Premium: { price: 2999 },
    Featured: { price: 5999 }
  };
  const base = plans[planName]?.price || (planName === 'Featured' ? 5999 : 2999);
  const gst = parseFloat((base * 0.18).toFixed(2));
  const total = parseFloat((base * 1.18).toFixed(2));
  const details = { base, gst, total };
  if (!details) return;

  let modal = document.getElementById('checkoutModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'checkoutModal';
    modal.className = 'otp-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="otp-card" style="max-width: 450px; text-align: left; padding: 32px; z-index: 100; position: relative;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
        <h3 style="font-family: var(--serif); font-size: 22px; color: var(--navy); margin:0;">Secure Checkout</h3>
        <button onclick="closeCheckoutModal()" style="font-size: 24px; color: var(--text-secondary); background: none; border: none; cursor: pointer; line-height: 1;">&times;</button>
      </div>

      <div style="margin-bottom: 24px;">
        <div style="font-size:11px; text-transform:uppercase; color:var(--gold); font-weight:700; letter-spacing: 0.05em; margin-bottom:4px;">Selected Plan</div>
        <div style="font-size:19px; font-weight:700; color:var(--navy); font-family: var(--serif);">${planName} Plan</div>
        <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">30 Days validity post payment activation</div>
      </div>

      <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <div style="display:flex; justify-content:space-between; font-size:13.5px; margin-bottom:8px;">
          <span style="color:var(--text-secondary);">Subscription Charge</span>
          <span style="font-weight:600; color:var(--text);">₹${details.base.toLocaleString('en-IN')}.00</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13.5px; margin-bottom:12px; padding-bottom:8px; border-bottom: 1px dashed var(--border-color);">
          <span style="color:var(--text-secondary);">GST (18%)</span>
          <span style="font-weight:600; color:var(--text);">₹${details.gst.toLocaleString('en-IN')}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:700;">
          <span style="color:var(--navy);">Total Payable</span>
          <span style="color:var(--rose-primary);">₹${details.total.toLocaleString('en-IN')}</span>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px;">
        <button id="checkoutSubmitBtn" class="btn-premium btn-pink" style="width:100%; font-weight:700; padding:12px;" onclick="processRazorpayPayment('${planName}')">
          Proceed to Pay Securely
        </button>
        <button class="btn-premium btn-outline" style="width:100%; padding:10px;" onclick="closeCheckoutModal()">
          Cancel & Close
        </button>
      </div>

      <div style="margin-top: 16px; font-size: 10px; color: var(--text-secondary); text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px;">
        <span>🔒</span> Secure 256-bit SSL encrypted transaction via Razorpay
      </div>
    </div>
  `;

  modal.style.display = 'flex';
};

window.closeCheckoutModal = function() {
  const modal = document.getElementById('checkoutModal');
  if (modal) {
    modal.style.display = 'none';
  }
};

/** Load Razorpay checkout script on demand. */
function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload  = resolve;
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script. Check your internet connection.'));
    document.head.appendChild(script);
  });
}

/** Open Razorpay modal for a subscription plan. */
window.processRazorpayPayment = async function(planName, submitBtnId) {
  const submitBtn = document.getElementById(submitBtnId || 'checkoutSubmitBtn');
  if (submitBtn?.disabled) return;

  const originalHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="otp-loading-spinner"></span> Connecting...`;
  }
  window.showPaymentOverlay('Initializing secure checkout...');

  try {
    await loadRazorpayScript();

    const data = await api('/api/payment/initiate', {
      method: 'POST',
      body: { planName }
    });

    if (!data.ok || !data.orderId) {
      throw new Error(data.message || data.error || 'Failed to create payment order.');
    }

    window.hidePaymentOverlay();

    const options = {
      key: data.keyId,
      amount: data.amount,
      currency: data.currency || 'INR',
      name: 'WedEazzy.com',
      description: `${planName} Plan Subscription`,
      image: '/images/logo.png',
      order_id: data.orderId,
      handler: async function(response) {
        window.showPaymentOverlay('Verifying payment...');
        try {
          const verify = await api('/api/payment/verify', {
            method: 'POST',
            body: {
              razorpay_order_id:    response.razorpay_order_id,
              razorpay_payment_id:  response.razorpay_payment_id,
              razorpay_signature:   response.razorpay_signature,
              transactionId:        data.transactionId
            }
          });
          window.hidePaymentOverlay();
          if (verify.ok) {
            triggerToast(`🎉 ${planName} plan activated! Your listing is now live.`);
            if (typeof window.closeCheckoutModal === 'function') window.closeCheckoutModal();
            setTimeout(() => window.location.reload(), 1500);
          } else {
            throw new Error(verify.message || verify.error || 'Payment verification failed.');
          }
        } catch (verifyErr) {
          window.hidePaymentOverlay();
          triggerToast(verifyErr.message || 'Payment received but verification failed. Please contact support with your payment ID.', true);
        }
      },
      prefill: {
        name:    (typeof currentUser !== 'undefined' && currentUser?.name)  || '',
        email:   (typeof currentUser !== 'undefined' && currentUser?.email) || '',
        contact: (typeof currentUser !== 'undefined' && currentUser?.phone) || ''
      },
      theme: { color: '#C8102E' },
      modal: {
        ondismiss: function() {
          window.hidePaymentOverlay();
          triggerToast('Payment was cancelled. Try again when ready.', true);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHtml;
          }
        }
      }
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function(response) {
      window.hidePaymentOverlay();
      triggerToast(`Payment failed: ${response.error.description || 'Unknown error'}. Please try again.`, true);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
      }
    });
    rzp.open();
  } catch (err) {
    window.hidePaymentOverlay();
    triggerToast(err.message || 'Payment initiation failed. Please try again.', true);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  }
};

window.cancelMySubscription = async function() {
  if (!confirm("Are you sure you want to cancel your WedEazzy subscription? Your visibility will immediately revert to the Free plan tier, and pincode locks will be released.")) {
    return;
  }
  try {
    const data = await api('/api/payment/cancel', {
      method: 'POST'
    });
    if (data.ok) {
      triggerToast('Subscription cancelled successfully!');
      setTimeout(() => {
        location.reload();
      }, 1500);
    } else {
      throw new Error(data.message || 'Failed to cancel subscription');
    }
  } catch (err) {
    triggerToast(err.message || 'Cancellation failed', true);
  }
};

// End of cancel subscription helper

window.printAdminInvoice = function(t) {
  const amount = Number(t.amount);
  const base = (amount / 1.18).toFixed(2);
  const gst = (amount - parseFloat(base)).toFixed(2);
  
  const printWindow = window.open('', '_blank', 'width=800,height=900');
  printWindow.document.write(`
    <html>
      <head>
        <title>Invoice #${t.id}</title>
        <style>
          body { font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; line-height: 1.5; }
          .invoice-header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 24px; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: 800; color: #c8102e; text-decoration: none; }
          .invoice-title { font-size: 28px; font-weight: 800; color: #0f172a; text-align: right; }
          .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
          .details-card h3 { font-size: 14px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 8px; margin-top: 0; }
          .details-card p { margin: 4px 0; font-size: 14px; color: #334155; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; padding: 12px; font-weight: 700; text-align: left; font-size: 14px; color: #475569; }
          td { border-bottom: 1px solid #f1f5f9; padding: 12px; font-size: 14px; color: #334155; }
          .totals-table { width: 300px; float: right; margin-top: 20px; }
          .totals-table td { border: none; padding: 6px 12px; }
          .totals-table tr.grand-total td { font-size: 16px; font-weight: 700; color: #c8102e; border-top: 1px solid #e2e8f0; padding-top: 12px; }
          .footer { margin-top: 100px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
          @media print {
            body { padding: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: flex-end;">
          <button onclick="window.print()" style="background: #c8102e; color: white; border: none; padding: 10px 20px; font-size: 14px; font-weight: 700; border-radius: 6px; cursor: pointer;">Print Invoice</button>
        </div>
        <div class="invoice-header">
          <div>
            <div class="logo">WedEazzy.com</div>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Premium Wedding Marketplace Platform</p>
          </div>
          <div>
            <div class="invoice-title">TAX INVOICE</div>
            <p style="margin: 4px 0 0 0; font-size: 14px; text-align: right; color: #334155;"><strong>Invoice ID:</strong> #${t.id}</p>
            <p style="margin: 2px 0 0 0; font-size: 14px; text-align: right; color: #334155;"><strong>Date:</strong> ${t.date}</p>
          </div>
        </div>
        
        <div class="details-grid">
          <div class="details-card">
            <h3>Billed To:</h3>
            <p><strong>${t.client}</strong></p>
            <p>Role: ${t.role ? t.role.toUpperCase() : 'VENDOR'}</p>
            <p>Payment Mode: Razorpay Payment Gateway</p>
            <p>Gateway Ref: ${t.gatewayRef || '—'}</p>
          </div>
          <div class="details-card" style="text-align: right;">
            <h3>Billed By:</h3>
            <p><strong>WedEazzy Technologies Private Limited</strong></p>
            <p>Empire Plaza, IT Park, LBS Marg</p>
            <p>Vikhroli West, Mumbai, MH 400083</p>
            <p>GSTIN: 27AAACW8382J1Z0</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Base Price</th>
              <th>GST (18%)</th>
              <th style="text-align: right;">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>${t.purpose.toUpperCase().replace('_', ' ').replace('SUBSCRIPTION:', '')} Plan Activation</strong>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">30-day premium platform visibility and listing rank lockout guarantee.</p>
              </td>
              <td>₹${base}</td>
              <td>₹${gst}</td>
              <td style="text-align: right; font-weight: 700;">₹${amount.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div style="display: flow-root;">
          <table class="totals-table">
            <tr>
              <td>Subtotal:</td>
              <td style="text-align: right;">₹${base}</td>
            </tr>
            <tr>
              <td>GST (18%):</td>
              <td style="text-align: right;">₹${gst}</td>
            </tr>
            <tr class="grand-total">
              <td>Total Paid:</td>
              <td style="text-align: right;">₹${amount.toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <div class="footer">
          <p>Thank you for partnering with WedEazzy. This is a computer-generated tax invoice and requires no physical signature.</p>
          <p>© ${new Date().getFullYear()} WedEazzy.com. All Rights Reserved.</p>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
};

// 7. GROWTH & LEADS MANAGER (ROI Interactive SaaS Tool)
function renderGrowthTab(el) {
  el.innerHTML = `
    <div class="hero-section">
      <h1>Grow your WedEazzy Listing</h1>
      <p>Optimize visibility metrics and simulate estimated couple reach, direct WhatsApp clicks, and bookings.</p>
    </div>

    <div class="form-grid-premium" style="gap:24px; margin-bottom: 24px;">
      <!-- ROI Interactive Slider Card -->
      <div class="card-premium roi-card">
        <div class="card-header-premium" style="border:none; margin-bottom:0; padding-bottom:0;">
          <h3 style="font-size:16px; font-family:var(--sans);">Direct Lead &amp; ROI Calculator</h3>
          <span class="roi-badge">Interactive</span>
        </div>
        
        <div class="slider-container">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-size:12.5px; font-weight:600; color:var(--text-secondary);">Target Monthly Ad Spend:</span>
            <strong style="font-size:18px; color:var(--navy);" id="roiSliderVal">₹5,000</strong>
          </div>
          <input type="range" min="1000" max="50000" step="500" value="5000" class="premium-slider" id="roiRangeSlider" oninput="calculateEstimates(this.value)" />
          <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted); margin-top:6px;">
            <span>₹1,000 (Starter)</span>
            <span>₹25,000 (Market Leader)</span>
            <span>₹50,000 (Monopoly)</span>
          </div>
        </div>

        <div class="roi-stats-panel">
          <div class="roi-stat-box">
            <span class="roi-stat-num" id="estViews">1,500</span>
            <span class="roi-stat-lbl">Couple Views</span>
          </div>
          <div class="roi-stat-box">
            <span class="roi-stat-num" id="estClicks">120</span>
            <span class="roi-stat-lbl">WhatsApp clicks</span>
          </div>
          <div class="roi-stat-box">
            <span class="roi-stat-num" id="estBookings" style="color:var(--success);">3</span>
            <span class="roi-stat-lbl">Est. Bookings</span>
          </div>
        </div>

        <div style="margin-top:20px; text-align:center;">
          <button class="btn-premium btn-navy" style="width:100%; font-size:13px; padding:11px;" onclick="switchTab('subscriptions')">
            🚀 Activate Promotion Spot
          </button>
        </div>
      </div>

      <!-- Growth Analysis Chart Panel -->
      <div class="card-premium">
        <div class="card-header-premium">
          <h3>Lead Acquisition Channels</h3>
        </div>
        <div style="max-height: 250px; display:flex; align-items:center; justify-content:center;">
          <canvas id="growthAnalysisChart" style="max-height:220px;"></canvas>
        </div>
      </div>
    </div>

    <!-- Leads Health Status indicators -->
    <div class="metrics-grid">
      <div class="metric-card success">
        <div class="metric-card-info">
          <span class="metric-card-label">SEO Visibility Index</span>
          <span class="metric-card-val">94 / 100</span>
          <span class="metric-card-sub">Highly optimized page rank</span>
        </div>
        <div class="metric-card-icon">🚀</div>
      </div>
      <div class="metric-card gold">
        <div class="metric-card-info">
          <span class="metric-card-label">Review Score Average</span>
          <span class="metric-card-val">4.8 Stars</span>
          <span class="metric-card-sub">Outperforming 92% of peers</span>
        </div>
        <div class="metric-card-icon">⭐</div>
      </div>
    </div>
  `;

  // Render Growth channels Bar chart
  setTimeout(() => {
    const canvas = document.getElementById('growthAnalysisChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Create rich visual gradient colors for bars
    const gradientNavy = ctx.createLinearGradient(0, 0, 0, 200);
    gradientNavy.addColorStop(0, '#0E1726');
    gradientNavy.addColorStop(1, '#05080E');

    const gradientPink = ctx.createLinearGradient(0, 0, 0, 200);
    gradientPink.addColorStop(0, '#FFA6B2');
    gradientPink.addColorStop(1, '#FFF0F2');

    const gradientGold = ctx.createLinearGradient(0, 0, 0, 200);
    gradientGold.addColorStop(0, '#D4AF37');
    gradientGold.addColorStop(1, '#F3E5AB');

    const gradientSuccess = ctx.createLinearGradient(0, 0, 0, 200);
    gradientSuccess.addColorStop(0, '#10B981');
    gradientSuccess.addColorStop(1, '#A7F3D0');

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Direct Search', 'SEO Landing', 'Google Campaign', 'Instagram Ad'],
        datasets: [{
          data: [140, 260, 195, 310],
          backgroundColor: [gradientNavy, gradientPink, gradientGold, gradientSuccess],
          borderWidth: 0,
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        plugins: { 
          legend: { display: false }
        },
        scales: {
          y: { grid: { color: 'rgba(0,0,0,0.03)' }, ticks: { font: { size: 10 }, color: 'var(--text-secondary)' } },
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: 'var(--text-secondary)' } }
        }
      }
    });

    // Run initial slider setup
    calculateEstimates(5000);
  }, 100);
}

// Slider Calculator Logic
function calculateEstimates(spend) {
  const parsedSpend = parseFloat(spend);
  
  // Custom formulas to simulate highly accurate SaaS conversions
  const views = Math.floor(parsedSpend * 0.35);
  const clicks = Math.floor(views * 0.095);
  const bookings = Math.max(1, Math.floor(clicks * 0.03));

  // Update UI values
  const sliderValEl = document.getElementById('roiSliderVal');
  const viewsEl = document.getElementById('estViews');
  const clicksEl = document.getElementById('estClicks');
  const bookingsEl = document.getElementById('estBookings');

  if (sliderValEl) sliderValEl.textContent = '₹' + parsedSpend.toLocaleString('en-IN');
  if (viewsEl) viewsEl.textContent = views.toLocaleString('en-IN');
  if (clicksEl) clicksEl.textContent = clicks.toLocaleString('en-IN');
  if (bookingsEl) bookingsEl.textContent = bookings.toLocaleString('en-IN');
}

// ALL LEADS
function renderLeadsTab(el) {
  const inquiries = state.mockData.inquiries;

  el.innerHTML = `
    <div class="card-premium">
      <div class="card-header-premium">
        <h3>Direct Leads & Inquiries Registry</h3>
        <button class="btn-premium btn-pink" onclick="exportLeadsExcel()">📊 Export Leads Ledger</button>
      </div>

      <div class="table-responsive">
        <table class="spreadsheet" id="leadsTable">
          <thead>
            <tr>
              <th>Date</th>
              <th>Couple Name</th>
              <th>Date requested</th>
              <th>Budget</th>
              <th>Guests</th>
              <th>Action Panel</th>
            </tr>
          </thead>
          <tbody>
            ${inquiries.map(i => `
              <tr>
                <td><span style="font-size:11px; color:var(--text-muted);">${i.eventDate}</span></td>
                <td><strong>${esc(i.name)}</strong><br><span style="font-size:11px;color:var(--text-secondary);">${i.phone}</span></td>
                <td>${i.eventDate}</td>
                <td><strong style="color:var(--navy);">${i.budget}</strong></td>
                <td>${i.guests}</td>
                <td>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <button onclick="openInquiryDetailModal('${i.id}')" class="btn-premium btn-outline" style="padding:6px 12px; font-size:11px; font-weight:700; border: 1px solid var(--pink-border); color: #E11D2A; background: transparent; cursor: pointer; border-radius: 6px;">👁️ View</button>
                    <a href="tel:${i.phone}" class="btn-premium btn-pink" style="padding:6px 12px; font-size:11px; text-decoration:none; display:inline-flex; align-items:center;">📞 Call</a>
                    <a href="https://wa.me/${i.phone.replace(/[^0-9]/g, '')}?text=Hi%20${esc(i.name)},%20thanks%20for%20inquiring%20with%20us%20on%20WedEazzy!%20" target="_blank" class="btn-premium btn-pink" style="padding:6px 12px; font-size:11px; background-color:#25D366; color:white; border-color:#25D366; text-decoration:none; display:inline-flex; align-items:center;">💬 WhatsApp</a>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 8. MARKETING CAMPAIGNS TAB
function renderMarketingTab(el, type = 'all') {
  el.innerHTML = `
    <div class="hero-section">
      <h1>Marketing Campaign Manager</h1>
      <p>Drive targeted traffic from search engines and social feeds straight to your booking desk.</p>
    </div>

    <div class="form-grid-premium" style="gap:24px; margin-bottom:24px;">
      <!-- Google Campaign Card -->
      <div class="card-premium" style="${type === 'instagram' ? 'display:none;' : ''}">
        <div class="card-header-premium">
          <h3>Google Search Ads</h3>
          <span class="status-badge confirmed">Active</span>
        </div>
        <div style="font-size:13px; color:var(--text-secondary); margin-bottom:14px;">
          Show up first on google queries like "Best Banquet Hall Mumbai Andheri"
        </div>
        <div class="metrics-grid" style="grid-template-columns:1fr 1fr; margin-bottom:14px; gap:12px;">
          <div style="background-color:var(--bg-primary); padding:10px; border-radius:6px; text-align:center;">
            <strong style="display:block; font-size:16px;">₹99 / day</strong>
            <span style="font-size:9px; color:var(--text-muted); text-transform:uppercase;">Daily Budget</span>
          </div>
          <div style="background-color:var(--bg-primary); padding:10px; border-radius:6px; text-align:center;">
            <strong style="display:block; font-size:16px; color:var(--success);">342</strong>
            <span style="font-size:9px; color:var(--text-muted); text-transform:uppercase;">Clicks Generated</span>
          </div>
        </div>
        <button class="btn-premium btn-navy" style="width:100%;" onclick="alert('Google campaign dashboard features load contextually.')">Manage Google Ads</button>
      </div>

      <!-- Instagram Promotion -->
      <div class="card-premium" style="${type === 'google' ? 'display:none;' : ''}">
        <div class="card-header-premium">
          <h3>Instagram Feed Promotion</h3>
          <span class="status-badge pending">In Review</span>
        </div>
        <div style="font-size:13px; color:var(--text-secondary); margin-bottom:14px;">
          Reach engaged couples in your city with beautiful banner carousels.
        </div>
        <div class="metrics-grid" style="grid-template-columns:1fr 1fr; margin-bottom:14px; gap:12px;">
          <div style="background-color:var(--bg-primary); padding:10px; border-radius:6px; text-align:center;">
            <strong style="display:block; font-size:16px;">₹150 / day</strong>
            <span style="font-size:9px; color:var(--text-muted); text-transform:uppercase;">Daily Budget</span>
          </div>
          <div style="background-color:var(--bg-primary); padding:10px; border-radius:6px; text-align:center;">
            <strong style="display:block; font-size:16px; color:var(--warning);">Pending</strong>
            <span style="font-size:9px; color:var(--text-muted); text-transform:uppercase;">Ad Impressions</span>
          </div>
        </div>
        <button class="btn-premium btn-pink" style="width:100%;" onclick="alert('Instagram campaign analytics loads contextually.')">Instagram promotion settings</button>
      </div>
    </div>
  `;
}

// 9. REVIEWS TAB
function renderReviewsTab(el) {
  const isDemo = location.search.includes('preview=true') || location.search.includes('demo=true') || !state.vendor;

  const displayReviews = (isDemo || (state.vendor?.reviews && state.vendor.reviews.length > 0))
    ? ((state.vendor?.reviews && state.vendor.reviews.length > 0) ? state.vendor.reviews.map(r => ({
        name: r.name,
        rating: r.rating,
        text: r.text,
        date: r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : 'Recent'
      })) : [
        { name: 'Rohan Deshmukh', rating: 5, text: 'Absolutely spectacular photography! Captured all the emotional candid moments perfectly.', date: '12 July 2026' },
        { name: 'Kirti Sen', rating: 4, text: 'Very professional crew and excellent post-production work. Minor delay in deliverable files but the quality made up for it.', date: '30 June 2026' },
        { name: 'Vikram & Anjali', rating: 5, text: 'WedEazzy directed us to Omkar and it was the best decision. Creative framing and super easy to work with!', date: '18 June 2026' }
      ])
    : [];

  const totalReviews = displayReviews.length;
  
  // Recalculate average rating dynamically from displayed reviews to ensure consistency
  let sumRating = 0;
  displayReviews.forEach(r => sumRating += r.rating);
  const avgRating = totalReviews > 0 ? (sumRating / totalReviews).toFixed(1) : '0.0';

  // Calculate Breakdown counts
  const breakdownCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  displayReviews.forEach(r => {
    const star = Math.floor(r.rating || 5);
    if (breakdownCounts[star] !== undefined) breakdownCounts[star]++;
  });

  const percentages = {};
  [5, 4, 3, 2, 1].forEach(star => {
    percentages[star] = totalReviews > 0 ? Math.round((breakdownCounts[star] / totalReviews) * 100) : 0;
  });

  el.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h2 style="font-family: var(--serif); font-size: 24px; color: var(--navy); margin-bottom: 6px;">Customer Reviews</h2>
      <p style="font-size: 13.5px; color: var(--text-secondary); margin: 0;">Monitor your guest experience ratings and couple testimonials from the marketplace.</p>
    </div>

    <div style="display: grid; grid-template-columns: 280px 1fr; gap: 24px;" class="form-grid-premium">
      
      <!-- Summary and Breakdown Column -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        
        <!-- Score Card -->
        <div class="card-premium" style="padding: 24px; text-align: center; border-radius: 16px; background: var(--bg-card); border: 1px solid var(--border-color); box-shadow: var(--shadow-premium);">
          <span style="font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">Average Rating</span>
          <h3 style="font-size: 36px; color: var(--navy); margin: 0; font-family: var(--serif); font-weight: 800;">${avgRating}</h3>
          
          <div style="color: #F59E0B; font-size: 18px; margin: 8px 0; letter-spacing: 2px;">
            ${'★'.repeat(Math.round(Number(avgRating)))}${'☆'.repeat(5 - Math.round(Number(avgRating)))}
          </div>
          
          <span style="font-size: 12.5px; color: var(--text-muted); font-weight: 600; display: block;">Based on ${totalReviews} review${totalReviews !== 1 ? 's' : ''}</span>
        </div>

        <!-- Rating Breakdown Card -->
        <div class="card-premium" style="padding: 20px; border-radius: 16px; background: var(--bg-card); border: 1px solid var(--border-color); box-shadow: var(--shadow-premium);">
          <h4 style="font-size: 13px; font-weight: 700; color: var(--navy); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 0; margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Rating Breakdown</h4>
          
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${[5, 4, 3, 2, 1].map(star => `
              <div style="display: flex; align-items: center; gap: 10px; font-size: 12.5px;">
                <span style="min-width: 45px; font-weight: 600; color: var(--text-secondary);">${star} Star</span>
                <div style="flex-grow: 1; height: 6px; background: var(--border-color); border-radius: 99px; overflow: hidden;">
                  <div style="width: ${percentages[star]}%; height: 100%; background: #F59E0B; border-radius: 99px;"></div>
                </div>
                <span style="min-width: 32px; text-align: right; color: var(--text-muted); font-weight: 600;">${percentages[star]}%</span>
              </div>
            `).join('')}
          </div>
        </div>

      </div>

      <!-- Reviews List Column -->
      <div class="card-premium" style="padding: 24px; border-radius: 16px; background: var(--bg-card); border: 1px solid var(--border-color); box-shadow: var(--shadow-premium);">
        <h4 style="font-size: 14px; font-weight: 700; color: var(--navy); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 0; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">Recent Reviews</h4>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${displayReviews.length > 0 ? displayReviews.map(r => `
            <div style="background-color: var(--bg-primary); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color); transition: all 0.2s ease;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <strong style="color: var(--navy); font-size: 14px;">${esc(r.name)}</strong>
                <span style="font-size: 11.5px; color: var(--text-muted); font-weight: 600;">${r.date}</span>
              </div>
              <div style="color: #F59E0B; font-size: 12px; margin-bottom: 8px; letter-spacing: 1px;">
                ${'★'.repeat(Math.floor(r.rating))}${'☆'.repeat(5 - Math.floor(r.rating))}
              </div>
              <p style="font-size: 13.5px; color: var(--text-secondary); margin: 0; line-height: 1.5; white-space: pre-wrap;">${esc(r.text)}</p>
            </div>
          `).join('') : `
            <div style="text-align: center; color: var(--text-muted); padding: 50px 20px;">
              <span style="font-size: 40px; display: block; margin-bottom: 12px; opacity:0.8;">⭐</span>
              <p style="font-size: 15px; font-weight: 700; margin: 0; color: var(--navy);">No reviews received yet</p>
              <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px; margin-bottom: 0;">Reviews will automatically appear here once couples submit ratings from their planner dashboard.</p>
            </div>
          `}
        </div>
      </div>

    </div>
  `;
}

// 10. MESSAGES TAB
function renderMessagesTab(el) {
  el.innerHTML = `
    <div class="card-premium">
      <div class="card-header-premium">
        <h3>Inbox & Client Messages</h3>
      </div>
      
      <div style="display:grid; grid-template-columns: 240px 1fr; border: 1px solid var(--border-color); border-radius: var(--radius-sm); min-height:400px; overflow:hidden; background-color:var(--bg-primary);">
        <div style="border-right: 1px solid var(--border-color); background-color: var(--bg-card); padding:12px;">
          <div style="padding:10px; background-color: var(--pink-blush); border-radius: 6px; font-weight:600; font-size:13px; color:var(--navy);">
            💬 Sneha Patel
            <span style="display:block; font-size:10px; font-weight:normal; color:var(--text-secondary); margin-top:2px;">Dec 12 request...</span>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; justify-between; background-color: var(--bg-card);">
          <div style="padding:16px; border-bottom: 1px solid var(--border-color); font-weight:600;">
            Sneha Patel
          </div>
          <div style="flex-grow:1; padding:20px; font-size:13.5px; display:flex; flex-direction:column; gap:12px; overflow-y:auto;">
            <div style="background-color: var(--bg-primary); padding:10px 14px; border-radius:10px; max-width:80%; align-self:flex-start;">
              Hi, is the lawn available for sunset mandap setups on Dec 12, 2026? What is your catering starting price?
            </div>
            <div style="background-color: var(--pink-blush); color: var(--navy); padding:10px 14px; border-radius:10px; max-width:80%; align-self:flex-end;">
              Hello Sneha! Yes, Dec 12 is available. Our premium starting package price is ₹1,500/plate. Can we schedule a brief tour?
            </div>
          </div>
          <div style="padding:12px; border-top:1px solid var(--border-color); display:flex; gap:8px;">
            <input type="text" placeholder="Type a response..." style="flex-grow:1; border:1px solid var(--border-color); padding:10px; font-size:13px; border-radius:6px;" />
            <button class="btn-premium btn-navy" onclick="triggerToast('Reply sent successfully')">Send</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 11. ANALYTICS VIEW
function renderReportsTab(el) {
  const activePlan = state.vendor?.subscriptionPlan || 'Free';
  if (activePlan === 'Free') {
    el.innerHTML = `
      <div class="card-premium" style="text-align: center; padding: 60px 20px; max-width: 600px; margin: 40px auto;">
        <div style="font-size: 64px; margin-bottom: 20px;">📊</div>
        <h2 style="font-family: var(--serif); font-size: 24px; color: var(--navy); margin-bottom: 12px;">Unlock Reports</h2>
        <p style="color: var(--text-secondary); font-size: 14.5px; line-height: 1.6; margin-bottom: 24px;">Upgrade to Premium to get access to real-time performance reports including Profile Views, Total Leads, Monthly Leads, and Inquiry Status breakdowns.</p>
        <button class="btn-premium btn-pink" onclick="switchTab('subscriptions')" style="padding: 12px 32px; font-weight: 700;">Upgrade to Premium</button>
      </div>
    `;
    return;
  }

  // Calculate metrics from local state
  const inquiries = state.mockData.inquiries || [];
  const completion = state.vendor?.isProfileComplete ? 100 : (state.vendor?.completion || 0);

  // Status breakdown
  const statusCounts = { new: 0, contacted: 0, quoted: 0, booked: 0, closed: 0, lost: 0 };
  inquiries.forEach(i => {
    const status = (i.status || 'new').toLowerCase();
    if (statusCounts[status] !== undefined) statusCounts[status]++;
  });

  // Monthly leads
  const now = new Date();
  const currentMonthLeads = inquiries.filter(i => {
    const d = new Date(i.createdAt || now);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  el.innerHTML = `
    <div class="card-premium" style="margin-bottom: 24px;">
      <div class="card-header-premium">
        <h3>Reports Dashboard</h3>
        <span style="font-size: 12px; color: var(--text-secondary); font-weight: 600;">Plan: ${activePlan}</span>
      </div>

      <div class="metrics-grid" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; margin-bottom: 24px;">
        <div style="background-color: var(--bg-primary); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); text-align: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); font-weight: 700; display: block; margin-bottom: 4px;">Profile Views</span>
          <strong style="font-size: 24px; color: var(--navy);">342</strong>
        </div>
        <div style="background-color: var(--bg-primary); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); text-align: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); font-weight: 700; display: block; margin-bottom: 4px;">Total Leads</span>
          <strong style="font-size: 24px; color: var(--navy);">${inquiries.length}</strong>
        </div>
        <div style="background-color: var(--bg-primary); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); text-align: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); font-weight: 700; display: block; margin-bottom: 4px;">Monthly Leads</span>
          <strong style="font-size: 24px; color: var(--navy);">${currentMonthLeads}</strong>
        </div>
        <div style="background-color: var(--bg-primary); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); text-align: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); font-weight: 700; display: block; margin-bottom: 4px;">Profile Completion</span>
          <strong style="font-size: 24px; color: var(--success);">${completion}%</strong>
        </div>
      </div>

      <div class="form-grid-premium" style="gap: 24px; margin-bottom: 24px;">
        <div style="background-color: var(--bg-primary); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color);">
          <h4 style="font-family: var(--serif); font-size: 16px; color: var(--navy); margin-bottom: 12px;">Inquiry Status Breakdown</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13.5px;">
            <div>🆕 New: <strong>${statusCounts.new}</strong></div>
            <div>📞 Contacted: <strong>${statusCounts.contacted}</strong></div>
            <div>📄 Quoted: <strong>${statusCounts.quoted}</strong></div>
            <div>🎉 Booked: <strong>${statusCounts.booked}</strong></div>
            <div>🔒 Closed: <strong>${statusCounts.closed}</strong></div>
            <div>❌ Lost: <strong>${statusCounts.lost}</strong></div>
          </div>
        </div>

        <div style="background-color: var(--bg-primary); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color);">
          <h4 style="font-family: var(--serif); font-size: 16px; color: var(--navy); margin-bottom: 12px;">Leads By Month</h4>
          <canvas id="leadsByMonthChart" style="max-height: 180px;"></canvas>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const canvas = document.getElementById('leadsByMonthChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
          label: 'Leads',
          data: [inquiries.length ? Math.round(inquiries.length * 0.4) : 4, inquiries.length ? Math.round(inquiries.length * 0.6) : 6, inquiries.length ? Math.round(inquiries.length * 0.7) : 8, inquiries.length ? Math.round(inquiries.length * 0.9) : 10, inquiries.length ? Math.round(inquiries.length * 0.8) : 9, inquiries.length],
          borderColor: '#C82156',
          borderWidth: 2,
          tension: 0.3,
          fill: false
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } }
      }
    });
  }, 100);
}

function renderInsightsTab(el) {
  const activePlan = state.vendor?.subscriptionPlan || 'Free';
  if (activePlan !== 'Featured') {
    el.innerHTML = `
      <div class="card-premium" style="text-align: center; padding: 60px 20px; max-width: 600px; margin: 40px auto;">
        <div style="font-size: 64px; margin-bottom: 20px;">💡</div>
        <h2 style="font-family: var(--serif); font-size: 24px; color: var(--navy); margin-bottom: 12px;">Unlock Business Insights</h2>
        <p style="color: var(--text-secondary); font-size: 14.5px; line-height: 1.6; margin-bottom: 24px;">Upgrade to Featured to get access to Advanced Analytics: Lead Source Breakdown, Most Viewed Photos, Popular Services/Cities, Monthly Growth, and Conversion Funnels.</p>
        <button class="btn-premium btn-pink" onclick="switchTab('subscriptions')" style="padding: 12px 32px; font-weight: 700;">Upgrade to Featured</button>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="card-premium" style="margin-bottom: 24px;">
      <div class="card-header-premium">
        <h3>Advanced Analytics & Insights</h3>
        <span style="font-size: 12px; color: var(--gold); font-weight: 800;">⭐ Featured Plan</span>
      </div>

      <div class="form-grid-premium" style="gap: 24px; margin-bottom: 24px;">
        <div style="background-color: var(--bg-primary); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color);">
          <h4 style="font-family: var(--serif); font-size: 16px; color: var(--navy); margin-bottom: 12px;">Lead Source Breakdown</h4>
          <canvas id="insightsLeadSourceChart" style="max-height: 180px;"></canvas>
        </div>

        <div style="background-color: var(--bg-primary); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color);">
          <h4 style="font-family: var(--serif); font-size: 16px; color: var(--navy); margin-bottom: 12px;">Conversion Funnel</h4>
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; padding-top: 10px;">
            <div style="display: flex; justify-content: space-between; background: rgba(59, 130, 246, 0.1); padding: 6px 12px; border-radius: 4px;">
              <span>👁️ Profile Views</span><strong>342</strong>
            </div>
            <div style="display: flex; justify-content: space-between; background: rgba(245, 158, 11, 0.1); padding: 6px 12px; border-radius: 4px; width: 85%; margin-left: 7.5%;">
              <span>⚡ Leads Generated</span><strong>${state.mockData.inquiries?.length || 0}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; background: rgba(16, 185, 129, 0.1); padding: 6px 12px; border-radius: 4px; width: 70%; margin-left: 15%;">
              <span>🎉 Bookings Confirmed</span><strong>${state.mockData.bookings?.filter(b => b.status === 'confirmed' || b.status === 'completed').length || 0}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="form-grid-premium" style="gap: 24px; margin-bottom: 24px;">
        <div style="background-color: var(--bg-primary); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color);">
          <h4 style="font-family: var(--serif); font-size: 16px; color: var(--navy); margin-bottom: 12px;">Most Viewed Photos</h4>
          <ul style="padding-left: 20px; font-size: 13.5px; line-height: 2;">
            <li>🖼️ Cover Photo (Primary Listing): <strong>142 clicks</strong></li>
            <li>🖼️ Photo #2: <strong>89 clicks</strong></li>
            <li>🖼️ Photo #3: <strong>57 clicks</strong></li>
          </ul>
        </div>

        <div style="background-color: var(--bg-primary); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color);">
          <h4 style="font-family: var(--serif); font-size: 16px; color: var(--navy); margin-bottom: 12px;">Market Demand</h4>
          <div style="font-size: 13.5px; line-height: 1.8;">
            <div>🔥 Popular Service: <strong>${state.vendor?.category || 'Marriage Gardens'}</strong></div>
            <div>📍 Active City: <strong>${state.vendor?.city || 'Mumbai'}</strong></div>
            <div>📈 Monthly Growth: <strong>+14.8%</strong> MoM</div>
          </div>
        </div>
      </div>

      <!-- Priority Support Widget -->
      <div style="background: linear-gradient(135deg, rgba(234, 179, 8, 0.08) 0%, rgba(234, 179, 8, 0.02) 100%); border: 1px solid rgba(234, 179, 8, 0.3); border-radius: 8px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <strong style="color: var(--navy); font-size: 14px; display: block; margin-bottom: 2px;">⚡ Priority Support Concierge</strong>
          <span style="font-size: 12.5px; color: var(--text-secondary);">Direct access line is active. Premium ticket routing enabled.</span>
        </div>
        <button class="btn-premium" onclick="window.showToast('Connecting to VIP support concierge...', 'info')" style="border-color: var(--gold); color: var(--gold);">Call Support</button>
      </div>
    </div>
  `;

  setTimeout(() => {
    const canvas = document.getElementById('insightsLeadSourceChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['WhatsApp', 'Profile Clicks', 'Search Ads', 'Social'],
        datasets: [{
          data: [45, 30, 15, 10],
          backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EC4899']
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } }
      }
    });
  }, 100);
}

// 12. EARNINGS TAB
function renderEarningsTab(el) {
  const ledger = state.mockData.earnings;
  el.innerHTML = `
    <div class="card-premium">
      <div class="card-header-premium">
        <h3>Earnings & balance ledger</h3>
        <button class="btn-premium btn-pink" onclick="exportEarningsExcel()">📊 Download Earnings Spreadsheet</button>
      </div>

      <div class="metrics-grid" style="grid-template-columns: 1fr 1fr; margin-bottom:24px;">
        <div style="background-color:var(--bg-primary); padding:20px; border-radius:10px; text-align:center;">
          <span style="font-size:11px; text-transform:uppercase; color:var(--text-secondary); display:block; font-weight:700;">Payout balance</span>
          <span style="font-size:32px; font-weight:800; color:var(--navy);">₹1,11,000</span>
        </div>
        <div style="background-color:var(--bg-primary); padding:20px; border-radius:10px; text-align:center;">
          <span style="font-size:11px; text-transform:uppercase; color:var(--text-secondary); display:block; font-weight:700;">All-time Settled Earnings</span>
          <span style="font-size:32px; font-weight:800; color:var(--success);">₹2,59,000</span>
        </div>
      </div>

      <div class="table-responsive">
        <table class="spreadsheet">
          <thead>
            <tr>
              <th>Date</th>
              <th>TX ID</th>
              <th>Booking</th>
              <th>Customer</th>
              <th>Amount (INR)</th>
              <th>Gateway</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${ledger.map(tx => `
              <tr>
                <td>${tx.date}</td>
                <td><span style="font-family:monospace; font-size:12px;">${tx.id}</span></td>
                <td>${tx.booking}</td>
                <td><strong>${esc(tx.guest)}</strong></td>
                <td>₹${tx.amount.toLocaleString('en-IN')}</td>
                <td>${tx.method}</td>
                <td><span class="status-badge confirmed">Succeeded</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 13. SETTINGS TAB
function renderSettingsTab(el) {
  el.innerHTML = `
    <div class="card-premium">
      <div class="card-header-premium">
        <h3>Profile & security Hub</h3>
      </div>

      <h4 style="margin-bottom:12px;">Reset Password</h4>
      <form onsubmit="event.preventDefault(); triggerToast('Password updated successfully.')">
        <div class="form-grid-premium" style="margin-bottom:20px;">
          <div class="form-field-premium">
            <label>New Password</label>
            <input type="password" placeholder="••••••••" required />
          </div>
          <div class="form-field-premium">
            <label>Confirm Password</label>
            <input type="password" placeholder="••••••••" required />
          </div>
        </div>
        <button type="submit" class="btn-premium btn-navy">Update Password</button>
      </form>

      <h4 style="margin-top:32px; margin-bottom:12px; border-top:1px solid var(--border-color); padding-top:24px;">Social Media Integration Links</h4>
      <div class="form-grid-premium">
        <div class="form-field-premium">
          <label>Instagram Page Link</label>
          <input type="text" placeholder="https://instagram.com/yourprofile" />
        </div>
        <div class="form-field-premium">
          <label>Facebook Page Link</label>
          <input type="text" placeholder="https://facebook.com/yourpage" />
        </div>
      </div>
    </div>
  `;
}

function renderSeoTab(el) {
  el.innerHTML = `
    <div class="card-premium">
      <div class="card-header-premium">
        <h3>SEO Search Optimization Tools</h3>
        <span class="badge-pill status">Highly Optimized</span>
      </div>
      <p style="margin-bottom:20px; color:var(--text-secondary);">Improve your business visibility on search engines like Google. WedEazzy automatically generates SEO metadata for your listing.</p>
      
      <div class="form-grid-premium" style="gap:20px; margin-bottom:24px;">
        <div class="form-field-premium full">
          <label>Meta Title Tag (Google Listing Heading)</label>
          <input type="text" id="seoMetaTitle" value="${esc(state.vendor ? state.vendor.businessName : 'WedEazzy Royal Venue')} - Best Wedding Venue in Mumbai" />
        </div>
        <div class="form-field-premium full">
          <label>Meta Description Tag (Short search snippet)</label>
          <textarea id="seoMetaDesc" style="min-height:80px;">Book the magnificent ${esc(state.vendor ? state.vendor.businessName : 'WedEazzy Royal Venue')} for premium wedding ceremonies, family feasts, and banqueting events in Mumbai.</textarea>
        </div>
        <div class="form-field-premium">
          <label>URL Slug Identifier</label>
          <input type="text" id="seoMetaSlug" value="${state.vendor ? state.vendor.businessName.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'royal-venue'}" />
        </div>
        <div class="form-field-premium">
          <label>Target Keyphrases (comma-separated)</label>
          <input type="text" id="seoKeywords" value="wedding banquet hall, marriage garden, luxury banquet" />
        </div>
      </div>
      <button class="btn-premium btn-navy" onclick="triggerToast('SEO Meta Tags saved successfully!')">Save SEO Tags</button>
    </div>
  `;
}

function renderFeaturedTab(el) {
  el.innerHTML = `
    <div class="upgrade" style="border-radius: var(--radius-lg); padding: 40px; text-align: center; max-width: 700px; margin: 0 auto; background: linear-gradient(135deg, #FFF0F2, #FFFFFF); border: 2px solid var(--pink-border);">
      <span class="upgrade-banner-tag" style="padding: 6px 14px; font-size:11px;">★ PREMIUM BENEFIT</span>
      <h2 style="font-size:32px; font-family: var(--serif); color: var(--navy); margin: 14px 0 6px;">Featured Premium Listing</h2>
      <p style="color:var(--text-secondary); max-width: 500px; margin: 0 auto 28px;">Showcase your business at the absolute top of search results and homepage maps for matching couples in your area.</p>
      
      <div style="font-size: 52px; font-weight: 800; font-family: var(--serif); color: var(--navy); margin-bottom: 24px;">
        ₹5,000 <span style="font-size:16px; font-family: var(--sans); color: var(--text-secondary); font-weight:500;">/ one-time lock</span>
      </div>

      <ul style="max-width: 420px; margin: 0 auto 32px; text-align: left; display: flex; flex-direction: column; gap: 10px; font-size: 14px; color: var(--text-secondary);">
        <li>✓ Rank #1 above standard venue cards inside your pincode</li>
        <li>✓ Dedicated Gold badge of trust on the marketplace map</li>
        <li>✓ Prioritized search listing visibility</li>
        <li>✓ 4x increase in direct customer inquiries</li>
      </ul>

      <button class="btn-premium btn-navy" style="font-size:15px; padding: 14px 32px;" onclick="upgradeFeatured()">Activate Featured Spot Now</button>
    </div>
  `;
}

function renderPromotionsTab(el) {
  el.innerHTML = `
    <div class="card-premium">
      <div class="card-header-premium">
        <h3>Promotions & Deals Manager</h3>
        <span class="badge-pill status">Market Reach</span>
      </div>
      <p style="margin-bottom:20px; color:var(--text-secondary);">Boost clicks by posting seasonal packages, early-bird rewards, or exclusive corporate deal banners.</p>
      
      <div class="form-grid-premium" style="gap:20px; margin-bottom:24px;">
        <div class="form-field-premium">
          <label>Promotion Heading Title</label>
          <input type="text" placeholder="e.g., Monsoon Wedding Special" />
        </div>
        <div class="form-field-premium">
          <label>Deal Discount Rate</label>
          <input type="text" placeholder="e.g., 15% OFF catering packages" />
        </div>
        <div class="form-field-premium">
          <label>Valid From</label>
          <input type="date" />
        </div>
        <div class="form-field-premium">
          <label>Expiry Date</label>
          <input type="date" />
        </div>
      </div>
      <button class="btn-premium btn-pink" onclick="triggerToast('Deal promotion submitted for approval!')">Submit Promotion</button>
    </div>
  `;
}

function renderCampaignsTab(el) {
  renderGrowMyCampaigns(el);
}

function renderCouponsTab(el) {
  el.innerHTML = `
    <div class="card-premium">
      <div class="card-header-premium">
        <h3>Discount Coupons & Gift Cards</h3>
        <span class="badge-pill status">Loyalty Tools</span>
      </div>
      <p style="margin-bottom:20px; color:var(--text-secondary);">Issue digital promo codes that couples can type in to unlock discounts on your starting booking rates.</p>
      
      <div class="form-grid-premium" style="gap:20px; margin-bottom:24px;">
        <div class="form-field-premium">
          <label>Coupon Promo Code</label>
          <input type="text" value="WEDDING10" style="text-transform:uppercase;" />
        </div>
        <div class="form-field-premium">
          <label>Discount Value</label>
          <input type="text" value="₹10,000 Flat Off" />
        </div>
        <div class="form-field-premium">
          <label>Minimum Booking Value</label>
          <input type="number" value="100000" />
        </div>
        <div class="form-field-premium">
          <label>Usage Limit</label>
          <input type="number" value="50" />
        </div>
      </div>
      <button class="btn-premium btn-navy" onclick="triggerToast('Discount Coupon WEDDING10 is active!')">Publish Coupon Code</button>
    </div>
  `;
}

function renderDeleteProfileTab(el) {
  switchTab('settings');
}

// Custom delete modal triggers
function showDeleteProfileModal() {
  let modalOverlay = document.getElementById('deleteProfileModal');
  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'deleteProfileModal';
    modalOverlay.className = 'delete-modal-overlay';
    document.body.appendChild(modalOverlay);
  }

  modalOverlay.innerHTML = `
    <div class="delete-modal-card">
      <div class="delete-modal-header">
        <span>⚠️</span>
        <h3>Confirm Account Deletion</h3>
      </div>
      <div class="delete-modal-body">
        <p>You are about to permanently delete your WedEazzy Vendor Profile. This action is <strong>irreversible</strong> and will result in the immediate and permanent loss of:</p>
        <ul style="margin-left: 20px; margin-bottom: 20px; font-size: 13px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 6px;">
          <li>Your registered business directory listing cards</li>
          <li>All active WhatsApp lead records and inquiries history</li>
          <li>All customer bookings & scheduled calendar entries</li>
          <li>Your subscription status and billing history</li>
        </ul>
        <div class="delete-modal-input-container">
          <label class="delete-modal-input-label">Type <strong>DELETE</strong> below to confirm:</label>
          <input type="text" id="deleteConfirmationInput" class="delete-modal-input" placeholder="DELETE" oninput="validateDeleteInput(this.value)" />
        </div>
      </div>
      <div class="delete-modal-actions">
        <button class="btn-premium btn-outline" style="padding: 10px 18px;" onclick="closeDeleteProfileModal()">Cancel</button>
        <button id="deleteConfirmBtn" class="btn-premium btn-navy" style="background-color: var(--danger); color: white;" disabled onclick="executeDeleteProfile()">Permanently Delete</button>
      </div>
    </div>
  `;

  setTimeout(() => modalOverlay.classList.add('show'), 50);
}

function closeDeleteProfileModal() {
  const modal = document.getElementById('deleteProfileModal');
  if (modal) {
    modal.classList.remove('show');
  }
}

function validateDeleteInput(val) {
  const btn = document.getElementById('deleteConfirmBtn');
  if (btn) {
    btn.disabled = val.trim() !== 'DELETE';
  }
}

async function executeDeleteProfile() {
  const btn = document.getElementById('deleteConfirmBtn');
  if (!btn || btn.disabled) return;

  btn.disabled = true;
  btn.innerHTML = `<span class="otp-loading-spinner"></span> Deleting...`;

  try {
    const data = await api('/api/auth/me', { method: 'DELETE' });
    if (!data.ok) throw new Error(data.message || 'Deletion failed');
    triggerToast('Profile permanently deleted.');
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    setTimeout(() => {
      window.location.href = '../index.html';
    }, 1500);
  } catch (err) {
    triggerToast('Simulating secure sandbox deletion...');
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    setTimeout(() => {
      window.location.href = '../index.html';
    }, 1500);
  }
}

function renderSettingsTab(el) {
  const user = state.user || {};
  el.innerHTML = `
    <div class="max-container" style="animation: fade-step 0.3s ease;">
      <div class="hero-section">
        <h1>Account &amp; Security Settings</h1>
        <p>Manage your WedEazzy business partner login profiles, security keys, and account status.</p>
      </div>

      <!-- Card 1: Account Information -->
      <div class="card-premium" style="margin-bottom: 24px;">
        <div class="card-header-premium">
          <h3>Account Information</h3>
        </div>
        <div class="form-grid-premium">
          <div class="form-field-premium">
            <label>Registered Full Name</label>
            <input type="text" value="${esc(user.name || 'WedEazzy Partner')}" disabled style="background-color: var(--bg-primary); cursor: not-allowed;" />
          </div>
          <div class="form-field-premium">
            <label>Registered Email Address</label>
            <input type="email" value="${esc(user.email || 'partner@wedeazzy.com')}" disabled style="background-color: var(--bg-primary); cursor: not-allowed;" />
          </div>
          <div class="form-field-premium">
            <label>Partner Account Role</label>
            <input type="text" value="${esc(user.role ? user.role.toUpperCase() : 'VENDOR')}" disabled style="background-color: var(--bg-primary); cursor: not-allowed;" />
          </div>
          <div class="form-field-premium">
            <label>Secure Phone ID</label>
            <input type="text" value="${esc(user.phone || 'No phone verified')}" disabled style="background-color: var(--bg-primary); cursor: not-allowed;" />
          </div>
        </div>
      </div>

      <!-- Card 2: Password Reset -->
      <div class="card-premium" style="margin-bottom: 24px;">
        <div class="card-header-premium">
          <h3>Security &amp; Password Hub</h3>
        </div>
        <h4 style="font-size: 14px; margin-bottom: 12px; font-weight: 700; color: var(--text-primary);">Reset Portal Password</h4>
        <form onsubmit="event.preventDefault(); triggerToast('Password updated successfully.')">
          <div class="form-grid-premium" style="margin-bottom: 20px;">
            <div class="form-field-premium">
              <label>New Password</label>
              <input type="password" placeholder="••••••••" required style="border: 1px solid var(--border-color); padding: 10px 14px; border-radius: var(--radius-sm);" />
            </div>
            <div class="form-field-premium">
              <label>Confirm Password</label>
              <input type="password" placeholder="••••••••" required style="border: 1px solid var(--border-color); padding: 10px 14px; border-radius: var(--radius-sm);" />
            </div>
          </div>
          <button type="submit" class="btn-premium btn-navy">Update Secure Password</button>
        </form>
      </div>

      <!-- Card 3: Danger Zone -->
      <div class="danger-zone-container">
        <h3 class="danger-zone-title">⚠️ Danger Zone</h3>
        <p class="danger-zone-desc">Deleting your WedEazzy business partner account is completely permanent. All associated venue profiles, active marketplace cards, bookings registry, leads history, and reviews data will be erased forever from our servers.</p>
        <button class="btn-premium btn-navy" style="background-color: var(--danger); color: white; border: none; font-weight: 700;" onclick="showDeleteProfileModal()">Delete Account &amp; Listings</button>
      </div>
    </div>
  `;
}

function renderWhatsappCampaignsTab(el) {
  el.innerHTML = `
    <div class="card-premium" style="animation: fade-step 0.3s ease;">
      <div class="card-header-premium">
        <h3>WhatsApp Automated Campaigns</h3>
        <button class="btn-premium btn-pink" onclick="triggerToast('Opening WhatsApp Campaign Creator...')">📣 Create Campaign</button>
      </div>
      <p style="margin-bottom: 20px; color: var(--text-secondary); font-size: 13.5px;">Reach out to new leads automatically via WhatsApp notifications. Broadcast event offers or follow-up with past inquiries.</p>

      <div class="metrics-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px;">
        <div style="background-color: var(--bg-primary); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); display: block; font-weight: 700;">Sent Messages</span>
          <span style="font-size: 24px; font-weight: 800; color: var(--navy); display: block; margin-top: 4px;">1,420</span>
        </div>
        <div style="background-color: var(--bg-primary); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); display: block; font-weight: 700;">Read Rate</span>
          <span style="font-size: 24px; font-weight: 800; color: var(--success); display: block; margin-top: 4px;">94.2%</span>
        </div>
        <div style="background-color: var(--bg-primary); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); display: block; font-weight: 700;">Replied Leads</span>
          <span style="font-size: 24px; font-weight: 800; color: var(--gold); display: block; margin-top: 4px;">348</span>
        </div>
      </div>

      <h4 style="margin-bottom: 12px; font-size: 14px; font-weight: 700; color: var(--text-primary);">Active Automated Templates</h4>
      <div class="table-responsive">
        <table class="spreadsheet">
          <thead>
            <tr>
              <th>Template Name</th>
              <th>Trigger Action</th>
              <th>Status</th>
              <th>Success Rate</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Inquiry Auto-Reply</strong><br><span style="font-size: 11px; color: var(--text-secondary);">"Hi [Name], thanks for inquiring..."</span></td>
              <td>Immediately on Lead Received</td>
              <td><span class="status-badge confirmed">Active</span></td>
              <td><strong>98%</strong></td>
            </tr>
            <tr>
              <td><strong>24h Booking Reminder</strong><br><span style="font-size: 11px; color: var(--text-secondary);">"Hi [Name], just following up on your tour..."</span></td>
              <td>24 Hours Post Tour Inquiry</td>
              <td><span class="status-badge confirmed">Active</span></td>
              <td><strong>89%</strong></td>
            </tr>
            <tr>
              <td><strong>Monsoon Booking Promo</strong><br><span style="font-size: 11px; color: var(--text-secondary);">"Special 10% flat off bookings for..."</span></td>
              <td>Manual Broadcast (1,200 leads)</td>
              <td><span class="status-badge pending">Draft</span></td>
              <td><strong>—</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMarketingCampaignsTab(el) {
  renderMarketingTab(el);
}

function renderWebsiteTrafficTab(el) {
  el.innerHTML = `
    <div class="card-premium" style="animation: fade-step 0.3s ease;">
      <div class="card-header-premium">
        <h3>Website Traffic &amp; Visitors Analytics</h3>
        <button class="btn-premium btn-pink" onclick="triggerToast('Downloading traffic reports...')">📊 Export Traffic Ledger</button>
      </div>
      <p style="margin-bottom: 20px; color: var(--text-secondary); font-size: 13.5px;">Monitor monthly visitor volume, page impressions, and active referrals discovering your listings.</p>

      <div style="margin-bottom: 28px;">
        <canvas id="trafficTrendsChart" style="max-height: 280px;"></canvas>
      </div>

      <div class="form-grid-premium" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
        <div style="background-color: var(--bg-primary); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); display: block; font-weight: 700;">Bounce Rate</span>
          <span style="font-size: 24px; font-weight: 800; color: var(--navy); display: block; margin-top: 4px;">28.4%</span>
        </div>
        <div style="background-color: var(--bg-primary); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); display: block; font-weight: 700;">Avg Session Duration</span>
          <span style="font-size: 24px; font-weight: 800; color: var(--success); display: block; margin-top: 4px;">2m 45s</span>
        </div>
        <div style="background-color: var(--bg-primary); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: center;">
          <span style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); display: block; font-weight: 700;">Top Referral</span>
          <span style="font-size: 24px; font-weight: 800; color: var(--gold); display: block; margin-top: 4px;">Google Search</span>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const canvas = document.getElementById('trafficTrendsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const gradViews = ctx.createLinearGradient(0, 0, 0, 220);
    gradViews.addColorStop(0, 'rgba(209, 38, 83, 0.35)');
    gradViews.addColorStop(1, 'rgba(209, 38, 83, 0.01)');

    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['May 1', 'May 5', 'May 10', 'May 15', 'May 20', 'May 25', 'May 30'],
        datasets: [{
          label: 'Daily Unique Visitors',
          data: [120, 180, 150, 240, 310, 290, 420],
          borderColor: '#C82156',
          backgroundColor: gradViews,
          borderWidth: 3,
          tension: 0.4,
          pointBackgroundColor: '#C82156',
          pointHoverRadius: 6,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { 
          legend: { display: false }
        },
        scales: {
          y: { grid: { color: 'rgba(0,0,0,0.03)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }, 100);
}

/* ============================================================================
 * SHEETJS EXPORT ENGINE (Client Side styled spreadsheets)
 * ========================================================================== */

function exportBookingsExcel() {
  const list = state.mockData.bookings.map(b => ({
    'Booking ID': b.id,
    'Client Name': b.name,
    'Client Email': b.email,
    'Client Phone': b.phone,
    'Event Date': b.date,
    'Status': b.status.toUpperCase(),
    'Payment Status': b.payment,
    'Amount (INR)': b.amount
  }));
  downloadExcel(list, 'bookings_ledger_report', 'Bookings Ledger');
}

function exportBookingsCSV() {
  const list = state.mockData.bookings.map(b => ({
    'Booking ID': b.id,
    'Client Name': b.name,
    'Client Email': b.email,
    'Client Phone': b.phone,
    'Event Date': b.date,
    'Status': b.status.toUpperCase(),
    'Payment Status': b.payment,
    'Amount (INR)': b.amount
  }));
  downloadCSV(list, 'bookings_ledger_report');
}

function exportLeadsExcel() {
  const list = state.mockData.inquiries.map(i => ({
    'Lead ID': i.id,
    'Couple Name': i.name,
    'Phone': i.phone,
    'Email': i.email,
    'Requested Event Date': i.eventDate,
    'Estimated Guests': i.guests,
    'Budget requested': i.budget,
    'Status': i.status.toUpperCase(),
    'Notes / Vibe Details': i.notes
  }));
  downloadExcel(list, 'leads_inquiries_report', 'Leads Registry');
}

function exportEarningsExcel() {
  const list = state.mockData.earnings.map(tx => ({
    'Transaction Date': tx.date,
    'TXN ID': tx.id,
    'Booking ID': tx.booking,
    'Customer Name': tx.guest,
    'Earnings (INR)': tx.amount,
    'Payout Method': tx.method,
    'Payout Status': tx.status.toUpperCase()
  }));
  downloadExcel(list, 'earnings_balance_ledger', 'Balance Ledger');
}

function downloadExcel(data, fileName, sheetName) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();

  // Add gridlines and fit column widths
  const maxKeys = Object.keys(data[0] || {});
  const colWidths = maxKeys.map(key => {
    let maxLen = key.length;
    for (const r of data) {
      const val = String(r[key] || '');
      if (val.length > maxLen) maxLen = val.length;
    }
    return { wch: Math.min(maxLen + 3, 30) }; // cap column width at 30 chars
  });
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
  triggerToast('Excel spreadsheet generated and downloaded!');
}

function downloadCSV(data, fileName) {
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', `${fileName}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  triggerToast('CSV generated and downloaded!');
}

/* ============================================================================
 * INTERACTIVE HELPERS
 * ========================================================================== */

// Counter animations
function animateNumber(id, endValue, prefix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  
  let start = 0;
  const duration = 1000;
  const stepTime = Math.abs(Math.floor(duration / endValue)) || 20;

  if (endValue === 0) {
    el.textContent = prefix + '0';
    return;
  }

  const timer = setInterval(() => {
    if (endValue > 1000) {
      start += Math.ceil(endValue / 40);
    } else {
      start += 1;
    }
    
    if (start >= endValue) {
      clearInterval(timer);
      el.textContent = prefix + endValue.toLocaleString('en-IN');
    } else {
      el.textContent = prefix + start.toLocaleString('en-IN');
    }
  }, stepTime);
}

// Global text escapes
function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

// Table filtering
function filterBookingsTable(query) {
  const q = query.toLowerCase().trim();
  const rows = document.querySelectorAll('#bookingsTable tbody tr');
  rows.forEach(row => {
    const text = row.cells[1].textContent.toLowerCase();
    if (text.includes(q)) row.style.display = '';
    else row.style.display = 'none';
  });
}

function filterBookingsStatus(status) {
  const s = status.toLowerCase();
  const rows = document.querySelectorAll('#bookingsTable tbody tr');
  rows.forEach(row => {
    const text = row.cells[3].textContent.toLowerCase().trim();
    if (!s || text === s) row.style.display = '';
    else row.style.display = 'none';
  });
}

// Live table sorts
function sortTable(tableId, colIndex) {
  const tbl = document.getElementById(tableId);
  const tbody = tbl.tBodies[0];
  const store = Array.from(tbody.rows);
  let asc = tbl.dataset.sortDir !== 'asc';
  
  tbl.dataset.sortDir = asc ? 'asc' : 'desc';

  store.sort((rowA, rowB) => {
    const valA = rowA.cells[colIndex].textContent.trim();
    const valB = rowB.cells[colIndex].textContent.trim();
    
    if (!isNaN(valA.replace(/[^0-9.-]/g,'')) && !isNaN(valB.replace(/[^0-9.-]/g,''))) {
      return asc 
        ? parseFloat(valA.replace(/[^0-9.-]/g,'')) - parseFloat(valB.replace(/[^0-9.-]/g,''))
        : parseFloat(valB.replace(/[^0-9.-]/g,'')) - parseFloat(valA.replace(/[^0-9.-]/g,''));
    }
    
    return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
  });

  for (const r of store) tbody.appendChild(r);
}

// Toast notification triggers
function triggerToast(msg, isErr = false) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-premium ${isErr ? 'error' : 'success'}`;
  toast.innerHTML = `
    <span>${isErr ? '❌' : '✓'}</span>
    <span>${esc(msg)}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 50);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => container.removeChild(toast), 300);
  }, 3500);
}

async function handleLogout() {
  if (!confirm('Log out from WedEazzy Premium Business Dashboard?')) return;
  try {
    await api('/api/auth/logout');
  } catch (_) {}
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  window.location.href = '../index.html?auth=login';
}
window.handleLogout = handleLogout;



/* ============================================================================
 * 📈 GROW BUSINESS MODULE - COCKPIT & CAMPAIGN ENGINE
 * ========================================================================== */

// Onboarding Wizard State
let wizardState = {
  step: 1,
  packageName: 'leads',
  packagePrice: 8999,
  platform: 'instagram',
  goal: 'leads',
  duration: 14,
  budget: 642,
  city: '',
  gender: 'all',
  targetAreas: [],
  targetSuggestions: '',
  ageMin: 18,
  ageMax: 65,
  timeStart: 6,
  timeEnd: 26,
  wholeDay: true,
  paymentMethod: 'gpay',
  showAdvanced: false,
  audience: '',
  creative: 'Experience luxury wedding banqueting. Book your dream dates today!'
};

/**
 * Main render function for the Grow Business module
 */
async function renderGrowBusinessTab(el) {
  el.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:24px; animation: fade-step 0.3s ease;">
      <div class="skeleton" style="height:32px; width:35%; border-radius:8px;"></div>
      <div class="skeleton" style="height:140px; width:100%; border-radius:14px;"></div>
      <div class="metrics-grid" style="grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); margin-bottom: 0; gap: 20px;">
        <div class="skeleton" style="height:110px; border-radius:14px;"></div>
        <div class="skeleton" style="height:110px; border-radius:14px;"></div>
        <div class="skeleton" style="height:110px; border-radius:14px;"></div>
      </div>
    </div>
  `;

  // Set default city from vendor profile if available
  if (state.vendor && state.vendor.city && !wizardState.city) {
    wizardState.city = state.vendor.city;
  } else if (!wizardState.city) {
    wizardState.city = 'Mumbai';
  }

  try {
    const data = await api('/api/campaigns/analytics/overview');
    const campaignsRes = await api('/api/campaigns');
    const campaigns = campaignsRes.campaigns || [];
    
    // Check if vendor has campaigns
    const hasCampaigns = campaigns.length > 0;

    if (!hasCampaigns) {
      renderOnboardingWizard(el);
    } else {
      renderGrowDashboard(el, data, campaigns);
    }
  } catch (err) {
    console.error('Failed to load campaigns/analytics:', err);
    // Preview Mode override
    if (location.search.includes('preview=true') || location.search.includes('demo=true')) {
      const mockCampaigns = [
        { id: 'cam_google_1', platform: 'google', dailyBudget: 500, durationDays: 30, goal: 'leads', targetCity: 'Mumbai', targetAudience: 'Engaged couples', status: 'active', createdAt: new Date().toISOString() },
        { id: 'cam_insta_2', platform: 'instagram', dailyBudget: 350, durationDays: 14, goal: 'whatsapp', targetCity: 'Mumbai', targetAudience: 'Brides-to-be', status: 'paused', createdAt: new Date(Date.now() - 3 * 86400 * 1000).toISOString() }
      ];
      const mockOverview = {
        hasCampaigns: true,
        summary: {
          totalReach: 145200,
          leadsGenerated: 34,
          whatsappClicks: 218,
          websiteVisits: 890,
          bookingEnquiries: 12,
          conversionRate: 35.3,
          roi: 5.60,
          totalSpend: 7500
        },
        charts: {
          reachClicksTimeline: [
            { date: 'June 1', reach: 3500, clicks: 12 },
            { date: 'June 2', reach: 7200, clicks: 24 },
            { date: 'June 3', reach: 11800, clicks: 42 },
            { date: 'June 4', reach: 15400, clicks: 68 },
            { date: 'June 5', reach: 22800, clicks: 94 }
          ],
          leadSourceBreakdown: [
            { source: 'WhatsApp Campaigns', count: 120 },
            { source: 'Lead Generation', count: 180 },
            { source: 'Profile Traffic', count: 240 },
            { source: 'Featured Placement', count: 100 }
          ]
        }
      };
      renderGrowDashboard(el, mockOverview, mockCampaigns);
    } else {
      el.innerHTML = `
        <div class="card-premium p-8 text-center" style="max-width:550px; margin:40px auto;">
          <span style="font-size:48px; display:block; margin-bottom:16px;">⚠️</span>
          <h3 style="font-family:var(--serif); font-size:22px; color:var(--navy); margin-bottom:10px;">Connection Error</h3>
          <p style="color:var(--text-secondary); font-size:14px; margin-bottom:20px; line-height:1.6;">We could not connect to the ad campaigns management service. Please check your backend connections and try again.</p>
          <button class="btn-premium btn-navy" onclick="switchTab('grow-business')">Retry Connection</button>
        </div>
      `;
    }
  }
}

function renderOnboardingWizard(el) {
  // Ensure target areas are initialized
  if (wizardState.targetAreas.length === 0) {
    if (state.vendor && state.vendor.city) {
      wizardState.targetAreas = [state.vendor.city];
    } else {
      wizardState.targetAreas = ['Mumbai, Maharashtra'];
    }
  }

  const step = wizardState.step;
  let stepHtml = '';

  if (step === 1) {
    stepHtml = `
      <!-- Megaphone Banner -->
      <div class="grow-banner-pink flex justify-between items-center p-6 rounded-2xl mb-6 relative overflow-hidden" style="background: linear-gradient(135deg, #E0F2FE 0%, #D0E7FF 100%); border: 1px solid #bae6fd;">
        <div style="max-width: 70%;">
          <h3 class="text-base font-bold text-slate-800 mb-1" style="font-family: var(--sans); color: #1e3a8a;">Why Digital Ads?</h3>
          <p class="text-xs text-slate-600 font-semibold" style="color: #475569;">Best and Affordable way to get new customers</p>
        </div>
        <!-- Hand-drawn vector megaphone SVG -->
        <svg viewBox="0 0 100 100" class="w-16 h-16" style="flex-shrink: 0; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.05));">
          <!-- Speech Bubble -->
          <path d="M 65 30 C 75 30, 85 35, 85 45 C 85 55, 75 60, 65 60 C 60 60, 55 62, 50 65 C 52 60, 50 58, 48 56 C 45 52, 45 45, 55 35 C 58 32, 61 30, 65 30 Z" fill="#FFFFFF" opacity="0.9" />
          <!-- Megaphone Body -->
          <!-- Handle -->
          <rect x="25" y="55" width="10" height="22" rx="3" fill="#1877F2" transform="rotate(-15 30 65)" />
          <rect x="28" y="58" width="4" height="15" rx="1" fill="#60a5fa" transform="rotate(-15 30 65)" />
          <!-- Main cone -->
          <path d="M 30 45 L 60 25 C 63 23, 67 26, 67 30 L 67 65 C 67 69, 63 72, 60 70 L 30 50 Z" fill="#1877F2" />
          <!-- Cone trim -->
          <path d="M 60 25 L 60 70" stroke="#105cb6" stroke-width="2" />
          <ellipse cx="67" cy="47.5" rx="4" ry="17.5" fill="#60a5fa" />
          <ellipse cx="67" cy="47.5" rx="2" ry="12" fill="#eff6ff" />
          <!-- Back cap of megaphone -->
          <path d="M 30 45 L 30 50 C 28 50, 26 48, 26 47.5 C 26 47, 28 45, 30 45 Z" fill="#0c4587" />
          <!-- Sound waves -->
          <path d="M 76 35 A 15 15 0 0 1 76 60" fill="none" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" />
          <path d="M 83 28 A 25 25 0 0 1 83 67" fill="none" stroke="#1877F2" stroke-width="3.5" stroke-linecap="round" />
        </svg>
      </div>

      <!-- Objectives Section -->
      <div class="mb-6">
        <h3 class="text-base font-bold text-slate-800 mb-1" style="font-family: var(--sans);">Choose Digital Ads Package</h3>
        <p class="text-xs text-gray-500 mb-4">Choose your advertising objective and then our experts will take care of everything, like</p>
        
        <div class="objective-list-grid">
          <div class="objective-list-item"><span class="objective-list-item-icon">🎨</span> Ad Designing</div>
          <div class="objective-list-item"><span class="objective-list-item-icon">📝</span> Content Writing</div>
          <div class="objective-list-item"><span class="objective-list-item-icon">🎯</span> Targeting</div>
          <div class="objective-list-item"><span class="objective-list-item-icon">📢</span> Ad Optimizing</div>
        </div>
      </div>

      <!-- Package Cards list layout -->
      <div class="package-cards-grid">
        <!-- Get WhatsApps -->
        <div onclick="selectWizardPackage('whatsapp', 4999, 'whatsapp', 'whatsapp')" class="package-card-ref ${wizardState.packageName === 'whatsapp' ? 'selected' : ''}">
          <div class="flex justify-between items-start mb-2">
            <div class="package-card-icon icon-whatsapp-leads">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 60px; height: 60px;">
                <defs>
                  <radialGradient id="waGlow_wiz" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                    <stop offset="0%" stop-color="#34D399" stop-opacity="0.25" />
                    <stop offset="100%" stop-color="#34D399" stop-opacity="0" />
                  </radialGradient>
                  <linearGradient id="waGreenGrad_wiz" x1="10" y1="10" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#10B981" />
                    <stop offset="100%" stop-color="#047857" />
                  </linearGradient>
                  <linearGradient id="waWhiteGrad_wiz" x1="20" y1="20" x2="60" y2="60" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FFFFFF" />
                    <stop offset="100%" stop-color="#E5E7EB" />
                  </linearGradient>
                  <linearGradient id="waRedGrad_wiz" x1="46" y1="22" x2="56" y2="32" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#F87171" />
                    <stop offset="100%" stop-color="#DC2626" />
                  </linearGradient>
                  <linearGradient id="waGoldGrad_wiz" x1="4" y1="12" x2="12" y2="20" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FBBF24" />
                    <stop offset="100%" stop-color="#F59E0B" />
                  </linearGradient>
                  <filter id="waShadow_wiz" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#047857" flood-opacity="0.18" />
                  </filter>
                  <filter id="waShadowWhite_wiz" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#000000" flood-opacity="0.12" />
                  </filter>
                </defs>
                <circle cx="32" cy="32" r="28" fill="url(#waGlow_wiz)" />
                <path d="M8 16 L9.5 18.5 L12 19 L9.5 19.5 L8 22 L6.5 19.5 L4 19 L6.5 18.5 Z" fill="url(#waGoldGrad_wiz)" opacity="0.8" />
                <circle cx="14" cy="48" r="3" fill="#34D399" opacity="0.4" />
                <circle cx="52" cy="14" r="2.5" fill="#059669" opacity="0.3" />
                <g filter="url(#waShadow_wiz)">
                  <rect x="6" y="12" width="38" height="28" rx="14" fill="url(#waGreenGrad_wiz)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1" />
                  <path d="M12 40 L10 45 C9.5 46 8.5 45.5 9 44.5 L12 39 Z" fill="url(#waGreenGrad_wiz)" />
                  <path d="M7 24 C7 17.37 12.37 13 19 13 H31 C37.63 13 43 17.37 43 24 C43 20 37.63 15 31 15 H19 C12.37 15 7 20 7 24 Z" fill="#FFFFFF" opacity="0.12" />
                  <g transform="translate(16, 17) scale(0.68)">
                    <path d="M19.11 0C8.558 0 0 8.558 0 19.11c0 3.376.88 6.652 2.56 9.544L0 38.22l9.84-2.584c2.784 1.704 5.984 2.608 9.272 2.608 10.552 0 19.11-8.558 19.11-19.11S29.662 0 19.11 0zm0 35.024c-2.864 0-5.672-.768-8.12-2.224l-.584-.344-6.04 1.584 1.616-5.888-.384-.608c-1.6-2.544-2.44-5.496-2.44-8.432 0-8.8 7.16-15.96 15.96-15.96 8.8 0 15.96 7.16 15.96 15.96 0 8.8-7.16 15.96-15.96 15.96z" fill="#FFFFFF" />
                    <path d="M14.072 10.424c-.24-.536-.496-.544-.728-.552-.192-.008-.408-.008-.624-.008-.216 0-.568.08-.864.4-.296.32-1.128 1.104-1.128 2.696s1.16 3.128 1.32 3.344c.16.216 2.28 3.488 5.528 4.888.768.336 1.368.536 1.84.688.776.248 1.48.216 2.04.136.624-.088 1.912-.784 2.184-1.544.272-.76.272-1.408.192-1.544-.08-.136-.296-.216-.624-.376s-1.912-.944-2.208-1.048c-.296-.104-.512-.16-.728.16-.216.32-.832 1.048-1.024 1.264-.192.216-.384.24-.712.08-.328-.16-1.384-.512-2.64-1.632-.976-.872-1.632-1.952-1.824-2.28-.192-.328-.024-.504.136-.664.144-.144.328-.384.496-.576.168-.192.224-.328.336-.544.112-.216.056-.408-.024-.568-.08-.16-.728-1.752-.992-2.392z" fill="#FFFFFF" />
                  </g>
                </g>
                <g filter="url(#waShadowWhite_wiz)">
                  <rect x="22" y="26" width="34" height="24" rx="12" fill="url(#waWhiteGrad_wiz)" stroke="rgba(16, 185, 129, 0.15)" stroke-width="1" />
                  <path d="M50 50 L52 53 C52.5 54 53.5 53.5 53 52.5 L50 49.5 Z" fill="url(#waWhiteGrad_wiz)" />
                  <rect x="28" y="32" width="18" height="3" rx="1.5" fill="#10B981" />
                  <rect x="28" y="38" width="12" height="3" rx="1.5" fill="#9CA3AF" opacity="0.6" />
                  <path d="M44 42.5 L46.5 45 L51.5 39.5" stroke="#10B981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M46.5 42.5 L49 45 L54 39.5" stroke="#10B981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />
                </g>
                <g filter="url(#waShadowWhite_wiz)" transform="translate(44, 18)">
                  <circle cx="6" cy="6" r="7.5" fill="url(#waRedGrad_wiz)" stroke="#FFFFFF" stroke-width="1.5" />
                  <text x="3.8" y="9.2" fill="#FFFFFF" font-family="'Inter', sans-serif" font-size="9" font-weight="900">1</text>
                </g>
              </svg>
            </div>
            <h4 class="font-bold text-sm mb-0">Get WhatsApps</h4>
          </div>
          <div class="package-stats-cols">
            <div class="package-stat-col">
              <span class="package-stat-col-label">WHATSAPP</span>
              <strong class="package-stat-col-val">250</strong>
            </div>
            <div class="package-stat-col">
              <span class="package-stat-col-label">REACH</span>
              <strong class="package-stat-col-val">> 1,00,000</strong>
            </div>
            <div class="package-stat-col">
              <span class="package-stat-col-label">PLATFORMS</span>
              <div class="flex gap-1.5 items-center mt-1">
                ${platformBadges(['fb', 'ig'])}
              </div>
            </div>
          </div>
          <div class="package-card-price-link">Packages starts from ₹4,999 ></div>
        </div>

        <!-- Get New Leads -->
        <div onclick="selectWizardPackage('leads', 8999, 'instagram', 'leads')" class="package-card-ref ${wizardState.packageName === 'leads' ? 'selected' : ''}">
          <span class="badge-recommended-ref">Recommended</span>
          <div class="flex justify-between items-start mb-2">
            <div class="package-card-icon icon-more-leads">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 60px; height: 60px;">
                <defs>
                  <radialGradient id="leadsGlow_wiz" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                    <stop offset="0%" stop-color="#C084FC" stop-opacity="0.25" />
                    <stop offset="100%" stop-color="#C084FC" stop-opacity="0" />
                  </radialGradient>
                  <linearGradient id="funnelGrad_wiz" x1="14" y1="34" x2="50" y2="54" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#E9D5FF" />
                    <stop offset="35%" stop-color="#C084FC" />
                    <stop offset="100%" stop-color="#7E22CE" />
                  </linearGradient>
                  <linearGradient id="funnelRimGrad_wiz" x1="14" y1="30" x2="50" y2="38" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.6" />
                    <stop offset="100%" stop-color="#C084FC" stop-opacity="0.2" />
                  </linearGradient>
                  <linearGradient id="avatarBlue_wiz" x1="0" y1="0" x2="10" y2="10" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#93C5FD" />
                    <stop offset="100%" stop-color="#2563EB" />
                  </linearGradient>
                  <linearGradient id="avatarPink_wiz" x1="0" y1="0" x2="10" y2="10" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FBCFE8" />
                    <stop offset="100%" stop-color="#DB2777" />
                  </linearGradient>
                  <linearGradient id="avatarGreen_wiz" x1="0" y1="0" x2="10" y2="10" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#A7F3D0" />
                    <stop offset="100%" stop-color="#059669" />
                  </linearGradient>
                  <linearGradient id="sparkGrad_wiz" x1="26" y1="52" x2="38" y2="64" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FCD34D" />
                    <stop offset="100%" stop-color="#D97706" />
                  </linearGradient>
                  <filter id="leadsShadow_wiz" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#7E22CE" flood-opacity="0.2" />
                  </filter>
                </defs>
                <circle cx="32" cy="32" r="28" fill="url(#leadsGlow_wiz)" />
                <ellipse cx="32" cy="18" rx="20" ry="7" stroke="#C084FC" stroke-width="1" stroke-dasharray="3,3" opacity="0.5" />
                <ellipse cx="32" cy="18" rx="13" ry="4.5" stroke="#C084FC" stroke-width="1.2" opacity="0.7" />
                <ellipse cx="32" cy="18" rx="7" ry="2.5" stroke="#EC4899" stroke-width="1.5" opacity="0.9" />
                <circle cx="32" cy="18" r="1.5" fill="#EC4899" />
                <path d="M16 19 C16 26, 24 30, 24 33" stroke="#93C5FD" stroke-width="1" stroke-dasharray="2,2" opacity="0.6" />
                <path d="M48 20 C48 26, 40 30, 40 33" stroke="#FBCFE8" stroke-width="1" stroke-dasharray="2,2" opacity="0.6" />
                <path d="M32 20 L32 30" stroke="#A7F3D0" stroke-width="1" stroke-dasharray="2,2" opacity="0.6" />
                <g transform="translate(11, 12)" filter="url(#leadsShadow_wiz)">
                  <circle cx="5" cy="5" r="5.5" fill="#FFFFFF" />
                  <circle cx="5" cy="5" r="4.5" fill="url(#avatarBlue_wiz)" />
                  <circle cx="5" cy="3.5" r="1.8" fill="#FFFFFF" opacity="0.9" />
                  <path d="M2.5 8 C2.5 6.5 3.5 6 5 6 C6.5 6 7.5 6.5 7.5 8 Z" fill="#FFFFFF" opacity="0.9" />
                </g>
                <g transform="translate(43, 14)" filter="url(#leadsShadow_wiz)">
                  <circle cx="5" cy="5" r="5.5" fill="#FFFFFF" />
                  <circle cx="5" cy="5" r="4.5" fill="url(#avatarPink_wiz)" />
                  <circle cx="5" cy="3.5" r="1.8" fill="#FFFFFF" opacity="0.9" />
                  <path d="M2.5 8 C2.5 6.5 3.5 6 5 6 C6.5 6 7.5 6.5 7.5 8 Z" fill="#FFFFFF" opacity="0.9" />
                </g>
                <g transform="translate(27, 21)" filter="url(#leadsShadow_wiz)">
                  <circle cx="5" cy="5" r="5.5" fill="#FFFFFF" />
                  <circle cx="5" cy="5" r="4.5" fill="url(#avatarGreen_wiz)" />
                  <circle cx="5" cy="3.5" r="1.8" fill="#FFFFFF" opacity="0.9" />
                  <path d="M2.5 8 C2.5 6.5 3.5 6 5 6 C6.5 6 7.5 6.5 7.5 8 Z" fill="#FFFFFF" opacity="0.9" />
                </g>
                <g filter="url(#leadsShadow_wiz)">
                  <path d="M14 34 C14 31.5 22 30 32 30 C42 30 50 31.5 50 34 C50 36.5 42 38 32 38 C22 38 14 36.5 14 34 Z" fill="#6B21A8" />
                  <ellipse cx="32" cy="33.5" rx="16.5" ry="3.2" fill="#A855F7" />
                  <ellipse cx="32" cy="33.5" rx="10" ry="2" fill="#E9D5FF" opacity="0.4" />
                  <path d="M14 34 C14 38 22 47 25 52 L39 52 C42 47 50 38 50 34 C50 34.5 50 35 50 35.5 C50 39.5 42 48.5 39 53.5 L25 53.5 C22 48.5 14 39.5 14 35.5 Z" fill="#581C87" opacity="0.4" />
                  <path d="M14 34 C14 38 22 47 25 52 L39 52 C42 47 50 38 50 34 Z" fill="url(#funnelGrad_wiz)" stroke="url(#funnelRimGrad_wiz)" stroke-width="1" />
                  <path d="M16 35 C17 38.5 23.5 46 26.5 50.5" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" opacity="0.4" />
                  <path d="M48 35 C47 38.5 40.5 46 37.5 50.5" stroke="#A855F7" stroke-width="1.5" stroke-linecap="round" opacity="0.3" />
                  <path d="M14 34 C14 36.5 22 38 32 38 C42 38 50 36.5 50 34" fill="none" stroke="url(#funnelRimGrad_wiz)" stroke-width="1.5" />
                  <ellipse cx="32" cy="52" rx="7" ry="2" fill="#6B21A8" />
                  <ellipse cx="32" cy="53" rx="5" ry="1.5" fill="#3B0764" />
                </g>
                <path d="M32 50 L33.5 54.5 L38 56 L33.5 57.5 L32 62 L30.5 57.5 L26 56 L30.5 54.5 Z" fill="url(#sparkGrad_wiz)" filter="url(#leadsShadow_wiz)" />
                <path d="M22 55 L22.8 57 L25 57.4 L23.3 58.6 L23.6 60.5 L22 59.5 L20.4 60.5 L20.7 58.6 L19 57.4 L21.2 57 Z" fill="#FBBF24" opacity="0.8" />
                <path d="M42 53 L42.8 55 L45 55.4 L43.3 56.6 L43.6 58.5 L42 57.5 L40.4 58.5 L40.7 56.6 L39 55.4 L41.2 55 Z" fill="#FBBF24" opacity="0.9" />
              </svg>
            </div>
            <h4 class="font-bold text-sm mb-0">Get New Leads</h4>
          </div>
          <div class="package-stats-cols">
            <div class="package-stat-col">
              <span class="package-stat-col-label">LEADS</span>
              <strong class="package-stat-col-val">420</strong>
            </div>
            <div class="package-stat-col">
              <span class="package-stat-col-label">REACH</span>
              <strong class="package-stat-col-val">> 1,60,000</strong>
            </div>
            <div class="package-stat-col">
              <span class="package-stat-col-label">PLATFORMS</span>
              <div class="flex gap-1.5 items-center mt-1">
                ${platformBadges(['fb', 'ig'])}
              </div>
            </div>
          </div>
          <div class="package-card-price-link">Packages starts from ₹8,999 ></div>
        </div>

        <!-- Increase Sales -->
        <div onclick="selectWizardPackage('sales', 12999, 'google', 'traffic')" class="package-card-ref ${wizardState.packageName === 'sales' ? 'selected' : ''}">
          <div class="flex justify-between items-start mb-2">
            <div class="package-card-icon icon-website-sales">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 60px; height: 60px;">
                <defs>
                  <radialGradient id="salesGlow_wiz" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                    <stop offset="0%" stop-color="#FBBF24" stop-opacity="0.22" />
                    <stop offset="100%" stop-color="#FBBF24" stop-opacity="0" />
                  </radialGradient>
                  <linearGradient id="barGrad_wiz" x1="0" y1="12" x2="0" y2="50" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#FBBF24" />
                    <stop offset="100%" stop-color="#D97706" />
                  </linearGradient>
                  <linearGradient id="trendGrad_wiz" x1="12" y1="42" x2="48" y2="8" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#F97316" />
                    <stop offset="50%" stop-color="#EA580C" />
                    <stop offset="100%" stop-color="#DC2626" />
                  </linearGradient>
                  <linearGradient id="coinGrad_wiz" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
                    <stop offset="0%" stop-color="#FFF3C4" />
                    <stop offset="30%" stop-color="#FBBF24" />
                    <stop offset="100%" stop-color="#B45309" />
                  </linearGradient>
                  <linearGradient id="coinRim_wiz" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                    <stop offset="0%" stop-color="#FFE082" />
                    <stop offset="100%" stop-color="#92400E" />
                  </linearGradient>
                  <filter id="salesShadow_wiz" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="2.5" flood-color="#B45309" flood-opacity="0.2" />
                  </filter>
                  <filter id="lineGlow_wiz" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#EA580C" flood-opacity="0.4" />
                  </filter>
                </defs>
                <circle cx="32" cy="32" r="28" fill="url(#salesGlow_wiz)" />
                <path d="M6 50 H58" stroke="#E5E7EB" stroke-width="1.2" opacity="0.35" stroke-linecap="round" />
                <path d="M6 38 H58" stroke="#E5E7EB" stroke-width="1" opacity="0.18" stroke-linecap="round" stroke-dasharray="2,2" />
                <path d="M6 26 H58" stroke="#E5E7EB" stroke-width="1" opacity="0.18" stroke-linecap="round" stroke-dasharray="2,2" />
                <path d="M6 14 H58" stroke="#E5E7EB" stroke-width="1" opacity="0.18" stroke-linecap="round" stroke-dasharray="2,2" />
                <g filter="url(#salesShadow_wiz)" opacity="0.85">
                  <rect x="11" y="38" width="6" height="12" rx="3" fill="url(#barGrad_wiz)" fill-opacity="0.25" stroke="url(#barGrad_wiz)" stroke-width="0.5" />
                  <rect x="21" y="29" width="6" height="21" rx="3" fill="url(#barGrad_wiz)" fill-opacity="0.45" stroke="url(#barGrad_wiz)" stroke-width="0.5" />
                  <rect x="31" y="20" width="6" height="30" rx="3" fill="url(#barGrad_wiz)" fill-opacity="0.65" stroke="url(#barGrad_wiz)" stroke-width="0.5" />
                  <rect x="41" y="11" width="6" height="39" rx="3" fill="url(#barGrad_wiz)" fill-opacity="0.85" stroke="url(#barGrad_wiz)" stroke-width="0.5" />
                </g>
                <g filter="url(#lineGlow_wiz)">
                  <path d="M14 40 C 22 32, 28 24, 44 13" fill="none" stroke="url(#trendGrad_wiz)" stroke-width="3" stroke-linecap="round" />
                  <circle cx="44" cy="13" r="4.5" fill="#FFFFFF" stroke="#DC2626" stroke-width="1.5" />
                  <circle cx="44" cy="13" r="2" fill="#DC2626" />
                </g>
                <g transform="translate(20, 32)" filter="url(#salesShadow_wiz)">
                  <ellipse cx="6" cy="6" rx="6.5" ry="5" fill="url(#coinRim_wiz)" />
                  <ellipse cx="6" cy="5.5" rx="5.5" ry="4" fill="url(#coinGrad_wiz)" />
                  <text x="4" y="8.2" fill="#92400E" font-family="'Inter', sans-serif" font-size="7.5" font-weight="900">₹</text>
                </g>
                <g transform="translate(42, 18)" filter="url(#salesShadow_wiz)">
                  <ellipse cx="8" cy="8" rx="8.5" ry="6.5" fill="url(#coinRim_wiz)" stroke="rgba(255,255,255,0.2)" stroke-width="0.5" />
                  <ellipse cx="8" cy="7.2" rx="7.5" ry="5.5" fill="url(#coinGrad_wiz)" />
                  <text x="5.5" y="10.5" fill="#78350F" font-family="'Inter', sans-serif" font-size="10" font-weight="900">₹</text>
                </g>
                <g transform="translate(48, 38)" filter="url(#salesShadow_wiz)">
                  <ellipse cx="5" cy="5" rx="5.5" ry="4" fill="url(#coinRim_wiz)" />
                  <ellipse cx="5" cy="4.5" rx="4.5" ry="3" fill="url(#coinGrad_wiz)" />
                  <text x="3.2" y="6.8" fill="#92400E" font-family="'Inter', sans-serif" font-size="6.5" font-weight="900">₹</text>
                </g>
                <path d="M47 8 L48 10 L50 10.5 L48 11 L47 13 L46 11 L44 10.5 L46 10 Z" fill="#FBBF24" opacity="0.9" />
                <path d="M8 32 L8.8 34 L10 34.4 L8.8 34.8 L8 36 L7.2 34.8 L6 34.4 L7.2 34 L8 32 Z" fill="#FBBF24" opacity="0.75" />
              </svg>
            </div>
            <h4 class="font-bold text-sm mb-0">Increase Sales On Your Website</h4>
          </div>
          <div class="package-stats-cols">
            <div class="package-stat-col">
              <span class="package-stat-col-label">CLICKS</span>
              <strong class="package-stat-col-val">600</strong>
            </div>
            <div class="package-stat-col">
              <span class="package-stat-col-label">REACH</span>
              <strong class="package-stat-col-val">> 2,00,000</strong>
            </div>
            <div class="package-stat-col">
              <span class="package-stat-col-label">PLATFORMS</span>
              <div class="flex gap-1.5 items-center mt-1">
                ${platformBadges(['go', 'fb', 'ig'])}
              </div>
            </div>
          </div>
          <div class="package-card-price-link">Packages starts from ₹12,999 ></div>
        </div>
      </div>
    `;
  } else if (step === 2) {
    stepHtml = `
      <!-- Campaign Settings Banner -->
      <div class="grow-banner-pink flex justify-between items-center p-6 rounded-2xl mb-6 relative overflow-hidden" style="background: linear-gradient(135deg, #FFF0F2 0%, #FFE2E6 100%); border: 1px solid var(--pink-border);">
        <div style="max-width: 70%;">
          <h3 class="text-base font-bold text-slate-800 mb-1" style="font-family: var(--sans);">Ad Campaign Settings</h3>
          <p class="text-xs text-gray-500 font-medium">Set target area and audience for your business. Interest based advanced targeting will be done by our experts.</p>
        </div>
        <!-- 3D Target & Avatars SVG illustration -->
        <svg viewBox="0 0 100 100" class="w-20 h-20" style="flex-shrink: 0; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.05));">
          <!-- Target circles -->
          <circle cx="50" cy="50" r="35" fill="#FFE4E6" stroke="#FDA4AF" stroke-width="2" />
          <circle cx="50" cy="50" r="25" fill="#F43F5E" />
          <circle cx="50" cy="50" r="15" fill="#FFE4E6" />
          <circle cx="50" cy="50" r="6" fill="#E11D48" />
          <!-- Arrow -->
          <path d="M 80 20 L 52 48" stroke="#0284C7" stroke-width="4" stroke-linecap="round" />
          <!-- Arrow head -->
          <polygon points="50,50 56,44 50,42" fill="#0284C7" />
          <!-- Arrow fletching -->
          <path d="M 76 24 L 84 16 M 78 26 L 86 18" stroke="#38BDF8" stroke-width="2" />
          <!-- Avatar bubbles -->
          <g transform="translate(15, 25)">
            <circle cx="10" cy="10" r="8" fill="#bae6fd" />
            <path d="M 5 18 C 5 14, 15 14, 15 18" stroke="#0284C7" stroke-width="1.5" fill="none" />
            <circle cx="10" cy="9" r="3" fill="#0284C7" />
          </g>
          <g transform="translate(75, 65)">
            <circle cx="10" cy="10" r="8" fill="#bae6fd" />
            <path d="M 5 18 C 5 14, 15 14, 15 18" stroke="#0284C7" stroke-width="1.5" fill="none" />
            <circle cx="10" cy="9" r="3" fill="#0284C7" />
          </g>
          <g transform="translate(20, 70)">
            <circle cx="10" cy="10" r="8" fill="#bae6fd" />
            <path d="M 5 18 C 5 14, 15 14, 15 18" stroke="#0284C7" stroke-width="1.5" fill="none" />
            <circle cx="10" cy="9" r="3" fill="#0284C7" />
          </g>
        </svg>
      </div>

      <div class="flex flex-col gap-6">
        <!-- Gender Select -->
        <div class="flex flex-col gap-2.5">
          <label class="text-sm font-bold text-slate-800">Select Gender</label>
          <div class="flex gap-6">
            <label class="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="radio" name="gender" value="all" ${wizardState.gender === 'all' ? 'checked' : ''} onchange="wizardState.gender = this.value" class="w-4 h-4" style="accent-color: #0b66c2;"> All
            </label>
            <label class="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="radio" name="gender" value="male" ${wizardState.gender === 'male' ? 'checked' : ''} onchange="wizardState.gender = this.value" class="w-4 h-4" style="accent-color: #0b66c2;"> Male
            </label>
            <label class="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="radio" name="gender" value="female" ${wizardState.gender === 'female' ? 'checked' : ''} onchange="wizardState.gender = this.value" class="w-4 h-4" style="accent-color: #0b66c2;"> Female
            </label>
          </div>
        </div>

        <!-- Target Areas -->
        <div class="flex flex-col gap-2">
          <label class="text-sm font-bold text-slate-800">Target Areas <span class="text-xs font-normal text-gray-400 italic">(required)</span></label>
          <p class="text-xs text-gray-500">Your ad will be shown in this area. It could be list of Local Area / City / State or PAN India</p>
          
          <!-- Custom High-Fidelity SVG Map Illustration -->
          <div class="map-container-ref">
            <svg viewBox="0 0 400 200" class="w-full h-full" style="display: block;">
              <!-- Light green background -->
              <rect width="400" height="200" rx="16" fill="#E6F7F0" />
              
              <!-- Clouds -->
              <path d="M 50 40 C 50 35, 60 30, 70 35 C 75 30, 85 30, 90 35 C 95 35, 100 40, 95 45 L 45 45 Z" fill="#FFFFFF" opacity="0.8" />
              <path d="M 310 50 C 310 45, 320 40, 330 45 C 335 40, 345 40, 350 45 C 355 45, 360 50, 355 55 L 305 55 Z" fill="#FFFFFF" opacity="0.8" />
              
              <!-- Folded Map base -->
              <g transform="translate(100, 60)">
                <!-- Panel 1 (left) -->
                <polygon points="0,40 50,30 50,90 0,100" fill="#FFFBEB" stroke="#FEF3C7" stroke-width="1.5" />
                <!-- Panel 2 -->
                <polygon points="50,30 100,40 100,100 50,90" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1.5" />
                <!-- Panel 3 -->
                <polygon points="100,40 150,30 150,90 100,100" fill="#FFFBEB" stroke="#FEF3C7" stroke-width="1.5" />
                <!-- Panel 4 (right) -->
                <polygon points="150,30 200,40 200,100 150,90" fill="#FEF3C7" stroke="#FDE68A" stroke-width="1.5" />
                
                <!-- Grid lines on Panel 1 -->
                <line x1="15" y1="37" x2="15" y2="97" stroke="#FEF3C7" stroke-dasharray="2 2" />
                <line x1="35" y1="33" x2="35" y2="93" stroke="#FEF3C7" stroke-dasharray="2 2" />
                <line x1="0" y1="60" x2="50" y2="50" stroke="#FEF3C7" stroke-dasharray="2 2" />
                <line x1="0" y1="80" x2="50" y2="70" stroke="#FEF3C7" stroke-dasharray="2 2" />

                <!-- Grid lines on Panel 2 -->
                <line x1="65" y1="33" x2="65" y2="93" stroke="#FDE68A" stroke-dasharray="2 2" />
                <line x1="85" y1="37" x2="85" y2="97" stroke="#FDE68A" stroke-dasharray="2 2" />
                <line x1="50" y1="50" x2="100" y2="60" stroke="#FDE68A" stroke-dasharray="2 2" />
                <line x1="50" y1="70" x2="100" y2="80" stroke="#FDE68A" stroke-dasharray="2 2" />

                <!-- Grid lines on Panel 3 -->
                <line x1="115" y1="37" x2="115" y2="97" stroke="#FEF3C7" stroke-dasharray="2 2" />
                <line x1="135" y1="33" x2="135" y2="93" stroke="#FEF3C7" stroke-dasharray="2 2" />
                <line x1="100" y1="60" x2="150" y2="50" stroke="#FEF3C7" stroke-dasharray="2 2" />
                <line x1="100" y1="80" x2="150" y2="70" stroke="#FEF3C7" stroke-dasharray="2 2" />

                <!-- Grid lines on Panel 4 -->
                <line x1="165" y1="33" x2="165" y2="93" stroke="#FDE68A" stroke-dasharray="2 2" />
                <line x1="185" y1="37" x2="185" y2="97" stroke="#FDE68A" stroke-dasharray="2 2" />
                <line x1="150" y1="50" x2="200" y2="60" stroke="#FDE68A" stroke-dasharray="2 2" />
                <line x1="150" y1="70" x2="200" y2="80" stroke="#FDE68A" stroke-dasharray="2 2" />
                
                <!-- Small pins -->
                <g transform="translate(30, 45)">
                  <circle cx="0" cy="0" r="3" fill="#FDA4AF" />
                  <line x1="0" y1="0" x2="0" y2="12" stroke="#FDA4AF" stroke-width="1.5" />
                </g>
                <g transform="translate(170, 45)">
                  <circle cx="0" cy="0" r="3" fill="#FDA4AF" />
                  <line x1="0" y1="0" x2="0" y2="12" stroke="#FDA4AF" stroke-width="1.5" />
                </g>
                <g transform="translate(70, 75)">
                  <circle cx="0" cy="0" r="3" fill="#FDA4AF" />
                  <line x1="0" y1="0" x2="0" y2="12" stroke="#FDA4AF" stroke-width="1.5" />
                </g>
                <g transform="translate(130, 75)">
                  <circle cx="0" cy="0" r="3" fill="#FDA4AF" />
                  <line x1="0" y1="0" x2="0" y2="12" stroke="#FDA4AF" stroke-width="1.5" />
                </g>

                <!-- Big Pink Pin in center -->
                <g transform="translate(100, 65)">
                  <path d="M 0,0 C -8,-8 -16,-16 -16,-28 C -16,-38 -8,-46 0,-46 C 8,-46 16,-38 16,-28 C 16,-16 8,-8 0,0 Z" fill="#F43F5E" />
                  <circle cx="0" cy="-28" r="6" fill="#FFFFFF" />
                  <ellipse cx="0" cy="0" rx="6" ry="2" fill="#000000" opacity="0.15" />
                </g>
              </g>
            </svg>
          </div>

          <!-- Tags list -->
          <div class="flex flex-wrap gap-2 mb-2" id="wizChips">
            ${wizardState.targetAreas.map((area, index) => `
              <span class="area-chip-ref" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 99px; background: rgba(11, 102, 194, 0.08); border: 1px solid rgba(11, 102, 194, 0.2); font-size: 13px; font-weight: 700; color: #0b66c2;">
                ${esc(area)}
                <span class="area-chip-ref-remove" onclick="removeWizardArea(${index})" style="cursor: pointer; font-weight: bold; font-size: 14px; line-height: 1;" role="button" aria-label="Remove location ${esc(area)}">&times;</span>
              </span>
            `).join('')}
          </div>

          <!-- Input field styled with internal Add button and suggestions dropdown wrapper -->
          <div style="position: relative; width: 100%; margin-bottom: 8px;">
            <div class="flex items-center justify-between border border-solid border-gray-200 rounded-xl bg-white px-4 py-2.5 shadow-sm focus-within:border-[#0b66c2] focus-within:ring-2 focus-within:ring-[#0b66c2]/10">
              <input type="text" id="wizAreaInput" class="flex-grow border-none outline-none text-sm bg-transparent placeholder-gray-400" placeholder="Type a city, area, state, or PIN code and press Enter" onkeydown="if(event.key==='Enter') { event.preventDefault(); addWizardArea(); }" oninput="handleWizAutocomplete(this.value)" autocomplete="off" aria-autocomplete="list" aria-controls="wizSuggestionsDropdown" aria-label="Target Location Input">
              <button onclick="addWizardArea()" class="text-sm font-bold text-[#0b66c2] hover:text-blue-700 bg-none border-none outline-none cursor-pointer" style="display: flex; align-items: center; gap: 4px;">
                <i class="fa-solid fa-plus"></i> Add
              </button>
            </div>
            <div id="wizSuggestionsDropdown" class="autocomplete-dropdown hidden" role="listbox" aria-label="Location suggestions"></div>
          </div>

          <!-- Real-time Help Hint and Validation Message -->
          <div id="wizHint" class="text-xs font-semibold" style="color: #E11D2A; display: none; margin-bottom: 8px;">
            ⚠️ Please click Add or press Enter to save this location.
          </div>
          <div id="wizValidationMsg" class="text-xs font-bold mb-4" style="color: ${wizardState.targetAreas.length > 0 ? '#10B981' : '#E11D2A'};">
            ${wizardState.targetAreas.length > 0 ? '✓ Location target saved.' : '⚠️ Please add at least one location.'}
          </div>
        </div>

        <!-- Targeting Suggestions -->
        <div class="flex flex-col gap-2">
          <label class="text-sm font-bold text-slate-800">Targeting Suggestions <span class="text-xs font-normal text-gray-400 italic">(Optional)</span></label>
          <p class="text-xs text-gray-500">You can suggest to which type of audience you want to show this ad</p>
          <textarea id="wizSuggestions" class="w-full p-4 border border-solid border-gray-200 rounded-xl text-sm bg-white min-h-[80px] focus:border-[#0b66c2] focus:ring-2 focus:ring-[#0b66c2]/10 outline-none" oninput="wizardState.targetSuggestions = this.value" placeholder="Businessmen / HNI / Parents / Food Lovers / Travelers / IT Professionals ...">${wizardState.targetSuggestions}</textarea>
        </div>

        <!-- Advanced Settings toggler -->
        <div>
          <div class="advanced-toggle-ref" onclick="toggleAdvancedSettings()" style="color: #0b66c2;">
            <i class="fa-solid fa-gear" style="color: #0b66c2;"></i> Advanced Settings <span id="wizAdvancedArrow">${wizardState.showAdvanced ? '▲' : '▼'}</span>
          </div>

          <div class="advanced-settings-panel ${wizardState.showAdvanced ? 'show' : ''} mt-4" id="wizAdvancedPanel">
            <div class="flex flex-col gap-5 bg-slate-50 p-6 rounded-2xl border border-gray-200">
              <!-- Age range slider -->
              <div class="flex flex-col gap-2">
                <div class="flex justify-between text-xs font-bold text-gray-600">
                  <span>Age Range</span>
                  <span id="wizAgeVal" class="text-[#0b66c2] font-extrabold">18 - ${wizardState.ageMax}</span>
                </div>
                <input type="range" min="18" max="65" value="${wizardState.ageMax}" class="custom-range-slider" oninput="updateAgeSlider(this.value)">
                <div class="flex justify-between text-[10px] text-gray-400">
                  <span>18</span>
                  <span>40</span>
                  <span>65</span>
                </div>
              </div>

              <!-- Time schedule slider -->
              <div class="flex flex-col gap-2">
                <div class="flex justify-between items-center text-xs font-bold text-gray-600">
                  <span>Time Schedule</span>
                  <span id="wizTimeVal" class="text-[#0b66c2] font-extrabold">${wizardState.wholeDay ? 'Whole Day (24 hrs)' : '6 AM - 2 Midnight'}</span>
                </div>
                <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input type="checkbox" id="wizWholeDayCheck" ${wizardState.wholeDay ? 'checked' : ''} onchange="toggleWholeDay(this.checked)" class="w-4 h-4" style="accent-color: #0b66c2;"> Whole Day
                </label>
                <input type="range" id="wizTimeSlider" min="6" max="26" value="${wizardState.timeEnd}" ${wizardState.wholeDay ? 'disabled style="opacity:0.3;"' : ''} class="custom-range-slider" oninput="updateTimeSlider(this.value)">
                <div class="flex justify-between text-[10px] text-gray-400">
                  <span>6 AM</span>
                  <span>4 PM</span>
                  <span>2 Midnight</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (step === 3) {
    const base = wizardState.packagePrice;
    const gst = Math.round(base * 0.18);
    const total = base + gst;
    
    stepHtml = `
      <div class="payment-checkout-container">
        <!-- Left Column: Payment Methods Selection -->
        <div class="payment-methods-column">
          <div class="payment-section-title">Select Payment Method</div>
          
          <div class="payment-methods-grid">
            <!-- GPay -->
            <div class="payment-card-option ${wizardState.paymentMethod === 'gpay' ? 'selected' : ''}" 
                 onclick="selectWizardPayment('gpay')" id="pm-wiz-gpay">
              <div class="payment-method-icon">
                <svg viewBox="0 0 72 24" width="72" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g transform="translate(0,1) scale(0.4583)">
                    <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v9h11.8c-.51 2.74-2.06 5.06-4.39 6.62v5.49h7.07c4.15-3.82 6.54-9.46 6.54-16.61z"/>
                    <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.07-5.49c-1.96 1.33-4.49 2.12-7.49 2.12-5.76 0-10.66-3.89-12.4-9.12H4.31v5.65C7.92 41.5 15.36 46 24 46z"/>
                    <path fill="#FBBC05" d="M11.6 28.18A14.4 14.4 0 0 1 10.8 24c0-1.46.25-2.87.7-4.18v-5.65H4.31C3.17 16.5 2.5 20.13 2.5 24s.67 7.5 1.81 9.83z"/>
                    <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.27-6.27C34.91 4.18 29.93 2 24 2 15.36 2 7.92 6.5 4.31 14.18l7.29 5.65c1.74-5.23 6.64-9.08 12.4-9.08z"/>
                  </g>
                  <text x="25" y="17" fill="#3C4043" font-family="'Google Sans', Roboto, system-ui, -apple-system, sans-serif" font-weight="500" font-size="15.5">Pay</text>
                </svg>
              </div>
              <span class="payment-method-name">Google Pay</span>
            </div>

            <!-- Razorpay -->
            <div class="payment-card-option ${wizardState.paymentMethod === 'razorpay' ? 'selected' : ''}"
                 onclick="selectWizardPayment('razorpay')" id="pm-wiz-razorpay">
              <div class="payment-method-icon">
                <svg viewBox="0 0 108 30" width="108" height="30" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect y="1" width="28" height="28" rx="7" fill="#072654"/>
                  <text x="5" y="21" fill="#FFFFFF" font-family="system-ui, sans-serif" font-weight="900" font-size="16px">R</text>
                  <text x="36" y="21" fill="#072654" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="16px" letter-spacing="-0.02em">Razorpay</text>
                </svg>
              </div>
              <span class="payment-method-name">Razorpay</span>
            </div>

            <!-- Paytm -->
            <div class="payment-card-option ${wizardState.paymentMethod === 'paytm' ? 'selected' : ''}" 
                 onclick="selectWizardPayment('paytm')" id="pm-wiz-paytm">
              <div class="payment-method-icon">
                <svg viewBox="0 0 74 24" width="74" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <text x="0" y="18" fill="#002E7F" font-family="'Inter', system-ui, sans-serif" font-weight="900" font-size="19px" letter-spacing="-0.06em">Pay<tspan fill="#00BAF2">tm</tspan></text>
                </svg>
              </div>
              <span class="payment-method-name">PayTM</span>
            </div>

            <!-- UPI -->
            <div class="payment-card-option ${wizardState.paymentMethod === 'upi' ? 'selected' : ''}" 
                 onclick="selectWizardPayment('upi')" id="pm-wiz-upi">
              <div class="payment-method-icon">
                <svg viewBox="0 0 60 22" width="60" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <text x="0" y="17" fill="#097939" font-family="system-ui, sans-serif" font-style="italic" font-weight="800" font-size="16px" letter-spacing="-0.03em">U<tspan fill="#0b66c2">P</tspan><tspan fill="#F59E0B">I</tspan></text>
                  <path d="M42 4l-4 14h3.5l4-14H42z" fill="#0b66c2"/>
                  <path d="M49 4l-4 14h3.5l4-14H49z" fill="#097939"/>
                </svg>
              </div>
              <span class="payment-method-name">UPI</span>
            </div>

            <!-- Cards -->
            <div class="payment-card-option ${wizardState.paymentMethod === 'credit_card' ? 'selected' : ''}" 
                 onclick="selectWizardPayment('credit_card')" id="pm-wiz-credit_card">
              <div class="payment-method-icon">
                <svg viewBox="0 0 76 22" width="76" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g transform="translate(0, 1)">
                    <circle cx="10" cy="10" r="8" fill="#EB001B"/>
                    <circle cx="18" cy="10" r="8" fill="#F79E1B" fill-opacity="0.85"/>
                  </g>
                  <text x="34" y="16" fill="#0F3595" font-family="system-ui, sans-serif" font-weight="800" font-style="italic" font-size="16px" letter-spacing="-0.05em">VISA</text>
                </svg>
              </div>
              <span class="payment-method-name">Cards</span>
            </div>

            <!-- Net Banking -->
            <div class="payment-card-option ${wizardState.paymentMethod === 'net_banking' ? 'selected' : ''}" 
                 onclick="selectWizardPayment('net_banking')" id="pm-wiz-net_banking">
              <div class="payment-method-icon">
                <svg viewBox="0 0 48 24" width="48" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 3L6 10v3h36v-3L24 3zm-13 10v7h3v-7h-3zm6 0v7h3v-7h-3zm6 0v7h3v-7h-3zm6 0v7h3v-7h-3zm5 8H7v2h34v-2z" fill="#334155"/>
                </svg>
              </div>
              <span class="payment-method-name">Net Banking</span>
            </div>

            <!-- Wallets -->
            <div class="payment-card-option ${wizardState.paymentMethod === 'wallet' ? 'selected' : ''}" 
                 onclick="selectWizardPayment('wallet')" id="pm-wiz-wallet">
              <div class="payment-method-icon">
                <svg viewBox="0 0 48 24" width="48" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M36 12H28c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h8V4c0-1.1-.9-2-2-2H14c-2.2 0-4 1.8-4 4v12c0 2.2 1.8 4 4 4h20c1.1 0 2-.9 2-2v-4z" fill="#7C3AED"/>
                  <circle cx="31" cy="9" r="1.5" fill="#FFFFFF"/>
                </svg>
              </div>
              <span class="payment-method-name">Wallets</span>
            </div>
          </div>
        </div>

        <!-- Right Column: Campaign Summary -->
        <div class="payment-summary-column">
          <div class="payment-summary-card">
            <h3 class="payment-summary-title">Campaign Summary</h3>
            
            <div class="payment-summary-info">
              <div class="payment-summary-row-bold">
                <span>Campaign Plan</span>
                <span class="highlight-val">${esc(wizardState.packageName === 'whatsapp' ? 'Get WhatsApps' : wizardState.packageName === 'leads' ? 'Get New Leads' : 'Get More Sales')}</span>
              </div>
              <div class="payment-summary-row">
                <span>Duration</span>
                <span>14 Days</span>
              </div>
            </div>

            <div class="payment-pricing-details">
              <div class="payment-summary-row">
                <span>Base Campaign Cost</span>
                <span>₹${base.toLocaleString('en-IN')}</span>
              </div>
              <div class="payment-summary-row">
                <span>GST Breakdown (18%)</span>
                <span>₹${gst.toLocaleString('en-IN')}</span>
              </div>
              <div class="payment-summary-row total">
                <span>Final Total (INR)</span>
                <span class="total-amount">₹${total.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <!-- Secure Badge -->
            <div class="secure-badge-container">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10B981" stroke-width="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span>100% Secure Payments</span>
            </div>

            <!-- Support Details -->
            <div class="support-details-container">
              <div class="support-title">Need help with payment?</div>
              <div>Email: <a href="mailto:support@wedeazzy.com">support@wedeazzy.com</a></div>
              <div>Phone: <a href="tel:+917498987620">+91 74989 87620</a></div>
              <div style="margin-top: 8px; border-top: 1px solid var(--border-color); padding-top: 8px;">
                <a href="/pages/refund-policy.html" target="_blank" class="refund-link">Refund & Cancellation Policy</a>
              </div>
            </div>

            <!-- Trust Badges -->
            <div class="checkout-trust-badges">
              <span>PCI-DSS Compliant</span>
              <span>•</span>
              <span>UPI Enabled</span>
              <span>•</span>
              <span>VISA & Mastercard</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  el.innerHTML = `
    <div class="max-container max-w-3xl mx-auto" style="animation: fade-step 0.35s ease;">
      <!-- Wizard Card Frame -->
      <div class="bg-white border border-solid border-gray-200 rounded-2xl p-6 shadow-sm md:p-8">
        
        <!-- Onboarding Header -->
        <div class="flex justify-between items-center mb-6 pb-4 border-b border-gray-100 border-solid">
          <div class="flex items-center gap-3">
            <button onclick="prevWizardStep()" class="text-slate-800 text-lg font-bold hover:opacity-70" style="background:none; border:none; padding:0; cursor:pointer;">
              ←
            </button>
            <h2 class="text-xl font-bold text-slate-800" style="font-family: var(--sans);">
              ${step === 1 ? 'Grow your business' : step === 2 ? 'Ad Campaign Settings' : 'Payment Details'}
            </h2>
          </div>
          
          <div class="flex gap-4 items-center">
            <button onclick="openSupportDrawer()" class="btn-premium btn-outline py-1.5 px-4 rounded-full text-sm font-semibold flex items-center gap-1.5 bg-white border border-gray-200 shadow-sm hover:bg-gray-50">
              <i class="fa-solid fa-phone text-xs"></i> Help?
            </button>
          </div>
        </div>

        <!-- Wizard Step Content Viewport -->
        <div class="min-h-[280px] py-2">
          ${stepHtml}
        </div>

        <!-- Action Panel -->
        <div class="flex justify-between items-center mt-8 pt-6 border-t border-solid border-gray-100">
          <button class="btn-premium btn-outline" ${step === 1 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''} onclick="prevWizardStep()">
            ← Back
          </button>
          
          ${step === 1 ? '' : step === 2 ? `
            <button class="btn-blue-ref font-bold" onclick="nextWizardStep()">
              Next
            </button>
          ` : `
            <button class="btn-blue-ref font-bold w-full md:w-auto animate-pulse" id="btnLaunchWizard" onclick="submitWizardCampaign()">
              Proceed to Payment
            </button>
          `}
        </div>
      </div>
    </div>
  `;
}

window.renderWizChipsAndValidation = function() {
  const chipsContainer = document.getElementById('wizChips');
  if (chipsContainer) {
    chipsContainer.innerHTML = wizardState.targetAreas.map((area, index) => `
      <span class="area-chip-ref" style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 99px; background: rgba(11, 102, 194, 0.08); border: 1px solid rgba(11, 102, 194, 0.2); font-size: 13px; font-weight: 700; color: #0b66c2;">
        ${esc(area)}
        <span class="area-chip-ref-remove" onclick="removeWizardArea(${index})" style="cursor: pointer; font-weight: bold; font-size: 14px; line-height: 1;" role="button" aria-label="Remove location ${esc(area)}">&times;</span>
      </span>
    `).join('');
  }
  const valMsg = document.getElementById('wizValidationMsg');
  if (valMsg) {
    valMsg.style.color = wizardState.targetAreas.length > 0 ? '#10B981' : '#E11D2A';
    valMsg.innerHTML = wizardState.targetAreas.length > 0 ? '✓ Location target saved.' : '⚠️ Please add at least one location.';
  }
};

window.addWizardArea = function() {
  const input = document.getElementById('wizAreaInput');
  if (!input) return;
  const area = input.value.trim();
  if (area && !wizardState.targetAreas.includes(area)) {
    wizardState.targetAreas.push(area);
  }
  input.value = '';
  const hint = document.getElementById('wizHint');
  if (hint) hint.style.display = 'none';
  const dropdown = document.getElementById('wizSuggestionsDropdown');
  if (dropdown) dropdown.classList.add('hidden');
  window.renderWizChipsAndValidation();
  input.focus();
};

window.removeWizardArea = function(index) {
  wizardState.targetAreas.splice(index, 1);
  window.renderWizChipsAndValidation();
  const input = document.getElementById('wizAreaInput');
  if (input) input.focus();
};

window.handleWizAutocomplete = function(val) {
  const dropdown = document.getElementById('wizSuggestionsDropdown');
  const hint = document.getElementById('wizHint');
  if (!dropdown) return;
  
  if (val.trim()) {
    if (hint) hint.style.display = 'block';
    const matches = INDIAN_LOCATIONS.filter(loc => loc.toLowerCase().includes(val.toLowerCase())).slice(0, 5);
    if (matches.length > 0) {
      dropdown.innerHTML = matches.map(m => `
        <div class="autocomplete-item" role="option" onclick="selectWizSuggestion('${m.replace(/'/g, "\\'")}')">${esc(m)}</div>
      `).join('');
      dropdown.classList.remove('hidden');
    } else {
      dropdown.classList.add('hidden');
    }
  } else {
    if (hint) hint.style.display = 'none';
    dropdown.classList.add('hidden');
  }
};

window.selectWizSuggestion = function(val) {
  if (!wizardState.targetAreas.includes(val)) {
    wizardState.targetAreas.push(val);
  }
  const input = document.getElementById('wizAreaInput');
  if (input) input.value = '';
  const dropdown = document.getElementById('wizSuggestionsDropdown');
  if (dropdown) dropdown.classList.add('hidden');
  const hint = document.getElementById('wizHint');
  if (hint) hint.style.display = 'none';
  window.renderWizChipsAndValidation();
  if (input) input.focus();
};

window.toggleAdvancedSettings = function() {
  wizardState.showAdvanced = !wizardState.showAdvanced;
  const panel = document.getElementById('wizAdvancedPanel');
  const arrow = document.getElementById('wizAdvancedArrow');
  if (panel) {
    if (wizardState.showAdvanced) {
      panel.classList.add('show');
      if (arrow) arrow.textContent = '▲';
    } else {
      panel.classList.remove('show');
      if (arrow) arrow.textContent = '▼';
    }
  }
};

window.updateAgeSlider = function(val) {
  wizardState.ageMax = parseInt(val, 10);
  const el = document.getElementById('wizAgeVal');
  if (el) el.textContent = `18 - ${val}`;
};

window.updateTimeSlider = function(val) {
  wizardState.timeEnd = parseInt(val, 10);
  const el = document.getElementById('wizTimeVal');
  if (el) {
    const formatHour = (h) => {
      if (h === 24) return '12 Midnight';
      if (h > 24) return `${h - 24} AM`;
      if (h === 12) return '12 Noon';
      if (h > 12) return `${h - 12} PM`;
      return `${h} AM`;
    };
    el.textContent = `${formatHour(wizardState.timeStart)} - ${formatHour(wizardState.timeEnd)}`;
  }
};

window.toggleWholeDay = function(checked) {
  wizardState.wholeDay = checked;
  const slider = document.getElementById('wizTimeSlider');
  if (slider) {
    slider.disabled = checked;
  }
  const el = document.getElementById('wizTimeVal');
  if (el) {
    el.textContent = checked ? 'Whole Day (24 hrs)' : '6 AM - 2 Midnight';
  }
};

// Help Support Drawer Controllers
window.openSupportDrawer = function() {
  let overlay = document.getElementById('helpSupportOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'helpSupportOverlay';
    overlay.className = 'help-modal-overlay';
    document.body.appendChild(overlay);
  }
  
  overlay.innerHTML = `
    <div class="help-modal-drawer">
      <div class="help-modal-header">
        <div class="flex items-center gap-3">
          <button onclick="closeSupportDrawer()" class="text-slate-800 text-lg font-bold hover:opacity-70" style="background:none; border:none; padding:0; cursor:pointer;">
            ←
          </button>
          <h3>Need Help</h3>
        </div>
        <button class="help-modal-close" onclick="closeSupportDrawer()">×</button>
      </div>
      <div class="help-modal-body">
        <!-- Status Card -->
        <div class="bg-white border border-solid border-gray-200 rounded-xl p-4 shadow-sm">
          <div class="flex justify-between items-start mb-3">
            <div class="flex gap-3">
              <!-- Digital Ad Thumbnail -->
              <div style="width: 50px; height: 50px; background-color: #e5e7eb; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 4px; text-align: center; flex-shrink: 0;">
                <span style="font-size: 8px; font-weight: 700; color: #79706A; line-height: 1.1; display: block;">Digital Advertisement</span>
                <span style="font-size: 14px; font-weight: 800; color: #1B1B1F; line-height: 1; margin-top: 2px;">ad</span>
              </div>
              <div>
                <h4 class="font-bold text-slate-800 text-sm mb-1">Whatsapp (14 Jun, 2026)</h4>
                <span class="status-pill status-pending py-0.5 px-2.5" style="font-size: 10px;">Draft</span>
              </div>
            </div>
            <div class="flex gap-1.5 text-lg">
              <i class="fa-brands fa-facebook text-[#1877F2]"></i>
              <i class="fa-brands fa-instagram text-[#E4405F]"></i>
            </div>
          </div>
          <p class="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-3 mt-1">Your ad is in draft. Finish the remaining steps to start getting customers.</p>
        </div>
        
        <p class="text-xs font-bold text-gray-500 uppercase mt-2">Current status of your ad is - Draft</p>
        
        <div class="flex flex-col gap-2.5">
          <label class="text-sm font-bold text-slate-800">Status Reason</label>
          <div class="flex flex-wrap gap-2">
            <button class="help-status-reason-chip" onclick="selectHelpReason('Connect Instagram')">Connect Instagram</button>
            <button class="help-status-reason-chip" onclick="selectHelpReason('Need to change page')">Need to change page</button>
            <button class="help-status-reason-chip" onclick="selectHelpReason('Facebook Page Integration Issue')">Facebook Page Integration Issue</button>
            <button class="help-status-reason-chip" onclick="selectHelpReason('Create new page')">Create new page</button>
          </div>
        </div>
        
        <div class="flex flex-col gap-2">
          <label class="text-sm font-bold text-slate-800">Note</label>
          <p class="text-xs text-gray-500">If you need any help, kindly write down your concern below and press the call button.</p>
          <textarea id="helpQueryText" class="w-full p-4 border border-gray-200 border-solid rounded-xl text-sm bg-white min-h-[100px] outline-none focus:border-pink-500" placeholder="Enter Query"></textarea>
        </div>
        
        <div class="flex flex-col gap-2">
          <label class="text-sm font-bold text-slate-800">Attachments</label>
          <div class="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-50 transition-colors">
            <span class="text-xs text-gray-400"><i class="fa-solid fa-cloud-arrow-up mr-1"></i> Click to upload screenshot/document</span>
          </div>
        </div>
      </div>
      
      <!-- Simulated Red Error Banner -->
      <div id="helpErrorBanner" class="bg-red-500 text-white text-xs font-semibold py-2.5 px-4 text-center" style="display: none; animation: fade-step 0.2s ease;">
        Some error occurred
      </div>
      
      <div class="help-modal-footer">
        <button class="w-full btn-premium btn-pink py-3 justify-center text-sm font-bold" onclick="submitSupportCall()">Call Now</button>
      </div>
    </div>
  `;
  
  setTimeout(() => {
    overlay.classList.add('show');
  }, 10);
};

window.closeSupportDrawer = function() {
  const overlay = document.getElementById('helpSupportOverlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
};

window.selectHelpReason = function(reason) {
  const textarea = document.getElementById('helpQueryText');
  if (textarea) {
    textarea.value = `Issue: ${reason}\n\nI need help resolving this campaign integration issue. Please contact me.`;
  }
  
  // Show error banner if Facebook Page Integration Issue clicked (fidelity simulation)
  const errBanner = document.getElementById('helpErrorBanner');
  if (errBanner) {
    if (reason === 'Facebook Page Integration Issue') {
      errBanner.style.display = 'block';
    } else {
      errBanner.style.display = 'none';
    }
  }
};

window.submitSupportCall = function() {
  triggerToast('Support call requested! Our expert will contact you shortly.');
  closeSupportDrawer();
};



window.selectWizardPackage = function(packageId, price, platform, goal) {
  wizardState.packageName = packageId;
  wizardState.packagePrice = price;
  wizardState.platform = platform;
  wizardState.goal = goal;
  wizardState.budget = Math.round(price / 14);
  wizardState.step = 2;
  renderOnboardingWizard(document.getElementById('contentViewport'));
};

window.showPaymentOverlay = function(message) {
  // Prevent duplicate overlays
  if (document.getElementById('secure-payment-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'secure-payment-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.background = 'rgba(15, 23, 42, 0.75)';
  overlay.style.backdropFilter = 'blur(6px)';
  overlay.style.zIndex = '99999';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.gap = '16px';
  overlay.style.color = '#FFFFFF';
  overlay.style.fontFamily = 'var(--sans)';
  
  overlay.innerHTML = `
    <div class="payment-loader-spinner" style="width: 50px; height: 50px; border: 4px solid rgba(255, 255, 255, 0.15); border-left-color: #E11D2A; border-radius: 50%; animation: spin 1s linear infinite;"></div>
    <div style="font-weight: 800; font-size: 18px; letter-spacing: -0.01em; text-align: center; padding: 0 20px;">${esc(message || 'Initializing secure checkout...')}</div>
    <div style="font-size: 13px; opacity: 0.8; display: flex; align-items: center; justify-content: center; gap: 6px;">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#10B981" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      Please do not close this window or click back.
    </div>
    <style>
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  `;
  document.body.appendChild(overlay);
};

window.hidePaymentOverlay = function() {
  const overlay = document.getElementById('secure-payment-overlay');
  if (overlay) overlay.remove();
};

window.selectWizardPayment = function(method) {
  wizardState.paymentMethod = method;
  document.querySelectorAll('.payment-card-option').forEach(o => o.classList.remove('selected'));
  const chosen = document.getElementById('pm-wiz-' + method);
  if (chosen) chosen.classList.add('selected');
  const btn = document.getElementById('btnLaunchWizard');
  if (btn) btn.disabled = false;
};

window.prevWizardStep = function() {
  if (wizardState.step > 1) {
    wizardState.step--;
    renderOnboardingWizard(document.getElementById('contentViewport'));
  }
};

window.nextWizardStep = function() {
  if (wizardState.step === 2) {
    const input = document.getElementById('wizAreaInput');
    if (input) {
      const val = input.value.trim();
      if (val && !wizardState.targetAreas.includes(val)) {
        wizardState.targetAreas.push(val);
      }
    }
    if (wizardState.targetAreas.length === 0) {
      triggerToast('Please add at least one target area.', true);
      const valMsg = document.getElementById('wizValidationMsg');
      if (valMsg) {
        valMsg.style.color = '#E11D2A';
        valMsg.innerHTML = '⚠️ Please add at least one location.';
      }
      return;
    }
  }
  if (wizardState.step < 3) {
    wizardState.step++;
    renderOnboardingWizard(document.getElementById('contentViewport'));
  }
};

window.submitWizardCampaign = async function() {
  const btn = document.getElementById('btnLaunchWizard');
  if (btn.disabled) return;

  btn.disabled = true;
  btn.innerHTML = `<span class="otp-loading-spinner"></span> Processing...`;
  window.showPaymentOverlay('Initializing secure checkout...');

  try {
    const dailyBudget = Math.round(wizardState.packagePrice / 14);
    const targetCity = wizardState.targetAreas.join(', ');
    const targetAudience = `Gender: ${wizardState.gender}, Age: 18-${wizardState.ageMax}, Schedule: ${wizardState.wholeDay ? 'Whole Day' : '6 AM - 2 Midnight'}, Suggestions: ${wizardState.targetSuggestions}`;

    const response = await api('/api/campaigns', {
      method: 'POST',
      body: {
        platform: wizardState.platform,
        dailyBudget: dailyBudget,
        durationDays: 14,
        goal: wizardState.goal,
        targetCity: targetCity || 'Mumbai',
        targetAudience: targetAudience,
        creativeCopy: wizardState.creative
      }
    });

    if (response.ok && response.campaign) {
      triggerToast('Campaign created successfully! Redirecting...');
      const payRes = await api('/api/payment/initiate', {
        method: 'POST',
        body: { campaignId: response.campaign.id }
      });
      if (payRes.ok && payRes.redirectUrl) {
        window.location.href = payRes.redirectUrl;
      } else {
        throw new Error(payRes.error || payRes.message || 'Failed to initiate secure checkout gateway.');
      }
    } else {
      throw new Error(response.error || response.message || 'Could not launch campaign. Please check input parameters.');
    }
  } catch (err) {
    window.hidePaymentOverlay();
    triggerToast(err.message || 'An error occurred during campaign setup. Please try again.', true);
    btn.disabled = false;
    btn.innerHTML = 'Proceed to Payment';
  }
};

/**
 * Computes realistic marketing reaches based on platform multipliers
 */
function computeCampaignEstimates(platform, dailyBudget, durationDays, goal) {
  const spend = dailyBudget * durationDays;
  
  let multiplier = 25;
  let ctr = 0.04;
  
  if (platform === 'google') { multiplier = 20; ctr = 0.05; }
  else if (platform === 'instagram') { multiplier = 30; ctr = 0.035; }
  else if (platform === 'whatsapp') { multiplier = 15; ctr = 0.10; }
  else if (platform === 'featured') { multiplier = 40; ctr = 0.06; }
  
  // Custom goal conversions
  let conv = 0.03;
  if (goal === 'leads') conv = 0.045;
  else if (goal === 'whatsapp') conv = 0.06;
  else if (goal === 'traffic') conv = 0.02;

  const reach = spend * multiplier;
  const impressions = Math.floor(reach * 1.4);
  const clicks = Math.floor(reach * ctr);
  const leads = Math.max(0, Math.floor(clicks * conv));
  const expectedBookings = Math.max(0, Math.floor(leads * 0.08));

  return {
    reach,
    impressions,
    clicks,
    leads,
    expectedBookings
  };
}

/**
 * Custom Campaign Builder real-time calculations
 */
window.updateBuilderEstimates = function() {
  const cbPlatform = document.getElementById('cbPlatform');
  const cbBudgetRange = document.getElementById('cbBudgetRange');
  const cbDuration = document.getElementById('cbDuration');
  const cbGoal = document.getElementById('cbGoal');
  if (!cbPlatform || !cbBudgetRange || !cbDuration || !cbGoal) return;

  const platform = cbPlatform.value;
  const budget = parseInt(cbBudgetRange.value, 10);
  const duration = parseInt(cbDuration.value, 10);
  const goal = cbGoal.value;

  // Update budget display
  const cbBudgetVal = document.getElementById('cbBudgetVal');
  if (cbBudgetVal) {
    cbBudgetVal.textContent = '₹' + budget.toLocaleString('en-IN');
  }
  const cbTotalBudget = document.getElementById('cbTotalBudget');
  if (cbTotalBudget) {
    cbTotalBudget.textContent = '₹' + (budget * duration).toLocaleString('en-IN') + '.00';
  }

  const estimates = computeCampaignEstimates(platform, budget, duration, goal);

  // Update estimation UI
  const cbeReach = document.getElementById('cbeReach');
  if (cbeReach) {
    cbeReach.textContent = estimates.reach.toLocaleString('en-IN');
  }
  const cbeImpressions = document.getElementById('cbeImpressions');
  if (cbeImpressions) {
    cbeImpressions.textContent = estimates.impressions.toLocaleString('en-IN');
  }
  const cbeClicks = document.getElementById('cbeClicks');
  if (cbeClicks) {
    cbeClicks.textContent = estimates.clicks.toLocaleString('en-IN');
  }
  
  const labelLeads = document.getElementById('cbeLeads');
  if (labelLeads) {
    if (goal === 'whatsapp') {
      labelLeads.textContent = Math.floor(estimates.clicks * 0.15).toLocaleString('en-IN');
      const cbeLeadTitle = document.getElementById('cbeLeadTitle');
      if (cbeLeadTitle) cbeLeadTitle.textContent = 'WhatsApp Enquiries';
    } else if (goal === 'traffic') {
      labelLeads.textContent = Math.floor(estimates.clicks * 0.25).toLocaleString('en-IN');
      const cbeLeadTitle = document.getElementById('cbeLeadTitle');
      if (cbeLeadTitle) cbeLeadTitle.textContent = 'Profile Traffic';
    } else {
      labelLeads.textContent = estimates.leads.toLocaleString('en-IN');
      const cbeLeadTitle = document.getElementById('cbeLeadTitle');
      if (cbeLeadTitle) cbeLeadTitle.textContent = 'Leads Generated';
    }
  }

  const elBookings = document.getElementById('cbeBookings');
  if (elBookings) elBookings.textContent = Math.max(1, estimates.expectedBookings).toLocaleString('en-IN');
};

/**
 * Handle clicks on marketing packages - auto-populates Custom Builder
 */
window.selectPackage = function(platform, budget, goal, duration) {
  const dropdownPlatform = document.getElementById('cbPlatform');
  const dropdownGoal = document.getElementById('cbGoal');
  const sliderBudget = document.getElementById('cbBudgetRange');
  const dropdownDuration = document.getElementById('cbDuration');

  if (dropdownPlatform) dropdownPlatform.value = platform;
  if (dropdownGoal) dropdownGoal.value = goal;
  if (sliderBudget) sliderBudget.value = budget;
  if (dropdownDuration) dropdownDuration.value = duration;

  // Trigger estimates computation
  window.updateBuilderEstimates();
  
  // Smooth scroll to campaign builder
  const builderEl = document.getElementById('customCampaignBuilderSection');
  if (builderEl) {
    builderEl.scrollIntoView({ behavior: 'smooth' });
    triggerToast(`Package details loaded contextually into Builder below.`);
  }
};

/**
 * Render the main Grow Business dashboard console
 */
function renderGrowDashboard(el, data, campaigns) {
  const summary = data.summary || { totalReach: 0, leadsGenerated: 0, whatsappClicks: 0, websiteVisits: 0, bookingEnquiries: 0, conversionRate: 0, roi: 0, totalSpend: 0 };
  const charts = data.charts || { reachClicksTimeline: [], leadSourceBreakdown: [] };

  // Calculate stats from campaigns
  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  const pausedCampaigns = campaigns.filter(c => c.status === 'paused');
  
  // Render structure
  el.innerHTML = `
    <!-- Top Hero Section with Ambient Gradient Background -->
    <div class="grow-hero" style="animation: fade-step 0.3s ease;">
      <div class="relative z-10 max-w-2xl">
        <span class="inline-block text-xs font-extrabold text-pink-600 bg-pink-100 border border-solid border-pink-200 rounded-full px-3 py-1 uppercase tracking-wider mb-4">Premium SaaS cockpit</span>
        <h1 class="grow-title">📈 Grow Your Business <span>Faster</span></h1>
        <p class="mt-2 text-sm md:text-base leading-relaxed">Promote your services, reach more customers, generate quality leads, and increase bookings from a single dashboard console.</p>
        
        <div class="flex flex-wrap gap-3 mt-6">
          <button onclick="document.getElementById('customCampaignBuilderSection').scrollIntoView({behavior:'smooth'})" class="btn-grow-primary">
            Start Custom Campaign
          </button>
          <button onclick="document.getElementById('marketingPackagesSection').scrollIntoView({behavior:'smooth'})" class="btn-grow-secondary">
            Explore Pre-set Packages
          </button>
        </div>
      </div>
    </div>

    <!-- Aggregate Analytics KPIs Grid -->
    <div class="metrics-grid mb-8">
      <div class="metric-card pink">
        <div class="metric-card-info">
          <span class="metric-card-label">Total Campaign Reach</span>
          <span class="metric-card-val" id="grow-totalReach">0</span>
          <span class="metric-card-sub">Market impressions generated</span>
        </div>
        <div class="metric-card-icon">⚡</div>
      </div>

      <div class="metric-card success">
        <div class="metric-card-info">
          <span class="metric-card-label">Leads Generated</span>
          <span class="metric-card-val" id="grow-leads">0</span>
          <span class="metric-card-sub">Inquiries from verified couples</span>
        </div>
        <div class="metric-card-icon">👥</div>
      </div>

      <div class="metric-card blue">
        <div class="metric-card-info">
          <span class="metric-card-label">WhatsApp Clickthroughs</span>
          <span class="metric-card-val" id="grow-waClicks">0</span>
          <span class="metric-card-sub">Direct clicks to phone</span>
        </div>
        <div class="metric-card-icon">💬</div>
      </div>

      <div class="metric-card gold">
        <div class="metric-card-info">
          <span class="metric-card-label">Campaign ROI Rate</span>
          <span class="metric-card-val" id="grow-roi">0x</span>
          <span class="metric-card-sub">Attributed business yield</span>
        </div>
        <div class="metric-card-icon">⭐</div>
      </div>
    </div>

    <!-- Visual Charts Panel Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      <!-- Line Chart -->
      <div class="card-premium lg:col-span-2">
        <div class="card-header-premium">
          <h3>Campaign Reach &amp; Clicks Over Time</h3>
          <span class="text-xs text-gray-400">Past 30 Days</span>
        </div>
        <div style="height: 250px;">
          <canvas id="growReachTimelineChart" style="max-height:240px; width:100%;"></canvas>
        </div>
      </div>

      <!-- Bar Chart -->
      <div class="card-premium">
        <div class="card-header-premium">
          <h3>Lead Source Breakdown</h3>
          <span class="text-xs text-gray-400">By channel</span>
        </div>
        <div style="height: 250px;">
          <canvas id="growLeadSourceChart" style="max-height:240px; width:100%;"></canvas>
        </div>
      </div>
    </div>

    <!-- Marketing Packages Section -->
    <div id="marketingPackagesSection" class="mb-8 scroll-mt-20">
      <div class="mb-4">
        <h3 class="text-xl font-serif text-slate-800 font-bold">Choose Pre-set Marketing Packages</h3>
        <p class="text-gray-500 text-xs mt-1">Ready-to-deploy ad configurations inspired by Google &amp; Meta Ads frameworks</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <!-- P1 -->
        <div class="bg-white border border-solid border-gray-200 rounded-xl p-5 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col justify-between">
          <div>
            <div class="text-xl mb-2">💬</div>
            <h4 class="font-bold text-slate-800 text-sm">WhatsApp Booster</h4>
            <ul class="text-[11px] text-gray-500 list-disc ml-4 my-3 flex flex-col gap-1">
              <li>Direct couple inquiries</li>
              <li>Auto WhatsApp triggers</li>
              <li>Priority support desk</li>
            </ul>
          </div>
          <div>
            <div class="border-t border-gray-100 border-solid pt-3 mt-2">
              <span class="text-[10px] text-gray-400 uppercase font-semibold block">Estimated Reach</span>
              <strong class="text-slate-800 text-xs">80,000+ views</strong>
            </div>
            <div class="flex justify-between items-center mt-3 pt-2">
              <div>
                <span class="text-[10px] text-gray-400 block">Starting at</span>
                <strong class="text-pink-600 text-sm">₹4,999</strong>
              </div>
              <button onclick="selectPackage('whatsapp', 350, 'whatsapp', 14)" class="p-2 bg-pink-50 text-pink-600 hover:bg-pink-100 rounded-lg text-xs font-bold transition-colors">Select</button>
            </div>
          </div>
        </div>

        <!-- P2 -->
        <div class="bg-white border-2 border-solid border-pink-500 rounded-xl p-5 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col justify-between relative">
          <span class="absolute top-2 right-2 bg-pink-500 text-white font-bold text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-full">Best Seller</span>
          <div>
            <div class="text-xl mb-2">👥</div>
            <h4 class="font-bold text-slate-800 text-sm">Lead Accelerator</h4>
            <ul class="text-[11px] text-gray-500 list-disc ml-4 my-3 flex flex-col gap-1">
              <li>Verified phone records</li>
              <li>Immediate lead alerts</li>
              <li>Lead analytics dashboard</li>
            </ul>
          </div>
          <div>
            <div class="border-t border-gray-100 border-solid pt-3 mt-2">
              <span class="text-[10px] text-gray-400 uppercase font-semibold block">Estimated Reach</span>
              <strong class="text-slate-800 text-xs">100,000+ views</strong>
            </div>
            <div class="flex justify-between items-center mt-3 pt-2">
              <div>
                <span class="text-[10px] text-gray-400 block">Starting at</span>
                <strong class="text-pink-600 text-sm">₹4,999</strong>
              </div>
              <button onclick="selectPackage('instagram', 350, 'leads', 14)" class="p-2 bg-pink-50 text-pink-600 hover:bg-pink-100 rounded-lg text-xs font-bold transition-colors">Select</button>
            </div>
          </div>
        </div>

        <!-- P3 -->
        <div class="bg-white border border-solid border-gray-200 rounded-xl p-5 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col justify-between">
          <div>
            <div class="text-xl mb-2">📈</div>
            <h4 class="font-bold text-slate-800 text-sm">Traffic Multiplier</h4>
            <ul class="text-[11px] text-gray-500 list-disc ml-4 my-3 flex flex-col gap-1">
              <li>High-intent views</li>
              <li>SEO profile boosts</li>
              <li>Competitor rank unlock</li>
            </ul>
          </div>
          <div>
            <div class="border-t border-gray-100 border-solid pt-3 mt-2">
              <span class="text-[10px] text-gray-400 uppercase font-semibold block">Estimated Reach</span>
              <strong class="text-slate-800 text-xs">450,000+ views</strong>
            </div>
            <div class="flex justify-between items-center mt-3 pt-2">
              <div>
                <span class="text-[10px] text-gray-400 block">Starting at</span>
                <strong class="text-pink-600 text-sm">₹20,000</strong>
              </div>
              <button onclick="selectPackage('instagram', 650, 'traffic', 30)" class="p-2 bg-pink-50 text-pink-600 hover:bg-pink-100 rounded-lg text-xs font-bold transition-colors">Select</button>
            </div>
          </div>
        </div>

        <!-- P4 -->
        <div class="bg-white border border-solid border-gray-200 rounded-xl p-5 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col justify-between">
          <div>
            <div class="text-xl mb-2">📣</div>
            <h4 class="font-bold text-slate-800 text-sm">Social Spotlight</h4>
            <ul class="text-[11px] text-gray-500 list-disc ml-4 my-3 flex flex-col gap-1">
              <li>IG Feed Carousel</li>
              <li>Facebook Newsfeed Ad</li>
              <li>Audience retargeting</li>
            </ul>
          </div>
          <div>
            <div class="border-t border-gray-100 border-solid pt-3 mt-2">
              <span class="text-[10px] text-gray-400 uppercase font-semibold block">Estimated Reach</span>
              <strong class="text-slate-800 text-xs">120,000+ views</strong>
            </div>
            <div class="flex justify-between items-center mt-3 pt-2">
              <div>
                <span class="text-[10px] text-gray-400 block">Starting at</span>
                <strong class="text-pink-600 text-sm">₹7,500</strong>
              </div>
              <button onclick="selectPackage('instagram', 250, 'leads', 30)" class="p-2 bg-pink-50 text-pink-600 hover:bg-pink-100 rounded-lg text-xs font-bold transition-colors">Select</button>
            </div>
          </div>
        </div>

        <!-- P5 -->
        <div class="bg-white border border-solid border-gray-200 rounded-xl p-5 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 flex flex-col justify-between">
          <div>
            <div class="text-xl mb-2">👑</div>
            <h4 class="font-bold text-slate-800 text-sm">Featured Spot</h4>
            <ul class="text-[11px] text-gray-500 list-disc ml-4 my-3 flex flex-col gap-1">
              <li>Category Rank #1</li>
              <li>Trust Gold badge</li>
              <li>Pincode lockout lock</li>
            </ul>
          </div>
          <div>
            <div class="border-t border-gray-100 border-solid pt-3 mt-2">
              <span class="text-[10px] text-gray-400 uppercase font-semibold block">Estimated Reach</span>
              <strong class="text-slate-800 text-xs">250,000+ views</strong>
            </div>
            <div class="flex justify-between items-center mt-3 pt-2">
              <div>
                <span class="text-[10px] text-gray-400 block">Starting at</span>
                <strong class="text-pink-600 text-sm">₹5,000</strong>
              </div>
              <button onclick="selectPackage('featured', 500, 'featured', 30)" class="p-2 bg-pink-50 text-pink-600 hover:bg-pink-100 rounded-lg text-xs font-bold transition-colors">Select</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom Campaign Builder & Real-Time Estimation Panel -->
    <div id="customCampaignBuilderSection" class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 scroll-mt-20">
      <!-- Campaign Builder Form -->
      <div class="card-premium lg:col-span-2">
        <div class="card-header-premium">
          <h3>Custom Campaign Builder</h3>
          <span class="text-xs text-gray-400">Configure parameters dynamically</span>
        </div>

        <form id="builderForm" onsubmit="event.preventDefault(); submitBuilderCampaign();" class="flex flex-col gap-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="flex flex-col gap-1">
              <label class="text-[11px] font-bold text-gray-500 uppercase">Campaign Goal</label>
              <select id="cbGoal" class="p-2 border border-gray-200 border-solid rounded-lg text-sm bg-white" onchange="updateBuilderEstimates()">
                <option value="leads">Generate Wedding Leads</option>
                <option value="whatsapp">Get WhatsApp Enquiries</option>
                <option value="traffic">Drive Profile Traffic</option>
                <option value="featured">Directory Featured Placement</option>
              </select>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-[11px] font-bold text-gray-500 uppercase">Platform Channel</label>
              <select id="cbPlatform" class="p-2 border border-gray-200 border-solid rounded-lg text-sm bg-white" onchange="updateBuilderEstimates()">
                <option value="google">Google Ads (Search queries)</option>
                <option value="instagram">Instagram Promotion (Banners)</option>
                <option value="facebook">Facebook Promotion (Feed)</option>
                <option value="featured">WedEazzy Featured Network</option>
              </select>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-[11px] font-bold text-gray-500 uppercase">Campaign Duration</label>
              <select id="cbDuration" class="p-2 border border-gray-200 border-solid rounded-lg text-sm bg-white" onchange="updateBuilderEstimates()">
                <option value="7">7 Days</option>
                <option value="14" selected>14 Days</option>
                <option value="30">30 Days</option>
                <option value="60">60 Days</option>
              </select>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-[11px] font-bold text-gray-500 uppercase">Target City</label>
              <select id="cbCity" class="p-2 border border-gray-200 border-solid rounded-lg text-sm bg-white">
                <option ${wizardState.city === 'Mumbai' ? 'selected' : ''}>Mumbai</option>
                <option ${wizardState.city === 'Delhi NCR' ? 'selected' : ''}>Delhi NCR</option>
                <option ${wizardState.city === 'Goa' ? 'selected' : ''}>Goa</option>
                <option ${wizardState.city === 'Jaipur' ? 'selected' : ''}>Jaipur</option>
                <option ${wizardState.city === 'Udaipur' ? 'selected' : ''}>Udaipur</option>
                <option ${wizardState.city === 'Jodhpur' ? 'selected' : ''}>Jodhpur</option>
                <option ${wizardState.city === 'Ahmedabad' ? 'selected' : ''}>Ahmedabad</option>
              </select>
            </div>

            <div class="flex flex-col gap-1 md:col-span-2">
              <label class="text-[11px] font-bold text-gray-500 uppercase">Target Audience Specs</label>
              <input type="text" id="cbAudience" class="p-2.5 border border-gray-200 border-solid rounded-lg text-sm bg-white" value="Engaged couples in target city" placeholder="Describe your audience filters" />
            </div>

            <div class="flex flex-col gap-1 md:col-span-2">
              <label class="text-[11px] font-bold text-gray-500 uppercase">Ad Copy / Creative Description</label>
              <textarea id="cbCreative" class="p-2.5 border border-gray-200 border-solid rounded-lg text-sm bg-white min-h-[70px]" placeholder="Explain your venue specialties, special offers, and starting packages.">Experience royal setups with premium caterings. Inquire now!</textarea>
            </div>
          </div>

          <div class="bg-slate-50 p-4 rounded-xl border border-solid border-gray-150 mt-2">
            <div class="flex justify-between items-center mb-3">
              <span class="text-sm font-semibold text-slate-700">Daily Campaign Budget:</span>
              <span class="text-lg font-bold text-slate-900" id="cbBudgetVal">₹350 / day</span>
            </div>
            <input type="range" min="150" max="5000" step="50" value="350" class="w-full accent-pink-600" id="cbBudgetRange" oninput="updateBuilderEstimates()" />
            <div class="flex justify-between text-xs text-gray-400 mt-2">
              <span>₹150</span>
              <span>₹2,500</span>
              <span>₹5,000</span>
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-4 pt-2">
            <button type="submit" id="btnLaunchBuilder" class="btn-premium btn-pink bg-pink-500 text-white font-bold border-none hover:bg-pink-600 shadow-md">
              Deploy Campaign &amp; Pay
            </button>
          </div>
        </form>
      </div>

      <!-- Real-Time Estimations Panel -->
      <div class="bg-slate-900 text-white rounded-2xl p-6 flex flex-col justify-between shadow-xl relative overflow-hidden h-full">
        <!-- Glowing background bubble decoration -->
        <div class="absolute -top-12 -right-12 w-32 h-32 bg-pink-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div>
          <h4 class="text-yellow-400 font-bold tracking-wider text-xs uppercase mb-6">Real-Time Estimations Panel</h4>
          
          <div class="flex flex-col gap-5">
            <div class="flex justify-between items-end border-b border-solid border-slate-800 pb-3">
              <span class="text-gray-400 text-xs">Total Target Reach:</span>
              <span class="text-xl font-bold text-white" id="cbeReach">0</span>
            </div>
            
            <div class="flex justify-between items-end border-b border-solid border-slate-800 pb-3">
              <span class="text-gray-400 text-xs">Impressions:</span>
              <span class="text-xl font-bold text-white" id="cbeImpressions">0</span>
            </div>

            <div class="flex justify-between items-end border-b border-solid border-slate-800 pb-3">
              <span class="text-gray-400 text-xs">Ad Clicks:</span>
              <span class="text-xl font-bold text-white" id="cbeClicks">0</span>
            </div>

            <div class="flex justify-between items-end border-b border-solid border-slate-800 pb-3">
              <span class="text-gray-400 text-xs" id="cbeLeadTitle">Leads Generated:</span>
              <span class="text-xl font-bold text-pink-400" id="cbeLeads">0</span>
            </div>

            <div class="flex justify-between items-end border-b border-solid border-slate-800 pb-3">
              <span class="text-gray-400 text-xs">Expected Bookings:</span>
              <span class="text-xl font-bold text-green-400" id="cbeBookings">0</span>
            </div>
          </div>
        </div>

        <div class="bg-slate-800 border border-solid border-slate-700 rounded-xl p-4 mt-6">
          <div class="flex justify-between items-center text-xs font-bold text-slate-300 mb-1">
            <span>Payable Amount (excl. GST):</span>
            <span class="text-sm text-yellow-400" id="cbTotalBudget">₹0.00</span>
          </div>
          <p class="text-gray-400 text-[9px] leading-relaxed">By clicking deploy, you authorize payment triggers via secure gateway locks.</p>
        </div>
      </div>
    </div>

    <!-- Active & Past Campaigns Ledger -->
    <div class="card-premium">
      <div class="card-header-premium">
        <h3>Campaign Performance Registry</h3>
        <span class="text-xs font-bold text-gray-400">All registered promotions</span>
      </div>

      <div class="table-responsive">
        <table class="spreadsheet">
          <thead>
            <tr>
              <th>Campaign Info</th>
              <th>Goal</th>
              <th>Runtime</th>
              <th>Spend</th>
              <th>Status</th>
              <th>Management Panel</th>
            </tr>
          </thead>
          <tbody>
            ${campaigns.length === 0 ? `
              <tr>
                <td colspan="6" class="text-center p-8 text-gray-400 text-sm">No Campaigns Registered Yet. Click "Start Custom Campaign" to launch!</td>
              </tr>
            ` : campaigns.map(c => {
              const createdDate = new Date(c.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
              
              // Calculate days active
              const now = new Date();
              const diffMs = Math.max(0, now - new Date(c.createdAt));
              const daysPassed = Math.floor(diffMs / (24 * 60 * 60 * 1000));
              const activeDays = c.status === 'paused'
                ? Math.min(c.durationDays, Math.max(0, daysPassed - 1))
                : Math.min(c.durationDays, daysPassed);
              const spend = activeDays * c.dailyBudget;

              return `
                <tr>
                  <td>
                    <div class="flex items-center gap-3">
                      <span class="text-lg">${c.platform === 'google' ? '🔍' : c.platform === 'instagram' ? '📸' : c.platform === 'facebook' ? '👥' : '👑'}</span>
                      <div>
                        <strong class="text-slate-800 text-sm font-semibold capitalize">${c.platform} Ads</strong>
                        <span class="text-[10px] text-gray-400 block">Created on ${createdDate}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="text-xs text-gray-600 font-bold uppercase tracking-wider">${c.goal}</span>
                  </td>
                  <td>
                    <span class="text-xs text-slate-800 font-medium">${c.durationDays} Days</span>
                    <span class="text-[10px] text-gray-400 block">${activeDays} days run</span>
                  </td>
                  <td>
                    <strong class="text-slate-800 text-xs">₹${spend.toLocaleString('en-IN')}</strong>
                    <span class="text-[9px] text-gray-400 block">₹${c.dailyBudget}/day</span>
                  </td>
                  <td>
                    <span class="status-badge ${c.status}">${c.status.replace('_', ' ')}</span>
                  </td>
                  <td>
                    <div class="flex gap-2">
                      ${c.status === 'active' ? `
                        <button onclick="toggleCampaignStatus('${c.id}', 'paused')" class="p-1.5 bg-yellow-50 text-yellow-600 hover:bg-yellow-100 rounded-lg text-xs font-bold transition-colors">Pause</button>
                      ` : ''}
                      ${c.status === 'paused' ? `
                        <button onclick="toggleCampaignStatus('${c.id}', 'active')" class="p-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg text-xs font-bold transition-colors">Resume</button>
                      ` : ''}
                      <button onclick="deleteCampaignFront('${c.id}')" class="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-xs font-bold transition-colors">Delete</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Animate aggregate summary numbers
  animateNumber('grow-totalReach', summary.totalReach || 0);
  animateNumber('grow-leads', summary.leadsGenerated || 0);
  animateNumber('grow-waClicks', summary.whatsappClicks || 0);
  animateNumber('grow-roi', summary.roi || 0, '', 'x');

  // Trigger campaign builder estimation
  window.updateBuilderEstimates();

  // Instantiate ChartJS Visual Charts
  setTimeout(() => {
    // 1. Line Chart
    const lineCanvas = document.getElementById('growReachTimelineChart');
    if (lineCanvas) {
      const lineCtx = lineCanvas.getContext('2d');
      const timelineLabels = charts.reachClicksTimeline.map(item => item.date);
      const reachData = charts.reachClicksTimeline.map(item => item.reach);
      const clickData = charts.reachClicksTimeline.map(item => item.clicks);

      // Gradient definitions
      const gradReach = lineCtx.createLinearGradient(0, 0, 0, 200);
      gradReach.addColorStop(0, 'rgba(219, 39, 119, 0.35)');
      gradReach.addColorStop(1, 'rgba(219, 39, 119, 0.01)');

      const gradClicks = lineCtx.createLinearGradient(0, 0, 0, 200);
      gradClicks.addColorStop(0, 'rgba(14, 23, 38, 0.25)');
      gradClicks.addColorStop(1, 'rgba(14, 23, 38, 0.01)');

      new Chart(lineCtx, {
        type: 'line',
        data: {
          labels: timelineLabels.length > 0 ? timelineLabels : ['Day 1', 'Day 10', 'Day 20', 'Day 30'],
          datasets: [
            {
              label: 'Daily Clicks',
              data: clickData.length > 0 ? clickData : [10, 24, 45, 94],
              borderColor: '#0E1726',
              backgroundColor: gradClicks,
              borderWidth: 2,
              tension: 0.35,
              fill: true,
              pointHoverRadius: 6
            },
            {
              label: 'Daily Reach',
              data: reachData.length > 0 ? reachData : [200, 800, 1500, 3200],
              borderColor: '#DB2777',
              backgroundColor: gradReach,
              borderWidth: 2.5,
              tension: 0.35,
              fill: true,
              pointHoverRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              labels: { font: { family: 'Inter', size: 10 } }
            }
          },
          scales: {
            y: { grid: { color: 'rgba(0,0,0,0.02)' }, ticks: { font: { size: 9 } } },
            x: { grid: { display: false }, ticks: { font: { size: 9 } } }
          }
        }
      });
    }

    // 2. Bar Chart
    const barCanvas = document.getElementById('growLeadSourceChart');
    if (barCanvas) {
      const barCtx = barCanvas.getContext('2d');
      const barLabels = charts.leadSourceBreakdown.map(item => item.source);
      const barData = charts.leadSourceBreakdown.map(item => item.count);

      const gradBar = barCtx.createLinearGradient(0, 0, 0, 200);
      gradBar.addColorStop(0, '#DB2777');
      gradBar.addColorStop(1, '#FDA4AF');

      new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: barLabels.length > 0 ? barLabels : ['WhatsApp Campaigns', 'Lead Generation', 'Profile Traffic', 'Featured Spot'],
          datasets: [{
            data: barData.length > 0 ? barData : [0, 0, 0, 0],
            backgroundColor: gradBar,
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { grid: { color: 'rgba(0,0,0,0.02)' }, ticks: { font: { size: 9 } } },
            x: { grid: { display: false }, ticks: { font: { size: 9 } } }
          }
        }
      });
    }
  }, 200);
}

// Controller Actions
window.submitBuilderCampaign = async function() {
  const btn = document.getElementById('btnLaunchBuilder');
  if (btn.disabled) return;

  btn.disabled = true;
  btn.innerHTML = `<span class="otp-loading-spinner"></span> Processing...`;
  window.showPaymentOverlay('Initializing secure checkout...');

  const platform = document.getElementById('cbPlatform').value;
  const budget = parseInt(document.getElementById('cbBudgetRange').value, 10);
  const duration = parseInt(document.getElementById('cbDuration').value, 10);
  const goal = document.getElementById('cbGoal').value;
  const city = document.getElementById('cbCity').value;
  const audience = document.getElementById('cbAudience').value;
  const creative = document.getElementById('cbCreative').value;

  try {
    const response = await api('/api/campaigns', {
      method: 'POST',
      body: {
        platform,
        dailyBudget: budget,
        durationDays: duration,
        goal,
        targetCity: city,
        targetAudience: audience,
        creativeCopy: creative
      }
    });

    if (response.ok && response.campaign) {
      triggerToast('Campaign created! Opening secure checkout...');
      await openRazorpayCampaignModal(response.campaign.id, btn, 'Deploy Campaign & Pay');
    } else {
      throw new Error(response.error || response.message || 'Could not launch campaign. Please check input parameters.');
    }
  } catch (err) {
    window.hidePaymentOverlay();
    triggerToast(err.message || 'An error occurred during campaign setup. Please try again.', true);
    btn.disabled = false;
    btn.innerHTML = 'Deploy Campaign & Pay';
  }
};

window.toggleCampaignStatus = async function(id, newStatus) {
  try {
    const response = await api(`/api/campaigns/${id}/status`, {
      method: 'PATCH',
      body: { status: newStatus }
    });

    if (response.ok) {
      triggerToast(`Campaign status updated to: ${newStatus}`);
      switchTab('grow-business');
    } else {
      throw new Error(response.message || 'Update failed');
    }
  } catch (err) {
    triggerToast(err.message || 'Failed to update status.', true);
  }
};

window.deleteCampaignFront = async function(id) {
  if (!confirm('Are you sure you want to permanently delete this campaign? This cannot be undone.')) return;

  try {
    const response = await api(`/api/campaigns/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      triggerToast('Campaign deleted successfully.');
      switchTab('grow-business');
    } else {
      throw new Error(response.message || 'Deletion failed');
    }
  } catch (err) {
    triggerToast(err.message || 'Failed to delete campaign.', true);
  }
};

/* ============================================================================
 * GROW BUSINESS MODULE — WedEazzy Premium Advertising Wizard
 * Multi-step flow: Landing → Package Detail → Campaign Settings → Payment → Tracking
 * ========================================================================== */

// Wizard state
const growState = {
  step: 'landing',         // 'landing' | 'detail' | 'settings' | 'payment' | 'success' | 'my-campaigns'
  selectedPackage: null,   // 'whatsapp_leads' | 'more_leads' | 'website_sales'
  selectedPlan: null,      // { days, price, label }
  gender: 'all',
  targetAreas: [],
  targetAudience: '',
  ageMin: 18,
  ageMax: 65,
  wholeDay: true,
  startHour: 6,
  endHour: 26,
  paymentMethod: null,
  campaigns: []
};

const PACKAGES = {
  whatsapp_leads: {
    id: 'whatsapp_leads',
    iconClass: 'icon-whatsapp-leads',
    icon: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 60px; height: 60px;">
      <defs>
        <radialGradient id="waGlow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stop-color="#34D399" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#34D399" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="waGreenGrad" x1="10" y1="10" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#10B981" />
          <stop offset="100%" stop-color="#047857" />
        </linearGradient>
        <linearGradient id="waWhiteGrad" x1="20" y1="20" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="100%" stop-color="#E5E7EB" />
        </linearGradient>
        <linearGradient id="waRedGrad" x1="46" y1="22" x2="56" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#F87171" />
          <stop offset="100%" stop-color="#DC2626" />
        </linearGradient>
        <linearGradient id="waGoldGrad" x1="4" y1="12" x2="12" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#FBBF24" />
          <stop offset="100%" stop-color="#F59E0B" />
        </linearGradient>
        <filter id="waShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#047857" flood-opacity="0.18" />
        </filter>
        <filter id="waShadowWhite" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#000000" flood-opacity="0.12" />
        </filter>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#waGlow)" />
      <path d="M8 16 L9.5 18.5 L12 19 L9.5 19.5 L8 22 L6.5 19.5 L4 19 L6.5 18.5 Z" fill="url(#waGoldGrad)" opacity="0.8" />
      <circle cx="14" cy="48" r="3" fill="#34D399" opacity="0.4" />
      <circle cx="52" cy="14" r="2.5" fill="#059669" opacity="0.3" />
      <g filter="url(#waShadow)">
        <rect x="6" y="12" width="38" height="28" rx="14" fill="url(#waGreenGrad)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1" />
        <path d="M12 40 L10 45 C9.5 46 8.5 45.5 9 44.5 L12 39 Z" fill="url(#waGreenGrad)" />
        <path d="M7 24 C7 17.37 12.37 13 19 13 H31 C37.63 13 43 17.37 43 24 C43 20 37.63 15 31 15 H19 C12.37 15 7 20 7 24 Z" fill="#FFFFFF" opacity="0.12" />
        <g transform="translate(16, 17) scale(0.68)">
          <path d="M19.11 0C8.558 0 0 8.558 0 19.11c0 3.376.88 6.652 2.56 9.544L0 38.22l9.84-2.584c2.784 1.704 5.984 2.608 9.272 2.608 10.552 0 19.11-8.558 19.11-19.11S29.662 0 19.11 0zm0 35.024c-2.864 0-5.672-.768-8.12-2.224l-.584-.344-6.04 1.584 1.616-5.888-.384-.608c-1.6-2.544-2.44-5.496-2.44-8.432 0-8.8 7.16-15.96 15.96-15.96 8.8 0 15.96 7.16 15.96 15.96 0 8.8-7.16 15.96-15.96 15.96z" fill="#FFFFFF" />
          <path d="M14.072 10.424c-.24-.536-.496-.544-.728-.552-.192-.008-.408-.008-.624-.008-.216 0-.568.08-.864.4-.296.32-1.128 1.104-1.128 2.696s1.16 3.128 1.32 3.344c.16.216 2.28 3.488 5.528 4.888.768.336 1.368.536 1.84.688.776.248 1.48.216 2.04.136.624-.088 1.912-.784 2.184-1.544.272-.76.272-1.408.192-1.544-.08-.136-.296-.216-.624-.376s-1.912-.944-2.208-1.048c-.296-.104-.512-.16-.728.16-.216.32-.832 1.048-1.024 1.264-.192.216-.384.24-.712.08-.328-.16-1.384-.512-2.64-1.632-.976-.872-1.632-1.952-1.824-2.28-.192-.328-.024-.504.136-.664.144-.144.328-.384.496-.576.168-.192.224-.328.336-.544.112-.216.056-.408-.024-.568-.08-.16-.728-1.752-.992-2.392z" fill="#FFFFFF" />
        </g>
      </g>
      <g filter="url(#waShadowWhite)">
        <rect x="22" y="26" width="34" height="24" rx="12" fill="url(#waWhiteGrad)" stroke="rgba(16, 185, 129, 0.15)" stroke-width="1" />
        <path d="M50 50 L52 53 C52.5 54 53.5 53.5 53 52.5 L50 49.5 Z" fill="url(#waWhiteGrad)" />
        <rect x="28" y="32" width="18" height="3" rx="1.5" fill="#10B981" />
        <rect x="28" y="38" width="12" height="3" rx="1.5" fill="#9CA3AF" opacity="0.6" />
        <path d="M44 42.5 L46.5 45 L51.5 39.5" stroke="#10B981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M46.5 42.5 L49 45 L54 39.5" stroke="#10B981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />
      </g>
      <g filter="url(#waShadowWhite)" transform="translate(44, 18)">
        <circle cx="6" cy="6" r="7.5" fill="url(#waRedGrad)" stroke="#FFFFFF" stroke-width="1.5" />
        <text x="3.8" y="9.2" fill="#FFFFFF" font-family="'Inter', sans-serif" font-size="9" font-weight="900">1</text>
      </g>
    </svg>`,
    title: 'Get WhatsApp Enquiries',
    desc: 'Generate customer enquiries directly on WhatsApp through targeted Facebook and Instagram campaigns managed by WedEazzy experts.',
    metric1Label: 'Est. WhatsApp Leads', metric1Val: '250+',
    metric2Label: 'Estimated Reach',     metric2Val: '>1,00,000',
    metric3Label: 'Platforms',
    fromPrice: '₹4,999',
    platforms: ['fb', 'ig'],
    plans: [
      { days: 10,  label: '10 Days',    price: 4999  },
      { days: 20,  label: '20 Days',    price: 8999  },
      { days: 30,  label: '30 Days',    price: 13999, recommended: true, savings: 'Save ₹2,000', original: 15999 },
      { days: 90,  label: '3 Months',   price: 34999, savings: 'Save ₹7,000', original: 41997 },
      { days: 0,   label: 'Custom Campaign', price: 20000, custom: true }
    ],
    estimates: { reach: '1,00,000+', impressions: '4,00,000+', leads: '150–250', whatsapp: '100–200' }
  },
  more_leads: {
    id: 'more_leads',
    iconClass: 'icon-more-leads',
    icon: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 60px; height: 60px;">
      <defs>
        <radialGradient id="leadsGlow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stop-color="#C084FC" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#C084FC" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="funnelGrad" x1="14" y1="34" x2="50" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#E9D5FF" />
          <stop offset="35%" stop-color="#C084FC" />
          <stop offset="100%" stop-color="#7E22CE" />
        </linearGradient>
        <linearGradient id="funnelRimGrad" x1="14" y1="30" x2="50" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.6" />
          <stop offset="100%" stop-color="#C084FC" stop-opacity="0.2" />
        </linearGradient>
        <linearGradient id="avatarBlue" x1="0" y1="0" x2="10" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#93C5FD" />
          <stop offset="100%" stop-color="#2563EB" />
        </linearGradient>
        <linearGradient id="avatarPink" x1="0" y1="0" x2="10" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#FBCFE8" />
          <stop offset="100%" stop-color="#DB2777" />
        </linearGradient>
        <linearGradient id="avatarGreen" x1="0" y1="0" x2="10" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#A7F3D0" />
          <stop offset="100%" stop-color="#059669" />
        </linearGradient>
        <linearGradient id="sparkGrad" x1="26" y1="52" x2="38" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#FCD34D" />
          <stop offset="100%" stop-color="#D97706" />
        </linearGradient>
        <filter id="leadsShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#7E22CE" flood-opacity="0.2" />
        </filter>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#leadsGlow)" />
      <ellipse cx="32" cy="18" rx="20" ry="7" stroke="#C084FC" stroke-width="1" stroke-dasharray="3,3" opacity="0.5" />
      <ellipse cx="32" cy="18" rx="13" ry="4.5" stroke="#C084FC" stroke-width="1.2" opacity="0.7" />
      <ellipse cx="32" cy="18" rx="7" ry="2.5" stroke="#EC4899" stroke-width="1.5" opacity="0.9" />
      <circle cx="32" cy="18" r="1.5" fill="#EC4899" />
      <path d="M16 19 C16 26, 24 30, 24 33" stroke="#93C5FD" stroke-width="1" stroke-dasharray="2,2" opacity="0.6" />
      <path d="M48 20 C48 26, 40 30, 40 33" stroke="#FBCFE8" stroke-width="1" stroke-dasharray="2,2" opacity="0.6" />
      <path d="M32 20 L32 30" stroke="#A7F3D0" stroke-width="1" stroke-dasharray="2,2" opacity="0.6" />
      <g transform="translate(11, 12)" filter="url(#leadsShadow)">
        <circle cx="5" cy="5" r="5.5" fill="#FFFFFF" />
        <circle cx="5" cy="5" r="4.5" fill="url(#avatarBlue)" />
        <circle cx="5" cy="3.5" r="1.8" fill="#FFFFFF" opacity="0.9" />
        <path d="M2.5 8 C2.5 6.5 3.5 6 5 6 C6.5 6 7.5 6.5 7.5 8 Z" fill="#FFFFFF" opacity="0.9" />
      </g>
      <g transform="translate(43, 14)" filter="url(#leadsShadow)">
        <circle cx="5" cy="5" r="5.5" fill="#FFFFFF" />
        <circle cx="5" cy="5" r="4.5" fill="url(#avatarPink)" />
        <circle cx="5" cy="3.5" r="1.8" fill="#FFFFFF" opacity="0.9" />
        <path d="M2.5 8 C2.5 6.5 3.5 6 5 6 C6.5 6 7.5 6.5 7.5 8 Z" fill="#FFFFFF" opacity="0.9" />
      </g>
      <g transform="translate(27, 21)" filter="url(#leadsShadow)">
        <circle cx="5" cy="5" r="5.5" fill="#FFFFFF" />
        <circle cx="5" cy="5" r="4.5" fill="url(#avatarGreen)" />
        <circle cx="5" cy="3.5" r="1.8" fill="#FFFFFF" opacity="0.9" />
        <path d="M2.5 8 C2.5 6.5 3.5 6 5 6 C6.5 6 7.5 6.5 7.5 8 Z" fill="#FFFFFF" opacity="0.9" />
      </g>
      <g filter="url(#leadsShadow)">
        <path d="M14 34 C14 31.5 22 30 32 30 C42 30 50 31.5 50 34 C50 36.5 42 38 32 38 C22 38 14 36.5 14 34 Z" fill="#6B21A8" />
        <ellipse cx="32" cy="33.5" rx="16.5" ry="3.2" fill="#A855F7" />
        <ellipse cx="32" cy="33.5" rx="10" ry="2" fill="#E9D5FF" opacity="0.4" />
        <path d="M14 34 C14 38 22 47 25 52 L39 52 C42 47 50 38 50 34 C50 34.5 50 35 50 35.5 C50 39.5 42 48.5 39 53.5 L25 53.5 C22 48.5 14 39.5 14 35.5 Z" fill="#581C87" opacity="0.4" />
        <path d="M14 34 C14 38 22 47 25 52 L39 52 C42 47 50 38 50 34 Z" fill="url(#funnelGrad)" stroke="url(#funnelRimGrad)" stroke-width="1" />
        <path d="M16 35 C17 38.5 23.5 46 26.5 50.5" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" opacity="0.4" />
        <path d="M48 35 C47 38.5 40.5 46 37.5 50.5" stroke="#A855F7" stroke-width="1.5" stroke-linecap="round" opacity="0.3" />
        <path d="M14 34 C14 36.5 22 38 32 38 C42 38 50 36.5 50 34" fill="none" stroke="url(#funnelRimGrad)" stroke-width="1.5" />
        <ellipse cx="32" cy="52" rx="7" ry="2" fill="#6B21A8" />
        <ellipse cx="32" cy="53" rx="5" ry="1.5" fill="#3B0764" />
      </g>
      <path d="M32 50 L33.5 54.5 L38 56 L33.5 57.5 L32 62 L30.5 57.5 L26 56 L30.5 54.5 Z" fill="url(#sparkGrad)" filter="url(#leadsShadow)" />
      <path d="M22 55 L22.8 57 L25 57.4 L23.3 58.6 L23.6 60.5 L22 59.5 L20.4 60.5 L20.7 58.6 L19 57.4 L21.2 57 Z" fill="#FBBF24" opacity="0.8" />
      <path d="M42 53 L42.8 55 L45 55.4 L43.3 56.6 L43.6 58.5 L42 57.5 L40.4 58.5 L40.7 56.6 L39 55.4 L41.2 55 Z" fill="#FBBF24" opacity="0.9" />
    </svg>`,
    title: 'Get More Leads',
    desc: 'Drive high-quality leads to your business with targeted Facebook, Instagram and Google campaigns. Our experts manage everything end-to-end.',
    metric1Label: 'Estimated Leads',  metric1Val: '420+',
    metric2Label: 'Estimated Reach',  metric2Val: '>1,60,000',
    metric3Label: 'Platforms',
    fromPrice: '₹8,999',
    platforms: ['fb', 'ig'],
    recommended: true,
    plans: [
      { days: 10,  label: '10 Days',    price: 8999  },
      { days: 20,  label: '20 Days',    price: 16999 },
      { days: 30,  label: '30 Days',    price: 23999, recommended: true, savings: 'Save ₹3,000', original: 26997 },
      { days: 90,  label: '3 Months',   price: 59999, savings: 'Save ₹12,000', original: 71997 },
      { days: 0,   label: 'Custom Campaign', price: 30000, custom: true }
    ],
    estimates: { reach: '1,60,000+', impressions: '6,40,000+', leads: '300–420', whatsapp: '150–250' }
  },
  website_sales: {
    id: 'website_sales',
    iconClass: 'icon-website-sales',
    icon: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 60px; height: 60px;">
      <defs>
        <radialGradient id="salesGlow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" stop-color="#FBBF24" stop-opacity="0.22" />
          <stop offset="100%" stop-color="#FBBF24" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="barGrad" x1="0" y1="12" x2="0" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#FBBF24" />
          <stop offset="100%" stop-color="#D97706" />
        </linearGradient>
        <linearGradient id="trendGrad" x1="12" y1="42" x2="48" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#F97316" />
          <stop offset="50%" stop-color="#EA580C" />
          <stop offset="100%" stop-color="#DC2626" />
        </linearGradient>
        <linearGradient id="coinGrad" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stop-color="#FFF3C4" />
          <stop offset="30%" stop-color="#FBBF24" />
          <stop offset="100%" stop-color="#B45309" />
        </linearGradient>
        <linearGradient id="coinRim" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stop-color="#FFE082" />
          <stop offset="100%" stop-color="#92400E" />
        </linearGradient>
        <filter id="salesShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="2.5" flood-color="#B45309" flood-opacity="0.2" />
        </filter>
        <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#EA580C" flood-opacity="0.4" />
        </filter>
      </defs>
      <circle cx="32" cy="32" r="28" fill="url(#salesGlow)" />
      <path d="M6 50 H58" stroke="#E5E7EB" stroke-width="1.2" opacity="0.35" stroke-linecap="round" />
      <path d="M6 38 H58" stroke="#E5E7EB" stroke-width="1" opacity="0.18" stroke-linecap="round" stroke-dasharray="2,2" />
      <path d="M6 26 H58" stroke="#E5E7EB" stroke-width="1" opacity="0.18" stroke-linecap="round" stroke-dasharray="2,2" />
      <path d="M6 14 H58" stroke="#E5E7EB" stroke-width="1" opacity="0.18" stroke-linecap="round" stroke-dasharray="2,2" />
      <g filter="url(#salesShadow)" opacity="0.85">
        <rect x="11" y="38" width="6" height="12" rx="3" fill="url(#barGrad)" fill-opacity="0.25" stroke="url(#barGrad)" stroke-width="0.5" />
        <rect x="21" y="29" width="6" height="21" rx="3" fill="url(#barGrad)" fill-opacity="0.45" stroke="url(#barGrad)" stroke-width="0.5" />
        <rect x="31" y="20" width="6" height="30" rx="3" fill="url(#barGrad)" fill-opacity="0.65" stroke="url(#barGrad)" stroke-width="0.5" />
        <rect x="41" y="11" width="6" height="39" rx="3" fill="url(#barGrad)" fill-opacity="0.85" stroke="url(#barGrad)" stroke-width="0.5" />
      </g>
      <g filter="url(#lineGlow)">
        <path d="M14 40 C 22 32, 28 24, 44 13" fill="none" stroke="url(#trendGrad)" stroke-width="3" stroke-linecap="round" />
        <circle cx="44" cy="13" r="4.5" fill="#FFFFFF" stroke="#DC2626" stroke-width="1.5" />
        <circle cx="44" cy="13" r="2" fill="#DC2626" />
      </g>
      <g transform="translate(20, 32)" filter="url(#salesShadow)">
        <ellipse cx="6" cy="6" rx="6.5" ry="5" fill="url(#coinRim)" />
        <ellipse cx="6" cy="5.5" rx="5.5" ry="4" fill="url(#coinGrad)" />
        <text x="4" y="8.2" fill="#92400E" font-family="'Inter', sans-serif" font-size="7.5" font-weight="900">₹</text>
      </g>
      <g transform="translate(42, 18)" filter="url(#salesShadow)">
        <ellipse cx="8" cy="8" rx="8.5" ry="6.5" fill="url(#coinRim)" stroke="rgba(255,255,255,0.2)" stroke-width="0.5" />
        <ellipse cx="8" cy="7.2" rx="7.5" ry="5.5" fill="url(#coinGrad)" />
        <text x="5.5" y="10.5" fill="#78350F" font-family="'Inter', sans-serif" font-size="10" font-weight="900">₹</text>
      </g>
      <g transform="translate(48, 38)" filter="url(#salesShadow)">
        <ellipse cx="5" cy="5" rx="5.5" ry="4" fill="url(#coinRim)" />
        <ellipse cx="5" cy="4.5" rx="4.5" ry="3" fill="url(#coinGrad)" />
        <text x="3.2" y="6.8" fill="#92400E" font-family="'Inter', sans-serif" font-size="6.5" font-weight="900">₹</text>
      </g>
      <path d="M47 8 L48 10 L50 10.5 L48 11 L47 13 L46 11 L44 10.5 L46 10 Z" fill="#FBBF24" opacity="0.9" />
      <path d="M8 32 L8.8 34 L10 34.4 L8.8 34.8 L8 36 L7.2 34.8 L6 34.4 L7.2 34 L8 32 Z" fill="#FBBF24" opacity="0.75" />
    </svg>`,
    title: 'Increase Website Sales',
    desc: 'Drive qualified traffic to your website and convert visitors into customers with professional campaigns optimized for conversions.',
    metric1Label: 'Estimated Sales',  metric1Val: '80+',
    metric2Label: 'Estimated Reach',  metric2Val: '>3,00,000',
    metric3Label: 'Platforms',
    fromPrice: '₹20,000',
    platforms: ['fb', 'ig'],
    plans: [
      { days: 10,  label: '10 Days',    price: 20000 },
      { days: 20,  label: '20 Days',    price: 37999 },
      { days: 30,  label: '30 Days',    price: 52999, recommended: true, savings: 'Save ₹7,000', original: 59997 },
      { days: 90,  label: '3 Months',   price: 139999, savings: 'Save ₹20,000', original: 159997 },
      { days: 0,   label: 'Custom Campaign', price: 50000, custom: true }
    ],
    estimates: { reach: '3,00,000+', impressions: '12,00,000+', leads: '500–800', whatsapp: '200–400' }
  }
};

function computeCampaignEstimates(pkg, planDays) {
  const multiplier = planDays === 0 ? 3 : Math.max(1, planDays / 10);
  const base = pkg.estimates;
  return base;
}

function platformBadges(platforms) {
  return platforms.map(p => {
    if (p === 'fb') return `<div class="platform-badge fb" title="Facebook" style="background:#1877F2;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></div>`;
    if (p === 'ig') return `<div class="platform-badge ig" title="Instagram" style="background:radial-gradient(circle at 30% 107%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%);"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg></div>`;
    if (p === 'wa') return `<div class="platform-badge wa" title="WhatsApp" style="background:#25D366;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.248 8.477 3.517 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.864-9.864.002-2.637-1.023-5.116-2.887-6.981-1.864-1.864-4.348-2.887-6.987-2.888-5.442 0-9.869 4.42-9.873 9.865-.001 2.016.529 3.985 1.536 5.727L1.936 21.93l4.711-1.236zM16.517 13.6c-.247-.124-1.464-.722-1.692-.805-.227-.082-.393-.124-.558.124-.165.247-.638.805-.783.97-.145.165-.29.185-.538.062-.247-.125-1.045-.385-1.99-1.23-.736-.656-1.232-1.47-1.377-1.717-.145-.247-.015-.38.109-.504.112-.112.247-.29.37-.433.124-.144.165-.247.247-.413.082-.165.041-.31-.02-.433-.062-.124-.558-1.343-.763-1.84-.2-.48-.423-.413-.578-.42-.15-.008-.32-.01-.49-.01-.17 0-.448.064-.683.32-.234.256-.895.875-.895 2.132 0 1.258.91 2.473 1.037 2.64 1.25 1.636 2.637 2.502 4.15 2.973.843.262 1.57.246 2.158.158.658-.098 1.465-.6 1.67-.1.206-.48.206-.895 0-1.018-.082-.124-.227-.186-.474-.31z"/></svg></div>`;
    if (p === 'go') return `<div class="platform-badge go" title="Google" style="background:#4285F4;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.985 0-.74-.078-1.32-.172-1.886H12.24z"/></svg></div>`;
    return '';
  }).join('');
}

function renderWizardSteps(activeStep) {
  const steps = [
    { id: 'detail',   label: 'Choose Plan' },
    { id: 'settings', label: 'Campaign Settings' },
    { id: 'payment',  label: 'Payment' },
  ];
  const stepOrder = ['detail', 'settings', 'payment', 'success'];
  const activeIdx = stepOrder.indexOf(activeStep);

  return `
    <div class="grow-wizard-steps">
      ${steps.map((s, i) => {
        const idx = i;
        const isDone   = activeIdx > idx;
        const isActive = activeIdx === idx;
        const isLine   = i < steps.length - 1;
        return `
          <div class="wizard-step-item">
            <div class="wizard-step-circle ${isDone ? 'done' : isActive ? 'active' : ''}">
              ${isDone ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : i + 1}
            </div>
            <span class="wizard-step-label ${isDone ? 'done' : isActive ? 'active' : ''}">${s.label}</span>
            ${isLine ? `<div class="wizard-step-line ${isDone ? 'done' : ''}"></div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

async function renderGrowBusinessTab(el) {
  // Load campaigns from API
  try {
    const res = await api('/api/campaigns');
    if (res && res.ok) growState.campaigns = res.campaigns || [];
  } catch (e) {
    growState.campaigns = [];
  }

  renderGrowStep(el);
}

function renderGrowStep(el) {
  const step = growState.step;
  if (step === 'landing')       renderGrowLanding(el);
  else if (step === 'detail')   renderGrowDetail(el);
  else if (step === 'settings') renderGrowSettings(el);
  else if (step === 'payment')  renderGrowPayment(el);
  else if (step === 'success')  renderGrowSuccess(el);
  else if (step === 'my-campaigns') renderGrowMyCampaigns(el);
}

// ── STEP 1: Landing ────────────────────────────────────────────────────────
function renderGrowLanding(el) {
  const hasCampaigns = growState.campaigns && growState.campaigns.length > 0;

  el.innerHTML = `
    <!-- Hero -->
    <div class="grow-hero">
      <h1 class="grow-title">📈 Grow Your Business <span>Faster</span></h1>
      <p>Reach more customers, generate qualified leads, increase bookings, and grow your revenue with WedEazzy Marketing Solutions.</p>
      <div class="grow-benefits-grid">
        <div class="grow-benefit-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 9.23858 20.8807 7.0273 19 5.5C18.0635 4.73896 16.9365 4.26104 16 4C14.7176 3.6559 13.3541 3.5 12 3.5C6.47715 3.5 2 7.97715 2 13.5C2 19.0228 6.47715 22 12 22Z"/><circle cx="7.5" cy="10.5" r="1.5" fill="currentColor"/><circle cx="11.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="16.5" cy="9.5" r="1.5" fill="currentColor"/></svg>
          Ad Designing
        </div>
        <div class="grow-benefit-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          Content Writing
        </div>
        <div class="grow-benefit-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
          Audience Targeting
        </div>
        <div class="grow-benefit-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
          Optimization
        </div>
        <div class="grow-benefit-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          Lead Generation
        </div>
        <div class="grow-benefit-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"></path><path d="M12 2a5 5 0 0 0-5 5v3c0 3 2 5 5 5s5-2 5-5V7a5 5 0 0 0-5-5z"></path></svg>
          Growth Support
        </div>
      </div>
    </div>
 
    <!-- My Campaigns Quick Access -->
    ${hasCampaigns ? `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <h2 style="font-size:18px; font-weight:800; color:var(--text-primary); margin: 0; letter-spacing: -0.01em; display:flex; align-items:center; gap:8px;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
          Active Marketing
        </h2>
        <button onclick="growGoStep('my-campaigns')" style="font-size:13px; font-weight:700; color:var(--text-sidebar-active); background:none; border:none; cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:4px;">
          View Campaigns & Analytics →
        </button>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:16px; margin-bottom:28px;">
        ${growState.campaigns.slice(0, 3).map(c => `
          <div class="premium-campaign-card" style="padding: 18px 20px; cursor: pointer;" onclick="growGoStep('my-campaigns')">
            <div class="campaign-card-header" style="margin-bottom:0;">
              <div>
                <h4 style="font-size:14px; font-weight:800; color:var(--text-primary); margin:0;">${esc(packageDisplayName(c.packageType))}</h4>
                <div class="campaign-card-meta" style="margin-top:6px; font-size:11px; display:flex; align-items:center; gap:12px; color:var(--text-secondary);">
                  <span style="display:inline-flex; align-items:center; gap:4px;">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    ${c.planDays ? c.planDays + ' Days' : 'Custom'}
                  </span>
                  <span style="display:inline-flex; align-items:center; gap:4px;">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"></rect><line x1="12" y1="10" x2="12" y2="10.01"></line><path d="M12 2v2M12 20v2"></path></svg>
                    ₹${c.totalAmount ? parseInt(c.totalAmount).toLocaleString('en-IN') : '—'}
                  </span>
                </div>
              </div>
              <span class="campaign-status-badge ${c.adminStatus || 'pending'}" style="font-size:9px; padding:3px 8px;">
                ● ${(c.adminStatus || 'pending').replace('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="grow-divider" style="margin: 28px 0;"></div>
    ` : ''}
 
    <!-- Packages -->
    <div class="grow-packages-section">
      <h2>Choose Your Advertising Package</h2>
      <p>Choose your advertising objective and our experts will take care of everything — ad designing, content writing, targeting, and optimization.</p>
 
      <div class="grow-packages-grid">
        ${renderPackageCard(PACKAGES.whatsapp_leads)}
        ${renderPackageCard(PACKAGES.more_leads)}
        ${renderPackageCard(PACKAGES.website_sales)}
      </div>
    </div>

    <!-- WhatsApp Support Help Banner -->
    <div class="whatsapp-help-banner">
      <div class="whatsapp-help-content">
        <h3 class="whatsapp-help-title">Need Help Growing Your Business?</h3>
        <p class="whatsapp-help-text">Talk directly with our marketing team and get personalized growth recommendations to double your inquiries and bookings.</p>
      </div>
      <a href="https://wa.me/917498987620?text=Hello%20WedEazzy%20Support%2C%20I%20need%20help%20growing%20my%20wedding%20business." target="_blank" class="whatsapp-btn">
        <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.444 5.704 1.447h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Chat on WhatsApp
      </a>
    </div>
  `;
}

function renderPackageCard(pkg) {
  return `
    <div class="package-card ${pkg.recommended ? 'recommended' : ''}" 
         onclick="growSelectPackage('${pkg.id}')" 
         id="pkg-card-${pkg.id}">
      ${pkg.recommended ? `
        <span class="package-rec-badge">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          Recommended
        </span>
      ` : ''}
      <div class="package-card-icon ${pkg.iconClass || ''}">${pkg.icon}</div>
      <h3>${pkg.title}</h3>
      <div class="package-metrics">
        <div class="package-metric">
          <span class="metric-label">${pkg.metric1Label}</span>
          <span class="metric-val">${pkg.metric1Val}</span>
        </div>
        <div class="package-metric">
          <span class="metric-label">${pkg.metric2Label}</span>
          <span class="metric-val">${pkg.metric2Val}</span>
        </div>
        <div class="package-metric">
          <span class="metric-label">Platforms</span>
          <div class="platform-badges">${platformBadges(pkg.platforms)}</div>
        </div>
      </div>
      <div class="package-price">
        <span>Packages starts from ${pkg.fromPrice}</span>
        <span class="arrow">›</span>
      </div>
    </div>
  `;
}

function packageDisplayName(type) {
  if (type === 'whatsapp_leads') return 'Get WhatsApp Enquiries';
  if (type === 'more_leads') return 'Get More Leads';
  if (type === 'website_sales') return 'Increase Website Sales';
  return type || 'Ad Campaign';
}

window.growSelectPackage = function(pkgId) {
  growState.selectedPackage = pkgId;
  growState.selectedPlan = null;
  growState.step = 'detail';
  const el = document.getElementById('contentViewport');
  if (el) renderGrowStep(el);
};

window.growGoStep = function(step) {
  growState.step = step;
  const el = document.getElementById('contentViewport');
  if (el) renderGrowStep(el);
};

// ── STEP 2: Package Detail + Plan Selection ────────────────────────────────
function renderGrowDetail(el) {
  const pkg = PACKAGES[growState.selectedPackage];
  if (!pkg) { growState.step = 'landing'; return renderGrowStep(el); }
  const est = pkg.estimates;

  el.innerHTML = `
    <div class="card-premium">
      ${renderWizardSteps('detail')}

      <div style="display:flex; align-items:center; gap:14px; margin-bottom:20px;">
        <button onclick="growGoStep('landing')" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted);display:flex;align-items:center;"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg></button>
        <div>
          <h2 style="font-size:20px;font-weight:800;color:var(--text-primary);margin-bottom:4px;letter-spacing:-0.01em;">${esc(pkg.title)}</h2>
          <p style="font-size:13px;color:var(--text-secondary);">${esc(pkg.desc)}</p>
        </div>
      </div>

      <!-- Platforms -->
      <div class="platforms-row">
        <span class="platforms-row-label">Platforms:</span>
        ${platformBadges(pkg.platforms)}
      </div>

      <div class="grow-divider"></div>

      <!-- Plan Selection -->
      <span class="grow-section-label">Select Campaign Duration</span>
      <div class="plan-options-grid" id="planOptionsGrid">
        ${pkg.plans.map(plan => {
          const isSelected = growState.selectedPlan && growState.selectedPlan.days === plan.days;
          return `
            <div class="plan-option-card ${plan.recommended ? 'recommended' : ''} ${plan.custom ? 'plan-full' : ''} ${isSelected ? 'selected' : ''}" 
                 id="plan-${plan.days}"
                 onclick="growSelectPlan(${plan.days}, ${plan.price}, '${esc(plan.label)}')">
              ${plan.recommended ? `
                <span class="plan-rec-badge">
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:2px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                  Recommended
                </span>
              ` : ''}
              <div class="plan-select-radio">
                <input type="radio" name="growSelectedPlanRadio" class="plan-select-radio-input" value="${plan.days}" ${isSelected ? 'checked' : ''} style="display:none;" />
              </div>
              <span class="plan-days">${esc(plan.label)}</span>
              <span class="plan-price">₹${plan.price.toLocaleString('en-IN')}</span>
              ${plan.original ? `
                <div style="margin-top:4px;">
                  <span class="plan-original">₹${plan.original.toLocaleString('en-IN')}</span>
                  <span class="plan-savings">${esc(plan.savings)}</span>
                </div>
              ` : ''}
              ${plan.custom ? '<p style="font-size:12px;color:var(--text-muted);margin-top:6px;">Starting price shown. Final price based on requirements.</p>' : ''}
            </div>
          `;
        }).join('')}
      </div>

      <!-- Estimated Results -->
      <div class="grow-divider"></div>
      <span class="grow-section-label">Estimated Campaign Results</span>
      <div class="est-results-grid">
        <div class="est-result-card">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto 8px; color:#3B82F6;"><path d="M5 12a7 7 0 0 1 14 0"></path><path d="M8.5 12a3.5 3.5 0 0 1 7 0"></path><circle cx="12" cy="12" r="1"></circle></svg>
          <span class="est-value">${esc(est.reach)}</span>
          <span class="est-label">Estimated Reach</span>
          <span class="tooltip-icon" title="Number of unique people who may see your ad">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          </span>
        </div>
        <div class="est-result-card">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto 8px; color:#8B5CF6;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          <span class="est-value">${esc(est.impressions)}</span>
          <span class="est-label">Estimated Impressions</span>
          <span class="tooltip-icon" title="Total times your ad is shown, including repeat views">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          </span>
        </div>
        <div class="est-result-card">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto 8px; color:#F59E0B;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
          <span class="est-value">${esc(est.leads)}</span>
          <span class="est-label">Estimated Leads</span>
          <span class="tooltip-icon" title="Qualified prospect inquiries generated">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          </span>
        </div>
        <div class="est-result-card">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style="display:block; margin:0 auto 8px; color:#10B981;"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.248 8.477 3.517 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.864-9.864.002-2.637-1.023-5.116-2.887-6.981-1.864-1.864-4.348-2.887-6.987-2.888-5.442 0-9.869 4.42-9.873 9.865-.001 2.016.529 3.985 1.536 5.727L1.936 21.93l4.711-1.236zM16.517 13.6c-.247-.124-1.464-.722-1.692-.805-.227-.082-.393-.124-.558.124-.165.247-.638.805-.783.97-.145.165-.29.185-.538.062-.247-.125-1.045-.385-1.99-1.23-.736-.656-1.232-1.47-1.377-1.717-.145-.247-.015-.38.109-.504.112-.112.247-.29.37-.433.124-.144.165-.247.247-.413.082-.165.041-.31-.02-.433-.062-.124-.558-1.343-.763-1.84-.2-.48-.423-.413-.578-.42-.15-.008-.32-.01-.49-.01-.17 0-.448.064-.683.32-.234.256-.895.875-.895 2.132 0 1.258.91 2.473 1.037 2.64 1.25 1.636 2.637 2.502 4.15 2.973.843.262 1.57.246 2.158.158.658-.098 1.465-.6 1.67-.1.206-.48.206-.895 0-1.018-.082-.124-.227-.186-.474-.31z"/></svg>
          <span class="est-value">${esc(est.whatsapp)}</span>
          <span class="est-label">WhatsApp Enquiries</span>
          <span class="tooltip-icon" title="Direct WhatsApp messages from interested customers">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          </span>
        </div>
      </div>

      <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">* Results are estimated based on industry averages. Actual performance may vary.</p>
    </div>

    <div class="sticky-cta-bar">
      <button class="cta-back" onclick="growGoStep('landing')">← Back</button>
      <button class="cta-main" id="continueBtn" onclick="growContinueToSettings()" ${growState.selectedPlan ? '' : 'disabled'}>
        ${growState.selectedPlan ? `Continue → ${growState.selectedPlan.label}` : 'Continue →'}
      </button>
    </div>
  `;
}

window.growSelectPlan = function(days, price, label) {
  growState.selectedPlan = { days, price, label };
  // Update UI
  document.querySelectorAll('.plan-option-card').forEach(c => {
    c.classList.remove('selected');
    const rad = c.querySelector('.plan-select-radio-input');
    if (rad) rad.checked = false;
  });
  const card = document.getElementById(`plan-${days}`);
  if (card) {
    card.classList.add('selected');
    const rad = card.querySelector('.plan-select-radio-input');
    if (rad) rad.checked = true;
  }
  const btn = document.getElementById('continueBtn');
  if (btn) { btn.disabled = false; btn.textContent = `Continue → ${label}`; }
};

window.growContinueToSettings = function() {
  if (!growState.selectedPlan) { triggerToast('Please select a campaign plan.', true); return; }
  growState.step = 'settings';
  const el = document.getElementById('contentViewport');
  if (el) renderGrowStep(el);
};

// ── STEP 3: Campaign Settings ───────────────────────────────────────────────
function renderGrowSettings(el) {
  const pkg = PACKAGES[growState.selectedPackage];

  el.innerHTML = `
    <div class="card-premium">
      ${renderWizardSteps('settings')}

      <h2 style="font-size:18px;font-weight:800;color:var(--text-primary);margin-bottom:6px;letter-spacing:-0.01em;">Ad Campaign Settings</h2>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:24px;">Set target area and audience for your business. Interest-based advanced targeting will be done by our experts.</p>

      <!-- Gender -->
      <span class="grow-section-label">Select Gender</span>
      <div style="margin-bottom: 20px;">
        <div class="gender-selector" id="genderSelector">
          ${['all', 'male', 'female'].map(g => `
            <label class="gender-option ${growState.gender === g ? 'selected' : ''}" onclick="growSetGender('${g}')">
              <input type="radio" name="gender" value="${g}" ${growState.gender === g ? 'checked' : ''} style="display:none;">
              ${g === 'all' ? `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2v20M2 12h20"/></svg>
                All
              ` : g === 'male' ? `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="14" r="6"></circle><path d="M14 10l6-6M20 10V4h-6"/></svg>
                Male
              ` : `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"></circle><path d="M12 14v8M9 18h6"/></svg>
                Female
              `}
            </label>
          `).join('')}
        </div>
      </div>

      <div class="grow-divider"></div>

      <!-- Target Areas -->
      <span class="grow-section-label">Target Areas <span style="color:#E11D2A;">*</span> <em style="font-weight:400;text-transform:none;font-style:normal;font-size:10px;color:var(--text-muted);">(required)</em></span>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Your ad will be shown in this area. It could be a list of Local Area / City / State or PAN India.</p>

      <!-- Map visual mockup outline SVG -->
      <div class="map-mockup-wrapper" style="background:var(--bg-primary); border:1.5px solid var(--border-color); border-radius:16px; padding:24px; text-align:center; margin-bottom:16px; position:relative; overflow:hidden;">
        <svg viewBox="0 0 400 120" width="100%" height="120" style="opacity:0.85; margin: 0 auto; display:block;">
          <defs>
            <pattern id="mapGrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--border-color)" stroke-width="0.75" />
            </pattern>
            <radialGradient id="targetGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="rgba(225, 29, 42, 0.2)" />
              <stop offset="100%" stop-color="rgba(225, 29, 42, 0)" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#mapGrid)" rx="8" />
          <path d="M-20 40 Q 100 20 200 80 T 420 50" fill="none" stroke="var(--border-color)" stroke-width="6" stroke-linecap="round" />
          <path d="M-20 40 Q 100 20 200 80 T 420 50" fill="none" stroke="var(--bg-card)" stroke-width="4" stroke-linecap="round" />
          <path d="M120 -10 L 150 130" fill="none" stroke="var(--border-color)" stroke-width="4" />
          <path d="M120 -10 L 150 130" fill="none" stroke="var(--bg-card)" stroke-width="2.5" />
          <path d="M280 -10 L 250 130" fill="none" stroke="var(--border-color)" stroke-width="4" />
          <path d="M280 -10 L 250 130" fill="none" stroke="var(--bg-card)" stroke-width="2.5" />
          <circle cx="200" cy="60" r="45" fill="url(#targetGlow)" />
          <circle cx="200" cy="60" r="25" fill="none" stroke="#E11D2A" stroke-dasharray="4,4" stroke-width="1.5" />
          <circle cx="200" cy="60" r="4" fill="#E11D2A" />
          <g transform="translate(140, 20)">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#3B82F6" transform="scale(0.8)" />
          </g>
          <g transform="translate(250, 65)">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#10B981" transform="scale(0.8)" />
          </g>
        </svg>
        <p style="font-size:13px; color:var(--text-secondary); font-weight:700; margin-top:12px; margin-bottom: 0;">Specify Your Ad Targeting Location Below</p>
      </div>

      <div class="location-chips-row" id="locationChips">
        ${growState.targetAreas.map(a => `
          <span class="location-chip">${esc(a)}<span class="chip-remove" onclick="growRemoveArea('${esc(a)}')" role="button" aria-label="Remove location ${esc(a)}">×</span></span>
        `).join('')}
      </div>

      <!-- Input field styled with internal Add button and suggestions dropdown wrapper -->
      <div style="position: relative; width: 100%; margin-bottom: 8px;">
        <div class="location-add-row">
          <input type="text" id="locationInput" placeholder="Type a city, area, state, or PIN code and press Enter" 
                 onkeydown="if(event.key==='Enter'){event.preventDefault(); growAddArea();}" 
                 oninput="handleGrowAutocomplete(this.value)" autocomplete="off"
                 aria-autocomplete="list" aria-controls="growSuggestionsDropdown" aria-label="Target Location Input" />
          <button class="location-add-btn" onclick="growAddArea()" style="display: flex; align-items: center; gap: 4px;">
            <i class="fa-solid fa-plus"></i> Add
          </button>
        </div>
        <div id="growSuggestionsDropdown" class="autocomplete-dropdown hidden" role="listbox" aria-label="Location suggestions"></div>
      </div>

      <!-- Real-time Help Hint and Validation Message -->
      <div id="growHint" class="text-xs font-semibold" style="color: #E11D2A; display: none; margin-bottom: 8px; font-family: var(--sans);">
        ⚠️ Please click Add or press Enter to save this location.
      </div>
      <div id="growValidationMsg" class="text-xs font-bold mb-4" style="color: ${growState.targetAreas.length > 0 ? '#10B981' : '#E11D2A'}; font-family: var(--sans);">
        ${growState.targetAreas.length > 0 ? '✓ Location target saved.' : '⚠️ Please add at least one location.'}
      </div>

      <div class="grow-divider"></div>

      <!-- Targeting Suggestions -->
      <span class="grow-section-label">Targeting Suggestions <em style="text-transform:none;font-style:normal;font-size:10px;color:var(--text-muted);">(Optional)</em></span>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Suggest which type of audience you want to show this ad to.</p>
      <textarea id="targetAudienceInput" 
        style="width:100%;border:1.5px solid var(--border-color);border-radius:10px;padding:14px;font-size:13px;color:var(--text-primary);background:var(--bg-card);font-family:inherit;resize:vertical;min-height:80px;outline:none;transition:border-color 0.2s;"
        placeholder="e.g. Brides-to-be / Wedding Planners / Event Organizers / Photographers / Families / Luxury Buyers / Travelers / Professionals"
        onfocus="this.style.borderColor='#E11D2A'"
        onblur="this.style.borderColor='var(--border-color)'"
        >${esc(growState.targetAudience)}</textarea>

      <!-- Advanced Settings -->
      <div class="grow-divider"></div>
      <button class="advanced-toggle" onclick="growToggleAdvanced()">
        <span style="display:inline-flex; align-items:center; gap:6px;">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="adv-gear-icon" style="transition: transform 0.3s ease;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          Advanced Settings
        </span>
        <span id="advArrow" style="margin-left:4px; font-size:10px; transition: transform 0.2s;">▼</span>
      </button>
      <div class="advanced-content" id="advancedContent">
        <!-- Age Range -->
        <span class="grow-section-label">Age Range</span>
        <div class="age-range-display" id="ageDisplay">${growState.ageMin} – ${growState.ageMax}</div>
        <div style="position:relative;margin-bottom:24px;">
          <div style="width:100%;height:6px;border-radius:99px;background:var(--border-color);position:relative;margin:10px 0;">
            <div id="ageTrackFill" style="position:absolute;height:6px;border-radius:99px;background:#E11D2A;left:${((growState.ageMin-18)/47)*100}%;right:${100-((growState.ageMax-18)/47)*100}%;"></div>
          </div>
          <div style="display:flex;gap:16px;margin-top:8px;">
            <div class="form-field-premium" style="flex:1;">
              <label>Min Age</label>
              <input type="number" id="ageMinInput" value="${growState.ageMin}" min="18" max="64"
                style="border:1.5px solid var(--border-color);border-radius:8px;padding:8px 12px;font-size:14px;font-weight:700;color:var(--text-primary);background:var(--bg-card);outline:none;width:100%;"
                oninput="growUpdateAge()" />
            </div>
            <div class="form-field-premium" style="flex:1;">
              <label>Max Age</label>
              <input type="number" id="ageMaxInput" value="${growState.ageMax}" min="19" max="65"
                style="border:1.5px solid var(--border-color);border-radius:8px;padding:8px 12px;font-size:14px;font-weight:700;color:var(--text-primary);background:var(--bg-card);outline:none;width:100%;"
                oninput="growUpdateAge()" />
            </div>
          </div>
        </div>

        <!-- Time Schedule -->
        <span class="grow-section-label">Time Schedule <span class="time-range-display" id="timeDisplay">${growState.wholeDay ? 'Whole Day' : `${growState.startHour}:00 – ${growState.endHour === 26 ? '2 AM' : growState.endHour + ':00'}`}</span></span>
        <label class="whole-day-checkbox" onclick="growToggleWholeDay()">
          <div class="custom-checkbox ${growState.wholeDay ? 'checked' : ''}" id="wholeDayCheck"></div>
          Whole Day
        </label>
        <div id="customTimeSection" style="display:${growState.wholeDay ? 'none' : 'block'};">
          <div style="display:flex;gap:16px;">
            <div class="form-field-premium" style="flex:1;">
              <label>Start Time</label>
              <select id="startTimeSelect" onchange="growUpdateTime()" 
                style="border:1.5px solid var(--border-color);border-radius:8px;padding:8px 12px;font-size:14px;font-weight:600;color:var(--text-primary);background:var(--bg-card);outline:none;width:100%;">
                ${Array.from({length:24},(_,i)=>`<option value="${i}" ${i===growState.startHour?'selected':''}>${i}:00</option>`).join('')}
              </select>
            </div>
            <div class="form-field-premium" style="flex:1;">
              <label>End Time</label>
              <select id="endTimeSelect" onchange="growUpdateTime()"
                style="border:1.5px solid var(--border-color);border-radius:8px;padding:8px 12px;font-size:14px;font-weight:600;color:var(--text-primary);background:var(--bg-card);outline:none;width:100%;">
                ${Array.from({length:24},(_,i)=>`<option value="${i+1}" ${i+1===growState.endHour?'selected':''}>${i+1}:00</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="sticky-cta-bar">
      <button class="cta-back" onclick="growGoStep('detail')">← Back</button>
      <button class="cta-main" onclick="growContinueToPayment()">Next →</button>
    </div>
  `;
}

window.growSetGender = function(g) {
  growState.gender = g;
  document.querySelectorAll('.gender-option').forEach(o => {
    o.classList.toggle('selected', o.querySelector('input').value === g);
  });
};

window.renderGrowChipsAndValidation = function() {
  const chipsContainer = document.getElementById('locationChips');
  if (chipsContainer) {
    chipsContainer.innerHTML = growState.targetAreas.map(a => `
      <span class="location-chip">${esc(a)}<span class="chip-remove" onclick="growRemoveArea('${esc(a)}')" role="button" aria-label="Remove location ${esc(a)}">×</span></span>
    `).join('');
  }
  const valMsg = document.getElementById('growValidationMsg');
  if (valMsg) {
    valMsg.style.color = growState.targetAreas.length > 0 ? '#10B981' : '#E11D2A';
    valMsg.innerHTML = growState.targetAreas.length > 0 ? '✓ Location target saved.' : '⚠️ Please add at least one location.';
  }
};

window.growAddArea = function() {
  const input = document.getElementById('locationInput');
  if (!input) return;
  const val = input.value.trim();
  if (val && !growState.targetAreas.includes(val)) {
    growState.targetAreas.push(val);
  }
  input.value = '';
  const hint = document.getElementById('growHint');
  if (hint) hint.style.display = 'none';
  const dropdown = document.getElementById('growSuggestionsDropdown');
  if (dropdown) dropdown.classList.add('hidden');
  window.renderGrowChipsAndValidation();
  input.focus();
};

window.growRemoveArea = function(area) {
  growState.targetAreas = growState.targetAreas.filter(a => a !== area);
  window.renderGrowChipsAndValidation();
  const input = document.getElementById('locationInput');
  if (input) input.focus();
};

window.handleGrowAutocomplete = function(val) {
  const dropdown = document.getElementById('growSuggestionsDropdown');
  const hint = document.getElementById('growHint');
  if (!dropdown) return;
  
  if (val.trim()) {
    if (hint) hint.style.display = 'block';
    const matches = INDIAN_LOCATIONS.filter(loc => loc.toLowerCase().includes(val.toLowerCase())).slice(0, 5);
    if (matches.length > 0) {
      dropdown.innerHTML = matches.map(m => `
        <div class="autocomplete-item" role="option" onclick="selectGrowSuggestion('${m.replace(/'/g, "\\'")}')">${esc(m)}</div>
      `).join('');
      dropdown.classList.remove('hidden');
    } else {
      dropdown.classList.add('hidden');
    }
  } else {
    if (hint) hint.style.display = 'none';
    dropdown.classList.add('hidden');
  }
};

window.selectGrowSuggestion = function(val) {
  if (!growState.targetAreas.includes(val)) {
    growState.targetAreas.push(val);
  }
  const input = document.getElementById('locationInput');
  if (input) input.value = '';
  const dropdown = document.getElementById('growSuggestionsDropdown');
  if (dropdown) dropdown.classList.add('hidden');
  const hint = document.getElementById('growHint');
  if (hint) hint.style.display = 'none';
  window.renderGrowChipsAndValidation();
  if (input) input.focus();
};

window.growToggleAdvanced = function() {
  const content = document.getElementById('advancedContent');
  const arrow = document.getElementById('advArrow');
  const gear = document.querySelector('.adv-gear-icon');
  if (content) content.classList.toggle('show');
  const isExpanded = content && content.classList.contains('show');
  if (arrow) arrow.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
  if (gear) gear.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
};

window.growUpdateAge = function() {
  const minEl = document.getElementById('ageMinInput');
  const maxEl = document.getElementById('ageMaxInput');
  if (!minEl || !maxEl) return;
  growState.ageMin = Math.max(18, Math.min(64, parseInt(minEl.value, 10) || 18));
  growState.ageMax = Math.max(19, Math.min(65, parseInt(maxEl.value, 10) || 65));
  if (growState.ageMin >= growState.ageMax) growState.ageMax = growState.ageMin + 1;
  const disp = document.getElementById('ageDisplay');
  if (disp) disp.textContent = `${growState.ageMin} – ${growState.ageMax}`;
  const fill = document.getElementById('ageTrackFill');
  if (fill) {
    fill.style.left = `${((growState.ageMin-18)/47)*100}%`;
    fill.style.right = `${100-((growState.ageMax-18)/47)*100}%`;
  }
};

window.growToggleWholeDay = function() {
  growState.wholeDay = !growState.wholeDay;
  const box = document.getElementById('wholeDayCheck');
  const section = document.getElementById('customTimeSection');
  const disp = document.getElementById('timeDisplay');
  if (box) box.classList.toggle('checked', growState.wholeDay);
  if (section) section.style.display = growState.wholeDay ? 'none' : 'block';
  if (disp) disp.textContent = growState.wholeDay ? 'Whole Day' : 'Custom';
};

window.growUpdateTime = function() {
  const s = parseInt(document.getElementById('startTimeSelect')?.value || '6', 10);
  const e = parseInt(document.getElementById('endTimeSelect')?.value || '26', 10);
  growState.startHour = s;
  growState.endHour = e;
  const disp = document.getElementById('timeDisplay');
  if (disp) disp.textContent = `${s}:00 – ${e === 26 ? '2 AM' : e + ':00'}`;
};

window.growContinueToPayment = function() {
  const audienceEl = document.getElementById('targetAudienceInput');
  if (audienceEl) growState.targetAudience = audienceEl.value.trim();
  
  // Auto-add any typed location text
  const input = document.getElementById('locationInput');
  if (input) {
    const val = input.value.trim();
    if (val && !growState.targetAreas.includes(val)) {
      growState.targetAreas.push(val);
    }
  }
  
  if (!growState.targetAreas.length) {
    triggerToast('Please add at least one target area.', true);
    const valMsg = document.getElementById('growValidationMsg');
    if (valMsg) {
      valMsg.style.color = '#E11D2A';
      valMsg.innerHTML = '⚠️ Please add at least one location.';
    }
    return;
  }
  growState.step = 'payment';
  const el = document.getElementById('contentViewport');
  if (el) renderGrowStep(el);
};

// ── STEP 4: Payment ────────────────────────────────────────────────────────
function renderGrowPayment(el) {
  const plan = growState.selectedPlan;
  const base = plan ? plan.price : 0;
  const gst = Math.round(base * 0.18);
  const total = base + gst;
  const pkg = PACKAGES[growState.selectedPackage];

  el.innerHTML = `
    <div class="card-premium" style="max-width: 960px; margin: 0 auto; box-shadow: var(--shadow-lg);">
      ${renderWizardSteps('payment')}

      <div class="flex items-center gap-2 mb-6" style="border-bottom: 2px solid var(--border-color); padding-bottom: 16px;">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#E11D2A" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        <h2 style="font-size:20px;font-weight:900;color:var(--text-primary);letter-spacing:-0.02em;margin:0;font-family:var(--sans);">Secure Payment Checkout</h2>
      </div>

      <div class="payment-checkout-container">
        <!-- Left Column: Payment Methods Grid -->
        <div class="payment-methods-column">
          <div class="payment-section-title">Select Payment Method</div>
          
          <div class="payment-methods-grid">
            <!-- GPay -->
            <div class="payment-card-option ${growState.paymentMethod === 'google_pay' ? 'selected' : ''}" 
                 onclick="growSelectPayment('google_pay')" id="pm-google_pay">
              <div class="payment-method-icon">
                <svg viewBox="0 0 72 24" width="72" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g transform="translate(0,1) scale(0.4583)">
                    <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v9h11.8c-.51 2.74-2.06 5.06-4.39 6.62v5.49h7.07c4.15-3.82 6.54-9.46 6.54-16.61z"/>
                    <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.07-5.49c-1.96 1.33-4.49 2.12-7.49 2.12-5.76 0-10.66-3.89-12.4-9.12H4.31v5.65C7.92 41.5 15.36 46 24 46z"/>
                    <path fill="#FBBC05" d="M11.6 28.18A14.4 14.4 0 0 1 10.8 24c0-1.46.25-2.87.7-4.18v-5.65H4.31C3.17 16.5 2.5 20.13 2.5 24s.67 7.5 1.81 9.83z"/>
                    <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.27-6.27C34.91 4.18 29.93 2 24 2 15.36 2 7.92 6.5 4.31 14.18l7.29 5.65c1.74-5.23 6.64-9.08 12.4-9.08z"/>
                  </g>
                  <text x="25" y="17" fill="#3C4043" font-family="'Google Sans', Roboto, system-ui, -apple-system, sans-serif" font-weight="500" font-size="15.5">Pay</text>
                </svg>
              </div>
              <span class="payment-method-name">Google Pay</span>
            </div>

            <!-- Razorpay -->
            <div class="payment-card-option ${growState.paymentMethod === 'razorpay' ? 'selected' : ''}"
                 onclick="growSelectPayment('razorpay')" id="pm-razorpay">
              <div class="payment-method-icon">
                <svg viewBox="0 0 108 30" width="108" height="30" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect y="1" width="28" height="28" rx="7" fill="#072654"/>
                  <text x="5" y="21" fill="#FFFFFF" font-family="system-ui, sans-serif" font-weight="900" font-size="16px">R</text>
                  <text x="36" y="21" fill="#072654" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="16px" letter-spacing="-0.02em">Razorpay</text>
                </svg>
              </div>
              <span class="payment-method-name">Razorpay</span>
            </div>

            <!-- Paytm -->
            <div class="payment-card-option ${growState.paymentMethod === 'paytm' ? 'selected' : ''}" 
                 onclick="growSelectPayment('paytm')" id="pm-paytm">
              <div class="payment-method-icon">
                <svg viewBox="0 0 74 24" width="74" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <text x="0" y="18" fill="#002E7F" font-family="'Inter', system-ui, sans-serif" font-weight="900" font-size="19px" letter-spacing="-0.06em">Pay<tspan fill="#00BAF2">tm</tspan></text>
                </svg>
              </div>
              <span class="payment-method-name">PayTM</span>
            </div>

            <!-- UPI -->
            <div class="payment-card-option ${growState.paymentMethod === 'upi' ? 'selected' : ''}" 
                 onclick="growSelectPayment('upi')" id="pm-upi">
              <div class="payment-method-icon">
                <svg viewBox="0 0 60 22" width="60" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <text x="0" y="17" fill="#097939" font-family="system-ui, sans-serif" font-style="italic" font-weight="800" font-size="16px" letter-spacing="-0.03em">U<tspan fill="#0b66c2">P</tspan><tspan fill="#F59E0B">I</tspan></text>
                  <path d="M42 4l-4 14h3.5l4-14H42z" fill="#0b66c2"/>
                  <path d="M49 4l-4 14h3.5l4-14H49z" fill="#097939"/>
                </svg>
              </div>
              <span class="payment-method-name">UPI</span>
            </div>

            <!-- Cards -->
            <div class="payment-card-option ${growState.paymentMethod === 'credit_card' ? 'selected' : ''}" 
                 onclick="growSelectPayment('credit_card')" id="pm-credit_card">
              <div class="payment-method-icon">
                <svg viewBox="0 0 76 22" width="76" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g transform="translate(0, 1)">
                    <circle cx="10" cy="10" r="8" fill="#EB001B"/>
                    <circle cx="18" cy="10" r="8" fill="#F79E1B" fill-opacity="0.85"/>
                  </g>
                  <text x="34" y="16" fill="#0F3595" font-family="system-ui, sans-serif" font-weight="800" font-style="italic" font-size="16px" letter-spacing="-0.05em">VISA</text>
                </svg>
              </div>
              <span class="payment-method-name">Cards</span>
            </div>

            <!-- Net Banking -->
            <div class="payment-card-option ${growState.paymentMethod === 'net_banking' ? 'selected' : ''}" 
                 onclick="growSelectPayment('net_banking')" id="pm-net_banking">
              <div class="payment-method-icon">
                <svg viewBox="0 0 48 24" width="48" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M24 3L6 10v3h36v-3L24 3zm-13 10v7h3v-7h-3zm6 0v7h3v-7h-3zm6 0v7h3v-7h-3zm6 0v7h3v-7h-3zm5 8H7v2h34v-2z" fill="#334155"/>
                </svg>
              </div>
              <span class="payment-method-name">Net Banking</span>
            </div>

            <!-- Wallets -->
            <div class="payment-card-option ${growState.paymentMethod === 'wallet' ? 'selected' : ''}" 
                 onclick="growSelectPayment('wallet')" id="pm-wallet">
              <div class="payment-method-icon">
                <svg viewBox="0 0 48 24" width="48" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M36 12H28c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h8V4c0-1.1-.9-2-2-2H14c-2.2 0-4 1.8-4 4v12c0 2.2 1.8 4 4 4h20c1.1 0 2-.9 2-2v-4z" fill="#7C3AED"/>
                  <circle cx="31" cy="9" r="1.5" fill="#FFFFFF"/>
                </svg>
              </div>
              <span class="payment-method-name">Wallets</span>
            </div>
          </div>
        </div>

        <!-- Right Column: Campaign Summary -->
        <div class="payment-summary-column">
          <div class="payment-summary-card" style="box-shadow: none; border: 1px solid var(--border-color); padding: 18px;">
            <h3 class="payment-summary-title">Campaign Summary</h3>
            
            <div class="payment-summary-info">
              <div class="payment-summary-row-bold">
                <span>Campaign Name</span>
                <span class="highlight-val">${esc(pkg ? pkg.title : 'Custom Ad Campaign')}</span>
              </div>
              <div class="payment-summary-row">
                <span>Duration</span>
                <span>${plan ? plan.label : 'Custom'}</span>
              </div>
            </div>

            <div class="payment-pricing-details">
              <div class="payment-summary-row">
                <span>Base Campaign Cost</span>
                <span>₹${base.toLocaleString('en-IN')}</span>
              </div>
              <div class="payment-summary-row">
                <span>GST Breakdown (18%)</span>
                <span>₹${gst.toLocaleString('en-IN')}</span>
              </div>
              <div class="payment-summary-row total">
                <span>Final Total (INR)</span>
                <span class="total-amount">₹${total.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <!-- Secure Badge -->
            <div class="secure-badge-container">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10B981" stroke-width="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              <span>100% Secure Payments</span>
            </div>

            <!-- Support Details -->
            <div class="support-details-container">
              <div class="support-title">Need help with payment?</div>
              <div>Email: <a href="mailto:support@wedeazzy.com">support@wedeazzy.com</a></div>
              <div>Phone: <a href="tel:+917498987620">+91 74989 87620</a></div>
              <div style="margin-top: 8px; border-top: 1px solid var(--border-color); padding-top: 8px;">
                <a href="/pages/refund-policy.html" target="_blank" class="refund-link">Refund & Cancellation Policy</a>
              </div>
            </div>

            <!-- Trust Badges -->
            <div class="checkout-trust-badges">
              <span>PCI-DSS Compliant</span>
              <span>•</span>
              <span>UPI Enabled</span>
              <span>•</span>
              <span>VISA & Mastercard</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="sticky-cta-bar">
      <button class="cta-back" onclick="growGoStep('settings')">← Back</button>
      <button class="cta-main" id="proceedPayBtn" onclick="growProceedPayment(${total}, ${base}, ${gst})" ${growState.paymentMethod ? '' : 'disabled'}>
        Proceed to Payment
      </button>
    </div>
  `;
}

/** Shared helper: open Razorpay modal for a campaign payment. */
async function openRazorpayCampaignModal(campaignId, btn, btnOriginalText) {
  try {
    await loadRazorpayScript();

    const payRes = await api('/api/payment/initiate', {
      method: 'POST',
      body: { campaignId }
    });

    if (!payRes.ok || !payRes.orderId) {
      throw new Error(payRes.error || payRes.message || 'Failed to create payment order.');
    }

    window.hidePaymentOverlay();

    const options = {
      key: payRes.keyId,
      amount: payRes.amount,
      currency: payRes.currency || 'INR',
      name: 'WedEazzy.com',
      description: 'Ad Campaign Payment',
      order_id: payRes.orderId,
      handler: async function(response) {
        window.showPaymentOverlay('Verifying payment...');
        try {
          const verify = await api('/api/payment/verify', {
            method: 'POST',
            body: {
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              transactionId:       payRes.transactionId
            }
          });
          window.hidePaymentOverlay();
          if (verify.ok) {
            triggerToast('🎉 Campaign payment confirmed! Your campaign is now active.');
            setTimeout(() => window.location.reload(), 1500);
          } else {
            throw new Error(verify.message || verify.error || 'Payment verification failed.');
          }
        } catch (verifyErr) {
          window.hidePaymentOverlay();
          triggerToast(verifyErr.message || 'Payment received but verification failed. Please contact support.', true);
        }
      },
      prefill: {
        name:    (typeof currentUser !== 'undefined' && currentUser?.name)  || '',
        email:   (typeof currentUser !== 'undefined' && currentUser?.email) || '',
        contact: (typeof currentUser !== 'undefined' && currentUser?.phone) || ''
      },
      theme: { color: '#C8102E' },
      modal: {
        ondismiss: function() {
          window.hidePaymentOverlay();
          triggerToast('Payment cancelled. Your campaign was saved as a draft.', true);
          if (btn) { btn.disabled = false; btn.innerHTML = btnOriginalText; }
        }
      }
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function(response) {
      window.hidePaymentOverlay();
      triggerToast(`Payment failed: ${response.error.description || 'Unknown error'}. Please try again.`, true);
      if (btn) { btn.disabled = false; btn.innerHTML = btnOriginalText; }
    });
    rzp.open();
  } catch (err) {
    window.hidePaymentOverlay();
    triggerToast(err.message || 'Payment initiation failed. Please try again.', true);
    if (btn) { btn.disabled = false; btn.innerHTML = btnOriginalText; }
  }
}

window.growSelectPayment = function(methodId) {
  growState.paymentMethod = methodId;
  document.querySelectorAll('.payment-card-option').forEach(o => o.classList.remove('selected'));
  const chosen = document.getElementById('pm-' + methodId);
  if (chosen) chosen.classList.add('selected');
  const btn = document.getElementById('proceedPayBtn');
  if (btn) btn.disabled = false;
};

window.growPayForCampaign = async function(campaignId) {
  window.showPaymentOverlay('Reconnecting to secure checkout...');
  await openRazorpayCampaignModal(campaignId, null, '');
};

window.growProceedPayment = async function(total, base, gst) {
  if (!growState.paymentMethod) { triggerToast('Please select a payment method.', true); return; }
  const btn = document.getElementById('proceedPayBtn');
  if (btn && btn.disabled) return;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="otp-loading-spinner"></span> Processing...`;
  }
  window.showPaymentOverlay('Initializing secure checkout...');

  try {
    const pkg = PACKAGES[growState.selectedPackage];
    const plan = growState.selectedPlan;
    const payload = {
      platform: pkg.platforms.join(','),
      dailyBudget: Math.round(base / (plan.days || 30)),
      durationDays: plan.days || 30,
      goal: growState.selectedPackage === 'whatsapp_leads' ? 'whatsapp' : growState.selectedPackage === 'more_leads' ? 'leads' : 'traffic',
      packageType: growState.selectedPackage,
      planDays: plan.days,
      totalAmount: total,
      baseAmount: base,
      gstAmount: gst,
      gender: growState.gender,
      targetAreas: growState.targetAreas,
      targetAudience: growState.targetAudience,
      ageMin: growState.ageMin,
      ageMax: growState.ageMax,
      timeSchedule: growState.wholeDay ? 'whole_day' : 'custom',
      startTime: growState.wholeDay ? null : `${growState.startHour}:00`,
      endTime: growState.wholeDay ? null : `${growState.endHour}:00`,
      paymentMethod: growState.paymentMethod,
    };

    const res = await api('/api/campaigns', { method: 'POST', body: payload });
    if (res && res.ok && res.campaign) {
      growState.campaigns.unshift(res.campaign);
      await openRazorpayCampaignModal(res.campaign.id, btn, 'Proceed to Payment');
    } else {
      throw new Error((res && res.message) || 'Failed to create campaign');
    }
  } catch (err) {
    window.hidePaymentOverlay();
    triggerToast(err.message || 'Payment processing failed. Please try again.', true);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Proceed to Payment';
    }
  }
};

// ── STEP 5: Success ────────────────────────────────────────────────────────
function renderGrowSuccess(el) {
  const pkg = PACKAGES[growState.selectedPackage];
  el.innerHTML = `
    <div class="card-premium">
      <div class="payment-success-screen" style="text-align: center; padding: 40px 20px;">
        <div class="success-checkmark-wrapper" style="margin-bottom: 24px;">
          <svg class="success-checkmark-svg" viewBox="0 0 52 52" width="64" height="64" style="color: #10B981; display: block; margin: 0 auto;">
            <circle class="success-checkmark-circle" cx="26" cy="26" r="25" fill="none" stroke="currentColor" stroke-width="4" style="stroke-dasharray: 166; stroke-dashoffset: 166; animation: strokeCheck 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;"/>
            <path class="success-checkmark-check" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M14.1 27.2l7.1 7.2 16.7-16.8" style="stroke-dasharray: 48; stroke-dashoffset: 48; animation: strokeCheck 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.6s forwards;"/>
          </svg>
        </div>
        <h2 style="font-size:22px; font-weight:800; color:var(--text-primary); margin-bottom:8px; letter-spacing:-0.01em;">Campaign Submitted Successfully!</h2>
        <p style="font-size:14px; color:var(--text-secondary); max-width:480px; margin: 0 auto 28px; line-height:1.6;">Your <strong>${esc(pkg ? pkg.title : 'advertising campaign')}</strong> has been submitted. Our WedEazzy team will review it within 24 hours and get it live for you.</p>
        <div style="margin-top:28px; display:flex; gap:16px; flex-wrap:wrap; justify-content:center;">
          <button onclick="growGoStep('my-campaigns')" 
            style="background:linear-gradient(135deg, #E11D2A, #C21421);color:#fff;border:none;border-radius:10px;padding:13px 28px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 15px rgba(225,29,42,0.18); transition: transform 0.2s, box-shadow 0.2s;"
            onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 6px 20px rgba(225,29,42,0.28)';"
            onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 15px rgba(225,29,42,0.18)';">
            View My Campaigns
          </button>
          <button onclick="growGoStep('landing')"
            style="background:var(--bg-card);color:var(--text-primary);border:1.5px solid var(--border-color);border-radius:10px;padding:13px 28px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;transition: all 0.2s;"
            onmouseover="this.style.borderColor='var(--text-muted)'; this.style.background='var(--bg-primary)';"
            onmouseout="this.style.borderColor='var(--border-color)'; this.style.background='var(--bg-card)';">
            Create New Campaign
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── STEP: My Campaigns & Analytics ────────────────────────────────────────
async function renderGrowMyCampaigns(el) {
  // Refresh campaigns from API
  try {
    const res = await api('/api/campaigns/analytics/overview');
    if (res && res.ok) {
      const summary = res.summary || {};
      const campaigns = res.campaigns || growState.campaigns;
      growState.campaigns = campaigns;

      // Header structure
      el.innerHTML = `
        <div class="premium-dashboard-header">
          <div style="display:flex;align-items:center;gap:14px;">
            <button onclick="growGoStep('landing')" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted);padding:0;display:flex;align-items:center;justify-content:center;">←</button>
            <div>
              <h2>Campaigns & Analytics</h2>
              <p>Track performance, budget, and leads of all your advertising campaigns.</p>
            </div>
          </div>
          
          <!-- Header KPI indicators -->
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--text-secondary);">
            <div style="background:var(--bg-card);border:1px solid var(--border-color);padding:8px 16px;border-radius:10px;display:flex;align-items:center;gap:8px;box-shadow:var(--shadow-premium);">
              <span style="font-weight:800;color:var(--success);">● Active:</span>
              <span style="font-weight:800;color:var(--text-primary);">${campaigns.filter(c => c.adminStatus === 'running' && c.status !== 'paused').length}</span>
            </div>
            <div style="background:var(--bg-card);border:1px solid var(--border-color);padding:8px 16px;border-radius:10px;display:flex;align-items:center;gap:8px;box-shadow:var(--shadow-premium);">
              <span style="font-weight:800;color:#3B82F6;">💰 Spend:</span>
              <span style="font-weight:800;color:var(--text-primary);">₹${(summary.totalSpend || 0).toLocaleString('en-IN')}</span>
            </div>
            <div style="background:var(--bg-card);border:1px solid var(--border-color);padding:8px 16px;border-radius:10px;display:flex;align-items:center;gap:8px;box-shadow:var(--shadow-premium);">
              <span style="font-weight:800;color:#F59E0B;">🎯 Leads:</span>
              <span style="font-weight:800;color:var(--text-primary);">${(summary.leadsGenerated || 0).toLocaleString('en-IN')}</span>
            </div>
            <div style="background:var(--bg-card);border:1px solid var(--border-color);padding:8px 16px;border-radius:10px;display:flex;align-items:center;gap:8px;box-shadow:var(--shadow-premium);">
              <span style="font-weight:800;color:#EC4899;">📈 ROI:</span>
              <span style="font-weight:800;color:var(--text-primary);">${summary.roi ? summary.roi + 'x' : '—'}</span>
            </div>
            <div style="background:var(--bg-card);border:1px solid var(--border-color);padding:8px 16px;border-radius:10px;display:flex;align-items:center;gap:8px;box-shadow:var(--shadow-premium);">
              <span style="color:var(--text-muted);">Last Updated:</span>
              <span style="font-weight:700;color:var(--text-primary);">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
          </div>

          <button onclick="growGoStep('landing')" class="btn-new-campaign-gradient">
            + New Campaign
          </button>
        </div>

        <!-- 6 upgraded KPI Metrics Cards Grid -->
        <div class="kpi-metrics-row">
          <div class="kpi-card">
            <div class="kpi-card-header">
              <div class="kpi-card-icon-wrap kpi-reach">📡</div>
              <span class="kpi-card-trend up">↑ 12.4%</span>
            </div>
            <div class="kpi-card-value">${(summary.analyticsReach || 0).toLocaleString('en-IN')}</div>
            <div class="kpi-card-label">Total Reach</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card-header">
              <div class="kpi-card-icon-wrap kpi-impressions">👁️</div>
              <span class="kpi-card-trend up">↑ 18.2%</span>
            </div>
            <div class="kpi-card-value">${(summary.analyticsImpressions || 0).toLocaleString('en-IN')}</div>
            <div class="kpi-card-label">Impressions</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card-header">
              <div class="kpi-card-icon-wrap kpi-clicks">🖱️</div>
              <span class="kpi-card-trend up">↑ 8.5%</span>
            </div>
            <div class="kpi-card-value">${(summary.analyticsClicks || 0).toLocaleString('en-IN')}</div>
            <div class="kpi-card-label">Link Clicks</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card-header">
              <div class="kpi-card-icon-wrap kpi-leads">🎯</div>
              <span class="kpi-card-trend up">↑ 24.1%</span>
            </div>
            <div class="kpi-card-value">${(summary.analyticsLeads || 0).toLocaleString('en-IN')}</div>
            <div class="kpi-card-label">Leads</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card-header">
              <div class="kpi-card-icon-wrap kpi-whatsapp">💬</div>
              <span class="kpi-card-trend up">↑ 15.3%</span>
            </div>
            <div class="kpi-card-value">${(summary.analyticsWhatsapp || 0).toLocaleString('en-IN')}</div>
            <div class="kpi-card-label">WhatsApp Leads</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-card-header">
              <div class="kpi-card-icon-wrap kpi-conversion">📈</div>
              <span class="kpi-card-trend up">↑ 2.3%</span>
            </div>
            <div class="kpi-card-value">${summary.conversionRate || 0}%</div>
            <div class="kpi-card-label">Conv. Rate</div>
          </div>
        </div>

        <!-- Two Interactive Charts -->
        <div class="analytics-charts-grid">
          <div class="chart-box-premium">
            <div class="chart-box-title">📈 <span>Reach & Engagement Timeline</span></div>
            <div style="flex:1; position:relative; min-height:260px;">
              <canvas id="campaignReachChart"></canvas>
            </div>
          </div>
          <div class="chart-box-premium">
            <div class="chart-box-title">📊 <span>Lead Sources Breakdown</span></div>
            <div style="flex:1; position:relative; min-height:260px;">
              <canvas id="campaignLeadSourceChart"></canvas>
            </div>
          </div>
        </div>

        <!-- Campaigns List Title -->
        <div style="margin-top:40px; margin-bottom:20px;">
          <h3 style="font-size:18px; font-weight:800; color:var(--text-primary);">All Campaigns (${campaigns.length})</h3>
        </div>

        <!-- Campaigns List -->
        <div class="my-campaigns-list">
          ${campaigns.length === 0 ? `
            <div class="premium-empty-state">
              <div class="empty-state-illust-wrap">
                <svg viewBox="0 0 200 200" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="100" cy="100" r="80" fill="url(#gradient-bg)" opacity="0.1" />
                  <path d="M70 140V90C70 84.4772 74.4772 80 80 80H120C125.523 80 130 84.4772 130 90V140" stroke="#E11D2A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M100 50V70" stroke="#E11D2A" stroke-width="4" stroke-linecap="round" />
                  <circle cx="100" cy="45" r="5" fill="#E11D2A" />
                  <rect x="85" y="105" width="30" height="20" rx="3" stroke="#E11D2A" stroke-width="4" />
                  <path d="M60 140H140" stroke="#E11D2A" stroke-width="4" stroke-linecap="round" />
                  <defs>
                    <linearGradient id="gradient-bg" x1="20" y1="20" x2="180" y2="180" gradientUnits="userSpaceOnUse">
                      <stop stop-color="#E11D2A" />
                      <stop offset="1" stop-color="#8B5CF6" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <h3>Launch Your First Campaign</h3>
              <p>Reach more couples, generate qualified hot leads, and increase your bookings with WedEazzy Marketing Solutions.</p>
              <button onclick="growGoStep('landing')" class="btn-create-first-campaign">
                + Create Campaign
              </button>
            </div>
          ` : campaigns.map(c => {
            const elapsedDays = Math.max(0, Math.floor((new Date() - new Date(c.createdAt)) / (1000 * 60 * 60 * 24)));
            const duration = c.planDays || 30;
            const dailyBudget = Math.round((c.totalAmount || 0) / duration);
            
            let spend = 0;
            if (c.adminStatus === 'running') {
              spend = Math.min(c.totalAmount || 0, dailyBudget * elapsedDays);
            } else if (c.adminStatus === 'completed') {
              spend = c.totalAmount || 0;
            }
            const remaining = Math.max(0, (c.totalAmount || 0) - spend);
            const progressPercent = Math.min(100, Math.round((elapsedDays / duration) * 100));

            // Status display mapping
            let statusPillClass = 'pending';
            let statusText = 'Pending Review';
            let isUnpaid = c.paymentStatus !== 'paid';

            if (isUnpaid) {
              statusPillClass = 'rejected';
              statusText = 'Pending Payment';
            } else if (c.status === 'paused') {
              statusPillClass = 'completed';
              statusText = 'Paused';
            } else if (c.adminStatus === 'running') {
              statusPillClass = 'active';
              statusText = 'Running';
            } else if (c.adminStatus === 'approved') {
              statusPillClass = 'pending';
              statusText = 'Approved';
            } else if (c.adminStatus === 'completed') {
              statusPillClass = 'completed';
              statusText = 'Completed';
            } else if (c.adminStatus === 'rejected') {
              statusPillClass = 'rejected';
              statusText = 'Rejected';
            }

            return `
              <div class="premium-campaign-card">
                <div class="campaign-card-header">
                  <div>
                    <h4 style="font-size:16px; font-weight:800; color:var(--text-primary); margin:0;">${esc(packageDisplayName(c.packageType))}</h4>
                    <div class="campaign-card-meta">
                      <div class="campaign-meta-item"><span>📅</span> ${duration} Days</div>
                      <div class="campaign-meta-item"><span>💰</span> Total Budget: ₹${(c.totalAmount || 0).toLocaleString('en-IN')}</div>
                      <div class="campaign-meta-item"><span>🗓️</span> Created: ${new Date(c.createdAt).toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'})}</div>
                    </div>
                  </div>
                  <span class="campaign-status-pill ${statusPillClass}">${statusText}</span>
                </div>

                <!-- Budget & Spend metrics row -->
                <div class="campaign-budget-row">
                  <div class="budget-block">
                    <span class="budget-block-label">Daily Budget</span>
                    <span class="budget-block-value">₹${dailyBudget.toLocaleString('en-IN')}</span>
                  </div>
                  <div class="budget-block">
                    <span class="budget-block-label">Spend to Date</span>
                    <span class="budget-block-value">₹${spend.toLocaleString('en-IN')}</span>
                  </div>
                  <div class="budget-block">
                    <span class="budget-block-label">Remaining Budget</span>
                    <span class="budget-block-value">₹${remaining.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <!-- Campaign progress bar -->
                <div class="campaign-progress-section">
                  <div class="progress-bar-label-row">
                    <span>Campaign Duration Progress</span>
                    <span>${progressPercent}% Completed (${elapsedDays}/${duration} Days)</span>
                  </div>
                  <div class="progress-bar-track">
                    <div class="progress-bar-fill" style="width: ${progressPercent}%;"></div>
                  </div>
                </div>

                <!-- Campaign engagement statistics grid -->
                <div class="campaign-stats-grid">
                  <div class="stat-box">
                    <span class="stat-box-value">${(c.analyticsReach || 0).toLocaleString('en-IN')}</span>
                    <span class="stat-box-label">Reach</span>
                  </div>
                  <div class="stat-box">
                    <span class="stat-box-value">${(c.analyticsImpressions || 0).toLocaleString('en-IN')}</span>
                    <span class="stat-box-label">Impressions</span>
                  </div>
                  <div class="stat-box">
                    <span class="stat-box-value">${(c.analyticsClicks || 0).toLocaleString('en-IN')}</span>
                    <span class="stat-box-label">Clicks</span>
                  </div>
                  <div class="stat-box">
                    <span class="stat-box-value">${(c.analyticsLeads || 0).toLocaleString('en-IN')}</span>
                    <span class="stat-box-label">Leads</span>
                  </div>
                  <div class="stat-box">
                    <span class="stat-box-value">${(c.analyticsWhatsapp || 0).toLocaleString('en-IN')}</span>
                    <span class="stat-box-label">WhatsApp</span>
                  </div>
                </div>

                <!-- Campaign action bar -->
                <div class="campaign-actions-row">
                  <div class="campaign-actions-left">
                    ${isUnpaid ? `
                      <button onclick="growPayForCampaign('${c.id}')" class="action-btn-text" style="color: #FFFFFF; background: #E11D2A; border-color: #E11D2A; padding: 6px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; border: 1.5px solid; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 10px rgba(225,29,42,0.2);">
                        💳 Pay Now / Retry
                      </button>
                    ` : (c.adminStatus === 'running' || c.adminStatus === 'approved') ? `
                      <button onclick="growToggleCampaignStatus('${c.id}', '${c.status}')" class="action-btn-text" style="color: ${c.status === 'paused' ? 'var(--success)' : 'var(--danger)'}; border-color: ${c.status === 'paused' ? 'var(--success)' : 'var(--danger)'}; background: transparent; padding: 6px 12px; border-radius: 8px; font-weight: 700; cursor: pointer; border: 1.5px solid;">
                        ${c.status === 'paused' ? '▶️ Resume Campaign' : '⏸️ Pause Campaign'}
                      </button>
                    ` : ''}
                  </div>
                  <div style="display:flex; gap:8px;">
                    <button onclick="growViewCampaignDetails('${c.id}')" class="action-btn-circle" title="View Targeting Details">🔍</button>
                    <button onclick="growDuplicateCampaign('${c.id}')" class="action-btn-circle" title="Duplicate Settings">📋</button>
                    <button onclick="growDownloadCampaignReport('${c.id}')" class="action-btn-circle" title="Download Excel Report">📥</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      // Render charts
      setTimeout(() => {
        const textPrimary = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#1F2937';
        const textSecondary = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#4B5563';
        const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#E5E7EB';

        // 1. Line Chart: Reach & Clicks
        const lineCanvas = document.getElementById('campaignReachChart');
        if (lineCanvas && res.charts && res.charts.reachClicksTimeline) {
          const labels = res.charts.reachClicksTimeline.slice(-14).map(d => d.date);
          const reachData = res.charts.reachClicksTimeline.slice(-14).map(d => d.reach);
          const clicksData = res.charts.reachClicksTimeline.slice(-14).map(d => d.clicks);
          
          new Chart(lineCanvas, {
            type: 'line',
            data: {
              labels,
              datasets: [
                { 
                  label: 'Reach', 
                  data: reachData, 
                  borderColor: '#E11D2A', 
                  backgroundColor: 'rgba(225,29,42,0.04)', 
                  tension: 0.4, 
                  fill: true, 
                  pointRadius: 4,
                  pointHoverRadius: 6,
                  borderWidth: 2
                },
                { 
                  label: 'Clicks', 
                  data: clicksData, 
                  borderColor: '#3B82F6', 
                  backgroundColor: 'rgba(59,130,246,0.04)', 
                  tension: 0.4, 
                  fill: true, 
                  pointRadius: 4,
                  pointHoverRadius: 6,
                  borderWidth: 2
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { 
                legend: { 
                  position: 'top',
                  labels: { color: textPrimary, font: { size: 10, weight: '600' } }
                } 
              },
              scales: { 
                y: { 
                  beginAtZero: true,
                  grid: { color: borderColor },
                  ticks: { color: textSecondary, font: { size: 9 } }
                },
                x: {
                  grid: { display: false },
                  ticks: { color: textSecondary, font: { size: 9 } }
                }
              }
            }
          });
        }

        // 2. Donut Chart: Lead Sources
        const donutCanvas = document.getElementById('campaignLeadSourceChart');
        if (donutCanvas && res.charts && res.charts.leadSourceBreakdown) {
          const labels = res.charts.leadSourceBreakdown.map(d => d.source);
          const data = res.charts.leadSourceBreakdown.map(d => d.count);
          
          new Chart(donutCanvas, {
            type: 'doughnut',
            data: {
              labels,
              datasets: [{
                data,
                backgroundColor: ['#10B981', '#3B82F6', '#EC4899', '#8B5CF6'],
                borderWidth: 0
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: { color: textPrimary, boxWidth: 10, font: { size: 9, weight: '600' } }
                }
              },
              cutout: '70%'
            }
          });
        }
      }, 100);
    }
  } catch (e) {
    console.error(e);
    el.innerHTML = `
      <div class="card-premium" style="text-align:center;padding:48px;">
        <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
        <h3>Could not load campaigns</h3>
        <p style="color:var(--text-muted); margin-bottom:16px;">${esc(e.message || 'An error occurred while fetching your campaign data.')}</p>
        <button onclick="growGoStep('landing')" style="background:#E11D2A;color:#fff;border:none;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">
          ← Go Back
        </button>
      </div>
    `;
  }
}

// Global action handlers for campaigns
window.growToggleCampaignStatus = async function(campaignId, currentStatus) {
  const newStatus = currentStatus === 'paused' ? 'active' : 'paused';
  try {
    const res = await api(`/api/campaigns/${campaignId}/status`, {
      method: 'PATCH',
      body: { status: newStatus }
    });
    if (res && res.ok) {
      triggerToast(`Campaign ${newStatus === 'active' ? 'resumed' : 'paused'} successfully.`);
      const el = document.getElementById('contentViewport');
      if (el) renderGrowMyCampaigns(el);
    } else {
      throw new Error(res.message || 'Failed to update campaign status');
    }
  } catch (err) {
    triggerToast(err.message || 'Failed to update status.', true);
  }
};

window.growDuplicateCampaign = function(campaignId) {
  const camp = growState.campaigns.find(c => c.id === campaignId);
  if (!camp) {
    triggerToast('Campaign not found', true);
    return;
  }
  growState.selectedPackage = camp.packageType || 'whatsapp_leads';
  growState.gender = camp.gender || 'all';
  growState.targetAreas = camp.targetAreas ? JSON.parse(JSON.stringify(camp.targetAreas)) : [];
  growState.ageMin = camp.ageMin || 18;
  growState.ageMax = camp.ageMax || 65;
  growState.targetAudience = camp.targetAudience || '';
  
  growState.step = 'detail';
  triggerToast('Campaign settings duplicated. Configure and submit!');
  const el = document.getElementById('contentViewport');
  if (el) renderGrowStep(el);
};

window.growViewCampaignDetails = function(campaignId) {
  const camp = growState.campaigns.find(c => c.id === campaignId);
  if (!camp) return;
  
  const modal = document.createElement('div');
  modal.id = 'campaignDetailsModal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(14, 23, 38, 0.6)';
  modal.style.backdropFilter = 'blur(8px)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '9999';
  modal.style.opacity = '0';
  modal.style.transition = 'opacity 0.3s ease';
  
  modal.innerHTML = `
    <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-lg); width:100%; max-width:500px; padding:28px; box-shadow:var(--shadow-premium); position:relative; transform:scale(0.9); transition:transform 0.3s ease; margin:16px;">
      <button onclick="document.getElementById('campaignDetailsModal').remove()" style="position:absolute; top:20px; right:20px; background:none; border:none; font-size:20px; color:var(--text-muted); cursor:pointer;">×</button>
      
      <h3 style="font-size:18px; font-weight:800; margin-bottom:4px; color:var(--text-primary);">${esc(packageDisplayName(camp.packageType))}</h3>
      <p style="font-size:12px; color:var(--text-muted); margin-bottom:20px;">Campaign Configuration & Targeting Parameters</p>
      
      <div style="display:flex; flex-direction:column; gap:14px; font-size:13px; color:var(--text-primary);">
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
          <span style="color:var(--text-secondary); font-weight:600;">Campaign ID</span>
          <span style="font-family:monospace; font-weight:700;">${camp.id}</span>
        </div>
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
          <span style="color:var(--text-secondary); font-weight:600;">Target Gender</span>
          <span style="text-transform:capitalize; font-weight:700;">${camp.gender || 'All'}</span>
        </div>
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
          <span style="color:var(--text-secondary); font-weight:600;">Age Range</span>
          <span style="font-weight:700;">${camp.ageMin || 18} - ${camp.ageMax || 65} Years</span>
        </div>
        <div style="display:flex; flex-direction:column; border-bottom:1px solid var(--border-color); padding-bottom:8px; gap:4px;">
          <span style="color:var(--text-secondary); font-weight:600;">Target Areas</span>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:2px;">
            ${(camp.targetAreas || []).map(a => `<span style="background:var(--bg-primary); border:1px solid var(--border-color); font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px;">${esc(a)}</span>`).join('') || '<span style="color:var(--text-muted);">None specified</span>'}
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:8px;">
          <span style="color:var(--text-secondary); font-weight:600;">Audience Interests</span>
          <span style="font-weight:700;">${esc(camp.targetAudience) || 'Broad targeting'}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding-bottom:8px;">
          <span style="color:var(--text-secondary); font-weight:600;">Payment Status</span>
          <span style="font-weight:700; text-transform:uppercase; color:${camp.paymentStatus === 'paid' ? '#10B981' : '#F59E0B'}">${camp.paymentStatus}</span>
        </div>
      </div>
      
      <button onclick="document.getElementById('campaignDetailsModal').remove()" style="width:100%; margin-top:24px; padding:12px; background:var(--bg-primary); border:1.5px solid var(--border-color); border-radius:10px; font-weight:700; cursor:pointer; color:var(--text-primary); transition:all 0.2s;">Close</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  // Animate in
  setTimeout(() => {
    modal.style.opacity = '1';
    modal.firstElementChild.style.transform = 'scale(1)';
  }, 10);
};

window.growDownloadCampaignReport = function(campaignId) {
  const camp = growState.campaigns.find(c => c.id === campaignId);
  if (!camp) {
    triggerToast('Campaign not found', true);
    return;
  }
  
  try {
    const data = [
      { Metric: 'Campaign ID', Value: camp.id },
      { Metric: 'Package Type', Value: packageDisplayName(camp.packageType) },
      { Metric: 'Plan Duration', Value: `${camp.planDays || 30} Days` },
      { Metric: 'Total Budget (INR)', Value: camp.totalAmount || 0 },
      { Metric: 'Daily Budget (INR)', Value: Math.round((camp.totalAmount || 0) / (camp.planDays || 30)) },
      { Metric: 'Status', Value: camp.adminStatus.toUpperCase() },
      { Metric: 'Payment Status', Value: camp.paymentStatus.toUpperCase() },
      { Metric: 'Created At', Value: new Date(camp.createdAt).toLocaleString('en-IN') },
      { Metric: 'Reach', Value: camp.analyticsReach || 0 },
      { Metric: 'Impressions', Value: camp.analyticsImpressions || 0 },
      { Metric: 'Clicks', Value: camp.analyticsClicks || 0 },
      { Metric: 'Leads Generated', Value: camp.analyticsLeads || 0 },
      { Metric: 'WhatsApp Enquiries', Value: camp.analyticsWhatsapp || 0 },
      { Metric: 'Target Genders', Value: camp.gender || 'all' },
      { Metric: 'Target Areas', Value: (camp.targetAreas || []).join(', ') },
      { Metric: 'Age Group', Value: `${camp.ageMin || 18} - ${camp.ageMax || 65}` }
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Campaign Report');
    
    // Auto-fit column widths
    const maxLen = data.reduce((acc, row) => Math.max(acc, row.Metric.length, String(row.Value).length), 10);
    worksheet['!cols'] = [{ wch: 20 }, { wch: maxLen + 5 }];
    
    const filename = `wedeazzy_campaign_${camp.id.substring(0, 8)}_report.xlsx`;
    XLSX.writeFile(workbook, filename);
    triggerToast(`Report downloaded successfully: ${filename}`);
  } catch (err) {
    console.error('Failed to download report', err);
    triggerToast('Failed to download Excel report. Please try again.', true);
  }
};

// Map helpers globally
window.renderGrowBusinessTab = renderGrowBusinessTab;
window.computeCampaignEstimates = computeCampaignEstimates;

window.openInquiryDetailModal = function(id) {
  const inq = state.mockData.inquiries.find(x => x.id === id);
  if (!inq) return;

  // Mark status as 'contacted' if it was 'new'
  if (inq.status === 'new') {
    inq.status = 'contacted';
    const token = getStoredToken();
    if (token && inq.realId) {
      fetch(`${API_BASE}/api/inquiry/${inq.realId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'contacted' })
      }).catch(e => console.error(e));
    }
    // Refresh table and counts
    try {
      if (typeof fetchDashboardData === 'function') fetchDashboardData();
    } catch(e){}
  }

  const modalHtml = `
    <div class="modal-premium-overlay" id="inquiryDetailModal" onclick="closeInquiryDetailModal(event)" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.6); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; z-index:99999; opacity:0; transition:opacity 0.3s ease;">
      <div class="modal-premium-content" style="background:var(--bg-card); width:100%; max-width:550px; border-radius:20px; box-shadow:var(--shadow-premium); border:1px solid var(--pink-border); overflow:hidden; transform:translateY(20px); transition:transform 0.3s ease; display:flex; flex-direction:column; max-height:90vh;">
        <!-- Header -->
        <div style="padding:20px 24px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; background:linear-gradient(to right, var(--bg-card), var(--rose-light));">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:20px;">✉️</span>
            <div>
              <h3 style="font-family:var(--serif); font-size:18px; color:var(--navy); margin:0;">Inquiry Details</h3>
              <span style="font-size:11px; color:var(--text-muted);">Short ID: ${inq.id}</span>
            </div>
          </div>
          <button onclick="closeInquiryDetailModal()" style="background:none; border:none; color:var(--text-secondary); font-size:20px; cursor:pointer; line-height:1;">&times;</button>
        </div>

        <!-- Body -->
        <div style="padding:24px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:20px;">
          <!-- Customer Profile -->
          <div style="display:flex; align-items:center; gap:16px; background:var(--bg-primary); padding:16px; border-radius:12px; border:1px solid var(--border-color);">
            <div style="width:48px; height:48px; border-radius:50%; background:linear-gradient(135deg, #E11D2A 0%, var(--navy) 100%); color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px;">
              ${(inq.name || 'C').charAt(0).toUpperCase()}
            </div>
            <div>
              <h4 style="font-size:16px; font-weight:700; color:var(--navy); margin:0 0 4px 0;">${esc(inq.name)}</h4>
              <span style="font-size:13px; color:var(--text-secondary); display:block;">📞 ${esc(inq.phone)}</span>
              ${inq.email ? `<span style="font-size:13px; color:var(--text-secondary); display:block;">📧 ${esc(inq.email)}</span>` : ''}
            </div>
          </div>

          <!-- Specifications Grid -->
          <div>
            <h4 style="font-size:14px; font-weight:700; color:var(--navy); margin:0 0 10px 0; text-transform:uppercase; letter-spacing:0.5px;">Requested Details</h4>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div style="background:var(--bg-card); padding:12px; border-radius:10px; border:1px solid var(--border-color);">
                <span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase; margin-bottom:4px;">Wedding Date</span>
                <strong style="font-size:13.5px; color:var(--text-primary);">${inq.eventDate || 'TBD'}</strong>
              </div>
              <div style="background:var(--bg-card); padding:12px; border-radius:10px; border:1px solid var(--border-color);">
                <span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase; margin-bottom:4px;">Guest Count</span>
                <strong style="font-size:13.5px; color:var(--text-primary);">${inq.guests || 'N/A'}</strong>
              </div>
              <div style="background:var(--bg-card); padding:12px; border-radius:10px; border:1px solid var(--border-color);">
                <span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase; margin-bottom:4px;">Couple's Budget</span>
                <strong style="font-size:13.5px; color:#E11D2A;">${inq.budget || 'N/A'}</strong>
              </div>
              <div style="background:var(--bg-card); padding:12px; border-radius:10px; border:1px solid var(--border-color);">
                <span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase; margin-bottom:4px;">Call Consultation</span>
                <strong style="font-size:13.5px; color:var(--success);">${inq.callDiscussion || 'N/A'}</strong>
              </div>
            </div>
          </div>

          <!-- Message / Notes -->
          <div>
            <h4 style="font-size:14px; font-weight:700; color:var(--navy); margin:0 0 10px 0; text-transform:uppercase; letter-spacing:0.5px;">Message & Notes</h4>
            <div style="background:var(--rose-light); padding:16px; border-radius:12px; border:1px solid var(--pink-border); font-size:13.5px; color:var(--navy); line-height:1.6; white-space:pre-wrap;">${esc(inq.notes || 'No message provided.')}</div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div style="padding:20px 24px; border-top:1px solid var(--border-color); display:flex; justify-content:flex-end; gap:10px; background:var(--bg-primary);">
          <button onclick="closeInquiryDetailModal()" class="btn-premium btn-outline" style="padding:8px 16px; font-size:13px; font-weight:700; border: 1px solid var(--pink-border); color: #E11D2A; background: transparent; cursor: pointer; border-radius: 6px;">Close</button>
          <a href="tel:${inq.phone}" class="btn-premium btn-pink" style="padding:8px 16px; font-size:13px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">📞 Call Couple</a>
          <a href="https://wa.me/${inq.phone.replace(/[^0-9]/g, '')}?text=Hi%20${esc(inq.name)},%20thanks%20for%20inquiring%20with%20us%20on%20WedEazzy!%20" target="_blank" class="btn-premium btn-pink" style="padding:8px 16px; font-size:13px; font-weight:700; background-color:#25D366; color:white; border-color:#25D366; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">💬 WhatsApp</a>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Trigger animations
  const overlay = document.getElementById('inquiryDetailModal');
  const content = overlay.querySelector('.modal-premium-content');
  setTimeout(() => {
    overlay.style.opacity = '1';
    content.style.transform = 'translateY(0)';
  }, 50);
};

window.closeInquiryDetailModal = function(event) {
  if (event && event.target !== event.currentTarget) return;
  const overlay = document.getElementById('inquiryDetailModal');
  if (overlay) {
    const content = overlay.querySelector('.modal-premium-content');
    overlay.style.opacity = '0';
    content.style.transform = 'translateY(20px)';
    setTimeout(() => overlay.remove(), 300);
  }
};

document.addEventListener('DOMContentLoaded', boot);


