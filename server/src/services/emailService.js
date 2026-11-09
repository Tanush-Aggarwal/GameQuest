/**
 * Creates the email delivery service backed by a Google Apps Script HTTPS mail relay.
 * Avoids outbound SMTP port blocking (ports 25, 465, 587) on cloud hosts like Render Free.
 * When unconfigured in development/test, logs safely without leaking credentials.
 */
export function createEmailService({
  config,
  logger = console,
  fetchFn = globalThis.fetch,
  timeoutMs = 20000, // Apps Script can take several seconds to start and send
}) {
  const { email, clientOrigin, env } = config;
  const { relayUrl, relaySecret } = email || {};
  const isConfigured = Boolean(relayUrl && relaySecret);

  // Helper to mask email for logging (e.g. j***n@example.com)
  function maskEmail(addr) {
    if (!addr || typeof addr !== 'string') return 'unknown';
    const [user, domain] = addr.split('@');
    if (!domain) return '***';
    const maskedUser = user.length <= 2 ? `${user[0]}*` : `${user[0]}***${user[user.length - 1]}`;
    return `${maskedUser}@${domain}`;
  }

  async function sendViaRelay({ to, subject, text, html }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secret: relaySecret,
          to,
          subject,
          text,
          html,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        logger.error?.(
          { status: response.status, recipient: maskEmail(to) },
          'Mail relay HTTP response not OK',
        );
        const err = new Error(`Mail relay HTTP ${response.status}`);
        err.name = 'MailRelayError';
        err.statusCode = response.status;
        throw err;
      }

      let payload;
      // Read the body once as text so an HTML error page can be logged (only its first characters).
      const raw = typeof response.text === 'function' ? await response.text().catch(() => null) : null;
      try {
        payload = raw === null ? await response.json() : JSON.parse(raw);
      } catch {
        // An HTML page here almost always means the Apps Script web app is not deployed with
        // "Who has access: Anyone", or MAIL_RELAY_URL is not the /exec URL of the current deployment.
        logger.error?.(
          {
            recipient: maskEmail(to),
            bodyStart: typeof raw === 'string' ? raw.slice(0, 120).replace(/\s+/g, ' ') : null,
          },
          'Mail relay returned invalid JSON (check the Apps Script deployment access is "Anyone")',
        );
        const err = new Error('Mail relay returned invalid JSON');
        err.name = 'MailRelayError';
        throw err;
      }

      if (!payload || payload.ok !== true) {
        const errorMsg = payload?.error || 'Mail relay rejected delivery';
        logger.error?.(
          { err: { message: errorMsg }, recipient: maskEmail(to) },
          'Mail relay reported delivery failure',
        );
        const err = new Error(errorMsg);
        err.name = 'MailRelayError';
        throw err;
      }

      logger.info?.({ recipient: maskEmail(to) }, 'Email successfully dispatched via mail relay');
      return { sent: true };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        logger.error?.(
          { recipient: maskEmail(to), timeoutMs },
          'Mail relay request timed out',
        );
        const timeoutErr = new Error(`Mail relay request timed out after ${timeoutMs}ms`);
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      }
      if (err.name !== 'MailRelayError') {
        logger.error?.(
          { err: { name: err.name, message: err.message }, recipient: maskEmail(to) },
          'Mail relay network request failed',
        );
      }
      throw err;
    }
  }

  return {
    isConfigured() {
      return isConfigured;
    },

    async sendPasswordResetEmail({ to, username, token }) {
      const resetUrl = `${clientOrigin}/reset-password?token=${encodeURIComponent(token)}`;
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

      if (isConfigured) {
        return sendViaRelay({
          to,
          subject,
          text: textBody,
          html: htmlBody,
        });
      }

      // Safe local development & test fallback (never active in production)
      if (env === 'development') {
        console.log('\n=============================================================');
        console.log('📧 [DEV EMAIL SIMULATION] Password reset dispatched!');
        console.log(`   Recipient: ${maskEmail(to)}`);
        console.log(`   Reset Link: ${resetUrl}`);
        console.log('   (To send real emails to your inbox, configure MAIL_RELAY_URL & MAIL_RELAY_SECRET in server/.env)');
        console.log('=============================================================\n');
        logger.info?.(
          { recipient: maskEmail(to), devResetUrl: resetUrl },
          'Password reset requested (Mail relay unconfigured; set MAIL_RELAY_URL in .env for real delivery)',
        );
        return { sent: false, devResetUrl: resetUrl };
      }

      if (env === 'test') {
        return { sent: false, testToken: token };
      }

      // Production without configured email provider
      logger.warn?.({ recipient: maskEmail(to) }, 'Cannot send password reset: Mail relay is not configured in production');
      return { sent: false };
    },

    async sendVerificationEmail({ to, username, code }) {
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

      if (isConfigured) {
        return sendViaRelay({
          to,
          subject,
          text: textBody,
          html: htmlBody,
        });
      }

      if (env === 'development') {
        console.log('\n=============================================================');
        console.log('📧 [DEV EMAIL SIMULATION] Email verification code dispatched!');
        console.log(`   Recipient: ${maskEmail(to)}`);
        console.log(`   Verification Code: ${code}`);
        console.log('   (To send real emails to your inbox, configure MAIL_RELAY_URL & MAIL_RELAY_SECRET in server/.env)');
        console.log('=============================================================\n');
        logger.info?.(
          { recipient: maskEmail(to) },
          'Email verification code requested (Mail relay unconfigured; set MAIL_RELAY_URL in .env for real delivery)',
        );
        return { sent: false };
      }

      if (env === 'test') {
        return { sent: false, testCode: code };
      }

      logger.warn?.({ recipient: maskEmail(to) }, 'Cannot send verification email: Mail relay is not configured in production');
      return { sent: false };
    },

    // Sent when someone signs up with an email that already has an account. The sign-up page answers the same
    // way for new and taken emails, so only the owner of the inbox learns the account exists.
    async sendAccountExistsEmail({ to, username }) {
      const loginUrl = `${clientOrigin}/login`;
      const resetUrl = `${clientOrigin}/forgot-password`;
      const subject = 'You already have a GameQuest account';
      const textBody = `Hi ${username || 'Player'},

Someone (hopefully you) just tried to create a new GameQuest account with this email address, but it already has an account.

Log in: ${loginUrl}
Forgot your password? ${resetUrl}

If this wasn't you, you can ignore this email. Nothing about your account has changed.

— The GameQuest Team`;
      const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#F2EEE4;margin:0;padding:24px;color:#111311;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;border:1px solid #E2DCD0;padding:32px;">
    <div style="font-size:22px;font-weight:800;margin-bottom:24px;">Game<span style="color:#84a82a;">Quest</span></div>
    <h2 style="margin-top:0;font-size:20px;">You already have an account</h2>
    <p>Hi ${username || 'Player'},</p>
    <p>Someone (hopefully you) just tried to create a new GameQuest account with this email address, but it already has one.</p>
    <p><a href="${loginUrl}" style="display:inline-block;background:#111311;color:#FFFFFF;font-weight:600;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:8px;">Log in</a></p>
    <p style="font-size:13px;color:#687063;">Forgot your password? <a href="${resetUrl}" style="color:#687063;">Reset it here</a>.</p>
    <p style="font-size:13px;color:#687063;border-top:1px solid #F0EBE0;padding-top:16px;margin-top:24px;">If this wasn't you, you can ignore this email. Nothing about your account has changed.</p>
  </div>
</body>
</html>`;
      if (isConfigured) return sendViaRelay({ to, subject, text: textBody, html: htmlBody });
      if (env === 'development') {
        console.log(`\n📧 [DEV EMAIL SIMULATION] "Account already exists" email to ${maskEmail(to)}\n`);
        return { sent: false };
      }
      if (env === 'test') return { sent: false };
      logger.warn?.({ recipient: maskEmail(to) }, 'Cannot send account-exists email: Mail relay unconfigured in production');
      return { sent: false };
    },

    async sendPasswordChangedNotification({ to, username }) {
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

      if (isConfigured) {
        return sendViaRelay({
          to,
          subject,
          text: textBody,
          html: htmlBody,
        });
      }

      if (env === 'development' || env === 'test') {
        logger.info?.({ recipient: maskEmail(to) }, 'Password changed notification simulated');
        return { sent: false };
      }

      logger.warn?.({ recipient: maskEmail(to) }, 'Cannot send password change notification: Mail relay unconfigured in production');
      return { sent: false };
    },
  };
}
