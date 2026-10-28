import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, KeyRound, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { registerSchema } from '@gamequest/shared';
import { useAuth } from '@/hooks/useAuth.js';
import { resendVerification } from '@/services/authApi.js';
import { getErrorInfo } from '@/services/api.js';
import { GoogleButton } from '@/components/auth/GoogleButton.jsx';
import { AuthForm, AuthLink } from '@/features/auth/AuthForm.jsx';
import { Button } from '@/components/ui/button.jsx';
import { CoverCollage } from '@/components/auth/CoverCollage.jsx';
import {
  GameControllerEmblem,
  GameQuestWordmark,
  GameQuestTagline,
  GameQuestHighlights,
} from '@/components/auth/GameQuestWordmark.jsx';

const FIELDS = [
  { name: 'username', label: 'Username', autoComplete: 'username', hint: '3–24 letters, numbers or underscores' },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password', hint: 'At least 8 characters' },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [verificationPending, setVerificationPending] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resendPending, setResendPending] = useState(false);

  useEffect(() => {
    if (!verificationPending || resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [verificationPending, resendCooldown]);

  async function handleRegister(data) {
    const res = await register(data);
    if (res?.emailVerificationPending) {
      setRegisteredEmail(data.email);
      setVerificationPending(true);
      setResendCooldown(60);
      // Seamlessly navigate to the 6-digit verification code entry page
      navigate(`/verify-email?email=${encodeURIComponent(data.email)}`);
    }
    return res;
  }

  async function handleResendVerification() {
    if (!registeredEmail || resendCooldown > 0 || resendPending) return;
    setResendPending(true);
    try {
      await resendVerification({ email: registeredEmail });
      setResendCooldown(60);
      toast.success('Verification code sent! Please check your inbox.');
    } catch (err) {
      const info = getErrorInfo(err);
      toast.error(info.message || 'Unable to resend verification code. Please try again.');
    } finally {
      setResendPending(false);
    }
  }

  if (verificationPending) {
    return (
      <div className="isolate min-h-screen md:grid md:grid-cols-[minmax(0,1fr)_30rem]">
        <CoverCollage />

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

          <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-6 md:rounded-none md:border-0 md:p-0">
            <h1 className="font-heading text-3xl font-bold">Verify your email</h1>

            <div className="flex flex-col gap-5">
              <div
                role="status"
                className="flex items-start gap-3 rounded-card border border-border bg-surface-raised p-4"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                <div className="flex flex-col gap-1 text-sm leading-relaxed text-text">
                  <p className="font-medium text-text">Verification code dispatched</p>
                  <p className="text-text-muted">
                    We sent a 6-digit verification code to <span className="font-semibold text-text">{registeredEmail}</span>.
                    Please enter the code to activate your account.
                  </p>
                </div>
              </div>

              <p className="text-xs text-text-muted leading-relaxed">
                Verification codes expire in <strong>10 minutes</strong>. If you don&apos;t see the email, check your spam folder.
              </p>

              <div className="flex flex-col gap-2 pt-2">
                <Link to={`/verify-email?email=${encodeURIComponent(registeredEmail)}`}>
                  <Button className="w-full">
                    <KeyRound className="h-4 w-4 mr-2" />
                    Enter 6-digit verification code
                  </Button>
                </Link>

                <Button
                  type="button"
                  variant="outline"
                  disabled={resendCooldown > 0 || resendPending}
                  onClick={handleResendVerification}
                  className="w-full"
                >
                  {resendPending ? (
                    'Sending…'
                  ) : resendCooldown > 0 ? (
                    `Resend code (${resendCooldown}s)`
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Resend verification code
                    </>
                  )}
                </Button>

                <Link to="/login" className="inline-flex items-center justify-center gap-2 pt-2">
                  <Button variant="ghost" className="w-full">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Return to log in
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <AuthForm
      title="Create your account"
      oauth={<GoogleButton />}
      submitLabel="Create account"
      fields={FIELDS}
      schema={registerSchema}
      termsCheckbox={true}
      onSubmit={handleRegister}
      footer={
        <>
          Already have an account? <AuthLink to="/login">Log in</AuthLink>
        </>
      }
    />
  );
}
