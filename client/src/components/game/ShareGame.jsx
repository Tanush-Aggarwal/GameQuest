import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Copy, Mail, MessageCircle, Send, Share2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';

// The link to a game page and a short message about it (title, year, genres, rating), ready to paste anywhere.
export function shareDetails(game, origin = window.location.origin) {
  const url = `${origin}/games/${encodeURIComponent(game.slug)}`;
  const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;
  const rating = game.totalRating != null ? `★ ${(game.totalRating / 10).toFixed(1)}/10` : null;
  const facts = [year, ...(game.genres ?? []).slice(0, 2), rating].filter(Boolean).join(' · ');
  const text = `${game.title}${facts ? ` (${facts})` : ''}\nCheck it out on GameQuest:`;
  return { url, text, message: `${text}\n${url}` };
}

async function copy(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Older browsers / no permission: a hidden textarea and execCommand still works in most of them
    try {
      const el = document.createElement('textarea');
      el.value = value;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const ITEM =
  'flex w-full cursor-pointer items-center gap-2.5 rounded px-3 py-2 text-sm font-medium text-text outline-none hover:bg-surface-raised data-[highlighted]:bg-surface-raised';

// "Share" on a game page. One click copies the message and link (so it can be pasted straight into a chat) and opens a
// menu to send it with WhatsApp, Telegram, X or email, or the phone's own share sheet where there is one.
// A friend who opens the link signs in (or signs up) and lands on the game.
export function ShareGame({ game, className }) {
  const [copied, setCopied] = useState(false);
  const { url, text, message } = shareDetails(game);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copyAll() {
    const ok = await copy(message);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied. Paste it in any chat to share.');
    } else {
      toast.error('Could not copy. Use one of the share options instead.');
    }
  }

  const open = (href) => window.open(href, '_blank', 'noopener,noreferrer');
  const enc = encodeURIComponent;
  const targets = [
    { label: 'WhatsApp', icon: MessageCircle, href: `https://wa.me/?text=${enc(message)}` },
    { label: 'Telegram', icon: Send, href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` },
    { label: 'X (Twitter)', icon: XLogo, href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}` },
    { label: 'Email', icon: Mail, href: `mailto:?subject=${enc(`${game.title} on GameQuest`)}&body=${enc(message)}` },
  ];

  return (
    <DropdownMenu.Root onOpenChange={(isOpen) => isOpen && copyAll()}>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" className={className} aria-label={`Share ${game.title}`}>
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />}
          <span>{copied ? 'Copied' : 'Share'}</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="z-50 w-64 rounded-control border border-border bg-surface p-1 text-text shadow-xl">
          <DropdownMenu.Label className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-text-muted">Share with friends</DropdownMenu.Label>
          <p className="mx-3 mb-1.5 line-clamp-2 rounded bg-bg px-2 py-1.5 text-xs text-text-muted">{url.replace(/^https?:\/\//, '')}</p>
          {canNativeShare && (
            <DropdownMenu.Item className={ITEM} onSelect={() => navigator.share({ title: game.title, text, url }).catch(() => {})}>
              <Smartphone className="h-4 w-4 text-text-muted" aria-hidden="true" /> Share via…
            </DropdownMenu.Item>
          )}
          {targets.map(({ label, icon: Icon, href }) => (
            <DropdownMenu.Item key={label} className={ITEM} onSelect={() => open(href)}>
              <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" /> {label}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item className={ITEM} onSelect={() => copyAll()}>
            <Copy className="h-4 w-4 text-text-muted" aria-hidden="true" /> Copy link again
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function XLogo(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.8-6.3L6.4 22H3.3l7.3-8.3L1 2h6.3l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" />
    </svg>
  );
}
