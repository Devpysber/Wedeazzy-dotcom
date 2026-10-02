/* ============================================================================
 * WedEazzy country picker — one searchable list shared by the Browse pages
 * (category/city) and the couple dashboard. The homepage keeps its own sheet
 * but reads and writes the same saved choice.
 *
 *   WZCountry.get()                    -> 'IN' (?country=, else saved choice, else India)
 *   WZCountry.set(code)                   remember the visitor's choice
 *   WZCountry.list()                   -> Promise<[{ code, name, vendorCount, ... }]>
 *   WZCountry.open({ current, onSelect })  searchable modal / bottom sheet
 *   WZCountry.pill(el, { current, onSelect })  renders a "flag Country ▾" button
 *
 * The country list comes from /api/public/countries (admin panel > Countries),
 * so newly enabled countries show up here without a code change.
 * ========================================================================== */
(function () {
  'use strict';

  var KEY = 'wz_country'; // same key the homepage uses
  var DEFAULT = 'IN';
  var FALLBACK = [
    { code: 'IN', name: 'India' }, { code: 'AE', name: 'UAE' }, { code: 'GB', name: 'UK' },
    { code: 'US', name: 'USA' }, { code: 'CA', name: 'Canada' }, { code: 'AU', name: 'Australia' },
  ];
  var API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:4000' : '';

  var CSS = [
    '.wzct-pill{display:inline-flex;align-items:center;gap:8px;height:46px;padding:0 14px;border:1px solid var(--line,#E5E0DA);border-radius:12px;background:var(--bg-card,#fff);color:inherit;font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}',
    '.wzct-pill:hover{border-color:#B24A5B}',
    '.wzct-pill img,.wzct-item img{width:22px;height:16px;border-radius:3px;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.08);flex-shrink:0}',
    '.wzct-pill svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.2;opacity:.6}',
    '.wzct-back{position:fixed;inset:0;z-index:5000;background:rgba(20,14,12,.45);display:flex;align-items:center;justify-content:center;padding:16px;animation:wzctFade .15s ease}',
    '.wzct-box{width:100%;max-width:420px;max-height:min(560px,86vh);background:#fff;color:#1A1A1A;border-radius:18px;box-shadow:0 24px 60px -12px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden;font-family:Inter,system-ui,-apple-system,sans-serif}',
    '.wzct-head{display:flex;align-items:center;justify-content:space-between;padding:18px 18px 10px}',
    ".wzct-head h3{margin:0;font-family:'Playfair Display',Georgia,serif;font-size:21px;font-weight:600}",
    '.wzct-x{width:36px;height:36px;border:0;border-radius:50%;background:#F4F1EE;font-size:20px;line-height:1;cursor:pointer;color:#444}',
    '.wzct-search{margin:0 18px 10px;position:relative}',
    '.wzct-search input{width:100%;height:46px;border:1px solid #E5E0DA;border-radius:12px;padding:0 14px 0 40px;font:inherit;font-size:15px;outline:none;background:#FAF8F5;box-sizing:border-box}',
    '.wzct-search input:focus{border-color:#B24A5B;background:#fff;box-shadow:0 0 0 3px rgba(178,74,91,.12)}',
    '.wzct-search svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);width:18px;height:18px;fill:none;stroke:#8C8380;stroke-width:2;stroke-linecap:round}',
    '.wzct-list{overflow-y:auto;padding:4px 10px 12px}',
    '.wzct-item{display:flex;align-items:center;gap:12px;width:100%;padding:12px 10px;border:0;border-radius:12px;background:none;cursor:pointer;text-align:left;font:inherit;color:inherit}',
    '.wzct-item:hover,.wzct-item:focus-visible{background:#F8F1F2;outline:none}',
    '.wzct-item.on{background:#FBEFF1}',
    '.wzct-item b{display:block;font-size:15px;font-weight:600}',
    '.wzct-item small{display:block;font-size:12.5px;color:#7E7674}',
    '.wzct-item .wzct-tick{margin-left:auto;color:#B24A5B;font-weight:700}',
    '.wzct-empty{padding:28px 10px;text-align:center;color:#7E7674;font-size:14px}',
    '.wzct-note{margin:0;padding:10px 18px 16px;font-size:12.5px;color:#7E7674;border-top:1px solid #F0EBE6}',
    '@media (max-width:600px){.wzct-back{align-items:flex-end;padding:0}.wzct-box{max-width:none;border-radius:20px 20px 0 0;max-height:82vh;padding-bottom:env(safe-area-inset-bottom)}}',
    '@keyframes wzctFade{from{opacity:0}to{opacity:1}}',
  ].join('\n');

  function injectCss() {
    if (document.getElementById('wzct-style')) return;
    var s = document.createElement('style');
    s.id = 'wzct-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function flag(code) { return 'https://flagcdn.com/' + String(code).toLowerCase() + '.svg'; }
  function valid(code) { return /^[A-Z]{2}$/.test(String(code || '')); }

  function get() {
    var q = (new URLSearchParams(location.search).get('country') || '').toUpperCase();
    if (valid(q)) return q;
    try { var saved = localStorage.getItem(KEY); if (valid(saved)) return saved; } catch (_) {}
    return DEFAULT;
  }
  function set(code) {
    if (!valid(code)) return;
    try { localStorage.setItem(KEY, code); } catch (_) {}
  }

  var listPromise = null;
  function list() {
    if (!listPromise) {
      listPromise = fetch(API_BASE + '/api/public/countries')
        .then(function (r) { return r.json(); })
        .then(function (d) { return (d && d.ok && d.countries && d.countries.length) ? d.countries : FALLBACK; })
        .catch(function () { return FALLBACK; });
    }
    return listPromise;
  }
  function nameOf(code, countries) {
    var c = (countries || FALLBACK).find(function (x) { return x.code === code; });
    return c ? c.name : code;
  }

  function open(opts) {
    opts = opts || {};
    injectCss();
    var current = opts.current || get();
    var back = document.createElement('div');
    back.className = 'wzct-back';
    back.innerHTML =
      '<div class="wzct-box" role="dialog" aria-modal="true" aria-labelledby="wzctTitle">' +
        '<div class="wzct-head"><h3 id="wzctTitle">Choose your country</h3><button type="button" class="wzct-x" aria-label="Close">&times;</button></div>' +
        '<label class="wzct-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
          '<input type="search" placeholder="Search countries" aria-label="Search countries" autocomplete="off" /></label>' +
        '<div class="wzct-list" role="listbox" aria-label="Countries"><div class="wzct-empty">Loading countries…</div></div>' +
        '<p class="wzct-note">You\'ll see wedding vendors, cities and prices for the country you choose.</p>' +
      '</div>';
    document.body.appendChild(back);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    var input = back.querySelector('input');
    var listEl = back.querySelector('.wzct-list');
    var countries = [];

    function close() {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      back.remove();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    function render() {
      var q = input.value.trim().toLowerCase();
      var rows = countries.filter(function (c) { return !q || c.name.toLowerCase().indexOf(q) >= 0 || c.code.toLowerCase() === q; });
      listEl.innerHTML = rows.length ? rows.map(function (c) {
        var sub = c.vendorCount >= 50 ? Number(c.vendorCount).toLocaleString('en-IN') + '+ vendors'
          : c.vendorCount > 0 ? c.vendorCount + ' vendors' : 'Now onboarding vendors';
        return '<button type="button" role="option" class="wzct-item' + (c.code === current ? ' on' : '') + '" aria-selected="' + (c.code === current) + '" data-code="' + esc(c.code) + '">' +
          '<img src="' + flag(c.code) + '" alt="" /><span><b>' + esc(c.name) + '</b><small>' + esc(sub) + (c.currencySymbol ? ' · ' + esc(c.currencySymbol) : '') + '</small></span>' +
          (c.code === current ? '<span class="wzct-tick">✓</span>' : '') + '</button>';
      }).join('') : '<div class="wzct-empty">No country matches "' + esc(input.value) + '"</div>';
    }

    back.addEventListener('click', function (e) {
      if (e.target === back || e.target.closest('.wzct-x')) return close();
      var item = e.target.closest('.wzct-item');
      if (!item) return;
      var code = item.getAttribute('data-code');
      set(code);
      close();
      if (opts.onSelect) opts.onSelect(code, nameOf(code, countries));
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var first = listEl.querySelector('.wzct-item'); if (first) first.click(); }
    });
    document.addEventListener('keydown', onKey);
    list().then(function (c) { countries = c; render(); });
    // Focusing on a phone pops the keyboard over the list; only autofocus on desktop.
    if (window.matchMedia && window.matchMedia('(min-width: 601px)').matches) input.focus();
    return { close: close };
  }

  function pill(el, opts) {
    if (!el) return;
    injectCss();
    opts = opts || {};
    var code = opts.current || get();
    function paint(name) {
      el.innerHTML = '<img src="' + flag(code) + '" alt="" /><span>' + esc(name) + '</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
      el.setAttribute('aria-label', 'Country: ' + name + '. Change country');
    }
    el.classList.add('wzct-pill');
    el.type = 'button';
    paint(nameOf(code));
    list().then(function (c) { paint(nameOf(code, c)); });
    el.addEventListener('click', function () {
      open({
        current: code,
        onSelect: function (next, name) {
          if (next === code) return;
          code = next;
          paint(name);
          if (opts.onSelect) opts.onSelect(next, name);
        },
      });
    });
  }

  window.WZCountry = { get: get, set: set, list: list, open: open, pill: pill, flag: flag, DEFAULT: DEFAULT };
})();
