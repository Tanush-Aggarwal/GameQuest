import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorInfo } from '@/services/api.js';
import { resendVerification } from '@/services/authApi.js';
import { Button } from '@/components/ui/button.jsx';
import { FormField } from '@/components/ui/form-field.jsx';
import { CoverCollage } from '@/components/auth/CoverCollage.jsx';
import {
  GameControllerEmblem,
  GameQuestWordmark,
  GameQuestTagline,
  GameQuestHighlights,
} from '@/components/auth/GameQuestWordmark.jsx';

function fieldErrorsFromZod(issues) {
  const out = {};
  for (const i of issues) out[i.path.join('.')] ??= i.message;
  return out;
}

// Shared by the login and register pages: Zod validation (same schemas as the API), field
// errors, a pending state and a form-level error for failures that aren't about one field.
export function AuthForm({
  title,
  submitLabel,
  fields,
  schema,
  onSubmit,
  footer,
  termsCheckbox,
  oauth = null,
  initialError = '',
  forgotPasswordHref = null,
}) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, ''])));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(initialError);
  const [pending, setPending] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendPending, setResendPending] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleResendVerification() {
    if (!unverifiedEmail || resendCooldown > 0 || resendPending) return;
    setResendPending(true);
    try {
      await resendVerification({ email: unverifiedEmail });
      setResendCooldown(60);
      toast.success('Verification code sent! Please check your inbox.');
    } catch (err) {
      const info = getErrorInfo(err);
      toast.error(info.message || 'Unable to resend verification code.');
    } finally {
      setResendPending(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    setUnverifiedEmail('');
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error.issues));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      const info = getErrorInfo(err);
      if (info.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(info.details?.email || values.email);
        setFormError(info.message);
      } else if (Array.isArray(info.details)) {
        setErrors(Object.fromEntries(info.details.map((d) => [d.path, d.message])));
      } else if (info.details?.field) {
        setErrors({ [info.details.field]: info.message });
      } else if (info.code === 'RATE_LIMITED') {
        toast.error(info.message);
        setFormError(info.message);
      } else {
        setFormError(info.message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="isolate min-h-screen md:grid md:grid-cols-[minmax(0,1fr)_30rem]">
      <CoverCollage />
      <section className="relative hidden min-h-screen flex-col justify-end p-10 md:flex md:p-12 lg:p-16">
        {/* Layered cinematic scrim: deep solid base behind branding, smooth middle transition, vibrant clear artwork above */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c0e0c] via-[#0c0e0c]/85 via-30% to-transparent to-55%"
        />
        <div className="relative z-10 flex flex-col gap-5 max-w-xl">
          <GameQuestWordmark />
          <GameQuestTagline />
          <GameQuestHighlights className="mt-1" />
        </div>
      </section>
      <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 px-4 py-8 md:max-w-none md:gap-6 md:border-l md:border-border md:bg-surface md:px-12 md:py-10">
      <div className="flex flex-col gap-1.5 rounded-card border border-white/10 bg-[#111311]/95 p-4 shadow-lg backdrop-blur-md md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white shadow-sm">
            <GameControllerEmblem className="h-4.5 w-4.5" />
          </div>
          <span className="font-heading text-xl font-extrabold tracking-tight text-white leading-none">
            Game<span className="text-[var(--accent)]">Quest</span>
          </span>
        </div>
        <p className="text-xs text-white/75 leading-relaxed">
          Your games from every platform in one library.
        </p>
      </div>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6 md:rounded-none md:border-0 md:p-0">
        <h1 className="font-heading text-3xl font-bold">{title}</h1>
        {oauth && (
          <>
            {oauth}
            <div className="flex items-center gap-3 text-xs text-text-muted" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              or use your email
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        {fields.map((f) => (
          <div key={f.name} className="flex flex-col gap-1.5">
            <FormField
              label={f.label}
              name={f.name}
              type={f.type ?? 'text'}
              autoComplete={f.autoComplete}
              hint={f.hint}
              value={values[f.name]}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              error={errors[f.name]}
            />
            {f.name === 'password' && forgotPasswordHref && (
              <div className="flex justify-end">
                <Link
                  to={forgotPasswordHref}
                  className="text-xs text-text-muted transition-colors hover:text-text hover:underline underline-offset-4 focus:outline-none focus-visible:ring-1 focus-visible:ring-text rounded-sm"
                >
                  Forgot password?
                </Link>
              </div>
            )}
          </div>
        ))}
        {termsCheckbox && (
          <div className="flex flex-col gap-1 py-1">
            <label className="flex items-start gap-2.5 text-xs text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                name="acceptTerms"
                checked={Boolean(values.acceptTerms)}
                onChange={(e) => setValues((v) => ({ ...v, acceptTerms: e.target.checked ? true : undefined }))}
                className="mt-0.5 h-4 w-4 rounded border-border bg-surface text-accent focus:ring-text"
              />
              <span>
                I agree to the{' '}
                <Link to="/terms" target="_blank" className="text-accent underline underline-offset-2">
                  Terms
                </Link>{' '}
                and{' '}
                <Link to="/privacy" target="_blank" className="text-accent underline underline-offset-2">
                  Privacy Policy
                </Link>
              </span>
            </label>
            {errors.acceptTerms && (
              <p role="alert" className="text-xs text-danger">
                {errors.acceptTerms}
              </p>
            )}
          </div>
        )}
        {unverifiedEmail ? (
          <div role="alert" className="flex flex-col gap-2.5 rounded-card border border-warning/30 bg-warning/10 p-3.5 text-sm">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-text">Email verification required</p>
                <p className="text-xs text-text-muted leading-relaxed">
                  Your email (<span className="text-text font-medium">{unverifiedEmail}</span>) has not been verified yet. Check your inbox for the 6-digit verification code.
                </p>
              </div>
            </div>
            <div className="pt-1 flex flex-col gap-2">
              <Link
                to={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                className="text-xs font-semibold text-accent underline underline-offset-2 hover:opacity-80"
              >
                Enter 6-digit verification code &rarr;
              </Link>
              <button
                type="button"
                disabled={resendCooldown > 0 || resendPending}
                onClick={handleResendVerification}
                className="text-xs font-semibold text-text-muted hover:text-text disabled:opacity-50 disabled:no-underline cursor-pointer disabled:cursor-not-allowed text-left"
              >
                {resendPending
                  ? 'Sending…'
                  : resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : 'Resend verification code'}
              </button>
            </div>
          </div>
        ) : formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? 'Please wait…' : submitLabel}
        </Button>
      </form>
      <p className="rounded-card bg-bg/70 px-3 py-2 text-center text-sm text-text-muted md:bg-transparent md:px-0">{footer}</p>
      </main>
    </div>
  );
}

export function AuthLink({ to, children }) {
  return (
    <Link to={to} className="font-medium text-accent underline underline-offset-4">
      {children}
    </Link>
  );
}
