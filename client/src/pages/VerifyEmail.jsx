import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { verifyEmail, resendVerification } from '@/services/authApi.js';
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

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const initialEmail = params.get('email') || '';

  const [email, setEmail] = useState(initialEmail);
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef([]);

  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState(null);

  // Resend cooldown timer
  const [resendPending, setResendPending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Focus first digit box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const fullCode = digits.join('');

  function handleDigitChange(index, value) {
    const rawVal = value.replace(/\D/g, '');
    const char = rawVal ? rawVal[rawVal.length - 1] : '';

    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);
    setErrorMessage('');

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    let pastedText = '';
    if (e.clipboardData && typeof e.clipboardData.getData === 'function') {
      pastedText = e.clipboardData.getData('text') || e.clipboardData.getData('text/plain') || '';
    }
    const pasted = String(pastedText).replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i += 1) {
      newDigits[i] = pasted[i] || '';
    }
    setDigits(newDigits);
    setErrorMessage('');

    const nextIndex = Math.min(5, pasted.length);
    inputRefs.current[nextIndex]?.focus();
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    if (fullCode.length !== 6 || !email || verifying) return;

    setErrorMessage('');
    setVerifying(true);
    try {
      await verifyEmail({ email: email.trim(), code: fullCode });
      setVerified(true);
      toast.success('Email verified successfully! You can now log in.');
    } catch (err) {
      const info = getErrorInfo(err);
      setErrorMessage(info.message || 'Invalid or expired verification code.');
      if (info.details?.attemptsRemaining !== undefined) {
        setAttemptsRemaining(info.details.attemptsRemaining);
      }
      // If code was invalid or over-attempted, clear digits for re-entry
      if (info.code === 'INVALID_CODE') {
        inputRefs.current[0]?.focus();
      }
    } finally {
      setVerifying(false);
    }
  }

  async function handleResendCode() {
    if (!email || resendCooldown > 0 || resendPending) return;
    setResendPending(true);
    setErrorMessage('');
    try {
      await resendVerification({ email: email.trim() });
      setResendCooldown(60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      toast.success('A new 6-digit verification code has been sent to your email.');
    } catch (err) {
      const info = getErrorInfo(err);
      const msg = info.message || 'Unable to send verification code. Please try again.';
      toast.error(msg);
      setErrorMessage(msg);
    } finally {
      setResendPending(false);
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

      {/* Verification card */}
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
          <h1 className="font-heading text-3xl font-bold">Email verification</h1>

          {verified ? (
            <div className="flex flex-col gap-5">
              <div
                role="status"
                className="flex items-start gap-3 rounded-card border border-border bg-surface-raised p-4"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                <div className="flex flex-col gap-1 text-sm leading-relaxed text-text">
                  <p className="font-medium text-text">Account activated!</p>
                  <p className="text-text-muted">
                    Your email address has been successfully verified. You can now log in to access your GameQuest library.
                  </p>
                </div>
              </div>
              <Link to="/login">
                <Button className="w-full">Log in to GameQuest</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <p className="text-sm text-text-muted leading-relaxed">
                Enter the 6-digit verification code sent to your email address to activate your account.
              </p>

              {errorMessage && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <p className="font-medium">Verification failed</p>
                    <p className="text-xs opacity-90">{errorMessage}</p>
                    {attemptsRemaining !== null && attemptsRemaining > 0 && (
                      <p className="text-xs font-semibold mt-1">
                        {attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} remaining before this code is invalidated.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <FormField
                label="Email address"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="player@example.com"
                required
              />

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-text" id="code-label">
                  Verification code
                </label>
                <div
                  className="flex justify-between gap-1.5 sm:gap-2"
                  onPaste={handlePaste}
                  aria-labelledby="code-label"
                >
                  {digits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (inputRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      autoComplete="one-time-code"
                      aria-label={`Digit ${i + 1} of 6`}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      className="h-12 w-11 sm:h-14 sm:w-12 text-center font-mono text-2xl font-bold rounded-control border border-border bg-surface text-text focus:border-text focus:ring-1 focus:ring-text outline-none transition-all"
                    />
                  ))}
                </div>
                <p className="text-xs text-text-muted">
                  Codes expire in 10 minutes and can be used once.
                </p>
              </div>

              <Button
                type="submit"
                disabled={fullCode.length !== 6 || !email || verifying}
                className="w-full"
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying code…
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4 mr-2" />
                    Verify Email Code
                  </>
                )}
              </Button>

              <div className="flex items-center justify-between border-t border-border pt-4 text-xs">
                <span className="text-text-muted">Didn&apos;t receive a code?</span>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={!email || resendCooldown > 0 || resendPending}
                  className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline disabled:pointer-events-none disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${resendPending ? 'animate-spin' : ''}`} />
                  {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                </button>
              </div>

              <Link to="/login" className="text-center text-xs text-text-muted hover:text-text underline mt-1">
                Return to log in
              </Link>
            </form>
          )}
        </div>

        <p className="rounded-card bg-bg/70 px-3 py-2 text-center text-sm text-text-muted md:bg-transparent md:px-0">
          Already verified?{' '}
          <Link to="/login" className="font-medium text-accent underline underline-offset-4">
            Log in
          </Link>
        </p>
      </main>
    </div>
  );
}
