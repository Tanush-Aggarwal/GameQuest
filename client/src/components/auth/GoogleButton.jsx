import { Link } from 'react-router-dom';
import { api } from '@/services/api.js';
import { buttonVariants } from '@/components/ui/button.jsx';
import { cn } from '@/lib/utils.js';

// "Continue with Google" is a full-page link to the API, which sends the browser to Google and brings it back signed in.
// A link, not a button: it navigates, and middle-click or "open in new tab" behave as people expect.
export function GoogleButton({ className }) {
  const base = String(api.defaults.baseURL ?? '/api/v1').replace(/\/+$/, '');
  return (
    <div className="flex flex-col gap-2">
      <a href={`${base}/auth/google`} className={cn(buttonVariants({ variant: 'secondary' }), 'gap-3 font-semibold', className)}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
        </svg>
        Continue with Google
      </a>
      <p data-testid="google-terms-notice" className="text-center text-xs text-text-muted">
        By continuing you agree to the{' '}
        <Link to="/terms" className="text-text underline underline-offset-4">
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="text-text underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}