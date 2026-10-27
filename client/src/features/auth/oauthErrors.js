// The API sends people back to /login?error=<code> when Google sign-in cannot finish. Each message says what happened and what to do.
const MESSAGES = {
  google_unavailable: 'Google sign-in is not set up on this server yet. Log in with your email and password.',
  google_cancelled: 'Google sign-in was cancelled. Try again, or log in with your email and password.',
  google_state: 'The Google sign-in expired before it finished. Try again.',
  google_email_exists: 'An account with that email already exists. Log in with your email and password.',
  google_unverified: 'Google did not confirm your email address. Use a Google account with a verified email, or log in with your password.',
  google_failed: 'Google sign-in failed. Try again in a moment.',
};

export function oauthErrorMessage(code) {
  return MESSAGES[code] ?? '';
}
