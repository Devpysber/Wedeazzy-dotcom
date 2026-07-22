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
    theme: localStorage.getItem("wedeazzy_theme") || "light"
  };

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

  // 3. Application Setup & Lifecycle Initializers
  async function init() {
    setupTheme();
    setupSidebarState();
    setupClock();
    setupAdminProfile();
    bindEvents();
    
    // Sync store with database first
    if (window.WedEazzyStore) {
      await window.WedEazzyStore.sync();
    }
    
    // Render initial page view (default: Dashboard)
    mountTab(state.activeTab);
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

    // Periodic synchronization fallback (every 5 seconds)
    setInterval(async () => {
      if (window.WedEazzyStore) {
        await window.WedEazzyStore.sync();
      }
    }, 5000);
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
              <button class="btn-premium" onclick="window.showToast('Generating financial reports...', 'success')">
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
                    <tr data-txn-client="${t.client.toLowerCase()}">
                      <td><strong>#${t.id}</strong></td>
                      <td><i class="fa-regular fa-calendar"></i> ${t.date}</td>
                      <td>
                        <strong>${t.client}</strong>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">${t.email}</div>
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
                      <tr data-vendor-name="${v.name.toLowerCase()}">
                        <td><strong>#${v.id}</strong></td>
                        <td><strong>${v.name}</strong></td>
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
          window.showToast(res.error || 'Failed to update subscription', 'error');
        }
      });
  };

  // Render AUTOMATED EMAIL triggers
  function renderAutomatedEmail(store) {
    const emailWorkflows = [
      { id: "WF-01", name: "Vendor Registration Welcome", desc: "Dispatched upon verification of the vendor email registration OTP.", template: "welcome-otp.html", active: true },
      { id: "WF-02", name: "Couple OTP Login Sign-In", desc: "Dynamic login security code sent to couple clients.", template: "couple-otp.html", active: true },
      { id: "WF-03", name: "Inquiry Forwarded to Partner", desc: "Sent when an administrator redirects a couple inquiry to the target vendor.", template: "inquiry-forward.html", active: true },
      { id: "WF-04", name: "Booking Confirmed Milestone", desc: "Fires instantly when an administrator approves a booking downpayment in the system.", template: "booking-confirm.html", active: true },
      { id: "WF-05", name: "Account Suspension Warnings", desc: "Triggered upon administrative restriction of user credentials.", template: "user-suspend.html", active: false }
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
              <p>Configure trigger signals, modify SMTP templates, and toggle transactional workflow states.</p>
            </div>
            <button class="btn-premium btn-premium-rose" onclick="window.showToast('Loading SMTP settings...', 'info')">
              <i class="fa-solid fa-gears"></i> SMTP Server Setup
            </button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 16px;">
            ${emailWorkflows.map(wf => `
              <div style="border: 1px solid var(--border-color); padding: 16px 20px; border-radius: 12px; background-color: var(--canvas-bg); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                <div style="flex: 1; min-width: 280px;">
                  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                    <strong style="font-size: 1rem; color: var(--text-main);">${wf.name}</strong>
                    <span class="interactive-pill-badge" style="font-size: 0.65rem; border-color: var(--border-subtle); color: var(--text-muted);">${wf.id}</span>
                  </div>
                  <p style="font-size: 0.77rem; color: var(--text-sub);">${wf.desc}</p>
                  <div style="font-size: 0.72rem; color: var(--brand-rose); font-family: monospace; margin-top: 6px;"><i class="fa-regular fa-file-code"></i> template: templates/emails/${wf.template}</div>
                </div>

                <div style="display: flex; align-items: center; gap: 14px;">
                  <label class="premium-switch-wrap" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                    <input type="checkbox" ${wf.active ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;" onchange="window.showToast('Workflow trigger state modified!', 'success')">
                    <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--border-color); border-radius: 34px; transition: .3s; display: block;" class="slider-toggle-switch"></span>
                  </label>
                  
                  <button class="btn-premium" style="padding: 6px 14px; font-size: 0.78rem;" onclick="window.showToast('Opening HTML draft editor...', 'success')">
                    <i class="fa-regular fa-pen-to-square"></i> Edit Email HTML
                  </button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  }

  // Render CLAIMED LISTINGS
  function renderClaimedListings(store) {
    const list = store.vendors.filter(v => v.claims === "Claim Requested" || v.claims === "Verified Owner");

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
            <input type="text" id="claimSearch" class="premium-input" placeholder="Filter business..." />
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
                      No pending vendor ownership claims currently awaiting review.
                    </td>
                  </tr>
                ` : list.map(c => {
                  const pending = c.claims === "Claim Requested";
                  return `
                    <tr data-claim-name="${c.name.toLowerCase()}">
                      <td><strong>#${c.id}</strong></td>
                      <td><strong>${c.name}</strong></td>
                      <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(244, 63, 94, 0.15); color: var(--brand-rose);">${c.category}</span></td>
                      <td>
                        <div><i class="fa-solid fa-phone"></i> ${c.contact}</div>
                        <div style="font-size: 0.72rem; color: var(--text-muted);"><i class="fa-regular fa-envelope"></i> ${c.email}</div>
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
                            <button class="row-action-icon-btn row-action-reject" title="Reject Claim" onclick="window.showToast('Listing ownership claim rejected.', 'warning')">
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
        </div>
      </div>
    `;

    const search = document.getElementById("claimSearch");
    if (search) {
      search.addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll("#claimTableBody tr").forEach(row => {
          const name = row.getAttribute("data-claim-name");
          if (name) row.style.display = name.includes(q) ? "" : "none";
        });
      });
    }
  }

  // Render CITY Registry
  function renderCity(store) {
    const cities = ["Mumbai", "Bangalore", "Pune", "Delhi", "Goa", "Kolkata", "Chennai"];

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
            <form onsubmit="event.preventDefault(); window.showToast('Registered new operational city!', 'success');" style="display: flex; flex-direction: column; gap: 12px;">
              <div class="modal-form-group">
                <label>City Name (India)</label>
                <input type="text" class="premium-input" placeholder="e.g. Pune" required />
              </div>
              <div class="modal-form-group">
                <label>State Code / Region</label>
                <input type="text" class="premium-input" placeholder="e.g. MH" required />
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
                    <th>Status</th>
                    <th style="text-align: right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${cities.map((city, index) => `
                    <tr>
                      <td><strong>#CT-${100 + index}</strong></td>
                      <td><strong>${city}</strong></td>
                      <td><code>/${city.toLowerCase()}</code></td>
                      <td>
                        <span class="status-pill status-confirmed">
                          <span class="status-bullet-dot"></span> Active
                        </span>
                      </td>
                      <td style="text-align: right;">
                        <button class="row-action-icon-btn row-action-reject" title="Revoke City" onclick="window.showToast('City revoked from active listing queries.', 'warning')">
                          <i class="fa-solid fa-ban"></i>
                        </button>
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

  // Render REGIONS list
  function renderRegions(store) {
    const regions = [
      { id: "RG-01", name: "South Mumbai", city: "Mumbai", pincodes: 4 },
      { id: "RG-02", name: "Andheri West", city: "Mumbai", pincodes: 6 },
      { id: "RG-03", name: "Jayanagar", city: "Bangalore", pincodes: 3 },
      { id: "RG-04", name: "Koramangala", city: "Bangalore", pincodes: 5 },
      { id: "RG-05", name: "Koregaon Park", city: "Pune", pincodes: 3 },
      { id: "RG-06", name: "Connaught Place", city: "Delhi", pincodes: 4 }
    ];

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Region Suburbs</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-top: 15px;">
          <!-- Add Region Form -->
          <div class="panel-card" style="height: fit-content;">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 14px;">
              <h3 style="font-size: 1.1rem; font-weight: 800;">Register Suburb Area</h3>
            </div>
            <form onsubmit="event.preventDefault(); window.showToast('Added suburb region area successfully!', 'success');" style="display: flex; flex-direction: column; gap: 12px;">
              <div class="modal-form-group">
                <label>Suburb Name</label>
                <input type="text" class="premium-input" placeholder="e.g. Bandra Bandstand" required />
              </div>
              <div class="modal-form-group">
                <label>Operational Parent City</label>
                <select class="premium-select" required>
                  <option value="Mumbai">Mumbai</option>
                  <option value="Bangalore">Bangalore</option>
                  <option value="Pune">Pune</option>
                  <option value="Delhi">Delhi</option>
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
                    <th>Active Pincode Locks</th>
                    <th style="text-align: right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${regions.map(r => `
                    <tr>
                      <td><strong>#${r.id}</strong></td>
                      <td><strong>${r.name}</strong></td>
                      <td><i class="fa-solid fa-city" style="color: var(--text-muted); font-size: 0.8rem;"></i> ${r.city}</td>
                      <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700;">${r.pincodes} Locked Slots</span></td>
                      <td style="text-align: right;">
                        <button class="row-action-icon-btn row-action-reject" onclick="window.showToast('Region deleted.', 'warning')"><i class="fa-solid fa-trash-can"></i></button>
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
            <form onsubmit="event.preventDefault(); window.showToast('Venue category added successfully!', 'success');" style="display: flex; flex-direction: column; gap: 12px;">
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
                <h3>Operational Venue Categories</h3>
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
                      <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(244, 63, 94, 0.15); color: var(--brand-rose);">${c.count} Banquet Listings</span></td>
                      <td style="text-align: right;">
                        <button class="row-action-icon-btn row-action-reject" onclick="window.showToast('Category deleted.', 'warning')"><i class="fa-solid fa-trash-can"></i></button>
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
    const cats = [
      { name: "Wedding Photographers", slug: "wedding-photographers", count: 4 },
      { name: "Bridal Makeup Artists", slug: "bridal-makeup-artists", count: 3 },
      { name: "Catering Services", slug: "catering-services", count: 2 },
      { name: "Mehendi Designers", slug: "mehendi-designers", count: 2 },
      { name: "Decorators & Stage Lights", slug: "decorators-stage-lights", count: 2 }
    ];

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
            <form onsubmit="event.preventDefault(); window.showToast('Vendor category added successfully!', 'success');" style="display: flex; flex-direction: column; gap: 12px;">
              <div class="modal-form-group">
                <label>Category Label</label>
                <input type="text" class="premium-input" placeholder="e.g. Wedding Choreographers" required />
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
                <tbody>
                  ${cats.map((c, idx) => `
                    <tr>
                      <td><strong>#SC-${300 + idx}</strong></td>
                      <td><strong>${c.name}</strong></td>
                      <td><code>/${c.slug}</code></td>
                      <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(59, 130, 246, 0.15); color: var(--brand-blue);">${c.count} Professional Tenders</span></td>
                      <td style="text-align: right;">
                        <button class="row-action-icon-btn row-action-reject" onclick="window.showToast('Category deleted.', 'warning')"><i class="fa-solid fa-trash-can"></i></button>
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
        return `
          <div style="border: 1px solid var(--border-color); padding: 14px; border-radius: 10px; background-color: var(--canvas-bg);">
            <div style="display: flex; justify-content: space-between; font-size: 0.77rem; margin-bottom: 4px;">
              <strong>${escapeHtmlUi(c.name)}</strong>
              <span style="color: ${status.color}; font-weight: bold;">${status.text}</span>
            </div>
            <p style="font-size: 0.72rem; color: var(--text-sub);">Subject: ${escapeHtmlUi(c.subject)}</p>
            <div style="display: flex; gap: 16px; font-size: 0.68rem; color: var(--text-muted); margin-top: 6px;">
              <span>Sent: ${c.sentCount}/${c.totalRecipients} (${segmentLabels[c.segment] || c.segment})</span>
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
                <select id="emailSegment" class="premium-select" required>
                  <option value="all">All Accounts (Couples & Vendors)</option>
                  <option value="vendors">Registered Wedding Vendors Only</option>
                  <option value="couples">Couples Planning Weddings Only</option>
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

    window.triggerEmailBroadcast = async function() {
      const emailCampaignName = document.getElementById("emailCampaignName");
      const emailSegment = document.getElementById("emailSegment");
      const emailSubject = document.getElementById("emailSubject");
      const emailBody = document.getElementById("emailBody");
      const statusEl = document.getElementById("emailBroadcastStatus");
      const btn = document.getElementById("btnDispatchBroadcast");

      const name = emailCampaignName ? emailCampaignName.value : "";
      const segment = emailSegment ? emailSegment.value : "all";
      const sub = emailSubject ? emailSubject.value : "";
      const body = emailBody ? emailBody.value : "";

      if (!name || !sub || !body) {
        showToast("Please fill all campaign details first!", "danger");
        return;
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
    const articles = [
      { id: "BL-101", title: "10 Most Beautiful Beachfront Banquets in Mumbai", count: 884, likes: 212, date: "May 25, 2026" },
      { id: "BL-102", title: "Catering Menu Trends for Luxury Indian Weddings", count: 412, likes: 98, date: "May 23, 2026" },
      { id: "BL-103", title: "Complete Checklist: How to Pair Wedding Photographers", count: 1202, likes: 310, date: "May 18, 2026" }
    ];

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
              <tbody>
                ${articles.map(art => `
                  <tr>
                    <td><strong>#${art.id}</strong></td>
                    <td><strong>${art.title}</strong></td>
                    <td><i class="fa-regular fa-clock"></i> ${art.date}</td>
                    <td><strong>${art.count.toLocaleString()} Views</strong></td>
                    <td><span style="color: var(--brand-rose);"><i class="fa-solid fa-heart"></i> ${art.likes}</span></td>
                    <td>
                      <span class="status-pill status-confirmed">
                        <span class="status-bullet-dot"></span> Live
                      </span>
                    </td>
                    <td style="text-align: right;">
                      <button class="row-action-icon-btn" onclick="window.showToast('Loading draft...', 'success')"><i class="fa-solid fa-pen-to-square"></i></button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    window.triggerBlogEditor = function() {
      const bodyHTML = `
        <form style="display: flex; flex-direction: column; gap: 12px;">
          <div class="modal-form-group">
            <label>SEO Article Title</label>
            <input type="text" class="premium-input" placeholder="e.g. Planning a destination wedding under budget..." required />
          </div>
          <div class="modal-form-group">
            <label>SEO Meta Description Tag</label>
            <input type="text" class="premium-input" placeholder="Brief summary for Google search pages..." required />
          </div>
          <div class="modal-form-group">
            <label>Blog Content Text</label>
            <textarea class="premium-input" style="height: 120px; resize: none;" placeholder="Write article content here..."></textarea>
          </div>
        </form>
      `;
      const footerHTML = `
        <button class="btn-premium" onclick="window.closeModal()">Close</button>
        <button class="btn-premium btn-premium-rose" onclick="window.closeModal(); window.showToast('SEO blog post queued successfully!', 'success');">Publish Article</button>
      `;
      openModal("Draft SEO Blog Article", bodyHTML, footerHTML);
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
                <tr data-inq-name="${(inq.name || '').toLowerCase()}">
                  <td><strong>#${inq.id.slice(-8).toUpperCase()}</strong></td>
                  <td>
                    <div style="font-weight: 700;">${inq.name || 'Anonymous'}</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted);"><i class="fa-solid fa-phone"></i> ${inq.phone || '—'}</div>
                  </td>
                  <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(59, 130, 246, 0.15); color: var(--brand-blue);">${inq.vendor ? inq.vendor.businessName : '—'}</span></td>
                  <td>
                    <div style="font-size: 0.75rem; color: var(--text-sub); max-width: 320px; white-space: normal; line-height: 1.4;">
                      "${inq.notes || inq.budget || inq.guests || 'No additional notes provided.'}"
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
          <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;margin-bottom:16px;display:block;color:#E11D2A;"></i>
          <p style="font-weight:700;">Failed to load inquiries</p>
          <p style="color:var(--text-muted);">${e.message}</p>
          <button onclick="window.loadAdminInquiries()"
            style="margin-top:16px;background:#E11D2A;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">
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

  // Render WHATSAPP CONNECTION STATUS
  function renderWhatsAppStatus(store) {
    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>WhatsApp Connection Status</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 15px;">
          <!-- Left side: Status badge & pairing QR trigger -->
          <div class="panel-card" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 35px 20px;">
            <div style="background-color: rgba(37, 211, 102, 0.08); width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #25D366; font-size: 2.5rem; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.1);">
              <i class="fa-brands fa-whatsapp"></i>
            </div>
            
            <h3 style="font-size: 1.25rem; font-weight: 800;">Baileys Engine Gateway</h3>
            <p style="font-size: 0.77rem; color: var(--text-sub); margin-top: 6px;">Connects automated notifications directly to active WhatsApp numbers.</p>

            <div style="margin: 20px 0; width: 100%;">
              <div id="waLiveStatusBadge" style="display: inline-flex; align-items: center; gap: 8px; background-color: rgba(245, 158, 11, 0.08); color: #f59e0b; padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">
                <span class="status-bullet-dot" style="background-color: #f59e0b; width: 8px; height: 8px; border-radius: 50%;"></span> Connecting...
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
              <button class="btn-premium btn-premium-rose" style="width: 100%; justify-content: center;" onclick="window.open('/api/whatsapp/qr?token=' + encodeURIComponent(window.WedEazzyAuth.getToken()), '_blank')">
                <i class="fa-solid fa-qrcode"></i> Scan Connection QR Code
              </button>
              <button class="btn-premium" style="width: 100%; justify-content: center;" onclick="window.pingWhatsAppStatus()">
                <i class="fa-solid fa-arrows-rotate"></i> Check Connection Live
              </button>
            </div>
          </div>

          <!-- Right side: outbound messaging test & diagnostics logs -->
          <div class="panel-card">
            <div class="panel-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 12px; margin-bottom: 14px;">
              <h3 style="font-size: 1.15rem; font-weight: 800;">WhatsApp Diagnostics & Outbound Test Panel</h3>
            </div>
            
            <form id="formWaTest" style="display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 20px; margin-bottom: 15px;">
              <div class="modal-form-group">
                <label>Test Recipient Mobile (+91...)</label>
                <input type="text" id="waTestTo" class="premium-input" placeholder="+91 74989 87620" required />
              </div>
              <div class="modal-form-group">
                <label>Text Message Body</label>
                <input type="text" id="waTestBody" class="premium-input" placeholder="Hi! This is a secure automated diagnostic signal from WedEazzy admin." required />
              </div>
              <button class="btn-premium btn-premium-rose" type="button" onclick="window.sendWaTestMsg()" style="justify-content: center; width: fit-content; align-self: flex-end;">
                <i class="fa-solid fa-paper-plane"></i> Outbound Test Message
              </button>
            </form>

            <div>
              <h4 style="font-size: 0.85rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">Active Server Status Logs</h4>
              <div id="waServerLogs" style="background-color: var(--canvas-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; font-family: monospace; font-size: 0.72rem; color: var(--text-sub); display: flex; flex-direction: column; gap: 4px; height: 100px; overflow-y: auto;">
                <div>[SYSTEM] Initializing diagnostics test engine.</div>
                <div>[SYSTEM] Probing Express Baileys state controller...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    window.pingWhatsAppStatus = async function() {
      const badge = document.getElementById("waLiveStatusBadge");
      const logs = document.getElementById("waServerLogs");
      if (!badge) return;

      try {
        const res = await fetch('/api/whatsapp/status').then(r => r.json());
        const status = res.status || "disconnected";
        
        let color = "#f59e0b";
        let text = "Connecting...";
        
        if (status === "online") {
          color = "#10b981";
          text = "WhatsApp Online";
        } else if (status === "disconnected") {
          color = "#ef4444";
          text = "Disconnected";
        }

        badge.style.backgroundColor = `rgba(${color === '#10b981' ? '16,185,129' : '239,68,68'}, 0.08)`;
        badge.style.color = color;
        badge.innerHTML = `<span class="status-bullet-dot" style="background-color: ${color}; width: 8px; height: 8px; border-radius: 50%;"></span> ${text}`;
        
        if (logs) {
          logs.innerHTML += `<div>[PROBE] status check: <strong>${status.toUpperCase()}</strong></div>`;
          logs.scrollTop = logs.scrollHeight;
        }
      } catch (e) {
        badge.style.color = "#ef4444";
        badge.innerHTML = `<span class="status-bullet-dot" style="background-color: #ef4444; width: 8px; height: 8px; border-radius: 50%;"></span> Probe Error`;
        if (logs) {
          logs.innerHTML += `<div style="color:#ef4444;">[PROBE] Failed to request status from Express backend.</div>`;
        }
      }
    };

    window.sendWaTestMsg = async function() {
      const to = document.getElementById("waTestTo").value;
      const body = document.getElementById("waTestBody").value;
      const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");

      if (!to || !body) {
        showToast("Fill test fields first!", "danger");
        return;
      }

      showToast("Dispatching test message...", "info");

      try {
        const res = await fetch('/api/whatsapp/test-send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ to, body })
        }).then(r => r.json());

        if (res.ok) {
          showToast("WhatsApp test message dispatched successfully!", "success");
        } else {
          showToast(`Outbound failed: ${res.message || 'unknown'}`, "danger");
        }
      } catch (e) {
        showToast("Failed to request outbound test service.", "danger");
      }
    };

    window.pingWhatsAppStatus();
  }

  // -------------------------------------------------------------
  // TAB RENDERING ENGINES
  // -------------------------------------------------------------

  // Render DASHBOARD (Tab 1)
  function renderDashboard(store) {
    const stats = store.stats;
    const recentLogs = store.logs.slice(0, 4);

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
                    <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(244, 63, 94, 0.15); color: var(--brand-rose); font-weight: 600;">${b.eventType}</span></td>
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
          
          <div style="display: flex; align-items: center; gap: 10px; margin-top: 2px;">
            <div style="background-color: var(--surface-bg); border: 1px solid var(--border-color); padding: 8px 14px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; color: var(--text-main); box-shadow: var(--shadow-box);">
              👋 Hi! How can we help?
            </div>
            <button class="concierge-floating-btn" style="background-color: #25D366; color: white; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3); border: none; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.35rem; cursor: pointer; position: relative;" onclick="window.triggerDirectWAModal()">
              <i class="fa-brands fa-whatsapp"></i>
              <span class="concierge-badge-count" style="background-color: #ef4444; border: 2px solid white; width: 16px; height: 16px; border-radius: 50%; font-size: 0.55rem; color: white; display: flex; align-items: center; justify-content: center; position: absolute; top: -2px; right: -2px; font-weight: 800;">1</span>
            </button>
          </div>
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
              <h3>Client Bookings Registry</h3>
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
                ${list.map(b => `
                  <tr data-booking-row-id="${b.id}" data-client-name="${b.clientName.toLowerCase()}" data-status="${b.status}">
                    <td><strong>#${b.id}</strong></td>
                    <td>
                      <div style="font-weight: 600;">${b.clientName}</div>
                      <div style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">${b.notes || 'No extra guidelines provided.'}</div>
                    </td>
                    <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(244, 63, 94, 0.15); color: var(--brand-rose);">${b.eventType}</span></td>
                    <td>${b.venue}</td>
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
  window.handleBookingStatus = function(id, status) {
    window.WedEazzyStore.updateBookingStatus(id, status);
    showToast(`Booking #${id} updated to ${status.toUpperCase()}!`, status === "confirmed" ? "success" : "warning");
    renderActiveView(); // Hot reload table
  };

  // Render VENUES (Tab 3)
  function renderVenues(store) {
    const venues = store.venues;

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Venue Manager</span>
        </div>

        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3>Banquet Halls & Lawns Directory</h3>
              <p>Approve claims, configure capacities, verify locations, and adjust daily costs.</p>
            </div>
            <div class="panel-controls">
              <input type="text" id="venueSearch" class="premium-input" placeholder="Search venue name..." />
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
                ${venues.map(v => `
                  <tr data-venue-name="${v.name.toLowerCase()}">
                    <td><strong>#${v.id}</strong></td>
                    <td>
                      <div style="font-weight: 600;">${v.name}</div>
                      <div style="font-size: 0.72rem; color: var(--text-muted);"><i class="fa-solid fa-star" style="color: var(--brand-gold);"></i> ${v.rating} Star score</div>
                    </td>
                    <td><i class="fa-solid fa-location-dot" style="color: var(--text-muted);"></i> ${v.location}</td>
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
        </div>
      </div>
    `;

    const search = document.getElementById("venueSearch");
    if (search) {
      search.addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll("#venuesTableBody tr").forEach(row => {
          const name = row.getAttribute("data-venue-name");
          row.style.display = name.includes(q) ? "" : "none";
        });
      });
    }
  }

  window.handleVenueStatus = function(id, status) {
    window.WedEazzyStore.updateVenueStatus(id, status);
    showToast(`Venue #${id} status set to ${status.toUpperCase()}!`, status === "approved" ? "success" : "warning");
    renderActiveView();
  };

  window.handleClaimListing = function(type, id) {
    window.WedEazzyStore.claimListing(type, id);
    showToast(`${type.toUpperCase()} #${id} claims verification granted!`, "success");
    renderActiveView();
  };

  // Render VENDORS (Tab 4)
  function renderVendors(store) {
    const vendors = store.vendors;

    el.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i> <span>Vendor Manager</span>
        </div>

        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title-group">
              <h3>Partner Service Vendors Registry</h3>
              <p>Oversee wedding photographers, catering services, decorators, sound systems, and make-up stars.</p>
            </div>
            <div class="panel-controls">
              <input type="text" id="vendorSearch" class="premium-input" placeholder="Search name/category..." />
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
                ${vendors.map(v => `
                  <tr data-vendor-name="${(v.name || '').toLowerCase()} ${(v.category || '').toLowerCase()} ${(v.vendorName || '').toLowerCase()} ${(v.email || '').toLowerCase()}">
                    <td><strong>#${v.id}</strong></td>
                    <td>${v.vendorName || '—'}</td>
                    <td>
                      <div style="font-weight: 600;">${v.name}</div>
                      <div style="font-size: 0.72rem; color: var(--text-muted);"><i class="fa-solid fa-star" style="color: var(--brand-gold);"></i> ${v.rating} average feedback</div>
                    </td>
                    <td><span class="interactive-pill-badge" style="font-size: 0.7rem; border-color: rgba(59, 130, 246, 0.15); color: var(--brand-blue);">${v.category}</span></td>
                    <td>${v.address || '—'}</td>
                    <td><i class="fa-solid fa-phone"></i> ${v.contact}</td>
                    <td><i class="fa-regular fa-envelope"></i> ${v.email}</td>
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
        </div>
      </div>
    `;

    const search = document.getElementById("vendorSearch");
    if (search) {
      search.addEventListener("input", (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll("#vendorsTableBody tr").forEach(row => {
          const content = row.getAttribute("data-vendor-name");
          row.style.display = content.includes(q) ? "" : "none";
        });
      });
    }
  }

  window.handleVendorStatus = function(id, status) {
    window.WedEazzyStore.updateVendorStatus(id, status);
    showToast(`Vendor #${id} status set to ${status.toUpperCase()}!`, status === "approved" ? "success" : "warning");
    renderActiveView();
  };

  window.handleDeleteVendor = async function(id) {
    if (!confirm(`Are you sure you want to permanently delete vendor listing #${id}?`)) return;
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
              <h3>System Users Accounts</h3>
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
                ${users.map(u => `
                  <tr data-user-content="${u.name.toLowerCase()} ${u.email.toLowerCase()}">
                    <td><strong>#${u.id}</strong></td>
                    <td><strong>${u.name}</strong></td>
                    <td><i class="fa-regular fa-envelope"></i> ${u.email}</td>
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

  window.handleUserStatus = function(id, status) {
    window.WedEazzyStore.updateUserStatus(id, status);
    showToast(`User Account #${id} is now ${status.toUpperCase()}!`, status === "active" ? "success" : "warning");
    renderActiveView();
  };

  // Render WHATSAPP CENTER (Tab 6) — wired to real API
  function renderWhatsApp(store) {
    const campaigns = store.whatsappCampaigns;

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
              ${campaigns.length === 0 ? `
                <div style="text-align:center;padding:40px 0;color:var(--text-muted);">
                  <i class="fa-brands fa-whatsapp" style="font-size:2rem;margin-bottom:12px;display:block;color:#25D366;"></i>
                  No campaigns yet. Use the Broadcast button to launch one.
                </div>
              ` : campaigns.map(c => {
                const openRatio = c.sentCount > 0 ? Math.round((c.openCount / c.sentCount) * 100) : 0;
                return `
                  <div style="border:1px solid var(--border-color);padding:16px;border-radius:12px;background-color:var(--canvas-bg);">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                      <div>
                        <strong style="font-size:0.9rem;">${c.name}</strong>
                        <div style="font-size:0.72rem;color:var(--text-muted);"><i class="fa-solid fa-message"></i> Template: "${c.template}"</div>
                      </div>
                      <span class="status-pill status-${c.status === 'completed' ? 'confirmed' : 'pending'}">${c.status}</span>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px;font-size:0.77rem;text-align:center;">
                      <div style="border-right:1px solid var(--border-color);">
                        <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Sent Out</div>
                        <strong style="font-size:1.05rem;">${c.sentCount}</strong>
                      </div>
                      <div style="border-right:1px solid var(--border-color);">
                        <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Open (Ratios)</div>
                        <strong style="font-size:1.05rem;color:#10b981;">${c.openCount} (${openRatio}%)</strong>
                      </div>
                      <div>
                        <div style="font-size:0.65rem;text-transform:uppercase;color:var(--text-muted);">Replies</div>
                        <strong style="font-size:1.05rem;color:var(--brand-rose);">${c.replyCount}</strong>
                      </div>
                    </div>
                  </div>`;
              }).join("")}
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

    // Load real delivery logs from backend
    _loadWaLogs('waLiveLogs');
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
                <h3>Commission Pipelines ($)</h3>
              </div>
            </div>
            <div class="canvas-container" style="height: 250px;">
              <canvas id="chartRevenue"></canvas>
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-header">
              <div class="panel-title-group">
                <h3>Monthly Bookings Volume</h3>
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
          <input type="number" id="mb_budget" class="premium-input" placeholder="e.g. 12000" required />
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
          <label for="mv_address">Region Address</label>
          <input type="text" id="mv_address" class="premium-input" placeholder="Mumbai, MH" required />
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitAddVendor()">Approve Vendor</button>
    `;

    openModal("Pre-approve Service Vendor", bodyHTML, footerHTML);
  };

  window.submitAddVendor = function() {
    const name = document.getElementById("mv_name").value;
    const cat = document.getElementById("mv_category").value;
    const phone = document.getElementById("mv_contact").value;
    const email = document.getElementById("mv_email").value;
    const addr = document.getElementById("mv_address").value;

    if (!name || !phone || !email || !addr) {
      showToast("Please fill all required inputs!", "danger");
      return;
    }

    window.WedEazzyStore.addVendor({
      name: name,
      category: cat,
      contact: phone,
      email: email,
      address: addr,
      status: "approved" // Pre-approved in admin concierge action
    });

    showToast(`Service partner '${name}' approved successfully!`, "success");
    closeModal();
    renderActiveView();
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
          <input type="number" id="mve_capacity" class="premium-input" placeholder="e.g. 1000" required />
        </div>
        <div class="modal-form-group">
          <label for="mve_price">Rent Per Day ($)</label>
          <input type="number" id="mve_price" class="premium-input" placeholder="e.g. 7500" required />
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

  window.submitAddVenue = function() {
    const name = document.getElementById("mve_name").value;
    const loc = document.getElementById("mve_location").value;
    const cap = document.getElementById("mve_capacity").value;
    const price = document.getElementById("mve_price").value;
    const email = document.getElementById("mve_contact").value;

    if (!name || !loc || !cap || !price || !email) {
      showToast("Please fill all required inputs!", "danger");
      return;
    }

    window.WedEazzyStore.addVenue({
      name: name,
      location: loc,
      capacity: Number(cap),
      price: Number(price),
      contact: email,
      status: "approved"
    });

    showToast(`Venue '${name}' registered successfully!`, "success");
    closeModal();
    renderActiveView();
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
          <label for="mwa_template">Message Copy Template</label>
          <select id="mwa_template" class="premium-select" required>
            <option value="Bridal Special - 15% Off">Bridal Special - 15% Off Promo</option>
            <option value="Complete your WedEazzy Profile">Profile Completion reminder</option>
            <option value="Premium Venues Showcase Alert">Venue Showcase broadcast</option>
          </select>
        </div>
        <div class="modal-form-group">
          <label for="mwa_count">Recipient Target Size</label>
          <input type="number" id="mwa_count" class="premium-input" value="120" required />
        </div>
      </form>
    `;

    const footerHTML = `
      <button class="btn-premium" onclick="window.closeModal()">Close</button>
      <button class="btn-premium btn-premium-rose" onclick="window.submitWhatsAppCampaign()">Deploy Blast</button>
    `;

    openModal("Launch WhatsApp Broadcast", bodyHTML, footerHTML);
  };

  window.submitWhatsAppCampaign = async function() {
    const name = document.getElementById("mwa_name").value;
    const temp = document.getElementById("mwa_template").value;
    const count = document.getElementById("mwa_count").value;

    if (!name || !count) {
      showToast("Please fill all campaign fields!", "danger");
      return;
    }

    const btn = document.querySelector('[onclick="window.submitWhatsAppCampaign()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      const apiFetch = window.WedEazzyAuth ? window.WedEazzyAuth.apiFetch.bind(window.WedEazzyAuth) : fetch;
      const r = await apiFetch('/api/whatsapp/campaign', {
        method: 'POST',
        body: { name: name, template: temp, recipientCount: Number(count) }
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        showToast(`WhatsApp Campaign "${name}" queued to ${d.queued} recipient(s)!`, "success");
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
        rejected: { bg: 'rgba(225,29,42,0.1)', color: '#E11D2A' }
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
                      <span>🏪 <strong>${vendorName}</strong></span>
                      <span>📧 ${vendorEmail}</span>
                      <span>📱 ${vendorPhone}</span>
                      <span>📅 ${createdAt}</span>
                    </div>
                  </div>
                  <div style="font-size:18px;font-weight:800;color:#E11D2A;">${c.totalAmount ? '₹' + parseInt(c.totalAmount).toLocaleString('en-IN') : '—'}</div>
                </div>

                <!-- Campaign Details -->
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;background:var(--canvas-bg);border-radius:10px;padding:14px;margin-bottom:16px;font-size:13px;">
                  <div><span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:700;">Plan Duration</span><div style="font-weight:700;color:var(--text-main);">${c.planDays ? c.planDays + ' Days' : 'Custom'}</div></div>
                  <div><span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:700;">Payment Method</span><div style="font-weight:700;color:var(--text-main);">${(c.paymentMethod || '—').replace('_', ' ')}</div></div>
                  <div><span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:700;">Gender</span><div style="font-weight:700;color:var(--text-main);">${c.gender || 'All'}</div></div>
                  <div><span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:700;">Age Range</span><div style="font-weight:700;color:var(--text-main);">${c.ageMin || 18}–${c.ageMax || 65}</div></div>
                  <div><span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:700;">Time Schedule</span><div style="font-weight:700;color:var(--text-main);">${c.timeSchedule === 'whole_day' ? 'Whole Day' : (c.startTime + ' – ' + c.endTime)}</div></div>
                  <div><span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;font-weight:700;">Payment Status</span><div style="font-weight:700;color:${c.paymentStatus === 'paid' ? '#059669' : c.paymentStatus === 'failed' ? '#E11D2A' : '#D97706'};">${c.paymentStatus || 'pending'}</div></div>
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
                <div style="background:rgba(225,29,42,0.04);border:1.5px solid rgba(225,29,42,0.12);border-radius:10px;padding:14px;margin-bottom:16px;">
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
                    style="background:rgba(225,29,42,0.08);color:#E11D2A;border:1.5px solid #E11D2A;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s;">
                    ✖ Reject
                  </button>
                  <button onclick="window.adminSaveAnalytics('${c.id}')"
                    style="margin-left:auto;background:#E11D2A;color:#fff;border:none;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all 0.2s;">
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
            style="margin-top:16px;background:#E11D2A;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">
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

});
