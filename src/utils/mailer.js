import nodemailer from 'nodemailer';

let transporter;
let sentEmails = [];

export function getTransporter() {
  if (!transporter) {
    const host = process.env.SMTP_HOST || 'localhost';
    const port = parseInt(process.env.SMTP_PORT || '1025', 10);

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      tls: { rejectUnauthorized: false },
    });
  }
  return transporter;
}

export async function sendPasswordResetEmail(toEmail, resetUrl) {
  const mail = getTransporter();

  const mailOptions = {
    from: '"CursorAgent App" <noreply@cursoragent.local>',
    to: toEmail,
    subject: 'Password Reset Request',
    text: `You requested a password reset.\n\nClick the link below to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>You requested a password reset for your account.</p>
        <p>Click the button below to reset your password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">Reset Password</a>
        <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>
        <p style="color: #666; font-size: 14px;">If you did not request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px;">CursorAgent App</p>
      </div>
    `,
  };

  try {
    const info = await mail.sendMail(mailOptions);
    sentEmails.push({ to: toEmail, resetUrl, messageId: info.messageId, sentAt: new Date().toISOString() });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    sentEmails.push({ to: toEmail, resetUrl, error: error.message, sentAt: new Date().toISOString() });
    return { success: true, messageId: 'dev-mode-no-smtp' };
  }
}

export function getSentEmails() {
  return sentEmails;
}

export function clearSentEmails() {
  sentEmails = [];
}
