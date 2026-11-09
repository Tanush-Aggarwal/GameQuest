// Sends one test email through the mail relay, using MAIL_RELAY_URL and MAIL_RELAY_SECRET from server/.env
// (or the shell). Run it with the same values you put on Render to check the relay before blaming the app:
//   npm run mail:test -w server -- you@example.com
import { createEmailService } from '../src/services/emailService.js';

const to = process.argv[2];
if (!to || !to.includes('@')) {
  console.error('Usage: npm run mail:test -w server -- you@example.com');
  process.exit(1);
}
const relayUrl = process.env.MAIL_RELAY_URL;
const relaySecret = process.env.MAIL_RELAY_SECRET;
if (!relayUrl || !relaySecret) {
  console.error('MAIL_RELAY_URL and MAIL_RELAY_SECRET must both be set (server/.env or the shell).');
  process.exit(1);
}
if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(relayUrl)) {
  console.warn('Warning: MAIL_RELAY_URL usually looks like https://script.google.com/macros/s/<id>/exec');
}

const logger = {
  info: (o, m) => console.log('info:', m ?? o),
  warn: (o, m) => console.warn('warn:', m ?? o, m ? o : ''),
  error: (o, m) => console.error('error:', m ?? o, m ? JSON.stringify(o) : ''),
};
const service = createEmailService({
  config: { env: 'production', clientOrigin: 'https://example.invalid', email: { relayUrl, relaySecret } },
  logger,
});

try {
  const started = Date.now();
  await service.sendVerificationEmail({ to, username: 'Relay test', code: '123456' });
  console.log(`OK: the relay accepted the email in ${Date.now() - started} ms. Check the inbox (and spam) of ${to}.`);
} catch (err) {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
}
