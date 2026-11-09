/**
 * Makes an account an administrator (or takes it away). Use it once to create the first administrator; after that,
 * administrators can manage roles from the Admin page.
 *
 * Usage: npm run admin:grant -w server -- you@example.com            (make admin)
 *        npm run admin:grant -w server -- you@example.com --revoke   (back to a regular player)
 * The person logs out and in again (or waits up to 15 minutes) for the change to reach their session.
 */
import mongoose from 'mongoose';
import { loadConfig } from '../src/config/index.js';
import { User } from '../src/models/User.js';

const email = process.argv.slice(2).find((a) => a.includes('@'))?.toLowerCase().trim();
const revoke = process.argv.includes('--revoke');
if (!email) {
  console.error('Usage: npm run admin:grant -w server -- you@example.com [--revoke]');
  process.exit(1);
}

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

try {
  await mongoose.connect(config.mongoUri);
  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No account with the email ${email}.`);
    process.exitCode = 1;
  } else {
    user.role = revoke ? 'user' : 'admin';
    await user.save();
    console.log(`${user.username} (${email}) is now ${revoke ? 'a regular player' : 'an administrator'}. Log out and in again to see the change.`);
  }
} finally {
  await mongoose.disconnect();
}
