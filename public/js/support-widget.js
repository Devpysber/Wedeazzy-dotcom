(function() {
  // Prevent duplicate initialization
  if (document.getElementById('wedeazzy-support-widget')) return;

  // 1. Inject Styles
  const style = document.createElement('style');
  style.innerHTML = `
    /* Floating Support Trigger Button */
    .we-support-trigger {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #D12653 0%, #0E1726 100%);
      box-shadow: 0 8px 24px rgba(209, 38, 83, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 10000;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      border: 2px solid rgba(255, 255, 255, 0.2);
    }
    .we-support-trigger:hover {
      transform: scale(1.1) rotate(5deg);
      box-shadow: 0 12px 30px rgba(209, 38, 83, 0.6);
    }
    .we-support-trigger svg {
      width: 28px;
      height: 28px;
      fill: #fff;
    }
    .we-support-trigger .badge-pulse {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #10B981;
      border: 2px solid #fff;
      animation: we-pulse 2s infinite;
    }

    /* Glassmorphic Support Panel */
    .we-support-panel {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 360px;
      height: 480px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.4);
      box-shadow: 0 12px 40px rgba(14, 23, 38, 0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 10000;
      transform: translateY(20px) scale(0.95);
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .we-support-panel.show {
      transform: translateY(0) scale(1);
      opacity: 1;
      pointer-events: auto;
    }

    /* Header styling */
    .we-support-header {
      background: linear-gradient(135deg, #0E1726 0%, #1e293b 100%);
      color: #fff;
      padding: 20px;
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .we-support-header h3 {
      margin: 0;
      font-family: 'Inter', sans-serif;
      font-size: 16px;
      font-weight: 700;
      color: #fff;
    }
    .we-support-header p {
      margin: 2px 0 0;
      font-size: 11px;
      color: #FFA6B2;
      font-weight: 500;
    }
    .we-support-close {
      position: absolute;
      top: 20px;
      right: 20px;
      background: none;
      border: none;
      color: #fff;
      font-size: 18px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s;
    }
    .we-support-close:hover {
      opacity: 1;
    }

    /* Chat Messages Body */
    .we-support-body {
      flex-grow: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: rgba(255, 240, 242, 0.3);
    }
    .we-bubble {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13px;
      line-height: 1.5;
    }
    .we-bubble.system {
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(209, 38, 83, 0.15);
      color: #334155;
      align-self: flex-start;
      border-top-left-radius: 0;
    }

    /* Action Chips */
    .we-action-label {
      font-size: 11px;
      font-weight: 700;
      color: #D12653;
      margin: 6px 0 2px 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .we-action-chips {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
    }
    .we-chip {
      background: #ffffff;
      border: 1px solid rgba(209, 38, 83, 0.2);
      color: #0E1726;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .we-chip:hover {
      background: rgba(209, 38, 83, 0.05);
      border-color: #D12653;
      transform: translateX(4px);
    }

    /* Input Footer */
    .we-support-footer {
      padding: 12px;
      border-top: 1px solid rgba(209, 38, 83, 0.1);
      display: flex;
      gap: 8px;
      background: #ffffff;
    }
    .we-support-input {
      flex-grow: 1;
      border: 1px solid rgba(14, 23, 38, 0.15);
      border-radius: 10px;
      padding: 8px 12px;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }
    .we-support-input:focus {
      border-color: #D12653;
    }
    .we-support-send {
      background: #25D366;
      border: none;
      color: #fff;
      padding: 8px 16px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .we-support-send:hover {
      background: #20ba59;
    }

    @keyframes we-pulse {
      0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
      100% { transform: scale(1); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  // 2. Create DOM Widget Structure
  const widget = document.createElement('div');
  widget.id = 'wedeazzy-support-widget';
  
  widget.innerHTML = `
    <!-- Trigger Floating Button -->
    <div class="we-support-trigger" id="weTriggerBtn" title="Contact WedEazzy Support">
      <div class="badge-pulse"></div>
      <svg viewBox="0 0 24 24">
        <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>
      </svg>
    </div>

    <!-- Chat Panel Window -->
    <div class="we-support-panel" id="wePanelWindow">
      <div class="we-support-header">
        <div style="width: 10px; height: 10px; border-radius: 50%; background: #10B981; margin-right: 4px;"></div>
        <div>
          <h3>WedEazzy Concierge</h3>
          <p>Typically replies instantly on WhatsApp</p>
        </div>
        <button class="we-support-close" id="weCloseBtn">✕</button>
      </div>

      <div class="we-support-body">
        <div class="we-bubble system">
          ✨ Namaste! Welcome to WedEazzy Concierge. How can we make your wedding planning simple today?
        </div>
        
        <div class="we-action-label">Quick Support Links</div>
        <div class="we-action-chips">
          <div class="we-chip" data-msg="Hi WedEazzy, I want to check wedding venue availability and catering quotes.">
            <span>🏛️</span> Venue Availability & Quotes
          </div>
          <div class="we-chip" data-msg="Hi WedEazzy, I'd like to check packages for cinematic photographers and videographers.">
            <span>📸</span> Photographer Packages
          </div>
          <div class="we-chip" data-msg="Hi WedEazzy, I need assistance registering and promoting my business listing.">
            <span>💻</span> List My Business Support
          </div>
          <div class="we-chip" data-msg="Hi WedEazzy, I want to book a free consultation call with a dedicated wedding planner.">
            <span>🗓️</span> Talk to a Wedding Planner
          </div>
        </div>
      </div>

      <div class="we-support-footer">
        <input type="text" class="we-support-input" id="weSupportInput" placeholder="Ask anything..." />
        <button class="we-support-send" id="weSendBtn">Chat</button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  // 3. Register Action Logic
  const triggerBtn = document.getElementById('weTriggerBtn');
  const panelWindow = document.getElementById('wePanelWindow');
  const closeBtn = document.getElementById('weCloseBtn');
  const sendBtn = document.getElementById('weSendBtn');
  const supportInput = document.getElementById('weSupportInput');
  const chips = document.querySelectorAll('.we-chip');

  const WHATSAPP_NUM = '917498987620';

  const togglePanel = () => {
    panelWindow.classList.toggle('show');
  };

  triggerBtn.addEventListener('click', togglePanel);
  closeBtn.addEventListener('click', () => panelWindow.classList.remove('show'));

  // Custom inquiry send handler
  const sendCustomMessage = () => {
    const text = supportInput.value.trim();
    if (!text) return;
    const url = `https://wa.me/${WHATSAPP_NUM}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    supportInput.value = '';
    panelWindow.classList.remove('show');
  };

  sendBtn.addEventListener('click', sendCustomMessage);
  supportInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendCustomMessage();
  });

  // Action chips click handler
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const msg = chip.getAttribute('data-msg');
      const url = `https://wa.me/${WHATSAPP_NUM}?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank');
      panelWindow.classList.remove('show');
    });
  });
})();
