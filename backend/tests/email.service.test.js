// getTransporter() returns null when SMTP credentials are absent, and sendMail
// then takes its console-logging dev fallback and reports { ok: true }. Without
// these the mocked rejection below was never reached, so the test failed while
// appearing to check the failure path. Set before requiring the service, which
// reads config at module load.
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASS = 'test-password';

jest.mock('nodemailer', () => {
  return {
    createTransport: jest.fn(() => ({
      sendMail: jest.fn().mockRejectedValue(new Error('Invalid login')),
    })),
  };
});

const { sendMail } = require('../src/services/email.service');

describe('email service sendMail', () => {
  it('returns a structured SMTP failure when the mailer rejects', async () => {
    const result = await sendMail({
      to: 'admin@example.com',
      subject: 'OTP',
      text: 'Your code',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid login');
    expect(result.smtpError).toBe('Invalid login');
  });
});
