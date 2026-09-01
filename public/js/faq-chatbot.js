(function() {
  // Prevent duplicate initialization
  if (document.getElementById('wedeazzy-faq-chatbot')) return;

  // ---------- Content: menu-driven FAQ tree (no AI, no backend calls) ----------
  var WHATSAPP_NUM = '919930090487';
  var ADMIN_WA_LINK = 'https://wa.me/' + WHATSAPP_NUM;

  var NODES = {
    root: {
      bot: "Hi! I'm the WedEazzy Help Bot 🤖 — ask me anything about planning your wedding, or pick a topic below.",
      options: [
        { label: '💰 Is WedEazzy free to use?', go: 'fees' },
        { label: '🔍 How do I find vendors?', go: 'find_vendors' },
        { label: '📩 How do I contact a vendor?', go: 'contact_vendor' },
        { label: '🏪 I want to list my business', go: 'list_business' },
        { label: '📅 How does booking work?', go: 'booking' },
        { label: '🙋 Talk to a human', go: 'human' },
      ],
    },
    fees: {
      bot: "WedEazzy is 100% free for couples — zero booking fees, always. You only ever pay the vendor directly for their services, at whatever price you agree with them.",
      options: [
        { label: '🔍 How do I find vendors?', go: 'find_vendors' },
        { label: '⬅️ Back to main menu', go: 'root' },
      ],
    },
    find_vendors: {
      bot: "You can browse vendors by category (banquet halls, photographers, caterers, decorators, and more) or by city on our homepage. Use the filters to narrow down by budget, location, and ratings.",
      options: [
        { label: '📍 Browse by city', href: '../index.html#cities' },
        { label: '📂 Browse by category', href: '../index.html#categories' },
        { label: '⬅️ Back to main menu', go: 'root' },
      ],
    },
    contact_vendor: {
      bot: "Every vendor profile has a direct 'Chat on WhatsApp' button — no middleman, no waiting. Just open a vendor's page and tap it to message them directly.",
      options: [
        { label: '🔍 Find a vendor now', go: 'find_vendors' },
        { label: '⬅️ Back to main menu', go: 'root' },
      ],
    },
    list_business: {
      bot: "Great! If you run a wedding business (venue, photography, catering, decor, etc.), you can list it on WedEazzy to reach couples actively planning their wedding.",
      options: [
        { label: '🏪 Go to List Your Business', href: 'marketing.html' },
        { label: '⬅️ Back to main menu', go: 'root' },
      ],
    },
    booking: {
      bot: "There's no in-app booking or payment required — you connect directly with the vendor via WhatsApp, discuss your requirements, and finalize things with them directly. WedEazzy just helps you discover the right vendor.",
      options: [
        { label: '🔍 How do I find vendors?', go: 'find_vendors' },
        { label: '⬅️ Back to main menu', go: 'root' },
      ],
    },
    human: {
      bot: "No problem — our support team is happy to help directly on WhatsApp.",
      options: [
        { label: '💬 Chat with WedEazzy Support', href: ADMIN_WA_LINK },
        { label: '⬅️ Back to main menu', go: 'root' },
      ],
    },
  };

  // Keyword routing for free-typed questions (simple substring matching — no AI).
  var KEYWORDS = {
    fees: ['fee', 'fees', 'free', 'cost', 'costs', 'price', 'pricing', 'charge', 'charges', 'expensive'],
    find_vendors: ['find', 'search', 'browse', 'looking for', 'vendor', 'vendors', 'photographer', 'photography', 'caterer', 'catering', 'decorator', 'decor', 'venue', 'venues', 'banquet', 'city', 'cities', 'category'],
    contact_vendor: ['contact', 'message', 'call', 'reach', 'whatsapp vendor', 'talk to vendor'],
    list_business: ['list', 'register', 'business', 'sign up', 'signup', 'my business', 'advertise', 'vendor account', 'become a vendor'],
    booking: ['book', 'booking', 'payment', 'pay', 'reserve', 'reservation', 'advance'],
    human: ['human', 'agent', 'support', 'representative', 'person', 'someone', 'help me'],
  };

  function findBestMatch(text) {
    var lower = text.toLowerCase();
    var best = null, bestScore = 0;
    Object.keys(KEYWORDS).forEach(function(key) {
      var score = KEYWORDS[key].reduce(function(acc, kw) {
        return acc + (lower.indexOf(kw) !== -1 ? 1 : 0);
      }, 0);
      if (score > bestScore) { bestScore = score; best = key; }
    });
    return best;
  }

  var API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:4000'
    : window.location.origin;

  // ---------- Styles ----------
  var style = document.createElement('style');
  style.innerHTML = [
    '.wf-trigger { position: fixed; bottom: 24px; left: 24px; width: 60px; height: 60px; border-radius: 50%;',
    '  background: linear-gradient(135deg, #0E1726 0%, #D12653 100%); box-shadow: 0 8px 24px rgba(14,23,38,0.35);',
    '  display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10000;',
    '  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease;',
    '  border: 2px solid rgba(255,255,255,0.2); animation: wf-float 3.2s ease-in-out infinite; }',
    '.wf-trigger:hover { animation-play-state: paused; transform: scale(1.1) rotate(-5deg); box-shadow: 0 12px 30px rgba(14,23,38,0.5); }',
    '.wf-trigger svg { width: 36px; height: 36px; display: block; }',
    '@keyframes wf-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }',
    '.wf-panel { position: fixed; bottom: 96px; left: 24px; width: 340px; max-width: calc(100vw - 48px); height: 480px;',
    '  border-radius: 20px; background: rgba(255,255,255,0.92); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);',
    '  border: 1px solid rgba(255,255,255,0.4); box-shadow: 0 12px 40px rgba(14,23,38,0.18); display: flex; flex-direction: column;',
    '  overflow: hidden; z-index: 10000; transform: translateY(20px) scale(0.95); opacity: 0; pointer-events: none;',
    '  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); font-family: "Inter", sans-serif; }',
    '.wf-panel.show { transform: translateY(0) scale(1); opacity: 1; pointer-events: auto; }',
    '.wf-header { background: linear-gradient(135deg, #0E1726 0%, #1e293b 100%); color: #fff; padding: 18px 20px; position: relative; flex-shrink: 0; }',
    '.wf-header h3 { margin: 0; font-size: 15px; font-weight: 700; }',
    '.wf-header p { margin: 2px 0 0; font-size: 11px; color: #9fb0c9; font-weight: 500; }',
    '.wf-close { position: absolute; top: 16px; right: 16px; background: none; border: none; color: #fff; font-size: 18px;',
    '  cursor: pointer; opacity: 0.7; }',
    '.wf-close:hover { opacity: 1; }',
    '.wf-body { flex-grow: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; background: rgba(241,245,249,0.5); }',
    '.wf-bubble { max-width: 85%; padding: 10px 14px; border-radius: 14px; font-size: 13px; line-height: 1.5;',
    '  background: #fff; border: 1px solid rgba(14,23,38,0.08); color: #334155; align-self: flex-start; border-top-left-radius: 0; }',
    '.wf-bubble.wf-user { align-self: flex-end; background: linear-gradient(135deg, #D12653, #0E1726); color: #fff; border: none; border-top-left-radius: 14px; border-top-right-radius: 0; }',
    '.wf-typing { align-self: flex-start; display: flex; gap: 4px; padding: 12px 14px; background: #fff; border: 1px solid rgba(14,23,38,0.08); border-radius: 14px; border-top-left-radius: 0; }',
    '.wf-typing span { width: 6px; height: 6px; border-radius: 50%; background: #94a3b8; animation: wf-bounce 1.2s infinite ease-in-out; }',
    '.wf-typing span:nth-child(2) { animation-delay: 0.15s; } .wf-typing span:nth-child(3) { animation-delay: 0.3s; }',
    '@keyframes wf-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.5; } 30% { transform: translateY(-4px); opacity: 1; } }',
    '.wf-options { display: flex; flex-direction: column; gap: 8px; margin-top: 2px; }',
    '.wf-chip { background: #fff; border: 1px solid rgba(209,38,83,0.25); color: #0E1726; padding: 9px 12px; border-radius: 10px;',
    '  font-size: 12.5px; font-weight: 600; text-align: left; cursor: pointer; transition: all 0.2s ease; }',
    '.wf-chip:hover { background: rgba(209,38,83,0.06); border-color: #D12653; transform: translateX(3px); }',
    '.wf-footer { padding: 12px; border-top: 1px solid rgba(14,23,38,0.08); display: flex; gap: 8px; background: #fff; flex-shrink: 0; }',
    '.wf-input { flex-grow: 1; border: 1px solid rgba(14,23,38,0.15); border-radius: 10px; padding: 8px 12px; font-size: 13px; outline: none; transition: border-color 0.2s; font-family: inherit; }',
    '.wf-input:focus { border-color: #D12653; }',
    '.wf-send { background: linear-gradient(135deg, #D12653, #0E1726); border: none; color: #fff; padding: 8px 16px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; }',
    '.wf-send:hover { opacity: 0.9; }',
    // Attention popup (appears once, 20s after page load)
    '.wf-attention { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.9); z-index: 10001;',
    '  background: #fff; border-radius: 18px; box-shadow: 0 20px 60px rgba(14,23,38,0.35); padding: 22px 26px; max-width: 320px;',
    '  text-align: center; opacity: 0; pointer-events: none; transition: all 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275); font-family: "Inter", sans-serif; }',
    '.wf-attention.show { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }',
    '.wf-attention-icon { width: 52px; height: 52px; border-radius: 50%; margin: 0 auto 12px; background: linear-gradient(135deg, #0E1726 0%, #D12653 100%);',
    '  display: flex; align-items: center; justify-content: center; }',
    '.wf-attention-icon svg { width: 34px; height: 34px; display: block; }',
    '.wf-attention p { margin: 0 0 14px; font-size: 14.5px; font-weight: 600; color: #0E1726; }',
    '.wf-attention-actions { display: flex; gap: 8px; justify-content: center; }',
    '.wf-attention-btn { border: none; border-radius: 999px; padding: 8px 18px; font-size: 12.5px; font-weight: 700; cursor: pointer; }',
    '.wf-attention-btn.primary { background: linear-gradient(135deg, #D12653, #0E1726); color: #fff; }',
    '.wf-attention-btn.ghost { background: rgba(14,23,38,0.06); color: #334155; }',
    '.wf-attention-backdrop { position: fixed; inset: 0; background: rgba(14,23,38,0.25); z-index: 10000; opacity: 0; pointer-events: none; transition: opacity 0.45s ease; }',
    '.wf-attention-backdrop.show { opacity: 1; pointer-events: auto; }',
  ].join('\n');
  document.head.appendChild(style);

  // Hand-drawn robot glyph, reused for both the trigger button and the attention popup.
  // Larger 48x48 canvas with generous rounded shapes so it stays crisp and well-centered
  // at any render size (pure vector, no raster asset).
  var ROBOT_SVG = [
    '<svg viewBox="0 0 48 48" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">',
    '  <circle cx="24" cy="7" r="2.6" fill="#fff"/>',
    '  <rect x="22.2" y="9.2" width="3.6" height="7" rx="1.8" fill="#fff"/>',
    '  <rect x="2.5" y="19.5" width="6.5" height="13" rx="3.25" fill="#fff"/>',
    '  <rect x="39" y="19.5" width="6.5" height="13" rx="3.25" fill="#fff"/>',
    '  <rect x="8.5" y="14.5" width="31" height="26" rx="10" fill="#fff"/>',
    '  <rect x="16.5" y="24.5" width="7" height="9.5" rx="3.5" fill="#D12653"/>',
    '  <rect x="24.5" y="24.5" width="7" height="9.5" rx="3.5" fill="#D12653"/>',
    '  <rect x="17.5" y="36" width="13" height="3.2" rx="1.6" fill="#D12653"/>',
    '</svg>',
  ].join('');

  // ---------- DOM ----------
  var widget = document.createElement('div');
  widget.id = 'wedeazzy-faq-chatbot';
  widget.innerHTML = [
    '<div class="wf-trigger" id="wfTriggerBtn" title="Wedding planning help">', ROBOT_SVG, '</div>',
    '<div class="wf-panel" id="wfPanelWindow">',
    '  <div class="wf-header">',
    '    <h3>WedEazzy Help Bot</h3>',
    '    <p>Quick answers, no waiting</p>',
    '    <button class="wf-close" id="wfCloseBtn">✕</button>',
    '  </div>',
    '  <div class="wf-body" id="wfBody"></div>',
    '  <div class="wf-footer">',
    '    <input type="text" class="wf-input" id="wfInput" placeholder="Type your question..." />',
    '    <button class="wf-send" id="wfSendBtn" type="button">Send</button>',
    '  </div>',
    '</div>',
    '<div class="wf-attention-backdrop" id="wfAttentionBackdrop"></div>',
    '<div class="wf-attention" id="wfAttentionPopup">',
    '  <div class="wf-attention-icon">', ROBOT_SVG, '</div>',
    '  <p>I\'m here if you need me! 👋</p>',
    '  <div class="wf-attention-actions">',
    '    <button class="wf-attention-btn primary" id="wfAttentionOpen">Ask something</button>',
    '    <button class="wf-attention-btn ghost" id="wfAttentionDismiss">Maybe later</button>',
    '  </div>',
    '</div>',
  ].join('\n');
  document.body.appendChild(widget);

  var triggerBtn = document.getElementById('wfTriggerBtn');
  var panelWindow = document.getElementById('wfPanelWindow');
  var closeBtn = document.getElementById('wfCloseBtn');
  var body = document.getElementById('wfBody');
  var inputEl = document.getElementById('wfInput');
  var sendBtn = document.getElementById('wfSendBtn');

  function openPanel() {
    panelWindow.classList.add('show');
  }

  triggerBtn.addEventListener('click', function() {
    panelWindow.classList.toggle('show');
  });
  closeBtn.addEventListener('click', function() {
    panelWindow.classList.remove('show');
  });

  function addUserBubble(text) {
    var bubble = document.createElement('div');
    bubble.className = 'wf-bubble wf-user';
    bubble.textContent = text;
    body.appendChild(bubble);
    body.scrollTop = body.scrollHeight;
  }

  function showTypingIndicator() {
    var typing = document.createElement('div');
    typing.className = 'wf-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(typing);
    body.scrollTop = body.scrollHeight;
    return typing;
  }

  function showTyping(callback) {
    var typing = showTypingIndicator();
    setTimeout(function() {
      typing.remove();
      callback();
    }, 550);
  }

  function renderPlainBotReply(text) {
    var bubble = document.createElement('div');
    bubble.className = 'wf-bubble';
    bubble.textContent = text;
    body.appendChild(bubble);

    var opts = document.createElement('div');
    opts.className = 'wf-options';
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'wf-chip';
    chip.textContent = '⬅️ Back to main menu';
    chip.addEventListener('click', function() {
      body.innerHTML = '';
      renderNode('root');
    });
    opts.appendChild(chip);
    body.appendChild(opts);
    body.scrollTop = body.scrollHeight;
  }

  // For anything that doesn't match a canned topic, ask the server-side
  // chat assistant (the API key lives only on the backend, never here).
  function askAI(text) {
    var typing = showTypingIndicator();
    fetch(API_BASE + '/api/public/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        typing.remove();
        if (data.ok && data.reply) {
          renderPlainBotReply(data.reply);
        } else {
          renderNode('root', "Hmm, I couldn't quite get an answer for that — but here's what I can help with:");
        }
      })
      .catch(function() {
        typing.remove();
        renderNode('root', "Hmm, I'm having trouble connecting right now — but here's what I can help with:");
      });
  }

  function renderNode(key, introOverride) {
    var node = NODES[key];
    if (!node) return;

    var bubble = document.createElement('div');
    bubble.className = 'wf-bubble';
    bubble.textContent = introOverride || node.bot;
    body.appendChild(bubble);

    var opts = document.createElement('div');
    opts.className = 'wf-options';
    node.options.forEach(function(opt) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'wf-chip';
      chip.textContent = opt.label;
      chip.addEventListener('click', function() {
        if (opt.href) {
          window.open(opt.href, opt.href.indexOf('wa.me') !== -1 ? '_blank' : '_self');
          return;
        }
        if (opt.go === 'root') {
          body.innerHTML = '';
        }
        renderNode(opt.go);
        body.scrollTop = body.scrollHeight;
      });
      opts.appendChild(chip);
    });
    body.appendChild(opts);
    body.scrollTop = body.scrollHeight;
  }

  function handleTypedMessage() {
    var text = inputEl.value.trim();
    if (!text) return;
    addUserBubble(text);
    inputEl.value = '';

    var matchKey = findBestMatch(text);
    if (matchKey) {
      showTyping(function() { renderNode(matchKey); });
    } else {
      askAI(text);
    }
  }

  sendBtn.addEventListener('click', handleTypedMessage);
  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') handleTypedMessage();
  });

  renderNode('root');

  // ---------- 20-second "attention" popup (once per browser session) ----------
  var attentionPopup = document.getElementById('wfAttentionPopup');
  var attentionBackdrop = document.getElementById('wfAttentionBackdrop');
  var attentionOpenBtn = document.getElementById('wfAttentionOpen');
  var attentionDismissBtn = document.getElementById('wfAttentionDismiss');
  var STORAGE_KEY = 'wedeazzy_faqbot_intro_shown';

  function hideAttention() {
    attentionPopup.classList.remove('show');
    attentionBackdrop.classList.remove('show');
  }

  attentionOpenBtn.addEventListener('click', function() {
    hideAttention();
    openPanel();
  });
  attentionDismissBtn.addEventListener('click', hideAttention);
  attentionBackdrop.addEventListener('click', hideAttention);

  try {
    if (!sessionStorage.getItem(STORAGE_KEY)) {
      setTimeout(function() {
        // Don't interrupt if the user already opened the chat on their own.
        if (panelWindow.classList.contains('show')) return;
        attentionPopup.classList.add('show');
        attentionBackdrop.classList.add('show');
        sessionStorage.setItem(STORAGE_KEY, '1');

        // Auto-dismiss after a while if ignored.
        setTimeout(hideAttention, 7000);
      }, 20000);
    }
  } catch (e) { /* sessionStorage unavailable (privacy mode) — skip the popup */ }
})();
