/**
 * WedEazzy Modular Admin Panel - SPA Master Application Orchestrator
 * Connects the state store, charts drawer, auth blocks, and UI elements.
 */

// Global Country Scope State & Helpers (Top-Level Scope)
window.WedEazzyCountryScope = localStorage.getItem('wedeazzy_country_scope') || 'all';

window.matchesCountryScope = function(v, scope) {
  if (!v) return true;
  if (!scope || String(scope).toLowerCase() === 'all') return true;
  const s = String(scope).toUpperCase();

  const rawCountry = String(v.country || '').trim().toUpperCase();
  const rawCode = String(v.countryCode || '').trim().toUpperCase();
  const rawLoc = String(v.location || v.address || '').trim().toUpperCase();

  let vendorCode = rawCode;
  if (!vendorCode) {
    if (rawCountry.includes('USA') || rawCountry.includes('UNITED STATES') || rawCountry === 'US') vendorCode = 'US';
    else if (rawCountry.includes('UK') || rawCountry.includes('UNITED KINGDOM') || rawCountry === 'GB') vendorCode = 'GB';
    else if (rawCountry.includes('UAE') || rawCountry.includes('EMIRATES') || rawCountry === 'AE') vendorCode = 'AE';
    else if (rawCountry.includes('CANADA') || rawCountry === 'CA') vendorCode = 'CA';
    else if (rawCountry.includes('AUSTRALIA') || rawCountry === 'AU') vendorCode = 'AU';
    else if (rawCountry.includes('INDIA') || rawCountry === 'IN') vendorCode = 'IN';
    else if (rawLoc.includes('USA') || rawLoc.includes('UNITED STATES')) vendorCode = 'US';
    else if (rawLoc.includes('UNITED KINGDOM')) vendorCode = 'GB';
    else if (rawLoc.includes('EMIRATES') || rawLoc.includes('DUBAI')) vendorCode = 'AE';
    else vendorCode = 'IN';
  }

  if (s === 'IN' || s === 'INDIA') return vendorCode === 'IN';
  if (s === 'AE' || s === 'UAE') return vendorCode === 'AE';
  if (s === 'GB' || s === 'UK') return vendorCode === 'GB';
  if (s === 'US' || s === 'USA') return vendorCode === 'US';
  if (s === 'CA' || s === 'CANADA') return vendorCode === 'CA';
  if (s === 'AU' || s === 'AUSTRALIA') return vendorCode === 'AU';

  return vendorCode === s || rawCode === s;
};

window.renderAdminCountryScopeHeader = function(title = "Country Scope & Filter", subtitle = "Filter platform management data dynamically") {
  const rawScope = window.WedEazzyCountryScope || 'all';
  const currentScope = rawScope.toUpperCase();
  return `
    <div style="display: flex; align-items: center; justify-content: space-between; background: var(--surface-bg); padding: 14px 20px; border-radius: 14px; border: 1px solid var(--border-color); margin-bottom: 20px; flex-wrap: wrap; gap: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(220, 31, 48, 0.1); color: var(--brand-rose); display: flex; align-items: center; justify-content: center; font-size: 1.15rem;">
          🌐
        </div>
        <div>
          <div style="font-size: 0.92rem; font-weight: 800; color: var(--text-main);">${title}</div>
          <div style="font-size: 0.76rem; color: var(--text-sub);">${subtitle}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-sub);">Country Scope:</label>
        <select class="global-country-select" style="background: var(--surface-subtle); color: var(--text-main); border: 1.5px solid var(--border-color); font-weight: 800; font-size: 0.84rem; padding: 7px 14px; border-radius: 10px; cursor: pointer; outline: none;"
          onchange="window.handleGlobalCountryChange(this.value)">
          <option value="all" ${currentScope === 'ALL' ? 'selected' : ''}>🌐 All Countries (Global Platform)</option>
          <option value="IN" ${currentScope === 'IN' ? 'selected' : ''}>🇮🇳 India (INR ₹)</option>
          <option value="AE" ${currentScope === 'AE' ? 'selected' : ''}>🇦🇪 UAE (AED)</option>
          <option value="GB" ${currentScope === 'GB' ? 'selected' : ''}>🇬🇧 UK (GBP £)</option>
          <option value="US" ${currentScope === 'US' ? 'selected' : ''}>🇺🇸 USA (USD $)</option>
          <option value="CA" ${currentScope === 'CA' ? 'selected' : ''}>🇨🇦 Canada (CAD CA$)</option>
          <option value="AU" ${currentScope === 'AU' ? 'selected' : ''}>🇦🇺 Australia (AUD A$)</option>
        </select>
      </div>
    </div>
  `;
};

window.handleGlobalCountryChange = function(code) {
  const cleanCode = (code || 'all').toString();
  window.WedEazzyCountryScope = cleanCode;
  localStorage.setItem('wedeazzy_country_scope', cleanCode);

  document.querySelectorAll('.global-country-select, #globalAdminCountrySelect, #biCountryFilter, #crmCountryScopeSelect').forEach(select => {
    if (select) select.value = cleanCode;
  });

  const label = cleanCode.toLowerCase() === 'all' ? 'All Countries 🌍' : (cleanCode.toUpperCase() === 'IN' ? 'India 🇮🇳' : (cleanCode.toUpperCase() === 'US' ? 'USA 🇺🇸' : (cleanCode.toUpperCase() === 'GB' ? 'UK 🇬🇧' : (cleanCode.toUpperCase() === 'AE' ? 'UAE 🇦🇪' : (cleanCode.toUpperCase() === 'CA' ? 'Canada 🇨🇦' : (cleanCode.toUpperCase() === 'AU' ? 'Australia 🇦🇺' : cleanCode))))));
  if (typeof window.showToast === 'function') {
    window.showToast(`Global admin scope set to: ${label}`, 'info');
  }
  if (typeof window.renderActiveView === 'function') {
    window.renderActiveView();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // 1. Guard check before launching application
  if (window.WedEazzyAuth) {
    window.WedEazzyAuth.guardRoute();
  }

  // 2. State & UI References
  const state = {
    activeTab: "dashboard",
    isSidebarCollapsed: localStorage.getItem("sidebar_collapsed") === "true",
    theme: localStorage.getItem("wedeazzy_theme") || "light",
    // Pagination/search state for the large (13,000+ row) list views. Kept
    // here rather than local to each render function so Prev/Next clicks
    // and search input can survive a re-render without losing position.
    vendorsPage: 1,
    vendorsSearch: "",
    venuesPage: 1,
    venuesSearch: "",
    claimedPage: 1,
    claimedSearch: "",
    invitationsPage: 1,
    invitationsSearch: "",
    blacklistedPage: 1,
    blacklistedSearch: ""
  };

  // Table rows beyond this size froze the browser tab: building a single
  // multi-thousand-row HTML string and setting it via innerHTML is a long
  // synchronous main-thread block. Slicing to a page keeps each render fast
  // regardless of how large the underlying dataset (e.g. 13,000+ vendors) is.
  let LIST_PAGE_SIZE = 15;

  /**
   * Filters `list` by `searchTerm` using `matchText(item)` for the haystack,
   * then slices to `page`. Returns the page's items plus pagination info so
   * callers can render Prev/Next controls and a result count.
   */
  function paginateList(list, searchTerm, page, matchText) {
    const term = (searchTerm || "").trim().toLowerCase();
    const filtered = term ? list.filter(item => matchText(item).includes(term)) : list;
    const totalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const start = (currentPage - 1) * LIST_PAGE_SIZE;
    return {
      pageItems: filtered.slice(start, start + LIST_PAGE_SIZE),
      filteredCount: filtered.length,
      totalPages,
      currentPage
    };
  }

  /** Shared Prev/Next control markup for the paginated list views. */
  /**
   * Numbered page buttons (not just Prev/Next) — with 13,000+ vendors at
   * 50/page that's ~274 pages, so this windows down to a handful of buttons
   * around the current page plus first/last, rather than listing all of them.
   */
  function renderPaginationControls(currentPage, totalPages, goToPageFnName) {
    if (totalPages <= 1) return "";

    const windowSize = 2;
    const pageNumbers = [];
    for (let p = Math.max(1, currentPage - windowSize); p <= Math.min(totalPages, currentPage + windowSize); p++) {
      pageNumbers.push(p);
    }

    const pageBtn = (p) => `
      <button class="btn-premium ${p === currentPage ? 'btn-premium-rose' : ''}" style="padding: 4px 10px; min-width: 34px;" onclick="window.${goToPageFnName}(${p})">${p}</button>
    `;

    return `
      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 14px 4px 4px; font-size: 0.78rem; color: var(--text-sub); flex-wrap: wrap;">
        <button class="btn-premium" style="padding: 4px 10px;" ${currentPage <= 1 ? "disabled" : ""} onclick="window.${goToPageFnName}(${currentPage - 1})">
          <i class="fa-solid fa-chevron-left"></i> Prev
        </button>
        ${pageNumbers[0] > 1 ? `${pageBtn(1)}${pageNumbers[0] > 2 ? '<span>…</span>' : ''}` : ''}
        ${pageNumbers.map(pageBtn).join('')}
        ${pageNumbers[pageNumbers.length - 1] < totalPages ? `${pageNumbers[pageNumbers.length - 1] < totalPages - 1 ? '<span>…</span>' : ''}${pageBtn(totalPages)}` : ''}
        <button class="btn-premium" style="padding: 4px 10px;" ${currentPage >= totalPages ? "disabled" : ""} onclick="window.${goToPageFnName}(${currentPage + 1})">
          Next <i class="fa-solid fa-chevron-right"></i>
        </button>
        <span style="margin-left: 6px;">Page ${currentPage} of ${totalPages}</span>
      </div>
    `;
  }

  // Cache elements
  const el = {
    html: document.documentElement,
    appWrapper: document.querySelector(".app-wrapper"),
    sideDrawer: document.getElementById("sideDrawer"),
    sidebarCollapseBtn: document.getElementById("sidebarCollapseBtn"),
    hamburgerBtn: document.getElementById("hamburgerBtn"),
    portalBody: document.getElementById("portalBody"),
    navButtons: document.querySelectorAll("[data-tab-trigger]"),
    logoutBtn: document.getElementById("logoutBtn"),
    adminNameBadge: document.getElementById("adminNameBadge"),
    adminAvatar: document.getElementById("adminAvatar"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    themeToggleIcon: document.getElementById("themeToggleIcon"),
    clockNode: document.getElementById("headerLiveClock"),
    toastsDock: document.getElementById("toastsDock"),
    overlayMask: document.getElementById("overlayMask"),
    modalBox: document.getElementById("modalBox")
  };

  // Tab ids recognized by renderActiveView() — used to validate the URL hash
  // so a stray/stale hash can't leave the SPA on a blank/unrecognized view.
  const VALID_TABS = [
    "dashboard", "bookings", "venues", "vendors", "users", "whatsapp", "reports",
    "settings", "profile", "transaction-history", "manage-plans", "automated-email",
    "claimed-listings", "city", "regions", "venues-category", "vendors-category",
    "send-emails", "email-templates", "blogs", "contact-inquiries", "whatsapp-status", "grow-campaigns",
    "grow-pricing", "vendor-crm-dashboard", "invitations", "blacklisted",
    "import-listings", "countries", "locations"
  ];

  function tabFromHash() {
    const hash = window.location.hash.replace(/^#/, "");
    return VALID_TABS.includes(hash) ? hash : "dashboard";
  }

  // 3. Application Setup & Lifecycle Initializers
  async function init() {
    setupTheme();
    setupSidebarState();
    setupClock();
    setupAdminProfile();
    bindEvents();
    setupMobileDrawer();
    attachCrmModule();

    // Support direct links / bookmarks to a specific tab via URL hash
    state.activeTab = tabFromHash();

    // Support browser Back/Forward buttons — without this the hash in the
    // address bar changes but the rendered SPA content does not.
    window.addEventListener("popstate", () => {
      mountTab(tabFromHash());
    });

    // Sync store with database first
    if (window.WedEazzyStore) {
      await window.WedEazzyStore.sync();
    }

    // Render initial page view (default: Dashboard)
    mountTab(state.activeTab);
  }

  /**
   * Hand the CRM module the helpers it needs. Done here rather than having
   * crm.js reach into app.js's closure, which it cannot see.
   */
  function attachCrmModule() {
    if (!window.WedEazzyCRM) return;
    window.WedEazzyCRM.attach({
      escHtml,
      escJsAttr,
      showToast,
      openModal,
      closeModal,
      portalBody: el.portalBody,
      rerender: renderActiveView,
    });
    // crm.js triggers tab changes (e.g. "Import CSV" buttons) through this.
    window.wedeazzyMountTab = mountTab;
  }

  /**
   * Off-canvas navigation for tablet/phone widths.
   *
   * The desktop behaviour (a 270px rail that collapses to 78px) is untouched.
   * Below 900px the drawer is positioned off-screen by enhance.css and slides
   * in via the .wz-open class, over a scrim, because the previous responsive
   * rule stacked the entire 20-item nav above the content — every page began
   * with a full screen of navigation before any data was visible.
   */
  const MOBILE_BREAKPOINT = 900;
  function isMobileView() {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  }

  function setupMobileDrawer() {
    if (!el.sideDrawer) return;

    // Scrim sits behind the drawer and closes it on tap.
    let scrim = document.getElementById("wzDrawerScrim");
    if (!scrim) {
      scrim = document.createElement("div");
      scrim.className = "wz-drawer-scrim";
      scrim.id = "wzDrawerScrim";
      document.body.appendChild(scrim);
    }

    const open = () => {
      el.sideDrawer.classList.add("wz-open");
      scrim.classList.add("show");
      // Stop the page behind the drawer from scrolling on iOS.
      document.body.style.overflow = "hidden";
    };
    const close = () => {
      el.sideDrawer.classList.remove("wz-open");
      scrim.classList.remove("show");
      document.body.style.overflow = "";
    };
    const toggle = () => {
      el.sideDrawer.classList.contains("wz-open") ? close() : open();
    };

    window.wedeazzyCloseDrawer = close;
    window.wedeazzyToggleDrawer = toggle;

    scrim.addEventListener("click", close);

    // Escape closes the drawer, matching the modal's behaviour.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.sideDrawer.classList.contains("wz-open")) close();
    });

    // Selecting any destination should dismiss the drawer on mobile — leaving
    // it open over the content the user just navigated to is disorienting.
    el.sideDrawer.addEventListener("click", (e) => {
      if (!isMobileView()) return;
      const target = e.target.closest("[data-tab-trigger]");
      if (target) close();
    });

    // Returning to desktop width must not leave a stuck scrim/locked body.
    let wasMobile = isMobileView();
    window.addEventListener("resize", () => {
      const nowMobile = isMobileView();
      if (wasMobile !== nowMobile) {
        wasMobile = nowMobile;
        close();
        if (window.WedEazzyCharts && typeof window.WedEazzyCharts.renderAll === 'function') {
          setTimeout(() => window.WedEazzyCharts.renderAll(), 250);
        }
      }
    });
  }

  // Set Theme
  function setupTheme() {
    el.html.setAttribute("data-theme", state.theme);
    updateThemeIcon();
  }

  function toggleTheme() {
    state.theme = state.theme === "light" ? "dark" : "light";
    localStorage.setItem("wedeazzy_theme", state.theme);
    el.html.setAttribute("data-theme", state.theme);
    updateThemeIcon();
    
    showToast("Theme switched to " + state.theme.toUpperCase(), "success");

    // Redraw charts with new colors immediately if on active pages containing charts
    if (window.WedEazzyCharts && typeof window.WedEazzyCharts.renderAll === 'function') {
      setTimeout(() => window.WedEazzyCharts.renderAll(), 150);
    }
  }

  function updateThemeIcon() {
    if (el.themeToggleIcon) {
      if (state.theme === "dark") {
        el.themeToggleIcon.className = "fa-solid fa-sun";
      } else {
        el.themeToggleIcon.className = "fa-solid fa-moon";
      }
    }
  }

  // Clock ticks — outputs HH:MM:SS AM/PM matching header reference design
  function setupClock() {
    function tick() {
      if (!el.clockNode) return; // element managed by header script
      const now  = new Date();
      let   hh   = now.getHours();
      const mm   = String(now.getMinutes()).padStart(2, "0");
      const ss   = String(now.getSeconds()).padStart(2, "0");
      const ampm = hh >= 12 ? "PM" : "AM";
      hh = hh % 12 || 12;
      el.clockNode.textContent = `${String(hh).padStart(2, "0")}:${mm}:${ss} ${ampm}`;
    }
    tick();
    setInterval(tick, 1000);
  }

  // Load user profile
  function setupAdminProfile() {
    if (window.WedEazzyAuth) {
      const session = window.WedEazzyAuth.getSession();
      if (session) {
        if (el.adminNameBadge) el.adminNameBadge.textContent = session.email.split('@')[0];
        if (el.adminAvatar) el.adminAvatar.textContent = session.avatarLetter;
      }
    }
  }

  // Sidebar Layout States
  function setupSidebarState() {
    if (state.isSidebarCollapsed) {
      el.sideDrawer.classList.add("collapsed");
    } else {
      el.sideDrawer.classList.remove("collapsed");
    }
  }

  function toggleSidebar() {
    // On phone/tablet the same button opens the off-canvas drawer instead of
    // collapsing the rail — collapsing is meaningless when the drawer is
    // already hidden off-screen.
    if (typeof isMobileView === "function" && isMobileView()) {
      if (window.wedeazzyToggleDrawer) window.wedeazzyToggleDrawer();
      return;
    }

    state.isSidebarCollapsed = !state.isSidebarCollapsed;
    localStorage.setItem("sidebar_collapsed", state.isSidebarCollapsed);
    setupSidebarState();
    
    // Redraw charts as size boundaries shifts
    if (window.WedEazzyCharts && typeof window.WedEazzyCharts.renderAll === 'function') {
      setTimeout(() => window.WedEazzyCharts.renderAll(), 300);
    }
  }

  // Event Bindings
  function bindEvents() {
    // Sidebar collapse triggers
    if (el.sidebarCollapseBtn) el.sidebarCollapseBtn.addEventListener("click", toggleSidebar);
    if (el.hamburgerBtn) el.hamburgerBtn.addEventListener("click", toggleSidebar);
    
    // Theme toggle trigger
    if (el.themeToggleBtn) el.themeToggleBtn.addEventListener("click", toggleTheme);

    // Logout trigger
    if (el.logoutBtn) {
      el.logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (window.WedEazzyAuth) {
          showToast("Signing out...", "warning");
          setTimeout(() => window.WedEazzyAuth.logout(), 600);
        }
      });
    }

    // Submenu Toggle Triggers
    const submenuTriggers = document.querySelectorAll("[data-submenu-trigger]");
    submenuTriggers.forEach(trigger => {
      trigger.addEventListener("click", (e) => {
        e.preventDefault();
        const menuId = trigger.getAttribute("data-submenu-trigger");
        const drawer = document.getElementById(`submenu-${menuId}`);
        if (drawer) {
          const isShown = drawer.classList.contains("show");
          
          // Toggle current drawer and rotation
          if (isShown) {
            drawer.classList.remove("show");
            trigger.classList.remove("expanded");
          } else {
            // Optional: close other drawers first
            document.querySelectorAll(".sub-links-drawer").forEach(d => d.classList.remove("show"));
            document.querySelectorAll("[data-submenu-trigger]").forEach(t => t.classList.remove("expanded"));
            
            drawer.classList.add("show");
            trigger.classList.add("expanded");
          }
        }
      });
    });

    // Nav list clicks (handles flat buttons and submenu anchors dynamically)
    el.navButtons = document.querySelectorAll("[data-tab-trigger]"); // Re-fetch to capture all elements
    el.navButtons.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const tab = btn.getAttribute("data-tab-trigger");
        
        // Remove active states from other links
        el.navButtons.forEach(b => b.classList.remove("active"));
        
        // Add active state to clicked button or sublink
        btn.classList.add("active");

        // If it's a sub-link, also keep parent dropdown highlighted
        const parentDrawer = btn.closest(".sub-links-drawer");
        if (parentDrawer) {
          const parentTriggerId = parentDrawer.id.replace("submenu-", "");
          const parentTrigger = document.querySelector(`[data-submenu-trigger="${parentTriggerId}"]`);
          if (parentTrigger) parentTrigger.classList.add("active");
        }

        mountTab(tab);
      });
    });

    // Close Modal trigger
    el.overlayMask.addEventListener("click", (e) => {
      if (e.target === el.overlayMask) closeModal();
    });

    // Handle global real-time store updates.
    // IMPORTANT: do NOT call renderActiveView() here — it replaces el.portalBody.innerHTML
    // entirely which causes a visible full-page flash on every 5-second sync tick.
    // Instead, patch only the dashboard stat numbers in-place; all other tabs re-render
    // explicitly after the user takes an action (approve, delete, search, etc.).
    window.addEventListener("wedeazzy_store_updated", () => {
      if (state.activeTab === "dashboard") {
        _refreshDashboardStats();
      }
    });

    // Listen for storage events from other tabs (specifically our synchronization trigger)
    window.addEventListener("storage", async (e) => {
      if (e.key === "wedeazzy_sync_trigger" && window.WedEazzyStore) {
        await window.WedEazzyStore.sync();
      }
    });

    // Periodic synchronization fallback. Every sync() fetches the full
    // vendors/users/bookings payload (500KB+ with 13,000+ vendors) — at a
    // 5s interval that's a constant, unnecessary background load on every
    // tab, not just list pages, and was a real contributor to the admin
    // panel feeling laggy even when idle. Explicit actions (approve, delete,
    // etc.) already trigger an immediate sync() of their own, so this is
    // purely a staleness fallback and doesn't need to be aggressive.
    setInterval(async () => {
      if (window.WedEazzyStore) {
        await window.WedEazzyStore.sync();
      }
    }, 30000);
  }

  // 4. Modal manager
  function openModal(title, bodyHTML, footerHTML) {
    el.modalBox.querySelector(".modal-title").innerHTML = title;
    el.modalBox.querySelector(".modal-body-section").innerHTML = bodyHTML;
    el.modalBox.querySelector(".modal-footer-section").innerHTML = footerHTML;
    el.overlayMask.classList.add("show");
  }

  function closeModal() {
    el.overlayMask.classList.remove("show");
  }

  window.closeModal = closeModal; // Export to globally call

  // 5. Toast signals spawner
  function showToast(message, type = "info") {
    const card = document.createElement("div");
    card.className = `toast-alert-card toast-${type}`;
    
    let icon = "fa-info-circle";
    if (type === "success") icon = "fa-check-circle";
    if (type === "warning") icon = "fa-exclamation-triangle";
    if (type === "danger") icon = "fa-times-circle";

    card.innerHTML = `
      <i class="fa-solid ${icon}"></i>
      <div class="toast-alert-text">${message}</div>
      <button class="toast-alert-close-btn">&times;</button>
    `;

    card.querySelector(".toast-alert-close-btn").addEventListener("click", () => {
      card.style.opacity = "0";
      setTimeout(() => card.remove(), 300);
    });

    el.toastsDock.appendChild(card);

    // Auto dismiss after 3.5s
    setTimeout(() => {
      card.style.opacity = "0";
      setTimeout(() => card.remove(), 300);
    }, 3500);
  }

  window.showToast = showToast; // Export globally

  // Escapes user-submitted text for safe use as HTML text content or as the
  // value of a normal (non-JS) double-quoted HTML attribute. Use this any
  // time a vendor/user/couple-supplied string (name, email, notes, address,
  // business name, etc.) is interpolated into innerHTML.
  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  window.escHtml = escHtml;

  // Escapes user-submitted text for safe embedding as a single-quoted JS
  // string literal *inside* a double-quoted onclick="..." HTML attribute,
  // e.g. onclick="foo('${escJsAttr(name)}')". HTML entities alone are NOT
  // enough here — the browser decodes attribute entities before handing the
  // result to the JS parser, so a raw `'` would still terminate the string
  // early. Backslash-escape the JS delimiter first, then HTML-escape the
  // surrounding attribute so the two layers compose safely.
  function escJsAttr(str) {
    return String(str == null ? '' : str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  window.escJsAttr = escJsAttr;

  // Fetch the payments report and download it as a CSV file client-side
  // (the backend endpoint returns JSON data, not a file, so we convert here).
  window.exportPaymentsCsv = async function() {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch('/api/reports/export/payments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.message || 'Failed to generate report');

      const rows = result.data || [];
      if (!rows.length) {
        showToast('No transactions to export.', 'warning');
        return;
      }

      const headers = Object.keys(rows[0]);
      const escapeCsv = (val) => {
        const str = val === null || val === undefined ? '' : String(val);
        return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
      };
      const csv = [
        headers.join(','),
        ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(','))
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wedeazzy-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Transactions exported successfully!', 'success');
    } catch (e) {
      showToast('Error generating report: ' + e.message, 'danger');
    }
  };

  // Notification bell: live feed assembled server-side from pending vendors,
  // unactioned inquiries, and unconfirmed bookings (no separate notifications
  // table). Available globally since the bell lives in the header on every tab.
  function timeAgo(dateStr) {
    const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  const notifIcons = {
    vendor_approval: 'fa-store',
    inquiry: 'fa-envelope',
    booking: 'fa-calendar-check',
  };

  window.goToNotificationTab = function(tab) {
    document.getElementById('notifDropdownMenu')?.classList.remove('show');
    document.getElementById('notifBellBtn')?.setAttribute('aria-expanded', 'false');
    document.querySelector(`[data-tab-trigger="${tab}"]`)?.click();
  };

  window.loadNotifications = async function() {
    const itemsEl = document.getElementById('notifDropdownItems');
    const badgeEl = document.getElementById('notifBadgeCount');
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/notifications', {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();

      if (badgeEl) {
        if (data.ok && data.count > 0) {
          badgeEl.textContent = data.count > 99 ? '99+' : String(data.count);
          badgeEl.style.display = 'flex';
        } else {
          badgeEl.style.display = 'none';
        }
      }

      if (!itemsEl) return;
      if (!data.ok || !data.items || data.items.length === 0) {
        itemsEl.innerHTML = `<div class="dropdown-menu-item" style="justify-content: center; color: var(--text-muted);">All caught up ✓</div>`;
        return;
      }

      itemsEl.innerHTML = data.items.map(item => `
        <button class="dropdown-menu-item" role="menuitem" onclick="window.goToNotificationTab('${item.tab}')" style="align-items: flex-start;">
          <i class="fa-solid ${notifIcons[item.type] || 'fa-bell'}" style="margin-top: 2px;"></i>
          <span style="display: flex; flex-direction: column; gap: 1px;">
            <span style="color: var(--text-main); font-weight: 600;">${item.title}</span>
            ${item.subtitle ? `<span style="font-size: 0.72rem;">${item.subtitle}</span>` : ''}
            <span style="font-size: 0.68rem; color: var(--text-muted);">${timeAgo(item.createdAt)}</span>
          </span>
        </button>
      `).join('');
    } catch (e) {
      if (itemsEl) itemsEl.innerHTML = `<div class="dropdown-menu-item" style="justify-content: center; color: var(--text-muted);">Could not load notifications.</div>`;
    }
  };

  // 6. SPA Loader & Transitions (SaaS pulse frames)
  async function mountTab(tabId) {
    state.activeTab = tabId;
    
    // Set URL hash cleanly without reload
    window.history.pushState(null, null, `#${tabId}`);

    // Update active state in navigation menus
    el.navButtons.forEach(btn => {
      if (btn.getAttribute("data-tab-trigger") === tabId) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    // If it's a sub-link, also keep parent dropdown highlighted and expanded
    const activeBtn = document.querySelector(`[data-tab-trigger="${tabId}"]`);
    if (activeBtn) {
      const parentDrawer = activeBtn.closest(".sub-links-drawer");
      if (parentDrawer) {
        parentDrawer.classList.add("show");
        const parentTriggerId = parentDrawer.id.replace("submenu-", "");
        const parentTrigger = document.querySelector(`[data-submenu-trigger="${parentTriggerId}"]`);
        if (parentTrigger) {
          parentTrigger.classList.add("expanded");
          parentTrigger.classList.add("active");
        }
      }
    }

    // Render skeleton page loader mockup
    el.portalBody.innerHTML = `
      <div class="locator-breadcrumb">
        <span>Admin Panel</span> <i class="fa-solid fa-angle-right"></i> <span>SPA</span> <i class="fa-solid fa-angle-right"></i> <span style="text-transform: capitalize;">${tabId}</span>
      </div>
      <div class="portal-welcome-banner">
        <div>
          <div class="loading-skeleton loading-skeleton-title" style="width: 280px; height: 32px;"></div>
          <div class="loading-skeleton loading-skeleton-text" style="width: 180px; margin-top: 8px;"></div>
        </div>
      </div>
      <div class="metrics-deck">
        <div class="metric-tile loading-skeleton" style="min-height: 120px;"></div>
        <div class="metric-tile loading-skeleton" style="min-height: 120px;"></div>
        <div class="metric-tile loading-skeleton" style="min-height: 120px;"></div>
        <div class="metric-tile loading-skeleton" style="min-height: 120px;"></div>
      </div>
      <div class="panel-card loading-skeleton" style="height: 350px; border-radius: 16px;"></div>
    `;

    // Sync database state before rendering (guarded against network/auth exceptions)
    if (window.WedEazzyStore) {
      try {
        await window.WedEazzyStore.sync();
      } catch (err) {
        console.warn("Store sync failed during mountTab:", err);
      }
    }

    renderActiveView();
  }

  // Patch only the 11 stat number nodes on the dashboard — zero DOM replacement,
  // zero flash. Called by the wedeazzy_store_updated handler instead of a full re-render.
  function _refreshDashboardStats() {
    const stats = window.WedEazzyStore.get().stats;
    const map = {
      'dash-stat-pending':    stats.pendingBookings,
      'dash-stat-inprogress': stats.inProgressBookings,
      'dash-stat-confirmed':  stats.confirmedBookings,
      'dash-stat-cancelled':  stats.cancelledBookings,
      'dash-stat-venues':     stats.venuesCount,
      'dash-stat-vendors':    stats.vendorsCount,
      'dash-stat-services':   stats.servicesCount,
      'dash-stat-users':      stats.usersCount,
      'dash-stat-claims':     stats.businessClaims,
      'dash-stat-regions':    stats.regionsCount,
      'dash-stat-cities':     stats.citiesCount,
    };
    Object.entries(map).forEach(([id, val]) => {
      const node = document.getElementById(id);
      if (node && node.textContent !== String(val)) node.textContent = val;
    });
  }

  window.renderActiveView = function renderActiveView() {
    window.WedEazzyCountryScope = localStorage.getItem('wedeazzy_country_scope') || 'all';
    const store = window.WedEazzyStore.get();

    // Sync topbar country select element value
    const topSelect = document.getElementById('globalAdminCountrySelect');
    if (topSelect && topSelect.value !== window.WedEazzyCountryScope) {
      topSelect.value = window.WedEazzyCountryScope;
    }

    // The Approve Businesses views were rebuilt in assets/js/crm.js (KPI decks,
    // charts, filter bars, CSV import). Delegate to that module when it is
    // loaded; the original implementations below are kept as a fallback so a
    // failed/blocked crm.js load degrades to the previous UI rather than a
    // blank panel.
    const CRM = window.WedEazzyCRM;
    if (CRM) {
      // Dispose any Chart.js instances from the previous view before the DOM
      // holding their canvases is replaced.
      CRM.destroyAllCharts();
      switch (state.activeTab) {
        case "vendor-crm-dashboard": return CRM.renderCrmDashboard(store);
        case "vendors":              return CRM.renderVendors(store);
        case "invitations":          return CRM.renderInvitations(store);
        case "claimed-listings":     return CRM.renderClaimedListings(store);
        case "import-listings":      return CRM.renderImportListings(store);
        case "countries":            return CRM.renderCountries(store);
        case "city":
        case "locations":            return CRM.renderLocations(store);
        default: break;
      }
    }

    async function populateGlobalCountrySelector() {
      try {
        const data = await apiFetch('/api/admin/countries');
        const countries = data.countries || [];
        const savedScope = localStorage.getItem('wedeazzy_country_scope') || 'all';
        window.WedEazzyCountryScope = savedScope;

        const selectors = document.querySelectorAll('.global-country-select, #globalAdminCountrySelect, #biCountryFilter, #crmCountryScopeSelect');

        selectors.forEach(select => {
          if (!select) return;
          select.innerHTML = `
            <option value="all" ${savedScope.toLowerCase() === 'all' ? 'selected' : ''}>🌍 All Countries (Global Platform)</option>
            ${countries.map(c => `
              <option value="${c.code}" ${savedScope.toUpperCase() === c.code.toUpperCase() ? 'selected' : ''}>
                ${c.flag || '🌐'} ${c.name} (${c.code})
              </option>
            `).join('')}
          `;
          select.value = savedScope;
        });
      } catch (err) {
        console.warn('Failed to populate country selector:', err);
      }
    }
    populateGlobalCountrySelector();

    if (state.activeTab === "dashboard") {
      renderDashboard(store);
    } else if (state.activeTab === "bookings") {
      renderBookings(store);
    } else if (state.activeTab === "venues") {
      renderVenues(store);
    } else if (state.activeTab === "vendors") {
      renderVendors(store);
    } else if (state.activeTab === "users") {
      renderUsers(store);
    } else if (state.activeTab === "whatsapp") {
      renderWhatsApp(store);
    } else if (state.activeTab === "reports") {
      mountTab("dashboard");
      return;
    } else if (state.activeTab === "settings") {
      renderSettings(store);
    } else if (state.activeTab === "profile") {
      renderProfile(store);
    } else if (state.activeTab === "transaction-history") {
      renderTransactionHistory(store);
    } else if (state.activeTab === "manage-plans") {
      renderManagePlans(store);
    } else if (state.activeTab === "automated-email") {
      renderAutomatedEmail(store);
    } else if (state.activeTab === "claimed-listings") {
      renderClaimedListings(store);
    } else if (state.activeTab === "vendor-crm-dashboard") {
      renderVendorCrmDashboard(store);
    } else if (state.activeTab === "invitations") {
      renderInvitations(store);
    } else if (state.activeTab === "blacklisted") {
      renderBlacklisted(store);
    } else if (state.activeTab === "city") {
      renderCity(store);
    } else if (state.activeTab === "regions") {
      renderRegions(store);
    } else if (state.activeTab === "venues-category") {
      renderVenuesCategory(store);
    } else if (state.activeTab === "vendors-category") {
      renderVendorsCategory(store);
    } else if (state.activeTab === "send-emails") {
      renderSendEmails(store);
    } else if (state.activeTab === "email-templates") {
      renderEmailTemplates(store);
    } else if (state.activeTab === "blogs") {
      renderBlogs(store);
    } else if (state.activeTab === "contact-inquiries") {
      renderContactInquiries(store);
    } else if (state.activeTab === "whatsapp-status") {
      renderWhatsAppStatus(store);
    } else if (state.activeTab === "grow-campaigns") {
      renderGrowCampaigns(store);
    } else if (state.activeTab === "grow-pricing") {
      renderGrowPricing(store);
    }
  }

  // -------------------------------------------------------------
  // ADDITIONAL TAB RENDERING ENGINES FOR FULL PROJECT COMPLETION
  // -------------------------------------------------------------

  // Render PROFILE
  function renderProfile(store) {
    const session = window.WedEazzyAuth ? window.WedEazzyAuth.getSession() : { email: "wedeazzy@gmail.com", role: "admin", name: "admin" };
    const initialName = session ? session.email.split('@')[0] : "Admin";
    const letter = session ? (session.avatarLetter || "A") : "A";
    
    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Admin Profile Console</span>
        </div>
        
        <div class="portal-welcome-banner">
          <div>
            <h2>My Profile & Identity Security</h2>
            <p>Manage your account credentials, view security levels, and active access session keys.</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 24px; margin-top: 15px;">
          <!-- Profile Badge Card -->
          <div class="panel-card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 32px 20px;">
            <div class="admin-badge-avatar" style="width: 90px; height: 90px; font-size: 2.2rem; margin-bottom: 16px; border: 4px solid var(--border-color); box-shadow: var(--shadow-glow); text-transform: uppercase;">
              ${letter}
            </div>
            <h3 style="font-size: 1.3rem; font-weight: 800; text-transform: capitalize;">${initialName}</h3>
            <span class="interactive-pill-badge" style="border-color: var(--brand-rose); color: var(--brand-rose); font-weight: 700; text-transform: uppercase; font-size: 0.68rem; padding: 4px 10px; margin-top: 6px; border-radius: 12px;">
              ${(session ? session.role : 'ADMIN').toUpperCase()}
            </span>
            
            <div style="width: 100%; border-top: 1px solid var(--border-subtle); margin-top: 24px; padding-top: 18px; text-align: left; font-size: 0.8rem; display: flex; flex-direction: column; gap: 10px;">
              <div><strong style="color: var(--text-sub);">Role Scope:</strong> System Super-Administrator</div>
              <div><strong style="color: var(--text-sub);">Registered Email:</strong> ${session ? session.email : 'wedeazzy@gmail.com'}</div>
              <div><strong style="color: var(--text-sub);">Status:</strong> <span style="color: #10b981; font-weight: bold;"><i class="fa-solid fa-circle-check"></i> Connected</span></div>
            </div>
          </div>

          <!-- Edit Profile Form -->
          <div class="panel-card">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 18px;">
              <h3 style="font-size: 1.1rem; font-weight: 800;">Modify Executive Settings</h3>
            </div>
            
            <form id="formUpdateProfile" style="display: flex; flex-direction: column; gap: 14px;" onsubmit="event.preventDefault(); window.showToast('Profile security locks updated locally!', 'success');">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div class="modal-form-group">
                  <label>First Name / Handle</label>
                  <input type="text" class="premium-input" value="${initialName}" required style="text-transform: capitalize;" />
                </div>
                <div class="modal-form-group">
                  <label>Access Role Level</label>
                  <input type="text" class="premium-input" value="Super Administrator" disabled style="background-color: var(--border-subtle); cursor: not-allowed;" />
                </div>
              </div>
              
              <div class="modal-form-group">
                <label>Admin Login Account Email</label>
                <input type="email" class="premium-input" value="${session ? session.email : 'wedeazzy@gmail.com'}" disabled style="background-color: var(--border-subtle); cursor: not-allowed;" />
              </div>

              <div class="modal-form-group">
                <label>System Phone Contact Number</label>
                <input type="text" class="premium-input" value="+91 99300 90487" />
              </div>

              <hr style="border: none; border-bottom: 1px solid var(--border-subtle); margin: 8px 0;" />

              <div style="display: flex; justify-content: flex-end; gap: 12px;">
                <button class="btn-premium btn-premium-rose" type="submit" style="padding: 10px 24px;">
                  <i class="fa-solid fa-cloud-arrow-up"></i> Save Profile Details
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  // Render TRANSACTION HISTORY & SUBSCRIPTIONS INTELLIGENCE
  function renderTransactionHistory(store) {
    const selectedCountry = window.WedEazzyCountryScope || state.biFilters.countryCode || 'all';
    const isGlobal = selectedCountry.toLowerCase() === 'all';

    // Scoped Data Arrays
    const rawVendors = store.vendors || [];
    const scopedVendors = isGlobal ? rawVendors : rawVendors.filter(v => (v.countryCode || 'IN').toUpperCase() === selectedCountry.toUpperCase());

    const rawTxns = store.payments || [];
    const scopedTxns = isGlobal ? rawTxns : rawTxns.filter(t => (t.countryCode || 'IN').toUpperCase() === selectedCountry.toUpperCase());

    // 1. Total Subscription Revenue & Total Plans Sold
    const successTxns = scopedTxns.filter(t => t.status === 'success');
    const totalRev = successTxns.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalPlansSold = successTxns.length;

    // 2. Most Purchased Plan from actual paid transactions
    const planCounts = {};
    successTxns.forEach(t => {
      let planName = 'Standard';
      if (t.purpose) {
        if (t.purpose.includes('subscription:')) {
          planName = t.purpose.replace('subscription:', '') + ' Plan';
        } else if (t.purpose.includes('campaign:')) {
          planName = 'Grow Ad Boost';
        } else {
          planName = t.purpose;
        }
      }
      planCounts[planName] = (planCounts[planName] || 0) + 1;
    });

    let topPlanName = 'None';
    let maxPlanCount = 0;
    Object.keys(planCounts).forEach(p => {
      if (planCounts[p] > maxPlanCount) {
        maxPlanCount = planCounts[p];
        topPlanName = p;
      }
    });

    // 3. Top Purchasing Category from actual paid vendor transactions
    const catCounts = {};
    successTxns.forEach(t => {
      const vendor = rawVendors.find(v => (v.userId && v.userId === t.userId) || (v.id && v.id === t.vendorId));
      if (vendor && vendor.category) {
        catCounts[vendor.category] = (catCounts[vendor.category] || 0) + 1;
      }
    });

    let topCategory = 'None';
    let maxCatCount = 0;
    Object.keys(catCounts).forEach(c => {
      if (catCounts[c] > maxCatCount) {
        maxCatCount = catCounts[c];
        topCategory = c;
      }
    });

    // 4. Top Purchasing City from actual paid vendor transactions
    const cityCounts = {};
    successTxns.forEach(t => {
      const vendor = rawVendors.find(v => (v.userId && v.userId === t.userId) || (v.id && v.id === t.vendorId));
      const cName = vendor ? (vendor.city || vendor.address) : null;
      if (cName) {
        cityCounts[cName] = (cityCounts[cName] || 0) + 1;
      }
    });

    let topCity = 'None';
    let maxCityCount = 0;
    Object.keys(cityCounts).forEach(c => {
      if (cityCounts[c] > maxCityCount) {
        maxCityCount = cityCounts[c];
        topCity = c;
      }
    });

    const txns = scopedTxns.map((t) => {
      const createdDate = new Date(t.createdAt);
      const dateFormatted = createdDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }) + ' ' + createdDate.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      return {
        id: t.id,
        date: dateFormatted,
        client: t.userName,
        email: t.userEmail,
        role: t.userRole,
        purpose: t.purpose,
        amount: t.amount,
        status: t.status,
        gateway: t.gateway,
        gatewayRef: t.gatewayRef
      };
    });

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Subscriptions Ledger</span>
        </div>

        <!-- EXECUTIVE SUBSCRIPTION STAT CARDS GRID (5 CARDS) -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin-bottom: 20px;">

          <!-- Card 1: Total Revenue -->
          <div class="panel-card" style="padding: 16px; background: #FFFFFF; border-left: 3px solid #E52B3A;">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #667085;">Total Revenue</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #182033; margin-top: 6px;">₹${totalRev.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div style="font-size: 0.68rem; color: #667085; margin-top: 4px;"><i class="fa-solid fa-credit-card" style="color: #E52B3A;"></i> ${successTxns.length} paid transactions</div>
          </div>

          <!-- Card 2: Total Plans Sold -->
          <div class="panel-card" style="padding: 16px; background: #FFFFFF; border-left: 3px solid #10B981;">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #667085;">Total Plans Sold</div>
            <div style="font-size: 1.4rem; font-weight: 800; color: #182033; margin-top: 6px;">${totalPlansSold.toLocaleString('en-IN')}</div>
            <div style="font-size: 0.68rem; color: #667085; margin-top: 4px;"><i class="fa-solid fa-circle-check" style="color: #10B981;"></i> Paid subscriptions & boosts</div>
          </div>

          <!-- Card 3: Most Purchased Plan -->
          <div class="panel-card" style="padding: 16px; background: #FFFFFF; border-left: 3px solid #3B82F6;">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #667085;">Most Purchased Plan</div>
            <div style="font-size: 1.2rem; font-weight: 800; color: ${topPlanName === 'None' ? '#94a3b8' : '#182033'}; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escHtml(topPlanName)}</div>
            <div style="font-size: 0.68rem; color: #667085; margin-top: 4px;"><i class="fa-solid fa-crown" style="color: #F59E0B;"></i> ${maxPlanCount} ${maxPlanCount === 1 ? 'subscription bought' : 'subscriptions bought'}</div>
          </div>

          <!-- Card 4: Most Purchasing Category -->
          <div class="panel-card" style="padding: 16px; background: #FFFFFF; border-left: 3px solid #8B5CF6;">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #667085;">Most Purchasing Category</div>
            <div style="font-size: 1.2rem; font-weight: 800; color: ${topCategory === 'None' ? '#94a3b8' : '#182033'}; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escHtml(topCategory)}</div>
            <div style="font-size: 0.68rem; color: #667085; margin-top: 4px;"><i class="fa-solid fa-layer-group" style="color: #8B5CF6;"></i> ${maxCatCount} ${maxCatCount === 1 ? 'plan purchased' : 'plans purchased'}</div>
          </div>

          <!-- Card 5: Most Purchasing City -->
          <div class="panel-card" style="padding: 16px; background: #FFFFFF; border-left: 3px solid #F59E0B;">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #667085;">Most Purchasing City</div>
            <div style="font-size: 1.2rem; font-weight: 800; color: ${topCity === 'None' ? '#94a3b8' : '#182033'}; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escHtml(topCity)}</div>
            <div style="font-size: 0.68rem; color: #667085; margin-top: 4px;"><i class="fa-solid fa-location-dot" style="color: #F59E0B;"></i> ${maxCityCount} ${maxCityCount === 1 ? 'plan purchased' : 'plans purchased'}</div>
          </div>

        </div>

        <!-- COUNTRY-WISE SUBSCRIPTION OVERVIEW BAR -->
        <div class="panel-card" style="padding: 16px 20px; background: #182033; color: #FFFFFF; margin-bottom: 20px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: #E52B3A; letter-spacing: 0.05em;">Country-Wise Subscription Overview</div>
            <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 2px;">Active Scope: <strong style="color: #ffffff;">${selectedCountry === 'all' ? '🌎 Global Marketplace' : selectedCountry.toUpperCase()}</strong> — ${scopedTxns.length} transaction records logged</div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <label for="subCountrySelect" style="font-size: 0.75rem; color: #cbd5e1; font-weight: 600;">Filter Country:</label>
            <select id="subCountrySelect" class="premium-select" style="background: #0f172a; color: #ffffff; border-color: rgba(255,255,255,0.2); font-size: 0.8rem; padding: 6px 12px; border-radius: 8px;">
              <option value="all" ${selectedCountry === 'all' ? 'selected' : ''}>🌎 All Countries</option>
              <option value="IN" ${selectedCountry === 'IN' ? 'selected' : ''}>🇮🇳 India</option>
              <option value="AE" ${selectedCountry === 'AE' ? 'selected' : ''}>🇦🇪 UAE</option>
              <option value="GB" ${selectedCountry === 'GB' ? 'selected' : ''}>🇬🇧 UK</option>
              <option value="US" ${selectedCountry === 'US' ? 'selected' : ''}>🇺🇸 USA</option>
              <option value="CA" ${selectedCountry === 'CA' ? 'selected' : ''}>🇨🇦 Canada</option>
              <option value="AU" ${selectedCountry === 'AU' ? 'selected' : ''}>🇦🇺 Australia</option>
            </select>
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3>Financial Subscriptions & Campaign Transactions Ledger</h3>
              <p>Audit premium upgrades, pincode locks, ad campaigns, and system refunds.</p>
            </div>
            <div class="panel-controls">
              <input type="text" id="txnSearch" class="premium-input" placeholder="Search customer..." style="width: 220px;" />
              <button class="btn-premium" onclick="window.exportPaymentsCsv()">
                <i class="fa-solid fa-file-excel"></i> Export CSV
              </button>
            </div>
          </div>

          <div class="table-viewport">
            <table class="grid-table">
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Transaction Date</th>
                  <th>Customer Details</th>
                  <th>Role</th>
                  <th>Purpose</th>
                  <th>Gateway</th>
                  <th>Gateway Ref</th>
                  <th>Gross Amount</th>
                  <th>Status</th>
                  <th style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody id="txnTableBody">
                ${txns.length === 0 ? `
                  <tr>
                    <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 40px 0;">
                      <i class="fa-solid fa-cash-register" style="font-size: 2rem; margin-bottom: 12px; display: block;"></i>
                      No transaction records located inside MySQL tables yet for ${selectedCountry === 'all' ? 'the global platform' : selectedCountry.toUpperCase()}.
                    </td>
                  </tr>
                ` : txns.map(t => {
                  const safeTxnStr = JSON.stringify(t).replace(/"/g, '&quot;');
                  return `
                    <tr data-txn-client="${escHtml((t.client || '').toLowerCase())}">
                      <td><strong>#${t.id}</strong></td>
                      <td><i class="fa-regular fa-calendar"></i> ${t.date}</td>
                      <td>
                        <strong>${escHtml(t.client)}</strong>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">${escHtml(t.email)}</div>
                      </td>
                      <td><span class="interactive-pill-badge" style="font-size: 0.65rem; text-transform: uppercase;">${t.role}</span></td>
                      <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(139, 92, 246, 0.15); color: #8b5cf6; text-transform: capitalize;">${t.purpose}</span></td>
                      <td><i class="fa-solid fa-credit-card" style="color: var(--text-muted);"></i> ${t.gateway}</td>
                      <td><span style="font-family: monospace; font-size: 0.72rem;">${t.gatewayRef || '—'}</span></td>
                      <td><strong>₹${Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                      <td>
                        <span class="status-pill status-${t.status === 'success' ? 'confirmed' : t.status === 'failed' ? 'cancelled' : t.status === 'refunded' ? 'cancelled' : 'pending'}">
                          <span class="status-bullet-dot"></span> ${t.status}
                        </span>
                      </td>
                      <td style="text-align: right;">
                        <div style="display: flex; gap: 8px; justify-content: flex-end;">
                          ${t.status === 'success' ? `
                            <button class="btn-premium btn-premium-rose" style="font-size: 0.72rem; padding: 4px 8px;" 
                              onclick="if(confirm('Are you sure you want to refund transaction #${t.id}? This will downgrade the vendor to Basic.')) { WedEazzyStore.refundTransaction('${t.id}').then(res => { if(res.ok) { window.showToast('Refund processed successfully!', 'success'); } else { window.showToast(res.message || 'Refund failed', 'error'); } }) }">
                              <i class="fa-solid fa-arrow-rotate-left"></i> Refund
                            </button>
                          ` : ''}
                          <button class="row-action-icon-btn" title="Download Invoice" onclick="printAdminInvoice(${safeTxnStr})">
                            <i class="fa-solid fa-print"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Connect Country Filter
    const subCountrySelect = document.getElementById("subCountrySelect");
    if (subCountrySelect) {
      subCountrySelect.addEventListener("change", (e) => {
        const newCountry = e.target.value;
        if (window.handleGlobalCountryChange) {
          window.handleGlobalCountryChange(newCountry);
        } else {
          window.WedEazzyCountryScope = newCountry;
          state.biFilters.countryCode = newCountry;
          renderTransactionHistory(store);
        }
      });
    }

    const search = document.getElementById("txnSearch");
    if (search) {
      search.addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll("#txnTableBody tr").forEach(row => {
          const client = row.getAttribute("data-txn-client");
          if (client) row.style.display = client.includes(q) ? "" : "none";
        });
      });
    }
  }

  // Global invoice printer
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
            .logo { font-size: 24px; font-weight: 800; color: #DC1F30; text-decoration: none; }
            .invoice-title { font-size: 28px; font-weight: 800; color: #0f172a; text-align: right; }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
            .details-card h3 { font-size: 14px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 8px; margin-top: 0; }
            .details-card p { margin: 4px 0; font-size: 14px; color: #334155; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; padding: 12px; font-weight: 700; text-align: left; font-size: 14px; color: #475569; }
            td { border-bottom: 1px solid #f1f5f9; padding: 12px; font-size: 14px; color: #334155; }
            .totals-table { width: 300px; float: right; margin-top: 20px; }
            .totals-table td { border: none; padding: 6px 12px; }
            .totals-table tr.grand-total td { font-size: 16px; font-weight: 700; color: #DC1F30; border-top: 1px solid #e2e8f0; padding-top: 12px; }
            .footer { margin-top: 100px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
            @media print {
              body { padding: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: flex-end;">
            <button onclick="window.print()" style="background: #DC1F30; color: white; border: none; padding: 10px 20px; font-size: 14px; font-weight: 700; border-radius: 6px; cursor: pointer;">Print Invoice</button>
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
              <p><strong>${escHtml(t.client)}</strong></p>
              <p>Role: ${escHtml(t.role ? t.role.toUpperCase() : 'VENDOR')}</p>
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
          <div class="footer">
            <p>Thank you for partnering with WedEazzy. This is a computer-generated tax invoice and requires no physical signature.</p>
            <p>© ${new Date().getFullYear()} WedEazzy.com. All Rights Reserved.</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };


  // Render MANAGE PLANS — Multi-Country Flexible Pricing, Filters & Pagination
  async function renderManagePlans(store) {
    const vendors = store.vendors || [];
    let activeCountryCode = (window.WedEazzyCountryScope && window.WedEazzyCountryScope !== 'all') 
      ? window.WedEazzyCountryScope.toUpperCase() 
      : 'IN';

    // Fetch dynamic countries list from DB
    let configuredCountries = [];
    try {
      const cRes = await apiFetch('/api/admin/countries');
      configuredCountries = cRes.countries || [];
    } catch (_) {}

    if (!configuredCountries.length) {
      configuredCountries = [
        { code: 'IN', name: 'India', flag: '🇮🇳', currencySymbol: '₹', currency: 'INR' },
        { code: 'AE', name: 'UAE', flag: '🇦🇪', currencySymbol: 'AED', currency: 'AED' },
        { code: 'GB', name: 'UK', flag: '🇬🇧', currencySymbol: '£', currency: 'GBP' },
        { code: 'US', name: 'USA', flag: '🇺🇸', currencySymbol: '$', currency: 'USD' },
        { code: 'CA', name: 'Canada', flag: '🇨🇦', currencySymbol: 'CA$', currency: 'CAD' },
        { code: 'AU', name: 'Australia', flag: '🇦🇺', currencySymbol: 'A$', currency: 'AUD' }
      ];
    }

    // Extract unique cities and categories for dynamic dropdown filters
    const uniqueCities = [...new Set(vendors.map(v => v.city).filter(Boolean))].sort();
    const uniqueCategories = [...new Set(vendors.map(v => v.category).filter(Boolean))].sort();

    // Fetch full multi-country plans config
    const res = await window.WedEazzyStore.getPlans('all');
    const fullConfig = res.plans || {};
    window._plansFullCache = fullConfig;

    function getCountryPlans(cCode) {
      const code = cCode.toUpperCase();
      if (fullConfig.countries && fullConfig.countries[code]) {
        return fullConfig.countries[code];
      }
      if (fullConfig.countries && fullConfig.countries.IN) {
        return fullConfig.countries.IN;
      }
      return {
        currency: 'INR',
        currencySymbol: '₹',
        Free: fullConfig.Free || { price: 0, maxPhotos: 4, maxBusinesses: 1, description: 'Basic listing visibility.' },
        Premium: fullConfig.Premium || { price: 2999, maxPhotos: 10, maxBusinesses: 3, description: 'Higher search ranking.' },
        Featured: fullConfig.Featured || { price: 5999, maxPhotos: 15, maxBusinesses: 7, description: 'Highest search ranking.' }
      };
    }

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Manage Vendor Plans</span>
        </div>

        <!-- Country Scope Selection Bar -->
        <div style="display: flex; align-items: center; justify-content: space-between; background: var(--surface-bg); padding: 16px 20px; border-radius: 14px; border: 1px solid var(--border-color); margin-bottom: 24px; flex-wrap: wrap; gap: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 1.5rem;">🌍</span>
            <div>
              <h4 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: var(--text-main);">Multi-Country Vendor Subscription Manager</h4>
              <div style="font-size: 0.78rem; color: var(--text-sub); margin-top: 2px;">Customize tier pricing, photo limits, and descriptions independently for every market.</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-sub);">Select Country Pricing:</label>
            <select id="plansCountryScopeSelect" style="background: var(--surface-subtle); color: var(--text-main); border: 1px solid var(--border-color); font-weight: 700; font-size: 0.85rem; padding: 8px 14px; border-radius: 10px; cursor: pointer; outline: none;">
              ${configuredCountries.map(c => `
                <option value="${c.code}" ${c.code === activeCountryCode ? 'selected' : ''}>
                  ${c.flag || '🌐'} ${c.name} (${c.currencySymbol || c.currency || c.code})
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Dynamic Container for Cards and Form -->
        <div id="countryPlansContentContainer"></div>

        <!-- Vendor Plan Manager Panel with Filters & Pagination -->
        <div class="panel-card" style="margin-top: 24px; padding: 0; overflow: hidden;">
          <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding: 20px 24px; background: #ffffff;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; width: 100%;">
              <div class="panel-title-group">
                <h3 style="font-size: 1.15rem; font-weight: 800; margin: 0; color: var(--text-main);">Vendor Plan Upgrade Panel</h3>
                <p style="font-size: 0.8rem; color: var(--text-sub); margin: 4px 0 0;">Promote, downgrade, renew, extend, or toggle vendor subscriptions manually across categories, cities, and countries.</p>
              </div>
            </div>

            <!-- FILTER TOOLBAR GRID -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 16px; width: 100%;">
              <!-- Search -->
              <div style="grid-column: span 2;">
                <input type="text" id="planVendorSearch" class="premium-input" placeholder="Search by business name, ID, contact..." style="width: 100%;" />
              </div>
              <!-- Country Filter -->
              <div>
                <select id="planVendorCountryFilter" class="premium-input" style="width: 100%; font-weight: 600;">
                  <option value="">All Countries</option>
                  ${configuredCountries.map(c => `<option value="${c.code}">${c.flag || ''} ${c.name}</option>`).join('')}
                </select>
              </div>
              <!-- City Filter -->
              <div>
                <select id="planVendorCityFilter" class="premium-input" style="width: 100%; font-weight: 600;">
                  <option value="">All Cities</option>
                  ${uniqueCities.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
                </select>
              </div>
              <!-- Category Filter -->
              <div>
                <select id="planVendorCategoryFilter" class="premium-input" style="width: 100%; font-weight: 600;">
                  <option value="">All Categories</option>
                  ${uniqueCategories.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
                </select>
              </div>
              <!-- Plan Filter -->
              <div>
                <select id="planVendorPlanFilter" class="premium-input" style="width: 100%; font-weight: 600;">
                  <option value="">All Plans</option>
                  <option value="Free">Free</option>
                  <option value="Premium">Premium</option>
                  <option value="Featured">Featured</option>
                </select>
              </div>
              <!-- Status Filter -->
              <div>
                <select id="planVendorStatusFilter" class="premium-input" style="width: 100%; font-weight: 600;">
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Expired">Expired</option>
                  <option value="Deactivated">Deactivated</option>
                </select>
              </div>
              <!-- Reset Button -->
              <div>
                <button id="planVendorResetBtn" class="btn-premium" style="width: 100%; padding: 8px; justify-content: center; font-weight: 700;" title="Reset all filters">
                  <i class="fa-solid fa-rotate-left"></i> Reset
                </button>
              </div>
            </div>
          </div>

          <!-- TABLE VIEWPORT -->
          <div class="table-viewport" style="padding: 0 16px;">
            <table class="grid-table" style="width: 100%;">
              <thead>
                <tr>
                  <th>Vendor ID</th>
                  <th>Business & Location</th>
                  <th>Current Plan</th>
                  <th>Status</th>
                  <th>Expiry Date</th>
                  <th>Days Left</th>
                  <th>Gallery Usage</th>
                  <th>Reports</th>
                  <th>Insights</th>
                  <th style="text-align: right;">Subscription Control</th>
                </tr>
              </thead>
              <tbody id="planVendorTableBody">
                <!-- Dynamic Rows -->
              </tbody>
            </table>
          </div>

          <!-- PAGINATION FOOTER -->
          <div id="planVendorPaginationFooter"></div>
        </div>
      </div>
    `;

    function updateCountryPlansView(cCode) {
      activeCountryCode = cCode;
      const cMeta = configuredCountries.find(c => c.code === cCode) || { name: cCode, flag: '🌐', currencySymbol: '₹', currency: 'INR' };
      const currentPlans = getCountryPlans(cCode);
      const symbol = currentPlans.currencySymbol || cMeta.currencySymbol || '₹';
      const cName = cMeta.name || cCode;

      const free = currentPlans.Free || { price: 0, maxPhotos: 4, maxBusinesses: 1, description: '' };
      const premium = currentPlans.Premium || { price: 2999, maxPhotos: 10, maxBusinesses: 3, description: '' };
      const featured = currentPlans.Featured || { price: 5999, maxPhotos: 15, maxBusinesses: 7, description: '' };

      const container = document.getElementById('countryPlansContentContainer');
      if (!container) return;

      container.innerHTML = `
        <!-- 3 Plan Pricing Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 28px;">
          <!-- Free Plan Card -->
          <div class="panel-card" style="border-top: 5px solid var(--text-muted); display: flex; flex-direction: column; align-items: center; text-align: center; padding: 24px 16px;">
            <span style="font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Tier 1</span>
            <h3 style="font-size: 1.3rem; font-weight: 800; margin-top: 6px;">Free Plan</h3>
            <div style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin: 12px 0;">${symbol}${free.price} <span style="font-size: 0.78rem; font-weight: 500; color: var(--text-muted);">/ forever</span></div>
            <p style="font-size: 0.77rem; color: var(--text-sub); line-height: 1.4; margin-bottom: 14px;">${free.description}</p>
            <span class="interactive-pill-badge" style="font-size: 0.7rem;">${cMeta.flag} ${cName} Scope</span>
          </div>

          <!-- Premium Plan Card -->
          <div class="panel-card" style="border-top: 5px solid var(--brand-rose); display: flex; flex-direction: column; align-items: center; text-align: center; padding: 24px 16px; position: relative;">
            <div style="position: absolute; top: -11px; background: linear-gradient(135deg, var(--brand-rose), var(--brand-gold)); color: white; font-size: 0.6rem; font-weight: 800; padding: 3px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em;">Most Popular</div>
            <span style="font-size: 0.72rem; font-weight: 800; color: var(--brand-rose); text-transform: uppercase; letter-spacing: 0.05em;">Tier 2</span>
            <h3 style="font-size: 1.3rem; font-weight: 800; margin-top: 6px;">Premium Tier</h3>
            <div style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin: 12px 0;">${symbol}${Number(premium.price).toLocaleString('en-IN')} <span style="font-size: 0.78rem; font-weight: 500; color: var(--text-muted);">/ month</span></div>
            <p style="font-size: 0.77rem; color: var(--text-sub); line-height: 1.4; margin-bottom: 14px;">${premium.description}</p>
            <span class="interactive-pill-badge" style="font-size: 0.7rem;">${cMeta.flag} ${cName} Scope</span>
          </div>

          <!-- Featured Plan Card -->
          <div class="panel-card" style="border-top: 5px solid var(--brand-gold); display: flex; flex-direction: column; align-items: center; text-align: center; padding: 24px 16px;">
            <span style="font-size: 0.72rem; font-weight: 800; color: var(--brand-gold); text-transform: uppercase; letter-spacing: 0.05em;">Tier 3</span>
            <h3 style="font-size: 1.3rem; font-weight: 800; margin-top: 6px;">Featured Lockout</h3>
            <div style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin: 12px 0;">${symbol}${Number(featured.price).toLocaleString('en-IN')} <span style="font-size: 0.78rem; font-weight: 500; color: var(--text-muted);">/ month</span></div>
            <p style="font-size: 0.77rem; color: var(--text-sub); line-height: 1.4; margin-bottom: 14px;">${featured.description}</p>
            <span class="interactive-pill-badge" style="font-size: 0.7rem;">${cMeta.flag} ${cName} Scope</span>
          </div>
        </div>

        <!-- Subscription Plans Settings Form -->
        <div class="panel-card">
          <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 16px;">
            <div class="panel-title-group">
              <h3 style="font-size: 1.15rem; font-weight: 800;">${cMeta.flag} ${cName} Subscription Plans Settings</h3>
              <p>Customize dynamic prices (${symbol}), photo limits, and descriptions for ${cName} vendors.</p>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;">
            <!-- Free Form -->
            <div style="background: var(--surface-bg); padding: 16px; border: 1px solid var(--border-color); border-radius: 8px;">
              <h4 style="margin-top:0; color:var(--text-main); font-weight: 700; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">Free Plan</h4>
              <div style="margin-bottom: 12px; margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                  <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Max Photos</label>
                  <input type="number" id="cfgFreePhotos" class="premium-input" style="width:100%;" value="${free.maxPhotos || 4}">
                </div>
                <div>
                  <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Max Businesses</label>
                  <input type="number" id="cfgFreeBusinesses" class="premium-input" style="width:100%;" value="${free.maxBusinesses || 1}">
                </div>
              </div>
              <div>
                <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Short Description</label>
                <input type="text" id="cfgFreeDesc" class="premium-input" style="width:100%;" value="${escHtml(free.description || '')}">
              </div>
            </div>

            <!-- Premium Form -->
            <div style="background: var(--surface-bg); padding: 16px; border: 1px solid var(--border-color); border-radius: 8px;">
              <h4 style="margin-top:0; color:var(--brand-rose); font-weight: 700; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">Premium Plan</h4>
              <div style="margin-bottom: 12px; margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                <div>
                  <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Price (${symbol})</label>
                  <input type="number" id="cfgPremiumPrice" class="premium-input" style="width:100%;" value="${premium.price}">
                </div>
                <div>
                  <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Max Photos</label>
                  <input type="number" id="cfgPremiumPhotos" class="premium-input" style="width:100%;" value="${premium.maxPhotos || 10}">
                </div>
                <div>
                  <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Max Biz</label>
                  <input type="number" id="cfgPremiumBusinesses" class="premium-input" style="width:100%;" value="${premium.maxBusinesses || 3}">
                </div>
              </div>
              <div>
                <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Short Description</label>
                <input type="text" id="cfgPremiumDesc" class="premium-input" style="width:100%;" value="${escHtml(premium.description || '')}">
              </div>
            </div>

            <!-- Featured Form -->
            <div style="background: var(--surface-bg); padding: 16px; border: 1px solid var(--border-color); border-radius: 8px;">
              <h4 style="margin-top:0; color:var(--brand-gold); font-weight: 700; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">Featured Plan</h4>
              <div style="margin-bottom: 12px; margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                <div>
                  <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Price (${symbol})</label>
                  <input type="number" id="cfgFeaturedPrice" class="premium-input" style="width:100%;" value="${featured.price}">
                </div>
                <div>
                  <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Max Photos</label>
                  <input type="number" id="cfgFeaturedPhotos" class="premium-input" style="width:100%;" value="${featured.maxPhotos || 15}">
                </div>
                <div>
                  <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Max Biz</label>
                  <input type="number" id="cfgFeaturedBusinesses" class="premium-input" style="width:100%;" value="${featured.maxBusinesses || 7}">
                </div>
              </div>
              <div>
                <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Short Description</label>
                <input type="text" id="cfgFeaturedDesc" class="premium-input" style="width:100%;" value="${escHtml(featured.description || '')}">
              </div>
            </div>
          </div>

          <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
            <button id="saveGlobalPlansBtn" class="btn-premium" style="border-color: var(--brand-gold); color: var(--brand-gold); font-weight:700;">
              <i class="fa-solid fa-floppy-disk"></i> Save ${cName} Plan Settings
            </button>
          </div>
        </div>
      `;

      // Save handler for current country
      const saveBtn = document.getElementById("saveGlobalPlansBtn");
      if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
          const updatedCountryPlans = {
            currency: cMeta.currency || 'INR',
            currencySymbol: symbol,
            Free: {
              price: 0,
              maxPhotos: parseInt(document.getElementById('cfgFreePhotos').value) || 4,
              maxBusinesses: parseInt(document.getElementById('cfgFreeBusinesses').value) || 1,
              reportsAccess: false,
              insightsAccess: false,
              description: document.getElementById('cfgFreeDesc').value
            },
            Premium: {
              price: parseFloat(document.getElementById('cfgPremiumPrice').value) || 0,
              maxPhotos: parseInt(document.getElementById('cfgPremiumPhotos').value) || 10,
              maxBusinesses: parseInt(document.getElementById('cfgPremiumBusinesses').value) || 3,
              reportsAccess: true,
              insightsAccess: false,
              description: document.getElementById('cfgPremiumDesc').value
            },
            Featured: {
              price: parseFloat(document.getElementById('cfgFeaturedPrice').value) || 0,
              maxPhotos: parseInt(document.getElementById('cfgFeaturedPhotos').value) || 15,
              maxBusinesses: parseInt(document.getElementById('cfgFeaturedBusinesses').value) || 7,
              reportsAccess: true,
              insightsAccess: true,
              description: document.getElementById('cfgFeaturedDesc').value
            }
          };

          const res = await window.WedEazzyStore.updatePlans(updatedCountryPlans, cCode);
          if (res.ok) {
            window.showToast(`${cName} plan configuration saved successfully!`, 'success');
            if (res.plans) window._plansFullCache = res.plans;
            updateCountryPlansView(cCode);
          } else {
            window.showToast(res.message || 'Failed to update plans', 'error');
          }
        });
      }
    }

    // Initial view render
    updateCountryPlansView(activeCountryCode);

    // Filter & Pagination State
    let tableState = {
      search: '',
      country: '',
      city: '',
      category: '',
      plan: '',
      status: '',
      page: 1,
      perPage: 20
    };

    window.setPlanVendorPage = function(p) {
      tableState.page = p;
      renderPlanVendorTable();
    };

    function renderPlanVendorTable() {
      const currentPlans = getCountryPlans(activeCountryCode);

      // Filter vendors
      let filtered = vendors.filter(v => {
        if (tableState.search) {
          const q = tableState.search.toLowerCase();
          const matchName = (v.name || '').toLowerCase().includes(q);
          const matchId = (v.id || '').toLowerCase().includes(q);
          const matchContact = (v.contact || '').toLowerCase().includes(q);
          const matchEmail = (v.email || '').toLowerCase().includes(q);
          if (!matchName && !matchId && !matchContact && !matchEmail) return false;
        }

        if (tableState.country) {
          const cCode = tableState.country.toUpperCase();
          if ((v.countryCode || '').toUpperCase() !== cCode) {
            const cMeta = configuredCountries.find(c => c.code === cCode);
            if (!cMeta || (v.country || '').toLowerCase() !== cMeta.name.toLowerCase()) return false;
          }
        }

        if (tableState.city && (v.city || '').toLowerCase() !== tableState.city.toLowerCase()) {
          return false;
        }

        if (tableState.category && (v.category || '').toLowerCase() !== tableState.category.toLowerCase()) {
          return false;
        }

        const vPlan = v.subscriptionPlan || "Free";
        if (tableState.plan && vPlan.toLowerCase() !== tableState.plan.toLowerCase()) {
          return false;
        }

        if (tableState.status) {
          const isFree = vPlan === 'Free';
          const exp = v.subscriptionExpiry ? new Date(v.subscriptionExpiry) : null;
          const isExpired = exp ? exp < new Date() : false;
          let statusText = 'Active';
          if (v.status !== 'approved') statusText = 'Deactivated';
          else if (isExpired && !isFree) statusText = 'Expired';
          else if (isFree) statusText = 'Active';

          if (statusText.toLowerCase() !== tableState.status.toLowerCase()) return false;
        }

        return true;
      });

      const totalItems = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / tableState.perPage));
      if (tableState.page > totalPages) tableState.page = totalPages;

      const startIdx = (tableState.page - 1) * tableState.perPage;
      const endIdx = Math.min(startIdx + tableState.perPage, totalItems);
      const pagedList = filtered.slice(startIdx, endIdx);

      const tableBody = document.getElementById('planVendorTableBody');
      if (tableBody) {
        if (pagedList.length === 0) {
          tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 36px;">No matching vendors found for active filters.</td></tr>`;
        } else {
          tableBody.innerHTML = pagedList.map(v => {
            const plan = v.subscriptionPlan || "Free";
            const isFree = plan === 'Free';
            let expiryDate = 'N/A';
            let daysRemaining = '—';
            let isExpired = false;

            if (v.subscriptionExpiry) {
              const exp = new Date(v.subscriptionExpiry);
              expiryDate = exp.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
              isExpired = exp < new Date();
              if (!isExpired) {
                daysRemaining = Math.ceil((exp.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) + ' days';
              } else {
                daysRemaining = 'Expired';
              }
            }

            const planMaxPhotos = currentPlans[plan]?.maxPhotos || 4;
            const photoCount = v.photoCount || 0;
            const galleryUsage = `${photoCount}/${planMaxPhotos}`;

            const reportsAccess = (currentPlans[plan]?.reportsAccess) ? 'Yes' : 'No';
            const insightsAccess = (currentPlans[plan]?.insightsAccess) ? 'Yes' : 'No';

            let statusText = 'Active';
            let statusClass = 'status-approved';
            if (v.status !== 'approved') {
              statusText = 'Deactivated';
              statusClass = 'status-pending';
            } else if (isExpired && !isFree) {
              statusText = 'Expired';
              statusClass = 'status-cancelled';
            } else if (isFree) {
              statusText = 'Free';
              statusClass = 'status-approved';
            }

            return `
              <tr>
                <td><strong>#${escHtml(v.id)}</strong></td>
                <td>
                  <strong>${escHtml(v.name)}</strong>
                  <div style="font-size: 0.72rem; color: var(--text-sub); margin-top: 2px;">
                    ${escHtml(v.city || '—')}, ${escHtml(v.country || 'India')} (${escHtml(v.category || 'Vendor')})
                  </div>
                </td>
                <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(59, 130, 246, 0.15); color: var(--brand-blue);">${plan}</span></td>
                <td><span class="status-pill ${statusClass}">${statusText}</span></td>
                <td>${expiryDate}</td>
                <td><strong>${daysRemaining}</strong></td>
                <td><span style="font-size: 12px; font-weight: 700; color: ${photoCount > planMaxPhotos ? 'var(--brand-rose)' : 'var(--text-sub)'}">${galleryUsage}</span></td>
                <td><strong>${reportsAccess}</strong></td>
                <td><strong>${insightsAccess}</strong></td>
                <td style="text-align: right;">
                  <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="btn-premium" style="font-size: 0.72rem; padding: 4px 8px; border-color: var(--brand-gold); color: var(--brand-gold);"
                      onclick="window.openEditSubscriptionModal('${v.id}', '${plan}', '${v.subscriptionExpiry || ''}', ${v.status === 'approved'})">
                      <i class="fa-solid fa-pen-to-square"></i> Edit Subscription
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      // Render Pagination Footer
      const paginationFooter = document.getElementById('planVendorPaginationFooter');
      if (paginationFooter) {
        paginationFooter.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-top: 1px solid var(--border-subtle); flex-wrap: wrap; gap: 14px; background: var(--surface-bg); border-radius: 0 0 12px 12px;">
            <div style="font-size: 0.8rem; color: var(--text-sub); font-weight: 600;">
              Showing ${totalItems === 0 ? 0 : startIdx + 1} to ${endIdx} of ${totalItems.toLocaleString('en-IN')} vendors
              ${filtered.length !== vendors.length ? `<span style="color: var(--brand-rose);"> (filtered from ${vendors.length.toLocaleString('en-IN')} total)</span>` : ''}
            </div>

            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 0.78rem; color: var(--text-sub);">Per page:</span>
                <select id="planVendorPerPageSelect" style="background: var(--surface-subtle); border: 1px solid var(--border-color); font-size: 0.78rem; padding: 4px 8px; border-radius: 6px; font-weight: 700; cursor: pointer;">
                  <option value="10" ${tableState.perPage === 10 ? 'selected' : ''}>10</option>
                  <option value="20" ${tableState.perPage === 20 ? 'selected' : ''}>20</option>
                  <option value="50" ${tableState.perPage === 50 ? 'selected' : ''}>50</option>
                  <option value="100" ${tableState.perPage === 100 ? 'selected' : ''}>100</option>
                </select>
              </div>

              <div style="display: flex; gap: 6px;">
                <button class="btn-premium" ${tableState.page <= 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="window.setPlanVendorPage(1)" title="First Page">
                  <i class="fa-solid fa-angles-left"></i>
                </button>
                <button class="btn-premium" ${tableState.page <= 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="window.setPlanVendorPage(${tableState.page - 1})" title="Previous Page">
                  <i class="fa-solid fa-angle-left"></i> Prev
                </button>
                <span style="padding: 6px 12px; font-size: 0.8rem; font-weight: 700; background: var(--surface-subtle); border-radius: 8px; border: 1px solid var(--border-color);">
                  Page ${tableState.page} of ${totalPages}
                </span>
                <button class="btn-premium" ${tableState.page >= totalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="window.setPlanVendorPage(${tableState.page + 1})" title="Next Page">
                  Next <i class="fa-solid fa-angle-right"></i>
                </button>
                <button class="btn-premium" ${tableState.page >= totalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''} onclick="window.setPlanVendorPage(${totalPages})" title="Last Page">
                  <i class="fa-solid fa-angles-right"></i>
                </button>
              </div>
            </div>
          </div>
        `;

        const perPageEl = document.getElementById('planVendorPerPageSelect');
        if (perPageEl) {
          perPageEl.addEventListener('change', (e) => {
            tableState.perPage = parseInt(e.target.value, 10) || 20;
            tableState.page = 1;
            renderPlanVendorTable();
          });
        }
      }
    }

    // Attach Event Listeners to Filter Controls
    const searchEl = document.getElementById("planVendorSearch");
    if (searchEl) {
      searchEl.addEventListener("input", (e) => {
        tableState.search = e.target.value;
        tableState.page = 1;
        renderPlanVendorTable();
      });
    }

    const countryFilterEl = document.getElementById("planVendorCountryFilter");
    if (countryFilterEl) {
      countryFilterEl.addEventListener("change", (e) => {
        tableState.country = e.target.value;
        tableState.page = 1;
        renderPlanVendorTable();
      });
    }

    const cityFilterEl = document.getElementById("planVendorCityFilter");
    if (cityFilterEl) {
      cityFilterEl.addEventListener("change", (e) => {
        tableState.city = e.target.value;
        tableState.page = 1;
        renderPlanVendorTable();
      });
    }

    const categoryFilterEl = document.getElementById("planVendorCategoryFilter");
    if (categoryFilterEl) {
      categoryFilterEl.addEventListener("change", (e) => {
        tableState.category = e.target.value;
        tableState.page = 1;
        renderPlanVendorTable();
      });
    }

    const planFilterEl = document.getElementById("planVendorPlanFilter");
    if (planFilterEl) {
      planFilterEl.addEventListener("change", (e) => {
        tableState.plan = e.target.value;
        tableState.page = 1;
        renderPlanVendorTable();
      });
    }

    const statusFilterEl = document.getElementById("planVendorStatusFilter");
    if (statusFilterEl) {
      statusFilterEl.addEventListener("change", (e) => {
        tableState.status = e.target.value;
        tableState.page = 1;
        renderPlanVendorTable();
      });
    }

    const resetBtnEl = document.getElementById("planVendorResetBtn");
    if (resetBtnEl) {
      resetBtnEl.addEventListener("click", () => {
        tableState = { search: '', country: '', city: '', category: '', plan: '', status: '', page: 1, perPage: 20 };
        if (searchEl) searchEl.value = '';
        if (countryFilterEl) countryFilterEl.value = '';
        if (cityFilterEl) cityFilterEl.value = '';
        if (categoryFilterEl) categoryFilterEl.value = '';
        if (planFilterEl) planFilterEl.value = '';
        if (statusFilterEl) statusFilterEl.value = '';
        renderPlanVendorTable();
      });
    }

    // Attach Country Selector Change Listener for 0ms Smooth Switch
    const countrySelectEl = document.getElementById('plansCountryScopeSelect');
    if (countrySelectEl) {
      countrySelectEl.addEventListener('change', (e) => {
        updateCountryPlansView(e.target.value);
        renderPlanVendorTable();
      });
    }

    // Initial table render
    renderPlanVendorTable();
  }

  // Edit Subscription Modal Handlers
  window.openEditSubscriptionModal = function(vendorId, currentPlan, expiryDate, isActive) {
    let modal = document.getElementById('editSubscriptionModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'editSubscriptionModal';
      modal.className = 'otp-overlay';
      document.body.appendChild(modal);
    }
    
    const activeCode = (window.WedEazzyCountryScope && window.WedEazzyCountryScope !== 'all') ? window.WedEazzyCountryScope.toUpperCase() : 'IN';
    const plansCache = window._plansFullCache || {};
    const countryPlans = (plansCache.countries && plansCache.countries[activeCode]) ? plansCache.countries[activeCode] : (plansCache.countries && plansCache.countries.IN ? plansCache.countries.IN : plansCache);

    const symbol = countryPlans?.currencySymbol || '₹';
    const freePrice = countryPlans?.Free?.price ?? 0;
    const premiumPrice = countryPlans?.Premium?.price ?? 2999;
    const featuredPrice = countryPlans?.Featured?.price ?? 5999;

    const formattedDate = expiryDate ? new Date(expiryDate).toISOString().slice(0, 10) : '';

    modal.innerHTML = `
      <div class="otp-card" style="max-width: 450px; text-align: left; padding: 32px; z-index: 1000; position: relative; background: var(--surface-bg); border-radius: 12px; border: 1px solid var(--border-color);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px;">
          <h3 style="font-family: var(--font-head); font-size: 20px; color: var(--text-main); margin:0;">Edit Vendor Subscription</h3>
          <button onclick="document.getElementById('editSubscriptionModal').style.display='none'" style="font-size: 24px; color: var(--text-muted); background: none; border: none; cursor: pointer; line-height: 1;">&times;</button>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div>
            <label style="font-size: 12px; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 6px;">Select Subscription Plan</label>
            <select id="editSubPlan" class="premium-input" style="width: 100%;">
              <option value="Free" ${currentPlan === 'Free' ? 'selected' : ''}>Free (${symbol}${freePrice}/mo)</option>
              <option value="Premium" ${currentPlan === 'Premium' ? 'selected' : ''}>Premium (${symbol}${Number(premiumPrice).toLocaleString('en-IN')}/mo)</option>
              <option value="Featured" ${currentPlan === 'Featured' ? 'selected' : ''}>Featured (${symbol}${Number(featuredPrice).toLocaleString('en-IN')}/mo)</option>
            </select>
          </div>

          <div>
            <label style="font-size: 12px; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 6px;">Expiry Date</label>
            <input type="date" id="editSubExpiry" class="premium-input" style="width: 100%;" value="${formattedDate}">
          </div>

          <div style="display: flex; align-items: center; gap: 10px; margin-top: 4px;">
            <input type="checkbox" id="editSubActive" ${isActive ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
            <label for="editSubActive" style="font-size: 13px; font-weight: 600; color: var(--text-main); cursor: pointer;">Active Profile Visibility</label>
          </div>
        </div>

        <div style="margin-top: 24px; display: flex; justify-content: flex-end; gap: 12px;">
          <button onclick="document.getElementById('editSubscriptionModal').style.display='none'" class="btn-premium btn-premium-rose" style="font-size: 13px; padding: 8px 16px;">Cancel</button>
          <button onclick="submitEditSubscription('${vendorId}')" class="btn-premium" style="font-size: 13px; padding: 8px 16px; border-color: var(--brand-gold); color: var(--brand-gold);">Save Changes</button>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
  };

  window.submitEditSubscription = function(vendorId) {
    const planName = document.getElementById('editSubPlan').value;
    const expiryVal = document.getElementById('editSubExpiry').value;
    const isActive = document.getElementById('editSubActive').checked;
    
    const expiryDate = expiryVal ? new Date(expiryVal).toISOString() : null;

    window.WedEazzyStore.updateVendorSubscription(vendorId, { planName, expiryDate, isActive })
      .then(res => {
        if (res.ok) {
          window.showToast('Subscription updated successfully!', 'success');
          document.getElementById('editSubscriptionModal').style.display = 'none';
          window.WedEazzyStore.sync().then(() => {
            renderManagePlans(window.WedEazzyStore.get());
          });
        } else {
          window.showToast(res.message || res.error || 'Failed to update subscription', 'error');
        }
      });
  };

  // Render AUTOMATED EMAIL triggers
  function renderAutomatedEmail(store) {
    const workflowMeta = [
      { id: "welcome-otp", code: "WF-01", desc: "Dispatched upon verification of the vendor email registration OTP." },
      { id: "couple-otp", code: "WF-02", desc: "Dynamic login security code sent to couple clients." },
      { id: "inquiry-forward", code: "WF-03", desc: "Sent automatically when a couple's inquiry is captured for a vendor." },
      { id: "booking-confirm", code: "WF-04", desc: "Fires when an administrator marks a booking as confirmed." },
      { id: "user-suspend", code: "WF-05", desc: "Triggered upon administrative restriction of user credentials." }
    ];

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Automated System Emails</span>
        </div>

        <div class="panel-card">
          <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 12px;">
            <div class="panel-title-group">
              <h3>System Notification Email Automation Workflows</h3>
              <p>Configure trigger signals, modify email HTML, and toggle transactional workflow states.</p>
            </div>
            <button class="btn-premium btn-premium-rose" onclick="window.showSmtpConfig()">
              <i class="fa-solid fa-gears"></i> SMTP Server Setup
            </button>
          </div>

          <div id="emailWorkflowsList" style="display: flex; flex-direction: column; gap: 16px;">
            ${workflowMeta.map(wf => `
              <div style="border: 1px solid var(--border-color); padding: 16px 20px; border-radius: 12px; background-color: var(--canvas-bg); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                <div style="flex: 1; min-width: 280px;">
                  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                    <strong id="wfName_${wf.id}" style="font-size: 1rem; color: var(--text-main);">Loading…</strong>
                    <span class="interactive-pill-badge" style="font-size: 0.65rem; border-color: var(--border-subtle); color: var(--text-muted);">${wf.code}</span>
                  </div>
                  <p style="font-size: 0.77rem; color: var(--text-sub);">${wf.desc}</p>
                </div>

                <div style="display: flex; align-items: center; gap: 14px;">
                  <label class="premium-switch-wrap" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                    <input type="checkbox" id="wfToggle_${wf.id}" style="opacity: 0; width: 0; height: 0;" onchange="window.handleToggleEmailWorkflow('${wf.id}', this.checked)">
                    <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--border-color); border-radius: 34px; transition: .3s; display: block;" class="slider-toggle-switch"></span>
                  </label>

                  <button class="btn-premium" style="padding: 6px 14px; font-size: 0.78rem;" onclick="window.triggerEditEmailHtmlModal('${wf.id}')">
                    <i class="fa-regular fa-pen-to-square"></i> Edit Email HTML
                  </button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;

    (async function loadWorkflowState() {
      try {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch('/api/admin/email-workflows', {
          headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        const workflows = (data.ok && data.workflows) || {};
        workflowMeta.forEach(wf => {
          const w = workflows[wf.id];
          const nameEl = document.getElementById(`wfName_${wf.id}`);
          const toggleEl = document.getElementById(`wfToggle_${wf.id}`);
          if (nameEl) nameEl.textContent = (w && w.name) || wf.id;
          if (toggleEl) toggleEl.checked = !w || w.enabled !== false;
        });
      } catch (e) {
        showToast('Could not load automated email workflow state.', 'danger');
      }
    })();
  }

  window.handleToggleEmailWorkflow = async function(workflowId, enabled) {
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch(`/api/admin/email-workflows/${workflowId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ enabled })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Workflow ${enabled ? 'enabled' : 'disabled'}.`, 'success');
      } else {
        showToast(data.message || data.error || 'Could not update workflow', 'danger');
        renderActiveView();
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
      renderActiveView();
    }
  };

  window.triggerEditEmailHtmlModal = async function(workflowId) {
    let existingHtml = '';
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/email-workflows', {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      existingHtml = (data.ok && data.workflows[workflowId] && data.workflows[workflowId].customHtml) || '';
    } catch (e) { /* fall through with empty editor */ }

    const bodyHTML = `
      <form id="formEditEmailHtml" style="display: flex; flex-direction: column; gap: 12px;">
        <p style="font-size: 0.78rem; color: var(--text-sub);">Leave blank to use the built-in default template for this email. If filled in, this raw HTML replaces the entire email body when this workflow sends.</p>
        <div class="modal-form-group">
          <label>Custom Email HTML (optional)</label>
          <textarea id="ewh_html" class="premium-input" style="height: 260px; resize: vertical; font-family: monospace; font-size: 0.78rem;" placeholder="&lt;p&gt;Your custom email HTML…&lt;/p&gt;">${escHtml(existingHtml)}</textarea>
        </div>
      </form>
    `;
    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
      ${existingHtml ? `<button class="btn-premium" onclick="window.submitEditEmailHtml('${workflowId}', true)">Reset to Default</button>` : ''}
      <button class="btn-premium btn-premium-rose" onclick="window.submitEditEmailHtml('${workflowId}', false)">Save</button>
    `;
    openModal("Edit Email HTML", bodyHTML, footerHTML);
  };

  window.submitEditEmailHtml = async function(workflowId, reset) {
    const html = reset ? '' : (document.getElementById('ewh_html')?.value || '');
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch(`/api/admin/email-workflows/${workflowId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ customHtml: html })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(reset ? 'Reset to default template.' : 'Custom email HTML saved.', 'success');
        closeModal();
      } else {
        showToast(data.message || data.error || 'Could not save email HTML', 'danger');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
    }
  };

  window.showSmtpConfig = async function() {
    let smtp = null;
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/smtp-config', {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      smtp = data.ok ? data.smtp : null;
    } catch (e) { /* handled below via smtp === null */ }

    const bodyHTML = smtp ? `
      <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.85rem;">
        <p style="font-size: 0.78rem; color: var(--text-sub);">Read-only — SMTP credentials live in the hosting environment variables and need a redeploy to change, not an in-app edit.</p>
        <div><strong>Status:</strong> ${smtp.configured ? '<span style="color:#10b981;">Configured</span>' : '<span style="color:#ea580c;">Not configured</span>'}</div>
        <div><strong>Host:</strong> ${escHtml(smtp.host || '—')}</div>
        <div><strong>Port:</strong> ${smtp.port || '—'}</div>
        <div><strong>Secure (TLS/SSL):</strong> ${smtp.secure ? 'Yes' : 'No'}</div>
        <div><strong>From Address:</strong> ${escHtml(smtp.from || '—')}</div>
        <div><strong>Auth User:</strong> ${escHtml(smtp.user || '—')}</div>
      </div>
    ` : `<p style="color: var(--text-sub);">Could not load SMTP configuration.</p>`;

    openModal("SMTP Server Setup", bodyHTML, `<button class="btn-premium" onclick="window.closeModal()">Close</button>`);
  };

  // Render CLAIMED LISTINGS
  function renderClaimedListings(store) {
    const fullList = store.vendors.filter(v => v.claims === "Claim Requested" || v.claims === "Verified Owner");
    const { pageItems: list, filteredCount, totalPages, currentPage } = paginateList(
      fullList,
      state.claimedSearch,
      state.claimedPage,
      c => (c.name || '').toLowerCase()
    );
    state.claimedPage = currentPage;

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Claim Verification Console</span>
        </div>

        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3>Vendor Ownership Claim Requests</h3>
              <p>Moderate registered vendors seeking control of existing seeded listings. Verify proof documentation.</p>
            </div>
            <input type="text" id="claimSearch" class="premium-input" placeholder="Filter business..." value="${escHtml(state.claimedSearch)}" />
          </div>

          <div class="table-viewport">
            <table class="grid-table">
              <thead>
                <tr>
                  <th>Vendor ID</th>
                  <th>Business Name</th>
                  <th>Category</th>
                  <th>Assigned Owner Contact</th>
                  <th>Claim Proof Status</th>
                  <th>Moderation State</th>
                  <th style="text-align: right;">Claims Actions</th>
                </tr>
              </thead>
              <tbody id="claimTableBody">
                ${list.length === 0 ? `
                  <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px 0;">
                      <i class="fa-solid fa-shield-check" style="font-size: 2rem; margin-bottom: 12px; display: block; color: #10b981;"></i>
                      ${filteredCount === 0 && state.claimedSearch ? 'No claims match your search.' : 'No pending vendor ownership claims currently awaiting review.'}
                    </td>
                  </tr>
                ` : list.map(c => {
                  const pending = c.claims === "Claim Requested";
                  return `
                    <tr data-claim-name="${escHtml(c.name.toLowerCase())}">
                      <td><strong>#${c.id}</strong></td>
                      <td><strong>${escHtml(c.name)}</strong></td>
                      <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(220, 31, 48, 0.15); color: var(--brand-rose);">${escHtml(c.category)}</span></td>
                      <td>
                        <div><i class="fa-solid fa-phone"></i> ${escHtml(c.contact)}</div>
                        <div style="font-size: 0.72rem; color: var(--text-muted);"><i class="fa-regular fa-envelope"></i> ${escHtml(c.email)}</div>
                      </td>
                      <td>
                        <span style="font-size: 0.72rem; font-weight: 700; color: ${pending ? '#ea580c' : '#10b981'};">
                          <i class="fa-solid ${pending ? 'fa-file-signature' : 'fa-certificate'}"></i> 
                          ${pending ? 'Proof Doc Uploaded' : 'Identity Verified'}
                        </span>
                      </td>
                      <td>
                        <span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: ${pending ? '#ea580c' : '#10b981'}; color: ${pending ? '#ea580c' : '#10b981'};">
                          ${c.claims}
                        </span>
                      </td>
                      <td>
                        <div class="row-actions-group" style="justify-content: flex-end;">
                          ${pending ? `
                            <button class="btn-premium" style="padding: 4px 10px; font-size: 0.72rem; border-color: #10b981; color: #10b981;" onclick="window.handleClaimListing('vendor', '${c.id}')">
                              <i class="fa-solid fa-circle-check"></i> Grant Ownership
                            </button>
                            <button class="row-action-icon-btn row-action-reject" title="Reject Claim" onclick="window.showToast('Rejecting claims is not yet available — this feature is still in development.', 'warning')">
                              <i class="fa-solid fa-xmark"></i>
                            </button>
                          ` : `
                            <span style="color: #10b981; font-size: 0.75rem; font-weight: 700;"><i class="fa-solid fa-shield-check"></i> Fully Approved</span>
                          `}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
          ${renderPaginationControls(currentPage, totalPages, "goToClaimedPage")}
        </div>
      </div>
    `;

    const search = document.getElementById("claimSearch");
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
      search.addEventListener("input", (e) => {
        state.claimedSearch = e.target.value;
        state.claimedPage = 1;
        clearTimeout(state._claimedSearchDebounce);
        state._claimedSearchDebounce = setTimeout(() => renderClaimedListings(window.WedEazzyStore.get()), 200);
      });
    }
  }

  window.goToClaimedPage = function(page) {
    state.claimedPage = page;
    renderClaimedListings(window.WedEazzyStore.get());
  };

  // Render VENDOR CRM DASHBOARD (Approve Businesses > Dashboard)
  function renderVendorCrmDashboard(store) {
    const vendors = store.vendors;
    const invitedCount = vendors.filter(v => v.invitedAt).length;
    // hasOwner (a real signup linked to the listing) is a more honest
    // "claimed" signal than the `claims` field, which defaults every
    // non-KYC-verified vendor to "Claim Requested" even if no one has
    // ever touched the listing.
    const claimedCount = vendors.filter(v => v.hasOwner).length;
    const invitedAndClaimed = vendors.filter(v => v.invitedAt && v.hasOwner).length;
    const conversionRate = invitedCount > 0 ? ((invitedAndClaimed / invitedCount) * 100).toFixed(1) : '0.0';
    const blacklistedCount = vendors.filter(v => v.status === 'cancelled').length;
    const uninvitedCount = vendors.filter(v => !v.hasOwner && !v.invitedAt).length;

    const statCard = (label, value, color) => `
      <div class="panel-card">
        <h3 style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.03em;">${label}</h3>
        <p style="font-size:2rem;font-weight:800;margin-top:8px;${color ? `color:${color};` : ''}">${value}</p>
      </div>
    `;

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>Dashboard</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-top: 15px;">
          ${statCard('Total Listings', vendors.length.toLocaleString('en-IN'))}
          ${statCard('Invitations Sent', invitedCount.toLocaleString('en-IN'), '#3b82f6')}
          ${statCard('Claimed (Registered Owner)', claimedCount.toLocaleString('en-IN'), '#10b981')}
          ${statCard('Conversion Rate (Sent → Claimed)', conversionRate + '%', '#DC1F30')}
          ${statCard('Not Yet Invited', uninvitedCount.toLocaleString('en-IN'))}
          ${statCard('Blacklisted', blacklistedCount.toLocaleString('en-IN'), '#ef4444')}
        </div>
      </div>
    `;
  }

  // Render INVITATIONS (Approve Businesses > Invitations)
  function renderInvitations(store) {
    const fullList = store.vendors.filter(v => !v.hasOwner);
    const { pageItems, filteredCount, totalPages, currentPage } = paginateList(
      fullList,
      state.invitationsSearch,
      state.invitationsPage,
      v => (v.name || '').toLowerCase() + ' ' + (v.category || '').toLowerCase()
    );
    state.invitationsPage = currentPage;

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>Invitations</span>
        </div>

        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3>Unclaimed Listings <span class="interactive-pill-badge" style="font-size: 0.7rem; vertical-align: middle;">${fullList.length.toLocaleString('en-IN')} total</span></h3>
              <p>Seeded listings with no registered owner yet — invite them by email/WhatsApp to claim their business.</p>
            </div>
            <input type="text" id="invitationsSearch" class="premium-input" placeholder="Search name/category..." value="${escHtml(state.invitationsSearch)}" />
          </div>

          <div class="table-viewport">
            <table class="grid-table">
              <thead>
                <tr>
                  <th>Listing ID</th>
                  <th>Business Name</th>
                  <th>Category</th>
                  <th>Contact</th>
                  <th>Invitation Status</th>
                  <th style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody id="invitationsTableBody">
                ${pageItems.length === 0 ? `
                  <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px 0;">${filteredCount === 0 && state.invitationsSearch ? 'No listings match your search.' : 'No unclaimed listings.'}</td></tr>
                ` : pageItems.map(v => `
                  <tr>
                    <td><strong>#${v.id}</strong></td>
                    <td><strong>${escHtml(v.name)}</strong></td>
                    <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(59, 130, 246, 0.15); color: var(--brand-blue);">${escHtml(v.category)}</span></td>
                    <td><i class="fa-solid fa-phone"></i> ${escHtml(v.contact)}</td>
                    <td>
                      ${v.invitedAt
                        ? `<span style="color:#10b981;font-size:0.72rem;font-weight:700;"><i class="fa-solid fa-paper-plane"></i> Invited ${escHtml(v.invitedAt.slice(0, 10))} via ${escHtml(v.invitedChannel || '—')}</span>`
                        : `<span style="color:var(--text-muted);font-size:0.72rem;">Not yet invited</span>`
                      }
                    </td>
                    <td style="text-align: right;">
                      <button class="btn-premium" style="padding: 4px 10px; font-size: 0.72rem;" onclick="window.sendVendorInvite('${v.id}')">
                        <i class="fa-solid fa-paper-plane"></i> ${v.invitedAt ? 'Re-send' : 'Send Invite'}
                      </button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          ${renderPaginationControls(currentPage, totalPages, "goToInvitationsPage")}
        </div>
      </div>
    `;

    const search = document.getElementById("invitationsSearch");
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
      search.addEventListener("input", (e) => {
        state.invitationsSearch = e.target.value;
        state.invitationsPage = 1;
        clearTimeout(state._invitationsSearchDebounce);
        state._invitationsSearchDebounce = setTimeout(() => renderInvitations(window.WedEazzyStore.get()), 200);
      });
    }
  }

  window.goToInvitationsPage = function(page) {
    state.invitationsPage = page;
    renderInvitations(window.WedEazzyStore.get());
  };

  window.sendVendorInvite = async function(id) {
    try {
      const data = await window.WedEazzyStore.inviteVendor(id);
      if (data && data.ok) {
        showToast('Claim invitation sent!', 'success');
        renderActiveView();
      } else {
        showToast(data?.error || data?.message || 'Failed to send invitation', 'danger');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
    }
  };

  // Render BLACKLISTED (Approve Businesses > Blacklisted)
  function renderBlacklisted(store) {
    const fullList = store.vendors.filter(v => v.status === 'cancelled');
    const { pageItems, filteredCount, totalPages, currentPage } = paginateList(
      fullList,
      state.blacklistedSearch,
      state.blacklistedPage,
      v => (v.name || '').toLowerCase() + ' ' + (v.category || '').toLowerCase()
    );
    state.blacklistedPage = currentPage;

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>Blacklisted</span>
        </div>

        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3>Blacklisted Businesses <span class="interactive-pill-badge" style="font-size: 0.7rem; vertical-align: middle;">${fullList.length.toLocaleString('en-IN')} total</span></h3>
              <p>Listings rejected or blacklisted by an administrator.</p>
            </div>
            <input type="text" id="blacklistedSearch" class="premium-input" placeholder="Search name/category..." value="${escHtml(state.blacklistedSearch)}" />
          </div>

          <div class="table-viewport">
            <table class="grid-table">
              <thead>
                <tr>
                  <th>Listing ID</th>
                  <th>Business Name</th>
                  <th>Category</th>
                  <th>Contact</th>
                  <th style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody id="blacklistedTableBody">
                ${pageItems.length === 0 ? `
                  <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px 0;">${filteredCount === 0 && state.blacklistedSearch ? 'No listings match your search.' : 'No blacklisted businesses.'}</td></tr>
                ` : pageItems.map(v => `
                  <tr>
                    <td><strong>#${v.id}</strong></td>
                    <td><strong>${escHtml(v.name)}</strong></td>
                    <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(59, 130, 246, 0.15); color: var(--brand-blue);">${escHtml(v.category)}</span></td>
                    <td><i class="fa-solid fa-phone"></i> ${escHtml(v.contact)}</td>
                    <td style="text-align: right;">
                      <button class="row-action-icon-btn row-action-approve" title="Restore Business" onclick="window.handleVendorStatus('${v.id}', 'approved')">
                        <i class="fa-solid fa-rotate-left"></i>
                      </button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          ${renderPaginationControls(currentPage, totalPages, "goToBlacklistedPage")}
        </div>
      </div>
    `;

    const search = document.getElementById("blacklistedSearch");
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
      search.addEventListener("input", (e) => {
        state.blacklistedSearch = e.target.value;
        state.blacklistedPage = 1;
        clearTimeout(state._blacklistedSearchDebounce);
        state._blacklistedSearchDebounce = setTimeout(() => renderBlacklisted(window.WedEazzyStore.get()), 200);
      });
    }
  }

  window.goToBlacklistedPage = function(page) {
    state.blacklistedPage = page;
    renderBlacklisted(window.WedEazzyStore.get());
  };

  // Render CITY Registry
  function renderCity(store) {
    function renderCityRows(cities) {
      if (!cities || cities.length === 0) {
        return `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No cities yet.</td></tr>`;
      }
      return cities.map((c, idx) => `
        <tr>
          <td><strong>#CT-${100 + idx}</strong></td>
          <td><strong>${c.name}</strong>${c.state ? ` <span style="color:var(--text-muted);font-size:0.75rem;">(${c.state})</span>` : ''}</td>
          <td><code>/${c.slug}</code></td>
          <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(59, 130, 246, 0.15); color: var(--brand-blue);">${c.count} Active Vendor(s)</span></td>
          <td style="text-align: right;">
            <button class="row-action-icon-btn row-action-reject" title="Revoke City" onclick="window.deleteCity('${c.slug}')"><i class="fa-solid fa-trash-can"></i></button>
          </td>
        </tr>
      `).join("");
    }

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>City Registry</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-top: 15px;">
          <!-- Add City Form -->
          <div class="panel-card" style="height: fit-content;">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 14px;">
              <h3 style="font-size: 1.1rem; font-weight: 800;">Register New City</h3>
            </div>
            <form id="formAddCity" style="display: flex; flex-direction: column; gap: 12px;">
              <div class="modal-form-group">
                <label>City Name (India)</label>
                <input type="text" id="newCityName" class="premium-input" placeholder="e.g. Pune" required />
              </div>
              <div class="modal-form-group">
                <label>State Code / Region</label>
                <input type="text" id="newCityState" class="premium-input" placeholder="e.g. MH" />
              </div>
              <button class="btn-premium btn-premium-rose" type="submit" style="justify-content: center; margin-top: 10px; width: 100%;">
                <i class="fa-solid fa-plus"></i> Add Operational City
              </button>
            </form>
          </div>

          <!-- Cities List Table -->
          <div class="panel-card" style="flex: 2;">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Active Marketplace Cities</h3>
                <p>System geography endpoints serving active vendor locations.</p>
              </div>
            </div>

            <div class="table-viewport">
              <table class="grid-table">
                <thead>
                  <tr>
                    <th>City ID</th>
                    <th>City Name</th>
                    <th>Slug Mapping</th>
                    <th>Active Listings</th>
                    <th style="text-align: right;">Action</th>
                  </tr>
                </thead>
                <tbody id="cityRows">
                  <tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Loading...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    window.loadCities = async function() {
      const tbody = document.getElementById('cityRows');
      try {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch('/api/admin/cities', {
          headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        if (tbody) tbody.innerHTML = data.ok ? renderCityRows(data.cities) : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Could not load cities.</td></tr>`;
      } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Could not load cities.</td></tr>`;
      }
    };
    window.loadCities();

    window.deleteCity = async function(slug) {
      if (!confirm(`Are you sure you want to permanently delete the city "${slug}"?`)) return;
      try {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch(`/api/admin/cities/${slug}`, {
          method: 'DELETE',
          headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        if (data.ok) {
          showToast('City deleted.', 'success');
          window.loadCities();
        } else {
          showToast(data.message || data.error || 'Could not delete city', 'danger');
        }
      } catch (e) {
        showToast('Error: ' + e.message, 'danger');
      }
    };

    const form = document.getElementById('formAddCity');
    if (form) {
      form.onsubmit = async function(event) {
        event.preventDefault();
        const nameInput = document.getElementById('newCityName');
        const stateInput = document.getElementById('newCityState');
        const name = nameInput ? nameInput.value.trim() : '';
        const state = stateInput ? stateInput.value.trim() : '';
        if (!name) return;

        try {
          const auth = window.WedEazzyAuth;
          const token = auth ? auth.getToken() : null;
          const res = await fetch('/api/admin/cities', {
            method: 'POST',
            headers: {
              'Authorization': token ? `Bearer ${token}` : '',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, state })
          });
          const data = await res.json();
          if (data.ok) {
            showToast('Registered new operational city!', 'success');
            if (nameInput) nameInput.value = '';
            if (stateInput) stateInput.value = '';
            window.loadCities();
          } else {
            showToast(data.message || data.error || 'Could not add city', 'danger');
          }
        } catch (e) {
          showToast('Error: ' + e.message, 'danger');
        }
      };
    }
  }

  // Render REGIONS (Suburbs) list
  function renderRegions(store) {
    function renderSuburbRows(suburbs) {
      if (!suburbs || suburbs.length === 0) {
        return `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">No suburbs yet.</td></tr>`;
      }
      return suburbs.map((s, idx) => `
        <tr>
          <td><strong>#RG-${String(idx + 1).padStart(2, '0')}</strong></td>
          <td><strong>${escHtml(s.name)}</strong></td>
          <td><i class="fa-solid fa-city" style="color: var(--text-muted); font-size: 0.8rem;"></i> ${escHtml(s.cityName)}</td>
          <td style="text-align: right;">
            <button class="row-action-icon-btn row-action-reject" title="Revoke Suburb" onclick="window.deleteSuburb('${s.slug}')"><i class="fa-solid fa-trash-can"></i></button>
          </td>
        </tr>
      `).join("");
    }

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Region Suburbs</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-top: 15px;">
          <!-- Add Suburb Form -->
          <div class="panel-card" style="height: fit-content;">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 14px;">
              <h3 style="font-size: 1.1rem; font-weight: 800;">Register Suburb Area</h3>
            </div>
            <form id="formAddSuburb" style="display: flex; flex-direction: column; gap: 12px;">
              <div class="modal-form-group">
                <label>Suburb Name</label>
                <input type="text" id="newSuburbName" class="premium-input" placeholder="e.g. Bandra Bandstand" required />
              </div>
              <div class="modal-form-group">
                <label>Operational Parent City</label>
                <select id="newSuburbCity" class="premium-select" required>
                  <option value="">Loading cities…</option>
                </select>
              </div>
              <button class="btn-premium btn-premium-rose" type="submit" style="justify-content: center; margin-top: 10px; width: 100%;">
                <i class="fa-solid fa-circle-plus"></i> Add Suburb Region
              </button>
            </form>
          </div>

          <!-- Regions Table -->
          <div class="panel-card" style="flex: 2;">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Sub-locality Localities & Suburbs</h3>
                <p>Regional mapping structures displaying localized vendor results.</p>
              </div>
            </div>

            <div class="table-viewport">
              <table class="grid-table">
                <thead>
                  <tr>
                    <th>Region ID</th>
                    <th>Suburb Locality</th>
                    <th>Operational Parent City</th>
                    <th style="text-align: right;">Action</th>
                  </tr>
                </thead>
                <tbody id="suburbRows">
                  <tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">Loading...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    window.loadSuburbs = async function() {
      const tbody = document.getElementById('suburbRows');
      try {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch('/api/admin/suburbs', {
          headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        if (tbody) tbody.innerHTML = data.ok ? renderSuburbRows(data.suburbs) : `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">Could not load suburbs.</td></tr>`;
      } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted);">Could not load suburbs.</td></tr>`;
      }
    };
    window.loadSuburbs();

    (async function loadCityOptions() {
      const select = document.getElementById('newSuburbCity');
      if (!select) return;
      try {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch('/api/admin/cities', {
          headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        const cities = (data.ok && data.cities) || [];
        select.innerHTML = cities.length
          ? cities.map(c => `<option value="${escHtml(c.slug)}">${escHtml(c.name)}</option>`).join('')
          : '<option value="">No cities registered yet</option>';
      } catch (e) {
        select.innerHTML = '<option value="">Could not load cities</option>';
      }
    })();

    window.deleteSuburb = async function(slug) {
      if (!confirm(`Are you sure you want to permanently delete this suburb?`)) return;
      try {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch(`/api/admin/suburbs/${slug}`, {
          method: 'DELETE',
          headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        if (data.ok) {
          showToast('Suburb deleted.', 'success');
          window.loadSuburbs();
        } else {
          showToast(data.message || data.error || 'Could not delete suburb', 'danger');
        }
      } catch (e) {
        showToast('Error: ' + e.message, 'danger');
      }
    };

    const form = document.getElementById('formAddSuburb');
    if (form) {
      form.onsubmit = async function(event) {
        event.preventDefault();
        const nameInput = document.getElementById('newSuburbName');
        const citySelect = document.getElementById('newSuburbCity');
        const name = nameInput ? nameInput.value.trim() : '';
        const parentCitySlug = citySelect ? citySelect.value : '';
        if (!name || !parentCitySlug) return;

        try {
          const auth = window.WedEazzyAuth;
          const token = auth ? auth.getToken() : null;
          const res = await fetch('/api/admin/suburbs', {
            method: 'POST',
            headers: {
              'Authorization': token ? `Bearer ${token}` : '',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, parentCitySlug })
          });
          const data = await res.json();
          if (data.ok) {
            showToast('Registered new suburb region!', 'success');
            if (nameInput) nameInput.value = '';
            window.loadSuburbs();
          } else {
            showToast(data.message || data.error || 'Could not add suburb', 'danger');
          }
        } catch (e) {
          showToast('Error: ' + e.message, 'danger');
        }
      };
    }
  }

  // Render VENUES CATEGORY
  function renderVenuesCategory(store) {
    const cats = [
      { name: "AC Banquet Halls", slug: "ac-banquet-halls", count: store.venues.length },
      { name: "Lush Wedding Lawns", slug: "lush-wedding-lawns", count: 2 },
      { name: "Beachfront Resorts", slug: "beachfront-resorts", count: 1 },
      { name: "Five-Star Luxury Hotels", slug: "five-star-hotels", count: 3 }
    ];

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Venues Category Registry</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-top: 15px;">
          <!-- Add Category -->
          <div class="panel-card" style="height: fit-content;">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 14px;">
              <h3 style="font-size: 1.1rem; font-weight: 800;">Register Venue Category</h3>
            </div>
            <div style="background: #FFF7ED; border: 1px solid #FED7AA; color: #9A3412; font-size: 0.75rem; padding: 10px 12px; border-radius: 8px; margin-bottom: 12px;">
              <i class="fa-solid fa-circle-info"></i> This section is not yet connected to the database — the list below is sample data only. Use the <strong>Vendors Category</strong> tab for real, saved categories.
            </div>
            <form onsubmit="event.preventDefault(); window.showToast('Venue categories are not yet available — this feature is still in development.', 'warning');" style="display: flex; flex-direction: column; gap: 12px;">
              <div class="modal-form-group">
                <label>Category Label</label>
                <input type="text" class="premium-input" placeholder="e.g. Floating Mandap Banquets" required />
              </div>
              <button class="btn-premium btn-premium-rose" type="submit" style="justify-content: center; margin-top: 10px; width: 100%;">
                <i class="fa-solid fa-plus"></i> Add Venue Category
              </button>
            </form>
          </div>

          <!-- Table -->
          <div class="panel-card" style="flex: 2;">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Operational Venue Categories <span class="interactive-pill-badge" style="font-size: 0.65rem; border-color: #FED7AA; color: #9A3412; vertical-align: middle;">Sample data</span></h3>
                <p>Wedding banquet halls and lawns segment types.</p>
              </div>
            </div>

            <div class="table-viewport">
              <table class="grid-table">
                <thead>
                  <tr>
                    <th>Category ID</th>
                    <th>Category Title</th>
                    <th>Slug Identifier</th>
                    <th>Active Listing Count</th>
                    <th style="text-align: right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${cats.map((c, idx) => `
                    <tr>
                      <td><strong>#VC-${200 + idx}</strong></td>
                      <td><strong>${c.name}</strong></td>
                      <td><code>/${c.slug}</code></td>
                      <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(220, 31, 48, 0.15); color: var(--brand-rose);">${c.count} Banquet Listings</span></td>
                      <td style="text-align: right;">
                        <button class="row-action-icon-btn row-action-reject" onclick="window.showToast('Venue categories are not yet available — this feature is still in development.', 'warning')"><i class="fa-solid fa-trash-can"></i></button>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Render VENDORS CATEGORY
  function renderVendorsCategory(store) {
    function renderCategoryRows(cats) {
      if (!cats || cats.length === 0) {
        return `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No categories yet.</td></tr>`;
      }
      return cats.map((c, idx) => `
        <tr>
          <td><strong>#SC-${300 + idx}</strong></td>
          <td><strong>${c.name}</strong></td>
          <td><code>/${c.slug}</code></td>
          <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(59, 130, 246, 0.15); color: var(--brand-blue);">${c.count} Professional Tenders</span></td>
          <td style="text-align: right;">
            <button class="row-action-icon-btn row-action-reject" onclick="window.deleteVendorCategory('${c.slug}')"><i class="fa-solid fa-trash-can"></i></button>
          </td>
        </tr>
      `).join("");
    }

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Vendors Category Registry</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-top: 15px;">
          <!-- Add Category -->
          <div class="panel-card" style="height: fit-content;">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 14px;">
              <h3 style="font-size: 1.1rem; font-weight: 800;">Register Service Category</h3>
            </div>
            <form id="formAddVendorCategory" style="display: flex; flex-direction: column; gap: 12px;">
              <div class="modal-form-group">
                <label>Category Label</label>
                <input type="text" id="newVendorCategoryName" class="premium-input" placeholder="e.g. Wedding Choreographers" required />
              </div>
              <button class="btn-premium btn-premium-rose" type="submit" style="justify-content: center; margin-top: 10px; width: 100%;">
                <i class="fa-solid fa-plus"></i> Add Service Category
              </button>
            </form>
          </div>

          <!-- Table -->
          <div class="panel-card" style="flex: 2;">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Operational Vendor Service Categories</h3>
                <p>Wedding service professional categories available in searches.</p>
              </div>
            </div>

            <div class="table-viewport">
              <table class="grid-table">
                <thead>
                  <tr>
                    <th>Category ID</th>
                    <th>Category Title</th>
                    <th>Slug Identifier</th>
                    <th>Active Listing Count</th>
                    <th style="text-align: right;">Action</th>
                  </tr>
                </thead>
                <tbody id="vendorCategoryRows">
                  <tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Loading...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    window.loadVendorCategories = async function() {
      const tbody = document.getElementById('vendorCategoryRows');
      try {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch('/api/admin/vendor-categories', {
          headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        if (tbody) tbody.innerHTML = data.ok ? renderCategoryRows(data.categories) : `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Could not load categories.</td></tr>`;
      } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">Could not load categories.</td></tr>`;
      }
    };
    window.loadVendorCategories();

    window.deleteVendorCategory = async function(slug) {
      if (!confirm(`Are you sure you want to permanently delete the vendor category "${slug}"?`)) return;
      try {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch(`/api/admin/vendor-categories/${slug}`, {
          method: 'DELETE',
          headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        if (data.ok) {
          showToast('Category deleted.', 'success');
          window.loadVendorCategories();
        } else {
          showToast(data.message || data.error || 'Could not delete category', 'danger');
        }
      } catch (e) {
        showToast('Error: ' + e.message, 'danger');
      }
    };

    const form = document.getElementById('formAddVendorCategory');
    if (form) {
      form.onsubmit = async function(event) {
        event.preventDefault();
        const input = document.getElementById('newVendorCategoryName');
        const name = input ? input.value.trim() : '';
        if (!name) return;

        try {
          const auth = window.WedEazzyAuth;
          const token = auth ? auth.getToken() : null;
          const res = await fetch('/api/admin/vendor-categories', {
            method: 'POST',
            headers: {
              'Authorization': token ? `Bearer ${token}` : '',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
          });
          const data = await res.json();
          if (data.ok) {
            showToast('Vendor category added successfully!', 'success');
            if (input) input.value = '';
            window.loadVendorCategories();
          } else {
            showToast(data.message || data.error || 'Could not add category', 'danger');
          }
        } catch (e) {
          showToast('Error: ' + e.message, 'danger');
        }
      };
    }
  }


  // -------------------------------------------------------------
  // EMAIL CAMPAIGN CENTER (SAAS EMAIL MARKETING CONTROL CENTER)
  // -------------------------------------------------------------

  // Global state for Email Campaign Center
  state.emailCenter = state.emailCenter || {
    audienceRules: {
      audienceType: 'all',
      categories: [],
      cities: [],
      tier: '',
      claimStatus: '',
      verificationStatus: '',
      status: '',
      hasPhone: false,
      hasPhotos: false
    },
    customEmails: '',
    previewDevice: 'desktop',
    sampleRole: 'vendor',
    activeTab: 'builder'
  };

  async function renderSendEmails(store) {
    // 1. Render Skeleton / Initial Frame
    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper" style="display: flex; flex-direction: column; gap: 24px; padding-bottom: 50px;">
        <!-- BREADCRUMB & HEADER -->
        <div>
          <div class="locator-breadcrumb">
            <a href="#">WedEazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Email Campaign Center</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-top: 6px;">
            <div>
              <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--text-main); margin: 0;">Email Campaign Center</h2>
              <p style="margin-top: 4px; color: var(--text-muted); font-size: 0.85rem;">Create, target, preview and monitor email campaigns across WedEazzy.</p>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <button class="btn-premium" onclick="window.loadEmailTemplatesModal()"><i class="fa-solid fa-folder-open"></i> Templates</button>
              <button class="btn-premium btn-premium-rose" onclick="window.scrollToCampaignBuilder()"><i class="fa-solid fa-plus"></i> Create Campaign</button>
            </div>
          </div>
        </div>

        <!-- TOP STATS CARDS -->
        <div id="emailCenterStatsCards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div class="panel-card loading-skeleton" style="height: 100px; border-radius: 12px;"></div>
          <div class="panel-card loading-skeleton" style="height: 100px; border-radius: 12px;"></div>
          <div class="panel-card loading-skeleton" style="height: 100px; border-radius: 12px;"></div>
          <div class="panel-card loading-skeleton" style="height: 100px; border-radius: 12px;"></div>
          <div class="panel-card loading-skeleton" style="height: 100px; border-radius: 12px;"></div>
        </div>

        <!-- MAIN TWO-COLUMN STUDIO LAYOUT -->
        <div style="display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 24px; align-items: start;" id="campaignStudioContainer">
          
          <!-- LEFT COLUMN: CAMPAIGN BUILDER -->
          <div style="display: flex; flex-direction: column; gap: 20px;">
            
            <!-- SECTION 1: CAMPAIGN DETAILS -->
            <div class="panel-card">
              <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 16px;">
                <h3 style="font-size: 1.1rem; font-weight: 800;"><i class="fa-regular fa-pen-to-square" style="color: var(--brand-rose); margin-right: 6px;"></i> 1. Campaign Details</h3>
                <p>Internal identifiers and email subject line.</p>
              </div>

              <div style="display: flex; flex-direction: column; gap: 14px;">
                <div class="modal-form-group" style="padding: 12px; background: rgba(220, 31, 48, 0.04); border: 1px solid rgba(220, 31, 48, 0.15); border-radius: 8px;">
                  <label style="font-weight: 700; font-size: 0.82rem; color: var(--brand-rose); display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-file-code"></i> Load Email Template (Optional)
                  </label>
                  <select id="ec_template_select" class="premium-select" onchange="window.handleEmailTemplateSelect(this.value);" style="margin-top: 4px;">
                    <option value="">-- None (Write Custom Email) --</option>
                  </select>
                  <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">Select a saved template to automatically populate Subject, Preheader, and Body. Content remains fully editable.</div>
                </div>

                <div class="modal-form-group">
                  <label style="font-weight: 700; font-size: 0.8rem;">Internal Campaign Name</label>
                  <input type="text" id="ec_name" class="premium-input" placeholder="e.g. Wedding Season Vendor Outreach — August" required />
                </div>

                <div class="modal-form-group">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-weight: 700; font-size: 0.8rem;">Email Subject Line</label>
                    <span id="ec_subject_count" style="font-size: 0.7rem; color: var(--text-muted);">0 / 150 chars</span>
                  </div>
                  <input type="text" id="ec_subject" class="premium-input" placeholder="e.g. Grow Your Wedding Business with WedEazzy" maxlength="150" required oninput="document.getElementById('ec_subject_count').textContent = this.value.length + ' / 150 chars'; window.updateEmailLivePreview();" />
                </div>

                <div class="modal-form-group">
                  <label style="font-weight: 700; font-size: 0.8rem;">Preview Text / Preheader (Optional)</label>
                  <input type="text" id="ec_preview_text" class="premium-input" placeholder="e.g. Reach more couples searching for wedding vendors in your city." oninput="window.updateEmailLivePreview();" />
                </div>

                <div style="padding: 12px; background: var(--canvas-bg); border: 1px solid var(--border-color); border-radius: 8px; font-size: 0.78rem; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span style="color: var(--text-muted); font-size: 0.72rem; text-transform: uppercase; font-weight: 700; display: block;">Configured SMTP Sender</span>
                    <strong>WedEazzy &lt;info@wedeazzy.com&gt;</strong>
                  </div>
                  <span class="interactive-pill-badge" style="font-size: 0.68rem; background: rgba(16,185,129,0.1); color: #10b981;">Hostinger SMTP Active</span>
                </div>
              </div>
            </div>

            <!-- SECTION 2: RECENT AUDIENCE BUILDER -->
            <div class="panel-card">
              <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 16px;">
                <h3 style="font-size: 1.1rem; font-weight: 800;"><i class="fa-solid fa-users-gear" style="color: var(--brand-rose); margin-right: 6px;"></i> 2. Recipient Audience Builder</h3>
                <p>Target specific segments, cities, categories, and tiers.</p>
              </div>

              <div style="display: flex; flex-direction: column; gap: 14px;">
                
                <div class="modal-form-group">
                  <label style="font-weight: 700; font-size: 0.8rem;">Target Audience Type</label>
                  <select id="ec_audience_type" class="premium-select" onchange="window.updateAudienceRulesFromUi();">
                    <option value="all">All Registered Accounts (Couples & Vendors)</option>
                    <option value="couples">Couples Planning Weddings Only</option>
                    <option value="vendors">All Registered Vendors Only</option>
                    <option value="claimed">Claimed Vendors Only (Linked Ownership)</option>
                    <option value="unclaimed">Unclaimed Vendors Only (Directory Listings)</option>
                    <option value="verified">Verified Vendors Only (Admin Verified)</option>
                    <option value="unverified">Unverified Vendors Only</option>
                    <option value="active">Active Accounts Only</option>
                  </select>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                  <div class="modal-form-group">
                    <label style="font-weight: 700; font-size: 0.8rem;">Target Country</label>
                    <select id="ec_country_code" class="premium-select" onchange="window.updateAudienceRulesFromUi();">
                      <option value="all">🌍 All Countries</option>
                      <option value="IN">🇮🇳 India</option>
                      <option value="AE">🇦🇪 UAE</option>
                      <option value="GB">🇬🇧 UK</option>
                      <option value="US">🇺🇸 USA</option>
                      <option value="CA">🇨🇦 Canada</option>
                      <option value="AU">🇦🇺 Australia</option>
                    </select>
                  </div>

                  <div class="modal-form-group">
                    <label style="font-weight: 700; font-size: 0.8rem;">Vendor Category</label>
                    <select id="ec_category_slug" class="premium-select" onchange="window.updateAudienceRulesFromUi();">
                      <option value="">All Categories</option>
                    </select>
                  </div>

                  <div class="modal-form-group">
                    <label style="font-weight: 700; font-size: 0.8rem;">Target City</label>
                    <select id="ec_city_slug" class="premium-select" onchange="window.updateAudienceRulesFromUi();">
                      <option value="">All Active Cities</option>
                    </select>
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div class="modal-form-group">
                    <label style="font-weight: 700; font-size: 0.8rem;">Vendor Tier</label>
                    <select id="ec_tier" class="premium-select" onchange="window.updateAudienceRulesFromUi();">
                      <option value="">All Tiers</option>
                      <option value="basic">Basic Tier</option>
                      <option value="featured">Featured Tier</option>
                    </select>
                  </div>

                  <div class="modal-form-group">
                    <label style="font-weight: 700; font-size: 0.8rem;">Profile Completeness</label>
                    <select id="ec_has_phone" class="premium-select" onchange="window.updateAudienceRulesFromUi();">
                      <option value="">Any Profile State</option>
                      <option value="true">Must Have Phone Number</option>
                    </select>
                  </div>
                </div>

                <!-- Manual & CSV Recipients -->
                <div class="modal-form-group" style="margin-top: 4px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <label style="font-weight: 700; font-size: 0.8rem;">Manual / Custom Email Addresses (Optional)</label>
                    <button class="btn-premium" style="font-size: 0.7rem; padding: 2px 8px;" onclick="window.triggerCsvRecipientImport()"><i class="fa-solid fa-file-csv"></i> Import CSV</button>
                  </div>
                  <textarea id="ec_custom_emails" class="premium-input" style="height: 60px; font-size: 0.78rem;" placeholder="Paste emails separated by commas or newlines (e.g. rahul@example.com, info@royalpalace.com)" oninput="window.updateAudienceRulesFromUi();"></textarea>
                </div>

                <!-- REAL-TIME AUDIENCE CALCULATOR BOX -->
                <div id="ec_audience_counter_box" style="padding: 16px; border-radius: 10px; background: rgba(220, 31, 48, 0.04); border: 1px solid rgba(220, 31, 48, 0.2); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                  <div>
                    <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 800; color: var(--brand-rose); letter-spacing: 0.04em;">Target Audience Match</div>
                    <div style="font-size: 1.4rem; font-weight: 800; color: var(--text-main); margin-top: 2px;" id="ec_counter_total">Calculating audience…</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;" id="ec_counter_details">Valid emails ready for broadcast</div>
                  </div>
                  <button class="btn-premium" style="font-size: 0.78rem; padding: 6px 14px;" onclick="window.openRecipientPreviewModal()"><i class="fa-solid fa-list-check"></i> View Recipients</button>
                </div>

              </div>
            </div>

            <!-- SECTION 3: EMAIL CONTENT EDITOR -->
            <div class="panel-card">
              <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
                <div class="panel-title-group">
                  <h3 style="font-size: 1.1rem; font-weight: 800;"><i class="fa-solid fa-code" style="color: var(--brand-rose); margin-right: 6px;"></i> 3. Email Content & Personalization</h3>
                  <p>Compose rich HTML email content with dynamic placeholders.</p>
                </div>
                <div style="display: flex; gap: 6px;">
                  <button class="btn-premium active" id="btnContentVisualTab" style="font-size: 0.72rem; padding: 4px 10px;" onclick="window.switchEditorTab('visual')">Visual Editor</button>
                  <button class="btn-premium" id="btnContentHtmlTab" style="font-size: 0.72rem; padding: 4px 10px;" onclick="window.switchEditorTab('html')">HTML Source</button>
                </div>
              </div>

              <!-- PERSONALIZATION TAGS TOOLBAR -->
              <div style="padding: 10px; background: var(--canvas-bg); border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 14px;">
                <div style="font-size: 0.72rem; font-weight: 700; color: var(--text-sub); margin-bottom: 6px;">
                  <i class="fa-solid fa-wand-magic-sparkles" style="color: var(--brand-gold);"></i> Click to Insert Personalization Tags:
                </div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                  <button class="btn-premium" style="font-size: 0.7rem; padding: 2px 8px;" onclick="window.insertPersonalizationTag('{{name}}')">{{name}}</button>
                  <button class="btn-premium" style="font-size: 0.7rem; padding: 2px 8px;" onclick="window.insertPersonalizationTag('{{businessName}}')">{{businessName}}</button>
                  <button class="btn-premium" style="font-size: 0.7rem; padding: 2px 8px;" onclick="window.insertPersonalizationTag('{{city}}')">{{city}}</button>
                  <button class="btn-premium" style="font-size: 0.7rem; padding: 2px 8px;" onclick="window.insertPersonalizationTag('{{category}}')">{{category}}</button>
                  <button class="btn-premium" style="font-size: 0.7rem; padding: 2px 8px;" onclick="window.insertPersonalizationTag('{{vendorLoginUrl}}')">{{vendorLoginUrl}}</button>
                  <button class="btn-premium" style="font-size: 0.7rem; padding: 2px 8px;" onclick="window.insertPersonalizationTag('{{claimUrl}}')">{{claimUrl}}</button>
                </div>
              </div>

              <!-- QUICK CONTENT BLOCK BUILDERS -->
              <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px;">
                <button class="btn-premium" style="font-size: 0.72rem; padding: 4px 8px;" onclick="window.appendBlock('heading')">+ Heading Block</button>
                <button class="btn-premium btn-premium-rose" style="font-size: 0.72rem; padding: 4px 8px;" onclick="window.triggerInsertImageModal()"><i class="fa-solid fa-image"></i> Upload & Insert Image</button>
                <button class="btn-premium" style="font-size: 0.72rem; padding: 4px 8px;" onclick="window.appendBlock('button')">+ Call-to-Action Button</button>
                <button class="btn-premium" style="font-size: 0.72rem; padding: 4px 8px;" onclick="window.appendBlock('divider')">+ Divider</button>
              </div>

              <!-- VISUAL WYSIWYG CONTAINER & HTML TEXTAREA -->
              <div class="modal-form-group">
                <!-- Visual Editor Box (contenteditable="true") -->
                <div id="ec_body_visual" contenteditable="true" style="min-height: 280px; max-height: 500px; overflow-y: auto; padding: 16px; background: #ffffff; color: #1e293b; border: 1.5px solid var(--border-color); border-radius: 10px; font-family: 'Inter', sans-serif; font-size: 0.9rem; line-height: 1.6; outline: none;" oninput="window.syncVisualToHtml();"></div>

                <!-- Raw HTML Textarea (hidden by default in visual mode) -->
                <textarea id="ec_body" class="premium-input" style="display: none; height: 280px; font-family: monospace; font-size: 0.82rem; line-height: 1.5; resize: vertical;" placeholder="Enter email body HTML or markdown..." required oninput="window.syncHtmlToVisual();"></textarea>
              </div>
            </div>

          </div>

          <!-- RIGHT COLUMN: LIVE EMAIL PREVIEW FRAME -->
          <div style="position: sticky; top: 80px; display: flex; flex-direction: column; gap: 16px;">
            
            <div class="panel-card" style="padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 10px; margin-bottom: 14px;">
                <div style="font-size: 0.85rem; font-weight: 800;">
                  <i class="fa-solid fa-mobile-screen" style="color: var(--brand-rose); margin-right: 6px;"></i> Live Email Preview
                </div>

                <div style="display: flex; gap: 6px;">
                  <button class="btn-premium active" id="btnPreviewDesktop" style="font-size: 0.7rem; padding: 3px 8px;" onclick="window.setPreviewDevice('desktop')"><i class="fa-solid fa-desktop"></i> Desktop</button>
                  <button class="btn-premium" id="btnPreviewMobile" style="font-size: 0.7rem; padding: 3px 8px;" onclick="window.setPreviewDevice('mobile')"><i class="fa-solid fa-mobile-button"></i> Mobile</button>
                </div>
              </div>

              <!-- PREVIEW CONTAINER -->
              <div id="emailPreviewWrapper" style="width: 100%; transition: max-width 0.3s ease; margin: 0 auto; border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; background: #ffffff; box-shadow: 0 8px 24px rgba(0,0,0,0.06);">
                
                <!-- Email Header Frame -->
                <div style="background: #0f111a; padding: 14px 20px; text-align: center; border-bottom: 2px solid var(--brand-rose);">
                  <img src="assets/logo.png" alt="WedEazzy" style="height: 32px; filter: brightness(0) invert(1);" />
                </div>

                <!-- Email Preheader Bar -->
                <div style="background: #f8fafc; padding: 8px 16px; border-bottom: 1px solid #e2e8f0; font-size: 0.7rem; color: #64748b;">
                  <strong>Subject:</strong> <span id="prevSubjectText">Grow Your Wedding Business with WedEazzy</span>
                  <div style="font-size: 0.65rem; color: #94a3b8; margin-top: 2px;" id="prevPreheaderText">Reach more couples searching for vendors</div>
                </div>

                <!-- Email Rendered Content Body -->
                <div id="emailRenderedContent" style="padding: 24px; min-height: 260px; font-family: 'Inter', sans-serif; color: #1e293b; font-size: 0.88rem; line-height: 1.6; word-break: break-word;">
                  <!-- Rendered via updateEmailLivePreview -->
                </div>

                <!-- Email Footer Frame -->
                <div style="background: #f1f5f9; padding: 16px 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 0.72rem; color: #64748b;">
                  <div>© 2026 WedEazzy Marketplace Inc. All rights reserved.</div>
                  <div style="margin-top: 4px; font-size: 0.68rem; color: #94a3b8;">You received this email as a registered WedEazzy user.</div>
                </div>

              </div>

              <!-- ACTION BUTTONS BAR -->
              <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px;">
                <button class="btn-premium btn-premium-rose" style="width: 100%; padding: 10px 16px; font-size: 0.9rem; font-weight: 800;" onclick="window.openSendConfirmationModal()"><i class="fa-solid fa-paper-plane"></i> Send Campaign Now</button>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                  <button class="btn-premium" style="font-size: 0.78rem; padding: 8px 10px;" onclick="window.triggerScheduleModal()"><i class="fa-solid fa-clock"></i> Schedule</button>
                  <button class="btn-premium" style="font-size: 0.78rem; padding: 8px 10px;" onclick="window.triggerSendTestEmailModal()"><i class="fa-solid fa-vial"></i> Send Test</button>
                  <button class="btn-premium" style="font-size: 0.78rem; padding: 8px 10px;" onclick="window.saveCampaignDraft()"><i class="fa-solid fa-floppy-disk"></i> Save Draft</button>
                </div>
              </div>

            </div>

          </div>

        </div>

        <!-- SECTION 4: CAMPAIGN HISTORY & DISPATCH LOGS -->
        <div class="panel-card" style="margin-top: 10px;">
          <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
            <div class="panel-title-group">
              <h3 style="font-size: 1.15rem; font-weight: 800;">Campaign History & Delivery Logs</h3>
              <p>Monitor status, delivery progress, and retry failed recipients.</p>
            </div>
            <button class="btn-premium" style="font-size: 0.78rem;" onclick="window.loadEmailCampaignHistory()"><i class="fa-solid fa-rotate-right"></i> Refresh Logs</button>
          </div>

          <div class="table-viewport">
            <table class="grid-table" id="tableEmailCampaignHistory">
              <thead>
                <tr>
                  <th>Campaign Name</th>
                  <th>Target Audience</th>
                  <th>Recipients</th>
                  <th>Delivered</th>
                  <th>Failed</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody id="tbodyEmailCampaignHistory">
                <tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">Loading campaign history…</td></tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;

    // 2. Load Categories & Cities into Form Dropdowns
    window.loadCampaignDropdowns();

    // 3. Load Initial Statistics Cards & History Table
    window.loadEmailCenterStats();
    window.loadEmailCampaignHistory();

    // 4. Set Default Sample Content
    const defaultBody = `<h2 style="color: #DC1F30; font-size: 1.3rem; margin-bottom: 12px;">Grow Your Wedding Business with WedEazzy</h2>
<p>Hi <strong>{{name}}</strong>,</p>
<p>WedEazzy is now experiencing record wedding inquiry volume across <strong>{{city}}</strong>!</p>
<p>Ensure your listing for <strong>{{businessName}}</strong> is fully updated with photo galleries, pricing packages, and direct contact numbers so couples can book your services instantly.</p>

<div style="text-align: center; margin: 24px 0;">
  <a href="{{claimUrl}}" style="background-color: #DC1F30; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 800; display: inline-block;">Update Business Profile →</a>
</div>

<p style="color: #64748b; font-size: 0.8rem;">Need help with your account? Reply directly to this email to speak with your WedEazzy account executive.</p>`;

    const nameInput = document.getElementById('ec_name');
    const subjectInput = document.getElementById('ec_subject');
    const previewInput = document.getElementById('ec_preview_text');
    const bodyInput = document.getElementById('ec_body');

    if (nameInput) nameInput.value = 'Wedding Season Vendor Outreach — August';
    if (subjectInput) subjectInput.value = 'Grow Your Wedding Business with WedEazzy';
    if (previewInput) previewInput.value = 'Reach more couples searching for vendors in your city.';
    if (bodyInput) bodyInput.value = defaultBody;
    const visualBox = document.getElementById('ec_body_visual');
    if (visualBox) visualBox.innerHTML = defaultBody;

    window.updateAudienceRulesFromUi();
    window.updateEmailLivePreview();
  }

  // GLOBAL HELPERS & EVENT HANDLERS FOR EMAIL CAMPAIGN CENTER

  window.loadCampaignDropdowns = async function() {
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;

      // Load Categories
      const catRes = await fetch('/api/admin/vendor-categories', { headers: { 'Authorization': token ? `Bearer ${token}` : '' } });
      const catData = await catRes.json();
      const catSelect = document.getElementById('ec_category_slug');
      if (catSelect && catData.ok && catData.categories) {
        catSelect.innerHTML = '<option value="">All Categories</option>' +
          catData.categories.map(c => `<option value="${c.slug}">${escHtml(c.name)} (${c.count})</option>`).join('');
      }

      // Load Cities
      const cityRes = await fetch('/api/admin/cities', { headers: { 'Authorization': token ? `Bearer ${token}` : '' } });
      const cityData = await cityRes.json();
      const citySelect = document.getElementById('ec_city_slug');
      if (citySelect && cityData.ok && cityData.cities) {
        citySelect.innerHTML = '<option value="">All Active Cities</option>' +
          cityData.cities.map(c => `<option value="${c.slug}">${escHtml(c.name)}</option>`).join('');
      }

      // Load Active Email Templates
      const tplRes = await fetch('/api/admin/email-templates?status=active', { headers: { 'Authorization': token ? `Bearer ${token}` : '' } });
      const tplData = await tplRes.json();
      const tplSelect = document.getElementById('ec_template_select');
      if (tplSelect && tplData.ok && tplData.templates) {
        window._activeEmailTemplatesMap = new Map(tplData.templates.map(t => [t.id, t]));
        tplSelect.innerHTML = '<option value="">-- None (Custom Email) --</option>' +
          tplData.templates.map(t => `<option value="${t.id}">[${escHtml(t.category || 'General')}] ${escHtml(t.name)}</option>`).join('');
      }
    } catch (e) {
      console.error('Failed to load campaign dropdown options:', e);
    }
  };

  window.handleEmailTemplateSelect = function(templateId) {
    if (!templateId) return;
    const tpl = window._activeEmailTemplatesMap ? window._activeEmailTemplatesMap.get(templateId) : null;
    if (!tpl) return;

    const subjectInput = document.getElementById('ec_subject');
    const previewInput = document.getElementById('ec_preview_text');
    const bodyInput = document.getElementById('ec_body');
    const visualBox = document.getElementById('ec_body_visual');

    if (subjectInput) subjectInput.value = tpl.subject || '';
    if (previewInput) previewInput.value = tpl.previewText || '';
    if (bodyInput) bodyInput.value = tpl.body || '';
    if (visualBox) visualBox.innerHTML = tpl.body || '';

    window.updateEmailLivePreview();
    showToast(`Loaded template "${tpl.name}". You can customize any field before sending.`, 'info');
  };

  window.loadEmailCenterStats = async function() {
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/email-campaigns/stats', {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      const container = document.getElementById('emailCenterStatsCards');
      if (container && data.ok && data.stats) {
        const s = data.stats;
        container.innerHTML = `
          <div class="panel-card" style="padding: 16px; border-left: 4px solid #0284c7;">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">Total Recipients</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: var(--text-main); margin-top: 4px;">${s.totalRecipients.toLocaleString('en-IN')}</div>
            <div style="font-size: 0.68rem; color: var(--text-sub); margin-top: 2px;">Marketing-eligible emails</div>
          </div>

          <div class="panel-card" style="padding: 16px; border-left: 4px solid #0d9488;">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">Campaigns Sent</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: var(--text-main); margin-top: 4px;">${s.totalCampaigns.toLocaleString('en-IN')}</div>
            <div style="font-size: 0.68rem; color: var(--text-sub); margin-top: 2px;">Total broadcasts created</div>
          </div>

          <div class="panel-card" style="padding: 16px; border-left: 4px solid #10b981;">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">Delivery Rate</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: #10b981; margin-top: 4px;">${s.deliveryRate}%</div>
            <div style="font-size: 0.68rem; color: var(--text-sub); margin-top: 2px;">Successful SMTP dispatch</div>
          </div>

          <div class="panel-card" style="padding: 16px; border-left: 4px solid #ef4444;">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">Failed Emails</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: #ef4444; margin-top: 4px;">${s.totalFailed.toLocaleString('en-IN')}</div>
            <div style="font-size: 0.68rem; color: var(--text-sub); margin-top: 2px;">Undelivered attempts (${s.failureRate}%)</div>
          </div>

          <div class="panel-card" style="padding: 16px; border-left: 4px solid #8b5cf6;">
            <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; color: var(--text-muted);">Sent This Month</div>
            <div style="font-size: 1.5rem; font-weight: 800; color: var(--text-main); margin-top: 4px;">${s.sentThisMonth.toLocaleString('en-IN')}</div>
            <div style="font-size: 0.68rem; color: var(--text-sub); margin-top: 2px;">Current billing cycle</div>
          </div>
        `;
      }
    } catch (e) {
      console.error('Failed to load email center stats:', e);
    }
  };

  window.updateAudienceRulesFromUi = function() {
    const type = document.getElementById('ec_audience_type')?.value || 'all';
    const cat = document.getElementById('ec_category_slug')?.value || '';
    const city = document.getElementById('ec_city_slug')?.value || '';
    const tier = document.getElementById('ec_tier')?.value || '';
    const hasPhone = document.getElementById('ec_has_phone')?.value === 'true';
    const customEmails = document.getElementById('ec_custom_emails')?.value || '';

    state.emailCenter.audienceRules = {
      audienceType: type,
      categories: cat ? [cat] : [],
      cities: city ? [city] : [],
      tier,
      hasPhone
    };
    state.emailCenter.customEmails = customEmails;

    window.refreshAudienceCountServer();
  };

  window.refreshAudienceCountServer = async function() {
    const totalEl = document.getElementById('ec_counter_total');
    const detailsEl = document.getElementById('ec_counter_details');
    if (!totalEl) return;

    totalEl.textContent = 'Calculating…';
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/email-campaigns/audience-count', {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audienceRules: state.emailCenter.audienceRules,
          customEmails: state.emailCenter.customEmails
        })
      });
      const data = await res.json();
      if (data.ok) {
        totalEl.textContent = `${data.totalRecipients.toLocaleString('en-IN')} recipients`;
        if (detailsEl) {
          detailsEl.textContent = `${data.validCount.toLocaleString('en-IN')} valid emails • ${data.missingEmailCount} accounts missing email`;
        }
      }
    } catch (e) {
      if (totalEl) totalEl.textContent = 'Unable to estimate';
    }
  };

  window.updateEmailLivePreview = function() {
    const subject = document.getElementById('ec_subject')?.value || 'Grow Your Wedding Business with WedEazzy';
    const preheader = document.getElementById('ec_preview_text')?.value || 'Reach more couples searching for vendors in your city.';
    const rawBody = document.getElementById('ec_body')?.value || '';

    const prevSub = document.getElementById('prevSubjectText');
    const prevPre = document.getElementById('prevPreheaderText');
    const prevBody = document.getElementById('emailRenderedContent');

    if (prevSub) prevSub.textContent = subject;
    if (prevPre) prevPre.textContent = preheader;

    if (prevBody) {
      // Replace personalization tags for live preview sample
      const sampleRecipient = {
        name: 'Rahul Sharma',
        businessName: 'Royal Palace Banquets',
        city: 'Mumbai',
        category: 'Venue & Banquet'
      };

      let rendered = rawBody
        .replace(/\{\{\s*name\s*\}\}/gi, sampleRecipient.name)
        .replace(/\{\{\s*businessName\s*\}\}/gi, sampleRecipient.businessName)
        .replace(/\{\{\s*city\s*\}\}/gi, sampleRecipient.city)
        .replace(/\{\{\s*category\s*\}\}/gi, sampleRecipient.category)
        .replace(/\{\{\s*vendorLoginUrl\s*\}\}/gi, '#')
        .replace(/\{\{\s*claimUrl\s*\}\}/gi, '#');

      prevBody.innerHTML = rendered || '<p style="color: #94a3b8;">Start typing email content on the left to see live preview...</p>';
    }
  };

  window.setPreviewDevice = function(mode) {
    const wrapper = document.getElementById('emailPreviewWrapper');
    const btnDesktop = document.getElementById('btnPreviewDesktop');
    const btnMobile = document.getElementById('btnPreviewMobile');

    if (mode === 'mobile') {
      if (wrapper) wrapper.style.maxWidth = '360px';
      if (btnMobile) btnMobile.classList.add('active');
      if (btnDesktop) btnDesktop.classList.remove('active');
    } else {
      if (wrapper) wrapper.style.maxWidth = '100%';
      if (btnDesktop) btnDesktop.classList.add('active');
      if (btnMobile) btnMobile.classList.remove('active');
    }
  };

  window.switchEditorTab = function(mode) {
    state.emailCenter.activeTab = mode;
    const visualBox = document.getElementById('ec_body_visual');
    const htmlArea = document.getElementById('ec_body');
    const btnVisual = document.getElementById('btnContentVisualTab');
    const btnHtml = document.getElementById('btnContentHtmlTab');

    if (mode === 'visual') {
      if (btnVisual) btnVisual.classList.add('active');
      if (btnHtml) btnHtml.classList.remove('active');
      if (visualBox && htmlArea) {
        visualBox.innerHTML = htmlArea.value;
        visualBox.style.display = 'block';
        htmlArea.style.display = 'none';
      }
    } else {
      if (btnHtml) btnHtml.classList.add('active');
      if (btnVisual) btnVisual.classList.remove('active');
      if (visualBox && htmlArea) {
        htmlArea.value = visualBox.innerHTML;
        htmlArea.style.display = 'block';
        visualBox.style.display = 'none';
      }
    }
    window.updateEmailLivePreview();
  };

  window.syncVisualToHtml = function() {
    const visualBox = document.getElementById('ec_body_visual');
    const htmlArea = document.getElementById('ec_body');
    if (visualBox && htmlArea) {
      htmlArea.value = visualBox.innerHTML;
    }
    window.updateEmailLivePreview();
  };

  window.syncHtmlToVisual = function() {
    const visualBox = document.getElementById('ec_body_visual');
    const htmlArea = document.getElementById('ec_body');
    if (visualBox && htmlArea) {
      visualBox.innerHTML = htmlArea.value;
    }
    window.updateEmailLivePreview();
  };

  window.insertPersonalizationTag = function(tag) {
    const visualBox = document.getElementById('ec_body_visual');
    const htmlArea = document.getElementById('ec_body');
    const isVisual = state.emailCenter.activeTab !== 'html';

    if (isVisual && visualBox) {
      visualBox.focus();
      document.execCommand('insertText', false, tag);
      window.syncVisualToHtml();
    } else if (htmlArea) {
      const start = htmlArea.selectionStart || 0;
      const end = htmlArea.selectionEnd || 0;
      const current = htmlArea.value;
      htmlArea.value = current.substring(0, start) + tag + current.substring(end);
      htmlArea.focus();
      htmlArea.selectionStart = htmlArea.selectionEnd = start + tag.length;
      window.syncHtmlToVisual();
    }
  };

  window.appendBlock = function(blockType) {
    const visualBox = document.getElementById('ec_body_visual');
    const htmlArea = document.getElementById('ec_body');
    const isVisual = state.emailCenter.activeTab !== 'html';

    let snippet = '';
    if (blockType === 'heading') {
      snippet = `<h2 style="color: #DC1F30; font-size: 1.25rem; font-weight: 800; margin-top: 20px;">Heading Title Here</h2>`;
    } else if (blockType === 'image') {
      return window.triggerInsertImageModal();
    } else if (blockType === 'button') {
      snippet = `<div style="text-align: center; margin: 20px 0;"><a href="https://wedeazzy.com" style="background-color: #DC1F30; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 800; display: inline-block;">Explore WedEazzy →</a></div>`;
    } else if (blockType === 'divider') {
      snippet = `<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />`;
    }

    if (isVisual && visualBox) {
      visualBox.focus();
      document.execCommand('insertHTML', false, snippet);
      window.syncVisualToHtml();
    } else if (htmlArea) {
      htmlArea.value += '\n' + snippet + '\n';
      window.syncHtmlToVisual();
    }
  };

  window.triggerInsertImageModal = function() {
    window._uploadedEmailImageUrl = null;

    const bodyHTML = `
      <form id="formInsertImage" style="display: flex; flex-direction: column; gap: 14px;">
        <div class="modal-form-group">
          <label style="font-weight: 700; font-size: 0.8rem;">Upload Image File</label>
          <input type="file" id="mimg_file" class="premium-input" accept="image/*" />
          <div id="mimg_status" style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">Choose an image file from your device to upload automatically.</div>
        </div>

        <div style="text-align: center; font-size: 0.75rem; color: var(--text-muted); font-weight: 700; margin: 2px 0;">— OR PASTE IMAGE URL —</div>

        <div class="modal-form-group">
          <label style="font-weight: 700; font-size: 0.8rem;">Image Direct URL</label>
          <input type="url" id="mimg_url" class="premium-input" placeholder="https://example.com/banner.jpg" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="modal-form-group">
            <label style="font-weight: 700; font-size: 0.8rem;">Alt Description</label>
            <input type="text" id="mimg_alt" class="premium-input" placeholder="e.g. Wedding Banner" value="Campaign Image" />
          </div>

          <div class="modal-form-group">
            <label style="font-weight: 700; font-size: 0.8rem;">Clickable Link URL (Optional)</label>
            <input type="url" id="mimg_link" class="premium-input" placeholder="https://wedeazzy.com" />
          </div>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Cancel</button>
      <button class="btn-premium btn-premium-rose" id="btnSubmitInsertImg" onclick="window.submitInsertImage()">Insert Image</button>
    `;

    openModal("Upload & Insert Image into Email", bodyHTML, footerHTML);

    const fileInput = document.getElementById('mimg_file');
    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        const status = document.getElementById('mimg_status');
        const urlInput = document.getElementById('mimg_url');

        if (!file) return;
        if (status) status.textContent = `Uploading ${file.name}…`;

        try {
          const formData = new FormData();
          formData.append('file', file);
          const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
          const res = await apiFetch('/api/upload/photo', { method: 'POST', body: formData });
          const data = await res.json();

          if (res.ok && data.ok) {
            window._uploadedEmailImageUrl = data.url;
            if (urlInput) urlInput.value = data.url;
            if (status) status.textContent = `✓ ${file.name} uploaded successfully!`;
          } else {
            if (status) status.textContent = `Upload failed: ${data.message || data.error || 'unknown error'}`;
          }
        } catch (e) {
          if (status) status.textContent = `Upload failed: ${e.message}`;
        }
      });
    }
  };

  window.submitInsertImage = function() {
    const url = document.getElementById('mimg_url')?.value || window._uploadedEmailImageUrl;
    const alt = document.getElementById('mimg_alt')?.value || 'Email Image';
    const link = document.getElementById('mimg_link')?.value;
    const visualBox = document.getElementById('ec_body_visual');
    const htmlArea = document.getElementById('ec_body');

    if (!url) {
      showToast('Please select an image file to upload or paste a direct image URL!', 'danger');
      return;
    }

    let imgHtml = `<img src="${url}" alt="${escHtml(alt)}" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />`;
    if (link) {
      imgHtml = `<a href="${escHtml(link)}" target="_blank">${imgHtml}</a>`;
    }

    const snippet = `<div style="text-align: center; margin: 20px 0;">${imgHtml}</div>`;
    const isVisual = state.emailCenter.activeTab !== 'html';

    if (isVisual && visualBox) {
      visualBox.focus();
      document.execCommand('insertHTML', false, snippet);
      window.syncVisualToHtml();
    } else if (htmlArea) {
      const start = htmlArea.selectionStart || htmlArea.value.length;
      const end = htmlArea.selectionEnd || htmlArea.value.length;
      const current = htmlArea.value;
      htmlArea.value = current.substring(0, start) + '\n' + snippet + '\n' + current.substring(end);
      window.syncHtmlToVisual();
    }

    closeModal();
    showToast('Image inserted into email content!', 'success');
  };

  window.openRecipientPreviewModal = async function() {
    const bodyHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="font-size: 0.8rem; color: var(--text-muted);">Paginated list of resolved database recipients for the current audience filters.</div>
        <div class="table-viewport" style="max-height: 340px; overflow-y: auto;">
          <table class="grid-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>City</th><th>Category</th></tr>
            </thead>
            <tbody id="tbodyRecipientModal">
              <tr><td colspan="5" style="text-align: center; padding: 20px;">Loading recipients…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
    `;

    openModal("Target Recipient List Preview", bodyHTML, footerHTML);

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/email-campaigns/audience-preview', {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          audienceRules: state.emailCenter.audienceRules,
          customEmails: state.emailCenter.customEmails,
          page: 1,
          limit: 50
        })
      });
      const data = await res.json();
      const tbody = document.getElementById('tbodyRecipientModal');
      if (tbody && data.ok && data.recipients) {
        tbody.innerHTML = data.recipients.length === 0
          ? '<tr><td colspan="5" style="text-align: center; padding: 20px;">No recipients found matching these filters.</td></tr>'
          : data.recipients.map(r => `
            <tr>
              <td><strong>${escHtml(r.name)}</strong></td>
              <td>${escHtml(r.email)}</td>
              <td><span class="interactive-pill-badge" style="font-size: 0.65rem;">${r.role}</span></td>
              <td>${escHtml(r.city || '—')}</td>
              <td>${escHtml(r.category || '—')}</td>
            </tr>
          `).join('');
      }
    } catch (e) {
      const tbody = document.getElementById('tbodyRecipientModal');
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--brand-rose);">Failed to load recipient list.</td></tr>';
    }
  };

  window.loadEmailCampaignHistory = async function() {
    const tbody = document.getElementById('tbodyEmailCampaignHistory');
    if (!tbody) return;

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/email-campaigns', {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      if (data.ok && data.campaigns) {
        if (data.campaigns.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">Your campaigns will appear here once you send your first campaign.</td></tr>';
          return;
        }

        tbody.innerHTML = data.campaigns.map(c => {
          const statusColors = {
            draft: { bg: 'rgba(107,114,128,0.1)', fg: '#6b7280', label: 'DRAFT' },
            scheduled: { bg: 'rgba(139,92,246,0.1)', fg: '#8b5cf6', label: 'SCHEDULED' },
            queued: { bg: 'rgba(59,130,246,0.1)', fg: '#3b82f6', label: 'QUEUED' },
            sending: { bg: 'rgba(234,179,8,0.1)', fg: '#d97706', label: 'SENDING…' },
            completed: { bg: 'rgba(16,185,129,0.1)', fg: '#10b981', label: 'COMPLETED' },
            partially_failed: { bg: 'rgba(245,158,11,0.1)', fg: '#f59e0b', label: 'PARTIAL FAIL' },
            failed: { bg: 'rgba(239,68,68,0.1)', fg: '#ef4444', label: 'FAILED' }
          };
          let dateStr = new Date(c.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
          if (c.status === 'scheduled') {
            const stType = (c.scheduleType || 'once').toLowerCase();
            if (stType === 'daily') {
              dateStr = `🔄 Daily at ${c.scheduleTime || '09:00'}`;
            } else if (stType === 'weekly') {
              let days = c.daysOfWeek || 'Weekly';
              if (typeof days === 'string' && days.startsWith('[')) {
                try { days = JSON.parse(days).join(', '); } catch (e) {}
              }
              dateStr = `🔄 Weekly (${days}) at ${c.scheduleTime || '09:00'}`;
            } else if (stType === 'monthly') {
              dateStr = `🔄 Monthly (${c.dayOfMonth || 1}st) at ${c.scheduleTime || '09:00'}`;
            } else if (c.nextRunAt || c.scheduledAt) {
              const runDate = new Date(c.nextRunAt || c.scheduledAt);
              dateStr = `Scheduled: ${runDate.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
            }
          }

          return `
            <tr>
              <td>
                <strong>${escHtml(c.name)}</strong>
                <div style="font-size: 0.7rem; color: var(--text-muted);">${escHtml(c.subject)}</div>
              </td>
              <td><span class="interactive-pill-badge" style="font-size: 0.65rem;">${c.segment}</span></td>
              <td><strong>${(c.totalRecipients || 0).toLocaleString('en-IN')}</strong></td>
              <td><span style="color: #10b981; font-weight: 700;">${(c.sentCount || 0).toLocaleString('en-IN')}</span></td>
              <td><span style="color: ${(c.failedCount || 0) > 0 ? '#ef4444' : 'var(--text-muted)'}; font-weight: 700;">${(c.failedCount || 0).toLocaleString('en-IN')}</span></td>
              <td>
                <span style="padding: 2px 8px; border-radius: 12px; font-size: 0.68rem; font-weight: 800; background: ${st.bg}; color: ${st.fg};">
                  ${st.label}
                </span>
              </td>
              <td><span style="font-size: 0.75rem; color: var(--text-muted);">${dateStr}</span></td>
              <td style="text-align: right;">
                <div style="display: flex; justify-content: flex-end; gap: 6px;">
                  <button class="btn-premium" style="font-size: 0.68rem; padding: 2px 6px;" onclick="window.duplicateCampaign('${c.id}')" title="Duplicate Campaign"><i class="fa-solid fa-copy"></i></button>
                  ${(c.failedCount > 0) ? `<button class="btn-premium" style="font-size: 0.68rem; padding: 2px 6px; color: #ef4444;" onclick="window.retryFailedCampaign('${c.id}')" title="Retry Failed"><i class="fa-solid fa-rotate-right"></i></button>` : ''}
                  <button class="btn-premium" style="font-size: 0.68rem; padding: 2px 6px;" onclick="window.deleteCampaignRecord('${c.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    } catch (e) {
      console.error('Failed to load email campaign history:', e);
    }
  };

  window.triggerSendTestEmailModal = function() {
    const bodyHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div class="modal-form-group">
          <label style="font-weight: 700; font-size: 0.8rem;">Send Test Email To:</label>
          <input type="email" id="mtest_email" class="premium-input" placeholder="admin@wedeazzy.com" value="wedeazzy@gmail.com" required />
        </div>
        <p style="font-size: 0.72rem; color: var(--text-muted);">Sends a single test email with sample personalization tags to verify formatting before broadcasting.</p>
      </div>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Cancel</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitSendTestEmail()">Send Test Now</button>
    `;

    openModal("Send Test Email", bodyHTML, footerHTML);
  };

  window.submitSendTestEmail = async function() {
    const testEmail = document.getElementById('mtest_email')?.value;
    const subject = document.getElementById('ec_subject')?.value;
    const previewText = document.getElementById('ec_preview_text')?.value;
    const body = document.getElementById('ec_body')?.value;

    if (!testEmail || !subject || !body) {
      showToast('Please enter a test email address, subject, and content body!', 'danger');
      return;
    }

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/email-campaigns/send-test', {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ testEmail, subject, previewText, body })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || `Test email sent to ${testEmail}!`, 'success');
        closeModal();
      } else {
        showToast('Test email failed: ' + (data.message || data.error), 'danger');
      }
    } catch (e) {
      showToast('Error sending test email: ' + e.message, 'danger');
    }
  };

  window.triggerScheduleModal = function() {
    const name = document.getElementById('ec_name')?.value;
    const subject = document.getElementById('ec_subject')?.value;

    if (!name || !subject) {
      showToast('Please enter campaign name and subject line before scheduling!', 'danger');
      return;
    }

    const defaultDate = new Date(Date.now() + 86400000);
    defaultDate.setHours(10, 0, 0, 0);
    const localIso = new Date(defaultDate.getTime() - (defaultDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);

    const bodyHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="padding: 12px 16px; background: rgba(139, 92, 246, 0.08); border-left: 4px solid #8b5cf6; border-radius: 8px;">
          <h4 style="font-size: 0.95rem; font-weight: 800; color: #8b5cf6; margin: 0;">Schedule Email Campaign</h4>
          <p style="font-size: 0.78rem; color: var(--text-sub); margin-top: 4px;">Choose single execution or automated recurring schedule (daily, weekly, monthly).</p>
        </div>

        <div class="modal-form-group">
          <label style="font-weight: 700; font-size: 0.8rem; display: block; margin-bottom: 6px;">Schedule Frequency</label>
          <select id="ec_schedule_type" class="premium-input" onchange="window.toggleScheduleTypeFields(this.value)">
            <option value="once">One-time Scheduled Date & Time</option>
            <option value="daily">Recurring Daily</option>
            <option value="weekly">Recurring Weekly (Select Days)</option>
            <option value="monthly">Recurring Monthly (Select Date)</option>
          </select>
        </div>

        <!-- ONCE fields -->
        <div id="schedule_field_once" class="modal-form-group">
          <label style="font-weight: 700; font-size: 0.8rem; display: block; margin-bottom: 4px;">Dispatch Date & Time</label>
          <input type="datetime-local" id="ec_schedule_time_once" class="premium-input" value="${localIso}" />
        </div>

        <!-- TIME OF DAY (for daily/weekly/monthly) -->
        <div id="schedule_field_time" class="modal-form-group" style="display: none;">
          <label style="font-weight: 700; font-size: 0.8rem; display: block; margin-bottom: 4px;">Time of Day</label>
          <input type="time" id="ec_schedule_time_daily" class="premium-input" value="09:00" />
        </div>

        <!-- WEEKLY DAYS -->
        <div id="schedule_field_weekly" class="modal-form-group" style="display: none;">
          <label style="font-weight: 700; font-size: 0.8rem; display: block; margin-bottom: 6px;">Days of the Week</label>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => `
              <label style="display: inline-flex; align-items: center; gap: 4px; background: var(--surface-subtle); padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.78rem; font-weight: 700; cursor: pointer;">
                <input type="checkbox" name="ec_weekly_days" value="${day}" ${['MON', 'WED', 'FRI'].includes(day) ? 'checked' : ''} /> ${day}
              </label>
            `).join('')}
          </div>
        </div>

        <!-- MONTHLY DAY OF MONTH -->
        <div id="schedule_field_monthly" class="modal-form-group" style="display: none;">
          <label style="font-weight: 700; font-size: 0.8rem; display: block; margin-bottom: 4px;">Day of Month</label>
          <select id="ec_schedule_dom" class="premium-input">
            ${Array.from({ length: 31 }, (_, i) => i + 1).map(d => `
              <option value="${d}" ${d === 1 ? 'selected' : ''}>${d}${d === 1 ? 'st' : (d === 2 ? 'nd' : (d === 3 ? 'rd' : 'th'))} of every month</option>
            `).join('')}
          </select>
        </div>
      </div>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Cancel</button>
      <button class="btn-premium btn-premium-rose" style="background: #8b5cf6;" onclick="window.submitScheduleCampaign()">Save & Activate Schedule</button>
    `;

    openModal("Schedule Email Campaign", bodyHTML, footerHTML);
  };

  window.toggleScheduleTypeFields = function(type) {
    const onceBox = document.getElementById('schedule_field_once');
    const timeBox = document.getElementById('schedule_field_time');
    const weeklyBox = document.getElementById('schedule_field_weekly');
    const monthlyBox = document.getElementById('schedule_field_monthly');

    if (onceBox) onceBox.style.display = type === 'once' ? 'block' : 'none';
    if (timeBox) timeBox.style.display = type !== 'once' ? 'block' : 'none';
    if (weeklyBox) weeklyBox.style.display = type === 'weekly' ? 'block' : 'none';
    if (monthlyBox) monthlyBox.style.display = type === 'monthly' ? 'block' : 'none';
  };

  window.submitScheduleCampaign = function() {
    const scheduleType = document.getElementById('ec_schedule_type')?.value || 'once';

    let scheduledAt = null;
    let scheduleTime = null;
    let daysOfWeek = [];
    let dayOfMonth = null;

    if (scheduleType === 'once') {
      const timeVal = document.getElementById('ec_schedule_time_once')?.value;
      if (!timeVal) {
        showToast('Please select a valid date and time to schedule!', 'danger');
        return;
      }
      const scheduledDate = new Date(timeVal);
      if (scheduledDate <= new Date()) {
        showToast('Schedule date and time must be in the future!', 'danger');
        return;
      }
      scheduledAt = timeVal;
    } else {
      scheduleTime = document.getElementById('ec_schedule_time_daily')?.value || '09:00';

      if (scheduleType === 'weekly') {
        const checked = document.querySelectorAll('input[name="ec_weekly_days"]:checked');
        daysOfWeek = Array.from(checked).map(c => c.value);
        if (daysOfWeek.length === 0) {
          showToast('Please select at least one day of the week for weekly schedule!', 'danger');
          return;
        }
      } else if (scheduleType === 'monthly') {
        dayOfMonth = parseInt(document.getElementById('ec_schedule_dom')?.value || '1', 10);
      }
    }

    window.executeCampaignBroadcast('schedule', {
      scheduledAt,
      scheduleType,
      scheduleTime,
      daysOfWeek,
      dayOfMonth
    });
  };

  window.openSendConfirmationModal = function() {
    const name = document.getElementById('ec_name')?.value;
    const subject = document.getElementById('ec_subject')?.value;
    const totalText = document.getElementById('ec_counter_total')?.textContent || 'Target audience';

    if (!name || !subject) {
      showToast('Please enter campaign name and subject line before dispatching!', 'danger');
      return;
    }

    const bodyHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="padding: 14px; background: rgba(220, 31, 48, 0.08); border-left: 4px solid var(--brand-rose); border-radius: 8px;">
          <h4 style="font-size: 0.95rem; font-weight: 800; color: var(--brand-rose); margin: 0;">Confirm Email Campaign Broadcast</h4>
          <p style="font-size: 0.78rem; color: var(--text-sub); margin-top: 4px;">You are about to launch a live broadcast. Sending will happen safely in background batches.</p>
        </div>

        <div style="font-size: 0.8rem; display: flex; flex-direction: column; gap: 6px;">
          <div><strong>Campaign:</strong> ${escHtml(name)}</div>
          <div><strong>Subject:</strong> ${escHtml(subject)}</div>
          <div><strong>Target Audience:</strong> ${escHtml(totalText)}</div>
          <div><strong>Sender:</strong> WedEazzy &lt;info@wedeazzy.com&gt;</div>
        </div>
      </div>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Cancel</button>
      <button class="btn-premium btn-premium-rose" id="btnConfirmDispatch" onclick="window.executeCampaignBroadcast('send')">Confirm & Send</button>
    `;

    openModal("Campaign Launch Confirmation", bodyHTML, footerHTML);
  };

  window.executeCampaignBroadcast = async function(actionType = 'send', scheduledAt = null) {
    const name = document.getElementById('ec_name')?.value;
    const subject = document.getElementById('ec_subject')?.value;
    const previewText = document.getElementById('ec_preview_text')?.value;
    const body = document.getElementById('ec_body')?.value;

    const btn = document.getElementById('btnConfirmDispatch');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

    let scheduledAtVal = null;
    let scheduleTypeVal = 'once';
    let scheduleTimeVal = null;
    let daysOfWeekVal = null;
    let dayOfMonthVal = null;

    if (typeof scheduledAt === 'object' && scheduledAt !== null) {
      scheduledAtVal = scheduledAt.scheduledAt;
      scheduleTypeVal = scheduledAt.scheduleType || 'once';
      scheduleTimeVal = scheduledAt.scheduleTime || null;
      daysOfWeekVal = scheduledAt.daysOfWeek || null;
      dayOfMonthVal = scheduledAt.dayOfMonth || null;
    } else if (typeof scheduledAt === 'string') {
      scheduledAtVal = scheduledAt;
    }

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/email-campaigns', {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          subject,
          previewText,
          body,
          audienceRules: state.emailCenter.audienceRules,
          customEmails: state.emailCenter.customEmails,
          action: actionType,
          scheduledAt: scheduledAtVal,
          scheduleType: scheduleTypeVal,
          scheduleTime: scheduleTimeVal,
          daysOfWeek: daysOfWeekVal,
          dayOfMonth: dayOfMonthVal
        })
      });
      const data = await res.json();
      if (data.ok) {
        let msg = `Draft campaign "${name}" saved!`;
        if (actionType === 'send') msg = `Campaign "${name}" queued for background dispatch!`;
        if (actionType === 'schedule') {
          msg = scheduleTypeVal !== 'once'
            ? `Recurring ${scheduleTypeVal} schedule created for "${name}"!`
            : `Campaign "${name}" scheduled successfully!`;
        }

        showToast(msg, 'success');
        closeModal();
        window.loadEmailCampaignHistory();
        window.loadEmailCenterStats();
      } else {
        showToast('Campaign request failed: ' + (data.message || data.error), 'danger');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
    }
  };

  window.saveCampaignDraft = function() {
    window.executeCampaignBroadcast('draft');
  };

  window.duplicateCampaign = async function(id) {
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch(`/api/admin/email-campaigns/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Campaign duplicated as draft!', 'success');
        window.loadEmailCampaignHistory();
      }
    } catch (e) {
      showToast('Failed to duplicate campaign', 'danger');
    }
  };

  window.retryFailedCampaign = async function(id) {
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch(`/api/admin/email-campaigns/${id}/retry-failed`, {
        method: 'POST',
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Retrying failed recipients in background!', 'success');
        window.loadEmailCampaignHistory();
      }
    } catch (e) {
      showToast('Failed to retry failed recipients', 'danger');
    }
  };

  window.deleteCampaignRecord = async function(id) {
    if (!confirm('Are you sure you want to delete this campaign history log?')) return;
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      await fetch(`/api/admin/email-campaigns/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      showToast('Campaign record deleted', 'success');
      window.loadEmailCampaignHistory();
      window.loadEmailCenterStats();
    } catch (e) {
      showToast('Failed to delete campaign', 'danger');
    }
  };

  window.scrollToCampaignBuilder = function() {
    const el = document.getElementById('ec_name');
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Render BLOGS dashboard
  function renderBlogs(store) {
    function fmtDate(d) {
      return d ? new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    }

    function renderBlogRows(blogs) {
      if (!blogs || blogs.length === 0) {
        return `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No articles yet.</td></tr>`;
      }
      return blogs.map(b => `
        <tr>
          <td><strong>#${b.id.slice(-6).toUpperCase()}</strong></td>
          <td><strong>${b.title}</strong></td>
          <td><i class="fa-regular fa-clock"></i> ${fmtDate(b.publishedAt)}</td>
          <td><strong>${b.views.toLocaleString()} Views</strong></td>
          <td><span style="color: var(--brand-rose);"><i class="fa-solid fa-heart"></i> ${b.likes}</span></td>
          <td>
            ${b.status === 'published'
              ? `<span class="status-pill status-confirmed"><span class="status-bullet-dot"></span> Live</span>`
              : `<span class="status-pill status-pending"><span class="status-bullet-dot"></span> Draft</span>`}
          </td>
          <td style="text-align: right;">
            <button class="row-action-icon-btn" onclick="window.triggerBlogEditor('${b.id}')"><i class="fa-solid fa-pen-to-square"></i></button>
          </td>
        </tr>
      `).join("");
    }

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Wedding Blogs Manager</span>
        </div>

        <div class="panel-card" style="margin-bottom: 20px; margin-top: 15px;">
          <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 14px;">
            <div class="panel-title-group">
              <h3>Blogging & SEO Articles Dashboard</h3>
              <p>Write high-ranking SEO-optimized wedding logs. Attract couple traffic organically.</p>
            </div>
            <button class="btn-premium btn-premium-rose" onclick="window.triggerBlogEditor()">
              <i class="fa-solid fa-feather-pointed"></i> Draft SEO Article
            </button>
          </div>

          <div class="table-viewport">
            <table class="grid-table">
              <thead>
                <tr>
                  <th>Blog ID</th>
                  <th>Article Title</th>
                  <th>Published Date</th>
                  <th>Organic Clicks</th>
                  <th>Interactions</th>
                  <th>Status</th>
                  <th style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody id="blogRows">
                <tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Loading...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    window.loadAdminBlogs = async function() {
      const tbody = document.getElementById('blogRows');
      try {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch('/api/admin/blogs', {
          headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        if (tbody) tbody.innerHTML = data.ok ? renderBlogRows(data.blogs) : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Could not load articles.</td></tr>`;
      } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">Could not load articles.</td></tr>`;
      }
    };
    window.loadAdminBlogs();

    // blogId is undefined for a fresh draft, or an existing blog's id to edit it.
    window.triggerBlogEditor = async function(blogId) {
      let existing = null;
      if (blogId) {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch('/api/admin/blogs', { headers: { 'Authorization': token ? `Bearer ${token}` : '' } });
        const data = await res.json();
        existing = data.ok ? data.blogs.find(b => b.id === blogId) : null;
      }

      const bodyHTML = `
        <form id="formBlogEditor" style="display: flex; flex-direction: column; gap: 12px;">
          <div class="modal-form-group">
            <label>SEO Article Title</label>
            <input type="text" id="blogTitle" class="premium-input" placeholder="e.g. Planning a destination wedding under budget..." value="${existing ? existing.title.replace(/"/g, '&quot;') : ''}" required />
          </div>
          <div class="modal-form-group">
            <label>SEO Meta Description Tag</label>
            <input type="text" id="blogMeta" class="premium-input" placeholder="Brief summary for Google search pages..." value="${existing ? existing.metaDescription.replace(/"/g, '&quot;') : ''}" required />
          </div>
          <div class="modal-form-group">
            <label>Blog Content Text</label>
            <textarea id="blogContent" class="premium-input" style="height: 120px; resize: none;" placeholder="Write article content here...">${existing ? existing.content : ''}</textarea>
          </div>
        </form>
      `;

      const saveBlog = async (publish) => {
        const title = document.getElementById('blogTitle')?.value.trim();
        const metaDescription = document.getElementById('blogMeta')?.value.trim();
        const content = document.getElementById('blogContent')?.value.trim();
        if (!title || !metaDescription || !content) {
          showToast('Please fill all fields first!', 'danger');
          return;
        }

        try {
          const auth = window.WedEazzyAuth;
          const token = auth ? auth.getToken() : null;
          const url = existing ? `/api/admin/blogs/${existing.id}` : '/api/admin/blogs';
          const method = existing ? 'PATCH' : 'POST';
          const payload = existing
            ? { title, metaDescription, content, status: publish ? 'published' : existing.status }
            : { title, metaDescription, content, publish };

          const res = await fetch(url, {
            method,
            headers: { 'Authorization': token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.ok) {
            showToast(publish ? 'Article published!' : 'Saved as draft.', 'success');
            window.closeModal();
            window.loadAdminBlogs();
          } else {
            showToast(data.message || data.error || 'Could not save article', 'danger');
          }
        } catch (e) {
          showToast('Error: ' + e.message, 'danger');
        }
      };
      window.__saveBlogDraft = () => saveBlog(false);
      window.__saveBlogPublish = () => saveBlog(true);

      const footerHTML = `
        <button class="btn-premium" onclick="window.closeModal()">Close</button>
        <button class="btn-premium" onclick="window.__saveBlogDraft()">Save as Draft</button>
        <button class="btn-premium btn-premium-rose" onclick="window.__saveBlogPublish()">${existing && existing.status === 'published' ? 'Save Changes' : 'Publish Article'}</button>
      `;
      openModal(existing ? "Edit SEO Blog Article" : "Draft SEO Blog Article", bodyHTML, footerHTML);
    };
  }

  // Render CONTACT INQUIRIES — real data from /api/inquiry/vendor (admin sees all)
  function renderContactInquiries(store) {
    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Contact Inquiries</span>
        </div>

        <div class="panel-card" style="margin-top: 15px;">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3>System Inquiries Inbox</h3>
              <p>Auditing direct support messages, wedding banquet requirements, and marketplace questions.</p>
            </div>
            <input type="text" id="inqSearch" class="premium-input" placeholder="Search sender..." />
          </div>

          <div id="inqContainer">
            <div style="text-align:center;padding:48px;color:var(--text-muted);">
              <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-bottom:16px;display:block;"></i>
              Loading inquiries...
            </div>
          </div>
        </div>
      </div>
    `;

    window.loadAdminInquiries();
  }

  function inquiryStatusPillClass(status) {
    if (status === 'contacted' || status === 'booked') return 'status-confirmed';
    if (status === 'closed' || status === 'lost') return 'status-cancelled';
    return 'status-pending'; // new, quoted
  }

  window.loadAdminInquiries = async function() {
    const container = document.getElementById('inqContainer');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-bottom:16px;display:block;"></i>Loading...</div>`;

    try {
      const auth = window.WedEazzyAuth;
      const res = auth
        ? await auth.apiFetch('/api/inquiry/vendor')
        : await fetch('/api/inquiry/vendor');
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || 'Failed to load inquiries');

      const list = data.inquiries || [];

      if (list.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:48px;color:var(--text-muted);">
            <i class="fa-solid fa-inbox" style="font-size:2rem;margin-bottom:16px;display:block;color:#10b981;"></i>
            No contact inquiries yet.
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="table-viewport">
          <table class="grid-table">
            <thead>
              <tr>
                <th>Inquiry ID</th>
                <th>Sender Info</th>
                <th>Vendor</th>
                <th>Direct Message Copy</th>
                <th>Log Date</th>
                <th>Response Status</th>
                <th style="text-align: right;">Moderate Action</th>
              </tr>
            </thead>
            <tbody id="inqTableBody">
              ${list.map(inq => `
                <tr data-inq-name="${escHtml((inq.name || '').toLowerCase())}">
                  <td><strong>#${inq.id.slice(-8).toUpperCase()}</strong></td>
                  <td>
                    <div style="font-weight: 700;">${escHtml(inq.name) || 'Anonymous'}</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted);"><i class="fa-solid fa-phone"></i> ${escHtml(inq.phone) || '—'}</div>
                  </td>
                  <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(59, 130, 246, 0.15); color: var(--brand-blue);">${inq.vendor ? escHtml(inq.vendor.businessName) : '—'}</span></td>
                  <td>
                    <div style="font-size: 0.75rem; color: var(--text-sub); max-width: 320px; white-space: normal; line-height: 1.4;">
                      "${escHtml(inq.notes || inq.budget || inq.guests || 'No additional notes provided.')}"
                    </div>
                  </td>
                  <td><i class="fa-regular fa-clock"></i> ${new Date(inq.createdAt).toLocaleDateString()}</td>
                  <td>
                    <span class="status-pill ${inquiryStatusPillClass(inq.status)}">
                      <span class="status-bullet-dot"></span> ${inq.status}
                    </span>
                  </td>
                  <td style="text-align: right;">
                    <div class="row-actions-group" style="justify-content: flex-end;">
                      <button class="row-action-icon-btn row-action-approve" title="Mark Contacted" onclick="window.updateInquiryStatus('${inq.id}', 'contacted')"><i class="fa-solid fa-phone-volume"></i></button>
                      <button class="row-action-icon-btn row-action-reject" title="Close Inquiry" onclick="window.updateInquiryStatus('${inq.id}', 'closed')"><i class="fa-solid fa-box-archive"></i></button>
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;

      const search = document.getElementById("inqSearch");
      if (search) {
        search.addEventListener("input", (e) => {
          const q = e.target.value.toLowerCase();
          document.querySelectorAll("#inqTableBody tr").forEach(row => {
            const name = row.getAttribute("data-inq-name");
            if (name) row.style.display = name.includes(q) ? "" : "none";
          });
        });
      }
    } catch (e) {
      container.innerHTML = `
        <div style="text-align:center;padding:48px;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;margin-bottom:16px;display:block;color:#DC1F30;"></i>
          <p style="font-weight:700;">Failed to load inquiries</p>
          <p style="color:var(--text-muted);">${e.message}</p>
          <button onclick="window.loadAdminInquiries()"
            style="margin-top:16px;background:#DC1F30;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">
            Retry
          </button>
        </div>
      `;
    }
  };

  window.updateInquiryStatus = async function(id, status) {
    try {
      const auth = window.WedEazzyAuth;
      const res = auth
        ? await auth.apiFetch(`/api/inquiry/${id}/status`, { method: 'PATCH', body: { status } })
        : await fetch(`/api/inquiry/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || 'Update failed');
      showToast(`Inquiry status updated to "${status}"`, 'success');
      window.loadAdminInquiries();
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
    }
  };

  // -------------------------------------------------------------
  // TAB RENDERING ENGINES
  // -------------------------------------------------------------

  async function renderDashboard(store) {
    // 1. Initial Skeleton Loader View
    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">WedEazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Platform Overview</span>
        </div>
        <div class="portal-welcome-banner" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div>
            <h2 style="font-size: 1.5rem; font-weight: 800;">Platform Overview</h2>
            <p style="margin-top: 4px; color: var(--text-muted);">Monitor real-time growth, couple engagement, and marketplace analytics.</p>
          </div>
        </div>
        <div class="metrics-deck" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 20px;">
          <div class="metric-tile loading-skeleton" style="height: 110px; border-radius: 12px;"></div>
          <div class="metric-tile loading-skeleton" style="height: 110px; border-radius: 12px;"></div>
          <div class="metric-tile loading-skeleton" style="height: 110px; border-radius: 12px;"></div>
          <div class="metric-tile loading-skeleton" style="height: 110px; border-radius: 12px;"></div>
        </div>
        <div class="panel-card loading-skeleton" style="height: 380px; margin-top: 20px; border-radius: 16px;"></div>
      </div>
    `;

    if (!state.biFilters) {
      state.biFilters = { range: '30d', countryCode: 'IN', activeGrowthMetric: 'inquiries' };
    }
    
    const savedScope = localStorage.getItem('wedeazzy_country_scope') || 'IN';
    window.WedEazzyCountryScope = savedScope;
    const activeCountryScope = (state.biFilters.countryCode || savedScope || 'IN').toString().toLowerCase();

    // 2. Fetch BI Analytics Overview Payload Server-Side
    let overviewData = null;
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const params = new URLSearchParams();
      params.set('range', state.biFilters.range || '30d');
      params.set('countryCode', activeCountryScope);

      const res = await fetch(`/api/admin/analytics?${params.toString()}`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      if (data.ok) {
        overviewData = data.overview || data;
      }
    } catch (err) {
      console.error('Failed to load BI analytics overview:', err);
    }

    if (!overviewData) {
      el.portalBody.innerHTML = `
        <div class="spa-tab-wrapper">
          <div class="panel-card" style="text-align: center; padding: 60px 20px; margin-top: 20px;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; color: var(--brand-rose); margin-bottom: 16px;"></i>
            <h3 style="font-size: 1.2rem; font-weight: 800;">Unable to load Platform Overview data</h3>
            <p style="color: var(--text-muted); margin-top: 6px; font-size: 0.85rem;">Please check server connection or retry fetching analytics.</p>
            <button class="btn-premium btn-premium-rose" style="margin-top: 20px; padding: 8px 24px;" onclick="renderDashboard(WedEazzyStore.get())">
              <i class="fa-solid fa-rotate-right"></i> Retry
            </button>
          </div>
        </div>
      `;
      return;
    }

    const rawVendors = store.vendors || [];
    const scopedVendors = activeCountryScope === 'all'
      ? rawVendors
      : rawVendors.filter(v => window.matchesCountryScope(v, activeCountryScope));

    const {
      kpis = {},
      trends = {
        months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        inquiries: [120, 340, 560, 890, 1120, 1450, 1890, 2300, 2800, 3100, 3420, 3890],
        bookings: [12, 28, 45, 62, 85, 110, 142, 178, 215, 260, 295, 340],
        revenue: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      },
      subscriptions: rawSubscriptions,
      revenue = { total: 0, subscriptionRevenue: 0, growRevenue: 0 },
      topCities = [],
      categoryPerformance = []
    } = overviewData || {};

    const totalListingsVal = (kpis.listings?.value) ?? store.vendorsTotalCount ?? scopedVendors.length;
    const totalClaimedVal = (kpis.claimedListings?.value) ?? scopedVendors.filter(v => v.hasOwner || v.claims === 'Verified Owner').length;
    const totalPaidVal = (kpis.paidVendors?.value) ?? scopedVendors.filter(v => v.subscriptionPlan && v.subscriptionPlan !== 'Free').length;

    const subscriptions = rawSubscriptions || { free: Math.max(0, totalListingsVal - totalPaidVal), premium: totalPaidVal, featured: 0 };

    const isGlobal = activeCountryScope === 'all';
    const scopeUpper = activeCountryScope.toUpperCase();
    const scopeNames = { 'ALL': 'Global Marketplace', 'IN': 'India', 'AE': 'UAE', 'GB': 'UK', 'US': 'USA', 'CA': 'Canada', 'AU': 'Australia' };
    const scopeFlags = { 'ALL': '🌍', 'IN': '🇮🇳', 'AE': '🇦🇪', 'GB': '🇬🇧', 'US': '🇺🇸', 'CA': '🇨🇦', 'AU': '🇦🇺' };
    const currencySymbols = { 'ALL': 'Multi', 'IN': '₹', 'AE': 'AED ', 'GB': '£', 'US': '$', 'CA': 'CA$', 'AU': 'A$' };
    const currencySym = currencySymbols[scopeUpper] || '₹';
    const activeGrowthMetric = state.biFilters.activeGrowthMetric || 'inquiries';

    // Compute Category Performance client-side if server array is empty
    let catList = categoryPerformance;
    if (!catList || catList.length === 0) {
      const catCounts = {};
      scopedVendors.forEach(v => {
        const cat = v.category || 'Uncategorized';
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      });
      catList = Object.entries(catCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([category, listingsCount]) => ({
          category,
          listingsCount,
          claimedCount: Math.round(listingsCount * 0.05),
          inquiriesCount: Math.round(listingsCount * 1.8)
        }));
    }

    // Compute Top Cities client-side if server array is empty
    let cityList = topCities;
    if (!cityList || cityList.length === 0) {
      const cityCounts = {};
      scopedVendors.forEach(v => {
        const city = v.city || 'Unspecified';
        cityCounts[city] = (cityCounts[city] || 0) + 1;
      });
      cityList = Object.entries(cityCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([city, count]) => ({
          city,
          listingsCount: count,
          inquiriesCount: Math.round(count * 2.2)
        }));
    }

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper" style="display: flex; flex-direction: column; gap: 24px; padding-bottom: 50px; background-color: var(--canvas-bg);">
        
        <!-- Header Banner -->
        <div class="panel-card" style="padding: 20px 24px; background: var(--surface-bg); border-bottom: 3px solid var(--brand-rose);">
          <div class="locator-breadcrumb">
            <a href="#">WedEazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Platform Overview / Management Console</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-top: 10px;">
            <div>
              <h2 style="font-size: 1.65rem; font-weight: 800; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 10px;">
                <span>WedEazzy ${scopeFlags[scopeUpper] || '🌐'} ${scopeNames[scopeUpper] || 'Marketplace'} Overview</span>
              </h2>
              <p style="margin-top: 4px; color: var(--text-sub); font-size: 0.84rem;">Real-time business intelligence, marketplace supply & demand, and platform growth metrics.</p>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 6px; background: #182033; padding: 6px 14px; border-radius: 10px; color: #FFFFFF;">
                <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--brand-rose); letter-spacing: 0.05em;">SCOPE:</span>
                <select id="biCountryFilter" class="premium-select" style="font-size: 0.85rem; font-weight: 800; background: transparent; color: #FFFFFF; border: none; padding: 4px 8px; cursor: pointer; outline: none;">
                  <option value="all" ${isGlobal ? 'selected' : ''}>🌍 All Countries</option>
                  <option value="IN" ${scopeUpper === 'IN' ? 'selected' : ''}>🇮🇳 India</option>
                  <option value="AE" ${scopeUpper === 'AE' ? 'selected' : ''}>🇦🇪 UAE</option>
                  <option value="GB" ${scopeUpper === 'GB' ? 'selected' : ''}>🇬🇧 UK</option>
                  <option value="US" ${scopeUpper === 'US' ? 'selected' : ''}>🇺🇸 USA</option>
                  <option value="CA" ${scopeUpper === 'CA' ? 'selected' : ''}>🇨🇦 Canada</option>
                  <option value="AU" ${scopeUpper === 'AU' ? 'selected' : ''}>🇦🇺 Australia</option>
                </select>
              </div>
              <button class="btn-premium" onclick="renderDashboard(WedEazzyStore.get())" style="padding: 8px 14px; font-size: 0.82rem;">
                <i class="fa-solid fa-rotate-right"></i> Refresh
              </button>
            </div>
          </div>
        </div>

        <!-- Executive KPI Metric Cards Deck -->
        <div>
          <div style="font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-main); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-chart-line" style="color: var(--brand-rose);"></i> Executive Marketplace KPIs — ${scopeNames[scopeUpper]}
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px;">
            
            <!-- Card 1: Total Listings -->
            <div class="panel-card" style="padding: 20px; background: var(--surface-bg); border-top: 4px solid var(--brand-rose);">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Total Listings</span>
                <i class="fa-solid fa-store" style="color: var(--brand-rose); font-size: 1.1rem;"></i>
              </div>
              <div style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin-top: 8px;">${totalListingsVal.toLocaleString('en-IN')}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">Active marketplace supply</div>
            </div>

            <!-- Card 2: Grow Business Revenue -->
            <div class="panel-card" style="padding: 20px; background: var(--surface-bg); border-top: 4px solid #10b981;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Grow Business Revenue</span>
                <i class="fa-solid fa-sack-dollar" style="color: #10b981; font-size: 1.1rem;"></i>
              </div>
              <div style="font-size: 1.8rem; font-weight: 800; color: #10b981; margin-top: 8px;">${currencySym}${(revenue.growRevenue || 0).toLocaleString('en-IN')}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">Campaign & ad plan sales</div>
            </div>

            <!-- Card 3: Grow Business Purchases -->
            <div class="panel-card" style="padding: 20px; background: var(--surface-bg); border-top: 4px solid #e11d48;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Grow Plan Purchases</span>
                <i class="fa-solid fa-rocket" style="color: #e11d48; font-size: 1.1rem;"></i>
              </div>
              <div style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin-top: 8px;">${(revenue.totalGrowPurchases || revenue.growPurchases || 0).toLocaleString('en-IN')}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">Vendors upgraded plan</div>
            </div>

            <!-- Card 4: Claimed Listings -->
            <div class="panel-card" style="padding: 20px; background: var(--surface-bg); border-top: 4px solid #3b82f6;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Claimed Listings</span>
                <i class="fa-solid fa-user-check" style="color: #3b82f6; font-size: 1.1rem;"></i>
              </div>
              <div style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin-top: 8px;">${totalClaimedVal.toLocaleString('en-IN')}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">Vendor owner claimed</div>
            </div>

            <!-- Card 5: Paid Vendors -->
            <div class="panel-card" style="padding: 20px; background: var(--surface-bg); border-top: 4px solid #f59e0b;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Paid Vendors</span>
                <i class="fa-solid fa-crown" style="color: #f59e0b; font-size: 1.1rem;"></i>
              </div>
              <div style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin-top: 8px;">${totalPaidVal.toLocaleString('en-IN')}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">Premium subscriptions</div>
            </div>

            <!-- Card 6: Total Enquiries -->
            <div class="panel-card" style="padding: 20px; background: var(--surface-bg); border-top: 4px solid #8b5cf6;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Total Enquiries</span>
                <i class="fa-solid fa-comments" style="color: #8b5cf6; font-size: 1.1rem;"></i>
              </div>
              <div style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin-top: 8px;">${(store.inquiries ? store.inquiries.length : 0).toLocaleString('en-IN')}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">Direct couple leads</div>
            </div>

          </div>
        </div>

        <!-- Growth Trends Line Chart -->
        <div class="panel-card" style="padding: 24px; background: var(--surface-bg);">
          <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 14px; margin-bottom: 18px; flex-wrap: wrap; gap: 12px;">
            <div class="panel-title-group">
              <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-main);">Marketplace Growth Trends — ${scopeNames[scopeUpper]}</h3>
              <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">Monthly lead generation and booking progression across the platform.</p>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn-premium ${activeGrowthMetric === 'inquiries' ? 'btn-premium-rose' : ''}" style="font-size: 0.75rem; padding: 5px 14px;" onclick="state.biFilters.activeGrowthMetric='inquiries'; renderDashboard(WedEazzyStore.get());">Enquiries</button>
              <button class="btn-premium ${activeGrowthMetric === 'bookings' ? 'btn-premium-rose' : ''}" style="font-size: 0.75rem; padding: 5px 14px;" onclick="state.biFilters.activeGrowthMetric='bookings'; renderDashboard(WedEazzyStore.get());">Bookings</button>
              <button class="btn-premium ${activeGrowthMetric === 'revenue' ? 'btn-premium-rose' : ''}" style="font-size: 0.75rem; padding: 5px 14px;" onclick="state.biFilters.activeGrowthMetric='revenue'; renderDashboard(WedEazzyStore.get());">Revenue</button>
            </div>
          </div>
          <div class="canvas-container" style="height: 320px; position: relative;">
            <canvas id="chartPlatformGrowth"></canvas>
          </div>
        </div>

        <!-- Dual Chart Row: Revenue & Subscriptions -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px;">
          <div class="panel-card" style="padding: 20px; background: var(--surface-bg);">
            <div style="margin-bottom: 14px;">
              <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 0;">Revenue Growth (${currencySym})</h3>
              <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 2px;">Monthly billing totals & Grow Business campaigns</div>
            </div>
            <div class="canvas-container" style="height: 240px; position: relative;">
              <canvas id="chartRevenue"></canvas>
            </div>
          </div>
          <div class="panel-card" style="padding: 20px; background: var(--surface-bg);">
            <div style="margin-bottom: 14px;">
              <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main); margin: 0;">Subscription Tier Distribution</h3>
              <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 2px;">Free vs. Premium vs. Featured vendor tiers</div>
            </div>
            <div class="canvas-container" style="height: 240px; position: relative;">
              <canvas id="chartListingClaims"></canvas>
            </div>
          </div>
        </div>

        <!-- Category & City Distribution Tables -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px;">
          
          <!-- Category Performance -->
          <div class="panel-card" style="padding: 20px; background: var(--surface-bg);">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 14px;">
              <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main);">Category Breakdown — ${scopeNames[scopeUpper]}</h3>
            </div>
            <div class="table-viewport">
              <table class="grid-table">
                <thead>
                  <tr>
                    <th>Category Vertical</th>
                    <th>Listings (Supply)</th>
                    <th>Claimed</th>
                    <th>Enquiries</th>
                  </tr>
                </thead>
                <tbody>
                  ${catList.map(cat => `
                    <tr>
                      <td><strong>${escHtml(cat.category)}</strong></td>
                      <td>${(cat.listingsCount || cat.listings || 0).toLocaleString('en-IN')}</td>
                      <td><span style="color: #10b981; font-weight: 700;">${(cat.claimedCount || 0).toLocaleString('en-IN')}</span></td>
                      <td><span style="color: #3b82f6; font-weight: 700;">${(cat.inquiriesCount || 0).toLocaleString('en-IN')}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Top Cities Performance -->
          <div class="panel-card" style="padding: 20px; background: var(--surface-bg);">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 14px;">
              <h3 style="font-size: 1.05rem; font-weight: 800; color: var(--text-main);">Top City Markets — ${scopeNames[scopeUpper]}</h3>
            </div>
            <div class="table-viewport">
              <table class="grid-table">
                <thead>
                  <tr>
                    <th>City / Hub</th>
                    <th>Listings</th>
                    <th>Estimated Enquiries</th>
                  </tr>
                </thead>
                <tbody>
                  ${cityList.map(city => `
                    <tr>
                      <td><strong>${escHtml(city.city)}</strong></td>
                      <td>${(city.listingsCount || city.count || 0).toLocaleString('en-IN')}</td>
                      <td><span style="color: var(--brand-rose); font-weight: 700;">${(city.inquiriesCount || 0).toLocaleString('en-IN')}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    `;

    // Bind event listener to scope selector
    const countrySelect = document.getElementById('biCountryFilter');
    if (countrySelect) {
      countrySelect.addEventListener('change', (e) => {
        state.biFilters.countryCode = e.target.value;
        window.WedEazzyCountryScope = e.target.value;
        localStorage.setItem('wedeazzy_country_scope', e.target.value);
        const globalSelect = document.getElementById('globalAdminCountrySelect');
        if (globalSelect && globalSelect.value !== e.target.value) globalSelect.value = e.target.value;
        renderDashboard(WedEazzyStore.get());
      });
    }

    // Render Chart.js Visualizations
    setTimeout(() => {
      if (window.WedEazzyCharts) {
        window.WedEazzyCharts.renderPlatformGrowthChart('chartPlatformGrowth', trends, activeGrowthMetric, scopeNames[scopeUpper] || 'India');

        const revenueCanvas = document.getElementById('chartRevenue');
        if (revenueCanvas) {
          window.WedEazzyCharts.initRevenueChart(revenueCanvas, trends, currencySym);
        }

        const claimsCanvas = document.getElementById('chartListingClaims');
        if (claimsCanvas) {
          window.WedEazzyCharts.initListingClaimsChart(claimsCanvas, subscriptions);
        }
      }
    }, 120);
  }

  // Render BOOKINGS (Tab 2)
  function renderBookings(store) {
    const currentScope = window.WedEazzyCountryScope || 'all';
    const rawList = store.bookings || [];
    const list = rawList.filter(b => window.matchesCountryScope(b, currentScope));

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Booking Manager</span>
        </div>

        ${window.renderAdminCountryScopeHeader('Booking Manager Country Scope', 'Filter active client scheduling and venue reservations per country')}

        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3>Client Bookings Registry <span class="interactive-pill-badge" style="font-size: 0.7rem; vertical-align: middle;">${(store.bookingsTotalCount ?? list.length).toLocaleString('en-IN')} total</span></h3>
              <p>Moderate active event scheduling, budgets, venues, and wedding dates.</p>
            </div>
            <div class="panel-controls">
              <input type="text" id="bookingSearchInput" class="premium-input" placeholder="Search client name..." style="width: 220px;" />
              <select id="bookingFilterStatus" class="premium-select">
                <option value="all">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button class="btn-premium btn-premium-rose" onclick="window.triggerAddBookingModal()">
                <i class="fa-solid fa-calendar-plus"></i> New Booking
              </button>
            </div>
          </div>

          <div class="table-viewport">
            <table class="grid-table" id="bookingsGridTable">
              <thead>
                <tr>
                  <th>Booking ID</th>
                  <th>Client</th>
                  <th>Event Type</th>
                  <th>Venue Target</th>
                  <th>Date</th>
                  <th>Budget</th>
                  <th>Status</th>
                  <th style="text-align: right;">Action Actions</th>
                </tr>
              </thead>
              <tbody id="bookingsTableBody">
                ${list.length === 0 ? `
                  <tr>
                    <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px 0;">No bookings yet.</td>
                  </tr>
                ` : list.map(b => `
                  <tr data-booking-row-id="${b.id}" data-client-name="${escHtml(b.clientName.toLowerCase())}" data-status="${b.status}">
                    <td><strong>#${b.id}</strong></td>
                    <td>
                      <div style="font-weight: 600;">${escHtml(b.clientName)}</div>
                      <div style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">${escHtml(b.notes) || 'No extra guidelines provided.'}</div>
                    </td>
                    <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(220, 31, 48, 0.15); color: var(--brand-rose);">${escHtml(b.eventType)}</span></td>
                    <td>${escHtml(b.venue)}</td>
                    <td><i class="fa-regular fa-calendar" style="color: var(--brand-rose);"></i> ${b.date}</td>
                    <td><strong>₹${Number(b.budget || 0).toLocaleString('en-IN')}</strong></td>
                    <td>
                      <span class="status-pill status-${b.status}">
                        <span class="status-bullet-dot"></span> ${b.status}
                      </span>
                    </td>
                    <td>
                      <div class="row-actions-group" style="justify-content: flex-end;">
                        ${b.status !== "confirmed" ? `
                          <button class="row-action-icon-btn row-action-approve" title="Confirm Booking" onclick="window.handleBookingStatus('${b.id}', 'confirmed')">
                            <i class="fa-solid fa-check"></i>
                          </button>
                        ` : ''}
                        ${b.status !== "cancelled" ? `
                          <button class="row-action-icon-btn row-action-reject" title="Cancel Booking" onclick="window.handleBookingStatus('${b.id}', 'cancelled')">
                            <i class="fa-solid fa-xmark"></i>
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Connect Search and Filters
    const search = document.getElementById("bookingSearchInput");
    const filter = document.getElementById("bookingFilterStatus");
    const rows = document.querySelectorAll("#bookingsTableBody tr");

    function runFilter() {
      const q = search.value.toLowerCase();
      const st = filter.value;

      rows.forEach(row => {
        const client = row.getAttribute("data-client-name");
        const status = row.getAttribute("data-status");

        const matchesSearch = client.includes(q);
        const matchesStatus = st === "all" || status === st;

        if (matchesSearch && matchesStatus) {
          row.style.display = "";
        } else {
          row.style.display = "none";
        }
      });
    }

    if (search) search.addEventListener("input", runFilter);
    if (filter) filter.addEventListener("change", runFilter);
  }

  // Booking Action Router
  window.handleBookingStatus = async function(id, status) {
    if (status === "cancelled" && !confirm(`Are you sure you want to cancel booking #${id}?`)) return;
    try {
      const data = await window.WedEazzyStore.updateBookingStatus(id, status);
      if (data && data.ok) {
        showToast(`Booking #${id} updated to ${status.toUpperCase()}!`, status === "confirmed" ? "success" : "warning");
        renderActiveView(); // Hot reload table
      } else {
        showToast(data?.message || data?.error || `Failed to update booking #${id}`, "error");
      }
    } catch (e) {
      console.error(e);
      showToast(`Error: ${e.message}`, "error");
    }
  };

  // Render VENUES (Tab 3)
  function renderVenues(store) {
    const currentScope = window.WedEazzyCountryScope || 'all';
    const rawVenues = store.venues || [];
    const venues = rawVenues.filter(v => window.matchesCountryScope(v, currentScope));
    const { pageItems, filteredCount, totalPages, currentPage } = paginateList(
      venues,
      state.venuesSearch,
      state.venuesPage,
      v => (v.name || '').toLowerCase()
    );
    state.venuesPage = currentPage;

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Venue Manager</span>
        </div>

        ${window.renderAdminCountryScopeHeader('Venue Manager Country Scope', 'Filter banquet halls & wedding lawns directory per country')}

        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3>Banquet Halls & Lawns Directory <span class="interactive-pill-badge" style="font-size: 0.7rem; vertical-align: middle;">${venues.length.toLocaleString('en-IN')} total</span></h3>
              <p>Approve claims, configure capacities, verify locations, and adjust daily costs.</p>
            </div>
            <div class="panel-controls">
              <input type="text" id="venueSearch" class="premium-input" placeholder="Search venue name..." value="${escHtml(state.venuesSearch)}" />
              <button class="btn-premium btn-premium-rose" onclick="window.triggerAddVenueModal()">
                <i class="fa-solid fa-circle-plus"></i> New Venue
              </button>
            </div>
          </div>

          <div class="table-viewport">
            <table class="grid-table">
              <thead>
                <tr>
                  <th>Venue ID</th>
                  <th>Venue Details</th>
                  <th>Location</th>
                  <th>Capacity limits</th>
                  <th>Rent Per Event</th>
                  <th>Claim Verification</th>
                  <th>Moderation status</th>
                  <th style="text-align: right;">Claims Actions</th>
                </tr>
              </thead>
              <tbody id="venuesTableBody">
                ${pageItems.length === 0 ? `
                  <tr>
                    <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px 0;">${filteredCount === 0 && state.venuesSearch ? 'No venues match your search.' : 'No venues yet.'}</td>
                  </tr>
                ` : pageItems.map(v => `
                  <tr data-venue-name="${escHtml(v.name.toLowerCase())}">
                    <td><strong>#${v.id}</strong></td>
                    <td>
                      <div style="font-weight: 600;">${escHtml(v.name)}</div>
                      <div style="font-size: 0.72rem; color: var(--text-muted);"><i class="fa-solid fa-star" style="color: var(--brand-gold);"></i> ${v.rating} Star score</div>
                    </td>
                    <td><i class="fa-solid fa-location-dot" style="color: var(--text-muted);"></i> ${escHtml(v.location)}</td>
                    <td><i class="fa-solid fa-users"></i> ${v.capacity != null ? v.capacity + ' pax max' : '—'}</td>
                    <td><strong>${v.price != null ? '₹' + Number(v.price).toLocaleString('en-IN') : '—'}</strong></td>
                    <td>
                      <span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: ${v.claims === 'Verified Owner' ? '#10b981' : v.claims === 'Claim Requested' ? '#ea580c' : 'var(--border-color)'}; color: ${v.claims === 'Verified Owner' ? '#10b981' : v.claims === 'Claim Requested' ? '#ea580c' : 'var(--text-sub)'};">
                        ${v.claims === 'Verified Owner' ? '<i class="fa-solid fa-shield-check"></i> ' : ''} ${v.claims}
                      </span>
                    </td>
                    <td>
                      <span class="status-pill status-${v.status}">
                        <span class="status-bullet-dot"></span> ${v.status}
                      </span>
                    </td>
                    <td>
                      <div class="row-actions-group" style="justify-content: flex-end;">
                        ${v.claims === 'Claim Requested' ? `
                          <button class="btn-premium" style="padding: 4px 8px; font-size: 0.7rem; border-color: #10b981; color: #10b981;" onclick="window.handleClaimListing('venue', '${v.id}')">
                            <i class="fa-solid fa-signature"></i> Grant Claim
                          </button>
                        ` : ''}
                        ${v.status !== "approved" ? `
                          <button class="row-action-icon-btn row-action-approve" title="Approve Venue" onclick="window.handleVenueStatus('${v.id}', 'approved')">
                            <i class="fa-solid fa-check"></i>
                          </button>
                        ` : ''}
                        ${v.status !== "cancelled" ? `
                          <button class="row-action-icon-btn row-action-reject" title="Reject/Archive" onclick="window.handleVenueStatus('${v.id}', 'cancelled')">
                            <i class="fa-solid fa-ban"></i>
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          ${renderPaginationControls(currentPage, totalPages, "goToVenuesPage")}
        </div>
      </div>
    `;

    const search = document.getElementById("venueSearch");
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
      search.addEventListener("input", (e) => {
        state.venuesSearch = e.target.value;
        state.venuesPage = 1;
        clearTimeout(state._venuesSearchDebounce);
        state._venuesSearchDebounce = setTimeout(() => renderVenues(window.WedEazzyStore.get()), 200);
      });
    }
  }

  window.goToVenuesPage = function(page) {
    state.venuesPage = page;
    renderVenues(window.WedEazzyStore.get());
  };

  window.handleVenueStatus = async function(id, status) {
    if (status === "cancelled" && !confirm(`Are you sure you want to reject/archive venue #${id}?`)) return;
    try {
      const data = await window.WedEazzyStore.updateVenueStatus(id, status);
      if (data && data.ok) {
        showToast(`Venue #${id} status set to ${status.toUpperCase()}!`, status === "approved" ? "success" : "warning");
        renderActiveView();
      } else {
        showToast(data?.message || data?.error || `Failed to update venue #${id}`, "error");
      }
    } catch (e) {
      console.error(e);
      showToast(`Error: ${e.message}`, "error");
    }
  };

  window.handleClaimListing = async function(type, id) {
    try {
      const data = await window.WedEazzyStore.claimListing(type, id);
      if (data && data.ok) {
        showToast(`${type.toUpperCase()} #${id} claims verification granted!`, "success");
        renderActiveView();
      } else {
        showToast(data?.message || data?.error || `Failed to grant claim for ${type} #${id}`, "error");
      }
    } catch (e) {
      console.error(e);
      showToast(`Error: ${e.message}`, "error");
    }
  };

  // Render VENDORS (Tab 4)
  function renderVendors(store) {
    const activeCountryScope = (window.WedEazzyCountryScope || 'all').toString().toLowerCase();
    const isGlobalScope = activeCountryScope === 'all';
    const allVendors = store.vendors || [];
    
    const scopedVendors = isGlobalScope
      ? allVendors
      : allVendors.filter(v => window.matchesCountryScope(v, activeCountryScope));

    // Calculate dynamic Stat Cards analytics
    const totalListingsCount = store.vendorsTotalCount ?? scopedVendors.length;

    // Top Category
    const categoryCounts = {};
    scopedVendors.forEach(v => {
      const cat = v.category || 'Uncategorized';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    let topCategory = 'None';
    let topCategoryCount = 0;
    Object.entries(categoryCounts).forEach(([cat, count]) => {
      if (count > topCategoryCount) {
        topCategoryCount = count;
        topCategory = cat;
      }
    });

    // Top City
    const cityCounts = {};
    scopedVendors.forEach(v => {
      const city = v.city || 'Unspecified';
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    });
    let topCity = 'None';
    let topCityCount = 0;
    Object.entries(cityCounts).forEach(([c, count]) => {
      if (count > topCityCount) {
        topCityCount = count;
        topCity = c;
      }
    });

    // Top Country (Only computed and shown when ALL is selected)
    let topCountry = 'None';
    let topCountryCount = 0;
    if (isGlobalScope) {
      const countryCounts = {};
      allVendors.forEach(v => {
        const country = v.country || (v.countryCode === 'IN' ? 'India' : v.countryCode || 'Other');
        countryCounts[country] = (countryCounts[country] || 0) + 1;
      });
      Object.entries(countryCounts).forEach(([c, count]) => {
        if (count > topCountryCount) {
          topCountryCount = count;
          topCountry = c;
        }
      });
    }

    const { pageItems, filteredCount, totalPages, currentPage } = paginateList(
      scopedVendors,
      state.vendorsSearch,
      state.vendorsPage,
      v => (v.name || '').toLowerCase() + ' ' + (v.category || '').toLowerCase() + ' ' + (v.vendorName || '').toLowerCase() + ' ' + (v.email || '').toLowerCase() + ' ' + (v.city || '').toLowerCase()
    );
    state.vendorsPage = currentPage;

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>All Businesses</span>
        </div>

        <div class="metrics-deck" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; margin-bottom: 20px; margin-top: 15px;">
          <!-- Card 1: Total Listings -->
          <div class="panel-card" style="padding: 18px 20px; background: var(--surface-bg); border-top: 4px solid var(--brand-rose);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub); letter-spacing: 0.05em;">Total Listings</span>
              <i class="fa-solid fa-store" style="color: var(--brand-rose); font-size: 1.1rem;"></i>
            </div>
            <div style="font-size: 1.65rem; font-weight: 800; color: var(--text-main); margin-top: 6px;">
              ${totalListingsCount.toLocaleString('en-IN')}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">Active marketplace business listings</div>
          </div>

          <!-- Card 2: Most Listings Category -->
          <div class="panel-card" style="padding: 18px 20px; background: var(--surface-bg); border-top: 4px solid #3b82f6;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub); letter-spacing: 0.05em;">Top Category</span>
              <i class="fa-solid fa-layer-group" style="color: #3b82f6; font-size: 1.1rem;"></i>
            </div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escHtml(topCategory)}">
              ${escHtml(topCategory)}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">
              <strong>${topCategoryCount.toLocaleString('en-IN')}</strong> listings in category
            </div>
          </div>

          <!-- Card 3: Most Listings City -->
          <div class="panel-card" style="padding: 18px 20px; background: var(--surface-bg); border-top: 4px solid #10b981;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub); letter-spacing: 0.05em;">Top City</span>
              <i class="fa-solid fa-city" style="color: #10b981; font-size: 1.1rem;"></i>
            </div>
            <div style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escHtml(topCity)}">
              ${escHtml(topCity)}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">
              <strong>${topCityCount.toLocaleString('en-IN')}</strong> listings in city
            </div>
          </div>

          <!-- Card 4: Most Listings Country (ONLY rendered when ALL is selected) -->
          ${isGlobalScope ? `
            <div class="panel-card" style="padding: 18px 20px; background: var(--surface-bg); border-top: 4px solid #f59e0b;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub); letter-spacing: 0.05em;">Top Country</span>
                <i class="fa-solid fa-globe" style="color: #f59e0b; font-size: 1.1rem;"></i>
              </div>
              <div style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escHtml(topCountry)}">
                ${escHtml(topCountry)}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">
                <strong>${topCountryCount.toLocaleString('en-IN')}</strong> listings in country
              </div>
            </div>
          ` : ''}
        </div>

        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3>All Businesses Registry <span class="interactive-pill-badge" style="font-size: 0.7rem; vertical-align: middle;">${totalListingsCount.toLocaleString('en-IN')} total</span></h3>
              <p>Oversee wedding photographers, banquet halls, catering services, decorators, sound systems, and make-up stars.</p>
            </div>
            <div class="panel-controls">
              <input type="text" id="vendorSearch" class="premium-input" placeholder="Search name/category..." value="${escHtml(state.vendorsSearch)}" />
              <button class="btn-premium btn-premium-rose" onclick="window.triggerAddVendorModal()">
                <i class="fa-solid fa-circle-plus"></i> New Vendor
              </button>
            </div>
          </div>

          <div class="table-viewport">
            <table class="grid-table">
              <thead>
                <tr>
                  <th>Listing ID</th>
                  <th>Vendor Name (Owner)</th>
                  <th>Business Name</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Contact Number</th>
                  <th>Email</th>
                  <th>Submission Date</th>
                  <th>Verification Status</th>
                  <th>Premium Status</th>
                  <th style="text-align: right;">Moderation Action</th>
                </tr>
              </thead>
              <tbody id="vendorsTableBody">
                ${pageItems.length === 0 ? `
                  <tr>
                    <td colspan="11" style="text-align: center; color: var(--text-muted); padding: 40px 0;">${filteredCount === 0 && state.vendorsSearch ? 'No vendors match your search.' : 'No vendors yet.'}</td>
                  </tr>
                ` : pageItems.map(v => `
                  <tr data-vendor-name="${escHtml((v.name || '').toLowerCase() + ' ' + (v.category || '').toLowerCase() + ' ' + (v.vendorName || '').toLowerCase() + ' ' + (v.email || '').toLowerCase())}">
                    <td><strong>#${v.id}</strong></td>
                    <td>${escHtml(v.vendorName) || '—'}</td>
                    <td>
                      <div style="font-weight: 600;">${escHtml(v.name)}</div>
                      <div style="font-size: 0.72rem; color: var(--text-muted);"><i class="fa-solid fa-star" style="color: var(--brand-gold);"></i> ${v.rating} average feedback</div>
                    </td>
                    <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(59, 130, 246, 0.15); color: var(--brand-blue);">${escHtml(v.category)}</span></td>
                    <td>${escHtml(v.address) || '—'}</td>
                    <td><i class="fa-solid fa-phone"></i> ${escHtml(v.contact)}</td>
                    <td><i class="fa-regular fa-envelope"></i> ${escHtml(v.email)}</td>
                    <td>${v.createdAt ? v.createdAt.slice(0, 10) : '—'}</td>
                    <td>
                      <span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: ${v.claims === 'Verified Owner' ? '#10b981' : v.claims === 'Claim Requested' ? '#ea580c' : 'var(--border-color)'}; color: ${v.claims === 'Verified Owner' ? '#10b981' : v.claims === 'Claim Requested' ? '#ea580c' : 'var(--text-sub)'};">
                        ${v.claims === 'Verified Owner' ? '<i class="fa-solid fa-check-double"></i> ' : ''} ${v.claims}
                      </span>
                    </td>
                    <td>
                      <span class="status-pill status-${v.subscriptionPlan === 'featured' ? 'approved' : 'pending'}">
                        ${v.subscriptionPlan === 'featured' ? 'Premium' : 'Standard'}
                      </span>
                    </td>
                    <td>
                      <div class="row-actions-group" style="justify-content: flex-end;">
                        ${v.claims === 'Claim Requested' ? `
                          <button class="btn-premium" style="padding: 4px 8px; font-size: 0.7rem; border-color: #10b981; color: #10b981;" onclick="window.handleClaimListing('vendor', '${v.id}')">
                            <i class="fa-solid fa-signature"></i> Grant Claim
                          </button>
                        ` : ''}
                        ${v.status !== "approved" ? `
                          <button class="row-action-icon-btn row-action-approve" title="Approve Business" onclick="window.handleVendorStatus('${v.id}', 'approved')">
                            <i class="fa-solid fa-check"></i>
                          </button>
                        ` : ''}
                        ${v.status !== "cancelled" ? `
                          <button class="row-action-icon-btn row-action-reject" title="Blacklist Business" onclick="window.handleVendorStatus('${v.id}', 'cancelled')">
                            <i class="fa-solid fa-ban"></i>
                          </button>
                        ` : ''}
                        <button class="row-action-icon-btn" title="${v.kycDocumentUrl ? 'View/Replace Proof Document' : 'Upload Proof Document'}" onclick="window.triggerVendorDocumentModal('${v.id}', ${v.kycDocumentUrl ? `'${v.kycDocumentUrl}'` : 'null'})" style="${v.kycDocumentUrl ? 'background: rgba(16,185,129,0.1); color: #10b981; border-color: rgba(16,185,129,0.2);' : ''}">
                          <i class="fa-solid ${v.kycDocumentUrl ? 'fa-file-circle-check' : 'fa-file-arrow-up'}"></i>
                        </button>
                        <button class="row-action-icon-btn" title="Send Login Credentials" onclick="window.triggerVendorCredentialsModal('${v.id}', '${escJsAttr(v.email && v.email !== '—' ? v.email : '')}', '${escJsAttr(v.name || '')}')" style="background: rgba(59,130,246,0.1); color: #3b82f6; border-color: rgba(59,130,246,0.2);">
                          <i class="fa-solid fa-key"></i>
                        </button>
                        <button class="row-action-icon-btn row-action-delete" title="Delete Listing" onclick="window.handleDeleteVendor('${v.id}')" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: rgba(239, 68, 68, 0.2);">
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          ${renderPaginationControls(currentPage, totalPages, "goToVendorsPage")}
        </div>
      </div>
    `;

    const search = document.getElementById("vendorSearch");
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
      search.addEventListener("input", (e) => {
        state.vendorsSearch = e.target.value;
        state.vendorsPage = 1;
        clearTimeout(state._vendorsSearchDebounce);
        state._vendorsSearchDebounce = setTimeout(() => renderVendors(window.WedEazzyStore.get()), 200);
      });
    }
  }

  window.goToVendorsPage = function(page) {
    state.vendorsPage = page;
    renderVendors(window.WedEazzyStore.get());
  };

  window.handleVendorStatus = async function(id, status) {
    if (status === "cancelled" && !confirm(`Are you sure you want to blacklist vendor #${id}?`)) return;
    try {
      const data = await window.WedEazzyStore.updateVendorStatus(id, status);
      if (data && data.ok) {
        showToast(`Vendor #${id} status set to ${status.toUpperCase()}!`, status === "approved" ? "success" : "warning");
        renderActiveView();
      } else {
        showToast(data?.message || data?.error || `Failed to update vendor #${id}`, "error");
      }
    } catch (e) {
      console.error(e);
      showToast(`Error: ${e.message}`, "error");
    }
  };

  window.handleDeleteVendor = async function(id) {
    if (!confirm(`Permanently delete vendor listing #${id}?\n\nThis also permanently deletes ALL of their bookings, inquiries, reviews, and ad campaigns — this cannot be undone.`)) return;
    try {
      const data = await window.WedEazzyStore.deleteVendor(id);
      if (data && data.ok) {
        showToast(`Vendor listing #${id} deleted successfully!`, "success");
        localStorage.setItem('wedeazzy_sync_trigger', Date.now().toString());
        renderActiveView();
      } else {
        showToast(data?.error || `Failed to delete vendor listing #${id}`, "error");
      }
    } catch (e) {
      console.error(e);
      showToast(`Error: ${e.message}`, "error");
    }
  };

  window.triggerVendorDocumentModal = function(vendorId, existingUrl) {
    // existingUrl is now the authenticated admin-only download route
    // (/api/admin/vendors/:id/document), not a public static file URL — a
    // plain <a target="_blank"> navigation carries no Authorization header,
    // so the admin's token is passed via the ?token= query param that
    // requireAuth already accepts as a fallback (same pattern used by the
    // WhatsApp QR pairing page).
    const adminToken = sessionStorage.getItem('wedeazzy_admin_token') || localStorage.getItem('wedeazzy_admin_token');
    const docHref = existingUrl ? `${API_BASE}${existingUrl}?token=${encodeURIComponent(adminToken || '')}` : '';
    const bodyHTML = `
      <form id="formVendorDoc" style="display: flex; flex-direction: column; gap: 12px;">
        ${existingUrl ? `
          <div class="modal-form-group">
            <label>Current Document</label>
            <a href="${docHref}" target="_blank" rel="noopener" class="btn-premium" style="justify-content: center; text-decoration: none;">
              <i class="fa-solid fa-eye"></i> View Uploaded Document
            </a>
          </div>
        ` : ''}
        <div class="modal-form-group">
          <label for="vdoc_file">${existingUrl ? 'Replace Document' : 'Upload Proof Document'} (PDF, JPG, or PNG)</label>
          <input type="file" id="vdoc_file" class="premium-input" accept=".pdf,image/jpeg,image/png,image/webp" required />
        </div>
      </form>
    `;
    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitVendorDocument('${vendorId}')">Upload</button>
    `;
    openModal("Vendor Proof of Business Document", bodyHTML, footerHTML);
  };

  window.submitVendorDocument = async function(vendorId) {
    const fileInput = document.getElementById("vdoc_file");
    const file = fileInput && fileInput.files[0];
    if (!file) {
      showToast("Please choose a file to upload!", "danger");
      return;
    }

    const btn = document.querySelector(`[onclick="window.submitVendorDocument('${vendorId}')"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
    try {
      const formData = new FormData();
      formData.append('file', file);
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const r = await apiFetch(`/api/admin/vendors/${vendorId}/document`, { method: 'POST', body: formData });
      const d = await r.json();
      if (r.ok && d.ok) {
        showToast('Document uploaded successfully!', 'success');
        closeModal();
        await window.WedEazzyStore.sync();
        renderActiveView();
      } else {
        showToast('Failed: ' + (d.message || d.error || 'Could not upload document'), 'danger');
        if (btn) { btn.disabled = false; btn.textContent = 'Upload'; }
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
      if (btn) { btn.disabled = false; btn.textContent = 'Upload'; }
    }
  };

  window.triggerVendorCredentialsModal = function(vendorId, existingEmail, vendorName) {
    const bodyHTML = `
      <form id="formVendorCreds" style="display: flex; flex-direction: column; gap: 12px;">
        <p style="font-size: 12.5px; color: var(--text-muted); margin: 0;">Create a login for <strong>${escHtml(vendorName) || 'this vendor'}</strong>. They'll be emailed these details and required to set their own password on first login.</p>
        <div class="modal-form-group">
          <label for="vcred_email">Vendor Email</label>
          <input type="email" id="vcred_email" class="premium-input" placeholder="vendor@example.com" value="${escHtml(existingEmail) || ''}" required />
          <small style="color: var(--text-muted); font-size: 0.7rem;">${existingEmail ? 'Pre-filled from their profile — edit if needed.' : 'No email on file yet — enter one to create their login.'}</small>
        </div>
        <div class="modal-form-group">
          <label for="vcred_password">Temporary Password</label>
          <div style="display:flex; gap:8px;">
            <input type="text" id="vcred_password" class="premium-input" placeholder="Set a temporary password" style="flex:1;" required />
            <button type="button" class="btn-premium" onclick="window.generateVendorPassword()" style="white-space:nowrap;">Generate</button>
          </div>
          <small style="color: var(--text-muted); font-size: 0.7rem;">8+ characters with uppercase, lowercase, a number, and a symbol.</small>
        </div>
      </form>
    `;
    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitVendorCredentials('${vendorId}')">Send Credentials</button>
    `;
    openModal("Send Vendor Login Credentials", bodyHTML, footerHTML);
  };

  window.generateVendorPassword = function() {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%*?';
    function pick(chars) { return chars[Math.floor(Math.random() * chars.length)]; }
    let pw = [pick(upper), pick(lower), pick(digits), pick(symbols)];
    const all = upper + lower + digits + symbols;
    for (let i = 0; i < 6; i++) pw.push(pick(all));
    pw = pw.sort(() => Math.random() - 0.5).join('');
    const input = document.getElementById('vcred_password');
    if (input) { input.value = pw; input.type = 'text'; }
  };

  window.submitVendorCredentials = async function(vendorId) {
    const email = document.getElementById("vcred_email").value.trim();
    const password = document.getElementById("vcred_password").value;

    if (!email || !password) {
      showToast("Please fill in both email and password!", "danger");
      return;
    }

    const btn = document.querySelector(`[onclick="window.submitVendorCredentials('${vendorId}')"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const r = await apiFetch(`/api/admin/vendors/${vendorId}/send-credentials`, {
        method: 'POST',
        body: { email, password }
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        showToast(d.message || 'Credentials sent!', d.emailSent === false ? 'warning' : 'success');
        closeModal();
        await window.WedEazzyStore.sync();
        renderActiveView();
      } else {
        showToast('Failed: ' + (d.message || d.error || 'Could not send credentials'), 'danger');
        if (btn) { btn.disabled = false; btn.textContent = 'Send Credentials'; }
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
      if (btn) { btn.disabled = false; btn.textContent = 'Send Credentials'; }
    }
  };

  // Render USERS (Tab 5)
  function renderUsers(store) {
    const users = store.users;

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>User Management</span>
        </div>

        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3>System Users Accounts <span class="interactive-pill-badge" style="font-size: 0.7rem; vertical-align: middle;">${(store.usersTotalCount ?? users.length).toLocaleString('en-IN')} total</span></h3>
              <p>Suspend customer or vendor logins, verify admins, and audit profile roles.</p>
            </div>
            <div class="panel-controls">
              <input type="text" id="userSearch" class="premium-input" placeholder="Search email/name..." />
              <button class="btn-premium btn-premium-rose" onclick="window.triggerAddUserModal()">
                <i class="fa-solid fa-user-plus"></i> Create User
              </button>
            </div>
          </div>

          <div class="table-viewport">
            <table class="grid-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Full Name</th>
                  <th>Email Target</th>
                  <th>Role Category</th>
                  <th>Platform Join Date</th>
                  <th>Account Status</th>
                  <th style="text-align: right;">Moderation Action</th>
                </tr>
              </thead>
              <tbody id="usersTableBody">
                ${users.length === 0 ? `
                  <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px 0;">No users yet.</td>
                  </tr>
                ` : users.map(u => `
                  <tr data-user-content="${escHtml(u.name.toLowerCase() + ' ' + u.email.toLowerCase())}">
                    <td><strong>#${u.id}</strong></td>
                    <td><strong>${escHtml(u.name)}</strong></td>
                    <td><i class="fa-regular fa-envelope"></i> ${escHtml(u.email)}</td>
                    <td>
                      <span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: ${u.role === 'Admin' ? 'var(--brand-rose)' : u.role === 'Vendor' ? 'var(--brand-blue)' : 'var(--border-color)'}; color: ${u.role === 'Admin' ? 'var(--brand-rose)' : u.role === 'Vendor' ? 'var(--brand-blue)' : 'var(--text-sub)'};">
                        ${u.role}
                      </span>
                    </td>
                    <td><i class="fa-regular fa-calendar-days"></i> ${u.joinDate}</td>
                    <td>
                      <span class="status-pill status-${u.status === 'active' ? 'confirmed' : 'cancelled'}">
                        <span class="status-bullet-dot"></span> ${u.status}
                      </span>
                    </td>
                    <td>
                      <div class="row-actions-group" style="justify-content: flex-end;">
                        ${u.status === "active" ? `
                          <button class="btn-premium" style="padding: 4px 8px; font-size: 0.7rem; border-color: #dc2626; color: #dc2626;" onclick="window.handleUserStatus('${u.id}', 'inactive')">
                            <i class="fa-solid fa-user-slash"></i> Suspend
                          </button>
                        ` : `
                          <button class="btn-premium" style="padding: 4px 8px; font-size: 0.7rem; border-color: #10b981; color: #10b981;" onclick="window.handleUserStatus('${u.id}', 'active')">
                            <i class="fa-solid fa-user-check"></i> Activate
                          </button>
                        `}
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const search = document.getElementById("userSearch");
    if (search) {
      search.addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll("#usersTableBody tr").forEach(row => {
          const content = row.getAttribute("data-user-content");
          row.style.display = content.includes(q) ? "" : "none";
        });
      });
    }
  };

  window.handleUserStatus = async function(id, status) {
    if (status === "inactive" && !confirm(`Are you sure you want to suspend this user account (#${id})?`)) return;
    try {
      const data = await window.WedEazzyStore.updateUserStatus(id, status);
      if (data && data.ok) {
        showToast(`User Account #${id} is now ${status.toUpperCase()}!`, status === "active" ? "success" : "warning");
        renderActiveView();
      } else {
        showToast(data?.message || data?.error || `Failed to update user #${id}`, "error");
      }
    } catch (e) {
      console.error(e);
      showToast(`Error: ${e.message}`, "error");
    }
  };

  // Render WHATSAPP CENTER (Tab 6) — wired to real API
  function renderWhatsApp(store) {
    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>WhatsApp Broadcasting Center</span>
        </div>

        <div class="portal-welcome-banner">
          <div>
            <h2>WhatsApp Concierge Center</h2>
            <p>Deploy WhatsApp promotional discounts, registration reminders, and real-time support channels.</p>
          </div>
          <div>
            <button class="btn-premium btn-premium-rose" id="waBroadcastBtn" onclick="window.triggerWhatsAppModal()">
              <i class="fa-brands fa-whatsapp"></i> Broadcast WhatsApp Blast
            </button>
          </div>
        </div>

        <div class="charts-double-layout">
          <div class="panel-card">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Sent Broadcast Campaigns</h3>
                <p>Track delivery ratios, open markers, and direct buyer reply feedback metrics.</p>
              </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 14px;" id="waCampaignList">
              <div style="text-align:center;color:var(--text-muted);padding:20px;font-size:0.82rem;">
                <i class="fa-solid fa-spinner fa-spin"></i> Loading campaigns…
              </div>
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Real-time Delivery Logs</h3>
                <p>Live message log from the WhatsApp service layer.</p>
              </div>
              <div class="panel-controls">
                <button class="btn-premium" onclick="window.triggerDirectWAModal()">
                  <i class="fa-solid fa-paper-plane"></i> Direct Msg
                </button>
              </div>
            </div>
            <div id="waLiveLogs" style="display:flex;flex-direction:column;gap:12px;max-height:480px;overflow-y:auto;padding-right:4px;">
              <div style="text-align:center;color:var(--text-muted);padding:20px;font-size:0.82rem;">
                <i class="fa-solid fa-spinner fa-spin"></i> Loading message logs…
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Load real delivery logs + real per-campaign stats from backend
    _loadWaLogs('waLiveLogs');
    _loadWaCampaigns('waCampaignList');
  }

  async function _loadWaCampaigns(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const r = await apiFetch('/api/whatsapp/campaigns');
      if (!r.ok) throw new Error('API ' + r.status);
      const d = await r.json();
      const campaigns = d.campaigns || [];
      if (campaigns.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:40px 0;color:var(--text-muted);">
            <i class="fa-brands fa-whatsapp" style="font-size:2rem;margin-bottom:12px;display:block;color:#25D366;"></i>
            No campaigns yet. Use the Broadcast button to launch one.
          </div>`;
        return;
      }
      container.innerHTML = campaigns.map(c => {
        const date = new Date(c.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
        const preview = (c.template || '').substring(0, 80) + (c.template && c.template.length > 80 ? '…' : '');
        return `
          <div style="border:1px solid var(--border-color);padding:16px;border-radius:12px;background-color:var(--canvas-bg);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
              <div>
                <strong style="font-size:0.9rem;">${escHtml(c.name)}</strong>
                <div style="font-size:0.72rem;color:var(--text-muted);"><i class="fa-solid fa-message"></i> "${escHtml(preview)}"</div>
              </div>
              <span class="status-pill status-${c.status === 'completed' ? 'confirmed' : c.status === 'failed' ? 'cancelled' : 'pending'}">${c.status}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px;font-size:0.77rem;text-align:center;">
              <div style="border-right:1px solid var(--border-color);">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Sent</div>
                <strong style="font-size:1.05rem;color:#10b981;">${c.sentCount}</strong>
              </div>
              <div style="border-right:1px solid var(--border-color);">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Queued</div>
                <strong style="font-size:1.05rem;">${c.queuedCount}</strong>
              </div>
              <div>
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Failed</div>
                <strong style="font-size:1.05rem;color:#ef4444;">${c.failedCount}</strong>
              </div>
            </div>
            <div style="font-size:0.68rem;color:var(--text-muted);margin-top:8px;text-align:right;">Started ${date} · ${c.total} total</div>
          </div>`;
      }).join('');
    } catch (e) {
      container.innerHTML = '<div style="text-align:center;color:#ef4444;padding:16px;font-size:0.82rem;">Error loading campaigns: ' + e.message + '</div>';
    }
  }

  // ── WhatsApp Status Tab ──────────────────────────────────────────────────────

  /**
   * renderWhatsAppStatus — live connection management tab.
   * Shows QR code, pairing code, connection stats, and message log.
   */
  function renderWhatsAppStatus(store) {
    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper" id="waStatusWrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>WhatsApp Connection Manager</span>
        </div>

        <div class="portal-welcome-banner">
          <div>
            <h2>WhatsApp Connection Status</h2>
            <p>Monitor and manage the Baileys WhatsApp session — pair a new device, view live stats, and audit message logs.</p>
          </div>
          <div style="display:flex;gap:10px;align-items:center;">
            <div id="waSseIndicator" style="display:flex;align-items:center;gap:6px;font-size:0.78rem;color:var(--text-muted);">
              <span style="width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block;" id="wssDot"></span>
              <span id="wssLabel">Connecting…</span>
            </div>
            <button class="btn-premium" style="border-color:#10b981;color:#10b981;display:none;" id="waConnectBtn" onclick="window.waConnect()">
              <i class="fa-solid fa-plug-circle-bolt"></i> Connect
            </button>
            <button class="btn-premium" style="border-color:#ef4444;color:#ef4444;display:none;" id="waDisconnectBtn" onclick="window.waDisconnect()">
              <i class="fa-solid fa-plug-circle-xmark"></i> Disconnect
            </button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">

          <!-- Connection Status Card -->
          <div class="panel-card" style="display:flex;flex-direction:column;gap:18px;">
            <div class="panel-header" style="border-bottom:1px solid var(--border-subtle);padding-bottom:12px;">
              <h3 style="font-size:1rem;font-weight:800;">Connection State</h3>
            </div>
            <div style="display:flex;align-items:center;gap:14px;">
              <div id="waStatusIcon" style="width:56px;height:56px;border-radius:50%;background:rgba(37,211,102,0.1);display:flex;align-items:center;justify-content:center;font-size:1.6rem;flex-shrink:0;">
                <i class="fa-brands fa-whatsapp" style="color:#25D366;"></i>
              </div>
              <div>
                <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:4px;">Current Status</div>
                <div id="waStatusBadge" style="font-size:1.15rem;font-weight:800;color:var(--text-main);">Checking…</div>
                <div id="waStatusError" style="font-size:0.72rem;color:#ef4444;margin-top:2px;display:none;"></div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
              <div style="background:var(--canvas-bg);border:1px solid var(--border-color);border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Today Sent</div>
                <strong style="font-size:1.4rem;color:#10b981;" id="waTodaySent">—</strong>
              </div>
              <div style="background:var(--canvas-bg);border:1px solid var(--border-color);border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Total Sent</div>
                <strong style="font-size:1.4rem;" id="waTotalSent">—</strong>
              </div>
              <div style="background:var(--canvas-bg);border:1px solid var(--border-color);border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Failed</div>
                <strong style="font-size:1.4rem;color:#ef4444;" id="waTotalFailed">—</strong>
              </div>
              <div style="background:var(--canvas-bg);border:1px solid var(--border-color);border-radius:10px;padding:14px;text-align:center;">
                <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Success Rate</div>
                <strong style="font-size:1.4rem;color:#3b82f6;" id="waSuccessRate">—</strong>
              </div>
            </div>
          </div>

          <!-- QR / Pairing Code Card -->
          <div class="panel-card" style="display:flex;flex-direction:column;gap:16px;">
            <div class="panel-header" style="border-bottom:1px solid var(--border-subtle);padding-bottom:12px;flex-wrap:wrap;gap:8px;">
              <h3 style="font-size:1rem;font-weight:800;">Pair a Device</h3>
              <div style="display:flex;gap:6px;">
                <button id="qrTabBtn" onclick="window.waSwitchPairTab('qr')"
                  style="padding:4px 12px;border-radius:20px;border:1px solid #25D366;background:#25D366;color:#fff;font-size:0.72rem;font-weight:700;cursor:pointer;">
                  QR Code
                </button>
                <button id="pairTabBtn" onclick="window.waSwitchPairTab('pair')"
                  style="padding:4px 12px;border-radius:20px;border:1px solid var(--border-color);background:transparent;color:var(--text-sub);font-size:0.72rem;font-weight:700;cursor:pointer;">
                  Pairing Code
                </button>
              </div>
            </div>

            <!-- QR Panel -->
            <div id="waQrPanel" style="display:flex;flex-direction:column;align-items:center;gap:10px;">
              <div id="waQrBox" style="width:200px;height:200px;border:2px dashed var(--border-color);border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--canvas-bg);">
                <div style="text-align:center;color:var(--text-muted);font-size:0.78rem;">
                  <i class="fa-solid fa-spinner fa-spin" style="font-size:1.4rem;margin-bottom:6px;display:block;"></i>Loading QR…
                </div>
              </div>
              <p style="font-size:0.75rem;color:var(--text-muted);text-align:center;max-width:220px;">
                Open WhatsApp → <strong>Linked Devices</strong> → <strong>Link a Device</strong> → scan this code
              </p>
            </div>

            <!-- Pairing Code Panel -->
            <div id="waPairingPanel" style="display:none;flex-direction:column;gap:12px;">
              <p style="font-size:0.78rem;color:var(--text-sub);">Enter the WhatsApp number (E.164 without +):</p>
              <div style="display:flex;gap:8px;">
                <input type="tel" id="waPairingPhone" class="premium-input" placeholder="919876543210" style="flex:1;" />
                <button class="btn-premium btn-premium-rose" onclick="window.waRequestPairingCode()" id="waPairingBtn">
                  <i class="fa-solid fa-key"></i> Get Code
                </button>
              </div>
              <div id="waPairingResult" style="display:none;margin-top:4px;">
                <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">Enter this code in WhatsApp → Linked Devices → Link with phone number:</div>
                <div id="waPairingCode" style="font-size:2rem;font-weight:900;letter-spacing:0.15em;color:#25D366;font-family:monospace;text-align:center;padding:12px;background:var(--canvas-bg);border-radius:10px;border:1px solid #25D36633;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Message Log Table -->
        <div class="panel-card">
          <div class="panel-header" style="border-bottom:1px solid var(--border-subtle);padding-bottom:12px;margin-bottom:14px;">
            <div class="panel-title-group">
              <h3>Recent Message Delivery Log</h3>
              <p>Last 20 outgoing WhatsApp messages from the service layer.</p>
            </div>
            <div class="panel-controls">
              <select id="waLogFilter" class="premium-select" style="width:140px;" onchange="window.waFilterLogs()">
                <option value="">All Status</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="queued">Queued</option>
              </select>
            </div>
          </div>
          <div class="table-viewport">
            <table class="grid-table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Message Preview</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody id="waLogsTableBody">
                <tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted);">
                  <i class="fa-solid fa-spinner fa-spin"></i> Loading…
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    _waStatusPoll();
    _waLoadStats();
    _loadWaLogsTable('waLogsTableBody', '');
    _waConnectSSE();
  }

  // ── WhatsApp Status helpers ─────────────────────────────────────────────────

  let _waPollTimer = null;
  let _waSSE = null;

  async function _waFetchStatusNow() {
    if (!document.getElementById('waQrBox')) return;
    try {
      if (!window.WedEazzyAuth || !window.WedEazzyAuth.getToken()) {
        // No token — apiFetch would redirect to login; show message immediately
        const qrBox = document.getElementById('waQrBox');
        const badge = document.getElementById('waStatusBadge');
        const errEl = document.getElementById('waStatusError');
        if (qrBox) qrBox.innerHTML = '<div style="text-align:center;padding:16px;"><i class="fa-solid fa-lock" style="font-size:2rem;color:#ef4444;margin-bottom:8px;display:block;"></i><div style="font-size:0.8rem;color:var(--text-muted);">Session expired or not found.<br>Redirecting to login…</div></div>';
        if (badge) { badge.textContent = 'NOT LOGGED IN'; badge.style.color = '#ef4444'; }
        if (errEl) { errEl.textContent = 'Please log in to access WhatsApp status.'; errEl.style.display = 'block'; }
        // Redirect after a short delay
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return;
      }
      const r = await window.WedEazzyAuth.apiFetch('/api/whatsapp/qr-data');
      // apiFetch already handled 401 → logout → redirect, but guard anyway
      if (!r || r.status === 401) return;
      if (!r.ok) throw new Error('API error ' + r.status);
      const data = await r.json();
      _waApplyStatus(data);
    } catch (_) {}
  }

  async function _waStatusPoll() {
    await _waFetchStatusNow();
    if (document.getElementById('waQrBox')) {
      _waPollTimer = setTimeout(_waStatusPoll, 5000);
    }
  }

  function _waApplyStatus(data) {
    const badge = document.getElementById('waStatusBadge');
    const errEl = document.getElementById('waStatusError');
    const qrBox = document.getElementById('waQrBox');
    if (!badge) return;
    const STATUS_COLORS = {
      online:'#10b981', qr:'#f59e0b', pairing:'#3b82f6',
      connecting:'#6366f1', offline:'#94a3b8', error:'#ef4444', starting:'#94a3b8'
    };
    const color = STATUS_COLORS[data.status] || '#94a3b8';
    badge.textContent = (data.status || '').toUpperCase();
    badge.style.color = color;
    const dot = document.getElementById('wssDot');
    if (dot) dot.style.background = color;
    if (errEl) { errEl.textContent = data.lastError || ''; errEl.style.display = data.lastError ? 'block' : 'none'; }
    if (qrBox) {
      if (data.hasQr && data.qrDataUrl) {
        qrBox.innerHTML = '<img src="' + data.qrDataUrl + '" alt="WhatsApp QR" style="width:196px;height:196px;border-radius:8px;object-fit:contain;" />';
      } else if (data.status === 'online') {
        qrBox.innerHTML = '<div style="text-align:center;"><i class="fa-solid fa-circle-check" style="font-size:3rem;color:#10b981;margin-bottom:8px;display:block;"></i><strong style="color:#10b981;font-size:0.85rem;">Connected!</strong></div>';
      } else {
        qrBox.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:0.78rem;"><i class="fa-brands fa-whatsapp" style="font-size:2rem;margin-bottom:8px;display:block;color:#25D366;opacity:0.4;"></i>' + (data.status === 'connecting' ? 'Connecting…' : 'Waiting for QR…') + '</div>';
      }
    }
    if (data.hasPairingCode && data.pairingCode) {
      const codeEl = document.getElementById('waPairingCode');
      const resultEl = document.getElementById('waPairingResult');
      if (codeEl) codeEl.textContent = data.pairingCode;
      if (resultEl) resultEl.style.display = 'block';
    }
    // Toggle Connect/Disconnect: only "offline"/"error"/"starting" can be
    // (re)started — there is no auto-restart after a manual disconnect or
    // once reconnect attempts are exhausted, so this button is the only way
    // back without restarting the server.
    const connectBtn = document.getElementById('waConnectBtn');
    const disconnectBtn = document.getElementById('waDisconnectBtn');
    const canConnect = ['offline', 'error', 'starting'].includes(data.status);
    if (connectBtn) connectBtn.style.display = canConnect ? 'inline-flex' : 'none';
    if (disconnectBtn) disconnectBtn.style.display = canConnect ? 'none' : 'inline-flex';
  }

  async function _waLoadStats() {
    try {
      const r = await (window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch('/api/whatsapp/stats') : fetch('/api/whatsapp/stats'));
      if (!r.ok) return;
      const d = await r.json();
      const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
      set('waTodaySent', d.todaySent ?? '—');
      set('waTotalSent', d.totalSent ?? '—');
      set('waTotalFailed', d.totalFailed ?? '—');
      set('waSuccessRate', d.successRate != null ? d.successRate + '%' : '—');
    } catch (_) {}
  }

  function _waConnectSSE() {
    if (_waSSE) { _waSSE.close(); _waSSE = null; }
    const token = window.WedEazzyAuth ? window.WedEazzyAuth.getToken() : null;
    if (!token) return; // No token — poll will show the error message, skip SSE
    try {
      _waSSE = new EventSource('/api/whatsapp/events?token=' + encodeURIComponent(token));
      _waSSE.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const label = document.getElementById('wssLabel');
          if (label) label.textContent = 'Live';
          if (data.hasQr) {
            // The SSE payload doesn't carry the QR image itself (too large to
            // push on every state change) — fetch it now instead of blanking
            // the box, which previously made a freshly-generated QR disappear
            // every ~20s until the next 5s poll happened to redraw it.
            _waFetchStatusNow();
          } else {
            _waApplyStatus({ ...data, qrDataUrl: null });
          }
        } catch (_) {}
      };
      _waSSE.onerror = () => {
        const label = document.getElementById('wssLabel');
        if (label) label.textContent = 'Reconnecting…';
      };
    } catch (_) {}
    const obs = new MutationObserver(() => {
      if (!document.getElementById('waStatusWrapper')) {
        if (_waSSE) { _waSSE.close(); _waSSE = null; }
        if (_waPollTimer) { clearTimeout(_waPollTimer); _waPollTimer = null; }
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  window.waSwitchPairTab = function(tab) {
    const qrP = document.getElementById('waQrPanel');
    const pairP = document.getElementById('waPairingPanel');
    const qrBtn = document.getElementById('qrTabBtn');
    const pairBtn = document.getElementById('pairTabBtn');
    if (!qrP || !pairP) return;
    if (tab === 'qr') {
      qrP.style.display = 'flex'; pairP.style.display = 'none';
      if (qrBtn) { qrBtn.style.background='#25D366'; qrBtn.style.color='#fff'; qrBtn.style.borderColor='#25D366'; }
      if (pairBtn) { pairBtn.style.background='transparent'; pairBtn.style.color='var(--text-sub)'; pairBtn.style.borderColor='var(--border-color)'; }
    } else {
      qrP.style.display = 'none'; pairP.style.display = 'flex';
      if (pairBtn) { pairBtn.style.background='#25D366'; pairBtn.style.color='#fff'; pairBtn.style.borderColor='#25D366'; }
      if (qrBtn) { qrBtn.style.background='transparent'; qrBtn.style.color='var(--text-sub)'; qrBtn.style.borderColor='var(--border-color)'; }
    }
  };

  window.waRequestPairingCode = async function() {
    const phoneInput = document.getElementById('waPairingPhone');
    const btn = document.getElementById('waPairingBtn');
    if (!phoneInput || !phoneInput.value.trim()) { showToast('Enter phone number first!', 'danger'); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Requesting…'; }
    try {
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const r = await apiFetch('/api/whatsapp/pairing-code', {
        method: 'POST',
        body: { phone: phoneInput.value.trim() },
      });
      const d = await r.json();
      if (d.ok) {
        const codeEl = document.getElementById('waPairingCode');
        const resultEl = document.getElementById('waPairingResult');
        if (codeEl) codeEl.textContent = d.code;
        if (resultEl) resultEl.style.display = 'block';
        showToast('Pairing code generated! Enter it in WhatsApp.', 'success');
      } else {
        showToast('Failed: ' + (d.message || 'Unknown error'), 'danger');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-key"></i> Get Code'; }
    }
  };

  window.waDisconnect = async function() {
    if (!confirm('Disconnect WhatsApp? You will need to click Connect and scan a fresh QR (or use a pairing code) to reconnect.')) return;
    try {
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const r = await apiFetch('/api/whatsapp/disconnect', { method: 'POST' });
      const d = await r.json();
      if (d.ok) { showToast('WhatsApp disconnected.', 'warning'); _waFetchStatusNow(); }
      else showToast('Disconnect failed: ' + (d.message || 'error'), 'danger');
    } catch (e) { showToast('Error: ' + e.message, 'danger'); }
  };

  window.waConnect = async function() {
    const btn = document.getElementById('waConnectBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Starting…'; }
    try {
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const r = await apiFetch('/api/whatsapp/connect', { method: 'POST' });
      const d = await r.json();
      if (d.ok) {
        showToast(d.message || 'Starting WhatsApp session…', 'success');
        _waFetchStatusNow();
      } else {
        showToast('Connect failed: ' + (d.message || 'error'), 'danger');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plug-circle-bolt"></i> Connect'; }
    }
  };

  window.waFilterLogs = function() {
    const filter = document.getElementById('waLogFilter');
    _loadWaLogsTable('waLogsTableBody', filter ? filter.value : '');
  };

  async function _loadWaLogsTable(tbodyId, statusFilter) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    try {
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const qs = statusFilter ? '?status=' + statusFilter + '&limit=20' : '?limit=20';
      const r = await apiFetch('/api/whatsapp/logs' + qs);
      if (!r.ok) throw new Error('API ' + r.status);
      const d = await r.json();
      if (!d.data || d.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted);"><i class="fa-solid fa-inbox" style="font-size:2rem;display:block;margin-bottom:8px;"></i>No messages found.</td></tr>';
        return;
      }
      tbody.innerHTML = d.data.map(m => {
        const sc = m.status === 'sent' ? '#10b981' : m.status === 'failed' ? '#ef4444' : '#94a3b8';
        const ts = new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
        const prev = (m.body || '').substring(0, 60) + (m.body && m.body.length > 60 ? '…' : '');
        return '<tr><td><strong>+' + m.to + '</strong></td><td style="font-size:0.78rem;color:var(--text-sub);">' + prev + '</td><td><span class="interactive-pill-badge" style="font-size:0.68rem;">' + (m.template || '—') + '</span></td><td><span style="font-weight:700;font-size:0.78rem;color:' + sc + ';">' + m.status + '</span></td><td style="font-size:0.72rem;color:var(--text-muted);">' + ts + '</td></tr>';
      }).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#ef4444;">Error loading logs: ' + e.message + '</td></tr>';
    }
  }

  async function _loadWaLogs(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    try {
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const r = await apiFetch('/api/whatsapp/logs?limit=15');
      if (!r.ok) throw new Error('API ' + r.status);
      const d = await r.json();
      if (!d.data || d.data.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:30px;font-size:0.82rem;"><i class="fa-solid fa-inbox" style="font-size:2rem;display:block;margin-bottom:8px;"></i>No messages yet.</div>';
        return;
      }
      container.innerHTML = d.data.map(log => {
        const sc = log.status === 'sent' ? '#10b981' : log.status === 'failed' ? '#ef4444' : '#94a3b8';
        const ts = new Date(log.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
        const prev = (log.body || '').substring(0, 80) + (log.body && log.body.length > 80 ? '…' : '');
        return '<div style="border-bottom:1px solid var(--border-subtle);padding-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:0.77rem;margin-bottom:4px;"><strong>+' + log.to + '</strong><span style="color:' + sc + ';font-size:0.68rem;font-weight:700;text-transform:uppercase;">' + log.status + '</span></div><div style="font-size:0.77rem;color:var(--text-sub);font-style:italic;">"' + prev + '"</div><div style="font-size:0.68rem;color:var(--text-muted);margin-top:4px;text-align:right;">' + ts + '</div></div>';
      }).join('');
    } catch (e) {
      container.innerHTML = '<div style="text-align:center;color:#ef4444;padding:16px;font-size:0.82rem;">Error loading logs: ' + e.message + '</div>';
    }
  }



  // Render REPORTS & ANALYTICS (Tab 7)
  function renderReports(store) {
    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Reports & Deep Analytics</span>
        </div>

        <div class="portal-welcome-banner">
          <div>
            <h2>Platform Deep Analytics Reports</h2>
            <p>Review comprehensive growth matrices, categories distributions, verify listing claim ratios, and volume rates.</p>
          </div>
          <div class="panel-controls">
            <button class="btn-premium btn-premium-rose" onclick="window.print()">
              <i class="fa-solid fa-file-pdf"></i> Export PDF Report
            </button>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 20px;">
          <div class="panel-card">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Commission Pipelines ($) <span class="interactive-pill-badge" style="font-size: 0.65rem; border-color: #FED7AA; color: #9A3412; vertical-align: middle;">Sample data</span></h3>
                <p style="font-size: 0.72rem; color: var(--text-muted);">Illustrative trend only — not yet wired to live transaction totals.</p>
              </div>
            </div>
            <div class="canvas-container" style="height: 250px;">
              <canvas id="chartRevenue"></canvas>
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Monthly Bookings Volume <span class="interactive-pill-badge" style="font-size: 0.65rem; border-color: #FED7AA; color: #9A3412; vertical-align: middle;">Sample data</span></h3>
                <p style="font-size: 0.72rem; color: var(--text-muted);">Illustrative trend only — not yet wired to live booking totals.</p>
              </div>
            </div>
            <div class="canvas-container" style="height: 250px;">
              <canvas id="chartBookingTrends"></canvas>
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Partner Services Distribution</h3>
              </div>
            </div>
            <div class="canvas-container" style="height: 250px;">
              <canvas id="chartVendors"></canvas>
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Verification & Claims Ratios</h3>
              </div>
            </div>
            <div class="canvas-container" style="height: 250px;">
              <canvas id="chartListingClaims"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;

    // Render charts
    if (window.WedEazzyCharts && typeof window.WedEazzyCharts.renderAll === 'function') {
      setTimeout(() => window.WedEazzyCharts.renderAll(), 100);
    }
  }

  // Render SETTINGS (Tab 8)
  function renderSettings(store) {
    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Settings Console</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
          <div class="panel-card">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Theme Settings</h3>
                <p>Toggle display parameters, lighting rules, and dashboard layouts.</p>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 14px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong>Dark Theme Mode</strong>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">Switch to elegant dark shades.</div>
                </div>
                <button class="btn-premium" onclick="document.getElementById('themeToggleBtn').click()">
                  <i class="fa-solid fa-palette"></i> Toggle Dark/Light
                </button>
              </div>

              <hr style="border: none; border-bottom: 1px solid var(--border-subtle);" />

              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong>Reset Database Mock</strong>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">Re-initialize all default booking and statistics tables.</div>
                </div>
                <button class="btn-premium" style="border-color: #ef4444; color: #ef4444;" onclick="window.WedEazzyStore.reset(); window.showToast('Database reset to defaults successfully!', 'success');">
                  <i class="fa-solid fa-trash-can"></i> Purge Store
                </button>
              </div>
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Admin Credentials Simulation</h3>
                <p>Modify default credentials overrides.</p>
              </div>
            </div>
            <form onsubmit="event.preventDefault(); window.showToast('Credentials updated successfully in local session! (Password changes are mock)', 'success');" style="display: flex; flex-direction: column; gap: 12px;">
              <div class="modal-form-group">
                <label>Admin Login Account Email</label>
                <input type="email" class="premium-input" value="wedeazzy@gmail.com" disabled style="background-color: var(--border-subtle); cursor: not-allowed;" />
              </div>
              <div class="modal-form-group">
                <label>New Passphrase</label>
                <input type="password" class="premium-input" placeholder="••••••••••••" required />
              </div>
              <button class="btn-premium btn-premium-rose" type="submit" style="justify-content: center; margin-top: 10px;">
                <i class="fa-solid fa-lock"></i> Save Secure Password
              </button>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------------------
  // DYNAMIC MODALS DRAWER INTERACTIVE LOGICS
  // -------------------------------------------------------------

  // Modal 1: Add Booking
  window.triggerAddBookingModal = function() {
    const bodyHTML = `
      <form id="formAddBooking" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="modal-form-group">
          <label for="mb_clientName">Client Full Name</label>
          <input type="text" id="mb_clientName" class="premium-input" placeholder="Enter client name..." required />
        </div>
        <div class="modal-form-group">
          <label for="mb_eventType">Event Type</label>
          <select id="mb_eventType" class="premium-select" required>
            <option value="Wedding">Wedding</option>
            <option value="Sangeet">Sangeet</option>
            <option value="Reception">Reception</option>
            <option value="Haldi">Haldi</option>
            <option value="Engagement">Engagement</option>
          </select>
        </div>
        <div class="modal-form-group">
          <label for="mb_venue">Venue Target</label>
          <input type="text" id="mb_venue" class="premium-input" placeholder="e.g. The Grand Palace Ballroom" required />
        </div>
        <div class="modal-form-group">
          <label for="mb_date">Event Date</label>
          <input type="date" id="mb_date" class="premium-input" required />
        </div>
        <div class="modal-form-group">
          <label for="mb_budget">Client Budget (₹)</label>
          <input type="number" id="mb_budget" class="premium-input" placeholder="e.g. 12000" min="0" required />
        </div>
        <div class="modal-form-group">
          <label for="mb_notes">Guidelines / Decor Notes</label>
          <input type="text" id="mb_notes" class="premium-input" placeholder="Specific requests..." />
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitAddBooking()">Confirm Booking</button>
    `;

    openModal("Launch New Client Booking", bodyHTML, footerHTML);
  };

  window.submitAddBooking = async function() {
    const name = document.getElementById("mb_clientName").value;
    const type = document.getElementById("mb_eventType").value;
    const venue = document.getElementById("mb_venue").value;
    const date = document.getElementById("mb_date").value;
    const budget = document.getElementById("mb_budget").value;
    const notes = document.getElementById("mb_notes").value;

    if (!name || !venue || !date || !budget) {
      showToast("Please fill all required inputs!", "danger");
      return;
    }

    const btn = document.querySelector('[onclick="window.submitAddBooking()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const r = await apiFetch('/api/admin/bookings', {
        method: 'POST',
        body: { clientName: name, eventType: type, venue: venue, date: date, budget: Number(budget), notes: notes }
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        showToast(`Successfully created booking for ${name}!`, "success");
        closeModal();
        await window.WedEazzyStore.sync();
        renderActiveView();
      } else {
        showToast('Failed: ' + (d.message || d.error || 'Could not create booking'), 'danger');
        if (btn) { btn.disabled = false; btn.textContent = 'Confirm Booking'; }
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
      if (btn) { btn.disabled = false; btn.textContent = 'Confirm Booking'; }
    }
  };

  // Modal 2: Add Vendor
  window.triggerAddVendorModal = function() {
    const savedScope = (window.WedEazzyCountryScope || 'IN').toUpperCase();
    const bodyHTML = `
      <form id="formAddVendor" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="modal-form-group">
          <label for="mv_name">Business Name *</label>
          <input type="text" id="mv_name" class="premium-input" placeholder="e.g. Dream Event Decorators" required />
        </div>
        <div class="modal-form-group">
          <label for="mv_country">Country *</label>
          <select id="mv_country" class="premium-select" required>
            <option value="India" ${savedScope === 'IN' || savedScope === 'ALL' ? 'selected' : ''}>🇮🇳 India</option>
            <option value="UAE" ${savedScope === 'AE' ? 'selected' : ''}>🇦🇪 UAE</option>
            <option value="UK" ${savedScope === 'GB' ? 'selected' : ''}>🇬🇧 UK</option>
            <option value="USA" ${savedScope === 'US' ? 'selected' : ''}>🇺🇸 USA</option>
            <option value="Canada" ${savedScope === 'CA' ? 'selected' : ''}>🇨🇦 Canada</option>
            <option value="Australia" ${savedScope === 'AU' ? 'selected' : ''}>🇦🇺 Australia</option>
          </select>
        </div>
        <div class="modal-form-group">
          <label for="mv_category">Service Vertical *</label>
          <select id="mv_category" class="premium-select" required>
            <option value="Catering">Catering</option>
            <option value="Decoration">Decoration</option>
            <option value="Photography">Photography</option>
            <option value="Makeup Artist">Makeup Artist</option>
            <option value="Entertainment">Entertainment</option>
            <option value="Wedding Venues">Wedding Venues</option>
            <option value="Wedding Planners">Wedding Planners</option>
          </select>
        </div>
        <div class="modal-form-group">
          <label for="mv_contact">Contact Phone *</label>
          <input type="text" id="mv_contact" class="premium-input" placeholder="+1 / +44 / +91 XXXXX XXXXX" required />
        </div>
        <div class="modal-form-group">
          <label for="mv_email">Email Address *</label>
          <input type="email" id="mv_email" class="premium-input" placeholder="info@company.com" required />
        </div>
        <div class="modal-form-group">
          <label for="mv_address">City *</label>
          <input type="text" id="mv_address" class="premium-input" placeholder="e.g. London / New York / Dubai / Mumbai" required />
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitAddVendor()">Approve Vendor</button>
    `;

    openModal("Pre-approve Service Vendor", bodyHTML, footerHTML);
  };

  window.submitAddVendor = async function() {
    const name = document.getElementById("mv_name").value;
    const country = document.getElementById("mv_country").value;
    const cat = document.getElementById("mv_category").value;
    const phone = document.getElementById("mv_contact").value;
    const email = document.getElementById("mv_email").value;
    const addr = document.getElementById("mv_address").value;

    if (!name || !phone || !email || !addr) {
      showToast("Please fill all required inputs!", "danger");
      return;
    }

    const codeMap = { 'India': 'IN', 'USA': 'US', 'UK': 'GB', 'UAE': 'AE', 'Canada': 'CA', 'Australia': 'AU' };
    const countryCode = codeMap[country] || 'IN';

    const btn = document.querySelector('[onclick="window.submitAddVendor()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }
    try {
      const result = await window.WedEazzyStore.addVendor({
        name: name,
        country: country,
        countryCode: countryCode,
        category: cat,
        contact: phone,
        email: email,
        address: addr,
        status: "approved" // Pre-approved in admin concierge action
      });

      if (result && result.ok) {
        showToast(`Service partner '${name}' approved successfully!`, "success");
        closeModal();
        renderActiveView();
      } else {
        showToast('Failed to add vendor: ' + (result && result.message ? result.message : 'Unknown error — check the vendor was not already added.'), 'danger');
        if (btn) { btn.disabled = false; btn.textContent = 'Approve Vendor'; }
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
      if (btn) { btn.disabled = false; btn.textContent = 'Approve Vendor'; }
    }
  };

  // Modal 3: Add Venue
  window.triggerAddVenueModal = function() {
    const bodyHTML = `
      <form id="formAddVenue" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="modal-form-group">
          <label for="mve_name">Venue / Hall Name</label>
          <input type="text" id="mve_name" class="premium-input" placeholder="e.g. Royal Orchid Lawn" required />
        </div>
        <div class="modal-form-group">
          <label for="mve_location">Location City/Area</label>
          <input type="text" id="mve_location" class="premium-input" placeholder="e.g. North Bangalore" required />
        </div>
        <div class="modal-form-group">
          <label for="mve_capacity">Max Seating Capacity</label>
          <input type="number" id="mve_capacity" class="premium-input" placeholder="e.g. 1000" min="1" required />
        </div>
        <div class="modal-form-group">
          <label for="mve_price">Rent Per Day ($)</label>
          <input type="number" id="mve_price" class="premium-input" placeholder="e.g. 7500" min="0" required />
        </div>
        <div class="modal-form-group">
          <label for="mve_phone">Manager Contact Phone</label>
          <input type="text" id="mve_phone" class="premium-input" placeholder="+91 XXXXX XXXXX" required />
        </div>
        <div class="modal-form-group">
          <label for="mve_contact">Manager Email</label>
          <input type="email" id="mve_contact" class="premium-input" placeholder="manager@venue.com" required />
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitAddVenue()">Approve Venue</button>
    `;

    openModal("Pre-approve Wedding Venue", bodyHTML, footerHTML);
  };

  window.submitAddVenue = async function() {
    const name = document.getElementById("mve_name").value;
    const loc = document.getElementById("mve_location").value;
    const cap = document.getElementById("mve_capacity").value;
    const price = document.getElementById("mve_price").value;
    const phone = document.getElementById("mve_phone").value;
    const email = document.getElementById("mve_contact").value;

    if (!name || !loc || !cap || !price || !phone || !email) {
      showToast("Please fill all required inputs!", "danger");
      return;
    }

    const btn = document.querySelector('[onclick="window.submitAddVenue()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Registering…'; }
    try {
      const result = await window.WedEazzyStore.addVenue({
        name: name,
        location: loc,
        capacity: Number(cap),
        price: Number(price),
        contact: phone,
        email: email,
        status: "approved"
      });

      if (result && result.ok) {
        showToast(`Venue '${name}' registered successfully!`, "success");
        closeModal();
        renderActiveView();
      } else {
        showToast('Failed to register venue: ' + (result && result.message ? result.message : 'Unknown error — check the venue was not already added.'), 'danger');
        if (btn) { btn.disabled = false; btn.textContent = 'Approve Venue'; }
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
      if (btn) { btn.disabled = false; btn.textContent = 'Approve Venue'; }
    }
  };

  // Modal 4: Add User
  window.triggerAddUserModal = function() {
    const bodyHTML = `
      <form id="formAddUser" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="modal-form-group">
          <label for="mu_name">Full Name</label>
          <input type="text" id="mu_name" class="premium-input" placeholder="Amit Sharma" required />
        </div>
        <div class="modal-form-group">
          <label for="mu_email">Email Target</label>
          <input type="email" id="mu_email" class="premium-input" placeholder="amit@gmail.com" required />
        </div>
        <div class="modal-form-group">
          <label for="mu_role">System Access Role</label>
          <select id="mu_role" class="premium-select" required>
            <option value="Customer">Customer</option>
            <option value="Vendor">Vendor</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitAddUser()">Create User</button>
    `;

    openModal("Create New User Credentials", bodyHTML, footerHTML);
  };

  window.submitAddUser = async function() {
    const name = document.getElementById("mu_name").value;
    const email = document.getElementById("mu_email").value;
    const role = document.getElementById("mu_role").value;

    if (!name || !email) {
      showToast("Please fill all inputs!", "danger");
      return;
    }

    const btn = document.querySelector('[onclick="window.submitAddUser()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    try {
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const r = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: { name: name, email: email, role: role }
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        showToast(`User Account created for ${name}!`, "success");
        closeModal();
        await window.WedEazzyStore.sync();
        renderActiveView();
      } else {
        showToast('Failed: ' + (d.message || d.error || 'Could not create user'), 'danger');
        if (btn) { btn.disabled = false; btn.textContent = 'Create User'; }
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
      if (btn) { btn.disabled = false; btn.textContent = 'Create User'; }
    }
  };

  // Modal 5: WhatsApp Blast
  window.triggerWhatsAppModal = function() {
    const bodyHTML = `
      <form id="formWhatsApp" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="modal-form-group">
          <label for="mwa_name">Campaign Nickname</label>
          <input type="text" id="mwa_name" class="premium-input" placeholder="e.g. Wedding Season Kickoff" required />
        </div>
        <div class="modal-form-group">
          <label for="mwa_segment">Recipient Target Audience</label>
          <select id="mwa_segment" class="premium-select" required onchange="document.getElementById('mwaCategoryGroup').style.display = this.value === 'vendor_category' ? 'block' : 'none'; window.refreshWaAudienceCount();">
            <option value="all">All Accounts (Couples & Vendors)</option>
            <option value="vendors">Registered Wedding Vendors Only</option>
            <option value="couples">Couples Planning Weddings Only</option>
            <option value="vendor_category">Vendors in a Specific Category</option>
          </select>
          <small id="mwaAudienceCount" style="color: var(--text-muted); font-size: 0.7rem;">Estimating recipients…</small>
        </div>
        <div class="modal-form-group" id="mwaCategoryGroup" style="display: none;">
          <label>Vendor Category</label>
          <select id="mwa_category" class="premium-select" onchange="window.refreshWaAudienceCount();">
            <option value="">Loading categories…</option>
          </select>
        </div>
        <div class="modal-form-group">
          <label for="mwa_template">Custom Message Text</label>
          <textarea id="mwa_template" class="premium-input" style="height: 100px; resize: none;" placeholder="Write the WhatsApp message to broadcast..." required></textarea>
        </div>
        <div class="modal-form-group">
          <label for="mwa_image">Attach Image (optional)</label>
          <input type="file" id="mwa_image" class="premium-input" accept="image/jpeg,image/png,image/webp" />
          <small id="mwa_image_status" style="color: var(--text-muted); font-size: 0.7rem;">JPG, PNG or WebP. Sent as an image with your message text as the caption.</small>
        </div>
        <div class="modal-form-group">
          <label for="mwa_delay">Delay Between Messages (seconds)</label>
          <input type="number" id="mwa_delay" class="premium-input" value="60" min="5" max="300" required />
          <small style="color: var(--text-muted); font-size: 0.7rem;">Spacing sends out avoids WhatsApp's anti-spam limits. With a large audience this can take hours — sending happens in the background, you can navigate away.</small>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitWhatsAppCampaign()">Deploy Blast</button>
    `;

    openModal("Launch WhatsApp Broadcast", bodyHTML, footerHTML);
    window._mwaUploadedImageUrl = null;
    window.refreshWaAudienceCount();

    const imageInput = document.getElementById('mwa_image');
    if (imageInput) {
      imageInput.addEventListener('change', async () => {
        const file = imageInput.files && imageInput.files[0];
        const status = document.getElementById('mwa_image_status');
        window._mwaUploadedImageUrl = null;
        if (!file) return;
        if (status) status.textContent = `Uploading ${file.name}…`;
        try {
          const formData = new FormData();
          formData.append('file', file);
          const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
          const res = await apiFetch('/api/upload/photo', { method: 'POST', body: formData });
          const data = await res.json();
          if (res.ok && data.ok) {
            window._mwaUploadedImageUrl = data.url;
            if (status) status.textContent = `✓ ${file.name} uploaded — will be sent as an image.`;
          } else {
            if (status) status.textContent = `Upload failed: ${data.message || data.error || 'unknown error'}`;
          }
        } catch (e) {
          if (status) status.textContent = `Upload failed: ${e.message}`;
        }
      });
    }

    (async function loadWaCategoryOptions() {
      const select = document.getElementById('mwa_category');
      if (!select) return;
      try {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch('/api/admin/vendor-categories', {
          headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        const categories = (data.ok && data.categories) || [];
        select.innerHTML = categories.length
          ? categories.map(c => `<option value="${escHtml(c.slug)}">${escHtml(c.name)} (${c.count})</option>`).join('')
          : '<option value="">No categories found</option>';
      } catch (e) {
        select.innerHTML = '<option value="">Could not load categories</option>';
      }
    })();
  };

  window.refreshWaAudienceCount = async function() {
    const el2 = document.getElementById('mwaAudienceCount');
    const segmentSelect = document.getElementById('mwa_segment');
    if (!el2 || !segmentSelect) return;

    let segment = segmentSelect.value;
    if (segment === 'vendor_category') {
      const categorySlug = document.getElementById('mwa_category')?.value;
      if (!categorySlug) {
        el2.textContent = 'Choose a vendor category to see recipient count.';
        return;
      }
      segment = `vendor_category:${categorySlug}`;
    }

    el2.textContent = 'Estimating recipients…';
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch(`/api/admin/audience-count?segment=${encodeURIComponent(segment)}&channel=whatsapp`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      el2.textContent = data.ok
        ? `This will reach approximately ${data.count.toLocaleString('en-IN')} recipient(s) with a phone number on file.`
        : 'Could not estimate recipient count.';
    } catch (e) {
      el2.textContent = 'Could not estimate recipient count.';
    }
  };

  window.submitWhatsAppCampaign = async function() {
    const name = document.getElementById("mwa_name").value;
    const temp = document.getElementById("mwa_template").value;
    let segment = document.getElementById("mwa_segment").value;
    const delay = document.getElementById("mwa_delay").value;

    if (!name || !temp.trim() || !segment) {
      showToast("Please fill all campaign fields!", "danger");
      return;
    }
    if (segment === 'vendor_category') {
      const categorySlug = document.getElementById("mwa_category")?.value;
      if (!categorySlug) {
        showToast("Please choose a vendor category!", "danger");
        return;
      }
      segment = `vendor_category:${categorySlug}`;
    }

    const btn = document.querySelector('[onclick="window.submitWhatsAppCampaign()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const r = await apiFetch('/api/whatsapp/campaign', {
        method: 'POST',
        body: { name: name, template: temp, segment: segment, delaySeconds: Number(delay), mediaUrl: window._mwaUploadedImageUrl || null }
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        showToast(d.message || `WhatsApp Campaign "${name}" started for ${d.recipients} recipient(s)!`, "success");
        window._mwaUploadedImageUrl = null;
        closeModal();
        // Redirect to WhatsApp tab to show the real send log
        mountTab("whatsapp");
      } else {
        showToast('Failed: ' + (d.message || d.error || 'Could not send campaign'), 'danger');
        if (btn) { btn.disabled = false; btn.textContent = 'Deploy Blast'; }
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
      if (btn) { btn.disabled = false; btn.textContent = 'Deploy Blast'; }
    }
  };

  // Modal 6: Direct Support Message
  window.triggerDirectWAModal = function() {
    const bodyHTML = `
      <form id="formDirectWA" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="modal-form-group">
          <label for="mdwa_phone">Recipient Phone (+91...)</label>
          <input type="text" id="mdwa_phone" class="premium-input" placeholder="+91 XXXXX XXXXX" required />
        </div>
        <div class="modal-form-group">
          <label for="mdwa_msg">Custom Message Text</label>
          <textarea id="mdwa_msg" class="premium-input" style="height: 100px; resize: none;" placeholder="Hi, we noticed an issue on your listing..." required></textarea>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitDirectWA()">Send Message</button>
    `;

    openModal("Send WhatsApp Message", bodyHTML, footerHTML);
  };

  window.submitDirectWA = async function() {
    const phone = document.getElementById("mdwa_phone").value;
    const msg = document.getElementById("mdwa_msg").value;

    if (!phone || !msg) {
      showToast("Phone and message details cannot be empty!", "danger");
      return;
    }

    // Disable send button to prevent double-submit
    const sendBtn = document.querySelector('[onclick="window.submitDirectWA()"]');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; }

    try {
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const r = await apiFetch('/api/whatsapp/send', {
        method: 'POST',
        body: { to: phone, body: msg },
      });
      const d = await r.json();
      if (d.ok) {
        showToast(`WhatsApp message dispatched to ${phone}!`, "success");
        closeModal();
        renderActiveView(); // refresh log
      } else {
        showToast('Send failed: ' + (d.error || d.message || 'WA offline'), 'danger');
        if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send Message'; }
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send Message'; }
    }
  };

  // Initialize
  init();

  /* ===========================================================================
   * GROW CAMPAIGNS — WedEazzy Admin Campaign Management
   * View all vendor ad campaigns, approve/reject, update analytics
   * ========================================================================= */
  async function renderGrowCampaigns(store) {
    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">WedEazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Grow Business Campaigns</span>
        </div>

        <div class="portal-welcome-banner">
          <div>
            <h2>🚀 Grow Business Campaigns Management</h2>
            <p>Review vendor ad campaigns, manage active promotion budgets, update real performance analytics, and track ROI.</p>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <input type="text" id="campaignSearchInput" placeholder="Search business or package..." 
              style="border:1.5px solid var(--border-color);border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;color:var(--text-main);background:var(--surface-bg);outline:none;min-width:200px;"
              oninput="window.filterAdminCampaigns()" />
            
            <select id="campaignCountryFilter" 
              style="border:1.5px solid var(--border-color);border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;color:var(--text-main);background:var(--surface-bg);outline:none;cursor:pointer;"
              onchange="window.filterAdminCampaigns()">
              <option value="all">All Countries</option>
              <option value="IN">🇮🇳 India</option>
              <option value="AE">🇦🇪 UAE</option>
              <option value="GB">🇬🇧 UK</option>
              <option value="US">🇺🇸 USA</option>
              <option value="CA">🇨🇦 Canada</option>
              <option value="AU">🇦🇺 Australia</option>
            </select>

            <select id="campaignStatusFilter" 
              style="border:1.5px solid var(--border-color);border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;color:var(--text-main);background:var(--surface-bg);outline:none;cursor:pointer;"
              onchange="window.filterAdminCampaigns()">
              <option value="all">All Statuses</option>
              <option value="pending">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <!-- KPI SUMMARY CARDS -->
        <div id="growCampaignsKpiContainer" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;"></div>

        <div id="adminCampaignsContainer">
          <div style="text-align:center;padding:48px;color:var(--text-muted);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-bottom:16px;display:block;"></i>
            Loading campaigns...
          </div>
        </div>
      </div>
    `;

    window._rawAdminCampaigns = [];
    window.loadAdminCampaigns();
  }

  window.loadAdminCampaigns = async function() {
    const container = document.getElementById('adminCampaignsContainer');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-bottom:16px;display:block;"></i>Loading campaigns...</div>`;

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;

      const url = `/api/campaigns/admin/all?status=all&limit=200`;
      const res = await fetch(url, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || 'Failed to load campaigns');

      window._rawAdminCampaigns = data.campaigns || [];
      window.filterAdminCampaigns();
    } catch (e) {
      container.innerHTML = `
        <div class="panel-card" style="text-align:center;padding:48px;">
          <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
          <h3>Failed to load campaigns</h3>
          <p style="color:var(--text-muted);">${e.message}</p>
          <button onclick="window.loadAdminCampaigns()" 
            style="margin-top:16px;background:#DC1F30;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">
            Retry
          </button>
        </div>
      `;
    }
  };

  window.filterAdminCampaigns = function() {
    const container = document.getElementById('adminCampaignsContainer');
    const kpiContainer = document.getElementById('growCampaignsKpiContainer');
    if (!container) return;

    const campaigns = window._rawAdminCampaigns || [];
    const statusVal = document.getElementById('campaignStatusFilter')?.value || 'all';
    const countryVal = document.getElementById('campaignCountryFilter')?.value || 'all';
    const searchVal = (document.getElementById('campaignSearchInput')?.value || '').toLowerCase().trim();

    const filtered = campaigns.filter(c => {
      if (statusVal !== 'all' && (c.adminStatus || 'pending') !== statusVal) return false;
      if (countryVal !== 'all') {
        const cCode = (c.vendor?.countryCode || c.vendor?.country || '').toUpperCase();
        if (!cCode.includes(countryVal)) return false;
      }
      if (searchVal) {
        const bName = (c.vendor?.businessName || '').toLowerCase();
        const pkg = (c.packageType || '').toLowerCase();
        const email = (c.vendor?.user?.email || '').toLowerCase();
        if (!bName.includes(searchVal) && !pkg.includes(searchVal) && !email.includes(searchVal)) return false;
      }
      return true;
    });

    // Update KPI Cards
    if (kpiContainer) {
      const totalRev = filtered.reduce((acc, c) => acc + (parseFloat(c.totalAmount) || 0), 0);
      const activeCnt = filtered.filter(c => c.adminStatus === 'running' || c.adminStatus === 'approved').length;
      const totalLeads = filtered.reduce((acc, c) => acc + (parseInt(c.analyticsLeads, 10) || 0) + (parseInt(c.analyticsWhatsapp, 10) || 0), 0);

      kpiContainer.innerHTML = `
        <div class="panel-card" style="padding: 16px;">
          <span style="font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Total Campaigns</span>
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--text-main); margin-top: 4px;">${filtered.length}</div>
        </div>
        <div class="panel-card" style="padding: 16px;">
          <span style="font-size: 0.72rem; font-weight: 800; color: #059669; text-transform: uppercase;">Active / Running</span>
          <div style="font-size: 1.5rem; font-weight: 800; color: #059669; margin-top: 4px;">${activeCnt}</div>
        </div>
        <div class="panel-card" style="padding: 16px;">
          <span style="font-size: 0.72rem; font-weight: 800; color: var(--brand-rose); text-transform: uppercase;">Total Campaign Revenue</span>
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--brand-rose); margin-top: 4px;">₹${totalRev.toLocaleString('en-IN')}</div>
        </div>
        <div class="panel-card" style="padding: 16px;">
          <span style="font-size: 0.72rem; font-weight: 800; color: var(--brand-blue); text-transform: uppercase;">Leads Delivered</span>
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--brand-blue); margin-top: 4px;">${totalLeads.toLocaleString('en-IN')}</div>
        </div>
      `;
    }

    const statusColors = {
      pending: { bg: 'rgba(245,158,11,0.1)', color: '#D97706' },
      approved: { bg: 'rgba(16,185,129,0.1)', color: '#059669' },
      running: { bg: 'rgba(59,130,246,0.1)', color: '#2563EB' },
      completed: { bg: 'rgba(107,114,128,0.1)', color: '#6B7280' },
      rejected: { bg: 'rgba(220,31,48,0.1)', color: '#DC1F30' }
    };

    const pkgNames = {
      whatsapp_leads: 'WhatsApp Enquiries',
      more_leads: 'More Leads',
      website_sales: 'Website Sales'
    };

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="panel-card" style="text-align:center;padding:48px;">
          <div style="font-size:48px;margin-bottom:16px;">📭</div>
          <h3>No campaigns match active filters</h3>
          <p style="color:var(--text-muted);">Try resetting search keywords, status, or country filters.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${filtered.map(c => {
          const sc = statusColors[c.adminStatus] || statusColors.pending;
          const vendorName = c.vendor ? c.vendor.businessName : '—';
          const vendorEmail = c.vendor && c.vendor.user ? c.vendor.user.email : '—';
          const vendorPhone = c.vendor ? (c.vendor.whatsappNumber || c.vendor.user?.phone || '—') : '—';
          const targetAreas = Array.isArray(c.targetAreas) ? c.targetAreas.join(', ') : '—';
          const pkgName = pkgNames[c.packageType] || c.packageType || '—';
          const createdAt = new Date(c.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });

          return `
            <div class="panel-card" id="campaign-${c.id}" style="border-left:4px solid ${sc.color};">
              <!-- Header -->
              <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
                <div>
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                    <h3 style="font-size:16px;font-weight:800;color:var(--text-main);">${pkgName}</h3>
                    <span style="background:${sc.bg};color:${sc.color};font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;text-transform:uppercase;">
                      ● ${(c.adminStatus || 'pending').replace('_', ' ')}
                    </span>
                  </div>
                  <div style="font-size:12px;color:var(--text-muted);display:flex;gap:16px;flex-wrap:wrap;">
                    <span>🏪 <strong>${escHtml(vendorName)}</strong></span>
                    <span>📧 ${escHtml(vendorEmail)}</span>
                    <span>📱 ${escHtml(vendorPhone)}</span>
                    <span>📅 ${createdAt}</span>
                  </div>
                </div>
                <div style="font-size:18px;font-weight:800;color:#DC1F30;">${c.totalAmount ? '₹' + parseInt(c.totalAmount).toLocaleString('en-IN') : '—'}</div>
              </div>

              <!-- Campaign Details -->
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;background:var(--canvas-bg);border-radius:10px;padding:14px;margin-bottom:16px;font-size:13px;">
                <div><span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:700;">Plan Duration</span><div style="font-weight:700;color:var(--text-main);">${c.planDays ? c.planDays + ' Days' : 'Custom'}</div></div>
                <div><span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:700;">Payment Method</span><div style="font-weight:700;color:var(--text-main);">${(c.paymentMethod || '—').replace('_', ' ')}</div></div>
                <div><span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:700;">Gender</span><div style="font-weight:700;color:var(--text-main);">${c.gender || 'All'}</div></div>
                <div><span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:700;">Age Range</span><div style="font-weight:700;color:var(--text-main);">${c.ageMin || 18}–${c.ageMax || 65}</div></div>
                <div><span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:700;">Time Schedule</span><div style="font-weight:700;color:var(--text-main);">${c.timeSchedule === 'whole_day' ? 'Whole Day' : (c.startTime + ' – ' + c.endTime)}</div></div>
                <div><span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:700;">Payment Status</span><div style="font-weight:700;color:${c.paymentStatus === 'paid' ? '#059669' : c.paymentStatus === 'failed' ? '#DC1F30' : '#D97706'};">${c.paymentStatus || 'pending'}</div></div>
              </div>

              ${targetAreas !== '—' ? `
                <div style="margin-bottom:14px;">
                  <span style="font-size:10px;text-transform:uppercase;font-weight:700;color:var(--text-muted);">Target Areas</span>
                  <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
                    ${(Array.isArray(c.targetAreas) ? c.targetAreas : []).map(a => `<span style="background:var(--canvas-bg);border:1px solid var(--border-color);font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;">${a}</span>`).join('')}
                  </div>
                </div>
              ` : ''}

              <!-- Analytics Update Section -->
              <div style="background:rgba(220,31,48,0.04);border:1.5px solid rgba(220,31,48,0.12);border-radius:10px;padding:14px;margin-bottom:16px;">
                <div style="font-size:12px;font-weight:800;color:var(--text-main);margin-bottom:10px;">📊 Analytics Update (enter real numbers)</div>
                <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">
                  ${[
                    {key:'analyticsReach', label:'Reach', val: c.analyticsReach},
                    {key:'analyticsImpressions', label:'Impressions', val: c.analyticsImpressions},
                    {key:'analyticsClicks', label:'Clicks', val: c.analyticsClicks},
                    {key:'analyticsLeads', label:'Leads', val: c.analyticsLeads},
                    {key:'analyticsWhatsapp', label:'WhatsApp', val: c.analyticsWhatsapp}
                  ].map(f => `
                    <div>
                      <div style="font-size:9px;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:4px;">${f.label}</div>
                      <input type="number" id="anlyt-${c.id}-${f.key}" value="${f.val || 0}" min="0"
                        style="width:100%;border:1.5px solid var(--border-color);border-radius:6px;padding:6px 8px;font-size:13px;font-weight:700;color:var(--text-main);background:var(--surface-bg);outline:none;font-family:inherit;" />
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Admin Notes -->
              <div style="margin-bottom:16px;">
                <div style="font-size:10px;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:6px;">Admin Notes</div>
                <textarea id="notes-${c.id}" 
                  style="width:100%;border:1.5px solid var(--border-color);border-radius:8px;padding:10px;font-size:13px;color:var(--text-main);background:var(--surface-bg);font-family:inherit;resize:vertical;min-height:60px;outline:none;"
                  placeholder="Internal notes about this campaign...">${c.adminNotes || ''}</textarea>
              </div>

              <!-- Action Buttons -->
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button onclick="window.adminUpdateCampaign('${c.id}', 'approved')"
                  style="background:rgba(16,185,129,0.1);color:#059669;border:1.5px solid #059669;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s;">
                  ✅ Approve
                </button>
                <button onclick="window.adminUpdateCampaign('${c.id}', 'running')"
                  style="background:rgba(59,130,246,0.1);color:#2563EB;border:1.5px solid #2563EB;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s;">
                  ▶ Mark Running
                </button>
                <button onclick="window.adminUpdateCampaign('${c.id}', 'completed')"
                  style="background:rgba(107,114,128,0.1);color:#6B7280;border:1.5px solid #6B7280;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s;">
                  ✔ Completed
                </button>
                <button onclick="window.adminUpdateCampaign('${c.id}', 'rejected')"
                  style="background:rgba(220,31,48,0.08);color:#DC1F30;border:1.5px solid #DC1F30;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s;">
                  ✖ Reject
                </button>
                <button onclick="window.adminSaveAnalytics('${c.id}')"
                  style="margin-left:auto;background:#DC1F30;color:#fff;border:none;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s;">
                  💾 Save Analytics
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  window.adminUpdateCampaign = async function(campaignId, adminStatus) {
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const notes = document.getElementById(`notes-${campaignId}`)?.value || '';

      const res = await fetch(`/api/campaigns/admin/${campaignId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ adminStatus, adminNotes: notes })
      });
      const data = await res.json();

      if (data.ok) {
        showToast(`Campaign status updated to "${adminStatus}"`, 'success');
        window.loadAdminCampaigns();
      } else {
        showToast('Update failed: ' + (data.message || 'Unknown error'), 'danger');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
    }
  };

  window.adminSaveAnalytics = async function(campaignId) {
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;

      const getVal = (key) => {
        const el = document.getElementById(`anlyt-${campaignId}-${key}`);
        return el ? parseInt(el.value, 10) || 0 : 0;
      };

      const payload = {
        analyticsReach: getVal('analyticsReach'),
        analyticsImpressions: getVal('analyticsImpressions'),
        analyticsClicks: getVal('analyticsClicks'),
        analyticsLeads: getVal('analyticsLeads'),
        analyticsWhatsapp: getVal('analyticsWhatsapp'),
        adminNotes: document.getElementById(`notes-${campaignId}`)?.value || ''
      };

      const res = await fetch(`/api/campaigns/admin/${campaignId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.ok) {
        showToast('Analytics updated successfully! ✅', 'success');
      } else {
        showToast('Save failed: ' + (data.message || 'Error'), 'danger');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
    }
  };

  // ── Grow Business Pricing (editable price catalog & dynamic analytics for Grow Business) ──

  const GROW_PACKAGE_LABELS = {
    whatsapp_leads: 'Get WhatsApp Enquiries',
    more_leads: 'Get More Leads',
    website_sales: 'Increase Website Sales',
  };

  const GROW_COUNTRY_SYMBOLS = {
    IN: '₹',
    AE: 'AED ',
    GB: '£',
    US: '$',
    CA: 'CA$',
    AU: 'A$'
  };

  const GROW_COUNTRY_NAMES = {
    IN: 'India',
    AE: 'UAE',
    GB: 'UK',
    US: 'USA',
    CA: 'Canada',
    AU: 'Australia'
  };

  const GROW_COUNTRY_FLAGS = {
    IN: '🇮🇳',
    AE: '🇦🇪',
    GB: '🇬🇧',
    US: '🇺🇸',
    CA: '🇨🇦',
    AU: '🇦🇺'
  };

  async function renderGrowPricing(store) {
    let activeCountryCode = (window.WedEazzyCountryScope && window.WedEazzyCountryScope !== 'all') 
      ? window.WedEazzyCountryScope.toUpperCase() 
      : 'all';

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper" style="animation: fadeIn 0.3s ease-in-out; max-width: 1400px; margin: 0 auto; padding: 12px 16px;">
        
        <!-- Locator Breadcrumb -->
        <div class="locator-breadcrumb" style="margin-bottom: 16px; font-size: 0.82rem; font-weight: 700; color: var(--text-sub);">
          <a href="#" style="color: var(--text-sub); text-decoration: none;">Wedeazzy Admin</a> 
          <i class="fa-solid fa-angle-right" style="font-size: 0.7rem; margin: 0 6px;"></i> 
          <span style="color: var(--text-main);">Grow Business Pricing & Analytics</span>
        </div>

        <!-- Header Welcome Banner -->
        <div class="portal-welcome-banner" style="background: linear-gradient(135deg, rgba(225, 29, 72, 0.09) 0%, rgba(147, 51, 234, 0.07) 100%); border: 1px solid rgba(225, 29, 72, 0.2); padding: 22px 26px; border-radius: 20px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.04);">
          <div style="flex: 1; min-width: 280px;">
            <h2 style="font-size: 1.35rem; font-weight: 800; color: var(--text-main); margin: 0 0 6px 0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <span style="background: linear-gradient(135deg, #e11d48, #9333ea); color: white; width: 38px; height: 38px; border-radius: 12px; font-size: 1rem; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(225, 29, 72, 0.3);"><i class="fa-solid fa-chart-line"></i></span>
              Grow Business Pricing & Performance Analytics
            </h2>
            <p style="color: var(--text-sub); font-size: 0.88rem; margin: 0; line-height: 1.5; max-width: 780px;">
              Manage Grow Business package prices per country and track real-time revenue, top purchasing countries, vendor categories, cities, and popular plans. Price updates sync instantly with vendor checkout.
            </p>
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <button class="btn-premium btn-premium-rose" id="btnSaveGrowPricing" onclick="window.saveGrowPricing()" style="padding: 12px 24px; font-weight: 800; border-radius: 14px; background: linear-gradient(135deg, #e11d48, #be123c); color: white; border: none; font-size: 0.9rem; cursor: pointer; box-shadow: 0 6px 20px rgba(225, 29, 72, 0.35); transition: all 0.2s;">
              <i class="fa-solid fa-floppy-disk" style="margin-right: 8px;"></i> Save All Changes
            </button>
          </div>
        </div>

        <!-- Country Filter Bar & Quick Pills -->
        <div style="background: var(--surface-bg); padding: 20px 24px; border-radius: 18px; border: 1px solid var(--border-color); margin-bottom: 28px; box-shadow: 0 4px 20px rgba(0,0,0,0.03);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div style="width: 42px; height: 42px; border-radius: 14px; background: rgba(59, 130, 246, 0.12); color: #2563eb; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 800;">
                🌍
              </div>
              <div>
                <h4 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: var(--text-main);">Country Filter & Scope</h4>
                <div style="font-size: 0.8rem; color: var(--text-sub); margin-top: 2px;">Filter metrics & edit pricing for a specific country or view global summary.</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-sub);">Select Country:</label>
              <select id="growPricingCountryScopeSelect" style="background: var(--surface-subtle); color: var(--text-main); border: 1.5px solid var(--border-color); font-weight: 800; font-size: 0.9rem; padding: 10px 18px; border-radius: 12px; cursor: pointer; outline: none; transition: all 0.2s;"
                onchange="window.loadGrowPricingAndStats(this.value)">
                <option value="all" ${activeCountryCode === 'all' ? 'selected' : ''}>🌐 All Countries (Global Overview)</option>
                <option value="IN" ${activeCountryCode === 'IN' ? 'selected' : ''}>🇮🇳 India (INR ₹)</option>
                <option value="AE" ${activeCountryCode === 'AE' ? 'selected' : ''}>🇦🇪 UAE (AED)</option>
                <option value="GB" ${activeCountryCode === 'GB' ? 'selected' : ''}>🇬🇧 UK (GBP £)</option>
                <option value="US" ${activeCountryCode === 'US' ? 'selected' : ''}>🇺🇸 USA (USD $)</option>
                <option value="CA" ${activeCountryCode === 'CA' ? 'selected' : ''}>🇨🇦 Canada (CAD CA$)</option>
                <option value="AU" ${activeCountryCode === 'AU' ? 'selected' : ''}>🇦🇺 Australia (AUD A$)</option>
              </select>
            </div>
          </div>

          <!-- Quick Click Filter Pills -->
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; pt: 10px; border-top: 1px dashed var(--border-subtle); padding-top: 12px;">
            <span style="font-size: 0.76rem; font-weight: 800; color: var(--text-sub); text-transform: uppercase; margin-right: 4px;">Quick Switch:</span>
            <button onclick="window.loadGrowPricingAndStats('all')" class="grow-scope-pill ${activeCountryCode === 'all' ? 'active' : ''}" style="background: ${activeCountryCode === 'all' ? '#e11d48' : 'var(--surface-subtle)'}; color: ${activeCountryCode === 'all' ? '#ffffff' : 'var(--text-main)'}; border: 1px solid var(--border-color); padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">
              🌐 Global
            </button>
            <button onclick="window.loadGrowPricingAndStats('IN')" class="grow-scope-pill ${activeCountryCode === 'IN' ? 'active' : ''}" style="background: ${activeCountryCode === 'IN' ? '#e11d48' : 'var(--surface-subtle)'}; color: ${activeCountryCode === 'IN' ? '#ffffff' : 'var(--text-main)'}; border: 1px solid var(--border-color); padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">
              🇮🇳 India
            </button>
            <button onclick="window.loadGrowPricingAndStats('AE')" class="grow-scope-pill ${activeCountryCode === 'AE' ? 'active' : ''}" style="background: ${activeCountryCode === 'AE' ? '#e11d48' : 'var(--surface-subtle)'}; color: ${activeCountryCode === 'AE' ? '#ffffff' : 'var(--text-main)'}; border: 1px solid var(--border-color); padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">
              🇦🇪 UAE
            </button>
            <button onclick="window.loadGrowPricingAndStats('GB')" class="grow-scope-pill ${activeCountryCode === 'GB' ? 'active' : ''}" style="background: ${activeCountryCode === 'GB' ? '#e11d48' : 'var(--surface-subtle)'}; color: ${activeCountryCode === 'GB' ? '#ffffff' : 'var(--text-main)'}; border: 1px solid var(--border-color); padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">
              🇬🇧 UK
            </button>
            <button onclick="window.loadGrowPricingAndStats('US')" class="grow-scope-pill ${activeCountryCode === 'US' ? 'active' : ''}" style="background: ${activeCountryCode === 'US' ? '#e11d48' : 'var(--surface-subtle)'}; color: ${activeCountryCode === 'US' ? '#ffffff' : 'var(--text-main)'}; border: 1px solid var(--border-color); padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">
              🇺🇸 USA
            </button>
            <button onclick="window.loadGrowPricingAndStats('CA')" class="grow-scope-pill ${activeCountryCode === 'CA' ? 'active' : ''}" style="background: ${activeCountryCode === 'CA' ? '#e11d48' : 'var(--surface-subtle)'}; color: ${activeCountryCode === 'CA' ? '#ffffff' : 'var(--text-main)'}; border: 1px solid var(--border-color); padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">
              🇨🇦 Canada
            </button>
            <button onclick="window.loadGrowPricingAndStats('AU')" class="grow-scope-pill ${activeCountryCode === 'AU' ? 'active' : ''}" style="background: ${activeCountryCode === 'AU' ? '#e11d48' : 'var(--surface-subtle)'}; color: ${activeCountryCode === 'AU' ? '#ffffff' : 'var(--text-main)'}; border: 1px solid var(--border-color); padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s;">
              🇦🇺 Australia
            </button>
          </div>
        </div>

        <!-- Dynamic 5 KPI Stats Container -->
        <div id="growPricingStatsContainer" style="margin-bottom: 36px;">
          <div style="text-align:center;padding:40px;color:var(--text-muted);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-bottom:12px;display:block;color:#e11d48;"></i>
            Loading performance analytics…
          </div>
        </div>

        <!-- Section Title for Pricing Editor -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 8px;">
              🏷️ Package Pricing Management
            </h3>
            <div style="font-size: 0.84rem; color: var(--text-sub); margin-top: 4px;" id="pricingScopeSubtitle">
              Loading package catalog details…
            </div>
          </div>
        </div>

        <!-- Price Catalog Cards Container -->
        <div id="growPricingContainer" style="display:flex; flex-direction:column; gap:24px; margin-bottom: 40px;">
          <div style="text-align:center;padding:40px;color:var(--text-muted);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-bottom:12px;display:block;color:#e11d48;"></i>
            Loading package pricing catalog…
          </div>
        </div>

        <!-- Recent Grow Business Orders Table -->
        <div class="panel-card" style="border-radius: 20px; border: 1px solid var(--border-color); padding: 26px; margin-bottom: 36px; box-shadow: 0 4px 20px rgba(0,0,0,0.02);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
            <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 10px;">
              <span style="background: rgba(225, 29, 72, 0.1); color: #e11d48; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 0.95rem;"><i class="fa-solid fa-receipt"></i></span>
              Recent Grow Business Plan Orders
            </h3>
            <span style="font-size: 0.8rem; font-weight: 800; background: var(--surface-subtle); color: var(--text-main); padding: 6px 14px; border-radius: 10px; border: 1px solid var(--border-color);" id="orderCountBadge">
              0 Orders
            </span>
          </div>
          <div class="table-viewport" id="growOrdersTableContainer" style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
            <div style="text-align:center;padding:28px;color:var(--text-muted);">Loading recent orders...</div>
          </div>
        </div>

      </div>
    `;

    window.loadGrowPricingAndStats(activeCountryCode);
  }

  window.loadGrowPricingAndStats = async function(cCode = 'all') {
    // Update select element if present
    const scopeSelect = document.getElementById('growPricingCountryScopeSelect');
    if (scopeSelect && scopeSelect.value !== cCode) scopeSelect.value = cCode;

    // Update pill highlight styling
    document.querySelectorAll('.grow-scope-pill').forEach(pill => {
      const isMatch = (pill.getAttribute('onclick') || '').includes(`'${cCode}'`);
      if (isMatch) {
        pill.style.background = '#e11d48';
        pill.style.color = '#ffffff';
      } else {
        pill.style.background = 'var(--surface-subtle)';
        pill.style.color = 'var(--text-main)';
      }
    });

    const statsContainer = document.getElementById('growPricingStatsContainer');
    const pricingContainer = document.getElementById('growPricingContainer');
    const ordersContainer = document.getElementById('growOrdersTableContainer');
    const scopeSubtitle = document.getElementById('pricingScopeSubtitle');

    const editCountryCode = (cCode === 'all') ? 'IN' : cCode;
    const editSymbol = GROW_COUNTRY_SYMBOLS[editCountryCode] || '₹';
    const editCountryName = GROW_COUNTRY_NAMES[editCountryCode] || editCountryCode;
    const editFlag = GROW_COUNTRY_FLAGS[editCountryCode] || '🌐';

    if (scopeSubtitle) {
      scopeSubtitle.innerHTML = `Editing tier prices for <strong>${editFlag} ${editCountryName} (${editSymbol})</strong>. Vendors in ${editCountryName} will see these updated prices during Grow Business checkout.`;
    }

    if (statsContainer) {
      statsContainer.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--text-muted);">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-bottom:12px;display:block;color:#e11d48;"></i>
          Updating performance metrics for ${cCode === 'all' ? 'Global Overview' : editCountryName}...
        </div>`;
    }
    if (pricingContainer) {
      pricingContainer.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--text-muted);">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-bottom:12px;display:block;color:#e11d48;"></i>
          Loading package prices for ${editCountryName}...
        </div>`;
    }

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const headers = { 'Authorization': token ? `Bearer ${token}` : '' };

      // Fetch stats & pricing in parallel
      const [statsRes, pricingRes] = await Promise.all([
        fetch(`/api/admin/grow-campaigns-stats?countryCode=${cCode}`, { headers }),
        fetch(`/api/public/grow-campaigns-pricing?countryCode=${editCountryCode}`, { headers })
      ]);

      const statsData = await statsRes.json();
      const pricingData = await pricingRes.json();

      // ── 1. Render 5 Executive KPI Stats ──
      if (statsContainer && statsData.ok) {
        const stats = statsData.stats || {};
        const revSymbol = (cCode !== 'all' && GROW_COUNTRY_SYMBOLS[cCode]) ? GROW_COUNTRY_SYMBOLS[cCode] : '₹';
        const formattedRev = `${revSymbol}${Number(stats.totalRevenue || 0).toLocaleString('en-IN')}`;

        statsContainer.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px;">
            
            <!-- KPI 1: Total Revenue -->
            <div style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 18px; padding: 22px; box-shadow: 0 4px 18px rgba(0,0,0,0.03); position: relative; overflow: hidden; transition: transform 0.2s;" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform='none'">
              <div style="position: absolute; right: -8px; top: -8px; width: 68px; height: 68px; background: rgba(16, 185, 129, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem;">💰</div>
              <div style="font-size: 0.76rem; font-weight: 800; color: var(--text-sub); text-transform: uppercase; letter-spacing: 0.5px;">Grow Revenue</div>
              <div style="font-size: 1.65rem; font-weight: 900; color: #10b981; margin: 8px 0 4px 0;">${formattedRev}</div>
              <div style="font-size: 0.76rem; color: var(--text-sub); font-weight: 600;">
                <span style="background: rgba(16, 185, 129, 0.15); color: #059669; padding: 2px 8px; border-radius: 6px; font-weight: 800;">${stats.totalPurchases || 0}</span> Paid Campaigns
              </div>
            </div>

            <!-- KPI 2: Top Country -->
            <div style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 18px; padding: 22px; box-shadow: 0 4px 18px rgba(0,0,0,0.03); position: relative; overflow: hidden; transition: transform 0.2s;" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform='none'">
              <div style="position: absolute; right: -8px; top: -8px; width: 68px; height: 68px; background: rgba(59, 130, 246, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem;">🌍</div>
              <div style="font-size: 0.76rem; font-weight: 800; color: var(--text-sub); text-transform: uppercase; letter-spacing: 0.5px;">Top Country</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: var(--text-main); margin: 8px 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${stats.topCountry?.name || 'India'}">
                ${stats.topCountry?.name || 'India'}
              </div>
              <div style="font-size: 0.76rem; color: var(--text-sub); font-weight: 600;">
                <span style="background: rgba(59, 130, 246, 0.15); color: #2563eb; padding: 2px 8px; border-radius: 6px; font-weight: 800;">${stats.topCountry?.count || 0}</span> Orders (${revSymbol}${Number(stats.topCountry?.revenue || 0).toLocaleString('en-IN')})
              </div>
            </div>

            <!-- KPI 3: Top Category -->
            <div style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 18px; padding: 22px; box-shadow: 0 4px 18px rgba(0,0,0,0.03); position: relative; overflow: hidden; transition: transform 0.2s;" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform='none'">
              <div style="position: absolute; right: -8px; top: -8px; width: 68px; height: 68px; background: rgba(236, 72, 153, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem;">🏷️</div>
              <div style="font-size: 0.76rem; font-weight: 800; color: var(--text-sub); text-transform: uppercase; letter-spacing: 0.5px;">Top Category</div>
              <div style="font-size: 1.2rem; font-weight: 900; color: var(--text-main); margin: 8px 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${stats.topCategory?.name || 'Wedding Photographers'}">
                ${stats.topCategory?.name || 'Wedding Photographers'}
              </div>
              <div style="font-size: 0.76rem; color: var(--text-sub); font-weight: 600;">
                <span style="background: rgba(236, 72, 153, 0.15); color: #db2777; padding: 2px 8px; border-radius: 6px; font-weight: 800;">${stats.topCategory?.count || 0}</span> Orders
              </div>
            </div>

            <!-- KPI 4: Top City -->
            <div style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 18px; padding: 22px; box-shadow: 0 4px 18px rgba(0,0,0,0.03); position: relative; overflow: hidden; transition: transform 0.2s;" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform='none'">
              <div style="position: absolute; right: -8px; top: -8px; width: 68px; height: 68px; background: rgba(147, 51, 234, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem;">🏙️</div>
              <div style="font-size: 0.76rem; font-weight: 800; color: var(--text-sub); text-transform: uppercase; letter-spacing: 0.5px;">Top City</div>
              <div style="font-size: 1.25rem; font-weight: 900; color: var(--text-main); margin: 8px 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${stats.topCity?.name || 'Ahmedabad'}">
                ${stats.topCity?.name || 'Ahmedabad'}
              </div>
              <div style="font-size: 0.76rem; color: var(--text-sub); font-weight: 600;">
                <span style="background: rgba(147, 51, 234, 0.15); color: #7c3aed; padding: 2px 8px; border-radius: 6px; font-weight: 800;">${stats.topCity?.count || 0}</span> Orders
              </div>
            </div>

            <!-- KPI 5: Most Purchased Plan -->
            <div style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 18px; padding: 22px; box-shadow: 0 4px 18px rgba(0,0,0,0.03); position: relative; overflow: hidden; transition: transform 0.2s;" onmouseenter="this.style.transform='translateY(-2px)'" onmouseleave="this.style.transform='none'">
              <div style="position: absolute; right: -8px; top: -8px; width: 68px; height: 68px; background: rgba(245, 158, 11, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem;">🚀</div>
              <div style="font-size: 0.76rem; font-weight: 800; color: var(--text-sub); text-transform: uppercase; letter-spacing: 0.5px;">Most Popular Plan</div>
              <div style="font-size: 1.12rem; font-weight: 900; color: var(--text-main); margin: 8px 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${stats.topPlan?.name || 'Get More Leads (30 Days)'}">
                ${stats.topPlan?.name || 'Get More Leads (30 Days)'}
              </div>
              <div style="font-size: 0.76rem; color: var(--text-sub); font-weight: 600;">
                <span style="background: rgba(245, 158, 11, 0.15); color: #d97706; padding: 2px 8px; border-radius: 6px; font-weight: 800;">${stats.topPlan?.count || 0}</span> Purchases
              </div>
            </div>

          </div>
        `;

        // Render Recent Orders Table
        const recent = statsData.recentPurchases || [];
        const orderBadge = document.getElementById('orderCountBadge');
        if (orderBadge) orderBadge.textContent = `${recent.length} Recent Orders`;

        if (ordersContainer) {
          if (recent.length === 0) {
            ordersContainer.innerHTML = `
              <div style="text-align: center; padding: 44px 20px; background: var(--surface-subtle); border-radius: 16px; border: 1px dashed var(--border-color);">
                <div style="width: 54px; height: 54px; border-radius: 16px; background: rgba(225, 29, 72, 0.08); color: #e11d48; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; margin: 0 auto 12px auto;">
                  <i class="fa-solid fa-receipt"></i>
                </div>
                <h4 style="margin: 0 0 6px 0; font-size: 1.05rem; font-weight: 800; color: var(--text-main);">No Grow Business Plan Purchases Yet</h4>
                <p style="margin: 0 auto; font-size: 0.86rem; color: var(--text-sub); max-width: 520px; line-height: 1.5;">
                  Your package pricing is set and active! When vendors upgrade their business from their Grow Business dashboard, live orders & payment transactions will automatically appear here.
                </p>
              </div>
            `;
          } else {
            ordersContainer.innerHTML = `
              <table class="grid-table" style="width: 100%; min-width: 650px;">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th>Package Plan</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${recent.map(item => `
                    <tr>
                      <td><strong>${item.vendorName}</strong></td>
                      <td><span style="font-size: 0.8rem; background: var(--surface-subtle); padding: 4px 10px; border-radius: 8px; font-weight: 700;">${item.category}</span></td>
                      <td>${item.city}, ${item.country}</td>
                      <td><strong>${GROW_PACKAGE_LABELS[item.packageType] || item.packageType}</strong> (${item.planDays ? item.planDays + ' Days' : 'Custom'})</td>
                      <td><strong style="color: #10b981; font-size: 0.95rem;">${editSymbol}${Number(item.totalAmount).toLocaleString('en-IN')}</strong></td>
                      <td>
                        <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; padding: 4px 10px; border-radius: 8px; background: ${item.paymentStatus === 'paid' || item.adminStatus === 'running' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; color: ${item.paymentStatus === 'paid' || item.adminStatus === 'running' ? '#059669' : '#d97706'};">
                          ${item.paymentStatus === 'paid' ? 'PAID' : item.adminStatus}
                        </span>
                      </td>
                      <td style="font-size: 0.8rem; color: var(--text-sub);">${new Date(item.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `;
          }
        }
      }

      // ── 2. Render Package Pricing Editor ──
      if (pricingContainer && pricingData.ok) {
        const pricing = pricingData.pricing || {};
        const pkgKeys = Object.keys(pricing).filter(k => k !== 'countries');

        pricingContainer.innerHTML = pkgKeys.map(key => {
          const pkg = pricing[key];
          if (!pkg || !Array.isArray(pkg.plans)) return '';
          return `
            <div class="panel-card" style="border-radius: 20px; border: 1px solid var(--border-color); padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.02);">
              <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 16px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 10px;">
                  <span style="color: #e11d48; font-size: 1.2rem;">💎</span> ${GROW_PACKAGE_LABELS[key] || key}
                </h3>
                <span style="font-size: 0.8rem; font-weight: 800; background: rgba(59, 130, 246, 0.1); color: #2563eb; padding: 5px 12px; border-radius: 10px; border: 1px solid rgba(59, 130, 246, 0.2);">
                  ${editFlag} ${editCountryName} (${editSymbol})
                </span>
              </div>
              <div class="table-viewport" style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                <table class="grid-table" style="width: 100%; min-width: 600px;">
                  <thead>
                    <tr>
                      <th style="width: 32%;">Plan Duration / Tier</th>
                      <th style="width: 34%;">Selling Price (${editSymbol})</th>
                      <th style="width: 34%;">Original Strikethrough Price (${editSymbol}, Optional)</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${pkg.plans.map((tier, idx) => {
                      const priceVal = Number(tier.price) || 0;
                      const origVal = Number(tier.original) || 0;
                      const hasSavings = origVal > priceVal;
                      const savingsAmt = hasSavings ? origVal - priceVal : 0;
                      const pctOff = hasSavings && origVal > 0 ? Math.round((savingsAmt / origVal) * 100) : 0;

                      return `
                        <tr>
                          <td>
                            <div style="font-weight: 800; color: var(--text-main); font-size: 0.95rem; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                              ${tier.label}
                              ${tier.recommended ? ' <span style="background: rgba(16, 185, 129, 0.15); color: #059669; font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; font-weight: 800;">★ RECOMMENDED</span>' : ''}
                              ${tier.custom ? ' <span style="background: rgba(147, 51, 234, 0.15); color: #7c3aed; font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; font-weight: 800;">CUSTOM BUILDER FLOOR</span>' : ''}
                            </div>
                          </td>
                          <td>
                            <div style="display: flex; align-items: center; gap: 8px;">
                              <span style="font-weight: 800; color: var(--text-sub); font-size: 0.95rem;">${editSymbol}</span>
                              <input type="number" class="premium-input grow-price-input" data-pkg="${key}" data-idx="${idx}" data-field="price" value="${tier.price}" style="max-width:160px; font-weight: 800; font-size: 0.95rem; padding: 9px 14px; border-radius: 10px;" min="0" 
                                oninput="window.updateSavingsPreview(this)" />
                            </div>
                          </td>
                          <td>
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                              <span style="font-weight: 800; color: var(--text-sub); font-size: 0.95rem;">${editSymbol}</span>
                              <input type="number" class="premium-input grow-price-input" data-pkg="${key}" data-idx="${idx}" data-field="original" value="${tier.original || ''}" placeholder="None" style="max-width:160px; font-weight: 600; font-size: 0.95rem; padding: 9px 14px; border-radius: 10px;" min="0" 
                                oninput="window.updateSavingsPreview(this)" />
                              <span class="savings-preview-chip" id="savingsChip_${key}_${idx}" style="font-size: 0.75rem; font-weight: 800; background: rgba(16, 185, 129, 0.15); color: #059669; padding: 4px 8px; border-radius: 6px; display: ${hasSavings ? 'inline-block' : 'none'};">
                                Save ${editSymbol}${savingsAmt.toLocaleString('en-IN')} (${pctOff}% OFF)
                              </span>
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
        }).join('');
      }
    } catch (e) {
      if (statsContainer) statsContainer.innerHTML = `<div style="text-align:center;color:#ef4444;padding:24px;">Failed to load stats: ${e.message}</div>`;
      if (pricingContainer) pricingContainer.innerHTML = `<div style="text-align:center;color:#ef4444;padding:24px;">Failed to load pricing: ${e.message}</div>`;
    }
  };

  window.updateSavingsPreview = function(inputEl) {
    const row = inputEl.closest('tr');
    if (!row) return;
    const pkg = inputEl.dataset.pkg;
    const idx = inputEl.dataset.idx;
    const priceInput = row.querySelector(`input[data-field="price"]`);
    const origInput = row.querySelector(`input[data-field="original"]`);
    const chip = document.getElementById(`savingsChip_${pkg}_${idx}`);
    if (!priceInput || !origInput || !chip) return;

    const priceVal = Number(priceInput.value) || 0;
    const origVal = Number(origInput.value) || 0;
    const scopeSelect = document.getElementById('growPricingCountryScopeSelect');
    let countryCode = scopeSelect?.value || 'IN';
    if (countryCode === 'all') countryCode = 'IN';
    const sym = GROW_COUNTRY_SYMBOLS[countryCode] || '₹';

    if (origVal > priceVal && priceVal > 0) {
      const diff = origVal - priceVal;
      const pct = Math.round((diff / origVal) * 100);
      chip.textContent = `Save ${sym}${diff.toLocaleString('en-IN')} (${pct}% OFF)`;
      chip.style.display = 'inline-block';
    } else {
      chip.style.display = 'none';
    }
  };


  window.saveGrowPricing = async function() {
    const scopeSelect = document.getElementById('growPricingCountryScopeSelect');
    let countryCode = scopeSelect?.value || 'IN';
    if (countryCode === 'all') countryCode = 'IN';

    const inputs = document.querySelectorAll('.grow-price-input');
    const pricing = {};
    inputs.forEach(input => {
      const pkg = input.dataset.pkg;
      const idx = parseInt(input.dataset.idx, 10);
      const field = input.dataset.field;
      if (!pricing[pkg]) pricing[pkg] = { plans: [] };
      if (!pricing[pkg].plans[idx]) pricing[pkg].plans[idx] = {};
      pricing[pkg].plans[idx][field] = input.value;
    });

    const btn = document.getElementById('btnSaveGrowPricing');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/grow-campaigns-pricing', {
        method: 'PUT',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pricing, countryCode })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Grow Business pricing updated for ${GROW_COUNTRY_NAMES[countryCode] || countryCode}!`, 'success');
        window.loadGrowPricingAndStats(scopeSelect?.value || countryCode);
      } else {
        showToast('Save failed: ' + (data.message || data.error || 'Error'), 'danger');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save All Changes'; }
    }
  };


  // -------------------------------------------------------------
  // EMAIL MARKETING: EMAIL TEMPLATES MANAGEMENT TAB ENGINE
  // -------------------------------------------------------------

  function renderEmailTemplates(store) {
    const portal = el.portalBody || document.getElementById('portalBody');
    if (!portal) return;

    portal.innerHTML = `
      <div class="page-container" style="padding: 24px; max-width: 1300px; margin: 0 auto;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
          <div>
            <h1 style="font-size: 1.6rem; font-weight: 800; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 10px;">
              <i class="fa-solid fa-file-code" style="color: var(--brand-rose);"></i>
              Email Templates
            </h1>
            <p style="color: var(--text-sub); font-size: 0.85rem; margin-top: 4px;">
              Create and manage reusable email marketing templates with dynamic vendor variables.
            </p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn-premium btn-premium-rose" onclick="window.openEmailTemplateModal()">
              <i class="fa-solid fa-plus"></i> Create Template
            </button>
          </div>
        </div>

        <!-- Filters Bar -->
        <div class="panel-card" style="padding: 16px; margin-bottom: 24px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; align-items: center;">
            <div>
              <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">Search Templates</label>
              <input type="text" id="et_search_input" class="premium-input" placeholder="Search by name, subject..." oninput="window.handleEmailTemplatesSearchInput()" />
            </div>

            <div>
              <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">Category Filter</label>
              <select id="et_category_select" class="premium-input" onchange="window.loadEmailTemplatesList()">
                <option value="all">All Categories</option>
                <option value="Profile Completion">Profile Completion</option>
                <option value="Subscription">Subscription</option>
                <option value="Grow Business">Grow Business</option>
                <option value="General">General</option>
              </select>
            </div>

            <div>
              <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">Status Filter</label>
              <select id="et_status_select" class="premium-input" onchange="window.loadEmailTemplatesList()">
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>

            <div style="display: flex; align-items: flex-end; height: 100%;">
              <button class="btn-premium" style="width: 100%; justify-content: center;" onclick="window.loadEmailTemplatesList()">
                <i class="fa-solid fa-arrows-rotate"></i> Refresh List
              </button>
            </div>
          </div>
        </div>

        <!-- Templates Table Panel -->
        <div class="panel-card" style="padding: 0; overflow: hidden;">
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <h3 style="font-size: 1rem; font-weight: 800; color: var(--text-main); margin: 0;">Template Directory</h3>
            <span id="et_template_count_badge" class="interactive-pill-badge" style="font-size: 0.75rem;">Loading…</span>
          </div>

          <div style="overflow-x: auto;">
            <table class="premium-table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: var(--surface-bg-subtle); text-align: left; font-size: 0.75rem; color: var(--text-muted);">
                  <th style="padding: 12px 16px;">Template Name</th>
                  <th style="padding: 12px 16px;">Category</th>
                  <th style="padding: 12px 16px;">Subject Line</th>
                  <th style="padding: 12px 16px;">Status</th>
                  <th style="padding: 12px 16px;">Last Updated</th>
                  <th style="padding: 12px 16px; text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody id="tbodyEmailTemplates">
                <tr>
                  <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.5rem; color: var(--brand-rose); margin-bottom: 10px;"></i>
                    <div>Loading email templates database...</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;

    window.loadEmailTemplatesList();
  }

  window.handleEmailTemplatesSearchInput = function() {
    clearTimeout(state._emailTemplatesSearchDebounce);
    state._emailTemplatesSearchDebounce = setTimeout(() => {
      window.loadEmailTemplatesList();
    }, 250);
  };

  window.loadEmailTemplatesList = async function() {
    const tbody = document.getElementById('tbodyEmailTemplates');
    const badge = document.getElementById('et_template_count_badge');
    if (!tbody) return;

    const search = document.getElementById('et_search_input')?.value || '';
    const category = document.getElementById('et_category_select')?.value || 'all';
    const status = document.getElementById('et_status_select')?.value || 'all';

    try {
      const auth = window.WedEazzyAuth;
      const apiFetch = auth && auth.apiFetch ? auth.apiFetch.bind(auth) : fetch;
      const token = auth ? auth.getToken() : null;
      const query = new URLSearchParams({ search, category, status });
      const res = await apiFetch(`/api/admin/email-templates?${query}`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();

      if (data.ok && data.templates) {
        if (badge) badge.textContent = `${data.templates.length} templates`;
        if (data.templates.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 36px; color: var(--text-muted);">No email templates found. Click "+ Create Template" to create one.</td></tr>';
          return;
        }

        window._emailTemplatesStore = new Map(data.templates.map(t => [t.id, t]));

        tbody.innerHTML = data.templates.map(t => {
          const isActive = t.status === 'active';
          const catColors = {
            'Profile Completion': { bg: 'rgba(234, 179, 8, 0.1)', fg: '#d97706' },
            'Subscription': { bg: 'rgba(139, 92, 246, 0.1)', fg: '#8b5cf6' },
            'Grow Business': { bg: 'rgba(220, 31, 48, 0.1)', fg: '#DC1F30' },
            'General': { bg: 'rgba(107, 114, 128, 0.1)', fg: '#4b5563' }
          };
          const catStyle = catColors[t.category] || catColors.General;
          const updatedDate = new Date(t.updatedAt || t.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });

          return `
            <tr style="border-bottom: 1px solid var(--border-subtle);">
              <td style="padding: 14px 16px;">
                <div style="font-weight: 700; color: var(--text-main); font-size: 0.88rem;">${escHtml(t.name)}</div>
                ${t.isSystem ? '<span style="font-size: 0.65rem; color: #0284c7; font-weight: 700;">SYSTEM TEMPLATE</span>' : ''}
              </td>
              <td style="padding: 14px 16px;">
                <span style="padding: 3px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 800; background: ${catStyle.bg}; color: ${catStyle.fg};">
                  ${escHtml(t.category || 'General')}
                </span>
              </td>
              <td style="padding: 14px 16px;">
                <div style="font-size: 0.82rem; color: var(--text-main); font-weight: 600; max-width: 320px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escHtml(t.subject)}</div>
                <div style="font-size: 0.7rem; color: var(--text-muted); max-width: 320px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escHtml(t.previewText || 'No preheader')}</div>
              </td>
              <td style="padding: 14px 16px;">
                <span style="padding: 3px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 800; background: ${isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color: ${isActive ? '#10b981' : '#ef4444'};">
                  ${isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </td>
              <td style="padding: 14px 16px; font-size: 0.78rem; color: var(--text-muted);">${updatedDate}</td>
              <td style="padding: 14px 16px; text-align: right;">
                <div style="display: flex; justify-content: flex-end; gap: 6px;">
                  <button class="btn-premium btn-premium-rose" style="font-size: 0.72rem; padding: 4px 8px; background: #8b5cf6;" onclick="window.openDirectScheduleModal('${t.id}')" title="Schedule Template Broadcast"><i class="fa-solid fa-clock"></i> Schedule & Send</button>
                  <button class="btn-premium" style="font-size: 0.72rem; padding: 4px 8px;" onclick="window.previewEmailTemplate('${t.id}')" title="Preview Template"><i class="fa-solid fa-eye"></i> Preview</button>
                  <button class="btn-premium" style="font-size: 0.72rem; padding: 4px 8px;" onclick="window.openEmailTemplateModal('${t.id}')" title="Edit Template"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
                  <button class="btn-premium" style="font-size: 0.72rem; padding: 4px 8px;" onclick="window.duplicateEmailTemplateRecord('${t.id}')" title="Duplicate"><i class="fa-solid fa-copy"></i></button>
                  <button class="btn-premium" style="font-size: 0.72rem; padding: 4px 8px; color: ${isActive ? '#f59e0b' : '#10b981'};" onclick="window.toggleEmailTemplateStatus('${t.id}', '${isActive ? 'inactive' : 'active'}')" title="${isActive ? 'Disable' : 'Enable'}">
                    <i class="fa-solid ${isActive ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                  </button>
                  <button class="btn-premium" style="font-size: 0.72rem; padding: 4px 8px; color: #ef4444;" onclick="window.deleteEmailTemplateRecord('${t.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    } catch (e) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 36px; color: var(--brand-rose);">Failed to load email templates. Please try again.</td></tr>';
    }
  };

  window.openDirectScheduleModal = function(templateId) {
    const tpl = window._emailTemplatesStore ? window._emailTemplatesStore.get(templateId) : null;
    if (!tpl) {
      showToast('Template details not found.', 'danger');
      return;
    }

    const defaultDate = new Date(Date.now() + 86400000);
    defaultDate.setHours(10, 0, 0, 0);
    const localIso = new Date(defaultDate.getTime() - (defaultDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);

    const bodyHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="padding: 12px 16px; background: rgba(139, 92, 246, 0.08); border-left: 4px solid #8b5cf6; border-radius: 8px;">
          <h4 style="font-size: 0.95rem; font-weight: 800; color: #8b5cf6; margin: 0;">Schedule Template: ${escHtml(tpl.name)}</h4>
          <p style="font-size: 0.78rem; color: var(--text-sub); margin-top: 4px;">Subject: "${escHtml(tpl.subject)}"</p>
        </div>

        <div class="modal-form-group">
          <label style="font-weight: 700; font-size: 0.8rem; display: block; margin-bottom: 6px;">Target Audience Segment</label>
          <select id="dst_audience_type" class="premium-input">
            <option value="claimed" selected>Registered & Claimed Business Listings (Recommended)</option>
            <option value="vendors">All Registered Vendors</option>
            <option value="couples">All Registered Couples</option>
            <option value="all">All Registered Users & Listings</option>
            <option value="unclaimed">Unclaimed Directory Listings</option>
          </select>
        </div>

        <div class="modal-form-group">
          <label style="font-weight: 700; font-size: 0.8rem; display: block; margin-bottom: 6px;">Schedule Frequency</label>
          <select id="dst_schedule_type" class="premium-input" onchange="window.toggleDirectScheduleTypeFields(this.value)">
            <option value="daily">⏰ Daily (Every Day)</option>
            <option value="weekly">📆 Specific Days of Week (e.g. Mon, Wed, Fri)</option>
            <option value="monthly">🗓️ Specific Date of Month (e.g. 1st of every month)</option>
            <option value="once">📅 Specific Date & Time (One-time run)</option>
          </select>
        </div>

        <!-- ONCE fields -->
        <div id="dst_field_once" class="modal-form-group" style="display: none;">
          <label style="font-weight: 700; font-size: 0.8rem; display: block; margin-bottom: 4px;">Specific Date & Time</label>
          <input type="datetime-local" id="dst_schedule_time_once" class="premium-input" value="${localIso}" />
        </div>

        <!-- TIME OF DAY (for daily/weekly/monthly) -->
        <div id="dst_field_time" class="modal-form-group">
          <label style="font-weight: 700; font-size: 0.8rem; display: block; margin-bottom: 4px;">Time of Day</label>
          <input type="time" id="dst_schedule_time_daily" class="premium-input" value="09:00" />
        </div>

        <!-- WEEKLY DAYS -->
        <div id="dst_field_weekly" class="modal-form-group" style="display: none;">
          <label style="font-weight: 700; font-size: 0.8rem; display: block; margin-bottom: 6px;">Select Days of the Week</label>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(day => `
              <label style="display: inline-flex; align-items: center; gap: 4px; background: var(--surface-subtle); padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.78rem; font-weight: 700; cursor: pointer;">
                <input type="checkbox" name="dst_weekly_days" value="${day}" ${['MON', 'WED', 'FRI'].includes(day) ? 'checked' : ''} /> ${day}
              </label>
            `).join('')}
          </div>
        </div>

        <!-- MONTHLY DAY OF MONTH -->
        <div id="dst_field_monthly" class="modal-form-group" style="display: none;">
          <label style="font-weight: 700; font-size: 0.8rem; display: block; margin-bottom: 4px;">Select Date of Every Month</label>
          <select id="dst_schedule_dom" class="premium-input">
            ${Array.from({ length: 31 }, (_, i) => i + 1).map(d => `
              <option value="${d}" ${d === 1 ? 'selected' : ''}>${d}${d === 1 ? 'st' : (d === 2 ? 'nd' : (d === 3 ? 'rd' : 'th'))} of every month</option>
            `).join('')}
          </select>
        </div>
      </div>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Cancel</button>
      <button class="btn-premium btn-premium-rose" style="background: #8b5cf6;" onclick="window.submitDirectScheduleTemplate('${tpl.id}')">Activate Schedule</button>
    `;

    openModal("Schedule Email Template Broadcast", bodyHTML, footerHTML);
  };

  window.toggleDirectScheduleTypeFields = function(type) {
    const onceBox = document.getElementById('dst_field_once');
    const timeBox = document.getElementById('dst_field_time');
    const weeklyBox = document.getElementById('dst_field_weekly');
    const monthlyBox = document.getElementById('dst_field_monthly');

    if (onceBox) onceBox.style.display = type === 'once' ? 'block' : 'none';
    if (timeBox) timeBox.style.display = type !== 'once' ? 'block' : 'none';
    if (weeklyBox) weeklyBox.style.display = type === 'weekly' ? 'block' : 'none';
    if (monthlyBox) monthlyBox.style.display = type === 'monthly' ? 'block' : 'none';
  };

  window.submitDirectScheduleTemplate = async function(templateId) {
    const tpl = window._emailTemplatesStore ? window._emailTemplatesStore.get(templateId) : null;
    if (!tpl) return;

    const audienceType = document.getElementById('dst_audience_type')?.value || 'claimed';
    const scheduleType = document.getElementById('dst_schedule_type')?.value || 'daily';

    let scheduledAt = null;
    let scheduleTime = null;
    let daysOfWeek = [];
    let dayOfMonth = null;

    if (scheduleType === 'once') {
      const timeVal = document.getElementById('dst_schedule_time_once')?.value;
      if (!timeVal) {
        showToast('Please select a valid date and time!', 'danger');
        return;
      }
      scheduledAt = timeVal;
    } else {
      scheduleTime = document.getElementById('dst_schedule_time_daily')?.value || '09:00';
      if (scheduleType === 'weekly') {
        const checked = document.querySelectorAll('input[name="dst_weekly_days"]:checked');
        daysOfWeek = Array.from(checked).map(c => c.value);
        if (daysOfWeek.length === 0) {
          showToast('Please select at least one day of the week!', 'danger');
          return;
        }
      } else if (scheduleType === 'monthly') {
        dayOfMonth = parseInt(document.getElementById('dst_schedule_dom')?.value || '1', 10);
      }
    }

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/email-campaigns', {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: tpl.name,
          subject: tpl.subject,
          previewText: tpl.previewText || '',
          body: tpl.body,
          audienceRules: { audienceType },
          action: 'schedule',
          scheduledAt,
          scheduleType,
          scheduleTime,
          daysOfWeek,
          dayOfMonth
        })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Activated ${scheduleType} schedule for template "${tpl.name}"!`, 'success');
        closeModal();
        if (typeof window.loadEmailCampaignHistory === 'function') window.loadEmailCampaignHistory();
      } else {
        showToast('Failed to schedule template: ' + (data.message || data.error), 'danger');
      }
    } catch (e) {
      showToast('Error scheduling template: ' + e.message, 'danger');
    }
  };

  window.openEmailTemplateModal = function(id = null) {
    const isEdit = !!id;
    const tpl = isEdit && window._emailTemplatesStore ? window._emailTemplatesStore.get(id) : null;

    const bodyHTML = `
      <form id="formEmailTemplateModal" onsubmit="event.preventDefault(); window.submitEmailTemplateForm();" style="display: flex; flex-direction: column; gap: 16px;">
        <input type="hidden" id="met_id" value="${tpl ? tpl.id : ''}" />

        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 14px;">
          <div class="modal-form-group">
            <label style="font-weight: 700; font-size: 0.8rem;">Template Name *</label>
            <input type="text" id="met_name" class="premium-input" placeholder="e.g. Complete Your WedEazzy Profile" value="${tpl ? escHtml(tpl.name) : ''}" required />
          </div>

          <div class="modal-form-group">
            <label style="font-weight: 700; font-size: 0.8rem;">Category *</label>
            <select id="met_category" class="premium-input">
              <option value="Profile Completion" ${tpl && tpl.category === 'Profile Completion' ? 'selected' : ''}>Profile Completion</option>
              <option value="Subscription" ${tpl && tpl.category === 'Subscription' ? 'selected' : ''}>Subscription</option>
              <option value="Grow Business" ${tpl && tpl.category === 'Grow Business' ? 'selected' : ''}>Grow Business</option>
              <option value="General" ${!tpl || tpl.category === 'General' ? 'selected' : ''}>General</option>
            </select>
          </div>
        </div>

        <div class="modal-form-group">
          <label style="font-weight: 700; font-size: 0.8rem;">Subject Line *</label>
          <input type="text" id="met_subject" class="premium-input" placeholder="e.g. Complete your {{business_name}} profile on WedEazzy 💍" value="${tpl ? escHtml(tpl.subject) : ''}" required />
        </div>

        <div class="modal-form-group">
          <label style="font-weight: 700; font-size: 0.8rem;">Preheader Text (Preview Snippet)</label>
          <input type="text" id="met_preview" class="premium-input" placeholder="e.g. Reach more couples in {{city}} by completing your profile today." value="${tpl ? escHtml(tpl.previewText || '') : ''}" />
        </div>

        <!-- Dynamic Variables Chips Panel -->
        <div style="padding: 12px; background: var(--surface-bg-subtle); border: 1px solid var(--border-color); border-radius: 8px;">
          <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-main); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-code" style="color: var(--brand-rose);"></i>
            Insert Dynamic Variables (Click to add to body):
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{business_name}}')">{{business_name}}</button>
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{owner_name}}')">{{owner_name}}</button>
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{city}}')">{{city}}</button>
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{business_category}}')">{{business_category}}</button>
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{profile_completion_percentage}}')">{{profile_completion_percentage}}</button>
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{dashboard_url}}')">{{dashboard_url}}</button>
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{subscription_name}}')">{{subscription_name}}</button>
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{upgrade_url}}')">{{upgrade_url}}</button>
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{grow_business_url}}')">{{grow_business_url}}</button>
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{whatsapp_leads_url}}')">{{whatsapp_leads_url}}</button>
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{website_leads_url}}')">{{website_leads_url}}</button>
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{social_media_leads_url}}')">{{social_media_leads_url}}</button>
            <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 8px;" onclick="window.insertTemplateVar('{{support_email}}')">{{support_email}}</button>
          </div>
        </div>

        <div class="modal-form-group">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label style="font-weight: 700; font-size: 0.8rem; margin: 0;">Email HTML Content Body *</label>
            <div style="display: flex; gap: 4px;">
              <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 6px;" onclick="window.insertTemplateSnippet('heading')">+ Heading</button>
              <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 6px;" onclick="window.insertTemplateSnippet('button')">+ CTA Button</button>
              <button type="button" class="btn-premium" style="font-size: 0.68rem; padding: 2px 6px;" onclick="window.insertTemplateSnippet('divider')">+ Divider</button>
            </div>
          </div>
          <textarea id="met_body" class="premium-input" style="min-height: 240px; font-family: 'Courier New', monospace; font-size: 0.82rem; line-height: 1.5;" placeholder="Enter HTML email content..." required>${tpl ? escHtml(tpl.body) : ''}</textarea>
        </div>

        <div class="modal-form-group">
          <label style="font-weight: 700; font-size: 0.8rem;">Status</label>
          <select id="met_status" class="premium-input">
            <option value="active" ${!tpl || tpl.status === 'active' ? 'selected' : ''}>Active (Selectable in Send Emails)</option>
            <option value="inactive" ${tpl && tpl.status === 'inactive' ? 'selected' : ''}>Inactive (Archived)</option>
          </select>
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Cancel</button>
      <button class="btn-premium" onclick="window.triggerModalTestEmail()">Send Test Email</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitEmailTemplateForm()">${isEdit ? 'Save Changes' : 'Create Template'}</button>
    `;

    openModal(isEdit ? "Edit Email Template" : "Create Reusable Email Template", bodyHTML, footerHTML, '800px');
  };

  window.insertTemplateVar = function(variableStr) {
    const area = document.getElementById('met_body');
    if (!area) return;
    const start = area.selectionStart || 0;
    const end = area.selectionEnd || 0;
    const current = area.value;
    area.value = current.substring(0, start) + variableStr + current.substring(end);
    area.focus();
    area.selectionStart = area.selectionEnd = start + variableStr.length;
  };

  window.insertTemplateSnippet = function(snippetType) {
    const area = document.getElementById('met_body');
    if (!area) return;
    let snippet = '';
    if (snippetType === 'heading') snippet = `<h3 style="color: #1A1D1F; font-size: 18px; margin-bottom: 12px;">Heading Text</h3>`;
    else if (snippetType === 'button') snippet = `<div style="text-align: center; margin: 28px 0;"><a href="{{dashboard_url}}" style="background-color: #DC1F30; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">Button Text</a></div>`;
    else if (snippetType === 'divider') snippet = `<hr style="border: 0; border-top: 1px solid #f0f0f0; margin: 24px 0;" />`;

    area.value += '\n' + snippet + '\n';
  };

  window.submitEmailTemplateForm = async function() {
    const id = document.getElementById('met_id')?.value;
    const name = document.getElementById('met_name')?.value;
    const category = document.getElementById('met_category')?.value;
    const subject = document.getElementById('met_subject')?.value;
    const previewText = document.getElementById('met_preview')?.value;
    const body = document.getElementById('met_body')?.value;
    const status = document.getElementById('met_status')?.value;

    if (!name || !subject || !body) {
      showToast('Please fill in Template Name, Subject Line, and Email Body!', 'danger');
      return;
    }

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/email-templates', {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: id || undefined, name, category, subject, previewText, body, status })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(id ? 'Email template updated successfully!' : 'Email template created successfully!', 'success');
        closeModal();
        window.loadEmailTemplatesList();
      } else {
        showToast('Save failed: ' + (data.message || data.error), 'danger');
      }
    } catch (e) {
      showToast('Error saving template: ' + e.message, 'danger');
    }
  };

  window.duplicateEmailTemplateRecord = async function(id) {
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch(`/api/admin/email-templates/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Template duplicated successfully!', 'success');
        window.loadEmailTemplatesList();
      } else {
        showToast('Duplicate failed: ' + (data.message || data.error), 'danger');
      }
    } catch (e) {
      showToast('Failed to duplicate template', 'danger');
    }
  };

  window.toggleEmailTemplateStatus = async function(id, newStatus) {
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch(`/api/admin/email-templates/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Template marked as ${newStatus}!`, 'info');
        window.loadEmailTemplatesList();
      }
    } catch (e) {
      showToast('Failed to update status', 'danger');
    }
  };

  window.deleteEmailTemplateRecord = async function(id) {
    if (!confirm('Are you sure you want to delete or archive this template?')) return;
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch(`/api/admin/email-templates/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || 'Template removed successfully!', 'success');
        window.loadEmailTemplatesList();
      } else {
        showToast('Delete failed: ' + (data.message || data.error), 'danger');
      }
    } catch (e) {
      showToast('Failed to delete template', 'danger');
    }
  };

  window.previewEmailTemplate = async function(id) {
    const tpl = window._emailTemplatesStore ? window._emailTemplatesStore.get(id) : null;
    if (!tpl) return;

    const bodyHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--surface-bg-subtle); border-radius: 8px; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <label style="font-size: 0.78rem; font-weight: 700;">Preview As Vendor:</label>
            <select id="et_preview_vendor_select" class="premium-input" style="font-size: 0.78rem; padding: 4px 8px; width: 280px;" onchange="window.updateTemplatePreviewVendor(this.value)">
              <option value="">Rahul Sharma — Royal Palace Banquets (Sample)</option>
            </select>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn-premium active" id="btnTplPrevDesktop" onclick="window.setTplPreviewDevice('desktop')"><i class="fa-solid fa-desktop"></i> Desktop</button>
            <button class="btn-premium" id="btnTplPrevMobile" onclick="window.setTplPreviewDevice('mobile')"><i class="fa-solid fa-mobile-screen"></i> Mobile</button>
          </div>
        </div>

        <div id="tplPreviewContainer" style="margin: 0 auto; width: 100%; max-width: 100%; border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; background: #ffffff; transition: all 0.2s ease;">
          <div style="padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 2px;">Subject: <strong id="tplPrevSubjectText" style="color: #0f172a;">${escHtml(tpl.subject)}</strong></div>
            <div style="font-size: 0.72rem; color: #94a3b8;">Preheader: <span id="tplPrevPreheaderText">${escHtml(tpl.previewText || 'No preheader')}</span></div>
          </div>
          <div id="tplPrevBodyContent" style="padding: 24px;">
            ${tpl.body}
          </div>
        </div>
      </div>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
      <button class="btn-premium btn-premium-rose" onclick="window.openEmailTemplateModal('${tpl.id}')"><i class="fa-solid fa-pen-to-square"></i> Edit Template</button>
    `;

    openModal(`Template Preview: ${tpl.name}`, bodyHTML, footerHTML, '850px');

    window._currentPreviewTemplate = tpl;

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/vendors?limit=25', { headers: { 'Authorization': token ? `Bearer ${token}` : '' } });
      const data = await res.json();
      const select = document.getElementById('et_preview_vendor_select');
      if (select && data.ok && data.vendors && data.vendors.length > 0) {
        select.innerHTML = '<option value="">Rahul Sharma — Royal Palace Banquets (Sample)</option>' +
          data.vendors.map(v => `<option value="${v.id}">${escHtml(v.user?.name || v.businessName)} — ${escHtml(v.businessName)} (${escHtml(v.city || 'City')})</option>`).join('');
      }
    } catch (e) {}

    window.updateTemplatePreviewVendor('');
  };

  window.updateTemplatePreviewVendor = async function(vendorId) {
    const tpl = window._currentPreviewTemplate;
    if (!tpl) return;

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/email-templates/preview-resolve', {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subject: tpl.subject,
          previewText: tpl.previewText,
          body: tpl.body,
          vendorId: vendorId || undefined
        })
      });
      const data = await res.json();
      if (data.ok && data.resolved) {
        const sub = document.getElementById('tplPrevSubjectText');
        const pre = document.getElementById('tplPrevPreheaderText');
        const body = document.getElementById('tplPrevBodyContent');

        if (sub) sub.textContent = data.resolved.subject;
        if (pre) pre.textContent = data.resolved.previewText;
        if (body) body.innerHTML = data.resolved.body;
      }
    } catch (e) {}
  };

  window.setTplPreviewDevice = function(mode) {
    const container = document.getElementById('tplPreviewContainer');
    const btnDesktop = document.getElementById('btnTplPrevDesktop');
    const btnMobile = document.getElementById('btnTplPrevMobile');

    if (mode === 'mobile') {
      if (container) container.style.maxWidth = '360px';
      if (btnMobile) btnMobile.classList.add('active');
      if (btnDesktop) btnDesktop.classList.remove('active');
    } else {
      if (container) container.style.maxWidth = '100%';
      if (btnDesktop) btnDesktop.classList.add('active');
      if (btnMobile) btnMobile.classList.remove('active');
    }
  };

  window.triggerModalTestEmail = function() {
    const subject = document.getElementById('met_subject')?.value;
    const previewText = document.getElementById('met_preview')?.value;
    const body = document.getElementById('met_body')?.value;

    if (!subject || !body) {
      showToast('Please enter subject and content body before testing!', 'danger');
      return;
    }

    const modalHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div class="modal-form-group">
          <label style="font-weight: 700; font-size: 0.8rem;">Send Test Email To:</label>
          <input type="email" id="mtpl_test_email" class="premium-input" placeholder="admin@wedeazzy.com" value="wedeazzy@gmail.com" required />
        </div>
        <p style="font-size: 0.72rem; color: var(--text-muted);">Sends a real email using SMTP with resolved sample vendor variables.</p>
      </div>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Cancel</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitModalTestEmail()">Send Test Now</button>
    `;

    openModal("Send Test Email for Template", modalHTML, footerHTML);
  };

  window.submitModalTestEmail = async function() {
    const testEmail = document.getElementById('mtpl_test_email')?.value;
    const subject = document.getElementById('met_subject')?.value;
    const previewText = document.getElementById('met_preview')?.value;
    const body = document.getElementById('met_body')?.value;

    if (!testEmail || !subject || !body) {
      showToast('Please enter a valid test email address!', 'danger');
      return;
    }

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/email-templates/test', {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ testEmail, subject, previewText, body })
      });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || `Test email sent to ${testEmail}!`, 'success');
        closeModal();
      } else {
        showToast('Test email failed: ' + (data.message || data.error), 'danger');
      }
    } catch (e) {
      showToast('Error sending test email: ' + e.message, 'danger');
    }
  };

});
