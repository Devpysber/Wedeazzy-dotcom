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

  /* ============================================================
     View state — persists across re-renders within a session
     ============================================================ */
  const view = {
    vendors:     { page: 1, search: '', category: '', city: '', country: '', approval: '', plan: '', dateFrom: '', selected: new Set() },
    invitations: { page: 1, search: '', channel: '', selected: new Set() },
    claimed:     { page: 1, search: '', status: '' },
    importer:    { step: 1, file: null, importId: null, preview: null, busy: false },
  };

  const PAGE_SIZE = 25;

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

  function pager(current, total, fnName) {
    if (total <= 1) return '';
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
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;padding:16px 0 4px;">
        ${btn(current - 1, '<i class="fa-solid fa-chevron-left"></i>', current === 1, false)}
        ${nums.join('')}
        ${btn(current + 1, '<i class="fa-solid fa-chevron-right"></i>', current === total, false)}
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
    const vendors = store.vendors || [];

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

    ctx.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i>
          <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>Dashboard</span>
        </div>

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
    const term = s.search.trim().toLowerCase();
    let list = store.vendors || [];

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
    if (s.country) list = list.filter(v => (v.country || 'India') === s.country);
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
    const { items, total, current, count } = paginate(list, s.page, PAGE_SIZE);
    s.page = current;

    const categories = uniqueSorted(all.map(v => v.category));
    // Only show cities relevant to selected country
    const relevantVendors = s.country ? all.filter(v => (v.country || 'India') === s.country) : all;
    const cities = uniqueSorted(relevantVendors.map(vendorCity));
    const countries = uniqueSorted(all.map(v => v.country || 'India'));
    const anyFilter = s.search || s.category || s.city || s.country || s.approval || s.plan || s.dateFrom;

    // Country stats
    const countryStats = {};
    all.forEach(v => {
      const c = v.country || 'India';
      countryStats[c] = (countryStats[c] || 0) + 1;
    });

    const FLAG = { 'India': '🇮🇳', 'USA': '🇺🇸', 'UK': '🇬🇧', 'Australia': '🇦🇺', 'UAE': '🇦🇪', 'Canada': '🇨🇦' };

    ctx.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i>
          <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>All Businesses</span>
        </div>

        <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
          <div>
            <h2 style="font-size:1.3rem;margin-bottom:4px;">
              Partner Service Vendors Registry
              <span class="wz-chip wz-chip-brand" style="vertical-align:middle;margin-left:6px;">${fmtNum(store.vendorsTotalCount ?? all.length)} total</span>
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
          <button class="wz-ctab ${!s.country ? 'active' : ''}" onclick="window.WedEazzyCRM.setCountryFilter('')">
            🌏 All Countries
            <span class="wz-ctab-count">${fmtNum(all.length)}</span>
          </button>
          ${Object.entries(countryStats).sort((a,b) => b[1]-a[1]).map(([country, cnt]) => `
            <button class="wz-ctab ${s.country === country ? 'active' : ''}"
                    onclick="window.WedEazzyCRM.setCountryFilter('${esc(country)}')">
              ${FLAG[country] || '🌐'} ${esc(country)}
              <span class="wz-ctab-count">${fmtNum(cnt)}</span>
            </button>`).join('')}
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

          <span class="wz-select">
            <i class="fa-solid fa-crown"></i>
            <select id="vFilterPlan" class="${s.plan ? 'is-set' : ''}">
              <option value="">Subscription</option>
              <option value="paid" ${s.plan === 'paid' ? 'selected' : ''}>Paid plans</option>
              <option value="free" ${s.plan === 'free' ? 'selected' : ''}>Free</option>
            </select>
          </span>

          <input type="date" id="vFilterDate" class="wz-date-input" value="${esc(s.dateFrom)}" title="Added on or after" />

          ${anyFilter ? `<button class="wz-reset-btn" onclick="window.WedEazzyCRM.resetVendorFilters()">
            <i class="fa-solid fa-rotate-left"></i> Reset Filters
          </button>` : ''}

          <span class="wz-result-count">${fmtNum(count)} result${count === 1 ? '' : 's'}</span>
        </div>

        <div class="panel-card" style="padding:0;overflow:hidden;">
          <div class="table-viewport">
            <table class="grid-table wz-cardable">
              <thead>
                <tr>
                  <th style="width:34px;"><input type="checkbox" class="wz-check" id="vSelectAll" title="Select all on this page" /></th>
                  <th>Business</th>
                  <th>Owner</th>
                  <th>Category</th>
                  <th>City</th>
                  <th>Country</th>
                  <th>Contact</th>
                  <th>Added</th>
                  <th>Verification</th>
                  <th>Plan</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${items.length === 0 ? `
                  <tr><td colspan="10" data-primary>
                    ${anyFilter
                      ? emptyState('fa-solid fa-filter-circle-xmark', 'No businesses match these filters',
                                   'Try widening the search, or reset the filters to see the full registry.')
                      : emptyState('fa-solid fa-store', 'No businesses yet',
                                   'Add a vendor manually, or bulk-import your listings from a CSV file.')}
                  </td></tr>
                ` : items.map(v => {
                  const verified = v.claims === 'Verified Owner';
                  const blacklisted = v.status === 'cancelled';
                  const paid = v.subscriptionPlan && v.subscriptionPlan !== 'Free';
                  const city = vendorCity(v);
                  return `
                  <tr data-vendor-id="${esc(v.id)}">
                    <td data-label="Select">
                      <input type="checkbox" class="wz-check wz-row-check" value="${esc(v.id)}"
                             ${s.selected.has(v.id) ? 'checked' : ''} />
                    </td>
                    <td data-primary>
                      <div class="wz-biz">
                        <div class="wz-biz-avatar">${esc(initials(v.name))}</div>
                        <div class="wz-biz-text">
                          <div class="wz-biz-name" title="${esc(v.name)}">${esc(v.name)}</div>
                          <div class="wz-biz-meta">
                            <span><i class="fa-solid fa-star" style="color:var(--brand-gold);"></i> ${v.rating ?? '—'}</span>
                            <span>·</span>
                            <span>#${esc(String(v.id).slice(-8))}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Owner">
                      ${v.vendorName && v.vendorName !== '—'
                        ? `<span style="font-size:0.8rem;font-weight:600;">${esc(v.vendorName)}</span>`
                        : `<span class="wz-chip wz-chip-grey">Unclaimed</span>`}
                    </td>
                    <td data-label="Category"><span class="wz-chip wz-chip-brand">${esc(v.category)}</span></td>
                    <td data-label="City"><span style="font-size:0.8rem;">${esc(city) || '—'}</span></td>
                    <td data-label="Country">
                      <span style="font-size:0.8rem;">${FLAG[v.country || 'India'] || '🌐'} ${esc(v.country || 'India')}</span>
                    </td>
                    <td data-label="Contact">
                      <div class="wz-contact">
                        <div><i class="fa-solid fa-phone" style="opacity:0.55;"></i> ${esc(v.contact)}</div>
                        ${v.email && v.email !== '—'
                          ? `<div class="muted"><i class="fa-regular fa-envelope"></i> ${esc(v.email)}</div>` : ''}
                      </div>
                    </td>
                    <td data-label="Added"><span style="font-size:0.78rem;">${fmtDate(v.createdAt)}</span></td>
                    <td data-label="Verification">
                      ${blacklisted
                        ? `<span class="wz-chip wz-chip-red"><i class="fa-solid fa-ban"></i> Blacklisted</span>`
                        : verified
                          ? `<span class="wz-chip wz-chip-green"><i class="fa-solid fa-check-double"></i> Verified</span>`
                          : `<span class="wz-chip wz-chip-amber"><i class="fa-solid fa-clock"></i> Pending</span>`}
                    </td>
                    <td data-label="Plan">
                      ${paid
                        ? `<span class="wz-chip wz-chip-gold"><i class="fa-solid fa-crown"></i> ${esc(v.subscriptionPlan)}</span>`
                        : `<span class="wz-chip wz-chip-grey">Free</span>`}
                    </td>
                    <td data-label="Actions" style="text-align:right;">
                      <div class="wz-actions">
                        ${!verified ? `
                          <button class="wz-icon-btn green" title="Grant ownership claim"
                                  onclick="window.handleClaimListing('vendor','${esc(v.id)}')">
                            <i class="fa-solid fa-signature"></i>
                          </button>` : ''}
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
                        <button class="wz-icon-btn ${v.kycDocumentUrl ? 'green' : ''}"
                                title="${v.kycDocumentUrl ? 'View / replace proof document' : 'Upload proof document'}"
                                onclick="window.triggerVendorDocumentModal('${esc(v.id)}', ${v.kycDocumentUrl ? `'${ctx.escJsAttr(v.kycDocumentUrl)}'` : 'null'})">
                          <i class="fa-solid ${v.kycDocumentUrl ? 'fa-file-circle-check' : 'fa-file-arrow-up'}"></i>
                        </button>
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
          ${pager(current, total, 'goVendorsPage')}
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
    bind('vFilterPlan', 'plan');
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

    // The core fix: this page previously listed every unclaimed listing,
    // invited or not. It now lists exactly what was actually sent.
    let invitedList = allVendors.filter(v => v.invitedAt);

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

    const { items, total, current, count } = paginate(list, s.page, PAGE_SIZE);
    s.page = current;

    const totalInvited = invitedList.length;
    const converted = invitedList.filter(v => v.hasOwner).length;
    const viaWa = invitedList.filter(v => (v.invitedChannel || '').includes('whatsapp')).length;
    const viaEmail = invitedList.filter(v => (v.invitedChannel || '').includes('email')).length;
    const awaiting = totalInvited - converted;
    const convRate = totalInvited > 0 ? (converted / totalInvited) * 100 : 0;
    const pendingInvite = allVendors.filter(v => !v.hasOwner && !v.invitedAt).length;

    ctx.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i>
          <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>Invitations</span>
        </div>

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
          ${pager(current, total, 'goInvitationsPage')}
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

    // "Claimed" now means a real signup is attached (hasOwner), not the old
    // `claims` field which labelled every unverified seeded listing as
    // "Claim Requested" even when nobody had ever touched it.
    const claimedAll = allVendors.filter(v => v.hasOwner);

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

    const { items, total, current, count } = paginate(list, s.page, PAGE_SIZE);
    s.page = current;

    const withDocs = claimedAll.filter(v => v.kycDocumentUrl).length;
    const verifyRate = claimedAll.length > 0 ? (verified.length / claimedAll.length) * 100 : 0;

    ctx.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i>
          <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>Claimed Businesses</span>
        </div>

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
          ${pager(current, total, 'goClaimedPage')}
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
     VIEW 5 — CSV IMPORT WIZARD
     PDF item 5 + duplicate filtering
     ============================================================ */
  function renderImportListings() {
    const s = view.importer;

    const stepClass = (n) => s.step === n ? 'active' : (s.step > n ? 'done' : '');

    ctx.portalBody.innerHTML = `
      <div class="spa-tab-wrapper">
        <div class="locator-breadcrumb">
          <a href="#">Wedeazzy</a> <i class="fa-solid fa-angle-right"></i>
          <span>Approve Businesses</span> <i class="fa-solid fa-angle-right"></i> <span>Import Listings</span>
        </div>

        <div style="margin-bottom:18px;">
          <h2 style="font-size:1.3rem;margin-bottom:4px;">Import Businesses from CSV</h2>
          <p style="font-size:0.82rem;color:var(--text-muted);">
            Upload a spreadsheet of listings. Nothing is saved until you review the duplicate report and confirm.
          </p>
        </div>

        <div class="wz-steps">
          <span class="wz-step ${stepClass(1)}"><span class="wz-step-num">1</span><span>Upload</span></span>
          <span class="wz-step-line"></span>
          <span class="wz-step ${stepClass(2)}"><span class="wz-step-num">2</span><span>Review duplicates</span></span>
          <span class="wz-step-line"></span>
          <span class="wz-step ${stepClass(3)}"><span class="wz-step-num">3</span><span>Done</span></span>
        </div>

        <div id="importStage"></div>
      </div>`;

    renderImportStage();
  }

  function renderImportStage() {
    const stage = document.getElementById('importStage');
    if (!stage) return;
    const s = view.importer;

    if (s.step === 1) {
      stage.innerHTML = `
        <div class="panel-card">
          <div class="wz-dropzone" id="csvDropzone" tabindex="0" role="button"
               aria-label="Choose or drop a CSV file">
            <div class="wz-dropzone-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
            <h4>Drop your CSV here, or click to browse</h4>
            <p>Columns are auto-detected — <code>name</code>, <code>category</code> and <code>city</code> are required.</p>
            ${s.file ? `<div class="wz-dropzone-file"><i class="fa-solid fa-file-csv"></i> ${esc(s.file.name)} · ${(s.file.size / 1024).toFixed(0)} KB</div>` : ''}
          </div>
          <input type="file" id="csvFileInput" accept=".csv,text/csv" style="display:none;" />

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px;">
            <a href="#" onclick="window.WedEazzyCRM.downloadTemplate();return false;"
               style="font-size:0.78rem;font-weight:700;color:var(--brand-rose);text-decoration:none;">
              <i class="fa-solid fa-download"></i> Download a template CSV
            </a>
          </div>

          <h4 style="font-size:0.9rem;margin-top:22px;">Data source settings</h4>
          <div class="wz-rules" style="margin-top:10px;">
            <div class="wz-rule" style="flex-direction:column;align-items:flex-start;gap:12px;">
              <div>
                <span class="wz-rule-title">Country</span>
                <span class="wz-rule-desc">Select which country this data is from. This ensures correct phone number formatting and proper categorisation.</span>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <label class="wz-country-pick wz-country-pick-checked" data-country-pick="IN">
                  <input type="radio" name="importCountry" value="IN" checked />
                  🇮🇳 India
                </label>
                <label class="wz-country-pick" data-country-pick="US">
                  <input type="radio" name="importCountry" value="US" />
                  🇺🇸 USA
                </label>
                <label class="wz-country-pick" data-country-pick="GB">
                  <input type="radio" name="importCountry" value="GB" />
                  🇬🇧 UK
                </label>
                <label class="wz-country-pick" data-country-pick="AU">
                  <input type="radio" name="importCountry" value="AU" />
                  🇦🇺 Australia
                </label>
                <label class="wz-country-pick" data-country-pick="AE">
                  <input type="radio" name="importCountry" value="AE" />
                  🇦🇪 UAE
                </label>
                <label class="wz-country-pick" data-country-pick="CA">
                  <input type="radio" name="importCountry" value="CA" />
                  🇨🇦 Canada
                </label>
              </div>
            </div>
            <label class="wz-rule">
              <input type="text" id="importCityHint" class="premium-input" style="flex:1;font-size:0.8rem;padding:8px 12px;" placeholder="City hint (optional, e.g. New York)" />
              <span>
                <span class="wz-rule-title">City hint</span>
                <span class="wz-rule-desc">If all rows in this file belong to one city, type it here. Overrides the city column in the CSV.</span>
              </span>
            </label>
          </div>

          <h4 style="font-size:0.9rem;margin-top:22px;">Duplicate filtering</h4>
          <p style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">
            Choose what counts as the same business. Rows flagged as duplicates are excluded by default —
            you decide row by row in the next step.
          </p>
          <div class="wz-rules">
            <label class="wz-rule">
              <input type="checkbox" id="ruleDedupePhone" checked />
              <span>
                <span class="wz-rule-title">Same phone number</span>
                <span class="wz-rule-desc">Strongest signal for scraped data. Numbers are normalised first, so 9876543210, +91 98765-43210 and 919876543210 all match.</span>
              </span>
            </label>
            <label class="wz-rule">
              <input type="checkbox" id="ruleDedupeNameCity" checked />
              <span>
                <span class="wz-rule-title">Same business name in the same city</span>
                <span class="wz-rule-desc">Catches the same shop listed twice under two different numbers. Case and punctuation are ignored.</span>
              </span>
            </label>
            <label class="wz-rule">
              <input type="checkbox" id="ruleDedupeEmail" />
              <span>
                <span class="wz-rule-title">Same email address</span>
                <span class="wz-rule-desc">Off by default — agencies and franchise groups legitimately share one inbox across many real listings.</span>
              </span>
            </label>
          </div>

          <div style="margin-top:20px;display:flex;justify-content:flex-end;">
            <button class="wz-btn-sm brand" id="csvAnalyseBtn" ${s.file ? '' : 'disabled'}
                    onclick="window.WedEazzyCRM.analyseCsv()" style="padding:11px 20px;font-size:0.82rem;">
              <i class="fa-solid fa-magnifying-glass-chart"></i> Analyse file
            </button>
          </div>
        </div>`;

      bindDropzone();
      return;
    }

    if (s.step === 2 && s.preview) {
      const p = s.preview;
      const sum = p.summary;
      const mapped = Object.keys(p.columnMap || {});
      const importable = sum.newCount;

      stage.innerHTML = `
        <div class="wz-summary-grid">
          <div class="wz-summary-tile info"><div class="num">${fmtNum(sum.total)}</div><div class="lbl">Rows read</div></div>
          <div class="wz-summary-tile ok"><div class="num">${fmtNum(sum.newCount)}</div><div class="lbl">New listings</div></div>
          <div class="wz-summary-tile warn"><div class="num">${fmtNum(sum.duplicateInFile)}</div><div class="lbl">Dupes in file</div></div>
          <div class="wz-summary-tile warn"><div class="num">${fmtNum(sum.duplicateInDb)}</div><div class="lbl">Already in DB</div></div>
          <div class="wz-summary-tile bad"><div class="num">${fmtNum(sum.invalid)}</div><div class="lbl">Invalid rows</div></div>
        </div>

        <div class="panel-card">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
            <div>
              <h4 style="font-size:0.92rem;">
                <i class="fa-solid fa-file-csv" style="color:var(--brand-rose);"></i> ${esc(p.fileName || 'upload.csv')}
                ${p.country ? `<span style="margin-left:8px;font-size:0.82rem;">${p.country.code === 'US' ? '🇺🇸 USA' : '🇮🇳 India'}</span>` : ''}
              </h4>
              <p style="font-size:0.76rem;color:var(--text-muted);margin-top:5px;">
                Mapped columns: ${mapped.map(m => `<code>${esc(m)}</code>`).join(', ') || 'none'}
              </p>
            </div>
            <button class="wz-btn-sm ghost" onclick="window.WedEazzyCRM.resetImport()">
              <i class="fa-solid fa-arrow-left"></i> Choose a different file
            </button>
          </div>

          <div style="margin-top:18px;padding:14px;border-radius:12px;background:var(--canvas-bg);border:1px solid var(--border-color);">
            <label class="wz-rule" style="border:none;background:none;padding:0;margin-bottom:10px;">
              <input type="checkbox" id="optImportDupes" />
              <span>
                <span class="wz-rule-title">Also import the ${fmtNum(sum.duplicateInFile)} in-file duplicates</span>
                <span class="wz-rule-desc">Off by default. The first occurrence of each business is always imported — this adds the repeats back too.</span>
              </span>
            </label>
            <label class="wz-rule" style="border:none;background:none;padding:0;">
              <input type="checkbox" id="optUpdateExisting" />
              <span>
                <span class="wz-rule-title">Fill in blanks on the ${fmtNum(sum.duplicateInDb)} listings that already exist</span>
                <span class="wz-rule-desc">Only writes to fields that are currently empty (address, website, pincode…). Never overwrites data you or the vendor has already set.</span>
              </span>
            </label>
          </div>

          <h4 style="font-size:0.88rem;margin-top:20px;margin-bottom:10px;">
            Row preview <span style="font-weight:500;color:var(--text-muted);font-size:0.76rem;">(first ${Math.min(200, (p.sample || []).length)} rows)</span>
          </h4>
          <div class="table-viewport" style="max-height:420px;">
            <table class="grid-table">
              <thead>
                <tr>
                  <th style="width:56px;">Row</th>
                  <th>Business</th>
                  <th>Category</th>
                  <th>City</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                ${(p.sample || []).map(r => {
                  const cls = r.status === 'new' ? 'new'
                            : r.status === 'duplicate_in_file' ? 'dupf'
                            : r.status === 'duplicate_in_db' ? 'dupd' : 'bad';
                  const label = r.status === 'new' ? 'New'
                              : r.status === 'duplicate_in_file' ? 'Dupe in file'
                              : r.status === 'duplicate_in_db' ? 'In database' : 'Invalid';
                  const note = r.status === 'invalid'
                    ? (r.errors || []).join('; ')
                    : r.status === 'duplicate_in_file'
                      ? `${r.duplicateReason || 'Duplicate'} as row ${r.duplicateOfRow}`
                      : r.status === 'duplicate_in_db'
                        ? `${r.duplicateReason || 'Already listed'}${r.existingVendorName ? ` — "${r.existingVendorName}"` : ''}`
                        : '';
                  return `
                    <tr>
                      <td style="color:var(--text-muted);font-size:0.75rem;">${r.rowNumber}</td>
                      <td style="font-weight:600;font-size:0.8rem;">${esc(r.name) || '<span style="color:var(--text-muted);">(blank)</span>'}</td>
                      <td style="font-size:0.78rem;">${esc(r.category) || '—'}</td>
                      <td style="font-size:0.78rem;">${esc(r.city) || '—'}</td>
                      <td style="font-size:0.78rem;">${esc(r.phone) || '—'}</td>
                      <td><span class="wz-rowstatus ${cls}">${label}</span></td>
                      <td style="font-size:0.74rem;color:var(--text-muted);max-width:280px;">${esc(note)}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:20px;">
            <p style="font-size:0.8rem;color:var(--text-muted);">
              <i class="fa-solid fa-circle-info"></i>
              <strong style="color:var(--text-main);">${fmtNum(importable)}</strong> listing${importable === 1 ? '' : 's'} will be created as unclaimed.
            </p>
            <button class="wz-btn-sm brand" id="csvCommitBtn" onclick="window.WedEazzyCRM.commitImport()"
                    style="padding:11px 20px;font-size:0.82rem;" ${importable === 0 ? 'disabled' : ''}>
              <i class="fa-solid fa-database"></i> Import ${fmtNum(importable)} listing${importable === 1 ? '' : 's'}
            </button>
          </div>
        </div>`;
      return;
    }

    if (s.step === 3 && s.result) {
      const r = s.result;
      stage.innerHTML = `
        <div class="panel-card" style="text-align:center;padding:44px 24px;">
          <div class="wz-empty-icon" style="color:#10b981;background:rgba(16,185,129,0.12);width:74px;height:74px;font-size:1.8rem;">
            <i class="fa-solid fa-circle-check"></i>
          </div>
          <h3 style="font-size:1.2rem;margin-bottom:8px;">Import complete</h3>
          <p style="font-size:0.85rem;color:var(--text-muted);max-width:440px;margin:0 auto 24px;">
            Your listings are now in the registry and will appear under All Businesses.
          </p>

          <div class="wz-summary-grid" style="max-width:620px;margin:0 auto 24px;">
            <div class="wz-summary-tile ok"><div class="num">${fmtNum(r.created)}</div><div class="lbl">Created</div></div>
            <div class="wz-summary-tile info"><div class="num">${fmtNum(r.updated)}</div><div class="lbl">Updated</div></div>
            <div class="wz-summary-tile warn"><div class="num">${fmtNum(r.skipped)}</div><div class="lbl">Skipped</div></div>
            ${r.failed ? `<div class="wz-summary-tile bad"><div class="num">${fmtNum(r.failed)}</div><div class="lbl">Failed</div></div>` : ''}
          </div>

          ${(r.errors && r.errors.length) ? `
            <details style="text-align:left;max-width:620px;margin:0 auto 22px;">
              <summary style="cursor:pointer;font-size:0.8rem;font-weight:700;color:#dc2626;">
                ${r.errors.length} row${r.errors.length === 1 ? '' : 's'} could not be saved — show details
              </summary>
              <ul style="margin-top:10px;padding-left:18px;font-size:0.76rem;color:var(--text-muted);line-height:1.7;">
                ${r.errors.map(e => `<li>Row ${e.row} (${esc(e.name || 'unnamed')}): ${esc(e.message)}</li>`).join('')}
              </ul>
            </details>` : ''}

          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button class="wz-btn-sm" onclick="window.WedEazzyCRM.resetImport()">
              <i class="fa-solid fa-plus"></i> Import another file
            </button>
            <button class="wz-btn-sm brand" onclick="window.WedEazzyCRM.go('vendors')">
              <i class="fa-solid fa-store"></i> View all businesses
            </button>
          </div>
        </div>`;
      return;
    }

    // Fallback — state got out of sync; go back to a known-good step.
    s.step = 1;
    renderImportStage();
  }

  function bindDropzone() {
    const zone = document.getElementById('csvDropzone');
    const input = document.getElementById('csvFileInput');
    if (!zone || !input) return;

    const accept = (file) => {
      if (!file) return;
      if (!/\.csv$/i.test(file.name)) {
        ctx.showToast('Please choose a .csv file.', 'danger');
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

    // Country radio: toggle the visual "checked" class on the label when the
    // user picks India or USA. Without this, the inline-styled "India" label
    // always looked selected regardless of which radio was actually checked,
    // and admins uploaded USA data thinking they'd selected USA.
    document.querySelectorAll('[data-country-pick]').forEach(label => {
      label.addEventListener('click', () => {
        document.querySelectorAll('[data-country-pick]').forEach(l => l.classList.remove('wz-country-pick-checked'));
        label.classList.add('wz-country-pick-checked');
      });
    });
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

  async function commitImport() {
    const s = view.importer;
    if (!s.importId || s.busy) return;

    const btn = document.getElementById('csvCommitBtn');
    s.busy = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch wz-spin"></i> Importing…'; }

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
          importDuplicates: !!(document.getElementById('optImportDupes') || {}).checked,
          updateExisting: !!(document.getElementById('optUpdateExisting') || {}).checked,
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
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-database"></i> Retry import'; }
      }
    } catch (err) {
      ctx.showToast('Import failed: ' + err.message, 'danger');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-database"></i> Retry import'; }
    } finally {
      s.busy = false;
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

    go(tab) { if (typeof window.wedeazzyMountTab === 'function') window.wedeazzyMountTab(tab); },

    goVendorsPage(p) { view.vendors.page = p; renderVendors(window.WedEazzyStore.get()); scrollTop(); },
    goInvitationsPage(p) { view.invitations.page = p; renderInvitations(window.WedEazzyStore.get()); scrollTop(); },
    goClaimedPage(p) { view.claimed.page = p; renderClaimedListings(window.WedEazzyStore.get()); scrollTop(); },

    resetVendorFilters() {
      Object.assign(view.vendors, { page: 1, search: '', category: '', city: '', country: '', approval: '', plan: '', dateFrom: '' });
      renderVendors(window.WedEazzyStore.get());
    },
    setCountryFilter(country) {
      view.vendors.country = country;
      view.vendors.city = '';  // reset city when country changes
      view.vendors.page = 1;
      renderVendors(window.WedEazzyStore.get());
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
    bulkInvite,

    openBulkInvitePicker() {
      ctx.showToast('Pick listings on the All Businesses page, then use “Send invitations”.', 'info');
      CRM.go('vendors');
    },

    analyseCsv,
    commitImport,
    downloadTemplate,
    resetImport() {
      Object.assign(view.importer, { step: 1, file: null, importId: null, preview: null, result: null, busy: false });
      renderImportListings();
    },
  };

  function scrollTop() {
    const body = ctx.portalBody || document.getElementById('portalBody');
    if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.WedEazzyCRM = CRM;
})();