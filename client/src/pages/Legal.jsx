import { Link, useLocation } from 'react-router-dom';
import { LEGAL_UPDATED, PRIVACY, TERMS } from '@gamequest/shared';
import { ArrowLeft, FileText, Shield } from 'lucide-react';

export default function Legal({ type: propType }) {
  const location = useLocation();
  const isPrivacy = propType ? propType === 'privacy' : location.pathname.includes('privacy');
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';
  const sections = isPrivacy ? PRIVACY : TERMS;
  const otherPath = isPrivacy ? '/terms' : '/privacy';
  const otherLabel = isPrivacy ? 'Terms of Service' : 'Privacy Policy';

  return (
    <article className="mx-auto min-h-screen max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Home
        </Link>
        <Link
          to={otherPath}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:underline"
        >
          {isPrivacy ? <FileText className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
          View {otherLabel}
        </Link>
      </div>

      <header className="mb-8 border-b border-white/10 pb-6">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-xs font-mono uppercase tracking-wider text-text-muted">
          Last updated: {LEGAL_UPDATED}
        </p>
      </header>

      <div className="space-y-6">
        {sections.map((section, idx) => (
          <section key={idx} className="rounded-card border border-white/10 bg-[#161816] p-6 shadow-sm">
            <h2 className="font-heading text-lg font-bold text-white">
              {section.heading}
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-300">
              {section.body.map((p, pIdx) => (
                <p key={pIdx}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
