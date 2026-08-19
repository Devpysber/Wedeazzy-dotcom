/**
 * WedEazzy Modular Admin Panel - SPA Master Application Orchestrator
 * Connects the state store, charts drawer, auth blocks, and UI elements.
 */

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
  const LIST_PAGE_SIZE = 50;

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
    "send-emails", "blogs", "contact-inquiries", "whatsapp-status", "grow-campaigns",
    "grow-pricing", "vendor-crm-dashboard", "invitations", "blacklisted",
    "import-listings"
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
        if (window.WedEazzyCharts) setTimeout(() => window.WedEazzyCharts.renderAll(), 250);
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
    if (window.WedEazzyCharts) {
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
    if (window.WedEazzyCharts) {
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

    // Sync database state before rendering
    if (window.WedEazzyStore) {
      await window.WedEazzyStore.sync();
    }

    // Render original tab view with premium delayed organic transitions (250ms)
    setTimeout(() => {
      renderActiveView();
    }, 250);
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

  function renderActiveView() {
    const store = window.WedEazzyStore.get();

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
        default: break;
      }
    }

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
      renderReports(store);
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
                <input type="text" class="premium-input" value="+91 74989 87620" />
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

  // Render TRANSACTION HISTORY
  function renderTransactionHistory(store) {
    const txns = (store.payments || []).map((t) => {
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
                      No transaction records located inside MySQL tables yet.
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


  // Render MANAGE PLANS
  function renderManagePlans(store) {
    const vendors = store.vendors;

    window.WedEazzyStore.getPlans().then(res => {
      const plans = res.plans || {
        Free: { price: 0, maxPhotos: 4, description: "Basic listing visibility. Max 4 gallery photos. Standard search placement." },
        Premium: { price: 2999, maxPhotos: 10, description: "Higher search ranking. Max 10 gallery photos. Reports access." },
        Featured: { price: 5999, maxPhotos: 15, description: "Highest search ranking. Max 15 photos. Exclusive category/pincode locks. Advanced insights." }
      };

      el.portalBody.innerHTML = `
        <div class="spa-tab-wrapper">
          <div class="locator-breadcrumb">
            <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Manage Vendor Plans</span>
          </div>

          <!-- 3 Plan Pricing Cards -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 28px; margin-top: 15px;">
            <!-- Free Plan -->
            <div class="panel-card" style="border-top: 5px solid var(--text-muted); display: flex; flex-direction: column; align-items: center; text-align: center; padding: 24px 16px;">
              <span style="font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Tier 1</span>
              <h3 style="font-size: 1.3rem; font-weight: 800; margin-top: 6px;">Free Plan</h3>
              <div style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin: 12px 0;">₹${plans.Free.price} <span style="font-size: 0.78rem; font-weight: 500; color: var(--text-muted);">/ forever</span></div>
              <p style="font-size: 0.77rem; color: var(--text-sub); line-height: 1.4; margin-bottom: 14px;">${plans.Free.description}</p>
            </div>

            <!-- Premium Plan -->
            <div class="panel-card" style="border-top: 5px solid var(--brand-rose); display: flex; flex-direction: column; align-items: center; text-align: center; padding: 24px 16px; position: relative;">
              <div style="position: absolute; top: -11px; background: linear-gradient(135deg, var(--brand-rose), var(--brand-gold)); color: white; font-size: 0.6rem; font-weight: 800; padding: 3px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em;">Most Popular</div>
              <span style="font-size: 0.72rem; font-weight: 800; color: var(--brand-rose); text-transform: uppercase; letter-spacing: 0.05em;">Tier 2</span>
              <h3 style="font-size: 1.3rem; font-weight: 800; margin-top: 6px;">Premium Tier</h3>
              <div style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin: 12px 0;">₹${plans.Premium.price.toLocaleString('en-IN')} <span style="font-size: 0.78rem; font-weight: 500; color: var(--text-muted);">/ month</span></div>
              <p style="font-size: 0.77rem; color: var(--text-sub); line-height: 1.4; margin-bottom: 14px;">${plans.Premium.description}</p>
            </div>

            <!-- Featured Plan -->
            <div class="panel-card" style="border-top: 5px solid var(--brand-gold); display: flex; flex-direction: column; align-items: center; text-align: center; padding: 24px 16px;">
              <span style="font-size: 0.72rem; font-weight: 800; color: var(--brand-gold); text-transform: uppercase; letter-spacing: 0.05em;">Tier 3</span>
              <h3 style="font-size: 1.3rem; font-weight: 800; margin-top: 6px;">Featured Lockout</h3>
              <div style="font-size: 1.8rem; font-weight: 800; color: var(--text-main); margin: 12px 0;">₹${plans.Featured.price.toLocaleString('en-IN')} <span style="font-size: 0.78rem; font-weight: 500; color: var(--text-muted);">/ month</span></div>
              <p style="font-size: 0.77rem; color: var(--text-sub); line-height: 1.4; margin-bottom: 14px;">${plans.Featured.description}</p>
            </div>
          </div>

          <!-- Global Plans Configuration Form -->
          <div class="panel-card" style="margin-bottom: 28px;">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 16px;">
              <div class="panel-title-group">
                <h3 style="font-size: 1.15rem; font-weight: 800;">Global Subscription Plans Settings</h3>
                <p>Customize the dynamic price, photo limits, and descriptions for all marketplace tiers.</p>
              </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;">
              <div style="background: var(--surface-bg); padding: 16px; border: 1px solid var(--border-color); border-radius: 8px;">
                <h4 style="margin-top:0; color:var(--text-main); font-weight: 700; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">Free Plan</h4>
                <div style="margin-bottom: 12px; margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div>
                    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Max Photos Limit</label>
                    <input type="number" id="cfgFreePhotos" class="premium-input" style="width:100%;" value="${plans.Free.maxPhotos}">
                  </div>
                  <div>
                    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Max Businesses</label>
                    <input type="number" id="cfgFreeBusinesses" class="premium-input" style="width:100%;" value="${plans.Free.maxBusinesses || 1}">
                  </div>
                </div>
                <div>
                  <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Short Description</label>
                  <input type="text" id="cfgFreeDesc" class="premium-input" style="width:100%;" value="${plans.Free.description}">
                </div>
              </div>

              <div style="background: var(--surface-bg); padding: 16px; border: 1px solid var(--border-color); border-radius: 8px;">
                <h4 style="margin-top:0; color:var(--brand-rose); font-weight: 700; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">Premium Plan</h4>
                <div style="margin-bottom: 12px; margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                  <div>
                    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Price (₹)</label>
                    <input type="number" id="cfgPremiumPrice" class="premium-input" style="width:100%;" value="${plans.Premium.price}">
                  </div>
                  <div>
                    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Max Photos</label>
                    <input type="number" id="cfgPremiumPhotos" class="premium-input" style="width:100%;" value="${plans.Premium.maxPhotos}">
                  </div>
                  <div>
                    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Max Biz</label>
                    <input type="number" id="cfgPremiumBusinesses" class="premium-input" style="width:100%;" value="${plans.Premium.maxBusinesses || 3}">
                  </div>
                </div>
                <div>
                  <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Short Description</label>
                  <input type="text" id="cfgPremiumDesc" class="premium-input" style="width:100%;" value="${plans.Premium.description}">
                </div>
              </div>

              <div style="background: var(--surface-bg); padding: 16px; border: 1px solid var(--border-color); border-radius: 8px;">
                <h4 style="margin-top:0; color:var(--brand-gold); font-weight: 700; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">Featured Plan</h4>
                <div style="margin-bottom: 12px; margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                  <div>
                    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Price (₹)</label>
                    <input type="number" id="cfgFeaturedPrice" class="premium-input" style="width:100%;" value="${plans.Featured.price}">
                  </div>
                  <div>
                    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Max Photos</label>
                    <input type="number" id="cfgFeaturedPhotos" class="premium-input" style="width:100%;" value="${plans.Featured.maxPhotos}">
                  </div>
                  <div>
                    <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Max Biz</label>
                    <input type="number" id="cfgFeaturedBusinesses" class="premium-input" style="width:100%;" value="${plans.Featured.maxBusinesses || 7}">
                  </div>
                </div>
                <div>
                  <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Short Description</label>
                  <input type="text" id="cfgFeaturedDesc" class="premium-input" style="width:100%;" value="${plans.Featured.description}">
                </div>
              </div>
            </div>
            
            <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
              <button id="saveGlobalPlansBtn" class="btn-premium" style="border-color: var(--brand-gold); color: var(--brand-gold); font-weight:700;">
                <i class="fa-solid fa-floppy-disk"></i> Save Global Plans Settings
              </button>
            </div>
          </div>

          <!-- Vendor Plan Manager Table -->
          <div class="panel-card">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 12px;">
              <div class="panel-title-group">
                <h3 style="font-size: 1.15rem; font-weight: 800;">Vendor Plan Upgrade Panel</h3>
                <p>Promote, downgrade, renew, extend, or toggle vendor subscriptions manually.</p>
              </div>
              <input type="text" id="planVendorSearch" class="premium-input" placeholder="Search business..." style="width: 220px;" />
            </div>

            <div class="table-viewport">
              <table class="grid-table">
                <thead>
                  <tr>
                    <th>Vendor ID</th>
                    <th>Business Name</th>
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
                  ${vendors.length === 0 ? `
                    <tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 30px;">No vendors registered yet.</td></tr>
                  ` : vendors.map(v => {
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

                    const planMaxPhotos = plans[plan]?.maxPhotos || 4;
                    const photoCount = v.photoCount || 0;
                    const galleryUsage = `${photoCount}/${planMaxPhotos}`;

                    const reportsAccess = (plans[plan]?.reportsAccess) ? 'Yes' : 'No';
                    const insightsAccess = (plans[plan]?.insightsAccess) ? 'Yes' : 'No';

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
                      <tr data-vendor-name="${escHtml((v.name || '').toLowerCase())}">
                        <td><strong>#${escHtml(v.id)}</strong></td>
                        <td><strong>${escHtml(v.name)}</strong></td>
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
                              onclick="window.openEditSubscriptionModal('${v.id}', '${plan}', '${v.subscriptionExpiry || ''}', ${v.status === 'approved'}, ${JSON.stringify(plans).replace(/"/g, '&quot;')})">
                              <i class="fa-solid fa-pen-to-square"></i> Edit Subscription
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

      // Save Global plans handler
      const saveBtn = document.getElementById("saveGlobalPlansBtn");
      if (saveBtn) {
        saveBtn.addEventListener("click", () => {
          const updatedPlans = {
            Free: {
              price: 0,
              maxPhotos: parseInt(document.getElementById('cfgFreePhotos').value) || 4,
              maxBusinesses: parseInt(document.getElementById('cfgFreeBusinesses').value) || 1,
              reportsAccess: false,
              insightsAccess: false,
              description: document.getElementById('cfgFreeDesc').value
            },
            Premium: {
              price: parseInt(document.getElementById('cfgPremiumPrice').value) || 2999,
              maxPhotos: parseInt(document.getElementById('cfgPremiumPhotos').value) || 10,
              maxBusinesses: parseInt(document.getElementById('cfgPremiumBusinesses').value) || 3,
              reportsAccess: true,
              insightsAccess: false,
              description: document.getElementById('cfgPremiumDesc').value
            },
            Featured: {
              price: parseInt(document.getElementById('cfgFeaturedPrice').value) || 5999,
              maxPhotos: parseInt(document.getElementById('cfgFeaturedPhotos').value) || 15,
              maxBusinesses: parseInt(document.getElementById('cfgFeaturedBusinesses').value) || 7,
              reportsAccess: true,
              insightsAccess: true,
              description: document.getElementById('cfgFeaturedDesc').value
            }
          };

          window.WedEazzyStore.updatePlans(updatedPlans).then(res => {
            if (res.ok) {
              window.showToast('Global plans configuration updated successfully!', 'success');
              renderManagePlans(window.WedEazzyStore.get());
            } else {
              window.showToast(res.message || 'Failed to update plans', 'error');
            }
          });
        });
      }

      const search = document.getElementById("planVendorSearch");
      if (search) {
        search.addEventListener("input", (e) => {
          const q = e.target.value.toLowerCase();
          document.querySelectorAll("#planVendorTableBody tr").forEach(row => {
            const name = row.getAttribute("data-vendor-name");
            if (name) row.style.display = name.includes(q) ? "" : "none";
          });
        });
      }
    });
  }

  // Edit Subscription Modal Handlers
  window.openEditSubscriptionModal = function(vendorId, currentPlan, expiryDate, isActive, plans) {
    let modal = document.getElementById('editSubscriptionModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'editSubscriptionModal';
      modal.className = 'otp-overlay';
      document.body.appendChild(modal);
    }
    
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
              <option value="Free" ${currentPlan === 'Free' ? 'selected' : ''}>Free (₹${plans.Free.price}/mo)</option>
              <option value="Premium" ${currentPlan === 'Premium' ? 'selected' : ''}>Premium (₹${plans.Premium.price.toLocaleString('en-IN')}/mo)</option>
              <option value="Featured" ${currentPlan === 'Featured' ? 'selected' : ''}>Featured (₹${plans.Featured.price.toLocaleString('en-IN')}/mo)</option>
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

  // Render SEND EMAILS campaign
  function renderSendEmails(store) {
    const segmentLabels = {
      all: 'All Accounts (Couples & Vendors)',
      vendors: 'Registered Wedding Vendors Only',
      couples: 'Couples Planning Weddings Only',
    };
    const statusLabels = {
      sending: { text: 'SENDING…', color: '#C9A33A' },
      completed: { text: 'DELIVERED', color: '#10b981' },
      partial: { text: 'PARTIALLY DELIVERED', color: '#f59e0b' },
      failed: { text: 'FAILED', color: '#dc2626' },
    };

    function renderHistoryLogs(campaigns) {
      if (!campaigns || campaigns.length === 0) {
        return `<p style="font-size: 0.8rem; color: var(--text-sub);">No campaigns dispatched yet.</p>`;
      }
      return campaigns.map(c => {
        const status = statusLabels[c.status] || statusLabels.sending;
        const date = new Date(c.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
        const segmentLabel = c.segment && c.segment.startsWith('vendor_category:')
          ? `Vendors — ${c.segment.slice('vendor_category:'.length)}`
          : (segmentLabels[c.segment] || c.segment);
        return `
          <div style="border: 1px solid var(--border-color); padding: 14px; border-radius: 10px; background-color: var(--canvas-bg);">
            <div style="display: flex; justify-content: space-between; font-size: 0.77rem; margin-bottom: 4px;">
              <strong>${escapeHtmlUi(c.name)}</strong>
              <span style="color: ${status.color}; font-weight: bold;">${status.text}</span>
            </div>
            <p style="font-size: 0.72rem; color: var(--text-sub);">Subject: ${escapeHtmlUi(c.subject)}</p>
            <div style="display: flex; gap: 16px; font-size: 0.68rem; color: var(--text-muted); margin-top: 6px;">
              <span>Sent: ${c.sentCount}/${c.totalRecipients} (${escapeHtmlUi(segmentLabel)})</span>
              ${c.failedCount > 0 ? `<span>Failed: ${c.failedCount}</span>` : ''}
              <span>Fires: ${date}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    function escapeHtmlUi(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Send Broadcast Campaign</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-top: 15px;">
          <!-- Broadcast Form -->
          <div class="panel-card">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 14px;">
              <h3 style="font-size: 1.15rem; font-weight: 800;"><i class="fa-regular fa-paper-plane" style="color: var(--brand-rose);"></i> Bulk Email Campaign Broadcast</h3>
              <p>Configure custom HTML news blasts and promotional letters to segmented users.</p>
            </div>

            <form id="formBulkEmail" style="display: flex; flex-direction: column; gap: 14px;">
              <div class="modal-form-group">
                <label>Campaign Nickname</label>
                <input type="text" id="emailCampaignName" class="premium-input" placeholder="e.g. Wedding Season 2026 Launches" required />
              </div>

              <div class="modal-form-group">
                <label>Recipient Target Audience Segments</label>
                <select id="emailSegment" class="premium-select" required onchange="document.getElementById('emailCategoryGroup').style.display = this.value === 'vendor_category' ? 'block' : 'none';">
                  <option value="all">All Accounts (Couples & Vendors)</option>
                  <option value="vendors">Registered Wedding Vendors Only</option>
                  <option value="couples">Couples Planning Weddings Only</option>
                  <option value="vendor_category">Vendors in a Specific Category</option>
                </select>
              </div>

              <div class="modal-form-group" id="emailCategoryGroup" style="display: none;">
                <label>Vendor Category</label>
                <select id="emailCategorySlug" class="premium-select">
                  <option value="">Loading categories…</option>
                </select>
              </div>

              <div class="modal-form-group">
                <label>Email Subject Title Line</label>
                <input type="text" id="emailSubject" class="premium-input" placeholder="e.g. Dream Wedding Season is Here! 🌟" required />
              </div>

              <div class="modal-form-group">
                <label>Email Content Draft (Rich Text)</label>
                <textarea id="emailBody" class="premium-input" style="height: 120px; resize: none;" placeholder="Write body text content here..." required></textarea>
              </div>

              <div id="emailBroadcastStatus" style="display: none; margin-top: 10px; font-size: 0.75rem; color: var(--text-sub);"></div>

              <button class="btn-premium btn-premium-rose" type="button" id="btnDispatchBroadcast" onclick="window.triggerEmailBroadcast()" style="justify-content: center; margin-top: 10px;">
                <i class="fa-solid fa-paper-plane"></i> Dispatch Email Broadcast
              </button>
            </form>
          </div>

          <!-- Logs -->
          <div class="panel-card">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 12px;">
              <h3 style="font-size: 1.15rem; font-weight: 800;">Campaign History Logs</h3>
              <p>Delivery markers for recently dispatched emails.</p>
            </div>

            <div id="emailHistoryLogs" style="display: flex; flex-direction: column; gap: 12px; max-height: 480px; overflow-y: auto;">
              <p style="font-size: 0.8rem; color: var(--text-sub);">Loading campaign history…</p>
            </div>
          </div>
        </div>
      </div>
    `;

    window.loadEmailCampaignHistory = async function() {
      const container = document.getElementById('emailHistoryLogs');
      try {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch('/api/admin/email-campaigns', {
          headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });
        const data = await res.json();
        if (container) {
          container.innerHTML = data.ok ? renderHistoryLogs(data.campaigns) : `<p style="font-size: 0.8rem; color: var(--text-sub);">Could not load campaign history.</p>`;
        }
      } catch (e) {
        if (container) container.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-sub);">Could not load campaign history.</p>`;
      }
    };
    window.loadEmailCampaignHistory();

    (async function loadCategoryOptions() {
      const select = document.getElementById('emailCategorySlug');
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
          ? categories.map(c => `<option value="${c.slug}">${escapeHtmlUi(c.name)} (${c.count})</option>`).join('')
          : '<option value="">No categories found</option>';
      } catch (e) {
        select.innerHTML = '<option value="">Could not load categories</option>';
      }
    })();

    window.triggerEmailBroadcast = async function() {
      const emailCampaignName = document.getElementById("emailCampaignName");
      const emailSegment = document.getElementById("emailSegment");
      const emailSubject = document.getElementById("emailSubject");
      const emailBody = document.getElementById("emailBody");
      const statusEl = document.getElementById("emailBroadcastStatus");
      const btn = document.getElementById("btnDispatchBroadcast");

      const name = emailCampaignName ? emailCampaignName.value : "";
      let segment = emailSegment ? emailSegment.value : "all";
      const sub = emailSubject ? emailSubject.value : "";
      const body = emailBody ? emailBody.value : "";

      if (!name || !sub || !body) {
        showToast("Please fill all campaign details first!", "danger");
        return;
      }

      if (segment === 'vendor_category') {
        const categorySlug = document.getElementById("emailCategorySlug")?.value;
        if (!categorySlug) {
          showToast("Please choose a vendor category!", "danger");
          return;
        }
        segment = `vendor_category:${categorySlug}`;
      }

      if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
      if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Dispatching…'; }

      try {
        const auth = window.WedEazzyAuth;
        const token = auth ? auth.getToken() : null;
        const res = await fetch('/api/admin/email-campaigns', {
          method: 'POST',
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name, segment, subject: sub, body })
        });
        const data = await res.json();

        if (data.ok) {
          showToast(`Broadcasting "${name}" to ${data.campaign.totalRecipients} recipient(s)!`, "success");
          if (emailCampaignName) emailCampaignName.value = "";
          if (emailSubject) emailSubject.value = "";
          if (emailBody) emailBody.value = "";
          if (statusEl) statusEl.style.display = 'none';
          window.loadEmailCampaignHistory();
        } else {
          showToast('Broadcast failed: ' + (data.error || data.message || 'Unknown error'), 'danger');
          if (statusEl) statusEl.style.display = 'none';
        }
      } catch (e) {
        showToast('Error: ' + e.message, 'danger');
        if (statusEl) statusEl.style.display = 'none';
      } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      }
    };
  }

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

  // Render DASHBOARD (Tab 1)
  function renderDashboard(store) {
    const stats = store.stats;
    const recentLogs = store.logs.slice(0, 4);

    // ── Bookings by Status chart data (reuses the same colors as the tiles above) ──
    const statusChartData = [
      { label: 'Pending', value: stats.pendingBookings || 0, color: '#f59e0b' },
      { label: 'In-Progress', value: stats.inProgressBookings || 0, color: '#3b82f6' },
      { label: 'Confirmed', value: stats.confirmedBookings || 0, color: '#10b981' },
      { label: 'Cancelled', value: stats.cancelledBookings || 0, color: '#ef4444' },
    ];
    const statusMax = Math.max(1, ...statusChartData.map(d => d.value));

    function renderBarRow(d, max) {
      const pct = Math.round((d.value / max) * 100);
      return `
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:92px;font-size:0.74rem;color:var(--text-sub);flex-shrink:0;">${d.label}</div>
          <div style="flex-grow:1;background:var(--canvas-bg);border-radius:4px;height:20px;position:relative;">
            <div style="width:${pct}%;background:${d.color};height:20px;border-radius:4px 0 0 4px;min-width:2px;"></div>
          </div>
          <div style="width:36px;text-align:right;font-size:0.78rem;font-weight:700;color:var(--text-main);flex-shrink:0;">${d.value}</div>
        </div>
      `;
    }

    // ── Top Vendor Categories chart data (fixed categorical color order) ──
    const CATEGORICAL_COLORS = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834'];
    const categoryCounts = {};
    (store.vendors || []).forEach(v => {
      const cat = v.category || 'Uncategorized';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value], idx) => ({ label, value, color: CATEGORICAL_COLORS[idx] }));
    const categoryMax = Math.max(1, ...topCategories.map(d => d.value));

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Dashboard Overview</span>
        </div>
        
        <div class="portal-welcome-banner">
          <div>
            <h2 style="font-size: 1.6rem; font-weight: 800; letter-spacing: -0.02em;">Admin Dashboard</h2>
            <p style="color: var(--text-sub); font-size: 0.85rem; margin-top: 2px;">Track and manage customer orders and all bookings.</p>
          </div>
          <div class="system-clock-badge" id="systemClockBadge">
            <i class="fa-solid fa-clock"></i> Syncing Live Time...
          </div>
        </div>

        <!-- 11 Stats Cards Grid matching reference image -->
        <div class="metrics-deck" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 16px; margin-bottom: 24px;">
          
          <!-- Card 1: Pending Bookings -->
          <div class="metric-tile" style="border-left: 4px solid #f59e0b;">
            <div class="tile-head">
              <span class="tile-title" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Pending Bookings</span>
              <div class="tile-icon-wrap" style="background-color: rgba(245, 158, 11, 0.08); color: #f59e0b;">
                <i class="fa-solid fa-hourglass-half"></i>
              </div>
            </div>
            <div class="tile-body">
              <div class="tile-number" id="dash-stat-pending">${stats.pendingBookings}</div>
            </div>
          </div>

          <!-- Card 2: In-Progress Bookings -->
          <div class="metric-tile" style="border-left: 4px solid #3b82f6;">
            <div class="tile-head">
              <span class="tile-title" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">In-Progress Bookings</span>
              <div class="tile-icon-wrap" style="background-color: rgba(59, 130, 246, 0.08); color: #3b82f6;">
                <i class="fa-solid fa-bolt"></i>
              </div>
            </div>
            <div class="tile-body">
              <div class="tile-number" id="dash-stat-inprogress">${stats.inProgressBookings}</div>
            </div>
          </div>

          <!-- Card 3: Confirmed Bookings -->
          <div class="metric-tile" style="border-left: 4px solid #10b981;">
            <div class="tile-head">
              <span class="tile-title" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Confirmed Bookings</span>
              <div class="tile-icon-wrap" style="background-color: rgba(16, 185, 129, 0.08); color: #10b981;">
                <i class="fa-regular fa-calendar-check"></i>
              </div>
            </div>
            <div class="tile-body">
              <div class="tile-number" id="dash-stat-confirmed">${stats.confirmedBookings}</div>
            </div>
          </div>

          <!-- Card 4: Cancelled Bookings -->
          <div class="metric-tile" style="border-left: 4px solid #ef4444;">
            <div class="tile-head">
              <span class="tile-title" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Cancelled Bookings</span>
              <div class="tile-icon-wrap" style="background-color: rgba(239, 68, 68, 0.08); color: #ef4444;">
                <i class="fa-solid fa-ban"></i>
              </div>
            </div>
            <div class="tile-body">
              <div class="tile-number" id="dash-stat-cancelled">${stats.cancelledBookings}</div>
            </div>
          </div>

          <!-- Card 5: Venues -->
          <div class="metric-tile" style="border-left: 4px solid #8b5cf6;">
            <div class="tile-head">
              <span class="tile-title" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Venues</span>
              <div class="tile-icon-wrap" style="background-color: rgba(139, 92, 246, 0.08); color: #8b5cf6;">
                <i class="fa-solid fa-hotel"></i>
              </div>
            </div>
            <div class="tile-body">
              <div class="tile-number" id="dash-stat-venues">${stats.venuesCount}</div>
            </div>
          </div>

          <!-- Card 6: Vendors -->
          <div class="metric-tile" style="border-left: 4px solid #0d9488;">
            <div class="tile-head">
              <span class="tile-title" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Vendors</span>
              <div class="tile-icon-wrap" style="background-color: rgba(13, 148, 136, 0.08); color: #0d9488;">
                <i class="fa-solid fa-users-rectangle"></i>
              </div>
            </div>
            <div class="tile-body">
              <div class="tile-number" id="dash-stat-vendors">${stats.vendorsCount}</div>
            </div>
          </div>

          <!-- Card 7: Services -->
          <div class="metric-tile" style="border-left: 4px solid #ea580c;">
            <div class="tile-head">
              <span class="tile-title" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Services</span>
              <div class="tile-icon-wrap" style="background-color: rgba(234, 88, 12, 0.08); color: #ea580c;">
                <i class="fa-solid fa-list-check"></i>
              </div>
            </div>
            <div class="tile-body">
              <div class="tile-number" id="dash-stat-services">${stats.servicesCount}</div>
            </div>
          </div>

          <!-- Card 8: Users -->
          <div class="metric-tile" style="border-left: 4px solid #0284c7;">
            <div class="tile-head">
              <span class="tile-title" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Users</span>
              <div class="tile-icon-wrap" style="background-color: rgba(2, 132, 199, 0.08); color: #0284c7;">
                <i class="fa-solid fa-users"></i>
              </div>
            </div>
            <div class="tile-body">
              <div class="tile-number" id="dash-stat-users">${stats.usersCount}</div>
            </div>
          </div>

          <!-- Card 9: Business Claims -->
          <div class="metric-tile" style="border-left: 4px solid #ec4899;">
            <div class="tile-head">
              <span class="tile-title" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Business Claims</span>
              <div class="tile-icon-wrap" style="background-color: rgba(236, 72, 153, 0.08); color: #ec4899;">
                <i class="fa-solid fa-award"></i>
              </div>
            </div>
            <div class="tile-body">
              <div class="tile-number" id="dash-stat-claims">${stats.businessClaims}</div>
            </div>
          </div>

          <!-- Card 10: Regions -->
          <div class="metric-tile" style="border-left: 4px solid #059669;">
            <div class="tile-head">
              <span class="tile-title" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Regions</span>
              <div class="tile-icon-wrap" style="background-color: rgba(5, 150, 105, 0.08); color: #059669;">
                <i class="fa-solid fa-earth-asia"></i>
              </div>
            </div>
            <div class="tile-body">
              <div class="tile-number" id="dash-stat-regions">${stats.regionsCount}</div>
            </div>
          </div>

          <!-- Card 11: Cities -->
          <div class="metric-tile" style="border-left: 4px solid #eab308;">
            <div class="tile-head">
              <span class="tile-title" style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-sub);">Cities</span>
              <div class="tile-icon-wrap" style="background-color: rgba(234, 179, 8, 0.08); color: #eab308;">
                <i class="fa-solid fa-city"></i>
              </div>
            </div>
            <div class="tile-body">
              <div class="tile-number" id="dash-stat-cities">${stats.citiesCount}</div>
            </div>
          </div>

        </div>

        <!-- Trend Charts -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; margin-bottom: 24px;">
          <div class="panel-card">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 16px;">
              <div class="panel-title-group">
                <h3 style="font-size: 1rem; font-weight: 800;">Bookings by Status</h3>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:14px;">
              ${statusChartData.map(d => renderBarRow(d, statusMax)).join('')}
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 16px;">
              <div class="panel-title-group">
                <h3 style="font-size: 1rem; font-weight: 800;">Top Vendor Categories</h3>
              </div>
            </div>
            ${topCategories.length === 0 ? `
              <p style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:20px 0;">No vendors yet.</p>
            ` : `
              <div style="display:flex;flex-direction:column;gap:14px;">
                ${topCategories.map(d => renderBarRow(d, categoryMax)).join('')}
              </div>
            `}
          </div>
        </div>

        <!-- Today's Bookings Registry Card -->
        <div class="panel-card" style="margin-bottom: 24px;">
          <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 12px;">
            <div class="panel-title-group">
              <h3 style="font-size: 1.15rem; font-weight: 800;">Today's Bookings</h3>
            </div>
            <a href="#" onclick="event.preventDefault(); document.querySelector('[data-tab-trigger=bookings]').click();" style="color: var(--brand-rose); font-size: 0.8rem; font-weight: 600; text-decoration: none;">View All</a>
          </div>

          <!-- Filter Sub-tabs matching image -->
          <div style="display: flex; gap: 20px; border-bottom: 1px solid var(--border-subtle); margin-bottom: 15px;">
            <button class="selector-tab-btn active" style="background: none; border: none; border-bottom: 2.5px solid var(--brand-rose); border-radius: 0; padding: 8px 4px; color: var(--brand-rose); font-size: 0.82rem; font-weight: 700;">All Bookings</button>
            <button class="selector-tab-btn" style="background: none; border: none; border-bottom: 2.5px solid transparent; border-radius: 0; padding: 8px 4px; color: var(--text-sub); font-size: 0.82rem; font-weight: 600;" onclick="window.showToast('Filter by Vendor bookings (Demo)...', 'info')">Vendor</button>
            <button class="selector-tab-btn" style="background: none; border: none; border-bottom: 2.5px solid transparent; border-radius: 0; padding: 8px 4px; color: var(--text-sub); font-size: 0.82rem; font-weight: 600;" onclick="window.showToast('Filter by Venue bookings (Demo)...', 'info')">Venue</button>
          </div>

          <div class="table-viewport">
            <table class="grid-table">
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th>Customer Phone No</th>
                  <th>Service</th>
                  <th>Venue</th>
                  <th>Appointment Date</th>
                  <th>Booking Dates</th>
                  <th>Status</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${store.bookings.slice(0, 3).map(b => `
                  <tr>
                    <td><strong style="font-weight: 700; color: var(--text-main);">${b.clientName}</strong></td>
                    <td>+91 74989 87620</td>
                    <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(220, 31, 48, 0.15); color: var(--brand-rose); font-weight: 600;">${b.eventType}</span></td>
                    <td>${b.venue}</td>
                    <td><i class="fa-regular fa-calendar-days" style="color: var(--brand-rose);"></i> ${b.date}</td>
                    <td>${b.date}</td>
                    <td>
                      <span class="status-pill status-${b.status}">
                        <span class="status-bullet-dot"></span> ${b.status}
                      </span>
                    </td>
                    <td>
                      <div class="row-actions-group" style="justify-content: flex-end;">
                        ${b.status !== "confirmed" ? `
                          <button class="row-action-icon-btn row-action-approve" onclick="window.handleBookingStatus('${b.id}', 'confirmed')"><i class="fa-solid fa-check"></i></button>
                        ` : ''}
                        ${b.status !== "cancelled" ? `
                          <button class="row-action-icon-btn row-action-reject" onclick="window.handleBookingStatus('${b.id}', 'cancelled')"><i class="fa-solid fa-xmark"></i></button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Booking Statistics Chart Panel -->
        <div class="panel-card" style="margin-bottom: 24px;">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3 style="font-size: 1.15rem; font-weight: 800;">Booking Statistics</h3>
            </div>
            <div class="panel-controls">
              <select class="premium-select" style="font-size: 0.78rem; font-weight: 600; padding: 6px 12px; border-radius: 6px;" onchange="window.showToast('Statistics range adjusted.', 'success')">
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
                <option>Last 12 Months</option>
              </select>
            </div>
          </div>
          <div class="canvas-container" style="height: 320px;">
            <canvas id="chartBookingTrends"></canvas>
          </div>
        </div>

        <!-- Master Footer matching reference image -->
        <footer style="margin-top: 35px; border-top: 1px solid var(--border-color); padding: 18px 0; display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted); flex-wrap: wrap; gap: 10px;">
          <div>&copy; 2026 All rights reserved | Cooked with ❤️ by <a href="#" style="color: var(--text-sub); text-decoration: none; font-weight: 600;">Psyber Inc.</a></div>
          <div style="display: flex; gap: 16px;">
            <a href="#" style="color: var(--text-muted); text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='var(--brand-rose)'" onmouseout="this.style.color='var(--text-muted)'">Privacy</a>
            <a href="#" style="color: var(--text-muted); text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='var(--brand-rose)'" onmouseout="this.style.color='var(--text-muted)'">Terms</a>
          </div>
        </footer>

        <!-- Floating concierge widgets matching image exactly -->
        <div class="floating-widgets-dock" style="position: fixed; bottom: 20px; right: 20px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; z-index: 90;">
          <button class="interactive-pill-badge" style="border-color: #10b981; color: #10b981; font-weight: 700; background-color: var(--surface-bg); padding: 6px 14px; border-radius: 20px; font-size: 0.72rem; box-shadow: var(--shadow-box);" onclick="window.triggerAddVenueModal()">Venue</button>
          <button class="interactive-pill-badge" style="border-color: #10b981; color: #10b981; font-weight: 700; background-color: var(--surface-bg); padding: 6px 14px; border-radius: 20px; font-size: 0.72rem; box-shadow: var(--shadow-box);" onclick="window.triggerAddVendorModal()">Vendor</button>
        </div>

      </div>
    `;

    // Initialize clock specific inside welcome banner
    const clockBadge = document.getElementById("systemClockBadge");
    if (clockBadge && el.clockNode) {
      clockBadge.innerHTML = el.clockNode.innerHTML;
      // Mirror clock
      const observer = new MutationObserver(() => {
        clockBadge.innerHTML = el.clockNode.innerHTML;
      });
      observer.observe(el.clockNode, { childList: true });
    }

    // Render Charts
    if (window.WedEazzyCharts) {
      window.WedEazzyCharts.renderAll();
    }
  }

  // Render BOOKINGS (Tab 2)
  function renderBookings(store) {
    const list = store.bookings;

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Booking Manager</span>
        </div>

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
    const venues = store.venues;
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
    const vendors = store.vendors;
    const { pageItems, filteredCount, totalPages, currentPage } = paginateList(
      vendors,
      state.vendorsSearch,
      state.vendorsPage,
      v => (v.name || '').toLowerCase() + ' ' + (v.category || '').toLowerCase() + ' ' + (v.vendorName || '').toLowerCase() + ' ' + (v.email || '').toLowerCase()
    );
    state.vendorsPage = currentPage;

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Vendor Manager</span>
        </div>

        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3>Partner Service Vendors Registry <span class="interactive-pill-badge" style="font-size: 0.7rem; vertical-align: middle;">${(store.vendorsTotalCount ?? vendors.length).toLocaleString('en-IN')} total</span></h3>
              <p>Oversee wedding photographers, catering services, decorators, sound systems, and make-up stars.</p>
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
    if (window.WedEazzyCharts) {
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
    const bodyHTML = `
      <form id="formAddVendor" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="modal-form-group">
          <label for="mv_name">Business Name</label>
          <input type="text" id="mv_name" class="premium-input" placeholder="e.g. Dream Event Decorators" required />
        </div>
        <div class="modal-form-group">
          <label for="mv_category">Service Vertical</label>
          <select id="mv_category" class="premium-select" required>
            <option value="Catering">Catering</option>
            <option value="Decoration">Decoration</option>
            <option value="Photography">Photography</option>
            <option value="Makeup Artist">Makeup Artist</option>
            <option value="Entertainment">Entertainment</option>
          </select>
        </div>
        <div class="modal-form-group">
          <label for="mv_contact">Contact Phone</label>
          <input type="text" id="mv_contact" class="premium-input" placeholder="+91 XXXXX XXXXX" required />
        </div>
        <div class="modal-form-group">
          <label for="mv_email">Email Address</label>
          <input type="email" id="mv_email" class="premium-input" placeholder="info@company.com" required />
        </div>
        <div class="modal-form-group">
          <label for="mv_address">City</label>
          <select id="mv_address" class="premium-select" required>
            <option value="">Select city…</option>
            <option>Mumbai</option><option>Delhi NCR</option><option>Goa</option>
            <option>Jaipur</option><option>Udaipur</option><option>Jodhpur</option><option>Ahmedabad</option>
          </select>
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
    const cat = document.getElementById("mv_category").value;
    const phone = document.getElementById("mv_contact").value;
    const email = document.getElementById("mv_email").value;
    const addr = document.getElementById("mv_address").value;

    if (!name || !phone || !email || !addr) {
      showToast("Please fill all required inputs!", "danger");
      return;
    }

    const btn = document.querySelector('[onclick="window.submitAddVendor()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }
    try {
      const result = await window.WedEazzyStore.addVendor({
        name: name,
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
            <h2>🚀 Grow Business Campaigns</h2>
            <p>Manage all vendor advertising campaigns. Review, approve, update analytics, and track performance.</p>
          </div>
          <div style="display:flex;gap:12px;">
            <select id="campaignStatusFilter" 
              style="border:1.5px solid var(--border-color);border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;color:var(--text-main);background:var(--surface-bg);outline:none;cursor:pointer;"
              onchange="window.loadAdminCampaigns(this.value)">
              <option value="all">All Campaigns</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div id="adminCampaignsContainer">
          <div style="text-align:center;padding:48px;color:var(--text-muted);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-bottom:16px;display:block;"></i>
            Loading campaigns...
          </div>
        </div>
      </div>
    `;

    window.loadAdminCampaigns('all');
  }

  window.loadAdminCampaigns = async function(status = 'all') {
    const container = document.getElementById('adminCampaignsContainer');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-bottom:16px;display:block;"></i>Loading...</div>`;

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;

      const url = `/api/campaigns/admin/all?status=${status}&limit=50`;
      const res = await fetch(url, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();

      if (!data.ok) throw new Error(data.message || 'Failed to load');

      const campaigns = data.campaigns || [];

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

      if (campaigns.length === 0) {
        container.innerHTML = `
          <div class="panel-card" style="text-align:center;padding:48px;">
            <div style="font-size:48px;margin-bottom:16px;">📭</div>
            <h3>No campaigns found</h3>
            <p style="color:var(--text-muted);">No campaigns with the selected status.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${campaigns.map(c => {
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
    } catch (e) {
      container.innerHTML = `
        <div class="panel-card" style="text-align:center;padding:48px;">
          <div style="font-size:48px;margin-bottom:16px;">⚠️</div>
          <h3>Failed to load campaigns</h3>
          <p style="color:var(--text-muted);">${e.message}</p>
          <button onclick="window.loadAdminCampaigns('all')" 
            style="margin-top:16px;background:#DC1F30;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">
            Retry
          </button>
        </div>
      `;
    }
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
        const filterEl = document.getElementById('campaignStatusFilter');
        window.loadAdminCampaigns(filterEl ? filterEl.value : 'all');
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

  // ── Grow Business Pricing (editable price catalog for the vendor-side Grow Business page) ──

  const GROW_PACKAGE_LABELS = {
    whatsapp_leads: 'Get WhatsApp Enquiries',
    more_leads: 'Get More Leads',
    website_sales: 'Increase Website Sales',
  };

  async function renderGrowPricing(store) {
    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Grow Business Pricing</span>
        </div>

        <div class="portal-welcome-banner">
          <div>
            <h2>🏷️ Grow Business Pricing</h2>
            <p>Edit campaign package prices shown to vendors on their Grow Business page. Changes apply immediately.</p>
          </div>
          <div>
            <button class="btn-premium btn-premium-rose" id="btnSaveGrowPricing" onclick="window.saveGrowPricing()">
              <i class="fa-solid fa-floppy-disk"></i> Save All Changes
            </button>
          </div>
        </div>

        <div id="growPricingContainer" style="display:flex;flex-direction:column;gap:20px;">
          <div style="text-align:center;padding:48px;color:var(--text-muted);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-bottom:16px;display:block;"></i>
            Loading pricing…
          </div>
        </div>
      </div>
    `;

    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/public/grow-campaigns-pricing', {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      const data = await res.json();
      const container = document.getElementById('growPricingContainer');
      if (!data.ok || !container) throw new Error('Could not load pricing');

      container.innerHTML = Object.keys(data.pricing).map(key => {
        const pkg = data.pricing[key];
        return `
          <div class="panel-card">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 14px;">
              <h3 style="font-size: 1.05rem; font-weight: 800;">${GROW_PACKAGE_LABELS[key] || key}</h3>
            </div>
            <div class="table-viewport">
              <table class="grid-table">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Price (₹)</th>
                    <th>Strikethrough Price (₹, optional)</th>
                  </tr>
                </thead>
                <tbody>
                  ${pkg.plans.map((tier, idx) => `
                    <tr>
                      <td><strong>${tier.label}</strong>${tier.recommended ? ' <span style="color:#10b981;font-size:0.7rem;">★ Recommended</span>' : ''}</td>
                      <td><input type="number" class="premium-input grow-price-input" data-pkg="${key}" data-idx="${idx}" data-field="price" value="${tier.price}" style="max-width:140px;" /></td>
                      <td><input type="number" class="premium-input grow-price-input" data-pkg="${key}" data-idx="${idx}" data-field="original" value="${tier.original || ''}" placeholder="—" style="max-width:140px;" /></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      const container = document.getElementById('growPricingContainer');
      if (container) container.innerHTML = `<div style="text-align:center;color:#ef4444;padding:24px;">Could not load pricing: ${e.message}</div>`;
    }
  }

  window.saveGrowPricing = async function() {
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
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const auth = window.WedEazzyAuth;
      const token = auth ? auth.getToken() : null;
      const res = await fetch('/api/admin/grow-campaigns-pricing', {
        method: 'PUT',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pricing })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Grow Business pricing updated!', 'success');
      } else {
        showToast('Save failed: ' + (data.message || data.error || 'Error'), 'danger');
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save All Changes'; }
    }
  };

});