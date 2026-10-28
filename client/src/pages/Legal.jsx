import { Link, useLocation } from 'react-router-dom';
import { LEGAL_UPDATED, PRIVACY, TERMS } from '@gamequest/shared';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Cookie,
  Database,
  Eye,
  FileText,
  Gamepad2,
  Globe,
  Scale,
  Shield,
  Sparkles,
  Trash2,
  UserCheck,
} from 'lucide-react';

const SECTION_ICONS = {
  // Privacy
  'What we store': Database,
  'Cookies': Cookie,
  'Who can see your data': Eye,
  'Services we call': Globe,
  'Deleting your data': Trash2,

  // Terms
  'What GameQuest is': Gamepad2,
  'Your account': UserCheck,
  'What you post': FileText,
  'Game data and trademarks': Scale,
  'Changes': Clock,
};

export default function Legal({ type: propType }) {
  const location = useLocation();
  const isPrivacy = propType ? propType === 'privacy' : location.pathname.includes('privacy');
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';
  const sections = isPrivacy ? PRIVACY : TERMS;
  const otherPath = isPrivacy ? '/terms' : '/privacy';
  const otherLabel = isPrivacy ? 'Terms of Service' : 'Privacy Policy';

  const subtitle = isPrivacy
    ? 'We believe your gaming data is yours. Here is an honest, plain-English explanation of what GameQuest stores, how cookies work, and how your privacy is protected.'
    : 'Simple, transparent ground rules for using GameQuest, keeping our gaming community safe, and respecting your content and privacy.';

  return (
    <div className="min-h-screen bg-bg text-text">
      <article className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Navigation bar with Back button and Segmented Toggle */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-control px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to Home</span>
          </Link>

          {/* Document Switcher Button */}
          <Link
            to={otherPath}
            className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-text shadow-xs transition-colors hover:bg-surface-raised"
          >
            {isPrivacy ? <FileText className="h-3.5 w-3.5 text-secondary-accent" aria-hidden="true" /> : <Shield className="h-3.5 w-3.5 text-secondary-accent" aria-hidden="true" />}
            <span>View {otherLabel}</span>
          </Link>
        </div>

        {/* Header Hero */}
        <header className="mb-10 space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted">
            <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden="true" />
            Plain language · No hidden legal traps
          </div>

          <h1 className="font-heading text-3xl font-bold tracking-tight text-text sm:text-4xl lg:text-5xl">
            {title}
          </h1>

          <p className="max-w-2xl text-base leading-relaxed text-text-muted sm:text-lg">
            {subtitle}
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              Last updated: {LEGAL_UPDATED}
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-secondary-accent" aria-hidden="true" />
              Mutual respect &amp; complete data ownership
            </span>
          </div>
        </header>

        {/* Sections list */}
        <div className="space-y-6">
          {sections.map((section, idx) => {
            const Icon = SECTION_ICONS[section.heading] || (isPrivacy ? Shield : FileText);
            return (
              <section
                key={idx}
                className="group rounded-card border border-border bg-surface p-6 sm:p-7 shadow-xs transition-all duration-200 hover:border-text/30 hover:shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control border border-border bg-surface-raised text-text">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-mono uppercase tracking-widest text-text-muted">
                      Part {String(idx + 1).padStart(2, '0')}
                    </span>
                    <h2 className="font-heading text-lg font-bold text-text sm:text-xl">
                      {section.heading}
                    </h2>
                  </div>
                </div>

                <div className="mt-4 space-y-3 border-t border-border/60 pt-4 text-sm leading-relaxed text-[#38332b] sm:text-base">
                  {section.body.map((p, pIdx) => (
                    <p key={pIdx}>{p}</p>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Footer info box */}
        <footer className="mt-10 rounded-card border border-border bg-surface-raised/60 p-6 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="font-heading text-base font-semibold text-text">
                {isPrivacy ? 'Questions about your data?' : 'Need clarification on our terms?'}
              </h3>
              <p className="text-sm text-text-muted">
                You can adjust privacy visibility, link/unlink Steam, or permanently delete your account at any time in your profile settings.
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-3">
              <Link
                to="/profile"
                className="inline-flex items-center gap-1.5 rounded-control border border-border bg-surface px-4 py-2 text-xs sm:text-sm font-semibold text-text shadow-xs transition-colors hover:bg-surface-raised"
              >
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Profile Settings</span>
              </Link>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}
