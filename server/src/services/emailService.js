import { Resend } from 'resend';

/**
 * Creates the email delivery service backed by Resend's HTTPS API.
 * Avoids outbound SMTP port blocking (ports 25, 465, 587) on cloud platforms like Render Free.
 * When unconfigured in development/test, logs safely without leaking credentials.
 */
export function createEmailService({ config, logger = console, resendClient = null }) {
  const { email, clientOrigin, env } = config;
  const apiKey = email?.resendApiKey;
  const isConfigured = Boolean(resendClient || apiKey);

  let resend = resendClient;
  if (!resend && apiKey) {
    resend = new Resend(apiKey);
  }

  const defaultFrom = email?.from || 'GameQuest <onboarding@resend.dev>';

  // Helper to mask email for logging (e.g. j***n@example.com)
  function maskEmail(addr) {
    if (!addr || typeof addr !== 'string') return 'unknown';
    const [user, domain] = addr.split('@');
    if (!domain) return '***';
    const maskedUser = user.length <= 2 ? `${user[0]}*` : `${user[0]}***${user[user.length - 1]}`;
    return `${maskedUser}@${domain}`;
  }

  return {
    isConfigured() {
      return isConfigured;
    },

    async sendPasswordResetEmail({ to, username, token }) {
      const resetUrl = `${clientOrigin}/reset-password?token=${encodeURIComponent(token)}`;
      const from = defaultFrom;
      const subject = 'Reset your GameQuest password';

      const textBody = `Hi ${username || 'Player'},

We received a request to reset your GameQuest password.

To set a new password, visit the link below:
${resetUrl}

This link is valid for 1 hour and can only be used once.

If you didn't request a password reset, you can safely ignore this email — your account remains secure.

— The GameQuest Team`;

      const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Reset your GameQuest password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F2EEE4; margin: 0; padding: 24px; color: #111311; }
    .card { max-width: 520px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E2DCD0; padding: 32px; }
    .logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 24px; color: #111311; }
    .logo span { color: #84a82a; }
    .btn { display: inline-block; background-color: #111311; color: #FFFFFF !important; font-weight: 600; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin: 20px 0; }
    .note { font-size: 13px; color: #687063; line-height: 1.5; margin-top: 24px; border-top: 1px solid #F0EBE0; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Game<span>Quest</span></div>
    <h2 style="margin-top: 0; font-size: 20px;">Reset your password</h2>
    <p>Hi ${username || 'Player'},</p>
    <p>We received a request to reset your password. Click the button below to choose a new password:</p>
    <p><a href="${resetUrl}" class="btn">Reset Password</a></p>
    <p style="font-size: 13px; color: #687063;">This link expires in <strong>1 hour</strong> and can only be used once.</p>
    <p style="font-size: 12px; color: #888888; word-break: break-all; margin-top: 16px;">
      Button not working? Copy and paste this link into your browser:<br/>
      <a href="${resetUrl}" style="color: #687063;">${resetUrl}</a>
    </p>
    <p class="note">If you didn't make this request, you can safely ignore this email. Your password will not change until you access the link above and create a new one.</p>
  </div>
</body>
</html>`;

      if (resend) {
        try {
          const { data, error } = await resend.emails.send({
            from,
            to,
            subject,
            text: textBody,
            html: htmlBody,
          });

          if (error) {
            logger.error?.(
              { err: { name: error.name, message: error.message }, recipient: maskEmail(to) },
              'Failed to send password reset email via Resend',
            );
            const sendErr = new Error(error.message || 'Resend delivery rejected');
            sendErr.name = error.name || 'ResendError';
            sendErr.statusCode = error.statusCode;
            throw sendErr;
          }

          logger.info?.({ id: data?.id, recipient: maskEmail(to) }, 'Password reset email sent');
          return { sent: true, id: data?.id };
        } catch (err) {
          if (!err.name || err.name !== 'ResendError') {
            logger.error?.(
              { err: { name: err.name, message: err.message }, recipient: maskEmail(to) },
              'Failed to send password reset email via Resend',
            );
          }
          throw err;
        }
      }

      // Safe local development & test fallback (never active in production)
      if (env === 'development') {
        console.log('\n=============================================================');
        console.log('📧 [DEV EMAIL SIMULATION] Password reset dispatched!');
        console.log(`   Recipient: ${maskEmail(to)}`);
        console.log(`   Reset Link: ${resetUrl}`);
        console.log('   (To send real emails to your inbox, configure RESEND_API_KEY in server/.env)');
        console.log('=============================================================\n');
        logger.info?.(
          { recipient: maskEmail(to), devResetUrl: resetUrl },
          'Password reset requested (Resend unconfigured; set RESEND_API_KEY in .env for real delivery)',
        );
        return { sent: false, devResetUrl: resetUrl };
      }

      if (env === 'test') {
        return { sent: false, testToken: token };
      }

      // Production without configured email provider
      logger.warn?.({ recipient: maskEmail(to) }, 'Cannot send password reset: Resend provider is not configured in production');
      return { sent: false };
    },

    async sendVerificationEmail({ to, username, code }) {
      const from = defaultFrom;
      const subject = `Your GameQuest verification code is ${code}`;

      const textBody = `Hi ${username || 'Player'},

Welcome to GameQuest! Use the 6-digit code below to verify your email address and activate your account:

${code}

This code expires in 10 minutes.

If you didn't create a GameQuest account, you can safely ignore this email.

— The GameQuest Team`;

      const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Your GameQuest verification code</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F2EEE4; margin: 0; padding: 24px; color: #111311; }
    .card { max-width: 520px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E2DCD0; padding: 32px; }
    .logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 24px; color: #111311; }
    .logo span { color: #84a82a; }
    .code-box { background-color: #F8F5EE; border: 1px solid #E2DCD0; border-radius: 8px; padding: 18px 24px; margin: 24px 0; text-align: center; }
    .code { font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #111311; }
    .note { font-size: 13px; color: #687063; line-height: 1.5; margin-top: 24px; border-top: 1px solid #F0EBE0; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Game<span>Quest</span></div>
    <h2 style="margin-top: 0; font-size: 20px;">Email Verification</h2>
    <p>Hi ${username || 'Player'},</p>
    <p>Welcome to GameQuest! Use the 6-digit code below to verify your email address and activate your account:</p>
    <div class="code-box">
      <div class="code">${code}</div>
    </div>
    <p style="font-size: 13px; color: #687063;">This code expires in <strong>10 minutes</strong>.</p>
    <p class="note">If you did not sign up for a GameQuest account, you can safely ignore this message.</p>
  </div>
</body>
</html>`;

      if (resend) {
        try {
          const { data, error } = await resend.emails.send({
            from,
            to,
            subject,
            text: textBody,
            html: htmlBody,
          });

          if (error) {
            logger.error?.(
              { err: { name: error.name, message: error.message }, recipient: maskEmail(to) },
              'Failed to send verification email via Resend',
            );
            const sendErr = new Error(error.message || 'Resend delivery rejected');
            sendErr.name = error.name || 'ResendError';
            sendErr.statusCode = error.statusCode;
            throw sendErr;
          }

          logger.info?.({ id: data?.id, recipient: maskEmail(to) }, 'Verification email code sent');
          return { sent: true, id: data?.id };
        } catch (err) {
          if (!err.name || err.name !== 'ResendError') {
            logger.error?.(
              { err: { name: err.name, message: err.message }, recipient: maskEmail(to) },
              'Failed to send verification email via Resend',
            );
          }
          throw err;
        }
      }

      if (env === 'development') {
        console.log('\n=============================================================');
        console.log('📧 [DEV EMAIL SIMULATION] Email verification code dispatched!');
        console.log(`   Recipient: ${maskEmail(to)}`);
        console.log(`   Verification Code: ${code}`);
        console.log('   (To send real emails to your inbox, configure RESEND_API_KEY in server/.env)');
        console.log('=============================================================\n');
        logger.info?.(
          { recipient: maskEmail(to) },
          'Email verification code requested (Resend unconfigured; set RESEND_API_KEY in .env for real delivery)',
        );
        return { sent: false };
      }

      if (env === 'test') {
        return { sent: false, testCode: code };
      }

      logger.warn?.({ recipient: maskEmail(to) }, 'Cannot send verification email: Resend provider is not configured in production');
      return { sent: false };
    },

    async sendPasswordChangedNotification({ to, username }) {
      const from = defaultFrom;
      const subject = 'Your GameQuest password was changed';

      const textBody = `Hi ${username || 'Player'},

The password for your GameQuest account was recently changed.

All existing active sessions have been revoked. If you made this change, you can safely ignore this email.

If you did NOT change your password, please reset your password immediately or contact support.

— The GameQuest Team`;

      const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Your GameQuest password was changed</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F2EEE4; margin: 0; padding: 24px; color: #111311; }
    .card { max-width: 520px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E2DCD0; padding: 32px; }
    .logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 24px; color: #111311; }
    .logo span { color: #84a82a; }
    .warning { color: #B8420E; font-weight: 600; }
    .note { font-size: 13px; color: #687063; line-height: 1.5; margin-top: 24px; border-top: 1px solid #F0EBE0; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Game<span>Quest</span></div>
    <h2 style="margin-top: 0; font-size: 20px;">Your password was changed</h2>
    <p>Hi ${username || 'Player'},</p>
    <p>The password for your GameQuest account was recently changed. All active sessions have been revoked for your security.</p>
    <p class="warning">If you did not make this change, please reset your password immediately to protect your account.</p>
    <p class="note">If you made this change, no further action is necessary.</p>
  </div>
</body>
</html>`;

      if (resend) {
        try {
          const { data, error } = await resend.emails.send({
            from,
            to,
            subject,
            text: textBody,
            html: htmlBody,
          });

          if (error) {
            logger.error?.(
              { err: { name: error.name, message: error.message }, recipient: maskEmail(to) },
              'Failed to send password changed notification via Resend',
            );
            const sendErr = new Error(error.message || 'Resend delivery rejected');
            sendErr.name = error.name || 'ResendError';
            sendErr.statusCode = error.statusCode;
            throw sendErr;
          }

          logger.info?.({ id: data?.id, recipient: maskEmail(to) }, 'Password changed notification sent');
          return { sent: true, id: data?.id };
        } catch (err) {
          if (!err.name || err.name !== 'ResendError') {
            logger.error?.(
              { err: { name: err.name, message: err.message }, recipient: maskEmail(to) },
              'Failed to send password changed notification via Resend',
            );
          }
          throw err;
        }
      }

      if (env === 'development' || env === 'test') {
        logger.info?.({ recipient: maskEmail(to) }, 'Password changed notification simulated');
        return { sent: false };
      }

      logger.warn?.({ recipient: maskEmail(to) }, 'Cannot send password change notification: Resend unconfigured in production');
      return { sent: false };
    },
  };
}
