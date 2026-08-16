/**
 * Server-side proxy to NVIDIA NIM's OpenAI-compatible chat completions API,
 * used as the public FAQ chatbot's free-text fallback for questions that
 * don't match a canned topic. The API key lives only here (env var) and is
 * never sent to the browser — the frontend only ever talks to our own
 * /api/public/chatbot endpoint.
 */

const env = require('../config/env');
const logger = require('../config/logger');

const NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NIM_MODEL = process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-8b-instruct';

const SYSTEM_PROMPT = `You are the WedEazzy Help Bot, a friendly assistant on WedEazzy.com — India's wedding vendor marketplace.
Facts about WedEazzy (use these, don't invent others):
- 100% free for couples, zero booking fees, always.
- Couples browse verified vendors (banquet halls, photographers, caterers, decorators, makeup artists, pandits, invitations, and more) by city or category.
- Every vendor profile has a direct WhatsApp chat button — couples contact vendors directly, no middleman.
- There is no in-app booking/payment; couples finalize everything directly with the vendor.
- Vendors can list their business via the "Become a Vendor" / "List Your Business" page.
- Admin/support can be reached via WhatsApp for anything the bot can't help with.
Keep replies short (2-4 sentences), warm, and helpful. If asked something unrelated to weddings or the platform, gently steer back to how you can help with wedding planning on WedEazzy.`;

/**
 * @param {string} userMessage
 * @returns {Promise<{ok: boolean, reply?: string, error?: string}>}
 */
async function askChatbot(userMessage) {
  if (!env.NVIDIA_NIM_API_KEY) {
    return { ok: false, error: 'Chat assistant is not configured.' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(NIM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.NVIDIA_NIM_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.5,
        max_tokens: 200,
        stream: false,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error({ status: res.status, body }, '[chatbot] NVIDIA NIM request failed');
      return { ok: false, error: 'Chat assistant is temporarily unavailable.' };
    }

    const data = await res.json();
    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!reply) {
      return { ok: false, error: 'Chat assistant returned an empty response.' };
    }

    return { ok: true, reply: reply.trim() };
  } catch (err) {
    logger.error({ err }, '[chatbot] NVIDIA NIM request errored');
    return { ok: false, error: 'Chat assistant is temporarily unavailable.' };
  }
}

module.exports = { askChatbot };
