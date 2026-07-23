const nodemailer = require('nodemailer');

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');

  if (!user || !pass) {
    return null;
  }

  if (!host || host.includes('gmail')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass
      }
    });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: {
      user,
      pass
    }
  });
}

async function sendPasswordResetEmail({ to, code }) {
  const transporter = createTransporter();
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@pancreascan.local';

  if (!transporter) {
    console.warn('SMTP is not configured. Reset code was not emailed.');
    console.warn(`Password reset code for ${to}: ${code}`);
    return { ok: false, reason: 'smtp-unconfigured', detail: 'SMTP is not configured. Using local fallback.' };
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: 'PancreaScan password reset code',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>Password reset request</h2>
          <p>Use the following 6-digit code to reset your PancreaScan password:</p>
          <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${code}</p>
          <p>This code expires in 15 minutes.</p>
        </div>
      `
    });

    return { ok: true, messageId: info.messageId };
  } catch (error) {
    console.error('SMTP send failed:', error.message);
    return { ok: false, reason: 'smtp-send-failed', detail: error.message };
  }
}

module.exports = {
  sendPasswordResetEmail
};
