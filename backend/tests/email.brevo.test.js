// With BREVO_API_KEY set, sendMail must go through Brevo's HTTP API (not SMTP)
// and keep the same never-throws { ok, messageId } / { ok: false, error } contract.
process.env.BREVO_API_KEY = 'xkeysib-test';
process.env.SMTP_FROM = 'WedEazzy <info@wedeazzy.com>';

const { sendMail } = require('../src/services/email.service');

describe('email service sendMail via Brevo', () => {
  afterEach(() => { delete global.fetch; });

  it('posts a transactional email and returns the Brevo messageId', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: '<abc@smtp-relay.mailin.fr>' }),
    });

    const result = await sendMail({
      to: 'a@example.com, b@example.com',
      subject: 'OTP',
      html: '<p>123456</p>',
      text: '123456',
    });

    expect(result).toEqual({ ok: true, messageId: '<abc@smtp-relay.mailin.fr>' });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(opts.headers['api-key']).toBe('xkeysib-test');
    expect(JSON.parse(opts.body)).toEqual({
      sender: { name: 'WedEazzy', email: 'info@wedeazzy.com' },
      to: [{ email: 'a@example.com' }, { email: 'b@example.com' }],
      subject: 'OTP',
      htmlContent: '<p>123456</p>',
      textContent: '123456',
    });
  });

  it('returns a structured failure when Brevo rejects the request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'unauthorized', message: 'Key not found' }),
    });

    const result = await sendMail({ to: 'a@example.com', subject: 'OTP', text: 'x' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Key not found');
  });
});
