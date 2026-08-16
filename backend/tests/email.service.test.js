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
