import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, KeyRound } from 'lucide-react';
import { passwordSchema } from '@gamequest/shared';
import { resetPassword } from '@/services/authApi.js';
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

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    const newErrors = {};

    if (!token) {
      setFormError('Missing password reset token. Please request a new link.');
      return;
    }

    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      newErrors.password = parsed.error.issues[0]?.message ?? 'Password must be at least 8 characters';
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setPending(true);

    try {
      await resetPassword({ token, password });
      setPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      const info = getErrorInfo(err);
      setFormError(info.message || 'Unable to reset password. The link may be expired or already used.');
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

      {/* Reset form card */}
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
          <h1 className="font-heading text-3xl font-bold">Set new password</h1>

          {!token ? (
            <div className="flex flex-col gap-4">
              <div role="alert" className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <p className="font-medium">Invalid or missing link</p>
                  <p className="text-xs opacity-90">
                    This password reset link is missing a valid security token. Please request a new reset link.
                  </p>
                </div>
              </div>
              <Link to="/forgot-password">
                <Button className="w-full">Request new reset link</Button>
              </Link>
            </div>
          ) : success ? (
            <div className="flex flex-col gap-5">
              <div role="status" className="flex items-start gap-3 rounded-card border border-border bg-surface-raised p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                <div className="flex flex-col gap-1 text-sm leading-relaxed text-text">
                  <p className="font-medium text-text">Password updated successfully</p>
                  <p className="text-text-muted">
                    Your account password has been changed. You can now log in using your new credentials.
                  </p>
                </div>
              </div>
              <Link to="/login">
                <Button className="w-full">Log in to GameQuest</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <p className="text-sm text-text-muted leading-relaxed">
                Choose a strong password with at least 8 characters.
              </p>

              <FormField
                label="New password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                hint="At least 8 characters"
              />

              <FormField
                label="Confirm new password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={errors.confirmPassword}
              />

              {formError && (
                <div role="alert" className="flex items-start gap-2.5 rounded-card border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div className="flex-1">
                    <p>{formError}</p>
                    <Link
                      to="/forgot-password"
                      className="mt-1.5 inline-block text-xs font-medium underline underline-offset-2"
                    >
                      Request a new reset link
                    </Link>
                  </div>
                </div>
              )}

              <Button type="submit" disabled={pending}>
                {pending ? (
                  'Please wait…'
                ) : (
                  <>
                    <KeyRound className="h-4 w-4 mr-2" />
                    Reset password
                  </>
                )}
              </Button>
            </form>
          )}
        </div>

        {!success && (
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

