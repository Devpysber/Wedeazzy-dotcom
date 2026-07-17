/* ============================================================================
 * WedEazzy Premium Normal User Dashboard MVC SPA Engine
 * Manage bookings, shortlist favorites, planners, budget calculator, & chat.
 * ========================================================================== */

const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:4000'
  : window.location.origin;
const TOKEN_KEY = 'wedeazzy_token';
const THEME_KEY = 'wedeazzy_theme';

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
}

// Application State Store
const state = {
  user: null,
  couple: null,
  activeTab: 'dashboard',
  theme: 'light',
  browseFilters: {
    q: '',
    cat: '',
    city: '',
    sort: 'rating',
    limit: 20
  },
  notifications: [
    { id: 1, title: 'Venue Booking Confirmed', text: 'Wedeazzy Royal Palms Resort locked for Dec 12, 2026.', time: '2 mins ago', type: 'success' },
    { id: 2, title: 'New Quote Received', text: 'Bridal Makeup Artist sent custom plate rate.', time: '1 hr ago', type: 'alert' }
  ],
  mockData: {
    bookings: [
      { id: 'BK-9901', vendorName: 'Wedeazzy Royal Palms Resort', category: 'Banquet Halls', date: '2026-12-12', status: 'confirmed', payment: 'Fully Paid', amount: 350000, phone: '+919999988888' },
      { id: 'BK-9902', vendorName: 'Golden Moments Photography', category: 'Photographers', date: '2026-12-13', status: 'pending', payment: 'Advance Paid', amount: 80000, phone: '+919888877777' },
      { id: 'BK-9903', vendorName: 'Decent Decorators Mumbai', category: 'Decorators', date: '2026-12-12', status: 'in-progress', payment: 'Unpaid', amount: 150000, phone: '+919777766666' }
    ],
    shortlists: [
      { id: 'V-201', name: 'Grand Royal Palms Resort', category: 'Banquet Halls', city: 'Mumbai', price: '₹1,500/plate', capacity: '300-800 guests', rating: 4.8, reviews: 34, image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600' },
      { id: 'V-202', name: 'Golden Light Studio', category: 'Photographers', city: 'Mumbai', price: '₹80,000/day', capacity: 'N/A', rating: 4.9, reviews: 18, image: 'https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&q=80&w=600' }
    ],
    checklist: [
      { id: 1, text: 'Finalize wedding guest count capacity', category: 'venue', done: true },
      { id: 2, text: 'Confirm booking at Banquet Hall', category: 'venue', done: true },
      { id: 3, text: 'Book photographer and schedule pre-shoot', category: 'photographer', done: false },
      { id: 4, text: 'Shortlist caterers and schedule tastings', category: 'caterer', done: false },
      { id: 5, text: 'Trial bridal makeup and hair setups', category: 'makeup', done: false }
    ],
    budget: {
      venueAlloc: 300000,
      cateringAlloc: 200000,
      photoAlloc: 100000,
      decorAlloc: 80000,
      spent: 350000,
      total: 800000
    },
    guests: [
      { id: 1, name: 'Priya & Raj Sharma', count: 2, rsvp: 'Attending', category: 'Family' },
      { id: 2, name: 'Amit Verma', count: 1, rsvp: 'Attending', category: 'Friends' },
      { id: 3, name: 'Sonal Sen', count: 1, rsvp: 'Pending', category: 'Friends' },
      { id: 4, name: 'Vikram Singh family', count: 4, rsvp: 'Declined', category: 'Family' }
    ]
  }
};

/* --- Boot Engine --- */
async function boot() {
  // Theme setup
  const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
  setTheme(savedTheme);

  // Preview Sandbox Bypass (Developer Sandbox Preview Mode)
  const isPreview = location.search.includes('preview=true') || location.search.includes('demo=true');
  if (isPreview) {
    state.user = { id: '99', name: 'Sonal & Amit', email: 'sonal.amit@wedeazzy.com', role: 'couple' };
    state.couple = { id: 'C-99', partnerName: 'Amit Verma', weddingDate: '2026-12-12', city: 'Mumbai', budgetMax: 800000, guestCount: 150 };

    const headerProfileAvatarLetter = document.getElementById('headerProfileAvatarLetter');
    if (headerProfileAvatarLetter) headerProfileAvatarLetter.textContent = 'S';
    const dropdownAvatarLetter = document.getElementById('dropdownAvatarLetter');
    if (dropdownAvatarLetter) dropdownAvatarLetter.textContent = 'S';
    const dropdownUserTitle = document.getElementById('dropdownUserTitle');
    if (dropdownUserTitle) dropdownUserTitle.textContent = 'Sonal & Amit';
    const dropdownUserEmail = document.getElementById('dropdownUserEmail');
    if (dropdownUserEmail) dropdownUserEmail.textContent = 'sonal.amit@wedeazzy.com';

    initLiveGreetingAndClock();
    
    // Close dropdowns on outside clicks
    window.addEventListener('click', (e) => {
      if (!e.target.closest('#profileDropdown')) {
        closeAllDropdowns();
      }
    });

    switchTab('dashboard');
    triggerToast('Demo sandbox mode authorized!');
    return;
  }

  // Authenticate token
  const token = getStoredToken();
  if (!token) {
    window.location.href = '../index.html?auth=login';
    return;
  }

  // Fetch verified profile
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const payload = await res.json();
    
    if (!res.ok || !payload.user || payload.user.role !== 'couple') {
      throw new Error('Unauthorized role type.');
    }

    state.user = payload.user;
    state.couple = payload.user.couple || null;

    // Load dynamic data from DB
    await fetchUserStats();

    // Populate user profile info
    const initial = (state.user.name || 'C')[0].toUpperCase();
    const headerProfileAvatarLetter = document.getElementById('headerProfileAvatarLetter');
    if (headerProfileAvatarLetter) headerProfileAvatarLetter.textContent = initial;
    const dropdownAvatarLetter = document.getElementById('dropdownAvatarLetter');
    if (dropdownAvatarLetter) dropdownAvatarLetter.textContent = initial;
    const dropdownUserTitle = document.getElementById('dropdownUserTitle');
    if (dropdownUserTitle) dropdownUserTitle.textContent = state.user.name || 'Couple Planner';
    const dropdownUserEmail = document.getElementById('dropdownUserEmail');
    if (dropdownUserEmail) dropdownUserEmail.textContent = state.user.email || 'couple@wedeazzy.com';

    initLiveGreetingAndClock();

    window.addEventListener('click', (e) => {
      if (!e.target.closest('#profileDropdown')) {
        closeAllDropdowns();
      }
    });

    switchTab('dashboard');
    triggerToast('Successfully authenticated!');

  } catch (err) {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    window.location.href = '../index.html?auth=login';
  }
}

/* --- Live Clock Greeting --- */
function initLiveGreetingAndClock() {
  const headerLeft = document.querySelector('.header-left');
  if (!headerLeft) return;

  let greetBox = document.getElementById('headerGreeting');
  if (!greetBox) {
    greetBox = document.createElement('div');
    greetBox.id = 'headerGreeting';
    greetBox.className = 'header-greet';
    greetBox.style.marginLeft = '20px';
    greetBox.style.display = 'flex';
    greetBox.style.flexDirection = 'column';
    greetBox.style.justifyContent = 'center';
    headerLeft.appendChild(greetBox);
  }

  const updateClock = () => {
    const now = new Date();
    const hrs = now.getHours();
    let greet = 'Good Day';
    let icon = '✨';

    if (hrs < 12) { greet = 'Good Morning'; icon = '🌅'; }
    else if (hrs < 17) { greet = 'Good Afternoon'; icon = '☀️'; }
    else { greet = 'Good Evening'; icon = '🌙'; }

    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    
    greetBox.innerHTML = `
      <h2 style="font-size: 15px; font-weight: 700; color:var(--rose-primary); line-height:1.1;">${icon} ${greet}, ${esc(state.user ? state.user.name.split(' ')[0] : 'Planner')}</h2>
      <span style="font-size: 10.5px; color:var(--text-secondary); margin-top:2px;">${timeStr} | Wedding ID #${state.user ? state.user.id.slice(-4).toUpperCase() : 'DEMO'}</span>
    `;
  };

  updateClock();
  setInterval(updateClock, 1000);
}

/* --- Dropdown Actions --- */
function toggleProfileDropdown(e) {
  e.stopPropagation();
  const profileMenu = document.getElementById('profileDropdownMenu');
  if (profileMenu) profileMenu.classList.toggle('show');
}

function closeAllDropdowns() {
  const profileMenu = document.getElementById('profileDropdownMenu');
  if (profileMenu) profileMenu.classList.remove('show');
}

