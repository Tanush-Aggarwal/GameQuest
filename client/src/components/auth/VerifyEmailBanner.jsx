import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailWarning, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.js';

const DISMISS_KEY = 'gq-verify-banner-dismissed';

function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

// Shown to signed-in players whose email is not verified yet. Logging in never needs it; a verified email
// is what lets them reset a forgotten password. Hidden for the rest of the browser session once dismissed.
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(readDismissed);
  if (!user || user.emailVerified !== false || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Storage blocked: the banner just comes back on the next visit.
    }
  }

  return (
    <div
      role="status"
      className="mx-4 mt-3 flex items-center gap-3 rounded-card border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-sm sm:mx-6 lg:mx-8"
    >
      <MailWarning className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-text-muted">
        Verify your email so you can reset your password if you ever forget it.{' '}
        <Link
          to={`/verify-email?email=${encodeURIComponent(user.email ?? '')}`}
          className="font-semibold text-text underline underline-offset-2"
        >
          Verify now
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="rounded-control p-1 text-text-muted hover:text-text"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
