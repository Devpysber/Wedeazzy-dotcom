/**
 * WedEazzy Admin — Approve Businesses (Vendor CRM) module
 * ======================================================
 * Owns the five views reworked in this update:
 *   • vendor-crm-dashboard  — KPI deck + charts in one screen
 *   • vendors               — All Businesses registry with a real filter bar
 *   • invitations           — ONLY listings we have actually invited
 *   • claimed-listings      — stat cards + only claimed listings
 *   • import-listings       — CSV import wizard with duplicate filtering
 *
 * Lives in its own file rather than being appended to the 6,000-line app.js so
 * these views can be reasoned about (and reverted) independently. app.js hands
 * control over via window.WedEazzyCRM.render*(store, ctx), passing the helpers
 * (escHtml, showToast, openModal, …) it already owns rather than duplicating them.
 */

(function () {
  "use strict";

  const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:4000'
    : window.location.origin;

  // ctx is injected by app.js on first render — see WedEazzyCRM.attach().
  let ctx = {
    escHtml: (s) => String(s == null ? '' : s),
    escJsAttr: (s) => String(s == null ? '' : s),
    showToast: (m) => console.log(m),
    openModal: () => {},
    closeModal: () => {},
    portalBody: null,
    rerender: () => {},
  };

  // Chart.js instances, keyed by canvas id, so a re-render disposes the old
  // chart instead of leaking it (Chart.js keeps a global registry per canvas
  // and throws "Canvas is already in use" otherwise).
  const chartRegistry = {};

  function destroyChart(id) {
    if (chartRegistry[id]) {
      try { chartRegistry[id].destroy(); } catch (_) { /* already gone */ }
      delete chartRegistry[id];
    }
  }

  function destroyAllCharts() {
    Object.keys(chartRegistry).forEach(destroyChart);
  }

  function matchesCountryScope(v, scope) {
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
  }

  function renderCrmCountryScopeHeader() {
    const rawScope = window.WedEazzyCountryScope || 'all';
    const currentScope = rawScope.toUpperCase();
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; background: var(--surface-bg); padding: 14px 20px; border-radius: 14px; border: 1px solid var(--border-color); margin-bottom: 20px; flex-wrap: wrap; gap: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(220, 31, 48, 0.1); color: var(--brand-rose); display: flex; align-items: center; justify-content: center; font-size: 1.15rem;">
            🌐
          </div>
          <div>
            <div style="font-size: 0.92rem; font-weight: 800; color: var(--text-main);">Country Scope & Filter</div>
            <div style="font-size: 0.76rem; color: var(--text-sub);">Filter business registry & moderation data dynamically</div>
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
  }

  /* ============================================================
     View state — persists across re-renders within a session
     ============================================================ */
  const view = {
    vendors:     { page: 1, pageSize: 15, search: '', category: '', city: '', country: '', approval: '', plan: '', dateFrom: '', selected: new Set() },
    invitations: { page: 1, pageSize: 15, search: '', channel: '', selected: new Set() },
    claimed:     { page: 1, pageSize: 15, search: '', status: '' },
    importer:    {
      step: 1, file: null, importId: null, preview: null, result: null, busy: false,
      targetCountry: null,
      customMapping: {}, excludedCities: new Set(), excludedCategories: new Set(),
      duplicateAction: 'skip',
      filters: { onlyPhone: false, onlyEmail: false, onlyWebsite: false, minRating: 0, minCompleteness: 0 },
      history: null,
    },
  };

  const PAGE_SIZE = 15;

  /* ============================================================
     Utilities
     ============================================================ */
  const esc = (s) => ctx.escHtml(s);

  function fmtNum(n) {
    return Number(n || 0).toLocaleString('en-IN');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function relTime(iso) {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff)) return null;
    const day = 86400000;
    if (diff < 3600000) return 'just now';
    if (diff < day) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
    if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
    return `${Math.floor(diff / (365 * day))}y ago`;
  }

  function initials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w.charAt(0))
      .join('') || '?';
  }

  function authToken() {
    return localStorage.getItem('wedeazzy_admin_token') || sessionStorage.getItem('wedeazzy_admin_token') || '';
  }

  /** Paginate a filtered list. Clamps the page so a shrinking filter can't strand the user. */
  function paginate(list, page, size) {
    const total = Math.max(1, Math.ceil(list.length / size));
    const current = Math.min(Math.max(1, page), total);
    const start = (current - 1) * size;
    return { items: list.slice(start, start + size), total, current, count: list.length };
  }

  function pager(current, total, fnName, currentSize = 15, setSizeFn = 'setVendorPageSize') {
    const btn = (p, label, disabled, active) => `
      <button class="wz-btn-sm ${active ? 'brand' : 'ghost'}" ${disabled ? 'disabled' : ''}
              onclick="${disabled ? '' : `window.WedEazzyCRM.${fnName}(${p})`}">${label}</button>`;
    const nums = [];
    const from = Math.max(1, current - 2);
    const to = Math.min(total, current + 2);
    if (from > 1) nums.push(btn(1, '1', false, false));
    if (from > 2) nums.push('<span style="color:var(--text-muted);padding:0 4px;">…</span>');
    for (let p = from; p <= to; p++) nums.push(btn(p, String(p), false, p === current));
    if (to < total - 1) nums.push('<span style="color:var(--text-muted);padding:0 4px;">…</span>');
    if (to < total) nums.push(btn(total, String(total), false, false));

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 16px 8px;border-top:1px solid var(--border-color, rgba(0,0,0,0.06));margin-top:12px;">
        <div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:var(--text-muted, #6b7280);font-weight:600;">
          <span>Show</span>
          <select class="wz-select-sm" style="padding:4px 10px;border-radius:8px;font-weight:700;font-size:0.82rem;background:var(--surface-bg, #fff);color:var(--text-main);border:1.5px solid var(--border-color, #e5e7eb);cursor:pointer;outline:none;"
                  onchange="window.WedEazzyCRM.${setSizeFn}(this.value)">
            <option value="15" ${Number(currentSize) === 15 ? 'selected' : ''}>15 per page</option>
            <option value="25" ${Number(currentSize) === 25 ? 'selected' : ''}>25 per page</option>
            <option value="50" ${Number(currentSize) === 50 ? 'selected' : ''}>50 per page</option>
            <option value="100" ${Number(currentSize) === 100 ? 'selected' : ''}>100 per page</option>
          </select>
          <span>listings</span>
        </div>

        ${total > 1 ? `
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          ${btn(current - 1, '<i class="fa-solid fa-chevron-left"></i>', current === 1, false)}
          ${nums.join('')}
          ${btn(current + 1, '<i class="fa-solid fa-chevron-right"></i>', current === total, false)}
        </div>` : ''}
      </div>`;
  }

  function kpi(opts) {
    const { label, value, icon, accent, sub, bar } = opts;
    return `
      <div class="wz-kpi" style="--kpi-accent:${accent};">
        <div class="wz-kpi-head">
          <div class="wz-kpi-label">${esc(label)}</div>
          <div class="wz-kpi-icon"><i class="${icon}"></i></div>
        </div>
        <div class="wz-kpi-value">${value}</div>
        ${sub ? `<div class="wz-kpi-sub">${sub}</div>` : ''}
        ${bar != null ? `<div class="wz-kpi-bar"><i data-bar-fill="${Math.max(0, Math.min(100, bar))}"></i></div>` : ''}
      </div>`;
  }

  /** Animate every progress bar/dist fill once the markup is in the DOM. */
  function animateBars(root) {
    const scope = root || document;
    requestAnimationFrame(() => {
      scope.querySelectorAll('[data-bar-fill]').forEach(el => {
        el.style.width = el.getAttribute('data-bar-fill') + '%';
      });
      scope.querySelectorAll('[data-dist-fill]').forEach(el => {
        el.style.width = el.getAttribute('data-dist-fill') + '%';
      });
    });
  }

  function emptyState(icon, title, body) {
    return `
      <div class="wz-empty">
        <div class="wz-empty-icon"><i class="${icon}"></i></div>
        <h4>${esc(title)}</h4>
        <p>${esc(body)}</p>
      </div>`;
  }

  /* ============================================================
     Derived data helpers
     ============================================================ */

  /** Extract the city for a vendor, tolerating the older joined `address` shape. */
  function vendorCity(v) {
    if (v.city) return v.city;
    if (v.address && v.address !== '—') return String(v.address).split(',')[0].trim();
    return '';
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean).map(s => String(s).trim()))].sort((a, b) => a.localeCompare(b));
  }

  /** Count vendors per month for the last `months` months, keyed by an ISO date field. */
  function monthlySeries(vendors, field, months) {
    const buckets = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-IN', { month: 'short' }),
        count: 0,
      });
    }
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    vendors.forEach(v => {
      const raw = v[field];
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const i = index.get(key);
      if (i !== undefined) buckets[i].count++;
    });
    return buckets;
  }

  function topGroups(vendors, keyFn, limit) {
    const counts = new Map();
    vendors.forEach(v => {
      const k = keyFn(v);
      if (!k) return;
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  /* ============================================================
     Chart.js theming
     ============================================================ */
  function chartColors() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      brand: '#DC1F30',
      brandSoft: dark ? 'rgba(220,31,48,0.28)' : 'rgba(220,31,48,0.14)',
      grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(17,24,39,0.06)',
      text: dark ? '#9ca3af' : '#6b7280',
      palette: ['#DC1F30', '#F0576A', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#0d9488', '#ec4899'],
    };
  }

  function baseChartOptions(extra) {
    const c = chartColors();
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 750, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17,24,39,0.92)',
          padding: 10,
          cornerRadius: 8,
          titleFont: { size: 12, weight: '700' },
          bodyFont: { size: 12 },
          displayColors: false,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: c.text, font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: c.grid },
          border: { display: false },
          ticks: { color: c.text, font: { size: 11 }, precision: 0, maxTicksLimit: 5 },
        },
      },
    }, extra || {});
  }

  /** Build a chart, disposing any prior instance bound to the same canvas. */
  function makeChart(canvasId, config) {
    if (typeof Chart === 'undefined') return null;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChart(canvasId);
    try {
      chartRegistry[canvasId] = new Chart(canvas.getContext('2d'), config);
      return chartRegistry[canvasId];
    } catch (err) {
      console.warn('Chart render failed for', canvasId, err);
      return null;
    }
  }

  /* ============================================================
     VIEW 1 — CRM DASHBOARD
     PDF item 1: "Dashboard Page needs more information, graphs
     easier to understand in one view"
     ============================================================ */
  function renderCrmDashboard(store) {
    const rawScope = window.WedEazzyCountryScope || 'all';
    const currentScope = rawScope.toUpperCase();
    const allVendors = store.vendors || [];
    const vendors = allVendors.filter(v => matchesCountryScope(v, currentScope));

    const total = vendors.length;
    const invited = vendors.filter(v => v.invitedAt).length;
    const claimed = vendors.filter(v => v.hasOwner).length;
    const verified = vendors.filter(v => v.claims === 'Verified Owner').length;
    const invitedAndClaimed = vendors.filter(v => v.invitedAt && v.hasOwner).length;
    const conversion = invited > 0 ? (invitedAndClaimed / invited) * 100 : 0;
    const blacklisted = vendors.filter(v => v.status === 'cancelled').length;
    const uninvited = vendors.filter(v => !v.hasOwner && !v.invitedAt).length;
    const premium = vendors.filter(v => v.subscriptionPlan && v.subscriptionPlan !== 'Free').length;
    const pendingClaims = vendors.filter(v => v.hasOwner && v.claims !== 'Verified Owner').length;

    const claimRate = total > 0 ? (claimed / total) * 100 : 0;
    const inviteCoverage = total > 0 ? (invited / total) * 100 : 0;

    const addedSeries = monthlySeries(vendors, 'createdAt', 7);
    const invitedSeries = monthlySeries(vendors, 'invitedAt', 7);
    const topCategories = topGroups(vendors, v => v.category, 6);
    const topCities = topGroups(vendors, vendorCity, 6);
    const maxCat = topCategories.length ? topCategories[0].count : 1;
    const maxCity = topCities.length ? topCities[0].count : 1;

    const countryNames = {
      'IN': 'India 🇮🇳',
      'US': 'USA 🇺🇸',
      'GB': 'UK 🇬🇧',
      'AE': 'UAE 🇦🇪',
      'CA': 'Canada 🇨🇦',
      'AU': 'Australia 🇦🇺',
      'ALL': 'Global Platform 🌐'
    };
    const activeCountryLabel = countryNames[currentScope] || currentScope;

    ctx.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i>
          <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>Dashboard</span>
        </div>

        ${renderCrmCountryScopeHeader()}

        ${currentScope !== 'ALL' && total === 0 ? `
          <div style="background: rgba(59, 130, 246, 0.08); border: 1.5px solid rgba(59, 130, 246, 0.25); border-radius: 14px; padding: 16px 20px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 1.4rem;">📍</span>
              <div>
                <div style="font-weight: 800; font-size: 0.95rem; color: #1e3a8a;">Selected Scope: ${activeCountryLabel}</div>
                <div style="font-size: 0.82rem; color: #3b82f6;">Currently 0 registered listings in ${activeCountryLabel}. Vendors signing up from this region will automatically appear here.</div>
              </div>
            </div>
            <button onclick="window.handleGlobalCountryChange('IN')" style="background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 10px; font-size: 0.82rem; font-weight: 800; cursor: pointer; transition: all 0.2s;">
              🇮🇳 Switch to India (13,695 Listings)
            </button>
          </div>
        ` : ''}

        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;">
          <div>
            <h2 style="font-size:1.35rem;margin-bottom:4px;">Business Acquisition Overview</h2>
            <p style="font-size:0.82rem;color:var(--text-muted);">
              The full seeded-listing → invited → claimed → verified funnel, in one view.
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="wz-btn-sm" onclick="window.WedEazzyCRM.go('import-listings')">
              <i class="fa-solid fa-file-csv"></i> Import CSV
            </button>
            <button class="wz-btn-sm brand" onclick="window.WedEazzyCRM.go('invitations')">
              <i class="fa-solid fa-paper-plane"></i> Send Invitations
            </button>
          </div>
        </div>

        <div class="wz-kpi-grid wz-stagger">
          ${kpi({ label: 'Total Listings', value: fmtNum(total), icon: 'fa-solid fa-store', accent: '#DC1F30',
                  sub: `<span>${fmtNum(premium)} on a paid plan</span>` })}
          ${kpi({ label: 'Invitations Sent', value: fmtNum(invited), icon: 'fa-solid fa-paper-plane', accent: '#3b82f6',
                  sub: `<span>${inviteCoverage.toFixed(1)}% of all listings</span>`, bar: inviteCoverage })}
          ${kpi({ label: 'Claimed by Owner', value: fmtNum(claimed), icon: 'fa-solid fa-user-check', accent: '#10b981',
                  sub: `<span>${claimRate.toFixed(1)}% of all listings</span>`, bar: claimRate })}
          ${kpi({ label: 'Conversion (Sent → Claimed)', value: conversion.toFixed(1) + '%', icon: 'fa-solid fa-arrow-trend-up', accent: '#f59e0b',
                  sub: `<span>${fmtNum(invitedAndClaimed)} of ${fmtNum(invited)} invited</span>`, bar: conversion })}
          ${kpi({ label: 'Verified Owners', value: fmtNum(verified), icon: 'fa-solid fa-shield-halved', accent: '#8b5cf6',
                  sub: `<span>${fmtNum(pendingClaims)} awaiting verification</span>` })}
          ${kpi({ label: 'Not Yet Invited', value: fmtNum(uninvited), icon: 'fa-solid fa-hourglass-half', accent: '#0d9488',
                  sub: `<span>Untouched opportunity</span>` })}
          ${kpi({ label: 'Blacklisted', value: fmtNum(blacklisted), icon: 'fa-solid fa-ban', accent: '#ef4444',
                  sub: `<span>Hidden from the public site</span>` })}
          ${kpi({ label: 'Paid Subscriptions', value: fmtNum(premium), icon: 'fa-solid fa-crown', accent: '#d4af37',
                  sub: `<span>${total > 0 ? ((premium / total) * 100).toFixed(1) : '0.0'}% monetised</span>` })}
        </div>

        <div class="wz-chart-grid cols-2">
          <div class="wz-chart-card">
            <div class="wz-chart-head">
              <div class="wz-chart-title">Listings Added</div>
              <div class="wz-chart-note">last 7 months</div>
            </div>
            <div class="wz-canvas-wrap"><canvas id="crmAddedChart"></canvas></div>
          </div>
          <div class="wz-chart-card">
            <div class="wz-chart-head">
              <div class="wz-chart-title">Invitations Sent</div>
              <div class="wz-chart-note">last 7 months</div>
            </div>
            <div class="wz-canvas-wrap"><canvas id="crmInviteChart"></canvas></div>
          </div>
        </div>

        <div class="wz-chart-grid cols-3">
          <div class="wz-chart-card">
            <div class="wz-chart-head">
              <div class="wz-chart-title">Claim Funnel</div>
              <div class="wz-chart-note">all listings</div>
            </div>
            <div class="wz-canvas-wrap"><canvas id="crmFunnelChart"></canvas></div>
          </div>

          <div class="wz-chart-card">
            <div class="wz-chart-head">
              <div class="wz-chart-title">Top Categories</div>
              <div class="wz-chart-note">by listing count</div>
            </div>
            <div style="padding-top:4px;">
              ${topCategories.length ? topCategories.map(c => `
                <div class="wz-dist-row">
                  <span class="wz-dist-name">${esc(c.name)}</span>
                  <span class="wz-dist-val">${fmtNum(c.count)}</span>
                  <span class="wz-dist-track">
                    <span class="wz-dist-fill" data-dist-fill="${Math.round((c.count / maxCat) * 100)}"></span>
                  </span>
                </div>`).join('') : '<p style="font-size:0.8rem;color:var(--text-muted);">No category data yet.</p>'}
            </div>
          </div>

          <div class="wz-chart-card">
            <div class="wz-chart-head">
              <div class="wz-chart-title">Top Cities</div>
              <div class="wz-chart-note">vendor distribution</div>
            </div>
            <div style="padding-top:4px;">
              ${topCities.length ? topCities.map(c => `
                <div class="wz-dist-row">
                  <span class="wz-dist-name">${esc(c.name)}</span>
                  <span class="wz-dist-val">${fmtNum(c.count)}</span>
                  <span class="wz-dist-track">
                    <span class="wz-dist-fill" data-dist-fill="${Math.round((c.count / maxCity) * 100)}"></span>
                  </span>
                </div>`).join('') : '<p style="font-size:0.8rem;color:var(--text-muted);">No city data yet.</p>'}
            </div>
          </div>
        </div>
      </div>`;

    animateBars(ctx.portalBody);

    const c = chartColors();

    // --- Listings added (area line) ---
    makeChart('crmAddedChart', {
      type: 'line',
      data: {
        labels: addedSeries.map(b => b.label),
        datasets: [{
          data: addedSeries.map(b => b.count),
          borderColor: c.brand,
          backgroundColor: c.brandSoft,
          borderWidth: 2.5,
          fill: true,
          tension: 0.38,
          pointRadius: 3,
          pointBackgroundColor: c.brand,
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
        }],
      },
      options: baseChartOptions(),
    });

    // --- Invitations sent (bars) ---
    makeChart('crmInviteChart', {
      type: 'bar',
      data: {
        labels: invitedSeries.map(b => b.label),
        datasets: [{
          data: invitedSeries.map(b => b.count),
          backgroundColor: c.brand,
          hoverBackgroundColor: '#F0576A',
          borderRadius: 6,
          maxBarThickness: 34,
        }],
      },
      options: baseChartOptions(),
    });

    // --- Funnel (horizontal bars) ---
    makeChart('crmFunnelChart', {
      type: 'bar',
      data: {
        labels: ['Listed', 'Invited', 'Claimed', 'Verified'],
        datasets: [{
          data: [total, invited, claimed, verified],
          backgroundColor: ['#DC1F30', '#3b82f6', '#10b981', '#8b5cf6'],
          borderRadius: 6,
          maxBarThickness: 26,
        }],
      },
      options: baseChartOptions({
        indexAxis: 'y',
        scales: {
          x: { beginAtZero: true, grid: { color: c.grid }, border: { display: false },
               ticks: { color: c.text, font: { size: 11 }, precision: 0, maxTicksLimit: 4 } },
          y: { grid: { display: false }, border: { display: false },
               ticks: { color: c.text, font: { size: 11, weight: '600' } } },
        },
      }),
    });
  }

  /* ============================================================
     VIEW 2 — ALL BUSINESSES
     User request: improve the UI (filter bar per the reference
     screenshot: search, category, city, approval, subscription,
     date, reset).
     ============================================================ */
  function filteredVendors(store) {
    const s = view.vendors;
    let list = store.vendors || [];
    const currentScope = String(window.WedEazzyCountryScope || 'all').toLowerCase();

    if (currentScope !== 'all') {
      list = list.filter(v => matchesCountryScope(v, currentScope));
    } else if (s.country) {
      list = list.filter(v => matchesCountryScope(v, s.country));
    }

    const term = s.search.trim().toLowerCase();

    if (term) {
      list = list.filter(v =>
        (v.name || '').toLowerCase().includes(term) ||
        (v.category || '').toLowerCase().includes(term) ||
        (v.vendorName || '').toLowerCase().includes(term) ||
        (v.email || '').toLowerCase().includes(term) ||
        (v.contact || '').toLowerCase().includes(term) ||
        vendorCity(v).toLowerCase().includes(term)
      );
    }
    if (s.category) list = list.filter(v => v.category === s.category);
    if (s.city) list = list.filter(v => vendorCity(v) === s.city);
    if (s.approval === 'approved') list = list.filter(v => v.status === 'approved');
    if (s.approval === 'blacklisted') list = list.filter(v => v.status === 'cancelled');
    if (s.approval === 'verified') list = list.filter(v => v.claims === 'Verified Owner');
    if (s.approval === 'pending') list = list.filter(v => v.claims !== 'Verified Owner');
    if (s.plan === 'free') list = list.filter(v => !v.subscriptionPlan || v.subscriptionPlan === 'Free');
    if (s.plan === 'paid') list = list.filter(v => v.subscriptionPlan && v.subscriptionPlan !== 'Free');
    if (s.dateFrom) {
      const from = new Date(s.dateFrom);
      if (!isNaN(from)) list = list.filter(v => v.createdAt && new Date(v.createdAt) >= from);
    }
    return list;
  }

  function renderVendors(store) {
    const s = view.vendors;
    const all = store.vendors || [];
    const list = filteredVendors(store);
    const size = s.pageSize || 15;
    const { items, total, current, count } = paginate(list, s.page, size);
    s.page = current;

    const categories = uniqueSorted(all.map(v => v.category));
    const rawScope = window.WedEazzyCountryScope || 'all';
    const currentScope = rawScope.toUpperCase();
    const relevantVendors = currentScope !== 'ALL' 
      ? all.filter(v => matchesCountryScope(v, currentScope)) 
      : all;
    const cities = uniqueSorted(relevantVendors.map(vendorCity));
    const anyFilter = s.search || s.category || s.city || (currentScope !== 'ALL') || s.approval || s.plan || s.dateFrom;

    const KNOWN_COUNTRIES = [
      { code: 'IN', name: 'India', flag: '🇮🇳' },
      { code: 'AE', name: 'UAE', flag: '🇦🇪' },
      { code: 'GB', name: 'UK', flag: '🇬🇧' },
      { code: 'US', name: 'USA', flag: '🇺🇸' },
      { code: 'CA', name: 'Canada', flag: '🇨🇦' },
      { code: 'AU', name: 'Australia', flag: '🇦🇺' }
    ];

    const FLAG = { 'India': '🇮🇳', 'USA': '🇺🇸', 'UK': '🇬🇧', 'Australia': '🇦🇺', 'UAE': '🇦🇪', 'Canada': '🇨🇦', 'IN': '🇮🇳', 'US': '🇺🇸', 'GB': '🇬🇧', 'AU': '🇦🇺', 'AE': '🇦🇪', 'CA': '🇨🇦' };

    ctx.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i>
          <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>All Businesses</span>
        </div>

        ${renderCrmCountryScopeHeader()}

        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
          <div>
            <h2 style="font-size:1.3rem;margin-bottom:4px;">
              Partner Service Vendors Registry
              <span class="wz-chip wz-chip-brand" style="vertical-align:middle;margin-left:6px;">${fmtNum(count)} matching (${fmtNum(store.vendorsTotalCount ?? all.length)} total)</span>
            </h2>
            <p style="font-size:0.82rem;color:var(--text-muted);">
              Photographers, venues, caterers, decorators, make-up artists and more.
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="wz-btn-sm" onclick="window.WedEazzyCRM.go('import-listings')">
              <i class="fa-solid fa-file-import"></i> Import CSV
            </button>
            <button class="wz-btn-sm brand" onclick="window.triggerAddVendorModal()">
              <i class="fa-solid fa-circle-plus"></i> New Vendor
            </button>
          </div>
        </div>

        <!-- Country tabs -->
        <div class="wz-country-tabs">
          <button class="wz-ctab ${(currentScope === 'ALL' || !currentScope) ? 'active' : ''}" onclick="window.handleGlobalCountryChange('all')">
            🌐 All Countries
            <span class="wz-ctab-count">${fmtNum(all.length)}</span>
          </button>
          ${KNOWN_COUNTRIES.map(c => {
            const cnt = all.filter(v => matchesCountryScope(v, c.code)).length;
            const isActive = currentScope === c.code.toUpperCase();
            return `
              <button class="wz-ctab ${isActive ? 'active' : ''}" onclick="window.handleGlobalCountryChange('${c.code}')">
                ${c.flag} ${c.name}
                <span class="wz-ctab-count">${fmtNum(cnt)}</span>
              </button>`;
          }).join('')}
        </div>

        <div class="wz-filter-bar">
          <label class="wz-filter-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="vFilterSearch" placeholder="Search business, owner, phone or email…"
                   value="${esc(s.search)}" autocomplete="off" />
          </label>

          <span class="wz-select">
            <i class="fa-solid fa-tag"></i>
            <select id="vFilterCategory" class="${s.category ? 'is-set' : ''}">
              <option value="">Category</option>
              ${categories.map(c => `<option value="${esc(c)}" ${s.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </span>

          <span class="wz-select">
            <i class="fa-solid fa-location-dot"></i>
            <select id="vFilterCity" class="${s.city ? 'is-set' : ''}">
              <option value="">City</option>
              ${cities.map(c => `<option value="${esc(c)}" ${s.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </span>

          <span class="wz-select">
            <i class="fa-solid fa-flag"></i>
            <select id="vFilterApproval" class="${s.approval ? 'is-set' : ''}">
              <option value="">Approval Status</option>
              <option value="approved"    ${s.approval === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="verified"    ${s.approval === 'verified' ? 'selected' : ''}>Verified Owner</option>
              <option value="pending"     ${s.approval === 'pending' ? 'selected' : ''}>Pending Verification</option>
              <option value="blacklisted" ${s.approval === 'blacklisted' ? 'selected' : ''}>Blacklisted</option>
            </select>
          </span>

          <input type="date" id="vFilterDate" class="wz-date-input" value="${esc(s.dateFrom)}" title="Added on or after" />

          ${anyFilter ? `<button class="wz-reset-btn" onclick="window.WedEazzyCRM.resetVendorFilters()">
            <i class="fa-solid fa-rotate-left"></i> Reset Filters
          </button>` : ''}

          <span class="wz-result-count">${fmtNum(count)} result${count === 1 ? '' : 's'}</span>
        </div>

        <div class="panel-card" style="padding:0;overflow:hidden;border-radius:14px;border:1px solid var(--border-color);">
          <div class="table-viewport" style="overflow-x:auto;">
            <table class="grid-table wz-cardable" style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:var(--surface-subtle,#f9fafb);border-bottom:1px solid var(--border-color,#e5e7eb);">
                  <th style="width:38px;padding:12px 14px;"><input type="checkbox" class="wz-check" id="vSelectAll" title="Select all on this page" /></th>
                  <th style="min-width:240px;padding:12px 14px;text-align:left;font-size:0.75rem;font-weight:800;color:var(--text-sub,#6b7280);text-transform:uppercase;letter-spacing:0.04em;">Business</th>
                  <th style="min-width:110px;padding:12px 14px;text-align:left;font-size:0.75rem;font-weight:800;color:var(--text-sub,#6b7280);text-transform:uppercase;letter-spacing:0.04em;">Owner</th>
                  <th style="min-width:130px;padding:12px 14px;text-align:left;font-size:0.75rem;font-weight:800;color:var(--text-sub,#6b7280);text-transform:uppercase;letter-spacing:0.04em;">Category</th>
                  <th style="min-width:110px;padding:12px 14px;text-align:left;font-size:0.75rem;font-weight:800;color:var(--text-sub,#6b7280);text-transform:uppercase;letter-spacing:0.04em;">City</th>
                  <th style="min-width:110px;padding:12px 14px;text-align:left;font-size:0.75rem;font-weight:800;color:var(--text-sub,#6b7280);text-transform:uppercase;letter-spacing:0.04em;">Country</th>
                  <th style="min-width:150px;padding:12px 14px;text-align:left;font-size:0.75rem;font-weight:800;color:var(--text-sub,#6b7280);text-transform:uppercase;letter-spacing:0.04em;">Contact</th>
                  <th style="min-width:95px;padding:12px 14px;text-align:left;font-size:0.75rem;font-weight:800;color:var(--text-sub,#6b7280);text-transform:uppercase;letter-spacing:0.04em;">Added</th>
                  <th style="min-width:115px;padding:12px 14px;text-align:left;font-size:0.75rem;font-weight:800;color:var(--text-sub,#6b7280);text-transform:uppercase;letter-spacing:0.04em;">Verification</th>
                  <th style="min-width:145px;padding:12px 14px;text-align:right;font-size:0.75rem;font-weight:800;color:var(--text-sub,#6b7280);text-transform:uppercase;letter-spacing:0.04em;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${items.length === 0 ? `
                  <tr><td colspan="9" data-primary style="padding:40px 20px;text-align:center;">
                    ${anyFilter
                      ? emptyState('fa-solid fa-filter-circle-xmark', 'No businesses match these filters',
                                   'Try widening the search, or reset the filters to see the full registry.')
                      : emptyState('fa-solid fa-store', 'No businesses yet',
                                   'Add a vendor manually, or bulk-import your listings from a CSV file.')}
                  </td></tr>
                ` : items.map(v => {
                  const verified = v.claims === 'Verified Owner';
                  const blacklisted = v.status === 'cancelled';
                  const city = vendorCity(v);
                  const rawC = String(v.country || 'India').trim().toUpperCase();
                  const countryName = rawC.includes('US') ? 'USA' : (rawC.includes('GB') || rawC.includes('UK') ? 'UK' : (rawC.includes('AE') || rawC.includes('UAE') ? 'UAE' : (rawC.includes('CA') ? 'Canada' : (rawC.includes('AU') ? 'Australia' : 'India'))));
                  const flagIcon = FLAG[countryName] || '🌐';
                  return `
                  <tr data-vendor-id="${esc(v.id)}" style="border-bottom:1px solid var(--border-color,#f3f4f6);transition:background 0.15s ease;">
                    <td data-label="Select" style="padding:12px 14px;vertical-align:middle;">
                      <input type="checkbox" class="wz-check wz-row-check" value="${esc(v.id)}"
                             ${s.selected.has(v.id) ? 'checked' : ''} />
                    </td>
                    <td data-primary style="padding:12px 14px;vertical-align:middle;">
                      <div class="wz-biz" style="display:flex;align-items:center;gap:10px;">
                        <div class="wz-biz-avatar" style="width:34px;height:34px;border-radius:8px;font-size:0.8rem;">${esc(initials(v.name))}</div>
                        <div class="wz-biz-text" style="min-width:0;">
                          <div class="wz-biz-name" title="${esc(v.name)}" style="font-size:0.86rem;font-weight:700;color:var(--text-main,#111827);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;">${esc(v.name)}</div>
                          <div class="wz-biz-meta" style="font-size:0.72rem;color:var(--text-muted,#6b7280);">
                            <span><i class="fa-solid fa-star" style="color:var(--brand-gold,#f59e0b);"></i> ${v.rating ?? '—'}</span>
                            <span>·</span>
                            <span>#${esc(String(v.id).slice(-8))}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Owner" style="padding:12px 14px;vertical-align:middle;">
                      ${v.vendorName && v.vendorName !== '—'
                        ? `<span style="font-size:0.8rem;font-weight:600;color:var(--text-main,#374151);">${esc(v.vendorName)}</span>`
                        : `<span class="wz-chip wz-chip-grey">Unclaimed</span>`}
                    </td>
                    <td data-label="Category" style="padding:12px 14px;vertical-align:middle;"><span class="wz-chip wz-chip-brand">${esc(v.category)}</span></td>
                    <td data-label="City" style="padding:12px 14px;vertical-align:middle;"><span style="font-size:0.8rem;font-weight:600;color:var(--text-sub,#4b5563);">${esc(city) || '—'}</span></td>
                    <td data-label="Country" style="padding:12px 14px;vertical-align:middle;">
                      <span class="wz-chip wz-chip-grey" style="font-weight:700;font-size:0.75rem;">${flagIcon} ${esc(countryName)}</span>
                    </td>
                    <td data-label="Contact" style="padding:12px 14px;vertical-align:middle;">
                      <div class="wz-contact" style="font-size:0.78rem;">
                        <div style="font-weight:600;"><i class="fa-solid fa-phone" style="opacity:0.55;margin-right:3px;"></i> ${esc(v.contact)}</div>
                        ${v.email && v.email !== '—'
                          ? `<div class="muted" style="font-size:0.72rem;color:var(--text-muted);"><i class="fa-regular fa-envelope" style="margin-right:3px;"></i> ${esc(v.email)}</div>` : ''}
                      </div>
                    </td>
                    <td data-label="Added" style="padding:12px 14px;vertical-align:middle;"><span style="font-size:0.78rem;font-weight:600;color:var(--text-sub);">${fmtDate(v.createdAt)}</span></td>
                    <td data-label="Verification" style="padding:12px 14px;vertical-align:middle;">
                      ${blacklisted
                        ? `<span class="wz-chip wz-chip-red"><i class="fa-solid fa-ban"></i> Blacklisted</span>`
                        : verified
                          ? `<span class="wz-chip wz-chip-green"><i class="fa-solid fa-check-double"></i> Verified</span>`
                          : `<span class="wz-chip wz-chip-amber"><i class="fa-solid fa-clock"></i> Pending</span>`}
                    </td>
                    <td data-label="Actions" style="text-align:right;padding:12px 14px;vertical-align:middle;">
                      <div class="wz-actions" style="display:inline-flex;gap:5px;align-items:center;justify-content:flex-end;flex-wrap:nowrap;white-space:nowrap;">
                        <button class="wz-icon-btn brand" title="Send claim invitation"
                                onclick="window.WedEazzyCRM.openInviteModal('${esc(v.id)}')">
                          <i class="fa-solid fa-paper-plane"></i>
                        </button>
                        ${blacklisted ? `
                          <button class="wz-icon-btn green" title="Re-approve business"
                                  onclick="window.handleVendorStatus('${esc(v.id)}','approved')">
                            <i class="fa-solid fa-check"></i>
                          </button>` : `
                          <button class="wz-icon-btn red" title="Blacklist business"
                                  onclick="window.handleVendorStatus('${esc(v.id)}','cancelled')">
                            <i class="fa-solid fa-ban"></i>
                          </button>`}
                        <button class="wz-icon-btn blue" title="Send login credentials"
                                onclick="window.triggerVendorCredentialsModal('${esc(v.id)}','${ctx.escJsAttr(v.email && v.email !== '—' ? v.email : '')}','${ctx.escJsAttr(v.name || '')}')">
                          <i class="fa-solid fa-key"></i>
                        </button>
                        <button class="wz-icon-btn red" title="Delete listing"
                                onclick="window.handleDeleteVendor('${esc(v.id)}')">
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          ${pager(current, total, 'goVendorsPage', size, 'setVendorPageSize')}
        </div>

        <div id="vBulkBarSlot"></div>
      </div>`;

    bindVendorFilters(store);
    renderVendorBulkBar();
  }

  function bindVendorFilters(store) {
    const s = view.vendors;

    const search = document.getElementById('vFilterSearch');
    if (search) {
      // Restore the caret so typing is not interrupted by the re-render.
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
      search.addEventListener('input', (e) => {
        s.search = e.target.value;
        s.page = 1;
        clearTimeout(s._debounce);
        s._debounce = setTimeout(() => renderVendors(window.WedEazzyStore.get()), 220);
      });
    }

    const bind = (id, key) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.addEventListener('change', (e) => {
        s[key] = e.target.value;
        s.page = 1;
        renderVendors(window.WedEazzyStore.get());
      });
    };
    bind('vFilterCategory', 'category');
    bind('vFilterCity', 'city');
    bind('vFilterApproval', 'approval');
    bind('vFilterDate', 'dateFrom');

    document.querySelectorAll('.wz-row-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        if (e.target.checked) s.selected.add(e.target.value);
        else s.selected.delete(e.target.value);
        renderVendorBulkBar();
        const all = document.getElementById('vSelectAll');
        const boxes = [...document.querySelectorAll('.wz-row-check')];
        if (all) all.checked = boxes.length > 0 && boxes.every(b => b.checked);
      });
    });

    const selectAll = document.getElementById('vSelectAll');
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        document.querySelectorAll('.wz-row-check').forEach(cb => {
          cb.checked = e.target.checked;
          if (e.target.checked) s.selected.add(cb.value);
          else s.selected.delete(cb.value);
        });
        renderVendorBulkBar();
      });
    }
  }

  function renderVendorBulkBar() {
    const slot = document.getElementById('vBulkBarSlot');
    if (!slot) return;
    const n = view.vendors.selected.size;
    if (n === 0) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <div class="wz-bulkbar">
        <span class="wz-bulkbar-count"><i class="fa-solid fa-check-double" style="color:var(--brand-rose);"></i> ${n} selected</span>
        <button class="wz-btn-sm brand" onclick="window.WedEazzyCRM.bulkInvite()">
          <i class="fa-solid fa-paper-plane"></i> Send invitations
        </button>
        <button class="wz-btn-sm ghost" onclick="window.WedEazzyCRM.clearVendorSelection()">
          <i class="fa-solid fa-xmark"></i> Clear
        </button>
      </div>`;
  }

  /* ============================================================
     VIEW 3 — INVITATIONS
     PDF item 3: "The invitation page needs only the listing of
     people to whom we have send the invitation"
     ============================================================ */
  function renderInvitations(store) {
    const s = view.invitations;
    const allVendors = store.vendors || [];
    const currentScope = window.WedEazzyCountryScope || 'all';

    let invitedList = allVendors.filter(v => v.invitedAt && matchesCountryScope(v, currentScope));

    const term = s.search.trim().toLowerCase();
    let list = invitedList;
    if (term) {
      list = list.filter(v =>
        (v.name || '').toLowerCase().includes(term) ||
        (v.category || '').toLowerCase().includes(term) ||
        (v.contact || '').toLowerCase().includes(term)
      );
    }
    if (s.channel) list = list.filter(v => (v.invitedChannel || '').includes(s.channel));

    list = list.slice().sort((a, b) => new Date(b.invitedAt) - new Date(a.invitedAt));

    const size = s.pageSize || 15;
    const { items, total, current, count } = paginate(list, s.page, size);
    s.page = current;

    const totalInvited = invitedList.length;
    const converted = invitedList.filter(v => v.hasOwner).length;
    const viaWa = invitedList.filter(v => (v.invitedChannel || '').includes('whatsapp')).length;
    const viaEmail = invitedList.filter(v => (v.invitedChannel || '').includes('email')).length;
    const awaiting = totalInvited - converted;
    const convRate = totalInvited > 0 ? (converted / totalInvited) * 100 : 0;
    const pendingInvite = allVendors.filter(v => !v.hasOwner && !v.invitedAt && matchesCountryScope(v, currentScope)).length;

    ctx.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i>
          <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>Invitations</span>
        </div>

        ${renderCrmCountryScopeHeader()}

        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
          <div>
            <h2 style="font-size:1.3rem;margin-bottom:4px;">Invitations Sent</h2>
            <p style="font-size:0.82rem;color:var(--text-muted);">
              Every listing we have invited to claim their business, and what happened next.
            </p>
          </div>
          <button class="wz-btn-sm brand" onclick="window.WedEazzyCRM.openBulkInvitePicker()">
            <i class="fa-solid fa-paper-plane"></i> Invite more listings
            ${pendingInvite ? `<span class="wz-chip wz-chip-grey" style="margin-left:4px;">${fmtNum(pendingInvite)} waiting</span>` : ''}
          </button>
        </div>

        <div class="wz-kpi-grid wz-stagger">
          ${kpi({ label: 'Invitations Sent', value: fmtNum(totalInvited), icon: 'fa-solid fa-paper-plane', accent: '#DC1F30',
                  sub: `<span>${fmtNum(pendingInvite)} listings still uninvited</span>` })}
          ${kpi({ label: 'Claimed After Invite', value: fmtNum(converted), icon: 'fa-solid fa-user-check', accent: '#10b981',
                  sub: `<span class="up"><i class="fa-solid fa-arrow-up"></i> ${convRate.toFixed(1)}% conversion</span>`, bar: convRate })}
          ${kpi({ label: 'Awaiting Response', value: fmtNum(awaiting), icon: 'fa-solid fa-hourglass-half', accent: '#f59e0b',
                  sub: `<span>Candidates for a follow-up</span>` })}
          ${kpi({ label: 'Sent via WhatsApp', value: fmtNum(viaWa), icon: 'fa-brands fa-whatsapp', accent: '#25D366',
                  sub: `<span>${fmtNum(viaEmail)} also sent by email</span>` })}
        </div>

        <div class="wz-filter-bar">
          <label class="wz-filter-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="iFilterSearch" placeholder="Search invited businesses…" value="${esc(s.search)}" autocomplete="off" />
          </label>
          <span class="wz-select">
            <i class="fa-solid fa-satellite-dish"></i>
            <select id="iFilterChannel" class="${s.channel ? 'is-set' : ''}">
              <option value="">All channels</option>
              <option value="whatsapp" ${s.channel === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
              <option value="email"    ${s.channel === 'email' ? 'selected' : ''}>Email</option>
            </select>
          </span>
          ${(s.search || s.channel) ? `<button class="wz-reset-btn" onclick="window.WedEazzyCRM.resetInviteFilters()">
            <i class="fa-solid fa-rotate-left"></i> Reset
          </button>` : ''}
          <span class="wz-result-count">${fmtNum(count)} of ${fmtNum(totalInvited)} shown</span>
        </div>

        <div class="panel-card" style="padding:0;overflow:hidden;">
          <div class="table-viewport">
            <table class="grid-table wz-cardable">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Category</th>
                  <th>Sent To</th>
                  <th>Channel</th>
                  <th>Invited On</th>
                  <th>Outcome</th>
                  <th style="text-align:right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${items.length === 0 ? `
                  <tr><td colspan="7" data-primary>
                    ${totalInvited === 0
                      ? emptyState('fa-solid fa-paper-plane', 'No invitations sent yet',
                          'Once you invite an unclaimed listing to claim their business, it will appear here with its full delivery and conversion history.')
                      : emptyState('fa-solid fa-filter-circle-xmark', 'No invitations match this filter',
                          'Try a different search term or channel.')}
                  </td></tr>
                ` : items.map(v => {
                  const claimed = v.hasOwner;
                  const ch = v.invitedChannel || '';
                  return `
                  <tr>
                    <td data-primary>
                      <div class="wz-biz">
                        <div class="wz-biz-avatar">${esc(initials(v.name))}</div>
                        <div class="wz-biz-text">
                          <div class="wz-biz-name" title="${esc(v.name)}">${esc(v.name)}</div>
                          <div class="wz-biz-meta"><span>${esc(vendorCity(v)) || '—'}</span></div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Category"><span class="wz-chip wz-chip-brand">${esc(v.category)}</span></td>
                    <td data-label="Sent To">
                      <div class="wz-contact">
                        <div><i class="fa-solid fa-phone" style="opacity:0.55;"></i> ${esc(v.contact)}</div>
                        ${v.email && v.email !== '—' ? `<div class="muted">${esc(v.email)}</div>` : ''}
                      </div>
                    </td>
                    <td data-label="Channel">
                      ${ch.includes('whatsapp') ? `<span class="wz-chip wz-chip-green"><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>` : ''}
                      ${ch.includes('email') ? `<span class="wz-chip wz-chip-blue"><i class="fa-regular fa-envelope"></i> Email</span>` : ''}
                      ${!ch ? `<span class="wz-chip wz-chip-grey">—</span>` : ''}
                    </td>
                    <td data-label="Invited On">
                      <div style="font-size:0.78rem;font-weight:600;">${fmtDate(v.invitedAt)}</div>
                      <div style="font-size:0.7rem;color:var(--text-muted);">${esc(relTime(v.invitedAt) || '')}</div>
                    </td>
                    <td data-label="Outcome">
                      ${claimed
                        ? `<span class="wz-chip wz-chip-green"><i class="fa-solid fa-circle-check"></i> Claimed</span>`
                        : `<span class="wz-chip wz-chip-amber"><i class="fa-solid fa-clock"></i> Awaiting</span>`}
                    </td>
                    <td data-label="Action" style="text-align:right;">
                      <div class="wz-actions">
                        <button class="wz-btn-sm ${claimed ? 'ghost' : 'brand'}"
                                onclick="window.WedEazzyCRM.openInviteModal('${esc(v.id)}')">
                          <i class="fa-solid fa-rotate-right"></i> Re-send
                        </button>
                      </div>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          ${pager(current, total, 'goInvitationsPage', size, 'setInvitationsPageSize')}
        </div>
      </div>`;

    animateBars(ctx.portalBody);

    const search = document.getElementById('iFilterSearch');
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
      search.addEventListener('input', (e) => {
        s.search = e.target.value;
        s.page = 1;
        clearTimeout(s._debounce);
        s._debounce = setTimeout(() => renderInvitations(window.WedEazzyStore.get()), 220);
      });
    }
    const chan = document.getElementById('iFilterChannel');
    if (chan) {
      chan.addEventListener('change', (e) => {
        s.channel = e.target.value;
        s.page = 1;
        renderInvitations(window.WedEazzyStore.get());
      });
    }
  }

  /* ============================================================
     VIEW 4 — CLAIMED BUSINESSES
     PDF item 4: "the claimed business listing needs some stat
     cards and only the claimed listing page"
     ============================================================ */
  function renderClaimedListings(store) {
    const s = view.claimed;
    const allVendors = store.vendors || [];
    const currentScope = window.WedEazzyCountryScope || 'all';

    const claimedAll = allVendors.filter(v => v.hasOwner && matchesCountryScope(v, currentScope));

    const verified = claimedAll.filter(v => v.claims === 'Verified Owner');
    const pending = claimedAll.filter(v => v.claims !== 'Verified Owner');

    let list = claimedAll;
    if (s.status === 'verified') list = verified;
    if (s.status === 'pending') list = pending;

    const term = s.search.trim().toLowerCase();
    if (term) {
      list = list.filter(v =>
        (v.name || '').toLowerCase().includes(term) ||
        (v.vendorName || '').toLowerCase().includes(term) ||
        (v.email || '').toLowerCase().includes(term)
      );
    }

    const size = s.pageSize || 15;
    const { items, total, current, count } = paginate(list, s.page, size);
    s.page = current;

    const withDocs = claimedAll.filter(v => v.kycDocumentUrl).length;
    const verifyRate = claimedAll.length > 0 ? (verified.length / claimedAll.length) * 100 : 0;

    ctx.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i>
          <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>Claimed Businesses</span>
        </div>

        ${renderCrmCountryScopeHeader()}

        <div style="margin-bottom:16px;">
          <h2 style="font-size:1.3rem;margin-bottom:4px;">Claim Verification Console</h2>
          <p style="font-size:0.82rem;color:var(--text-muted);">
            Listings a registered vendor has taken ownership of. Verify their proof documents to grant full control.
          </p>
        </div>

        <div class="wz-kpi-grid wz-stagger">
          ${kpi({ label: 'Total Claimed', value: fmtNum(claimedAll.length), icon: 'fa-solid fa-hand-holding-heart', accent: '#DC1F30',
                  sub: `<span>of ${fmtNum(allVendors.length)} listings</span>` })}
          ${kpi({ label: 'Fully Verified', value: fmtNum(verified.length), icon: 'fa-solid fa-shield-halved', accent: '#10b981',
                  sub: `<span>${verifyRate.toFixed(1)}% of claims cleared</span>`, bar: verifyRate })}
          ${kpi({ label: 'Awaiting Review', value: fmtNum(pending.length), icon: 'fa-solid fa-file-signature', accent: '#ea580c',
                  sub: `<span>Needs your moderation</span>` })}
          ${kpi({ label: 'Proof Uploaded', value: fmtNum(withDocs), icon: 'fa-solid fa-file-circle-check', accent: '#3b82f6',
                  sub: `<span>${fmtNum(claimedAll.length - withDocs)} without documents</span>` })}
        </div>

        <div class="wz-filter-bar">
          <label class="wz-filter-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" id="cFilterSearch" placeholder="Filter by business, owner or email…" value="${esc(s.search)}" autocomplete="off" />
          </label>
          <span class="wz-select">
            <i class="fa-solid fa-flag"></i>
            <select id="cFilterStatus" class="${s.status ? 'is-set' : ''}">
              <option value="">All claims</option>
              <option value="pending"  ${s.status === 'pending' ? 'selected' : ''}>Awaiting review</option>
              <option value="verified" ${s.status === 'verified' ? 'selected' : ''}>Verified</option>
            </select>
          </span>
          ${(s.search || s.status) ? `<button class="wz-reset-btn" onclick="window.WedEazzyCRM.resetClaimedFilters()">
            <i class="fa-solid fa-rotate-left"></i> Reset
          </button>` : ''}
          <span class="wz-result-count">${fmtNum(count)} shown</span>
        </div>

        <div class="panel-card" style="padding:0;overflow:hidden;">
          <div class="table-viewport">
            <table class="grid-table wz-cardable">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Claimed By</th>
                  <th>Category</th>
                  <th>Proof</th>
                  <th>Claim State</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${items.length === 0 ? `
                  <tr><td colspan="6" data-primary>
                    ${claimedAll.length === 0
                      ? emptyState('fa-solid fa-shield-halved', 'No claims yet',
                          'When a vendor signs up and takes ownership of a seeded listing, their claim will appear here for verification.')
                      : emptyState('fa-solid fa-filter-circle-xmark', 'No claims match this filter',
                          'Try clearing the search or switching the claim state.')}
                  </td></tr>
                ` : items.map(v => {
                  const isVerified = v.claims === 'Verified Owner';
                  return `
                  <tr>
                    <td data-primary>
                      <div class="wz-biz">
                        <div class="wz-biz-avatar">${esc(initials(v.name))}</div>
                        <div class="wz-biz-text">
                          <div class="wz-biz-name" title="${esc(v.name)}">${esc(v.name)}</div>
                          <div class="wz-biz-meta"><span>${esc(vendorCity(v)) || '—'}</span></div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Claimed By">
                      <div class="wz-contact">
                        <div style="font-weight:600;">${esc(v.vendorName && v.vendorName !== '—' ? v.vendorName : 'Registered owner')}</div>
                        <div class="muted">${esc(v.email && v.email !== '—' ? v.email : v.contact)}</div>
                      </div>
                    </td>
                    <td data-label="Category"><span class="wz-chip wz-chip-brand">${esc(v.category)}</span></td>
                    <td data-label="Proof">
                      ${v.kycDocumentUrl
                        ? `<span class="wz-chip wz-chip-blue"><i class="fa-solid fa-file-circle-check"></i> Uploaded</span>`
                        : `<span class="wz-chip wz-chip-grey"><i class="fa-regular fa-file"></i> None</span>`}
                    </td>
                    <td data-label="Claim State">
                      ${isVerified
                        ? `<span class="wz-chip wz-chip-green"><i class="fa-solid fa-circle-check"></i> Verified owner</span>`
                        : `<span class="wz-chip wz-chip-amber"><i class="fa-solid fa-hourglass-half"></i> Claim requested</span>`}
                    </td>
                    <td data-label="Actions" style="text-align:right;">
                      <div class="wz-actions">
                        <button class="wz-icon-btn ${v.kycDocumentUrl ? 'blue' : ''}"
                                title="${v.kycDocumentUrl ? 'View proof document' : 'Upload proof document'}"
                                onclick="window.triggerVendorDocumentModal('${esc(v.id)}', ${v.kycDocumentUrl ? `'${ctx.escJsAttr(v.kycDocumentUrl)}'` : 'null'})">
                          <i class="fa-solid ${v.kycDocumentUrl ? 'fa-file-circle-check' : 'fa-file-arrow-up'}"></i>
                        </button>
                        ${isVerified
                          ? `<span class="wz-chip wz-chip-green"><i class="fa-solid fa-shield-halved"></i> Approved</span>`
                          : `<button class="wz-btn-sm green" onclick="window.handleClaimListing('vendor','${esc(v.id)}')">
                               <i class="fa-solid fa-circle-check"></i> Grant ownership
                             </button>`}
                      </div>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          ${pager(current, total, 'goClaimedPage', size, 'setClaimedPageSize')}
        </div>
      </div>`;

    animateBars(ctx.portalBody);

    const search = document.getElementById('cFilterSearch');
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
      search.addEventListener('input', (e) => {
        s.search = e.target.value;
        s.page = 1;
        clearTimeout(s._debounce);
        s._debounce = setTimeout(() => renderClaimedListings(window.WedEazzyStore.get()), 220);
      });
    }
    const status = document.getElementById('cFilterStatus');
    if (status) {
      status.addEventListener('change', (e) => {
        s.status = e.target.value;
        s.page = 1;
        renderClaimedListings(window.WedEazzyStore.get());
      });
    }
  }

  /* ============================================================
     VIEW 5 — UNIVERSAL BUSINESS DATA INTELLIGENCE & IMPORT REVIEW
     ============================================================ */
  function renderImportListings() {
    const s = view.importer;
    const stepClass = (n) => s.step === n ? 'active' : (s.step > n ? 'done' : '');

    ctx.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i>
          <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>Business Data Intelligence Importer</span>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:18px;">
          <div>
            <h2 style="font-size:1.3rem;margin-bottom:4px;">Business Data Intelligence & Universal Importer</h2>
            <p style="font-size:0.82rem;color:var(--text-muted);">
              Upload business data from any scraper output (.csv, .tsv, .xlsx, .xls). Auto-normalizes, analyzes quality, detects duplicates & provides interactive review before import.
            </p>
          </div>
          <button class="wz-btn-sm ghost" onclick="window.WedEazzyCRM.openImportHistoryModal()">
            <i class="fa-solid fa-history"></i> Import History
          </button>
        </div>

        <div class="wz-steps">
          <span class="wz-step ${stepClass(1)}"><span class="wz-step-num">1</span><span>Upload & Detect</span></span>
          <span class="wz-step-line"></span>
          <span class="wz-step ${stepClass(2)}"><span class="wz-step-num">2</span><span>Intelligence & Review</span></span>
          <span class="wz-step-line"></span>
          <span class="wz-step ${stepClass(3)}"><span class="wz-step-num">3</span><span>Commit & Report</span></span>
        </div>

        <div id="importStage"></div>
      </div>`;

    renderImportStage();
  }

  function renderImportCharts(dist) {
    if (typeof Chart === 'undefined') return;

    const cityCanvas = document.getElementById('wzCityBarChart');
    if (cityCanvas) {
      destroyChart('wzCityBarChart');
      const topCities = (dist.cities || []).slice(0, 8);
      const ctx = cityCanvas.getContext('2d');
      chartRegistry['wzCityBarChart'] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: topCities.map(c => c.name),
          datasets: [{
            label: 'Listings',
            data: topCities.map(c => c.count),
            backgroundColor: 'rgba(229, 43, 58, 0.75)',
            borderColor: '#E52B3A',
            borderWidth: 1,
            borderRadius: 6,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    const catCanvas = document.getElementById('wzCategoryDonutChart');
    if (catCanvas) {
      destroyChart('wzCategoryDonutChart');
      const topCats = (dist.categories || []).slice(0, 6);
      const ctx = catCanvas.getContext('2d');
      chartRegistry['wzCategoryDonutChart'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: topCats.map(c => c.name),
          datasets: [{
            data: topCats.map(c => c.count),
            backgroundColor: ['#E52B3A', '#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
            borderWidth: 2,
            borderColor: '#ffffff',
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } }
          }
        }
      });
    }
  }

  function renderImportStage() {
    const stage = document.getElementById('importStage');
    if (!stage) return;
    const s = view.importer;

    if (!s.targetCountry) {
      const rawActive = (window.WedEazzyCountryScope || 'IN').toUpperCase();
      s.targetCountry = (rawActive === 'ALL' || !rawActive) ? 'IN' : rawActive;
    }
    const activeScope = s.targetCountry;

    const KNOWN_IMPORT_COUNTRIES = [
      { code: 'IN', label: '🇮🇳 India' },
      { code: 'US', label: '🇺🇸 USA' },
      { code: 'GB', label: '🇬🇧 UK' },
      { code: 'AU', label: '🇦🇺 Australia' },
      { code: 'AE', label: '🇦🇪 UAE' },
      { code: 'CA', label: '🇨🇦 Canada' }
    ];

    if (s.step === 1) {
      stage.innerHTML = `
        <div class="panel-card">
          <div class="wz-dropzone" id="csvDropzone" tabindex="0" role="button" aria-label="Choose or drop a data file">
            <div class="wz-dropzone-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
            <h4>Drop your CSV, TSV, or XLSX file here, or click to browse</h4>
            <p>Supports Google Maps scrapers, Bing lists, Justdial exports & custom CSV/Excel spreadsheets.</p>
            ${s.file ? `<div class="wz-dropzone-file"><i class="fa-solid fa-file-excel"></i> ${esc(s.file.name)} · ${(s.file.size / 1024).toFixed(0)} KB</div>` : ''}
          </div>
          <input type="file" id="csvFileInput" accept=".csv,.tsv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none;" />

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px;">
            <a href="#" onclick="window.WedEazzyCRM.downloadTemplate();return false;" style="font-size:0.78rem;font-weight:700;color:var(--brand-rose);text-decoration:none;">
              <i class="fa-solid fa-download"></i> Download sample listings template
            </a>
          </div>

          <h4 style="font-size:0.9rem;margin-top:22px;">Data Source Settings</h4>
          <div class="wz-rules" style="margin-top:10px;">
            <div class="wz-rule" style="flex-direction:column;align-items:flex-start;gap:12px;">
              <div>
                <span class="wz-rule-title">Target Country</span>
                <span class="wz-rule-desc">Select target country for phone formatting (+91 for IN, +1 for US/CA) and city/category canonical resolution.</span>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${KNOWN_IMPORT_COUNTRIES.map(c => `
                  <label class="wz-country-pick ${c.code === activeScope ? 'wz-country-pick-checked' : ''}" data-country-pick="${c.code}">
                    <input type="radio" name="importCountry" value="${c.code}" ${c.code === activeScope ? 'checked' : ''} /> ${c.label}
                  </label>
                `).join('')}
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;">
              <label class="wz-rule">
                <input type="text" id="importCityHint" class="premium-input" style="flex:1;font-size:0.8rem;padding:8px 12px;" placeholder="City hint (optional, e.g. Mumbai)" />
                <span>
                  <span class="wz-rule-title">City Hint</span>
                  <span class="wz-rule-desc">Overrides or fills missing city values.</span>
                </span>
              </label>
              <label class="wz-rule">
                <input type="text" id="importCategoryHint" class="premium-input" style="flex:1;font-size:0.8rem;padding:8px 12px;" placeholder="Category hint (optional, e.g. Wedding Photography)" />
                <span>
                  <span class="wz-rule-title">Category Hint</span>
                  <span class="wz-rule-desc">Fills missing categories for single-niche scrapers.</span>
                </span>
              </label>
            </div>
          </div>

          <h4 style="font-size:0.9rem;margin-top:22px;">Duplicate Detection Rules</h4>
          <div class="wz-rules">
            <label class="wz-rule">
              <input type="checkbox" id="ruleDedupePhone" checked />
              <span>
                <span class="wz-rule-title">Same phone number (Recommended)</span>
                <span class="wz-rule-desc">Matches canonical phone format (+91 9082610087 vs 9082610087).</span>
              </span>
            </label>
            <label class="wz-rule">
              <input type="checkbox" id="ruleDedupeNameCity" checked />
              <span>
                <span class="wz-rule-title">Same business name in same city</span>
                <span class="wz-rule-desc">Catches duplicate listings with minor punctuation differences.</span>
              </span>
            </label>
            <label class="wz-rule">
              <input type="checkbox" id="ruleDedupeEmail" />
              <span>
                <span class="wz-rule-title">Same email address</span>
                <span class="wz-rule-desc">Matches exact email address.</span>
              </span>
            </label>
            <label class="wz-rule">
              <input type="checkbox" id="ruleDedupeWebsite" />
              <span>
                <span class="wz-rule-title">Same website URL</span>
                <span class="wz-rule-desc">Matches domain/website URL.</span>
              </span>
            </label>
          </div>

          <div style="margin-top:20px;display:flex;justify-content:flex-end;">
            <button class="wz-btn-sm brand" id="csvAnalyseBtn" ${s.file ? '' : 'disabled'}
                    onclick="window.WedEazzyCRM.analyseCsv()" style="padding:11px 22px;font-size:0.85rem;">
              <i class="fa-solid fa-wand-magic-sparkles"></i> Analyze Data & Intelligence
            </button>
          </div>
        </div>`;

      bindDropzone();
      return;
    }

    if (s.step === 2 && s.preview) {
      const p = s.preview;
      const sum = p.summary;
      const dq = p.dataQuality || {};
      const dist = p.distribution || {};
      const dupIntel = p.duplicateIntelligence || {};
      const stats = p.columnStats || {};

      const excludedCities = s.excludedCities;
      const excludedCategories = s.excludedCategories;
      const dupAction = s.duplicateAction;

      let willImportCount = 0;
      let skippedCityCount = 0;
      let skippedCatCount = 0;
      let skippedDupCount = 0;

      (p.sample || []).forEach(c => {
        const cityEx = excludedCities.has((c.city || '').toLowerCase().trim());
        const catEx = excludedCategories.has((c.category || '').toLowerCase().trim());

        if (cityEx) { skippedCityCount++; return; }
        if (catEx) { skippedCatCount++; return; }

        if (c.status === 'duplicate_in_db' || c.status === 'duplicate_in_file') {
          if (dupAction === 'skip') { skippedDupCount++; return; }
        }
        if (c.valid) willImportCount++;
      });

      const sampleRatio = sum.total > 0 ? (sum.total / Math.max(1, (p.sample || []).length)) : 1;
      const totalWillImport = Math.round(willImportCount * sampleRatio);
      const totalWillSkip = Math.max(0, sum.total - totalWillImport);

      const topCitiesStr = (dist.cities || []).slice(0, 3).map(c => c.name).join(', ');
      const topCatStr = (dist.categories || [])[0] ? (dist.categories[0].name) : 'All Categories';

      stage.innerHTML = `
        <!-- Intelligence Header -->
        <div class="wz-intel-header">
          <div>
            <div class="wz-intel-title">Business Data Intelligence & Universal Review</div>
            <div class="wz-intel-subtitle">Analyze, clean, filter and review your scraped business data before adding it to WedEazzy.</div>
            <div class="wz-meta-pill">
              <span class="wz-meta-pill-tag">${esc((s.file ? s.file.name.split('.').pop() : 'CSV')).toUpperCase()}</span>
              <span>${esc(s.file ? s.file.name : 'Dataset')}</span>
              <span>• ${fmtNum(sum.total)} records</span>
              <span>• ${esc(topCatStr)}</span>
              <span>• ${esc(topCitiesStr || 'Multiple Cities')}</span>
            </div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="wz-btn-sm ghost" onclick="window.WedEazzyCRM.openImportHistoryModal()">
              <i class="fa-solid fa-history"></i> Import History
            </button>
            <button class="wz-btn-sm ghost" onclick="window.WedEazzyCRM.resetImport()">
              <i class="fa-solid fa-folder-open"></i> Choose Another File
            </button>
          </div>
        </div>

        <!-- 3-Step Progress Stepper -->
        <div class="wz-stepper-container">
          <div class="wz-stepper-step done"><span class="wz-stepper-num">✓</span><span>Upload & Detect</span></div>
          <div style="height:2px;flex:1;background:#10b981;margin:0 12px;"></div>
          <div class="wz-stepper-step active"><span class="wz-stepper-num">2</span><span>Intelligence & Review</span></div>
          <div style="height:2px;flex:1;background:var(--border-color);margin:0 12px;"></div>
          <div class="wz-stepper-step"><span class="wz-stepper-num">3</span><span>Commit & Report</span></div>
        </div>

        <!-- Executive Health Overview Card -->
        <div class="wz-quality-box" style="margin-bottom:20px;">
          <div class="wz-quality-score">
            <div class="val">${dq.overallScore || 0}</div>
            <div class="lbl">${esc((dq.grade || 'SCORE')).toUpperCase()} DATASET</div>
          </div>
          <div style="flex:1;">
            <h4 style="font-size:1.05rem;font-weight:800;color:var(--text-main);margin-bottom:6px;">
              ${dq.overallScore >= 80 ? '✓ Ready for Import' : (dq.overallScore >= 50 ? '⚠ Needs Minor Review' : '❗ Action Required')}
            </h4>
            <p style="font-size:0.84rem;color:var(--text-sub);line-height:1.5;">
              ${esc(dq.explanation || 'Dataset analysis completed successfully.')}
            </p>
            ${(dist.insights && dist.insights.length) ? `
              <div class="wz-insights-list">
                ${dist.insights.map(ins => `<div class="wz-insight-item">${esc(ins.text)}</div>`).join('')}
              </div>` : ''}
          </div>
        </div>

        <!-- Dataset Snapshot KPI Grid -->
        <div class="wz-summary-grid" style="margin-bottom:20px;">
          <div class="wz-summary-tile info"><div class="num">${fmtNum(sum.total)}</div><div class="lbl">Total Records</div></div>
          <div class="wz-summary-tile ok"><div class="num">${fmtNum(sum.newCount)}</div><div class="lbl">Ready to Import</div></div>
          <div class="wz-summary-tile warn"><div class="num">${fmtNum(sum.duplicateInDb + sum.duplicateInFile)}</div><div class="lbl">Duplicates</div></div>
          <div class="wz-summary-tile bad"><div class="num">${fmtNum(sum.invalid)}</div><div class="lbl">Invalid Records</div></div>
          <div class="wz-summary-tile info"><div class="num">${fmtNum(dist.uniqueCitiesCount)}</div><div class="lbl">Cities</div></div>
          <div class="wz-summary-tile info"><div class="num">${fmtNum(dist.uniqueCategoriesCount)}</div><div class="lbl">Categories</div></div>
          <div class="wz-summary-tile ok"><div class="num">${dq.metrics ? dq.metrics.phoneCoverage : 0}%</div><div class="lbl">Phone Coverage</div></div>
        </div>

        <!-- Visual Analytics Grid (Chart.js Bar & Donut) -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
          <div class="panel-card">
            <h4 style="font-size:0.92rem;margin-bottom:10px;"><i class="fa-solid fa-chart-column" style="color:var(--brand-rose);"></i> Listings by City</h4>
            <div style="height:200px;position:relative;">
              <canvas id="wzCityBarChart"></canvas>
            </div>
            ${dist.cityInsight ? `<div style="font-size:0.76rem;color:var(--text-muted);margin-top:10px;font-style:italic;">${esc(dist.cityInsight)}</div>` : ''}
          </div>

          <div class="panel-card">
            <h4 style="font-size:0.92rem;margin-bottom:10px;"><i class="fa-solid fa-chart-pie" style="color:var(--brand-rose);"></i> Category Distribution</h4>
            <div style="height:200px;position:relative;">
              <canvas id="wzCategoryDonutChart"></canvas>
            </div>
            ${dist.categoryInsight ? `<div style="font-size:0.76rem;color:var(--text-muted);margin-top:10px;font-style:italic;">${esc(dist.categoryInsight)}</div>` : ''}
          </div>
        </div>

        <!-- Intelligent Column Mapping Review -->
        <div class="panel-card" style="margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
            <div>
              <h4 style="font-size:0.95rem;margin-bottom:2px;"><i class="fa-solid fa-sliders" style="color:var(--brand-rose);"></i> Intelligent Column Mapping</h4>
              <p style="font-size:0.76rem;color:var(--text-muted);">
                Analyzed <strong>${stats.totalColumns || 0}</strong> columns (${stats.autoMappedCount || 0} auto-mapped, ${stats.reviewNeededCount || 0} need review).
              </p>
            </div>
            <button class="wz-btn-sm brand" onclick="window.WedEazzyCRM.reanalyseWithCustomMapping()">
              <i class="fa-solid fa-rotate"></i> Re-Analyze with Custom Mapping
            </button>
          </div>

          <div class="table-viewport" style="max-height:260px;">
            <table class="grid-table">
              <thead>
                <tr>
                  <th>Uploaded Column</th>
                  <th>WedEazzy Field Target</th>
                  <th>Confidence</th>
                  <th>Detection Method</th>
                </tr>
              </thead>
              <tbody>
                ${(p.columnReviewList || []).map(c => `
                  <tr>
                    <td style="font-weight:700;font-size:0.8rem;">${esc(c.uploadedHeader)}</td>
                    <td>
                      <select class="premium-input wz-col-map-select" data-header="${esc(c.uploadedHeader)}" style="font-size:0.78rem;padding:4px 8px;">
                        <option value="DONT_IMPORT" ${c.targetField === 'DONT_IMPORT' ? 'selected' : ''}>— Don't Import —</option>
                        ${(p.targetFields || []).map(tf => `
                          <option value="${tf.key}" ${c.targetField === tf.key ? 'selected' : ''}>${esc(tf.label)}${tf.required ? ' *' : ''}</option>
                        `).join('')}
                      </select>
                    </td>
                    <td>
                      <span class="wz-confidence-badge ${c.confidenceBadge.toLowerCase().replace(' ', '')}">
                        ${c.confidence}% (${c.confidenceBadge})
                      </span>
                    </td>
                    <td style="font-size:0.74rem;color:var(--text-muted);">${esc(c.matchMethod)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Field Coverage Breakdown -->
        <div class="panel-card" style="margin-bottom:20px;">
          <h4 style="font-size:0.92rem;margin-bottom:14px;"><i class="fa-solid fa-square-poll-vertical" style="color:var(--brand-rose);"></i> Field Coverage Breakdown</h4>
          <div class="wz-quality-grid">
            <div class="wz-quality-item">
              <div class="wz-quality-item-head"><span>Business Names</span><span>${dq.metrics ? dq.metrics.businessNameCoverage : 0}%</span></div>
              <div class="wz-quality-bar-track"><div class="wz-quality-bar-fill" style="width:${dq.metrics ? dq.metrics.businessNameCoverage : 0}%;"></div></div>
            </div>
            <div class="wz-quality-item">
              <div class="wz-quality-item-head"><span>Phone Numbers</span><span>${dq.metrics ? dq.metrics.phoneCoverage : 0}%</span></div>
              <div class="wz-quality-bar-track"><div class="wz-quality-bar-fill" style="width:${dq.metrics ? dq.metrics.phoneCoverage : 0}%;"></div></div>
            </div>
            <div class="wz-quality-item">
              <div class="wz-quality-item-head"><span>Cities</span><span>${dq.metrics ? dq.metrics.cityCoverage : 0}%</span></div>
              <div class="wz-quality-bar-track"><div class="wz-quality-bar-fill" style="width:${dq.metrics ? dq.metrics.cityCoverage : 0}%;"></div></div>
            </div>
            <div class="wz-quality-item">
              <div class="wz-quality-item-head"><span>Categories</span><span>${dq.metrics ? dq.metrics.categoryCoverage : 0}%</span></div>
              <div class="wz-quality-bar-track"><div class="wz-quality-bar-fill" style="width:${dq.metrics ? dq.metrics.categoryCoverage : 0}%;"></div></div>
            </div>
            <div class="wz-quality-item">
              <div class="wz-quality-item-head"><span>Emails</span><span>${dq.metrics ? dq.metrics.emailCoverage : 0}%</span></div>
              <div class="wz-quality-bar-track"><div class="wz-quality-bar-fill" style="width:${dq.metrics ? dq.metrics.emailCoverage : 0}%;"></div></div>
            </div>
            <div class="wz-quality-item">
              <div class="wz-quality-item-head"><span>Websites</span><span>${dq.metrics ? dq.metrics.websiteCoverage : 0}%</span></div>
              <div class="wz-quality-bar-track"><div class="wz-quality-bar-fill" style="width:${dq.metrics ? dq.metrics.websiteCoverage : 0}%;"></div></div>
            </div>
          </div>
        </div>

        <!-- City x Category Vendor Matrix Grid -->
        ${(dist.matrix && dist.matrix.rows && dist.matrix.rows.length) ? `
          <div class="panel-card" style="margin-bottom:20px;">
            <h4 style="font-size:0.9rem;margin-bottom:12px;"><i class="fa-solid fa-table-cells" style="color:var(--brand-rose);"></i> City × Category Vendor Distribution Matrix</h4>
            <div class="table-viewport">
              <table class="wz-matrix-table">
                <thead>
                  <tr>
                    ${(dist.matrix.headers || []).map(h => `<th>${esc(h)}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${dist.matrix.rows.map(r => `
                    <tr>
                      <td class="city-name">${esc(r.city)}</td>
                      ${(dist.matrix.headers || []).slice(1).map(h => `<td>${fmtNum(r[h] || 0)}</td>`).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>` : ''}

        <!-- Duplicate Risk & Inspection Drawer -->
        <div class="panel-card" style="margin-bottom:20px;">
          <h4 style="font-size:0.95rem;margin-bottom:12px;"><i class="fa-solid fa-copy" style="color:var(--brand-rose);"></i> Duplicate Intelligence & Risk Breakdown</h4>
          
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
            <div class="wz-summary-tile warn" style="flex:1;min-width:140px;"><div class="num">${fmtNum(dupIntel.reasons ? dupIntel.reasons.exactPhone : 0)}</div><div class="lbl">Exact Phone Match</div></div>
            <div class="wz-summary-tile warn" style="flex:1;min-width:140px;"><div class="num">${fmtNum(dupIntel.reasons ? dupIntel.reasons.exactEmail : 0)}</div><div class="lbl">Exact Email Match</div></div>
            <div class="wz-summary-tile warn" style="flex:1;min-width:140px;"><div class="num">${fmtNum(dupIntel.reasons ? dupIntel.reasons.nameCityMatch : 0)}</div><div class="lbl">Name + City Match</div></div>
            <div class="wz-summary-tile warn" style="flex:1;min-width:140px;"><div class="num">${fmtNum(dupIntel.reasons ? dupIntel.reasons.websiteMatch : 0)}</div><div class="lbl">Website Match</div></div>
          </div>

          ${(dupIntel.duplicateRows && dupIntel.duplicateRows.length) ? `
            <h5 style="font-size:0.84rem;margin-bottom:10px;">Duplicate Review Table (${dupIntel.duplicateRows.length} flagged for inspection)</h5>
            <div class="table-viewport" style="max-height:260px;">
              <table class="grid-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Incoming Business</th>
                    <th>Existing Listing</th>
                    <th>Match Reason</th>
                    <th>Confidence</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${dupIntel.duplicateRows.map((dr, idx) => `
                    <tr>
                      <td style="font-size:0.75rem;color:var(--text-muted);">${dr.rowNumber}</td>
                      <td style="font-weight:700;font-size:0.8rem;">${esc(dr.incoming.name)}<div style="font-size:0.72rem;color:var(--text-muted);">${esc(dr.incoming.city)} · ${esc(dr.incoming.phone || 'No Phone')}</div></td>
                      <td style="font-size:0.8rem;">${dr.existing ? `${esc(dr.existing.name)}<div style="font-size:0.72rem;color:var(--text-muted);">${esc(dr.existing.city)}</div>` : '<span style="color:var(--text-muted);">In-File Duplicate</span>'}</td>
                      <td><span class="wz-chip active" style="font-size:0.7rem;">${esc(dr.matchType)}</span></td>
                      <td style="font-size:0.76rem;font-weight:700;">${dr.confidence}</td>
                      <td>
                        <button class="wz-btn-sm ghost" onclick="window.WedEazzyCRM.openDuplicateComparisonModal(${idx})">
                          <i class="fa-solid fa-code-compare"></i> Compare
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>` : '<p style="font-size:0.82rem;color:var(--text-muted);"><i class="fa-solid fa-circle-check" style="color:#10b981;"></i> No duplicate records detected in this dataset!</p>'}
        </div>

        <!-- Import Rules & Interactive Exclusion Chips -->
        <div class="panel-card" style="margin-bottom:20px;">
          <h4 style="font-size:0.95rem;margin-bottom:14px;"><i class="fa-solid fa-filter" style="color:var(--brand-rose);"></i> Import Rules & Dynamic Exclusions</h4>
          
          <div style="margin-bottom:18px;">
            <label style="font-weight:700;font-size:0.84rem;">Duplicate Handling Mode</label>
            <select id="importDupActionSelect" class="premium-input" style="font-size:0.82rem;margin-top:4px;" onchange="window.WedEazzyCRM.updateImportImpact()">
              <option value="skip" selected>Don't Import Duplicates (Recommended)</option>
              <option value="first_only">Import First Occurrence Only</option>
              <option value="update_existing">Update Existing DB Listings (Fill Missing Fields)</option>
              <option value="import_all">Import All (Force Add Everything)</option>
            </select>
          </div>

          <!-- Selectable City Chips -->
          <div style="margin-bottom:18px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <label style="font-weight:700;font-size:0.84rem;">Include Cities (${dist.uniqueCitiesCount || 0} detected)</label>
            </div>
            <div class="wz-chip-group">
              ${(dist.cities || []).map(ct => {
                const excluded = excludedCities.has(ct.name.toLowerCase().trim());
                return `
                  <div class="wz-chip ${excluded ? '' : 'active'}" onclick="window.WedEazzyCRM.toggleCityExclusion('${ctx.escJsAttr(ct.name)}')">
                    <span>${excluded ? '☐' : '☑'} ${esc(ct.name)}</span>
                    <span class="wz-chip-count">${ct.count}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>

          <!-- Selectable Category Chips -->
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <label style="font-weight:700;font-size:0.84rem;">Include Categories (${dist.uniqueCategoriesCount || 0} detected)</label>
            </div>
            <div class="wz-chip-group">
              ${(dist.categories || []).map(cat => {
                const excluded = excludedCategories.has(cat.name.toLowerCase().trim());
                return `
                  <div class="wz-chip ${excluded ? '' : 'active'}" onclick="window.WedEazzyCRM.toggleCategoryExclusion('${ctx.escJsAttr(cat.name)}')">
                    <span>${excluded ? '☐' : '☑'} ${esc(cat.name)}</span>
                    <span class="wz-chip-count">${cat.count}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Prominent Smart Import Preview Math Box -->
        <div class="wz-math-summary-box">
          <h4 style="font-size:1rem;font-weight:800;color:var(--text-main);margin-bottom:16px;text-align:center;">
            <i class="fa-solid fa-calculator" style="color:var(--brand-rose);"></i> Dynamic Import Impact Summary
          </h4>
          <div class="wz-math-grid">
            <div class="wz-math-item"><div class="num">${fmtNum(sum.total)}</div><div class="lbl">Uploaded</div></div>
            <div class="wz-math-op">−</div>
            <div class="wz-math-item"><div class="num" style="color:#ea580c;">${fmtNum(skippedDupCount)}</div><div class="lbl">Duplicates</div></div>
            <div class="wz-math-op">−</div>
            <div class="wz-math-item"><div class="num" style="color:#dc2626;">${fmtNum(sum.invalid)}</div><div class="lbl">Invalid</div></div>
            <div class="wz-math-op">−</div>
            <div class="wz-math-item"><div class="num" style="color:#dc2626;">${fmtNum(skippedCityCount + skippedCatCount)}</div><div class="lbl">Excluded</div></div>
            <div class="wz-math-op">=</div>
            <div class="wz-math-item"><div class="num" style="color:#10b981;font-size:2.2rem;">${fmtNum(totalWillImport)}</div><div class="lbl" style="color:#10b981;">WILL BE IMPORTED</div></div>
          </div>

          <div style="display:flex;justify-content:center;gap:12px;margin-top:20px;flex-wrap:wrap;">
            <button class="wz-btn-sm ghost" onclick="window.WedEazzyCRM.resetImport()">
              <i class="fa-solid fa-arrow-left"></i> Choose Another File
            </button>
            <button class="wz-btn-sm brand" id="csvCommitBtn" onclick="window.WedEazzyCRM.commitImport()" style="padding:12px 28px;font-size:0.92rem;" ${totalWillImport === 0 ? 'disabled' : ''}>
              <i class="fa-solid fa-cloud-arrow-up"></i> Import ${fmtNum(totalWillImport)} Listings Now
            </button>
          </div>
        </div>`;

      // Render Charts after DOM mount
      setTimeout(() => renderImportCharts(dist), 100);

      return;
    }

    if (s.step === 3 && s.result) {
      const r = s.result;
      stage.innerHTML = `
        <div class="panel-card" style="text-align:center;padding:44px 24px;">
          <div class="wz-empty-icon" style="color:#10b981;background:rgba(16,185,129,0.12);width:74px;height:74px;font-size:1.8rem;margin:0 auto 16px;">
            <i class="fa-solid fa-circle-check"></i>
          </div>
          <h3 style="font-size:1.3rem;margin-bottom:8px;">Import Completed Successfully</h3>
          <p style="font-size:0.85rem;color:var(--text-muted);max-width:480px;margin:0 auto 24px;">
            Your listings have been created and updated in the WedEazzy registry database.
          </p>

          <div class="wz-summary-grid" style="max-width:640px;margin:0 auto 24px;">
            <div class="wz-summary-tile ok"><div class="num">${fmtNum(r.created)}</div><div class="lbl">Created</div></div>
            <div class="wz-summary-tile info"><div class="num">${fmtNum(r.updated)}</div><div class="lbl">Updated</div></div>
            <div class="wz-summary-tile warn"><div class="num">${fmtNum(r.skipped)}</div><div class="lbl">Skipped</div></div>
            ${r.failed ? `<div class="wz-summary-tile bad"><div class="num">${fmtNum(r.failed)}</div><div class="lbl">Failed</div></div>` : ''}
          </div>

          ${(r.errors && r.errors.length) ? `
            <div style="margin-bottom:20px;">
              <button class="wz-btn-sm red" onclick="window.WedEazzyCRM.downloadErrorReport('${ctx.escJsAttr(r.importBatchId)}')">
                <i class="fa-solid fa-file-csv"></i> Download CSV Error Report (${r.errors.length} failed rows)
              </button>
            </div>` : ''}

          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button class="wz-btn-sm" onclick="window.WedEazzyCRM.resetImport()">
              <i class="fa-solid fa-plus"></i> Import Another File
            </button>
            <button class="wz-btn-sm brand" onclick="window.WedEazzyCRM.go('vendors')">
              <i class="fa-solid fa-store"></i> View All Businesses
            </button>
          </div>
        </div>`;
      return;
    }

    s.step = 1;
    renderImportStage();
  }

  function bindDropzone() {
    const zone = document.getElementById('csvDropzone');
    const input = document.getElementById('csvFileInput');
    if (!zone || !input) return;

    const accept = (file) => {
      if (!file) return;
      if (!/\.(csv|tsv|xlsx|xls)$/i.test(file.name)) {
        ctx.showToast('Please choose a .csv, .tsv, .xlsx, or .xls file.', 'danger');
        return;
      }
      view.importer.file = file;
      renderImportStage();
    };

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', (e) => accept(e.target.files[0]));

    ['dragenter', 'dragover'].forEach(evt =>
      zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(evt =>
      zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove('dragover'); }));
    zone.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      accept(file);
    });

    document.querySelectorAll('[data-country-pick]').forEach(label => {
      label.addEventListener('click', () => {
        document.querySelectorAll('[data-country-pick]').forEach(l => l.classList.remove('wz-country-pick-checked'));
        label.classList.add('wz-country-pick-checked');
        const code = label.getAttribute('data-country-pick');
        if (code) {
          view.importer.targetCountry = code;
          if (typeof window.handleGlobalCountryChange === 'function') {
            window.handleGlobalCountryChange(code);
          }
        }
      });
    });

    document.querySelectorAll('input[name="importCountry"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.value) {
          view.importer.targetCountry = e.target.value;
          if (typeof window.handleGlobalCountryChange === 'function') {
            window.handleGlobalCountryChange(e.target.value);
          }
        }
      });
    });
  }

  /* ============================================================
     INTERACTIVE IMPORT HELPERS & NETWORK CALLS
     ============================================================ */
  async function analyseCsv(customMapping = null) {
    const s = view.importer;
    if (!s.file || s.busy) return;

    const btn = document.getElementById('csvAnalyseBtn');
    s.busy = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch wz-spin"></i> Analyzing Intelligence…'; }

    const fd = new FormData();
    fd.append('file', s.file);
    fd.append('dedupePhone', document.getElementById('ruleDedupePhone').checked ? 'true' : 'false');
    fd.append('dedupeNameCity', document.getElementById('ruleDedupeNameCity').checked ? 'true' : 'false');
    fd.append('dedupeEmail', document.getElementById('ruleDedupeEmail').checked ? 'true' : 'false');
    fd.append('dedupeWebsite', document.getElementById('ruleDedupeWebsite').checked ? 'true' : 'false');

    const countryEl = document.querySelector('input[name="importCountry"]:checked');
    if (countryEl) {
      s.targetCountry = countryEl.value;
    }
    fd.append('country', s.targetCountry || 'IN');
    const cityHint = (document.getElementById('importCityHint') || {}).value || '';
    if (cityHint) fd.append('city', cityHint);
    const categoryHint = (document.getElementById('importCategoryHint') || {}).value || '';
    if (categoryHint) fd.append('category', categoryHint);

    if (customMapping) {
      fd.append('customMapping', JSON.stringify(customMapping));
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/import/preview`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken()}`, 'X-Requested-With': 'XMLHttpRequest' },
        body: fd,
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        s.preview = data;
        s.importId = data.importId;
        s.step = 2;
        renderImportListings();
      } else {
        ctx.showToast(data.error || data.message || 'Could not analyze that file.', 'danger');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Analyze Data & Intelligence'; }
      }
    } catch (err) {
      ctx.showToast('Upload failed: ' + err.message, 'danger');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Analyze Data & Intelligence'; }
    } finally {
      s.busy = false;
    }
  }

  function reanalyseWithCustomMapping() {
    const customMapping = {};
    document.querySelectorAll('.wz-col-map-select').forEach(select => {
      const header = select.getAttribute('data-header');
      if (header) customMapping[header] = select.value;
    });
    analyseCsv(customMapping);
  }

  function toggleCityExclusion(cityName) {
    const s = view.importer;
    const lower = cityName.toLowerCase().trim();
    if (s.excludedCities.has(lower)) s.excludedCities.delete(lower);
    else s.excludedCities.add(lower);
    renderImportStage();
  }

  function toggleCategoryExclusion(catName) {
    const s = view.importer;
    const lower = catName.toLowerCase().trim();
    if (s.excludedCategories.has(lower)) s.excludedCategories.delete(lower);
    else s.excludedCategories.add(lower);
    renderImportStage();
  }

  function updateImportImpact() {
    const sel = document.getElementById('importDupActionSelect');
    if (sel) view.importer.duplicateAction = sel.value;
    renderImportStage();
  }

  function openDuplicateComparisonModal(index) {
    const s = view.importer;
    if (!s.preview || !s.preview.duplicateIntelligence) return;
    const dupes = s.preview.duplicateIntelligence.duplicateRows || [];
    const item = dupes[index];
    if (!item) return;

    const inc = item.incoming || {};
    const ex = item.existing || {};

    const body = `
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:10px;">
        Matching reason: <strong style="color:var(--text-main);">${esc(item.reason)}</strong> (${esc(item.matchType)})
      </div>
      <div class="wz-diff-drawer">
        <div class="wz-diff-col">
          <h5 style="color:var(--brand-rose);"><i class="fa-solid fa-file-import"></i> Incoming Record</h5>
          <div class="wz-diff-field"><div class="lbl">Business Name</div><div class="val ${ex.name && ex.name !== inc.name ? 'diff' : 'match'}">${esc(inc.name || '—')}</div></div>
          <div class="wz-diff-field"><div class="lbl">Phone Number</div><div class="val ${ex.phone && ex.phone !== inc.phone ? 'diff' : 'match'}">${esc(inc.phone || '—')}</div></div>
          <div class="wz-diff-field"><div class="lbl">City</div><div class="val ${ex.city && ex.city !== inc.city ? 'diff' : 'match'}">${esc(inc.city || '—')}</div></div>
          <div class="wz-diff-field"><div class="lbl">Category</div><div class="val">${esc(inc.category || '—')}</div></div>
          <div class="wz-diff-field"><div class="lbl">Website</div><div class="val">${esc(inc.website || '—')}</div></div>
          <div class="wz-diff-field"><div class="lbl">Address</div><div class="val">${esc(inc.address || '—')}</div></div>
        </div>
        <div class="wz-diff-col">
          <h5 style="color:#10b981;"><i class="fa-solid fa-database"></i> Existing Database Listing</h5>
          <div class="wz-diff-field"><div class="lbl">Business Name</div><div class="val">${esc(ex.name || '— (In-file Dupe)')}</div></div>
          <div class="wz-diff-field"><div class="lbl">Phone Number</div><div class="val">${esc(ex.phone || '—')}</div></div>
          <div class="wz-diff-field"><div class="lbl">City</div><div class="val">${esc(ex.city || '—')}</div></div>
          <div class="wz-diff-field"><div class="lbl">Category</div><div class="val">${esc(ex.category || '—')}</div></div>
          <div class="wz-diff-field"><div class="lbl">Website</div><div class="val">${esc(ex.website || '—')}</div></div>
          <div class="wz-diff-field"><div class="lbl">Address</div><div class="val">${esc(ex.address || '—')}</div></div>
        </div>
      </div>`;

    ctx.openModal('<i class="fa-solid fa-code-compare" style="color:var(--brand-rose);"></i> Record Comparison Inspector', body, '<button class="wz-btn-sm brand" onclick="window.closeModal()">Close Inspection</button>');
  }

  async function commitImport() {
    const s = view.importer;
    if (!s.importId || s.busy) return;

    const btn = document.getElementById('csvCommitBtn');
    s.busy = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch wz-spin"></i> Importing Businesses…'; }

    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/import/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken()}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          importId: s.importId,
          duplicateAction: s.duplicateAction,
          excludedCities: Array.from(s.excludedCities),
          excludedCategories: Array.from(s.excludedCategories),
          filters: s.filters,
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        s.result = data;
        s.step = 3;
        renderImportListings();
        ctx.showToast(`Imported ${data.created} listing${data.created === 1 ? '' : 's'}.`, 'success');
        if (window.WedEazzyStore) await window.WedEazzyStore.sync();
      } else {
        ctx.showToast(data.error || data.message || 'Import failed.', 'danger');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Retry Import'; }
      }
    } catch (err) {
      ctx.showToast('Import failed: ' + err.message, 'danger');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Retry Import'; }
    } finally {
      s.busy = false;
    }
  }

  async function openImportHistoryModal() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/import/history`, {
        headers: { 'Authorization': `Bearer ${authToken()}` },
      });
      const data = await res.json();
      const history = (data.history || []);

      const body = `
        <div class="table-viewport" style="max-height:360px;">
          <table class="grid-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>File Name</th>
                <th>Rows</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Skipped</th>
                <th>Failed</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${history.length ? history.map(h => `
                <tr>
                  <td style="font-size:0.75rem;">${fmtDate(h.createdAt)}</td>
                  <td style="font-weight:700;font-size:0.78rem;">${esc(h.fileName)}</td>
                  <td style="font-size:0.76rem;">${fmtNum(h.totalRows)}</td>
                  <td style="font-size:0.76rem;color:#10b981;font-weight:700;">${fmtNum(h.importedCount)}</td>
                  <td style="font-size:0.76rem;color:#2563eb;">${fmtNum(h.updatedCount)}</td>
                  <td style="font-size:0.76rem;color:#ea580c;">${fmtNum(h.skippedCount)}</td>
                  <td style="font-size:0.76rem;color:#dc2626;">${fmtNum(h.failedCount)}</td>
                  <td>
                    ${h.failedCount > 0 ? `
                      <button class="wz-btn-sm red" onclick="window.WedEazzyCRM.downloadErrorReport('${ctx.escJsAttr(h.importBatchId)}')">
                        <i class="fa-solid fa-download"></i> Log
                      </button>` : '<span style="color:var(--text-muted);font-size:0.72rem;">Clean</span>'}
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">No previous import batches logged yet.</td></tr>'}
            </tbody>
          </table>
        </div>`;

      ctx.openModal('<i class="fa-solid fa-history" style="color:var(--brand-rose);"></i> Import History Log', body, '<button class="wz-btn-sm brand" onclick="window.closeModal()">Close</button>');
    } catch (err) {
      ctx.showToast('Could not fetch import history: ' + err.message, 'danger');
    }
  }

  async function downloadErrorReport(batchId) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/import/error-report/${encodeURIComponent(batchId)}`, {
        headers: { 'Authorization': `Bearer ${authToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import-errors-${batchId.slice(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      ctx.showToast('Could not download error report: ' + err.message, 'danger');
    }
  }

  async function downloadTemplate() {
    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/import/template`, {
        headers: { 'Authorization': `Bearer ${authToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'wedeazzy-listings-template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      ctx.showToast('Could not download the template: ' + err.message, 'danger');
    }
  }

  /* ============================================================
     Invite composer modal — PDF item 2
     ============================================================ */
  function openInviteModal(vendorId) {
    const store = window.WedEazzyStore.get();
    const v = (store.vendors || []).find(x => String(x.id) === String(vendorId));
    if (!v) { ctx.showToast('Listing not found — try refreshing.', 'danger'); return; }

    // Show the local 10-digit part; the 91 prefix is fixed in the UI so the
    // admin cannot accidentally double it.
    const existing = String(v.contact || '').replace(/[^0-9]/g, '');
    const local = existing.length > 10 ? existing.slice(-10) : existing;
    const email = v.email && v.email !== '—' ? v.email : '';
    const claimUrl = `${window.location.origin}/pages/vendor.html`;
    const defaultMsg = `Hi! Your business "${v.name}" is listed on WedEazzy.com. Claim your free listing to manage your profile, photos, and leads: ${claimUrl}`;

    const body = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;background:var(--canvas-bg);border:1px solid var(--border-color);">
          <div class="wz-biz-avatar">${esc(initials(v.name))}</div>
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:0.88rem;">${esc(v.name)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${esc(v.category)} · ${esc(vendorCity(v)) || '—'}</div>
          </div>
        </div>

        <div class="modal-form-group">
          <label>Send via</label>
          <div class="wz-channel-grid">
            <label class="wz-channel wa checked" id="chWaLabel">
              <input type="checkbox" id="chWa" checked />
              <i class="fa-brands fa-whatsapp" style="font-size:1.1rem;"></i> WhatsApp
            </label>
            <label class="wz-channel mail ${email ? 'checked' : ''}" id="chMailLabel">
              <input type="checkbox" id="chMail" ${email ? 'checked' : ''} />
              <i class="fa-regular fa-envelope" style="font-size:1rem;"></i> Email
            </label>
          </div>
        </div>

        <div class="modal-form-group" id="waFieldGroup">
          <label for="inviteWa">WhatsApp number</label>
          <div class="wz-phone-field">
            <span class="wz-phone-prefix">+91</span>
            <input type="tel" id="inviteWa" class="premium-input" inputmode="numeric" maxlength="10"
                   placeholder="98765 43210" value="${esc(local)}" />
          </div>
          <div class="wz-hint" id="waHint">
            10-digit Indian mobile. Saving a corrected number here also updates the listing.
          </div>
        </div>

        <div class="modal-form-group" id="mailFieldGroup" style="${email ? '' : 'display:none;'}">
          <label for="inviteEmail">Email address</label>
          <input type="email" id="inviteEmail" class="premium-input" placeholder="owner@business.com" value="${esc(email)}" />
        </div>

        <div class="modal-form-group">
          <label for="inviteMsg">Message</label>
          <textarea id="inviteMsg" class="premium-input" rows="4"
                    style="resize:vertical;line-height:1.55;">${esc(defaultMsg)}</textarea>
          <div class="wz-hint">Leave as-is to send the standard claim invitation.</div>
        </div>

        <div class="modal-form-group">
          <label>Preview</label>
          <div class="wz-wa-preview">
            <div class="wz-wa-bubble" id="invitePreview">${esc(defaultMsg)}</div>
          </div>
        </div>
      </div>`;

    const footer = `
      <button class="btn-premium" onclick="window.closeModal()">Cancel</button>
      <button class="btn-premium btn-premium-rose" id="inviteSendBtn"
              onclick="window.WedEazzyCRM.submitInvite('${ctx.escJsAttr(String(v.id))}')">
        <i class="fa-solid fa-paper-plane"></i> Send invitation
      </button>`;

    ctx.openModal(`<i class="fa-solid fa-paper-plane" style="color:var(--brand-rose);"></i> Invite to claim listing`, body, footer);

    // Widen the modal for the composer, then bind live behaviour.
    const box = document.getElementById('modalBox');
    if (box) box.classList.add('wz-modal-lg');

    const sync = () => {
      const wa = document.getElementById('chWa');
      const mail = document.getElementById('chMail');
      document.getElementById('chWaLabel').classList.toggle('checked', wa.checked);
      document.getElementById('chMailLabel').classList.toggle('checked', mail.checked);
      document.getElementById('waFieldGroup').style.display = wa.checked ? '' : 'none';
      document.getElementById('mailFieldGroup').style.display = mail.checked ? '' : 'none';
    };
    ['chWa', 'chMail'].forEach(id => {
      const n = document.getElementById(id);
      if (n) n.addEventListener('change', sync);
    });
    sync();

    const waInput = document.getElementById('inviteWa');
    if (waInput) {
      waInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
        const hint = document.getElementById('waHint');
        const val = e.target.value;
        if (val && !/^[6-9]\d{9}$/.test(val)) {
          hint.textContent = 'An Indian mobile number is 10 digits and starts with 6, 7, 8 or 9.';
          hint.classList.add('err');
        } else {
          hint.textContent = 'Saving a corrected number here also updates the listing.';
          hint.classList.remove('err');
        }
      });
    }

    const msg = document.getElementById('inviteMsg');
    const preview = document.getElementById('invitePreview');
    if (msg && preview) {
      msg.addEventListener('input', () => { preview.textContent = msg.value; });
    }
  }

  async function submitInvite(vendorId) {
    const wa = document.getElementById('chWa');
    const mail = document.getElementById('chMail');
    const waNum = (document.getElementById('inviteWa') || {}).value || '';
    const email = (document.getElementById('inviteEmail') || {}).value || '';
    const message = (document.getElementById('inviteMsg') || {}).value || '';
    const btn = document.getElementById('inviteSendBtn');

    const channels = [];
    if (wa && wa.checked) channels.push('whatsapp');
    if (mail && mail.checked) channels.push('email');

    if (channels.length === 0) {
      ctx.showToast('Pick at least one channel to send on.', 'danger');
      return;
    }
    if (channels.includes('whatsapp') && waNum && !/^[6-9]\d{9}$/.test(waNum)) {
      ctx.showToast('That WhatsApp number is not a valid 10-digit Indian mobile.', 'danger');
      return;
    }
    if (channels.includes('whatsapp') && !waNum) {
      ctx.showToast('Enter a WhatsApp number, or untick the WhatsApp channel.', 'danger');
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch wz-spin"></i> Sending…'; }

    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/${encodeURIComponent(vendorId)}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken()}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          channels,
          whatsappNumber: waNum ? `91${waNum}` : undefined,
          email: email || undefined,
          message: message || undefined,
          saveNumber: true,
        }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        ctx.closeModal();
        ctx.showToast('Invitation sent.', 'success');
        if (window.WedEazzyStore) await window.WedEazzyStore.sync();
        ctx.rerender();
      } else {
        ctx.showToast(data.error || data.message || 'Could not send the invitation.', 'danger');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send invitation'; }
      }
    } catch (err) {
      ctx.showToast('Network error: ' + err.message, 'danger');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send invitation'; }
    }
  }

  async function bulkInvite() {
    const ids = [...view.vendors.selected];
    if (ids.length === 0) return;
    if (!confirm(`Send a claim invitation to ${ids.length} listing${ids.length === 1 ? '' : 's'}?`)) return;

    ctx.showToast(`Sending ${ids.length} invitation${ids.length === 1 ? '' : 's'}…`, 'info');
    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/bulk-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken()}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const skipped = (data.skipped || []).length;
        ctx.showToast(
          `${data.sent} invitation${data.sent === 1 ? '' : 's'} sent${skipped ? `, ${skipped} skipped (no contact details)` : ''}.`,
          'success'
        );
        view.vendors.selected.clear();
        if (window.WedEazzyStore) await window.WedEazzyStore.sync();
        ctx.rerender();
      } else {
        ctx.showToast(data.error || 'Bulk invite failed.', 'danger');
      }
    } catch (err) {
      ctx.showToast('Network error: ' + err.message, 'danger');
    }
  }

  /* ============================================================
     CSV import network calls
     ============================================================ */
  async function analyseCsv() {
    const s = view.importer;
    if (!s.file || s.busy) return;

    const btn = document.getElementById('csvAnalyseBtn');
    s.busy = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch wz-spin"></i> Analysing…'; }

    const fd = new FormData();
    fd.append('file', s.file);
    fd.append('dedupePhone', document.getElementById('ruleDedupePhone').checked ? 'true' : 'false');
    fd.append('dedupeNameCity', document.getElementById('ruleDedupeNameCity').checked ? 'true' : 'false');
    fd.append('dedupeEmail', document.getElementById('ruleDedupeEmail').checked ? 'true' : 'false');

    const countryEl = document.querySelector('input[name="importCountry"]:checked');
    if (countryEl) fd.append('country', countryEl.value);
    const cityHint = (document.getElementById('importCityHint') || {}).value || '';
    if (cityHint) fd.append('city', cityHint);

    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/import/preview`, {
        method: 'POST',
        // No Content-Type header: the browser must set the multipart boundary.
        headers: { 'Authorization': `Bearer ${authToken()}`, 'X-Requested-With': 'XMLHttpRequest' },
        body: fd,
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        s.preview = data;
        s.importId = data.importId;
        s.step = 2;
        renderImportListings();
      } else {
        ctx.showToast(data.error || data.message || 'Could not read that CSV file.', 'danger');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-magnifying-glass-chart"></i> Analyse file'; }
      }
    } catch (err) {
      ctx.showToast('Upload failed: ' + err.message, 'danger');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-magnifying-glass-chart"></i> Analyse file'; }
    } finally {
      s.busy = false;
    }
  }

  function resetImport() {
    view.importer.step = 1;
    view.importer.file = null;
    view.importer.importId = null;
    view.importer.preview = null;
    view.importer.result = null;
    view.importer.busy = false;
    view.importer.targetCountry = null;
    view.importer.customMapping = {};
    if (view.importer.excludedCities) view.importer.excludedCities.clear();
    if (view.importer.excludedCategories) view.importer.excludedCategories.clear();
    renderImportListings();
  }

  /* ============================================================
     Public API
     ============================================================ */
  const CRM = {
    attach(injected) { ctx = Object.assign(ctx, injected); },

    renderCrmDashboard,
    renderVendors,
    renderInvitations,
    renderClaimedListings,
    renderImportListings,
    destroyAllCharts,

    // CSV Importer Methods
    analyseCsv,
    analyzeCsv: analyseCsv,
    reanalyseWithCustomMapping,
    resetImport,
    commitImport,
    updateImportImpact,
    toggleCityExclusion,
    toggleCategoryExclusion,
    downloadErrorReport,
    downloadTemplate,
    openDuplicateComparisonModal,
    openImportHistoryModal,

    go(tab) { if (typeof window.wedeazzyMountTab === 'function') window.wedeazzyMountTab(tab); },

    goVendorsPage(p) { view.vendors.page = p; renderVendors(window.WedEazzyStore.get()); scrollTop(); },
    goInvitationsPage(p) { view.invitations.page = p; renderInvitations(window.WedEazzyStore.get()); scrollTop(); },
    goClaimedPage(p) { view.claimed.page = p; renderClaimedListings(window.WedEazzyStore.get()); scrollTop(); },

    setVendorPageSize(sz) {
      view.vendors.pageSize = Number(sz) || 15;
      view.vendors.page = 1;
      renderVendors(window.WedEazzyStore.get());
    },
    setInvitationsPageSize(sz) {
      view.invitations.pageSize = Number(sz) || 15;
      view.invitations.page = 1;
      renderInvitations(window.WedEazzyStore.get());
    },
    setClaimedPageSize(sz) {
      view.claimed.pageSize = Number(sz) || 15;
      view.claimed.page = 1;
      renderClaimedListings(window.WedEazzyStore.get());
    },

    resetVendorFilters() {
      Object.assign(view.vendors, { page: 1, search: '', category: '', city: '', country: '', approval: '', plan: '', dateFrom: '' });
      if (typeof window.handleGlobalCountryChange === 'function') {
        window.handleGlobalCountryChange('all');
      } else {
        renderVendors(window.WedEazzyStore.get());
      }
    },
    setCountryFilter(country) {
      if (typeof window.handleGlobalCountryChange === 'function') {
        window.handleGlobalCountryChange(country || 'all');
      } else {
        view.vendors.country = country;
        view.vendors.city = '';  // reset city when country changes
        view.vendors.page = 1;
        renderVendors(window.WedEazzyStore.get());
      }
    },
    resetInviteFilters() {
      Object.assign(view.invitations, { page: 1, search: '', channel: '' });
      renderInvitations(window.WedEazzyStore.get());
    },
    resetClaimedFilters() {
      Object.assign(view.claimed, { page: 1, search: '', status: '' });
      renderClaimedListings(window.WedEazzyStore.get());
    },

    clearVendorSelection() {
      view.vendors.selected.clear();
      renderVendors(window.WedEazzyStore.get());
    },

    openInviteModal,
    submitInvite,
    renderCountries,
    renderLocations,
    openAddCountryModal,
    openEditCountryModal,
    openCountryDetailDrawer,
    switchDrawerTab,
    exportCountryData,
    submitCountryForm,
    openAddCityModal,
    openEditCityModal,
    submitCityForm,
    openAddRegionModal,
    submitRegionForm,
    toggleCountryStatus,
    toggleCityStatus,
  };

  /* ============================================================
     COUNTRY & LOCATION MANAGEMENT MODULE
     ============================================================ */
  async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    const headers = { 'Authorization': `Bearer ${token}`, ...(options.headers || {}) };
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || data.error || 'API Request Failed');
    return data;
  }

  async function renderCountries(store) {
    destroyAllCharts();
    const body = ctx.portalBody || document.getElementById('portalBody');
    if (!body) return;

    body.innerHTML = `
      <div style="padding: 24px; max-width: 1400px; margin: 0 auto;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.6rem;">🌍</span>
              <h2 style="font-family: var(--font-head); font-size: 1.45rem; font-weight: 700; color: var(--text-main); margin: 0;">COUNTRY OPERATIONS</h2>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-sub); margin: 4px 0 0;">Manage the countries, currencies, regions, cities and marketplace operations available on WedEazzy.</p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button class="btn-premium btn-premium-rose" onclick="window.WedEazzyCRM.openAddCountryModal()" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; font-weight: 600; border-radius: 10px;">
              <i class="fa-solid fa-plus"></i> Add Country
            </button>
            <button class="btn-premium" onclick="window.location.hash = '#import'" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; font-weight: 600; border-radius: 10px;">
              <i class="fa-solid fa-file-import"></i> Import Locations
            </button>
            <button class="btn-premium" onclick="window.WedEazzyCRM.exportCountryData()" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; font-weight: 600; border-radius: 10px;">
              <i class="fa-solid fa-download"></i> Export Country Data
            </button>
          </div>
        </div>

        <div id="countriesKpiContainer" style="margin-bottom: 24px;"></div>

        <div id="countriesTableContainer" style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 16px; padding: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
          <div style="text-align: center; padding: 50px; color: var(--text-muted);">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.6rem; color: var(--brand-rose); margin-bottom: 12px;"></i>
            <div>Loading live country network data...</div>
          </div>
        </div>
      </div>
    `;

    try {
      const data = await apiFetch('/api/admin/countries');
      const countries = data.countries || [];
      renderCountriesSummaryKpis(countries);
      renderCountriesTable(countries);
    } catch (err) {
      document.getElementById('countriesTableContainer').innerHTML = `
        <div style="color: var(--brand-rose); padding: 24px; text-align: center; font-weight: 600;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; margin-bottom: 8px; display: block;"></i>
          Failed to load country records: ${esc(err.message)}
        </div>
      `;
    }
  }

  function renderCountriesSummaryKpis(countries) {
    const kpiContainer = document.getElementById('countriesKpiContainer');
    if (!kpiContainer) return;

    const totalConfigured = countries.length;
    const activeCountries = countries.filter(c => c.status === 'active').length;
    const countriesWithListings = countries.filter(c => (c.vendorsCount || c.vendors || 0) > 0).length;
    const countriesWithVendors = countries.filter(c => (c.claimedVendorsCount || c.claimed || 0) > 0).length;
    const totalCities = countries.reduce((sum, c) => sum + (c.citiesCount || c.cities || 0), 0);
    const totalListings = countries.reduce((sum, c) => sum + (c.vendorsCount || c.vendors || 0), 0);
    const totalVendors = countries.reduce((sum, c) => sum + (c.claimedVendorsCount || c.claimed || 0), 0);
    const totalRev = countries.reduce((sum, c) => sum + (c.revenue || 0), 0);

    kpiContainer.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px;">
        <div class="panel-card" style="padding: 14px; background: #FFFFFF; border-left: 3px solid #182033;">
          <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #667085;">Configured Countries</div>
          <div style="font-size: 1.3rem; font-weight: 800; color: #182033; margin-top: 4px;">${totalConfigured}</div>
        </div>
        <div class="panel-card" style="padding: 14px; background: #FFFFFF; border-left: 3px solid #10B981;">
          <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #667085;">Active Countries</div>
          <div style="font-size: 1.3rem; font-weight: 800; color: #182033; margin-top: 4px;">${activeCountries}</div>
        </div>
        <div class="panel-card" style="padding: 14px; background: #FFFFFF; border-left: 3px solid #3B82F6;">
          <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #667085;">With Listings</div>
          <div style="font-size: 1.3rem; font-weight: 800; color: #182033; margin-top: 4px;">${countriesWithListings}</div>
        </div>
        <div class="panel-card" style="padding: 14px; background: #FFFFFF; border-left: 3px solid #8B5CF6;">
          <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #667085;">With Vendors</div>
          <div style="font-size: 1.3rem; font-weight: 800; color: #182033; margin-top: 4px;">${countriesWithVendors}</div>
        </div>
        <div class="panel-card" style="padding: 14px; background: #FFFFFF; border-left: 3px solid #F59E0B;">
          <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #667085;">Total Cities</div>
          <div style="font-size: 1.3rem; font-weight: 800; color: #182033; margin-top: 4px;">${totalCities.toLocaleString('en-IN')}</div>
        </div>
        <div class="panel-card" style="padding: 14px; background: #FFFFFF; border-left: 3px solid #E52B3A;">
          <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #667085;">Total Listings</div>
          <div style="font-size: 1.3rem; font-weight: 800; color: #182033; margin-top: 4px;">${totalListings.toLocaleString('en-IN')}</div>
        </div>
        <div class="panel-card" style="padding: 14px; background: #FFFFFF; border-left: 3px solid #06B6D4;">
          <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #667085;">Total Vendors</div>
          <div style="font-size: 1.3rem; font-weight: 800; color: #182033; margin-top: 4px;">${totalVendors.toLocaleString('en-IN')}</div>
        </div>
        <div class="panel-card" style="padding: 14px; background: #FFFFFF; border-left: 3px solid #84CC16;">
          <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #667085;">Total Revenue</div>
          <div style="font-size: 1.3rem; font-weight: 800; color: #182033; margin-top: 4px;">₹${totalRev.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>
    `;
  }

  function renderCountriesTable(countries) {
    const container = document.getElementById('countriesTableContainer');
    if (!container) return;

    if (!countries.length) {
      container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);">No countries configured.</div>`;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main);">Country Operations Network (${countries.length})</div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 0.78rem; color: var(--text-sub);">Active Admin Scope:</span>
          <span class="badge-premium" style="background: rgba(220,31,48,0.1); color: var(--brand-rose); font-weight: 700; padding: 4px 10px; border-radius: 99px;">
            ${(window.WedEazzyCountryScope || 'all').toUpperCase()}
          </span>
        </div>
      </div>

      <div style="overflow-x: auto;">
        <table class="crm-table" style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.82rem;">
          <thead>
            <tr style="background: var(--surface-subtle); color: var(--text-sub); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.5px;">
              <th style="padding: 12px 14px; text-align: left; border-radius: 8px 0 0 8px;">Country</th>
              <th style="padding: 12px 14px; text-align: left;">Code</th>
              <th style="padding: 12px 14px; text-align: left;">Currency</th>
              <th style="padding: 12px 14px; text-align: center;">Regions</th>
              <th style="padding: 12px 14px; text-align: center;">Cities</th>
              <th style="padding: 12px 14px; text-align: center;">Listings</th>
              <th style="padding: 12px 14px; text-align: center;">Claimed</th>
              <th style="padding: 12px 14px; text-align: center;">Paid Vendors</th>
              <th style="padding: 12px 14px; text-align: center;">Enquiries</th>
              <th style="padding: 12px 14px; text-align: center;">Bookings</th>
              <th style="padding: 12px 14px; text-align: center;">Revenue</th>
              <th style="padding: 12px 14px; text-align: center;">Status</th>
              <th style="padding: 12px 14px; text-align: right; border-radius: 0 8px 8px 0;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${countries.map(c => {
              const vCount = c.vendorsCount || c.vendors || 0;
              const cCount = c.claimedVendorsCount || c.claimed || 0;
              const pCount = c.paidVendorsCount || 0;
              const cityCount = c.citiesCount || c.cities || 0;
              const regCount = c.regionsCount || 0;
              const inqCount = c.inquiriesCount || c.inquiries || 0;
              const bookCount = c.bookingsCount || 0;
              const rev = c.revenue || 0;
              const health = c.healthState || (vCount > 0 ? 'LIVE' : 'READY');

              return `
                <tr style="border-bottom: 1px solid var(--border-subtle); cursor: pointer; transition: background 0.15s ease;" 
                    onclick="window.WedEazzyCRM.openCountryDetailDrawer('${c.id}')"
                    onmouseover="this.style.background='var(--surface-subtle)'" 
                    onmouseout="this.style.background='transparent'">
                  <td style="padding: 14px 14px; font-weight: 700; color: var(--text-main);">
                    <span style="font-size: 1.2rem; margin-right: 8px; vertical-align: middle;">${esc(c.flag)}</span>
                    <span>${esc(c.name)}</span>
                  </td>
                  <td style="padding: 14px 14px;">
                    <span style="font-family: 'Courier New', monospace; font-weight: 700; background: var(--surface-subtle); padding: 3px 8px; border-radius: 6px; border: 1px solid var(--border-color);">
                      ${esc(c.code)}
                    </span>
                  </td>
                  <td style="padding: 14px 14px; color: var(--text-sub);">
                    ${esc(c.currencySymbol)} ${esc(c.currency)}
                  </td>
                  <td style="padding: 14px 14px; text-align: center;">
                    ${regCount} Regions
                  </td>
                  <td style="padding: 14px 14px; text-align: center; font-weight: 600;">
                    <span style="background: rgba(0,0,0,0.04); padding: 3px 10px; border-radius: 99px;">${cityCount} Cities</span>
                  </td>
                  <td style="padding: 14px 14px; text-align: center; font-weight: 700; color: var(--brand-rose);">
                    ${fmtNum(vCount)}
                  </td>
                  <td style="padding: 14px 14px; text-align: center; font-weight: 600;">
                    ${fmtNum(cCount)}
                  </td>
                  <td style="padding: 14px 14px; text-align: center;">
                    <span class="interactive-pill-badge" style="font-size: 0.68rem;">${pCount} paid</span>
                  </td>
                  <td style="padding: 14px 14px; text-align: center;">
                    ${fmtNum(inqCount)}
                  </td>
                  <td style="padding: 14px 14px; text-align: center;">
                    ${fmtNum(bookCount)}
                  </td>
                  <td style="padding: 14px 14px; text-align: center; font-weight: 700;">
                    ₹${rev.toLocaleString('en-IN')}
                  </td>
                  <td style="padding: 14px 14px; text-align: center;">
                    <span class="status-badge" style="padding: 4px 10px; border-radius: 99px; font-size: 0.72rem; font-weight: 800; ${health === 'LIVE' ? 'background: rgba(16,185,129,0.12); color: #10b981;' : health === 'READY' ? 'background: rgba(59,130,246,0.12); color: #3b82f6;' : 'background: rgba(148,163,184,0.15); color: #64748b;'}">
                      ${health === 'LIVE' ? '● LIVE' : health === 'READY' ? '○ READY' : health}
                    </span>
                  </td>
                  <td style="padding: 14px 14px; text-align: right; white-space: nowrap;" onclick="event.stopPropagation();">
                    <button class="btn-premium" onclick="window.WedEazzyCRM.openCountryDetailDrawer('${c.id}')" style="padding: 5px 10px; font-size: 0.74rem; margin-right: 4px;" title="View Operational Details">
                      <i class="fa-solid fa-folder-open"></i> Manage
                    </button>
                    <button class="btn-premium" onclick="window.WedEazzyCRM.openEditCountryModal('${c.id}', '${escJsAttr(c.name)}', '${escJsAttr(c.code)}', '${escJsAttr(c.currency)}', '${escJsAttr(c.currencySymbol)}', '${escJsAttr(c.phoneCode)}', '${escJsAttr(c.flag)}', '${c.status}')" style="padding: 5px 10px; font-size: 0.74rem; margin-right: 4px;" title="Edit Country Settings">
                      <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function openAddCountryModal() {
    const modalHtml = `
      <div style="padding: 20px;">
        <h3 style="font-family: var(--font-head); font-size: 1.25rem; font-weight: 700; margin-bottom: 6px;">Add New Marketplace Country</h3>
        <p style="font-size: 0.82rem; color: var(--text-sub); margin-bottom: 20px;">Configure a new country for business listings, cities, categories and lead generation.</p>

        <form id="addCountryForm" onsubmit="event.preventDefault(); window.WedEazzyCRM.submitCountryForm(this, null);">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Country Name *</label>
              <input type="text" name="name" placeholder="e.g. Singapore" required class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">ISO Country Code (Alpha-2) *</label>
              <input type="text" name="code" placeholder="e.g. SG" maxlength="2" required class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); text-transform: uppercase;" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Currency Code</label>
              <input type="text" name="currency" placeholder="e.g. SGD" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); text-transform: uppercase;" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Currency Symbol</label>
              <input type="text" name="currencySymbol" placeholder="e.g. S$" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Phone Country Code</label>
              <input type="text" name="phoneCode" placeholder="e.g. +65" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Country Flag Emoji</label>
              <input type="text" name="flag" placeholder="e.g. 🇸🇬" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
          </div>

          <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" class="btn-premium" onclick="ctx.closeModal()">Cancel</button>
            <button type="submit" class="btn-premium btn-premium-rose" style="font-weight: 700;">Save Country</button>
          </div>
        </form>
      </div>
    `;
    ctx.openModal(modalHtml);
  }

  function openEditCountryModal(id, name, code, currency, currencySymbol, phoneCode, flag, status) {
    const modalHtml = `
      <div style="padding: 20px;">
        <h3 style="font-family: var(--font-head); font-size: 1.25rem; font-weight: 700; margin-bottom: 6px;">Edit Country: ${esc(name)}</h3>

        <form id="editCountryForm" onsubmit="event.preventDefault(); window.WedEazzyCRM.submitCountryForm(this, '${id}');">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Country Name</label>
              <input type="text" name="name" value="${esc(name)}" required class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">ISO Code</label>
              <input type="text" name="code" value="${esc(code)}" required class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); text-transform: uppercase;" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Currency</label>
              <input type="text" name="currency" value="${esc(currency)}" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Currency Symbol</label>
              <input type="text" name="currencySymbol" value="${esc(currencySymbol)}" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Phone Code</label>
              <input type="text" name="phoneCode" value="${esc(phoneCode)}" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Flag</label>
              <input type="text" name="flag" value="${esc(flag)}" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
          </div>

          <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" class="btn-premium" onclick="ctx.closeModal()">Cancel</button>
            <button type="submit" class="btn-premium btn-premium-rose" style="font-weight: 700;">Update Country</button>
          </div>
        </form>
      </div>
    `;
    ctx.openModal(modalHtml);
  }

  async function openCountryDetailDrawer(countryId) {
    try {
      ctx.showToast('Fetching country operations data...', 'info');
      const data = await apiFetch(`/api/admin/countries/${countryId}`);
      const country = data.country || {};
      const kpis = data.kpis || {};
      const cities = data.cities || [];

      const modalHtml = `
        <div style="padding: 24px; max-width: 1000px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid var(--border-subtle); padding-bottom: 16px; margin-bottom: 20px;">
            <div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 2rem;">${esc(country.flag || '🌐')}</span>
                <div>
                  <h2 style="font-family: var(--font-head); font-size: 1.5rem; font-weight: 800; margin: 0; color: var(--text-main);">${esc(country.name)} (${esc(country.code)})</h2>
                  <div style="font-size: 0.78rem; color: var(--text-sub); margin-top: 2px;">Marketplace Operations & Strategic Readiness Console</div>
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="status-badge" style="padding: 6px 14px; border-radius: 99px; font-size: 0.8rem; font-weight: 800; ${country.healthState === 'LIVE' ? 'background: rgba(16,185,129,0.15); color: #10b981;' : 'background: rgba(59,130,246,0.15); color: #3b82f6;'}">
                ${country.healthState === 'LIVE' ? '● LIVE MARKETPLACE' : '○ READY FOR ONBOARDING'}
              </span>
              <button class="btn-premium" onclick="ctx.closeModal()"><i class="fa-solid fa-xmark"></i></button>
            </div>
          </div>

          <!-- TAB HEADERS -->
          <div style="display: flex; gap: 8px; border-bottom: 1px solid var(--border-color); overflow-x: auto; margin-bottom: 20px; padding-bottom: 4px;">
            <button class="country-drawer-tab active" onclick="window.WedEazzyCRM.switchDrawerTab('overview')" id="tabBtn_overview" style="padding: 8px 14px; border-radius: 8px; border: none; background: #E52B3A; color: #fff; font-weight: 700; font-size: 0.8rem; cursor: pointer;">Overview</button>
            <button class="country-drawer-tab" onclick="window.WedEazzyCRM.switchDrawerTab('locations')" id="tabBtn_locations" style="padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-sub); font-size: 0.8rem; cursor: pointer;">Locations (${cities.length})</button>
            <button class="country-drawer-tab" onclick="window.WedEazzyCRM.switchDrawerTab('listings')" id="tabBtn_listings" style="padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-sub); font-size: 0.8rem; cursor: pointer;">Listings (${kpis.totalListings || 0})</button>
            <button class="country-drawer-tab" onclick="window.WedEazzyCRM.switchDrawerTab('vendors')" id="tabBtn_vendors" style="padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-sub); font-size: 0.8rem; cursor: pointer;">Vendors (${kpis.claimedListings || 0})</button>
            <button class="country-drawer-tab" onclick="window.WedEazzyCRM.switchDrawerTab('categories')" id="tabBtn_categories" style="padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-sub); font-size: 0.8rem; cursor: pointer;">Categories</button>
            <button class="country-drawer-tab" onclick="window.WedEazzyCRM.switchDrawerTab('enquiries')" id="tabBtn_enquiries" style="padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-sub); font-size: 0.8rem; cursor: pointer;">Enquiries (${kpis.totalEnquiries || 0})</button>
            <button class="country-drawer-tab" onclick="window.WedEazzyCRM.switchDrawerTab('bookings')" id="tabBtn_bookings" style="padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-sub); font-size: 0.8rem; cursor: pointer;">Bookings (${kpis.totalBookings || 0})</button>
            <button class="country-drawer-tab" onclick="window.WedEazzyCRM.switchDrawerTab('subscriptions')" id="tabBtn_subscriptions" style="padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-sub); font-size: 0.8rem; cursor: pointer;">Subscriptions</button>
            <button class="country-drawer-tab" onclick="window.WedEazzyCRM.switchDrawerTab('revenue')" id="tabBtn_revenue" style="padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-sub); font-size: 0.8rem; cursor: pointer;">Revenue</button>
            <button class="country-drawer-tab" onclick="window.WedEazzyCRM.switchDrawerTab('reports')" id="tabBtn_reports" style="padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-sub); font-size: 0.8rem; cursor: pointer;">Reports</button>
            <button class="country-drawer-tab" onclick="window.WedEazzyCRM.switchDrawerTab('settings')" id="tabBtn_settings" style="padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-sub); font-size: 0.8rem; cursor: pointer;">Settings</button>
          </div>

          <!-- TAB PANELS CONTAINER -->
          <div id="countryDrawerTabBody">
            <!-- Overview Tab -->
            <div id="drawerTab_overview">
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 20px;">
                <div class="panel-card" style="padding: 14px; background: #FFFFFF; border-left: 3px solid #E52B3A;">
                  <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #667085;">Total Listings</div>
                  <div style="font-size: 1.3rem; font-weight: 800; color: #182033; margin-top: 4px;">${(kpis.totalListings || 0).toLocaleString('en-IN')}</div>
                </div>
                <div class="panel-card" style="padding: 14px; background: #FFFFFF; border-left: 3px solid #10B981;">
                  <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #667085;">Claimed Listings</div>
                  <div style="font-size: 1.3rem; font-weight: 800; color: #182033; margin-top: 4px;">${(kpis.claimedListings || 0).toLocaleString('en-IN')}</div>
                </div>
                <div class="panel-card" style="padding: 14px; background: #FFFFFF; border-left: 3px solid #3B82F6;">
                  <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #667085;">Paid Vendors</div>
                  <div style="font-size: 1.3rem; font-weight: 800; color: #182033; margin-top: 4px;">${(kpis.paidVendors || 0).toLocaleString('en-IN')}</div>
                </div>
                <div class="panel-card" style="padding: 14px; background: #FFFFFF; border-left: 3px solid #F59E0B;">
                  <div style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; color: #667085;">Active Cities</div>
                  <div style="font-size: 1.3rem; font-weight: 800; color: #182033; margin-top: 4px;">${(kpis.totalCities || cities.length).toLocaleString('en-IN')}</div>
                </div>
              </div>

              ${(kpis.totalListings || 0) === 0 ? `
                <div style="padding: 24px; background: #0f172a; border-radius: 12px; color: #ffffff; margin-top: 16px;">
                  <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
                    <div>
                      <h4 style="font-size: 1.1rem; font-weight: 800; color: #E52B3A; margin: 0 0 6px 0;">${esc(country.flag)} ${esc(country.name)} Marketplace Readiness</h4>
                      <p style="font-size: 0.85rem; color: #94a3b8; margin: 0;">No listings have been imported yet into ${esc(country.name)}. ${cities.length} cities configured, 0 listings, 0 vendors, 0 enquiries.</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                      <button class="btn-premium btn-premium-rose" onclick="window.location.hash = '#import'; ctx.closeModal();">
                        <i class="fa-solid fa-file-import"></i> Import Listings
                      </button>
                      <button class="btn-premium" style="background: #1e293b; color: #ffffff; border-color: rgba(255,255,255,0.2);" onclick="window.location.hash = '#cities'; ctx.closeModal();">
                        <i class="fa-solid fa-city"></i> Manage Cities
                      </button>
                    </div>
                  </div>
                </div>
              ` : `
                <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-bottom: 12px;">Active Marketplace Cities in ${esc(country.name)}</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                  ${cities.map(ct => `
                    <div style="background: var(--surface-subtle); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px;">
                      <strong>${esc(ct.name)}</strong>
                      <div style="font-size: 0.72rem; color: var(--text-sub);">${ct.vendorsCount} listings</div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- Locations Tab -->
            <div id="drawerTab_locations" style="display: none;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <h4 style="margin: 0; font-size: 0.95rem;">Configured Cities in ${esc(country.name)}</h4>
                <button class="btn-premium btn-premium-rose" onclick="window.WedEazzyCRM.openAddCityModal('${country.id}')" style="font-size: 0.78rem;">
                  <i class="fa-solid fa-plus"></i> Add City to ${esc(country.name)}
                </button>
              </div>
              <div style="overflow-x: auto;">
                <table class="crm-table" style="width: 100%; font-size: 0.82rem;">
                  <thead>
                    <tr>
                      <th>City Name</th>
                      <th>Slug</th>
                      <th>State / Province</th>
                      <th>Listings Count</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${cities.map(ct => `
                      <tr>
                        <td><strong>${esc(ct.name)}</strong></td>
                        <td><code>${esc(ct.slug)}</code></td>
                        <td>${esc(ct.state || '—')}</td>
                        <td>${ct.vendorsCount || 0}</td>
                        <td><span class="status-badge badge-success">${ct.status}</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Settings Tab -->
            <div id="drawerTab_settings" style="display: none;">
              <form id="drawerCountrySettingsForm" onsubmit="event.preventDefault(); window.WedEazzyCRM.submitCountryForm(this, '${country.id}');">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                  <div>
                    <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Country Name</label>
                    <input type="text" name="name" value="${esc(country.name)}" required class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
                  </div>
                  <div>
                    <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">ISO Code</label>
                    <input type="text" name="code" value="${esc(country.code)}" required class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); text-transform: uppercase;" />
                  </div>
                  <div>
                    <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Currency</label>
                    <input type="text" name="currency" value="${esc(country.currency)}" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
                  </div>
                  <div>
                    <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Currency Symbol</label>
                    <input type="text" name="currencySymbol" value="${esc(country.currencySymbol)}" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
                  </div>
                  <div>
                    <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Phone Country Code</label>
                    <input type="text" name="phoneCode" value="${esc(country.phoneCode)}" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
                  </div>
                  <div>
                    <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Flag Emoji</label>
                    <input type="text" name="flag" value="${esc(country.flag)}" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
                  </div>
                </div>

                <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
                  <button type="submit" class="btn-premium btn-premium-rose" style="font-weight: 700;">Save Country Settings</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;

      ctx.openModal(modalHtml);
    } catch (err) {
      ctx.showToast('Error loading country details: ' + err.message, 'danger');
    }
  }

  function switchDrawerTab(tabId) {
    document.querySelectorAll('.country-drawer-tab').forEach(b => {
      b.style.background = 'transparent';
      b.style.color = 'var(--text-sub)';
      b.style.border = '1px solid var(--border-color)';
    });
    const activeBtn = document.getElementById('tabBtn_' + tabId);
    if (activeBtn) {
      activeBtn.style.background = '#E52B3A';
      activeBtn.style.color = '#ffffff';
      activeBtn.style.border = 'none';
    }

    const tabBody = document.getElementById('countryDrawerTabBody');
    if (tabBody) {
      Array.from(tabBody.children).forEach(c => c.style.display = 'none');
      const target = document.getElementById('drawerTab_' + tabId);
      if (target) {
        target.style.display = 'block';
      } else {
        // Fallback default message for dynamic tabs
        let fallback = document.getElementById('drawerTab_fallback');
        if (!fallback) {
          fallback = document.createElement('div');
          fallback.id = 'drawerTab_fallback';
          tabBody.appendChild(fallback);
        }
        fallback.style.display = 'block';
        fallback.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted); font-size: 0.9rem;"><i class="fa-solid fa-chart-line" style="font-size: 2rem; margin-bottom: 12px; display: block; color: var(--brand-rose);"></i> Showing country-scoped ${tabId} analytics registry.</div>`;
      }
    }
  }

  async function exportCountryData() {
    try {
      const data = await apiFetch('/api/admin/countries');
      const countries = data.countries || [];
      const headers = ['Country Name', 'Code', 'Currency', 'Cities', 'Listings', 'Claimed', 'Paid Vendors', 'Inquiries', 'Bookings', 'Status'];
      const rows = countries.map(c => [
        `"${c.name}"`,
        `"${c.code}"`,
        `"${c.currencySymbol} ${c.currency}"`,
        c.citiesCount || 0,
        c.vendorsCount || 0,
        c.claimedVendorsCount || 0,
        c.paidVendorsCount || 0,
        c.inquiriesCount || 0,
        c.bookingsCount || 0,
        `"${c.status}"`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `wedeazzy_country_operations_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      ctx.showToast('Country operations data exported to CSV successfully!', 'success');
    } catch (err) {
      ctx.showToast('Export failed: ' + err.message, 'danger');
    }
  }

  async function submitCountryForm(form, id) {
    const formData = new FormData(form);
    const body = Object.fromEntries(formData.entries());

    try {
      if (id) {
        await apiFetch(`/api/admin/countries/${id}`, { method: 'PATCH', body });
        ctx.showToast('Country updated successfully!', 'success');
      } else {
        await apiFetch('/api/admin/countries', { method: 'POST', body });
        ctx.showToast('New country added successfully!', 'success');
      }
      ctx.closeModal();
      renderCountries(window.WedEazzyStore.get());
    } catch (err) {
      ctx.showToast(err.message || 'Failed to save country', 'danger');
    }
  }

  async function toggleCountryStatus(id, newStatus) {
    try {
      await apiFetch(`/api/admin/countries/${id}`, { method: 'PATCH', body: { status: newStatus } });
      ctx.showToast(`Country status set to ${newStatus}`, 'info');
      renderCountries(window.WedEazzyStore.get());
    } catch (err) {
      ctx.showToast('Error updating country status: ' + err.message, 'danger');
    }
  }

  async function renderLocations(store) {
    destroyAllCharts();
    const body = ctx.portalBody || document.getElementById('portalBody');
    if (!body) return;

    body.innerHTML = `
      <div style="padding: 24px; max-width: 1400px; margin: 0 auto;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.6rem;">🏙️</span>
              <h2 style="font-family: var(--font-head); font-size: 1.45rem; font-weight: 700; color: var(--text-main); margin: 0;">City & Region Operations</h2>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-sub); margin: 4px 0 0;">Hierarchical location manager: Country → City → Region</p>
          </div>
          <button class="btn-premium btn-premium-rose" onclick="window.WedEazzyCRM.openAddCityModal()" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; font-weight: 600; border-radius: 12px;">
            <i class="fa-solid fa-plus"></i> Add New City
          </button>
        </div>

        <div id="citiesTableContainer" style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 16px; padding: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
          <div style="text-align: center; padding: 50px; color: var(--text-muted);">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 1.6rem; color: var(--brand-rose); margin-bottom: 12px;"></i>
            <div>Loading cities network data...</div>
          </div>
        </div>
      </div>
    `;

    try {
      const data = await apiFetch(`/api/admin/locations/cities?countryCode=${window.WedEazzyCountryScope || 'all'}`);
      renderCitiesTable(data.cities || []);
    } catch (err) {
      document.getElementById('citiesTableContainer').innerHTML = `
        <div style="color: var(--brand-rose); padding: 24px; text-align: center; font-weight: 600;">
          Failed to load cities: ${esc(err.message)}
        </div>
      `;
    }
  }

  function renderCitiesTable(cities) {
    const container = document.getElementById('citiesTableContainer');
    if (!container) return;

    container.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-main);">Configured Marketplace Cities (${cities.length})</div>
      </div>

      <div style="overflow-x: auto;">
        <table class="crm-table" style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.84rem;">
          <thead>
            <tr style="background: var(--surface-subtle); color: var(--text-sub); font-size: 0.78rem; text-transform: uppercase;">
              <th style="padding: 12px 16px; text-align: left;">City</th>
              <th style="padding: 12px 16px; text-align: left;">Country</th>
              <th style="padding: 12px 16px; text-align: left;">State / Region</th>
              <th style="padding: 12px 16px; text-align: center;">Vendors</th>
              <th style="padding: 12px 16px; text-align: center;">Inquiries</th>
              <th style="padding: 12px 16px; text-align: center;">Bookings</th>
              <th style="padding: 12px 16px; text-align: center;">Status</th>
              <th style="padding: 12px 16px; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${cities.map(c => `
              <tr style="border-bottom: 1px solid var(--border-subtle);">
                <td style="padding: 14px 16px; font-weight: 700; color: var(--text-main);">
                  ${esc(c.name)}
                </td>
                <td style="padding: 14px 16px;">
                  <span>${esc(c.country ? c.country.flag : '🇮🇳')} ${esc(c.country ? c.country.name : 'India')}</span>
                </td>
                <td style="padding: 14px 16px; color: var(--text-sub);">
                  ${esc(c.state || '—')}
                </td>
                <td style="padding: 14px 16px; text-align: center; font-weight: 700; color: var(--brand-rose);">
                  ${fmtNum(c.vendorsCount)}
                </td>
                <td style="padding: 14px 16px; text-align: center;">
                  ${fmtNum(c.inquiriesCount)}
                </td>
                <td style="padding: 14px 16px; text-align: center;">
                  ${fmtNum(c.bookingsCount)}
                </td>
                <td style="padding: 14px 16px; text-align: center;">
                  <span class="status-badge ${c.status === 'active' ? 'badge-success' : 'badge-muted'}" style="padding: 4px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: 700;">
                    ${c.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style="padding: 14px 16px; text-align: right;">
                  <button class="btn-premium" onclick="window.WedEazzyCRM.openEditCityModal('${c.id}', '${escJsAttr(c.name)}', '${escJsAttr(c.state || '')}', '${c.countryId}', '${c.status}')" style="padding: 5px 12px; font-size: 0.78rem;">
                    <i class="fa-solid fa-pen-to-square"></i> Edit
                  </button>
                  <button class="btn-premium" onclick="window.WedEazzyCRM.toggleCityStatus('${c.id}', '${c.status === 'active' ? 'inactive' : 'active'}')" style="padding: 5px 12px; font-size: 0.78rem; margin-left: 4px; color: ${c.status === 'active' ? '#d32f2f' : '#2e7d32'};">
                    ${c.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function openAddCityModal() {
    let countries = [];
    try {
      const data = await apiFetch('/api/admin/countries');
      countries = data.countries || [];
    } catch (_) {}

    const modalHtml = `
      <div style="padding: 20px;">
        <h3 style="font-family: var(--font-head); font-size: 1.25rem; font-weight: 700; margin-bottom: 6px;">Add New City</h3>
        <p style="font-size: 0.82rem; color: var(--text-sub); margin-bottom: 20px;">Add a new city dynamically under an existing country.</p>

        <form id="addCityForm" onsubmit="event.preventDefault(); window.WedEazzyCRM.submitCityForm(this, null);">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div style="grid-column: span 2;">
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">Country *</label>
              <select name="countryId" required class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);">
                ${countries.map(c => `<option value="${c.id}">${c.flag} ${c.name} (${c.code})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">City Name *</label>
              <input type="text" name="name" placeholder="e.g. Pune" required class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">State / Province</label>
              <input type="text" name="state" placeholder="e.g. Maharashtra" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
          </div>

          <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" class="btn-premium" onclick="ctx.closeModal()">Cancel</button>
            <button type="submit" class="btn-premium btn-premium-rose" style="font-weight: 700;">Save City</button>
          </div>
        </form>
      </div>
    `;
    ctx.openModal(modalHtml);
  }

  function openEditCityModal(id, name, state, countryId, status) {
    const modalHtml = `
      <div style="padding: 20px;">
        <h3 style="font-family: var(--font-head); font-size: 1.25rem; font-weight: 700; margin-bottom: 6px;">Edit City: ${esc(name)}</h3>

        <form id="editCityForm" onsubmit="event.preventDefault(); window.WedEazzyCRM.submitCityForm(this, '${id}');">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">City Name</label>
              <input type="text" name="name" value="${esc(name)}" required class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-sub); display: block; margin-bottom: 4px;">State / Province</label>
              <input type="text" name="state" value="${esc(state)}" class="wz-input-styled" style="width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color);" />
            </div>
          </div>

          <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" class="btn-premium" onclick="ctx.closeModal()">Cancel</button>
            <button type="submit" class="btn-premium btn-premium-rose" style="font-weight: 700;">Update City</button>
          </div>
        </form>
      </div>
    `;
    ctx.openModal(modalHtml);
  }

  async function submitCityForm(form, id) {
    const formData = new FormData(form);
    const body = Object.fromEntries(formData.entries());

    try {
      if (id) {
        await apiFetch(`/api/admin/locations/cities/${id}`, { method: 'PATCH', body });
        ctx.showToast('City updated successfully!', 'success');
      } else {
        await apiFetch('/api/admin/locations/cities', { method: 'POST', body });
        ctx.showToast('New city added successfully!', 'success');
      }
      ctx.closeModal();
      renderLocations(window.WedEazzyStore.get());
    } catch (err) {
      ctx.showToast(err.message || 'Failed to save city', 'danger');
    }
  }

  async function toggleCityStatus(id, newStatus) {
    try {
      await apiFetch(`/api/admin/locations/cities/${id}`, { method: 'PATCH', body: { status: newStatus } });
      ctx.showToast(`City status set to ${newStatus}`, 'info');
      renderLocations(window.WedEazzyStore.get());
    } catch (err) {
      ctx.showToast('Error updating city status: ' + err.message, 'danger');
    }
  }

  function openAddRegionModal() {
    ctx.showToast('Use City Manager to manage regions.', 'info');
  }

  function openEditRegionModal() {}
  function submitRegionForm() {}

  function scrollTop() {
    const body = ctx.portalBody || document.getElementById('portalBody');
    if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.WedEazzyCRM = CRM;
})();