/* --- Dynamic Router Viewport --- */
function switchTab(tabName) {
  state.activeTab = tabName;
  
  // Sidebar Highlights
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const container = document.getElementById('contentViewport');
  
  // Premium Multi-Element Skeleton
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:24px; animation: fade-step 0.3s ease;">
      <div class="skeleton" style="height:32px; width:35%; border-radius:8px;"></div>
      <div class="metrics-grid" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px;">
        <div class="skeleton" style="height:240px; border-radius:14px;"></div>
        <div class="skeleton" style="height:240px; border-radius:14px;"></div>
        <div class="skeleton" style="height:240px; border-radius:14px;"></div>
        <div class="skeleton" style="height:240px; border-radius:14px;"></div>
      </div>
      <div class="skeleton" style="height:320px; width:100%; border-radius:14px;"></div>
    </div>
  `;

  setTimeout(() => {
    renderTab(tabName, container);
  }, 250);

  // Close mobile navigation drawer
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('mobile-open');
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.toggle('mobile-open');
  if (overlay) overlay.classList.toggle('mobile-open');
}

function renderTab(tab, el) {
  if (tab === 'dashboard')       renderDashboardTab(el);
  else if (tab === 'browse')      renderBrowseTab(el);
  else if (tab === 'inquiries')   renderInquiriesTab(el);
  else if (tab === 'favorites')   renderFavoritesTab(el);
  else if (tab === 'planning')    renderPlanningTab(el);
  else if (tab === 'settings')    renderSettingsTab(el);
}

/* ============================================================================
 * VIEW BLOCKS & SaaS Modules
 * ========================================================================== */

// 1. USER MAIN DASHBOARD TAB
// 1. USER MAIN DASHBOARD TAB
function renderDashboardTab(el) {
  const inqs = state.mockData.inquiries || [];
  const sl = state.mockData.shortlists || [];
  const checklist = state.mockData.checklist || [];
  const guests = state.mockData.guests || [];
  
  const totalInqCount = inqs.length;
  const favCount = sl.length;
  const doneTasks = checklist.filter(c => c.done).length;
  const totalTasks = checklist.length;
  const attendingGuests = guests.filter(g => g.rsvp === 'Attending').reduce((acc, curr) => acc + curr.count, 0);

  el.innerHTML = `
    <div class="hero-section">
      <h1>Wedding Hub Dashboard</h1>
      <p>Welcome back! Organize your inquiries, manage shortlist compare tables, and track checklist task progress.</p>
    </div>

    <!-- Statistics Cards Grid Section -->
    <div class="metrics-grid">
      <div class="metric-card orange">
        <div class="metric-card-top">
          <div class="metric-card-icon">⏳</div>
          <div class="metric-card-meta">
            <span class="metric-card-title">My Inquiries</span>
            <span class="metric-card-desc">Active Queries</span>
          </div>
        </div>
        <span class="metric-card-val" id="cnt-pending">0</span>
        <span class="metric-card-sub">Inquiries Sent</span>
      </div>
      
      <div class="metric-card pink">
        <div class="metric-card-top">
          <div class="metric-card-icon">💖</div>
          <div class="metric-card-meta">
            <span class="metric-card-title">Favorites</span>
            <span class="metric-card-desc">Shortlisted Vendors</span>
          </div>
        </div>
        <span class="metric-card-val" id="cnt-shortlisted">0</span>
        <span class="metric-card-sub">Saved Vendors</span>
      </div>

      <div class="metric-card green">
        <div class="metric-card-top">
          <div class="metric-card-icon">📋</div>
          <div class="metric-card-meta">
            <span class="metric-card-title">Checklist Tasks</span>
            <span class="metric-card-desc">Completion Ratio</span>
          </div>
        </div>
        <span class="metric-card-val" id="cnt-tasks">${doneTasks} / ${totalTasks}</span>
        <span class="metric-card-sub">Tasks Done</span>
      </div>

      <div class="metric-card blue">
        <div class="metric-card-top">
          <div class="metric-card-icon">👥</div>
          <div class="metric-card-meta">
            <span class="metric-card-title">Guest RSVPs</span>
            <span class="metric-card-desc">Attending Guests</span>
          </div>
        </div>
        <span class="metric-card-val" id="cnt-guests">0</span>
        <span class="metric-card-sub">Guests Attending</span>
      </div>
    </div>

    <!-- Dashboard Welcome Features split grid -->
    <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:24px;">
      <!-- Welcome Panel -->
      <div class="card-premium" style="display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <h3 style="font-family:var(--sans); font-size:18px; margin-bottom:12px;">Let's design your dream wedding!</h3>
          <p style="font-size:14px; color:var(--text-secondary); line-height:1.6; margin-bottom:16px;">
            Your target destination is set as <strong>${esc(state.couple ? state.couple.city : 'Mumbai')}</strong>. You can find top wedding photographers, bridal makeup artists, mehndi designs, catering packages, and banquets to make your event unforgettable.
          </p>
        </div>
        <div style="display:flex; gap:12px;">
          <button class="btn-premium btn-pink" onclick="switchTab('browse')">🔍 Browse Vendors</button>
          <button class="btn-premium btn-outline" onclick="switchTab('planning')">📋 Open Planner</button>
        </div>
      </div>

      <!-- Quick Tips Box -->
      <div class="card-premium">
        <h3 style="font-family:var(--sans); font-size:16px; margin-bottom:12px;">💡 Quick Checklist Tip</h3>
        <div style="font-size:13.5px; color:var(--text-secondary); line-height:1.5;">
          ${checklist.length > 0 && checklist.some(c => !c.done)
            ? `Next pending task: <strong>${esc(checklist.find(c => !c.done).text)}</strong>.`
            : `Hooray! All checklist planner items are marked completed.`
          }
          <br/><br/>
          Need coordinator support? Shoot us a message on the support bubble below.
        </div>
      </div>
    </div>
  `;

  // Start animated counters
  animateNumber('cnt-pending', totalInqCount);
  animateNumber('cnt-shortlisted', favCount);
  animateNumber('cnt-guests', attendingGuests);
}

async function toggleChecklistItem(id) {
  const isPreview = location.search.includes('preview=true') || location.search.includes('demo=true');
  const item = state.mockData.checklist.find(c => c.id === id);
  if (!item) return;

  if (isPreview) {
    item.done = !item.done;
    triggerToast(`Task "${item.text}" updated!`);
    switchTab('planning');
  } else {
    const token = getStoredToken();
    try {
      const response = await fetch(`${API_BASE}/api/couple/me/tasks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ done: !item.done })
      });
      if (response.ok) {
        item.done = !item.done;
        triggerToast(`Task "${item.text}" updated!`);
        switchTab('planning');
      } else {
        triggerToast('Failed to update task', true);
      }
    } catch (err) {
      triggerToast('Error updating task', true);
    }
  }
}

function addGuestPlanner() {
  const nameInput = document.getElementById('newGuestName');
  const countInput = document.getElementById('newGuestCount');
  if (!nameInput || !nameInput.value.trim()) return;

  const count = parseInt(countInput.value, 10) || 1;
  state.mockData.guests.push({
    id: Date.now(),
    name: nameInput.value.trim(),
    count: count,
    rsvp: 'Pending',
    category: 'Friends'
  });

  triggerToast('Guest added to the planner list!');
  nameInput.value = '';
  switchTab('planning');
}

// ====== CATEGORY IMAGES FALLBACK FOR MARKETPLACE ======
const CAT_IMG = {
  'banquet-halls':         ['photo-1519741497674-611481863552','photo-1464366400600-7168b8af9bc3','photo-1519225421980-715cb0215aed','photo-1469371670807-013ccf25f16a','photo-1465495976277-4387d4b0b4c6','photo-1530023367847-a683933f4172','photo-1478146896981-b80fe463b330','photo-1513278974582-3e1b4a4fa21e'],
  'marriage-gardens':      ['photo-1465495976277-4387d4b0b4c6','photo-1469371670807-013ccf25f16a','photo-1519741497674-611481863552','photo-1519225421980-715cb0215aed','photo-1464366400600-7168b8af9bc3','photo-1478146896981-b80fe463b330','photo-1502635994848-43d6f7a14784','photo-1513278974582-3e1b4a4fa21e'],
  'wedding-lawns':         ['photo-1465495976277-4387d4b0b4c6','photo-1469371670807-013ccf25f16a','photo-1519225421980-715cb0215aed','photo-1530023367847-a683933f4172','photo-1519741497674-611481863552','photo-1502635994848-43d6f7a14784','photo-1478146896981-b80fe463b330','photo-1464366400600-7168b8af9bc3'],
  'wedding-photographers': ['photo-1511795409834-ef04bbd61622','photo-1519741497674-611481863552','photo-1469371670807-013ccf25f16a','photo-1519225421980-715cb0215aed','photo-1530023367847-a683933f4172','photo-1525258946800-98cfd641d0de','photo-1606216794074-735e91aa2c92','photo-1583939003579-730e3918a45a'],
  'bridal-makeup':         ['photo-1487412947147-5cebf100ffc2','photo-1591035897819-f4bdf739f446','photo-1583001931096-959e7d3b9d80','photo-1583241800698-9c2e2c0bf06d','photo-1492106087820-71f1a00d2b11','photo-1522337360788-8b13dee7a37e','photo-1503236823255-94609f598e71','photo-1604336732494-bf02af26f97f'],
  'bridal-mehndi':         ['photo-1602216056096-3b40cc0c9944','photo-1611106671620-37b1eaecd55b','photo-1591035897819-f4bdf739f446','photo-1583001931096-959e7d3b9d80','photo-1492106087820-71f1a00d2b11','photo-1604336732494-bf02af26f97f','photo-1601001815853-3835274403b3','photo-1522337360788-8b13dee7a37e'],
  'wedding-planners':      ['photo-1530023367847-a683933f4172','photo-1469371670807-013ccf25f16a','photo-1519225421980-715cb0215aed','photo-1519741497674-611481863552','photo-1464366400600-7168b8af9bc3','photo-1465495976277-4387d4b0b4c6','photo-1606490194859-07c18c9f0968','photo-1583939003579-730e3918a45a'],
  'wedding-decorators':    ['photo-1519225421980-715cb0215aed','photo-1519741497674-611481863552','photo-1464366400600-7168b8af9bc3','photo-1469371670807-013ccf25f16a','photo-1530023367847-a683933f4172','photo-1478146896981-b80fe463b330','photo-1513278974582-3e1b4a4fa21e','photo-1465495976277-4387d4b0b4c6'],
  'wedding-caterers':      ['photo-1555244162-803834f70033','photo-1414235077428-338989a2e8c0','photo-1502998070258-dc1338445ac2','photo-1493676304819-0d7a8d026dcf','photo-1546069901-ba9599a7e63c','photo-1565299507177-b0ac66763828','photo-1567620905732-2d1ec7ab7445','photo-1551782450-a2132b4ba21d'],
  'wedding-invitations':   ['photo-1607344645866-009c320b63e0','photo-1542665952-14513db15293','photo-1525857597365-5f6dbff2e36e','photo-1551184451-76b762941ad6','photo-1469371670807-013ccf25f16a','photo-1606800052052-a08af7148866','photo-1583241800698-9c2e2c0bf06d','photo-1606490194859-07c18c9f0968'],
  'wedding-entertainment': ['photo-1493676304819-0d7a8d026dcf','photo-1501281668745-f7f57925c3b4','photo-1470229722913-7c0e2dbbafd3','photo-1429962714451-bb934ecdc4ec','photo-1514525253161-7a46d19cd819','photo-1485872299712-c6c97ed29f3b','photo-1465495976277-4387d4b0b4c6','photo-1583939003579-730e3918a45a']
};

