import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Mail, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { forgotPasswordSchema } from '@gamequest/shared';
import { forgotPassword } from '@/services/authApi.js';
import { getErrorInfo } from '@/services/api.js';
import { Button } from '@/components/ui/button.jsx';
import { FormField } from '@/components/ui/form-field.jsx';
import { CoverCollage } from '@/components/auth/CoverCollage.jsx';
import {
  GameControllerEmblem,
  GameQuestWordmark,
  GameQuestTagline,
  GameQuestHighlights,
} from '@/components/auth/GameQuestWordmark.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resendPending, setResendPending] = useState(false);

  useEffect(() => {
    if (!submitted || resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [submitted, resendCooldown]);

  async function handleResend() {
    if (!email || resendCooldown > 0 || resendPending) return;
    setResendPending(true);
    try {
      await forgotPassword({ email });
      setResendCooldown(60);
      toast.success('Reset instructions resent! Please check your inbox.');
    } catch (err) {
      const info = getErrorInfo(err);
      toast.error(info.message || 'Unable to resend reset email.');
    } finally {
      setResendPending(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please enter a valid email address');
      return;
    }

    setPending(true);
    try {
      const res = await forgotPassword({ email: parsed.data.email });
      setConfirmationMessage(
        res?.message || "If an eligible account exists for that email address, we'll send instructions to reset its password.",
      );
      setSubmitted(true);
      setResendCooldown(60);
    } catch (err) {
      const info = getErrorInfo(err);
      setError(info.message || 'Unable to request password reset right now. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="isolate min-h-screen md:grid md:grid-cols-[minmax(0,1fr)_30rem]">
      <CoverCollage />

      {/* Desktop brand & artwork showcase */}
      <section className="relative hidden min-h-screen flex-col justify-end p-10 md:flex md:p-12 lg:p-16">
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

      {/* Recovery form card */}
      <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 px-4 py-8 md:max-w-none md:gap-6 md:border-l md:border-border md:bg-surface md:px-12 md:py-10">
        {/* Mobile header */}
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

        <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6 md:rounded-none md:border-0 md:p-0">
          <h1 className="font-heading text-3xl font-bold">Reset your password</h1>

          {submitted ? (
            <div className="flex flex-col gap-5">
              <div role="status" className="flex items-start gap-3 rounded-card border border-border bg-surface-raised p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                <div className="flex flex-col gap-1 text-sm leading-relaxed text-text">
                  <p className="font-medium text-text">Check your inbox</p>
                  <p className="text-text-muted">{confirmationMessage}</p>
                </div>
              </div>
              <p className="text-xs text-text-muted">
                Didn&apos;t receive an email? Check your spam folder or ensure the email entered matches your registered account.
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={resendCooldown > 0 || resendPending}
                  onClick={handleResend}
                  className="w-full"
                >
                  {resendPending ? (
                    'Sending…'
                  ) : resendCooldown > 0 ? (
                    `Resend email (${resendCooldown}s)`
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Resend reset instructions
                    </>
                  )}
                </Button>
                <Link to="/login" className="inline-flex items-center justify-center gap-2 pt-1">
                  <Button variant="default" className="w-full">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Return to log in
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <p className="text-sm text-text-muted leading-relaxed">
                Enter your email address and we&apos;ll send instructions to reset your password if an eligible account exists.
              </p>

              <FormField
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={error}
                hint="The email associated with your GameQuest account"
              />

              <Button type="submit" disabled={pending}>
                {pending ? (
                  'Please wait…'
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send reset instructions
                  </>
                )}
              </Button>
            </form>
          )}
        </div>

        {!submitted && (
          <p className="rounded-card bg-bg/70 px-3 py-2 text-center text-sm text-text-muted md:bg-transparent md:px-0">
            Remember your password?{' '}
            <Link to="/login" className="font-medium text-accent underline underline-offset-4">
              Log in
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}

