/**
 * WedEazzy — Public Site Enhancement Layer
 * ========================================
 * One drop-in script shared by every public page. Responsibilities:
 *
 *   1. Tawk.to live-chat embed (positioned so it can't collide with the two
 *      floating widgets the site already has)
 *   2. Scroll-reveal animations via IntersectionObserver
 *   3. Smooth in-page anchor scrolling with sticky-header offset
 *   4. Header shadow/condense on scroll
 *   5. Mobile navigation drawer for the existing header links
 *   6. Back-to-top control
 *   7. Lazy-loading + fade-in for images that don't already opt in
 *   8. Ripple feedback on primary buttons
 *
 * Everything is defensive: each block is independent and wrapped so a failure
 * in one (e.g. a blocked third-party script) cannot stop the others. The whole
 * file no-ops for visitors who have asked for reduced motion.
 */
(function () {
  'use strict';

  if (window.__wedeazzyEnhanceLoaded) return;
  window.__wedeazzyEnhanceLoaded = true;

  var REDUCED_MOTION = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Run fn once the DOM is parsed, immediately if it already is. */
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  /** Never let one enhancement's failure take down the rest of the page. */
  function safely(label, fn) {
    try { fn(); } catch (err) { console.warn('[wedeazzy-enhance] ' + label + ' failed:', err); }
  }

  /* ============================================================
     1. TAWK.TO LIVE CHAT
     ============================================================
     The site already renders two fixed widgets: support-widget.js at
     bottom-right (24px) and faq-chatbot.js at bottom-left (24px), plus the
     .float-wa WhatsApp pill also at bottom-right. Tawk's default placement is
     bottom-right, which would stack directly on top of them, so the launcher
     is offset upward via Tawk's documented customStyle API.
     ============================================================ */
  function initTawk() {
    if (window.Tawk_API) return;             // already embedded by a page
    if (document.getElementById('wedeazzy-tawk')) return;

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    // Offsets clear the existing bottom-right widgets on each breakpoint.
    window.Tawk_API.customStyle = {
      visibility: {
        desktop: { position: 'br', xOffset: 24, yOffset: 96 },
        mobile:  { position: 'br', xOffset: 12, yOffset: 84 },
      },
    };

    var s1 = document.createElement('script');
    var s0 = document.getElementsByTagName('script')[0];
    s1.id = 'wedeazzy-tawk';
    s1.async = true;
    s1.src = 'https://embed.tawk.to/687a4021f5f188191405d82d/1j0eol1d0';
    s1.charset = 'UTF-8';
    s1.setAttribute('crossorigin', '*');
    // A blocked/failed third-party load must stay silent rather than throwing.
    s1.onerror = function () { console.warn('[wedeazzy-enhance] Tawk.to failed to load'); };
    if (s0 && s0.parentNode) s0.parentNode.insertBefore(s1, s0);
    else document.head.appendChild(s1);
  }

  /* ============================================================
     2. SCROLL REVEAL
     ============================================================ */
  var REVEAL_SELECTOR = [
    '[data-reveal]',
    '.section-head',
    '.vendor-card',
    '.category-card',
    '.city-card',
    '.blog-card',
    '.feature-card',
    '.testimonial-card',
    '.plan-card',
    '.stat-block',
    '.press-logo',
  ].join(',');

  function initReveal() {
    if (REDUCED_MOTION) return;
    if (!('IntersectionObserver' in window)) return;   // old browser: content stays visible

    var nodes = Array.prototype.slice.call(document.querySelectorAll(REVEAL_SELECTOR));
    if (!nodes.length) return;

    // Only decorate what's actually below the fold — anything already on
    // screen at load must not start invisible and wait for a scroll that may
    // never come.
    var viewportH = window.innerHeight || document.documentElement.clientHeight;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('wz-revealed');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    nodes.forEach(function (node, i) {
      var rect = node.getBoundingClientRect();
      if (rect.top < viewportH * 0.95) {
        node.classList.add('wz-reveal', 'wz-revealed');
        return;
      }
      node.classList.add('wz-reveal');
      // Stagger within a row of siblings so grids cascade rather than snap.
      node.style.transitionDelay = ((i % 4) * 60) + 'ms';
      observer.observe(node);
    });

    // Safety net: if anything is still hidden after 4s (observer never fired
    // because of a layout quirk, a hidden ancestor, etc.), reveal it. Content
    // being permanently invisible is far worse than losing an animation.
    setTimeout(function () {
      document.querySelectorAll('.wz-reveal:not(.wz-revealed)').forEach(function (n) {
        var r = n.getBoundingClientRect();
        if (r.top < (window.innerHeight || 0)) n.classList.add('wz-revealed');
      });
    }, 4000);
  }

  /* ============================================================
     3. SMOOTH ANCHOR SCROLLING
     ============================================================ */
  function headerOffset() {
    var header = document.querySelector('.header, header.header, .site-header');
    if (!header) return 12;
    var style = window.getComputedStyle(header);
    if (style.position !== 'sticky' && style.position !== 'fixed') return 12;
    return header.getBoundingClientRect().height + 12;
  }

  function initSmoothAnchors() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a[href^="#"]');
      if (!link) return;

      var raw = link.getAttribute('href');
      // "#" and "#!" are used as no-op/JS hooks throughout the site.
      if (!raw || raw === '#' || raw === '#!' || raw.length < 2) return;
      if (link.hasAttribute('data-no-smooth')) return;

      var target;
      try { target = document.querySelector(raw); } catch (err) { return; }
      if (!target) return;

      e.preventDefault();
      var top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset();
      window.scrollTo({ top: top, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });

      // Keep the URL and focus in sync for deep-linking and screen readers.
      if (history.replaceState) history.replaceState(null, '', raw);
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  }

  /* ============================================================
     4. HEADER ON SCROLL
     ============================================================ */
  function initHeaderScroll() {
    var header = document.querySelector('.header, header.header, .site-header');
    if (!header) return;

    var ticking = false;
    function update() {
      header.classList.toggle('wz-scrolled', window.pageYOffset > 12);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  /* ============================================================
     5. MOBILE NAVIGATION
     ============================================================
     The public header lays its links out in a horizontal row that overflows
     below ~820px. This injects a hamburger and moves the existing links into
     a slide-in panel — no page markup has to change.
     ============================================================ */
  function initMobileNav() {
    var header = document.querySelector('.header, header.header, .site-header');
    if (!header) return;

    var inner = header.querySelector('.header-inner') || header;
    // index.html marks its link container .header-nav; every page built on
    // shared.css uses .header-right. Support both rather than silently
    // skipping the homepage.
    var right = header.querySelector('.header-right, .header-nav');
    if (!right) return;
    if (header.querySelector('.wz-nav-toggle')) return;   // already initialised

    var toggle = document.createElement('button');
    toggle.className = 'wz-nav-toggle';
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';

    var panel = document.createElement('div');
    panel.className = 'wz-nav-panel';
    panel.id = 'wzNavPanel';

    var scrim = document.createElement('div');
    scrim.className = 'wz-nav-scrim';

    // Clone rather than move: the desktop header keeps working untouched at
    // wide widths, and CSS decides which copy is visible.
    Array.prototype.forEach.call(right.children, function (child) {
      panel.appendChild(child.cloneNode(true));
    });

    toggle.setAttribute('aria-controls', 'wzNavPanel');
    inner.appendChild(toggle);
    document.body.appendChild(scrim);
    document.body.appendChild(panel);

    function open() {
      panel.classList.add('show');
      scrim.classList.add('show');
      toggle.classList.add('active');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      panel.classList.remove('show');
      scrim.classList.remove('show');
      toggle.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      document.body.style.overflow = '';
    }

    toggle.addEventListener('click', function () {
      panel.classList.contains('show') ? close() : open();
    });
    scrim.addEventListener('click', close);
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('show')) close();
    });
    // Rotating a tablet back to landscape must not leave the body scroll-locked.
    window.addEventListener('resize', function () {
      if (window.innerWidth > 820 && panel.classList.contains('show')) close();
    });
  }

  /* ============================================================
     6. BACK TO TOP
     ============================================================ */
  function initBackToTop() {
    if (document.querySelector('.wz-to-top')) return;

    var btn = document.createElement('button');
    btn.className = 'wz-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
                    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                    '<path d="M18 15l-6-6-6 6"/></svg>';
    document.body.appendChild(btn);

    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
    });

    var ticking = false;
    function update() {
      btn.classList.toggle('show', window.pageYOffset > 600);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  /* ============================================================
     7. IMAGE LOADING POLISH
     ============================================================ */
  function initImages() {
    var imgs = document.querySelectorAll('img:not([loading])');
    Array.prototype.forEach.call(imgs, function (img) {
      // Never lazy-load above-the-fold imagery — it delays the LCP element.
      if (img.getBoundingClientRect().top > (window.innerHeight || 0)) {
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
      }
      if (REDUCED_MOTION) return;
      if (img.complete) { img.classList.add('wz-img-in'); return; }
      img.classList.add('wz-img-fade');
      img.addEventListener('load', function () { img.classList.add('wz-img-in'); }, { once: true });
      // A broken image must not stay stuck at opacity 0.
      img.addEventListener('error', function () { img.classList.add('wz-img-in'); }, { once: true });
    });
  }

  /* ============================================================
     8. BUTTON RIPPLE
     ============================================================ */
  function initRipple() {
    if (REDUCED_MOTION) return;
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.btn-primary, .header-cta, .wz-ripple');
      if (!btn) return;
      var rect = btn.getBoundingClientRect();
      var ink = document.createElement('span');
      ink.className = 'wz-ink';
      var size = Math.max(rect.width, rect.height);
      ink.style.width = ink.style.height = size + 'px';
      ink.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ink.style.top = (e.clientY - rect.top - size / 2) + 'px';
      if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
      btn.appendChild(ink);
      setTimeout(function () { ink.remove(); }, 620);
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  onReady(function () {
    safely('tawk', initTawk);
    safely('reveal', initReveal);
    safely('smooth-anchors', initSmoothAnchors);
    safely('header-scroll', initHeaderScroll);
    safely('mobile-nav', initMobileNav);
    safely('back-to-top', initBackToTop);
    safely('images', initImages);
    safely('ripple', initRipple);
  });
})();