function vendorImg(v) {
  if (v.image_url) return v.image_url;
  if (v.photos && v.photos.length > 0 && v.photos[0].url) return v.photos[0].url;
  const arr = CAT_IMG[v.category_slug] || CAT_IMG['banquet-halls'];
  const seed = (v.id || v.name || '').split('').reduce((a,c) => a + c.charCodeAt(0), 0);
  const pic = arr[seed % arr.length];
  return 'https://images.unsplash.com/' + pic + '?w=600&h=420&fit=crop&q=70';
}

// 2. BROWSE VENDORS TAB
function renderBrowseTab(el) {
  el.innerHTML = `
    <div class="hero-section">
      <h1>Premium Vendor Marketplace</h1>
      <p>Browse, shortlist, and connect with top-rated wedding venues and service professionals in your city.</p>
    </div>

    <!-- Category Pills Navigation -->
    <div class="category-pills-scroll" id="browseCategoryPills"></div>

    <!-- Search Filters Bar -->
    <div class="browse-filter-bar">
      <div class="form-field-premium">
        <label>Search Keyword</label>
        <input type="text" id="browseSearchInput" placeholder="Search by name, area, address..." value="${esc(state.browseFilters.q)}" oninput="handleBrowseSearch(this.value)" />
      </div>
      <div class="form-field-premium">
        <label>Wedding Destination</label>
        <select id="browseCitySelect" onchange="handleBrowseCity(this.value)">
          <option value="">All Cities</option>
        </select>
      </div>
      <div class="form-field-premium">
        <label>Sort By</label>
        <select id="browseSortSelect" onchange="handleBrowseSort(this.value)">
          <option value="rating" ${state.browseFilters.sort === 'rating' ? 'selected' : ''}>Top Rated ⭐</option>
          <option value="name" ${state.browseFilters.sort === 'name' ? 'selected' : ''}>Name A-Z</option>
        </select>
      </div>
      <button class="btn-premium btn-outline btn-filter-reset" onclick="resetBrowseFilters()">Reset Filters</button>
    </div>

    <!-- Recommended Section (City-based) -->
    <div id="recommendedVendorsSection" style="display:none; margin-bottom:28px;">
      <div class="marketplace-section-title" id="recommendedTitle">💖 Recommended in Your City</div>
      <div class="marketplace-grid" id="recommendedVendorsGrid"></div>
    </div>

    <!-- Main Results Grid -->
    <div>
      <div class="marketplace-section-title">🕵️ Browse All Vendors (<span id="filteredVendorsCount">0</span> available)</div>
      <div class="marketplace-grid" id="filteredVendorsGrid"></div>
    </div>
  `;

  renderCategoryPills();
  
  // Load dynamic cities from public API
  fetch(`${API_BASE}/api/public/meta`)
    .then(r => r.json())
    .then(res => {
      if (res.ok && res.cities) {
        const select = document.getElementById('browseCitySelect');
        if (select) {
          select.innerHTML = '<option value="">All Cities</option>' + 
            res.cities.map(c => `<option value="${esc(c.slug)}" ${state.browseFilters.city === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
        }
      }
    })
    .catch(err => console.error(err));

  filterAndRenderVendors();
}

const BROWSE_CATEGORIES = [
  { slug: '', label: '✨ All Categories' },
  { slug: 'banquet-halls', label: '🏰 Banquet Halls' },
  { slug: 'marriage-gardens', label: '🏡 Gardens' },
  { slug: 'wedding-lawns', label: '🌿 Lawns' },
  { slug: 'wedding-photographers', label: '📸 Photographers' },
  { slug: 'bridal-makeup', label: '💄 Makeup Artists' },
  { slug: 'bridal-mehndi', label: '💅 Mehndi Artists' },
  { slug: 'wedding-planners', label: '📋 Planners' },
  { slug: 'wedding-decorators', label: '🎨 Decorators' },
  { slug: 'wedding-caterers', label: '🍽️ Caterers' },
  { slug: 'wedding-entertainment', label: '🎵 DJs & Entertainment' }
];

function renderCategoryPills() {
  const container = document.getElementById('browseCategoryPills');
  if (!container) return;
  
  container.innerHTML = BROWSE_CATEGORIES.map(cat => `
    <div class="cat-pill ${state.browseFilters.cat === cat.slug ? 'active' : ''}" onclick="handleBrowseCategory('${cat.slug}')">
      ${cat.label}
    </div>
  `).join('');
}

function handleBrowseCategory(catSlug) {
  state.browseFilters.cat = catSlug;
  state.browseFilters.limit = 20;
  renderCategoryPills();
  filterAndRenderVendors();
}

function handleBrowseSearch(value) {
  state.browseFilters.q = value;
  state.browseFilters.limit = 20;
  filterAndRenderVendors();
}

function handleBrowseCity(value) {
  state.browseFilters.city = value;
  state.browseFilters.limit = 20;
  filterAndRenderVendors();
}

function handleBrowseSort(value) {
  state.browseFilters.sort = value;
  state.browseFilters.limit = 20;
  filterAndRenderVendors();
}

function resetBrowseFilters() {
  state.browseFilters = { q: '', cat: '', city: '', sort: 'rating', limit: 20 };
  
  const searchInput = document.getElementById('browseSearchInput');
  const citySelect = document.getElementById('browseCitySelect');
  const sortSelect = document.getElementById('browseSortSelect');
  if (searchInput) searchInput.value = '';
  if (citySelect) citySelect.value = '';
  if (sortSelect) sortSelect.value = 'rating';
  
  renderCategoryPills();
  filterAndRenderVendors();
}

async function filterAndRenderVendors() {
  const mainGrid = document.getElementById('filteredVendorsGrid');
  const countSpan = document.getElementById('filteredVendorsCount');
  
  if (mainGrid) {
    mainGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
        <div style="border: 3px solid rgba(0,0,0,0.1); border-top: 3px solid var(--rose-primary); border-radius: 50%; width: 28px; height: 28px; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
        <p>Searching marketplace...</p>
      </div>
    `;
  }

  try {
    const q = state.browseFilters.q || '';
    const cat = state.browseFilters.cat || '';
    const city = state.browseFilters.city || '';
    const sort = state.browseFilters.sort || 'rating';
    const limit = state.browseFilters.limit || 20;

    const params = new URLSearchParams({
      page: 1,
      limit: limit,
      sortBy: sort === 'rating' ? 'rating' : (sort === 'name' ? 'name' : 'rating'),
    });
    if (q) params.append('search', q);
    if (cat) params.append('category', cat);
    if (city) params.append('city', city);

    const res = await fetch(`${API_BASE}/api/public/vendors?${params.toString()}`);
    const data = await res.json();
    
    if (!res.ok || !data.ok) {
      throw new Error('API request failed');
    }

    const list = data.vendors || [];
    const total = data.pagination.total;
    
    if (countSpan) countSpan.textContent = total;
    
    // Save to local browse list
    state.vendors = list;

    if (mainGrid) {
      if (list.length === 0) {
        mainGrid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary); background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
            <h3>No Vendors Found</h3>
            <p style="margin-top:8px;">Try adjusting your keyword search, city dropdown, or category filters.</p>
          </div>
        `;
      } else {
        let gridHtml = list.map(v => renderVendorCardHtml(v, false)).join('');
        
        if (total > limit) {
          gridHtml += `
            <div style="grid-column: 1 / -1; display: flex; justify-content: center; margin-top: 24px; margin-bottom: 24px;">
              <button class="btn-premium btn-pink" onclick="handleLoadMoreVendors()" style="padding: 10px 24px; font-size: 14px; border-radius: 30px;">
                🔄 Load More Vendors (${total - limit} remaining)
              </button>
            </div>
          `;
        }
        mainGrid.innerHTML = gridHtml;
      }
    }

    // Recommended Section (city-based)
    const recSection = document.getElementById('recommendedVendorsSection');
    const recGrid = document.getElementById('recommendedVendorsGrid');
    const coupleCity = state.couple ? state.couple.city : null;
    
    if (coupleCity && recSection && recGrid) {
      const recParams = new URLSearchParams({
        page: 1,
        limit: 4,
        city: coupleCity,
        sortBy: 'rating'
      });
      if (cat) recParams.append('category', cat);
      
      const recRes = await fetch(`${API_BASE}/api/public/vendors?${recParams.toString()}`);
      const recData = await recRes.json();
      
      if (recRes.ok && recData.ok && recData.vendors && recData.vendors.length > 0) {
        const recTitle = document.getElementById('recommendedTitle');
        if (recTitle) {
          recTitle.textContent = `💖 Recommended Vendors in ${coupleCity}`;
        }
        recGrid.innerHTML = recData.vendors.map(v => renderVendorCardHtml(v, true)).join('');
        recSection.style.display = 'block';
      } else {
        recSection.style.display = 'none';
      }
    } else if (recSection) {
      recSection.style.display = 'none';
    }

  } catch (err) {
    console.error('[WedEazzy] Dashboard browse fetch failed:', err);
    if (mainGrid) {
      mainGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
          <h3>Failed to load vendors</h3>
          <p>Please check your connection or try again.</p>
        </div>
      `;
    }
  }
}

function handleLoadMoreVendors() {
  state.browseFilters.limit = (state.browseFilters.limit || 20) + 20;
  filterAndRenderVendors();
}

function renderVendorCardHtml(v, isRecommended = false) {
  const isFav = state.mockData.shortlists.some(s => s.id === v.id);
  const imgUrl = vendorImg(v);
  
  let priceStr = 'Price on Request';
  if (v.priceMin) {
    const val = parseInt(v.priceMin);
    if (!isNaN(val)) {
      priceStr = `₹${val.toLocaleString('en-IN')}` + (v.category_slug && v.category_slug.includes('hall') ? '/plate' : '/day');
    }
  } else {
    priceStr = v.category_slug && v.category_slug.includes('hall') ? '₹1,200/plate' : '₹50,000/day';
  }
  
  const badgeHtml = isRecommended 
    ? `<span class="card-badge featured">⭐ Recommended</span>` 
    : (v.rating >= 4.7 ? `<span class="card-badge">Top Rated</span>` : '');
    
  return `
    <div class="vendor-marketplace-card" id="vendor-card-${v.id}">
      <div class="card-img-wrapper">
        ${badgeHtml}
        <button class="card-favorite-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${v.id}'); event.stopPropagation();" title="Add to Favorites">
          ${isFav ? '❤️' : '🤍'}
        </button>
        <img loading="lazy" src="${imgUrl}" alt="${esc(v.name)}" onerror="this.src='https://images.unsplash.com/photo-1519741497674-611481863552?w=600&h=420&fit=crop&q=70'" />
      </div>
      <div class="card-details-wrapper">
        <span class="card-cat-label">${esc(v.category)}</span>
        <h4 class="card-name-title">${esc(v.name)}</h4>
        <div class="card-loc-text">📍 ${esc(v.area || v.city)}</div>
        <div class="card-meta-row">
          <span class="card-rating-badge">⭐ ${(v.rating || 4.5).toFixed(1)}</span>
          <span class="card-price-label">${priceStr}</span>
        </div>
      </div>
      <div class="card-action-row">
        <button class="btn-premium btn-outline" style="font-size:11px; padding:6px 10px;" onclick="openVendorDetailModal('${v.id}')">Quick View</button>
        <button class="btn-premium btn-pink" style="font-size:11px; padding:6px 10px;" onclick="openVendorDetailModal('${v.id}', true)">Inquire</button>
      </div>
    </div>
  `;
}

async function openVendorDetailModal(vendorId, autoFocus = false) {
  // Log profile visit analytics event asynchronously
  try {
    fetch(`${API_BASE}/api/public/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorIdOrSlug: vendorId, eventType: 'profile_visit' })
    });
  } catch (e) {
    console.error('Failed to log profile visit analytics event:', e);
  }

  let v = null;
  // Always fetch dynamically first to ensure freshest database details
  try {
    const res = await fetch(`${API_BASE}/api/public/vendors/${vendorId}`);
    const data = await res.json();
    if (res.ok && data.ok) {
      v = data.vendor;
    }
  } catch (e) {
    console.error('Failed dynamic fetch, falling back to memory:', e);
  }

  if (!v && state.vendors && state.vendors.length > 0) {
    v = state.vendors.find(x => x.id === vendorId);
  }

  if (!v) {
    triggerToast('Vendor details not found.', true);
    return;
  }

  function imgForLocal(vendorObj, idx) {
    const arr = CAT_IMG[vendorObj.category_slug] || CAT_IMG['banquet-halls'];
    const seed = (vendorObj.id || '').split('').reduce((a,c) => a + c.charCodeAt(0), 0) + (idx||0);
    const pic = arr[seed % arr.length];
    return 'https://images.unsplash.com/' + pic + '?w=800&h=420&fit=crop&q=70';
  }
  
  const imgUrl = vendorImg(v);
  const photos = v.photos || [];
  const imageUrls = [];
  if (photos.length > 0) {
    photos.forEach(p => { if (p.url) imageUrls.push(p.url); });
  }
  if (imageUrls.length === 0) {
    imageUrls.push(imgUrl);
    // Fill placeholder images so there are 3-4 images for basic plans
    for (let i = 1; i <= 3; i++) {
      imageUrls.push(imgForLocal(v, i));
    }
  }

  const thumbnailsHtml = imageUrls.map((url, idx) => `
    <img src="${url}" onclick="document.getElementById('modal-hero-cover-img').src='${url}'" style="width:65px; height:48px; object-fit:cover; border-radius:6px; cursor:pointer; border:2px solid ${idx === 0 ? 'var(--rose-primary)' : 'transparent'}; transition:border-color 0.2s;" onclick="this.parentElement.querySelectorAll('img').forEach(i=>i.style.borderColor='transparent'); this.style.borderColor='var(--rose-primary)';" />
  `).join('');
  
  let priceStr = 'Price on Request';
  if (v.priceMin) {
    const val = parseInt(v.priceMin);
    if (!isNaN(val)) {
      priceStr = `₹${val.toLocaleString('en-IN')}` + (v.category_slug && v.category_slug.includes('hall') ? '/plate' : '/day');
    }
  } else {
    priceStr = v.category_slug && v.category_slug.includes('hall') ? '₹1,200/plate' : '₹50,000/day';
  }

  const defaultName = state.user ? state.user.name : '';
  const defaultPhone = state.user ? state.user.phone || '' : '';
  const defaultDate = state.couple && state.couple.weddingDate ? state.couple.weddingDate.slice(0, 10) : '';

  const mapsLink = v.google_cid 
    ? `<a href="https://www.google.com/maps?cid=${v.google_cid}" target="_blank" class="btn-premium btn-outline" style="font-size:12px; margin-top:8px; display:inline-flex; align-items:center; gap:6px; text-decoration:none;">🗺️ View on Google Maps</a>`
    : '';

  // Parse everyday timings
  let timingsHtml = '';
  if (v.businessTimings) {
    try {
      const parsed = JSON.parse(v.businessTimings);
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      timingsHtml = `
        <div style="margin-top:16px;">
          <h3 style="font-size:15px; font-weight:700; margin-bottom:8px; border-bottom:1px solid var(--border-color); padding-bottom:6px;">Business Hours</h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:8px; background:var(--bg-alt); padding:10px; border-radius:8px; border:1px solid var(--border-color);">
            ${days.map(day => {
              const t = parsed[day];
              if (!t) return '';
              return `
                <div style="display:flex; flex-direction:column; font-size:11.5px;">
                  <span style="text-transform:capitalize; font-weight:700; color:var(--text-primary);">${day.substring(0, 3)}</span>
                  <span style="color:${t.open ? 'var(--text-secondary)' : '#DC2626'}; font-weight:600; margin-top:2px;">
                    ${t.open ? `${esc(t.from)} - ${esc(t.to)}` : 'Closed'}
                  </span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } catch (e) {
      timingsHtml = `
        <div style="margin-top:16px;">
          <h3 style="font-size:15px; font-weight:700; margin-bottom:8px; border-bottom:1px solid var(--border-color); padding-bottom:6px;">Business Hours</h3>
          <p style="font-size:13px; font-weight:600; color:var(--text-primary);">⏰ ${esc(v.businessTimings)}</p>
        </div>
      `;
    }
  }

  // Parse business highlights
  let highlightsHtml = '';
  let parsedServices = [];
  if (v.services) {
    try {
      parsedServices = typeof v.services === 'string' ? JSON.parse(v.services) : v.services;
    } catch (e) {}
  }
  if (parsedServices && Array.isArray(parsedServices) && parsedServices.length > 0) {
    highlightsHtml = `
      <div style="margin-top:16px;">
        <h3 style="font-size:15px; font-weight:700; margin-bottom:8px; border-bottom:1px solid var(--border-color); padding-bottom:6px;">Highlights & Services</h3>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${parsedServices.map(s => `<span style="background:var(--rose-light); color:var(--rose-primary); font-size:11px; font-weight:700; padding:4px 8px; border-radius:6px; border:1px solid var(--pink-border);">✓ ${esc(s)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  // Parse social web links
  let socialsHtml = '';
  if (v.instagram || v.facebook || v.youtube || v.website || v.googleBusiness) {
    socialsHtml = `
      <div style="margin-top:16px;">
        <h3 style="font-size:15px; font-weight:700; margin-bottom:8px; border-bottom:1px solid var(--border-color); padding-bottom:6px;">Socials & Links</h3>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${v.website ? `<a href="${esc(v.website)}" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; gap:4px; padding:6px 10px; border-radius:6px; border:1.5px solid var(--border-color); color:var(--text-primary); text-decoration:none; font-size:11.5px; font-weight:600; background:#fff;">🌐 Website</a>` : ''}
          ${v.instagram ? `<a href="${esc(v.instagram)}" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; gap:4px; padding:6px 10px; border-radius:6px; border:1.5px solid var(--border-color); color:var(--text-primary); text-decoration:none; font-size:11.5px; font-weight:600; background:#fff;">📸 Instagram</a>` : ''}
          ${v.facebook ? `<a href="${esc(v.facebook)}" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; gap:4px; padding:6px 10px; border-radius:6px; border:1.5px solid var(--border-color); color:var(--text-primary); text-decoration:none; font-size:11.5px; font-weight:600; background:#fff;">📘 Facebook</a>` : ''}
          ${v.youtube ? `<a href="${esc(v.youtube)}" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; gap:4px; padding:6px 10px; border-radius:6px; border:1.5px solid var(--border-color); color:var(--text-primary); text-decoration:none; font-size:11.5px; font-weight:600; background:#fff;">🎥 YouTube</a>` : ''}
          ${v.googleBusiness ? `<a href="${esc(v.googleBusiness)}" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; gap:4px; padding:6px 10px; border-radius:6px; border:1.5px solid var(--border-color); color:var(--text-primary); text-decoration:none; font-size:11.5px; font-weight:600; background:#fff;">💼 Google Business</a>` : ''}
        </div>
      </div>
    `;
  }

  const modalHtml = `
    <div class="modal-overlay-backdrop" id="vendorDetailModal" onclick="closeVendorDetailModal(event)">
      <div class="modal-card-box" onclick="event.stopPropagation()" style="max-height: 90vh; overflow-y: auto;">
        <button class="modal-close-trigger" onclick="closeVendorDetailModal()">&times;</button>
        
        <div class="modal-header-hero" style="display:flex; flex-direction:column; height:auto;">
          <img id="modal-hero-cover-img" src="${imgUrl}" alt="${esc(v.name)}" onerror="this.src='https://images.unsplash.com/photo-1519741497674-611481863552?w=800&h=420&fit=crop&q=70'" style="width:100%; height:240px; object-fit:cover;" />
          <div style="display:flex; gap:6px; padding:8px 16px; background:#f8fafc; border-bottom:1px solid var(--border-color); overflow-x:auto;">
            ${thumbnailsHtml}
          </div>
          <div class="modal-hero-title-meta" style="position:relative; width:100%; box-sizing:border-box; padding:16px;">
            <h2>${esc(v.name)}</h2>
            <p style="margin-top:4px;">📍 ${esc(v.area || v.city)} · ${esc(v.category)}</p>
          </div>
        </div>
        
        <div class="modal-body-split">
          <div class="modal-details-left">
            <div>
              <h3 style="font-size:16px; font-weight:700; margin-bottom:8px; border-bottom:1px solid var(--border-color); padding-bottom:6px;">About Vendor</h3>
              <p style="font-size:13.5px; color:var(--text-secondary); line-height:1.6;">
                ${esc(v.description || 'Verified and audited premium wedding service provider on WedEazzy.')}
              </p>
              ${v.address ? `<p style="margin-top:8px; font-size:13px; color:var(--text-primary);"><strong>Address:</strong> ${esc(v.address)}</p>` : ''}
              ${mapsLink}
            </div>
            
            <div class="modal-info-list">
              <h3 style="font-size:16px; font-weight:700; border-bottom:1px solid var(--border-color); padding-bottom:6px;">Vendor Specifications</h3>
              <div class="modal-info-row">
                <span>Rating</span>
                <strong>${v.rating_count && parseInt(v.rating_count, 10) > 0 ? `⭐ ${parseFloat(v.rating).toFixed(1)} / 5.0 (${v.rating_count} Reviews)` : 'No reviews yet'}</strong>
              </div>
              <div class="modal-info-row">
                <span>Starting Package</span>
                <strong style="color:var(--rose-primary); font-size:15px;">${priceStr}</strong>
              </div>
              ${v.yearsExperience ? `
                <div class="modal-info-row">
                  <span>Experience</span>
                  <strong>${esc(v.yearsExperience)} Years</strong>
                </div>
              ` : ''}
              ${v.teamSize ? `
                <div class="modal-info-row">
                  <span>Team Size</span>
                  <strong>${esc(v.teamSize)} People</strong>
                </div>
              ` : ''}
              ${v.languagesSpoken ? `
                <div class="modal-info-row">
                  <span>Languages</span>
                  <strong>${esc(v.languagesSpoken)}</strong>
                </div>
              ` : ''}
              ${v.serviceAreas ? `
                <div class="modal-info-row">
                  <span>Service Areas</span>
                  <strong>${esc(v.serviceAreas)}</strong>
                </div>
              ` : ''}
              <div class="modal-info-row">
                <span>Destination Weddings</span>
                <strong>${v.acceptsDestination ? 'Yes' : 'No'}</strong>
              </div>
              <div class="modal-info-row">
                <span>Pincode</span>
                <strong>${v.pincode || 'N/A'}</strong>
              </div>
              <div class="modal-info-row">
                <span>Availability</span>
                <strong style="color:var(--success);">Available on Request</strong>
              </div>
            </div>
            
            ${highlightsHtml}
            ${timingsHtml}
            ${socialsHtml}
          </div>
          
          <div class="modal-inquiry-form-right" id="modalInquirySection">
            <h4>📩 Send Direct Inquiry</h4>
            <form onsubmit="submitDashboardInquiry(event)">
              <input type="hidden" name="vendorId" value="${v.id}" />
              
              <div class="form-field-premium" style="margin-bottom:12px;">
                <label>Your Name</label>
                <input type="text" name="name" required value="${esc(defaultName)}" style="padding:8px; font-size:13px;" />
              </div>
              <div class="form-field-premium" style="margin-bottom:12px;">
                <label>WhatsApp Number</label>
                <input type="tel" name="phone" required placeholder="e.g. +919876543210" value="${esc(defaultPhone)}" style="padding:8px; font-size:13px;" />
              </div>
              <div class="form-field-premium" style="margin-bottom:12px;">
                <label>Wedding Date</label>
                <input type="date" name="eventDate" required value="${defaultDate}" style="padding:8px; font-size:13px;" />
              </div>
              <div class="form-field-premium" style="margin-bottom:12px;">
                <label>Estimated Guest Count</label>
                <select name="guests" style="padding:8px; font-size:13px;">
                  <option value="100-250">100 - 250 guests</option>
                  <option value="250-500" selected>250 - 500 guests</option>
                  <option value="500-1000">500 - 1000 guests</option>
                  <option value="1000+">More than 1000 guests</option>
                </select>
              </div>
              <div class="form-field-premium" style="margin-bottom:12px;">
                <label>Estimated Wedding Budget (INR)</label>
                <input type="text" name="budget" placeholder="e.g. ₹5,00,000" style="padding:8px; font-size:13px;" />
              </div>
              <div class="form-field-premium" style="margin-bottom:12px;">
                <label>Schedule Discussion on Call</label>
                <select name="callDiscussion" style="padding:8px; font-size:13px;">
                  <option value="Yes, call me today">Yes, call me today</option>
                  <option value="Yes, call me tomorrow">Yes, call me tomorrow</option>
                  <option value="No, prefer WhatsApp chat" selected>No, prefer WhatsApp chat</option>
                  <option value="Not needed right now">Not needed right now</option>
                </select>
              </div>
              <div class="form-field-premium" style="margin-bottom:16px;">
                <label>Message/Notes</label>
                <textarea name="notes" placeholder="Tell the vendor what you need..." style="padding:8px; font-size:13px; min-height:60px; max-height:100px; resize:none;">Hi! I'm interested in booking your services. Please share packages and pricing details.</textarea>
              </div>
              
              <button type="submit" class="btn-premium btn-pink" style="width:100%; justify-content:center; padding:10px;">
                🚀 Submit Inquiry &amp; Get Quotes
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
  
  const existing = document.getElementById('vendorDetailModal');
  if (existing) existing.remove();
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const modal = document.getElementById('vendorDetailModal');
  setTimeout(() => modal.classList.add('show'), 50);
  
  if (autoFocus) {
    setTimeout(() => {
      const container = document.getElementById('modalInquirySection');
      if (container) {
        container.scrollIntoView({ behavior: 'smooth' });
        const nameInput = container.querySelector('input[name="name"]');
        if (nameInput) nameInput.focus();
      }
    }, 300);
  }
}

function closeVendorDetailModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('vendorDetailModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
  }
}

async function submitDashboardInquiry(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const oldText = submitBtn.innerHTML;
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = '⌛ Sending inquiry...';
  
  const vendorId = form.querySelector('input[name="vendorId"]').value;
  const name = form.querySelector('input[name="name"]').value;
  const phone = form.querySelector('input[name="phone"]').value;
  const eventDate = form.querySelector('input[name="eventDate"]').value;
  const guests = form.querySelector('select[name="guests"]').value;
  const budget = form.querySelector('input[name="budget"]').value;
  const callDiscussion = form.querySelector('select[name="callDiscussion"]').value;
  const notes = form.querySelector('textarea[name="notes"]').value;
  
  const payload = {
    vendorId,
    name,
    phone,
    eventDate: eventDate ? new Date(eventDate).toISOString() : null,
    guests,
    budget,
    callDiscussion,
    notes,
    source: 'couple_dashboard'
  };
  
  const isPreview = location.search.includes('preview=true') || location.search.includes('demo=true');
  
  if (isPreview) {
    setTimeout(() => {
      const mockInq = {
        id: 'INQ-' + Math.floor(1000 + Math.random() * 9000),
        vendorId,
        name,
        phone,
        eventDate,
        guests,
        budget,
        callDiscussion,
        notes,
        status: 'new',
        createdAt: new Date().toISOString()
      };
      
      if (!state.mockData.inquiries) state.mockData.inquiries = [];
      state.mockData.inquiries.unshift(mockInq);
      
      triggerToast('Inquiry submitted successfully (Demo Mode)!');
      closeVendorDetailModal();
    }, 800);
    return;
  }
  
  try {
    const token = getStoredToken();
    const res = await fetch(API_BASE + '/api/inquiry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (res.ok && data.ok) {
      triggerToast('Inquiry sent successfully to the WedEazzy Planner Team!');
      
      if (!state.mockData.inquiries) state.mockData.inquiries = [];
      const newInq = {
        id: data.inquiry.id,
        vendorId: data.inquiry.vendorId,
        name: data.inquiry.name,
        phone: data.inquiry.phone,
        email: data.inquiry.email,
        eventDate: data.inquiry.eventDate ? data.inquiry.eventDate.slice(0, 10) : '',
        guests: data.inquiry.guests || 'N/A',
        budget: data.inquiry.budget || 'N/A',
        callDiscussion: data.inquiry.callDiscussion || 'N/A',
        notes: data.inquiry.notes || '',
        status: data.inquiry.status || 'new',
        createdAt: data.inquiry.createdAt
      };
      state.mockData.inquiries.unshift(newInq);
      
      closeVendorDetailModal();
    } else {
      triggerToast(data.message || 'Failed to submit inquiry.', true);
      submitBtn.disabled = false;
      submitBtn.innerHTML = oldText;
    }
  } catch (err) {
    triggerToast('Network error, please check connection.', true);
    submitBtn.disabled = false;
    submitBtn.innerHTML = oldText;
  }
}

async function toggleFavorite(vendorId) {
  const isFav = state.mockData.shortlists.some(s => s.id === vendorId);
  const isPreview = location.search.includes('preview=true') || location.search.includes('demo=true');
  
  if (isPreview) {
    if (isFav) {
      state.mockData.shortlists = state.mockData.shortlists.filter(s => s.id !== vendorId);
      triggerToast('Removed from shortlist (Demo Mode).');
    } else {
      let v = (state.vendors || []).find(x => x.id === vendorId);
      if (v) {
        state.mockData.shortlists.unshift({
          id: v.id,
          name: v.name,
          category: v.category,
          city: v.city,
          price: v.category_slug && v.category_slug.includes('hall') ? '₹1,500/plate' : '₹50,000/day',
          capacity: v.capacity ? `${v.capacity} guests` : '300-800 guests',
          rating: v.rating || 4.5,
          reviews: 10,
          image: vendorImg(v)
        });
        triggerToast('Added to shortlist (Demo Mode)!');
      }
    }
    
    if (state.activeTab === 'browse') {
      filterAndRenderVendors();
    } else if (state.activeTab === 'favorites') {
      renderFavoritesTab(document.getElementById('contentViewport'));
    }
    return;
  }
  
  const token = getStoredToken();
  try {
    if (isFav) {
      const res = await fetch(`${API_BASE}/api/couple/me/shortlist/${vendorId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        state.mockData.shortlists = state.mockData.shortlists.filter(s => s.id !== vendorId);
        triggerToast('Removed from shortlist.');
      } else {
        triggerToast(data.message || 'Could not remove from shortlist.', true);
      }
    } else {
      const res = await fetch(`${API_BASE}/api/couple/me/shortlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ vendorId })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        let v = (state.vendors || []).find(x => x.id === vendorId);
        if (!v) {
          try {
            const vRes = await fetch(`${API_BASE}/api/public/vendors/${vendorId}`);
            const vData = await vRes.json();
            if (vRes.ok && vData.ok) v = vData.vendor;
          } catch(e) {}
        }
        if (v) {
          state.mockData.shortlists.unshift({
            id: v.id,
            name: v.name,
            category: v.category,
            city: v.city,
            price: v.category_slug && v.category_slug.includes('hall') ? '₹1,500/plate' : '₹50,000/day',
            capacity: v.capacity ? `${v.capacity} guests` : '300-800 guests',
            rating: v.rating || 4.5,
            reviews: 10,
            image: vendorImg(v)
          });
          triggerToast('Added to shortlist!');
        } else {
          triggerToast('Added to shortlist, refresh to view!');
        }
      } else {
        triggerToast(data.message || 'Could not add to shortlist.', true);
      }
    }
    
    if (state.activeTab === 'browse') {
      filterAndRenderVendors();
    } else if (state.activeTab === 'favorites') {
      renderFavoritesTab(document.getElementById('contentViewport'));
    }
  } catch (err) {
    triggerToast('Network error, please try again.', true);
  }
}

// 3. INQUIRIES TAB
function renderInquiriesTab(el) {
  const inqs = state.mockData.inquiries || [];
  
  el.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h2 style="font-family: var(--serif); font-size: 24px; color: var(--navy); margin-bottom: 6px;">Sent Vendor Inquiries</h2>
      <p style="font-size: 13.5px; color: var(--text-secondary); margin: 0;">Track status of quotes and leave reviews for your booked vendors.</p>
    </div>

    ${inqs.length === 0 ? `
      <div style="text-align: center; padding: 60px 40px; color: var(--text-secondary); background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); box-shadow: var(--shadow-premium);">
        <span style="font-size: 40px; display: block; margin-bottom: 12px; opacity:0.8;">📩</span>
        <p style="font-size: 15px; font-weight: 700; margin: 0; color: var(--navy);">No inquiries submitted yet</p>
        <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px; margin-bottom: 16px;">Browse vendors to send your first inquiry!</p>
        <button class="btn-premium btn-pink" onclick="switchTab('browse')">🔍 Browse Vendors</button>
      </div>
    ` : `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
        ${inqs.map(inq => {
          const vendorName = inq.vendorName || 'Vendor';
          const category = inq.vendorCategory || 'Vendor';
          const createdDate = inq.createdAt ? new Date(inq.createdAt).toLocaleDateString('en-IN') : 'Just now';
          const isReviewed = !!inq.review;
          
          return `
            <div class="card-premium" style="display: flex; flex-direction: column; justify-content: space-between; padding: 20px; border-radius: 16px; background: var(--bg-card); border: 1px solid var(--border-color); box-shadow: var(--shadow-premium); transition: all 0.3s ease;"
                 onmouseover="this.style.transform='translateY(-3px)'; this.style.borderColor='var(--rose-border)';"
                 onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='var(--border-color)';">
              <div>
                <div style="display: flex; gap: 14px; align-items: center; margin-bottom: 14px;">
                  <img src="${inq.vendorLogo}" style="width: 52px; height: 52px; border-radius: 12px; object-fit: cover; border: 1px solid var(--border-color);" alt="${esc(vendorName)}">
                  <div style="flex-grow: 1; min-width: 0;">
                    <h4 style="font-family: var(--sans); font-size: 15.5px; color: var(--navy); font-weight: 700; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${esc(vendorName)}</h4>
                    <span style="background: rgba(209, 38, 83, 0.06); color: var(--rose-primary); font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; display: inline-block; margin-top: 4px;">${esc(category)}</span>
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--text-secondary); margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
                  <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Event Date:</span> <strong>${inq.eventDate ? new Date(inq.eventDate).toLocaleDateString('en-IN') : 'Not Set'}</strong></div>
                  <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Sent Date:</span> <strong>${createdDate}</strong></div>
                  <div style="display: flex; justify-content: space-between;"><span style="color: var(--text-muted);">Status:</span> <span class="status-badge ${inq.status || 'new'}">${inq.status || 'new'}</span></div>
                </div>
              </div>

              <div style="display: flex; gap: 10px; margin-top: auto;">
                <button class="btn-premium btn-outline" style="flex: 1; padding: 8px 12px; font-size: 12.5px; font-weight: 600; border-radius: 8px;" onclick="window.openInquiryDetailsModal('${inq.id}')">View Details</button>
                ${isReviewed ? `
                  <button class="btn-premium btn-outline" style="flex: 1; padding: 8px 12px; font-size: 12.5px; font-weight: 700; border-radius: 8px; color: #059669; border-color: #A7F3D0; background: #ECFDF5; cursor: not-allowed;" disabled>✓ Review Submitted</button>
                ` : `
                  <button class="btn-premium btn-pink" style="flex: 1; padding: 8px 12px; font-size: 12.5px; font-weight: 700; border-radius: 8px;" onclick="window.openGiveReviewModal('${inq.id}')">Give Review</button>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;
}

// 4. FAVORITES TAB
function renderFavoritesTab(el) {
  const shortlists = state.mockData.shortlists || [];
  
  el.innerHTML = `
    <div class="hero-section">
      <h1>Favorite Shortlisted Vendors</h1>
      <p>Compare and manage your saved wedding vendors.</p>
    </div>
    
    ${shortlists.length === 0 ? `
      <div style="text-align: center; padding: 60px 40px; color: var(--text-secondary); background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
        <h3>Your Shortlist is Empty</h3>
        <p style="margin-top:8px;">Browse vendors in the marketplace and click the heart icon to save them here.</p>
        <button class="btn-premium btn-pink" style="margin-top:16px;" onclick="switchTab('browse')">🔍 Browse Vendors</button>
      </div>
    ` : `
      <div class="compare-grid">
        ${shortlists.map(v => `
          <div class="compare-card" id="wishlist-card-${v.id}">
            <img src="${v.image}" class="compare-card-img" alt="${esc(v.name)}" onerror="this.src='https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600'" />
            <div class="compare-card-body">
              <h4 class="compare-card-title">${esc(v.name)}</h4>
              <div class="compare-card-row">
                <span>Category:</span>
                <strong>${esc(v.category)}</strong>
              </div>
              <div class="compare-card-row">
                <span>City Location:</span>
                <strong>${esc(v.city)}</strong>
              </div>
              <div class="compare-card-row">
                <span>Starting Cost:</span>
                <strong style="color:var(--rose-primary);">${v.price || 'Price on Request'}</strong>
              </div>
              <div class="compare-card-row">
                <span>Rating avg:</span>
                <strong>⭐ ${(v.rating || 4.5).toFixed(1)} (${v.reviews || 10} reviews)</strong>
              </div>
              
              <div class="compare-card-actions">
                <button class="btn-premium btn-pink" style="flex:1; padding:8px; font-size:11px;" onclick="openVendorDetailModal('${v.id}')">📞 Inquire</button>
                <button class="btn-premium btn-outline text-danger" style="flex:1; padding:8px; font-size:11px;" onclick="toggleFavorite('${v.id}')">💔 Remove</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  `;
}

// 5. WEDDING PLANNING TAB
function renderPlanningTab(el) {
  el.innerHTML = `
    <div class="hero-section">
      <h1>Wedding Planner Workspace</h1>
      <p>Track tasks, monitor budget allocations, and manage your guest RSVPs.</p>
    </div>

    <!-- Planning Tools Split Widgets Grid -->
    <div class="planning-grid">
      <!-- Widget 1: Interactive Checklist -->
      <div class="planner-widget">
        <div class="planner-widget-header">
          📋 Wedding Checklist Planner
        </div>
        <div id="checklistContainer">
          ${state.mockData.checklist.map(item => `
            <div class="checklist-item">
              <input type="checkbox" class="checklist-checkbox" ${item.done ? 'checked' : ''} onclick="toggleChecklistItem('${item.id}')" />
              <span class="checklist-label ${item.done ? 'done' : ''}">${esc(item.text)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Widget 2: Interactive Budget Calculator -->
      <div class="planner-widget">
        <div class="planner-widget-header">
          💰 Budget Allocation Calculator
        </div>
        <canvas id="budgetPieChart" style="max-height: 180px; margin-bottom: 12px;"></canvas>
        <div style="font-size: 13px; color: var(--text-secondary); display:flex; justify-content:space-between;">
          <span>Allocated Spend: <strong>₹${state.mockData.budget.spent.toLocaleString('en-IN')}</strong></span>
          <span>Target Budget: <strong>₹${state.mockData.budget.total.toLocaleString('en-IN')}</strong></span>
        </div>
      </div>

      <!-- Widget 3: Guest List RSVP Planner -->
      <div class="planner-widget">
        <div class="planner-widget-header">
          👥 Guest & RSVP Tracker
        </div>
        <div style="display:flex; justify-content:space-between; text-align:center; font-size:12.5px; margin-bottom:14px;">
          <div style="background-color:rgba(16, 185, 129, 0.05); padding:8px; border-radius:6px; flex:1; margin-right:4px;">
            <strong style="color:var(--success); font-size:18px;">${state.mockData.guests.filter(g => g.rsvp === 'Attending').reduce((acc, curr) => acc + curr.count, 0)}</strong>
            <span style="display:block; font-size:10px;">Attending</span>
          </div>
          <div style="background-color:rgba(245, 158, 11, 0.05); padding:8px; border-radius:6px; flex:1; margin-right:4px;">
            <strong style="color:var(--warning); font-size:18px;">${state.mockData.guests.filter(g => g.rsvp === 'Pending').reduce((acc, curr) => acc + curr.count, 0)}</strong>
            <span style="display:block; font-size:10px;">Pending</span>
          </div>
          <div style="background-color:rgba(239, 68, 68, 0.05); padding:8px; border-radius:6px; flex:1;">
            <strong style="color:var(--danger); font-size:18px;">${state.mockData.guests.filter(g => g.rsvp === 'Declined').reduce((acc, curr) => acc + curr.count, 0)}</strong>
            <span style="display:block; font-size:10px;">Declined</span>
          </div>
        </div>
        <div style="font-size:12.5px;">
          <strong>Add Guest:</strong>
          <div style="display:flex; gap:6px; margin-top:6px;">
            <input type="text" id="newGuestName" placeholder="Guest Name" style="flex:2; padding:6px; border:1px solid var(--border-color); border-radius:6px; font-size:12px;" />
            <input type="number" id="newGuestCount" value="1" min="1" style="width:50px; padding:6px; border:1px solid var(--border-color); border-radius:6px; font-size:12px;" />
            <button class="btn-premium btn-pink" style="padding:6px 10px; font-size:11px;" onclick="addGuestPlanner()">Add</button>
          </div>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const canvas = document.getElementById('budgetPieChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const b = state.mockData.budget;
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Venue', 'Catering', 'Photo', 'Decor', 'Remaining'],
        datasets: [{
          data: [b.venueAlloc, b.cateringAlloc, b.photoAlloc, b.decorAlloc, Math.max(0, b.total - b.spent)],
          backgroundColor: ['#D12653', '#F59E0B', '#3B82F6', '#10B981', '#E5E7EB'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false }
        }
      }
    });
  }, 100);
}

// 4. SETTINGS TAB
function renderSettingsTab(el) {
  el.innerHTML = `
    <div class="card-premium">
      <div class="card-header-premium">
        <h3>Wedding Settings &amp; KYC</h3>
      </div>
      
      <div class="form-grid-premium">
        <div class="form-field-premium">
          <label>Partner Name</label>
          <input type="text" id="partnerName" value="${esc(state.couple ? state.couple.partnerName : 'Amit Verma')}" />
        </div>
        <div class="form-field-premium">
          <label>Target Wedding Date</label>
          <input type="date" id="weddingDate" value="${state.couple ? state.couple.weddingDate : '2026-12-12'}" />
        </div>
        <div class="form-field-premium">
          <label>Destination City</label>
          <input type="text" id="weddingCity" value="${esc(state.couple ? state.couple.city : 'Mumbai')}" />
        </div>
        <div class="form-field-premium">
          <label>Max Budget Cap (₹)</label>
          <input type="number" id="budgetCap" value="${state.couple ? state.couple.budgetMax : 800000}" />
        </div>
      </div>
      
      <div class="form-actions-premium">
        <button class="btn-premium btn-navy" onclick="saveUserSettings()">Save Planner Settings</button>
      </div>
    </div>
  `;
}

async function saveUserSettings() {
  const partnerName = document.getElementById('partnerName').value;
  const weddingDate = document.getElementById('weddingDate').value;
  const city = document.getElementById('weddingCity').value;
  const budgetMax = document.getElementById('budgetCap').value;

  const payload = {
    partnerName,
    weddingDate: weddingDate ? new Date(weddingDate).toISOString() : null,
    city,
    budgetMax: parseInt(budgetMax) || null
  };

  const isPreview = location.search.includes('preview=true') || location.search.includes('demo=true');
  
  if (isPreview) {
    state.couple = {
      ...state.couple,
      partnerName,
      weddingDate,
      city,
      budgetMax: parseInt(budgetMax) || 800000
    };
    triggerToast('Settings updated (Demo Mode)!');
    return;
  }

  const token = getStoredToken();
  try {
    const res = await fetch(`${API_BASE}/api/couple/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      state.couple = data.couple;
      triggerToast('Planner settings saved to database!');
    } else {
      triggerToast(data.message || 'Failed to save settings.', true);
    }
  } catch (err) {
    triggerToast('Network error, please check connection.', true);
  }
}

/* ============================================================================
 * EXPORTS AND INTERACTIVE SUPPORT CHAT WIDGET
 * ========================================================================== */

function toggleChatBubble() {
  const bubble = document.getElementById('chatSpeechBubble');
  if (bubble) bubble.classList.toggle('show');
}

function triggerSupportRedirect(type) {
  triggerToast(`Initiating direct E.164 WhatsApp redirect for: ${type} help!`);
  setTimeout(() => {
    window.open('https://wa.me/+919999999999?text=Hi%20WedEazzy%20Support!%20I%20need%20help%20coordinating%20a%20wedding...', '_blank');
  }, 1000);
}

function exportUserBookingsExcel() {
  const list = state.mockData.bookings.map(b => ({
    'Booking ID': b.id,
    'Vendor Name': b.vendorName,
    'Category': b.category,
    'Target Event Date': b.date,
    'Booking Status': b.status.toUpperCase(),
    'Payment Status': b.payment,
    'Contract Amount (INR)': b.amount
  }));
  
  const ws = XLSX.utils.json_to_sheet(list);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'My Bookings');
  XLSX.writeFile(wb, 'my_bookings_report.xlsx');
  triggerToast('Excel sheet downloaded!');
}

/* --- Animated Increments --- */
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

/* --- Toast Notification Triggers --- */
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

function esc(s) {
  return (s == null ? '' : String(s))
    .replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

async function handleLogout() {
  if (!confirm('Log out from WedEazzy Wedding Planning Portal?')) return;
  const token = getStoredToken();
  if (token) {
    try {
      await fetch(API_BASE + '/api/auth/logout', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (_) {}
  }
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  window.location.href = '../index.html?auth=login';
}
window.handleLogout = handleLogout;


function setTheme(mode) {
  state.theme = mode;
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem(THEME_KEY, mode);
}

// Fetch stats from local DB (Optional backend sync)
async function fetchUserStats() {
  // Clear mock fallbacks for authenticated users (force database states)
  state.notifications = [];
  state.mockData.bookings = [];
  state.mockData.shortlists = [];
  state.mockData.checklist = [];
  state.mockData.guests = [];
  state.mockData.inquiries = [];
  state.mockData.budget = {
    venueAlloc: 0,
    cateringAlloc: 0,
    photoAlloc: 0,
    decorAlloc: 0,
    spent: 0,
    total: 800000
  };

  try {
    const r = await fetch(API_BASE + '/api/couple/me', {
      headers: { 'Authorization': `Bearer ${getStoredToken()}` }
    });
    if (r.ok) {
      const data = await r.json();
      if (data) {
        if (data.couple) {
          state.couple = data.couple;
          state.mockData.budget.total = data.couple.budgetMax || 800000;
        }
        
        // Sync Bookings
        if (data.bookings && data.bookings.length > 0) {
          state.mockData.bookings = data.bookings.map(b => ({
            id: b.id.slice(-6).toUpperCase(),
            vendorName: b.vendor?.businessName || 'Vendor',
            category: b.vendor?.category || 'Vendor',
            date: b.eventDate ? b.eventDate.slice(0, 10) : '',
            status: b.status,
            payment: b.status === 'confirmed' || b.status === 'completed' ? 'Fully Paid' : 'Pending',
            amount: b.amount || 0,
            phone: b.vendor?.whatsappNumber || '+919999999999'
          }));
        }
        
        // Sync Shortlists
        if (data.shortlists && data.shortlists.length > 0) {
          state.mockData.shortlists = data.shortlists.map(s => {
            const v = s.vendor || {};
            return {
              id: v.id,
              name: v.businessName || 'Vendor',
              category: v.category || 'Vendor',
              city: v.city || 'Mumbai',
              price: v.priceMin ? `₹${v.priceMin.toLocaleString('en-IN')}/plate` : '₹1,500/plate',
              capacity: v.capacity ? `${v.capacity} guests` : '300-800 guests',
              rating: v.rating || 4.5,
              reviews: v.ratingCount || 10,
              image: v.photos && v.photos[0] ? v.photos[0].url : 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600'
            };
          });
        }
        
        // Sync PlanTasks (Checklist)
        if (data.planTasks && data.planTasks.length > 0) {
          state.mockData.checklist = data.planTasks.map(t => ({
            id: t.id,
            text: t.title,
            category: t.category || 'general',
            done: t.done
          }));
        }

        // Sync Inquiries (vendor info comes as nested object from backend)
        if (data.inquiries && data.inquiries.length > 0) {
          state.mockData.inquiries = data.inquiries.map(inq => ({
            id: inq.id,
            vendorId: inq.vendorId,
            vendorName: (inq.vendor && inq.vendor.businessName) || inq.name || 'Vendor',
            vendorCategory: (inq.vendor && inq.vendor.category) || 'Vendor',
            vendorLogo: (inq.vendor && inq.vendor.photos && inq.vendor.photos[0] && inq.vendor.photos[0].url) || 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600',
            name: inq.name,
            phone: inq.phone,
            email: inq.email,
            eventDate: inq.eventDate ? inq.eventDate.slice(0, 10) : '',
            guests: inq.guests || 'N/A',
            budget: inq.budget || 'N/A',
            callDiscussion: inq.callDiscussion || 'N/A',
            notes: inq.notes || '',
            status: inq.status,
            createdAt: inq.createdAt,
            review: inq.review || null
          }));
        }
      }
    }
  } catch (_) {}
}

window.openInquiryDetailsModal = function(inquiryId) {
  const inq = state.mockData.inquiries.find(i => i.id === inquiryId);
  if (!inq) return;

  const modal = document.createElement('div');
  modal.id = 'inquiryDetailsModal';
  Object.assign(modal.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    backgroundColor: 'rgba(14, 23, 38, 0.4)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '2000',
    opacity: '0',
    transition: 'opacity 0.3s ease'
  });

  modal.innerHTML = `
    <div style="background: white; border-radius: 20px; border: 1px solid var(--border-color); box-shadow: 0 20px 40px rgba(0,0,0,0.1); width: 100%; max-width: 500px; padding: 28px; position: relative; margin: 16px; transform: translateY(20px); transition: transform 0.3s ease;">
      <button style="position: absolute; right: 20px; top: 20px; background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-muted);" onclick="window.closeInquiryDetailsModal()">&times;</button>
      
      <h3 style="font-family: var(--serif); font-size: 20px; color: var(--navy); margin-bottom: 4px; font-weight: 700;">Inquiry Details</h3>
      <p style="font-size: 12.5px; color: var(--text-secondary); margin-bottom: 20px;">Sent to ${esc(inq.vendorName)}</p>

      <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13.5px; color: var(--text-secondary);">
        <div><strong style="color: var(--navy); display: block; font-size: 11px; text-transform: uppercase; margin-bottom: 2px;">Your Name</strong>${esc(inq.name)}</div>
        <div><strong style="color: var(--navy); display: block; font-size: 11px; text-transform: uppercase; margin-bottom: 2px;">Phone Number</strong>${esc(inq.phone)}</div>
        ${inq.email ? `<div><strong style="color: var(--navy); display: block; font-size: 11px; text-transform: uppercase; margin-bottom: 2px;">Email Address</strong>${esc(inq.email)}</div>` : ''}
        <div><strong style="color: var(--navy); display: block; font-size: 11px; text-transform: uppercase; margin-bottom: 2px;">Event Date</strong>${inq.eventDate ? new Date(inq.eventDate).toLocaleDateString('en-IN') : 'Not Set'}</div>
        <div><strong style="color: var(--navy); display: block; font-size: 11px; text-transform: uppercase; margin-bottom: 2px;">Guests Count</strong>${esc(inq.guests)}</div>
        <div><strong style="color: var(--navy); display: block; font-size: 11px; text-transform: uppercase; margin-bottom: 2px;">Estimated Budget</strong>${esc(inq.budget)}</div>
        <div><strong style="color: var(--navy); display: block; font-size: 11px; text-transform: uppercase; margin-bottom: 2px;">Call Discussion</strong>${esc(inq.callDiscussion)}</div>
        <div><strong style="color: var(--navy); display: block; font-size: 11px; text-transform: uppercase; margin-bottom: 2px;">Your Message / Notes</strong><p style="margin: 0; background: var(--bg-primary); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 13px; line-height: 1.5; white-space: pre-wrap;">${esc(inq.notes || 'No message provided.')}</p></div>
      </div>

      <div style="margin-top: 24px; display: flex; justify-content: flex-end;">
        <button class="btn-premium btn-navy" style="padding: 10px 24px; font-size: 13px; font-weight: 700; border-radius: 8px;" onclick="window.closeInquiryDetailsModal()">Close Details</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  
  // Trigger animations
  setTimeout(() => {
    modal.style.opacity = '1';
    modal.firstElementChild.style.transform = 'translateY(0)';
  }, 10);
};

window.closeInquiryDetailsModal = function() {
  const modal = document.getElementById('inquiryDetailsModal');
  if (!modal) return;
  modal.style.opacity = '0';
  modal.firstElementChild.style.transform = 'translateY(20px)';
  setTimeout(() => modal.remove(), 300);
};

window.openGiveReviewModal = function(inquiryId) {
  const inq = state.mockData.inquiries.find(i => i.id === inquiryId);
  if (!inq) return;

  const modal = document.createElement('div');
  modal.id = 'giveReviewModal';
  Object.assign(modal.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    backgroundColor: 'rgba(14, 23, 38, 0.4)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '2000',
    opacity: '0',
    transition: 'opacity 0.3s ease'
  });

  modal.innerHTML = `
    <div style="background: white; border-radius: 24px; border: 1px solid var(--border-color); box-shadow: 0 20px 40px rgba(0,0,0,0.15); width: 100%; max-width: 500px; padding: 28px; position: relative; margin: 16px; transform: translateY(20px); transition: transform 0.3s ease; text-align: center;">
      <button style="position: absolute; right: 20px; top: 20px; background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-muted);" onclick="window.closeGiveReviewModal()">&times;</button>
      
      <!-- Vendor Info -->
      <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 20px;">
        <img src="${inq.vendorLogo}" style="width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid var(--rose-border); box-shadow: var(--shadow-sm);" alt="${esc(inq.vendorName)}">
        <div>
          <h3 style="font-family: var(--sans); font-size: 17px; color: var(--navy); font-weight: 700; margin: 0;">${esc(inq.vendorName)}</h3>
          <span style="font-size: 11px; font-weight: 700; color: var(--rose-primary); text-transform: uppercase; letter-spacing: 0.5px;">${esc(inq.vendorCategory)}</span>
        </div>
      </div>

      <h2 style="font-family: var(--serif); font-size: 22px; color: var(--navy); font-weight: 700; margin-bottom: 6px;">Rate Your Experience</h2>
      <p style="font-size: 12.5px; color: var(--text-secondary); max-width: 320px; margin: 0 auto 16px auto; line-height: 1.5;">Share your experience to help other couples choose the right vendor.</p>

      <!-- Star Selector -->
      <div id="starSelectorContainer"></div>

      <!-- Textarea -->
      <div style="margin-bottom: 24px; text-align: left; position: relative;">
        <textarea id="reviewTextarea" placeholder="Tell us about your experience with this vendor..." style="width: 100%; height: 110px; padding: 12px; border: 1px solid var(--border-color); border-radius: 12px; font-size: 13.5px; box-sizing: border-box; font-family: inherit; resize: none; transition: border-color 0.2s;" oninput="window.handleReviewTextInput(event)"></textarea>
        <span id="charCounter" style="position: absolute; right: 12px; bottom: -20px; font-size: 11px; color: var(--text-muted); font-weight: 600;">0 / 500</span>
      </div>

      <div style="display: flex; gap: 14px; margin-top: 14px;">
        <button class="btn-premium btn-outline" style="flex: 1; padding: 10px 18px; font-size: 13px; font-weight: 700; border-radius: 8px;" onclick="window.closeGiveReviewModal()">Cancel</button>
        <button class="btn-premium btn-pink" id="btnSubmitReview" style="flex: 1; padding: 10px 18px; font-size: 13px; font-weight: 700; border-radius: 8px;" disabled onclick="window.submitReview('${inq.id}')">Submit Review</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Initialize Stars
  window.selectedStarsVal = 0;
  const starsContainer = modal.querySelector('#starSelectorContainer');
  starsContainer.style.display = 'flex';
  starsContainer.style.gap = '10px';
  starsContainer.style.justifyContent = 'center';
  starsContainer.style.marginBottom = '20px';

  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.innerHTML = `<svg viewBox="0 0 24 24" style="width: 42px; height: 42px; fill: #E5E7EB; stroke: #9CA3AF; stroke-width: 1; cursor: pointer; transition: all 0.2s ease-in-out;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
    star.style.cursor = 'pointer';
    
    star.addEventListener('mouseover', () => window.highlightStars(i));
    star.addEventListener('mouseout', () => window.highlightStars(window.selectedStarsVal));
    star.addEventListener('click', () => {
      window.selectedStarsVal = i;
      window.highlightStars(i);
      const submitBtn = document.getElementById('btnSubmitReview');
      if (submitBtn) submitBtn.disabled = false;
    });

    starsContainer.appendChild(star);
  }

  // Trigger animations
  setTimeout(() => {
    modal.style.opacity = '1';
    modal.firstElementChild.style.transform = 'translateY(0)';
  }, 10);
};

window.highlightStars = function(val) {
  const stars = document.querySelectorAll('#starSelectorContainer svg');
  stars.forEach((svg, idx) => {
    if (idx < val) {
      svg.style.fill = '#F59E0B';
      svg.style.stroke = '#D97706';
      svg.style.transform = 'scale(1.15)';
    } else {
      svg.style.fill = '#E5E7EB';
      svg.style.stroke = '#9CA3AF';
      svg.style.transform = 'scale(1)';
    }
  });
};

window.handleReviewTextInput = function(e) {
  const text = e.target.value;
  if (text.length > 500) {
    e.target.value = text.slice(0, 500);
  }
  document.getElementById('charCounter').textContent = `${e.target.value.length} / 500`;
};

window.closeGiveReviewModal = function() {
  const modal = document.getElementById('giveReviewModal');
  if (!modal) return;
  modal.style.opacity = '0';
  modal.firstElementChild.style.transform = 'translateY(20px)';
  setTimeout(() => modal.remove(), 300);
};

window.submitReview = async function(inquiryId) {
  const text = document.getElementById('reviewTextarea').value.trim();
  const rating = window.selectedStarsVal;

  if (rating < 1) {
    triggerToast('Please select at least 1 star.', true);
    return;
  }
  if (!text) {
    triggerToast('Please write a review.', true);
    return;
  }

  const submitBtn = document.getElementById('btnSubmitReview');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
  }

  try {
    const isDemo = location.search.includes('preview=true') || location.search.includes('demo=true');
    if (isDemo) {
      // Simulate success in demo mode
      triggerSuccessFlow(inquiryId, rating);
      return;
    }

    const res = await fetch(`${API_BASE}/api/couple/me/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getStoredToken()}`
      },
      body: JSON.stringify({ inquiryId, rating, text })
    });

    const data = await res.json();
    if (res.ok && data.ok) {
      triggerSuccessFlow(inquiryId, rating);
    } else {
      triggerToast(data.message || 'Failed to submit review.', true);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Review';
      }
    }
  } catch (err) {
    triggerToast('Network error, please try again.', true);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Review';
    }
  }
};

function triggerSuccessFlow(inquiryId, rating) {
  // 1. Trigger dynamic animation: scale stars inside popup in a congrats sequence
  const stars = document.querySelectorAll('#starSelectorContainer svg');
  stars.forEach((svg, idx) => {
    if (idx < rating) {
      setTimeout(() => {
        svg.style.transform = 'scale(1.4)';
        svg.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      }, idx * 100);
    }
  });

  // 2. Show the custom stars toast notification
  const starsString = '★'.repeat(rating);
  setTimeout(() => {
    triggerToast(`<div style="text-align:center;"><div style="color:#F59E0B; font-size:18px; margin-bottom:4px;">${starsString}</div><strong>Thank you!</strong><br/>Your review has been submitted successfully.</div>`);
    
    // 3. Immediately close giveReviewModal
    window.closeGiveReviewModal();

    // 4. Update the state immediately
    const inq = state.mockData.inquiries.find(i => i.id === inquiryId);
    if (inq) {
      inq.review = { id: 'temp-id', rating };
    }

    // 5. Re-render the inquiries tab instantly
    if (state.activeTab === 'inquiries') {
      renderInquiriesTab(document.getElementById('contentViewport'));
    }
  }, rating * 100 + 400);
}

document.addEventListener('DOMContentLoaded', boot);
