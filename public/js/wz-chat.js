/* ============================================================================
 * WedEazzy couple <-> vendor chat widget.
 *
 * Shared by the couple dashboard (user-dashboard.js) and the vendor dashboard
 * (dashboard-premium.js). Talks to /api/chat. "Real-time" is short polling:
 * the open thread refreshes every 4s and the conversation list every 15s,
 * both paused while the tab is hidden and stopped once the widget leaves the
 * page. Styling reads the dashboards' own CSS variables, so light/dark themes
 * carry over.
 *
 *   WZChat.mount(containerEl, { apiBase, getToken, openConversationId })
 *   WZChat.openForEnquiry(enquiryId, opts) -> Promise<conversationId>
 *   WZChat.watchUnread(opts, onCount)      -> stop()
 * ========================================================================== */
(function () {
  'use strict';

  var THREAD_POLL_MS = 4000;
  var LIST_POLL_MS = 15000;
  var UNREAD_POLL_MS = 30000;

  var CSS = [
    '.wzc{--wzc-accent:var(--rose-primary,#DC1F30);display:grid;grid-template-columns:320px 1fr;height:calc(100vh - 190px);min-height:460px;background:var(--bg-card,#fff);border:1px solid var(--border-color,#E5E7EB);border-radius:16px;overflow:hidden;box-shadow:var(--shadow-premium,none);font-family:var(--sans,Inter,system-ui,sans-serif);color:var(--text-primary,#1F2937)}',
    '.wzc-list{border-right:1px solid var(--border-color,#E5E7EB);display:flex;flex-direction:column;min-height:0}',
    '.wzc-list-head{padding:16px 18px;border-bottom:1px solid var(--border-color,#E5E7EB);font-family:var(--serif,Georgia,serif);font-size:18px;font-weight:600;color:var(--navy,#0E1726)}',
    '[data-theme="dark"] .wzc-list-head,[data-theme="dark"] .wzc-thread-title{color:var(--text-primary,#F3F4F6)}',
    '.wzc-items{overflow-y:auto;flex:1}',
    '.wzc-item{display:flex;gap:12px;width:100%;text-align:left;padding:14px 18px;border:0;border-bottom:1px solid var(--border-color,#E5E7EB);background:transparent;cursor:pointer;font:inherit;color:inherit}',
    '.wzc-item:hover{background:var(--bg-primary,#F9FAFC)}',
    '.wzc-item.active{background:rgba(220,31,48,.06);box-shadow:inset 3px 0 0 var(--wzc-accent)}',
    '.wzc-avatar{flex:0 0 40px;height:40px;border-radius:50%;background:rgba(220,31,48,.1);color:var(--wzc-accent);display:flex;align-items:center;justify-content:center;font-weight:700}',
    '.wzc-item-main{flex:1;min-width:0}',
    '.wzc-item-top{display:flex;justify-content:space-between;gap:8px;align-items:baseline}',
    '.wzc-item-name{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.wzc-item-time{font-size:11px;color:var(--text-muted,#9CA3AF);flex-shrink:0}',
    '.wzc-item-sub{font-size:12px;color:var(--text-muted,#9CA3AF);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.wzc-item-last{display:flex;justify-content:space-between;gap:8px;margin-top:4px;font-size:12.5px;color:var(--text-secondary,#4B5563)}',
    '.wzc-item-last span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.wzc-item.unread .wzc-item-last span:first-child{font-weight:700;color:var(--text-primary,#1F2937)}',
    '.wzc-badge{background:var(--wzc-accent);color:#fff;border-radius:999px;font-size:11px;font-weight:700;min-width:20px;height:20px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.wzc-thread{display:flex;flex-direction:column;min-height:0;min-width:0}',
    '.wzc-thread-head{display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--border-color,#E5E7EB)}',
    '.wzc-back{display:none;border:1px solid var(--border-color,#E5E7EB);background:transparent;color:inherit;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit}',
    '.wzc-thread-title{font-weight:700;font-size:15px;color:var(--navy,#0E1726)}',
    '.wzc-thread-sub{font-size:12px;color:var(--text-muted,#9CA3AF)}',
    '.wzc-enquiry{margin:12px 18px 0;padding:10px 12px;border:1px dashed var(--border-color,#E5E7EB);border-radius:10px;font-size:12px;color:var(--text-secondary,#4B5563);background:var(--bg-primary,#F9FAFC)}',
    '.wzc-msgs{flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:8px}',
    '.wzc-day{align-self:center;font-size:11px;color:var(--text-muted,#9CA3AF);margin:8px 0}',
    '.wzc-msg{max-width:75%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}',
    '.wzc-msg.them{align-self:flex-start;background:var(--bg-primary,#F3F4F6);border:1px solid var(--border-color,#E5E7EB);border-bottom-left-radius:4px}',
    '.wzc-msg.me{align-self:flex-end;background:var(--wzc-accent);color:#fff;border-bottom-right-radius:4px}',
    '.wzc-msg-time{display:block;font-size:10.5px;opacity:.7;margin-top:3px;text-align:right}',
    '.wzc-compose{display:flex;gap:10px;padding:12px 18px;border-top:1px solid var(--border-color,#E5E7EB);align-items:flex-end}',
    '.wzc-compose textarea{flex:1;resize:none;min-height:42px;max-height:120px;padding:10px 12px;border:1px solid var(--border-color,#E5E7EB);border-radius:12px;font:inherit;font-size:14px;background:var(--bg-primary,#fff);color:inherit;outline:none}',
    '.wzc-compose textarea:focus{border-color:var(--wzc-accent)}',
    '.wzc-send{background:var(--wzc-accent);color:#fff;border:0;border-radius:12px;padding:0 18px;height:42px;font-weight:700;cursor:pointer;font:inherit;font-weight:700}',
    '.wzc-send:disabled{opacity:.5;cursor:default}',
    '.wzc-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;color:var(--text-muted,#9CA3AF);font-size:14px}',
    '.wzc-empty strong{color:var(--text-primary,#1F2937);font-size:15px;margin-bottom:4px}',
    '.wzc-error{color:#B91C1C;font-size:12px;padding:0 18px 8px}',
    '.wzc-nav-badge{margin-left:auto;background:var(--rose-primary,#DC1F30);color:#fff;border-radius:999px;font-size:11px;font-weight:700;min-width:20px;height:20px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center}',
    '@media (max-width:820px){.wzc{grid-template-columns:1fr;height:calc(100vh - 150px)}.wzc .wzc-thread{display:none}.wzc.show-thread .wzc-list{display:none}.wzc.show-thread .wzc-thread{display:flex}.wzc-back{display:inline-block}.wzc-msg{max-width:85%}.wzc-list,.wzc-thread-head,.wzc-msgs,.wzc-compose{padding-left:0;padding-right:0}.wzc-thread-head,.wzc-msgs,.wzc-compose{padding-left:12px;padding-right:12px}.wzc-enquiry{margin:10px 12px 0}}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('wzc-style')) return;
    var s = document.createElement('style');
    s.id = 'wzc-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtTime(d) {
    return new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }
  function fmtDay(d) {
    var date = new Date(d);
    var today = new Date();
    var yest = new Date(); yest.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yest.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtListTime(d) {
    var date = new Date(d);
    return date.toDateString() === new Date().toDateString() ? fmtTime(d) : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  function request(opts, method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    var tok = opts.getToken && opts.getToken();
    if (tok) headers.Authorization = 'Bearer ' + tok;
    return fetch((opts.apiBase || '') + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok || data.ok === false) {
            var err = new Error((data && data.message) || ('Request failed: ' + r.status));
            err.status = r.status;
            throw err;
          }
          return data;
        });
      });
  }

  function mount(container, opts) {
    injectCss();
    opts = opts || {};
    var st = { conversations: [], activeId: opts.openConversationId || null, lastSig: '', sending: false, timers: [] };

    container.innerHTML =
      '<div class="wzc" data-wzc>' +
        '<div class="wzc-list"><div class="wzc-list-head">Messages</div><div class="wzc-items" data-items><div class="wzc-empty">Loading conversations…</div></div></div>' +
        '<div class="wzc-thread" data-thread><div class="wzc-empty"><strong>Select a conversation</strong>Your chats with ' + (opts.role === 'vendor' ? 'couples' : 'vendors') + ' appear here.</div></div>' +
      '</div>';
    var root = container.querySelector('[data-wzc]');
    var itemsEl = root.querySelector('[data-items]');
    var threadEl = root.querySelector('[data-thread]');

    function alive() { return document.body.contains(root); }
    function stop() { st.timers.forEach(clearInterval); st.timers = []; }
    function every(ms, fn) {
      st.timers.push(setInterval(function () {
        if (!alive()) return stop();
        if (document.hidden) return;
        fn();
      }, ms));
    }

    function renderList() {
      if (!st.conversations.length) {
        itemsEl.innerHTML = '<div class="wzc-empty"><strong>No conversations yet</strong>' +
          (opts.role === 'vendor'
            ? 'When a couple sends you an enquiry, you can chat with them here.'
            : 'Send an enquiry to a vendor to start chatting with them.') + '</div>';
        return;
      }
      itemsEl.innerHTML = st.conversations.map(function (c) {
        var last = c.lastMessage;
        return '<button type="button" class="wzc-item' + (c.id === st.activeId ? ' active' : '') + (c.unread ? ' unread' : '') + '" data-id="' + esc(c.id) + '">' +
          '<span class="wzc-avatar">' + esc((c.with.name || '?').charAt(0).toUpperCase()) + '</span>' +
          '<span class="wzc-item-main">' +
            '<span class="wzc-item-top"><span class="wzc-item-name">' + esc(c.with.name) + '</span><span class="wzc-item-time">' + esc(fmtListTime(c.updatedAt)) + '</span></span>' +
            '<span class="wzc-item-sub" style="display:block">' + esc(c.with.subtitle || '') + '</span>' +
            '<span class="wzc-item-last"><span>' + (last ? (last.fromMe ? 'You: ' : '') + esc(last.message) : '<em>No messages yet</em>') + '</span>' +
              (c.unread ? '<span class="wzc-badge">' + c.unread + '</span>' : '') + '</span>' +
          '</span></button>';
      }).join('');
    }

    function loadList() {
      return request(opts, 'GET', '/api/chat/conversations').then(function (d) {
        st.conversations = d.conversations || [];
        renderList();
        if (opts.onUnreadChange) opts.onUnreadChange(st.conversations.reduce(function (n, c) { return n + (c.unread || 0); }, 0));
      }).catch(function (e) {
        itemsEl.innerHTML = '<div class="wzc-empty"><strong>Could not load conversations</strong>' + esc(e.message) + '</div>';
      });
    }

    function renderThreadShell(conv) {
      var enq = conv.enquiry || {};
      var bits = [];
      if (enq.eventDate) bits.push('Event: ' + new Date(enq.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
      if (enq.guests) bits.push('Guests: ' + enq.guests);
      if (enq.budget) bits.push('Budget: ' + enq.budget);
      threadEl.innerHTML =
        '<div class="wzc-thread-head">' +
          '<button type="button" class="wzc-back" data-back>&larr;</button>' +
          '<span class="wzc-avatar">' + esc((conv.with.name || '?').charAt(0).toUpperCase()) + '</span>' +
          '<div style="min-width:0"><div class="wzc-thread-title">' + esc(conv.with.name) + '</div><div class="wzc-thread-sub">' + esc(conv.with.subtitle || '') + '</div></div>' +
        '</div>' +
        '<div class="wzc-enquiry"><strong>Enquiry</strong> sent ' + esc(fmtDay(enq.createdAt || Date.now())) +
          (bits.length ? ' · ' + esc(bits.join(' · ')) : '') +
          (enq.notes ? '<div style="margin-top:4px;white-space:pre-wrap">' + esc(enq.notes) + '</div>' : '') + '</div>' +
        '<div class="wzc-msgs" data-msgs></div>' +
        '<div class="wzc-error" data-err hidden></div>' +
        '<form class="wzc-compose" data-compose>' +
          '<textarea rows="1" maxlength="2000" placeholder="Type a message…" aria-label="Message"></textarea>' +
          '<button type="submit" class="wzc-send">Send</button>' +
        '</form>';
      var ta = threadEl.querySelector('textarea');
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
      ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
      threadEl.querySelector('[data-compose]').addEventListener('submit', function (e) { e.preventDefault(); send(); });
      threadEl.querySelector('[data-back]').addEventListener('click', function () {
        root.classList.remove('show-thread');
        st.activeId = null;
        renderList();
      });
    }

    function renderMessages(messages, forceScroll) {
      var box = threadEl.querySelector('[data-msgs]');
      if (!box) return;
      var sig = messages.length + ':' + (messages.length ? messages[messages.length - 1].id : '');
      if (sig === st.lastSig && !forceScroll) return;
      st.lastSig = sig;
      var nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      var lastDay = '';
      box.innerHTML = messages.length ? messages.map(function (m) {
        var day = fmtDay(m.createdAt);
        var sep = day !== lastDay ? '<div class="wzc-day">' + esc(day) + '</div>' : '';
        lastDay = day;
        return sep + '<div class="wzc-msg ' + (m.fromMe ? 'me' : 'them') + '">' + esc(m.message) +
          '<span class="wzc-msg-time">' + esc(fmtTime(m.createdAt)) + (m.fromMe && m.readAt ? ' · Seen' : '') + '</span></div>';
      }).join('') : '<div class="wzc-empty" style="flex:0;padding:24px">No messages yet. Say hello!</div>';
      if (forceScroll || nearBottom) box.scrollTop = box.scrollHeight;
    }

    function loadThread(first) {
      var id = st.activeId;
      if (!id) return Promise.resolve();
      return request(opts, 'GET', '/api/chat/conversations/' + encodeURIComponent(id) + '/messages').then(function (d) {
        if (st.activeId !== id) return;
        if (first) renderThreadShell(d.conversation);
        renderMessages(d.messages || [], first);
        // Opening marks the other side's messages read; reflect that locally.
        var c = st.conversations.find(function (x) { return x.id === id; });
        if (c && c.unread) { c.unread = 0; renderList(); if (opts.onUnreadChange) opts.onUnreadChange(st.conversations.reduce(function (n, x) { return n + (x.unread || 0); }, 0)); }
      }).catch(function (e) {
        if (first) threadEl.innerHTML = '<div class="wzc-empty"><strong>Could not open this conversation</strong>' + esc(e.message) + '</div>';
      });
    }

    function open(id) {
      st.activeId = id;
      st.lastSig = '';
      root.classList.add('show-thread');
      threadEl.innerHTML = '<div class="wzc-empty">Loading…</div>';
      renderList();
      return loadThread(true);
    }

    function send() {
      var ta = threadEl.querySelector('textarea');
      var btn = threadEl.querySelector('.wzc-send');
      var errEl = threadEl.querySelector('[data-err]');
      var text = ta.value.trim();
      if (!text || st.sending || !st.activeId) return;
      st.sending = true; btn.disabled = true; errEl.hidden = true;
      var id = st.activeId;
      request(opts, 'POST', '/api/chat/conversations/' + encodeURIComponent(id) + '/messages', { message: text })
        .then(function () {
          ta.value = ''; ta.style.height = 'auto';
          return loadThread(false).then(function () {
            var box = threadEl.querySelector('[data-msgs]');
            if (box) box.scrollTop = box.scrollHeight;
            return loadList();
          });
        })
        .catch(function (e) { errEl.textContent = e.message; errEl.hidden = false; })
        .then(function () { st.sending = false; btn.disabled = false; ta.focus(); });
    }

    itemsEl.addEventListener('click', function (e) {
      var b = e.target.closest('.wzc-item');
      if (b) open(b.getAttribute('data-id'));
    });

    loadList().then(function () { if (st.activeId) open(st.activeId); });
    every(THREAD_POLL_MS, function () { loadThread(false); });
    every(LIST_POLL_MS, loadList);

    return { open: open, refresh: loadList, destroy: stop };
  }

  function openForEnquiry(enquiryId, opts) {
    return request(opts, 'POST', '/api/chat/enquiries/' + encodeURIComponent(enquiryId) + '/conversation')
      .then(function (d) { return d.conversation.id; });
  }

  function watchUnread(opts, onCount) {
    function tick() {
      if (document.hidden) return;
      request(opts, 'GET', '/api/chat/unread-count').then(function (d) { onCount(d.unread || 0); }).catch(function () {});
    }
    tick();
    var t = setInterval(tick, UNREAD_POLL_MS);
    return function () { clearInterval(t); };
  }

  /** Render a count into a nav badge element (hidden at zero). */
  function setBadge(el, n) {
    if (!el) return;
    el.textContent = n > 99 ? '99+' : String(n);
    el.style.display = n > 0 ? 'inline-flex' : 'none';
  }

  // Nav badges render before any chat is mounted, so the styles load up front.
  if (document.head) injectCss(); else document.addEventListener('DOMContentLoaded', injectCss);

  window.WZChat = { mount: mount, openForEnquiry: openForEnquiry, watchUnread: watchUnread, setBadge: setBadge };
})();
