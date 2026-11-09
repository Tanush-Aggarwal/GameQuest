import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { CalendarPlus, ChevronDown, EyeOff, Gamepad2, ImageIcon, MoreHorizontal, Play, Send } from 'lucide-react';
import { BackdropHero } from '@/components/art/BackdropHero.jsx';
import { GameCover, SharedCover } from '@/components/games/GameCard.jsx';
import { AddToCollection } from '@/components/collections/AddToCollection.jsx';
import { TrailerModal } from '@/components/games/TrailerModal.jsx';
import { GameLibraryPanel } from '@/components/library/GameLibraryPanel.jsx';
import { Button } from '@/components/ui/button.jsx';
import { platformIcon } from '@/components/ui/PlatformPills.jsx';
import { changeStatus } from '@/services/libraryApi.js';
import { getErrorInfo } from '@/services/api.js';
import { STATUS_META } from '@/lib/libraryStatus.js';
import { toast } from 'sonner';
import { RatingBadge } from '@/components/ui/RatingBadge.jsx';
import { HeaderEditor } from '@/components/admin/HeaderEditor.jsx';
import { useIsAdmin } from '@/hooks/useIsAdmin.js';
import { ShareGame } from '@/components/game/ShareGame.jsx';

const families = [
  { label: 'PC', test: /\b(pc|windows|linux|steam)\b/i },
  { label: 'PlayStation', test: /\b(playstation|ps[345])\b/i },
  { label: 'Xbox', test: /\bxbox\b/i },
  { label: 'Switch', test: /\b(nintendo switch|switch)\b/i },
  { label: 'Mac', test: /\b(mac|macos|apple|osx)\b/i },
  { label: 'Mobile', test: /\b(ios|android|iphone|ipad|mobile)\b/i },
];

export function groupedPlatforms(platforms = []) {
  return families.filter(({ test }) => platforms.some((platform) => test.test(platform))).map(({ label }) => label);
}

export function GameHero({ game, entryState, onRecommend, onSchedule }) {
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [headerOpen, setHeaderOpen] = useState(false);
  // undefined: use the game's own; null or {url,…}: what an administrator just saved, so the header updates at once
  const [override, setOverride] = useState(undefined);
  const isAdmin = useIsAdmin();
  const art = override === undefined ? game : { ...game, heroOverride: override };
  const triggerRef = useRef(null);
  const year = game.releaseDate ? new Date(game.releaseDate).getUTCFullYear() : null;
  const developer = game.developer?.[0];
  const rating = game.totalRating != null ? (game.totalRating / 10).toFixed(1) : null;
  const platforms = groupedPlatforms(game.platforms);
  const { entry } = entryState;
  const [moving, setMoving] = useState(false);

  async function move(to) {
    if (!entry || to === entry.status) return;
    const previous = entry;
    entryState.setEntry({ ...entry, status: to });
    setMoving(true);
    try {
      entryState.setEntry(await changeStatus(entry.id, to));
      toast.success(`Moved to ${STATUS_META[to].label}`);
    } catch (error) {
      entryState.setEntry(previous);
      toast.error(getErrorInfo(error).message);
    } finally {
      setMoving(false);
    }
  }

  return (
    <>
      <BackdropHero key={art.heroOverride?.url ?? 'auto'} art={art} seed={game.title} className="gq-game-hero relative overflow-hidden !border-0 !bg-[#0B0C0F] text-white">
        {/* fades the art into the light page below, so the header and content read as one page */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-24 bg-gradient-to-b from-transparent to-[var(--bg)]" />
        <div className="relative z-10 mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 pt-4 pb-14 sm:px-8 sm:pt-6 sm:pb-16">
          <div className="flex items-center gap-2 text-sm text-white/65">
            <Link to="/explore" className="inline-flex items-center gap-2 hover:text-white">
              <span aria-hidden="true">←</span> Explore
            </Link>
            <span aria-hidden="true">/</span>
            <span className="truncate text-white/90">{game.title}</span>
          </div>

          <div className="flex flex-col gap-7 md:flex-row md:items-end md:gap-9">
            <SharedCover slug={game.slug} className="w-40 shrink-0 self-center overflow-hidden rounded-[14px] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] ring-1 ring-white/20 sm:w-48 lg:w-56 md:self-end">
              <GameCover game={game} className="h-full w-full object-cover" />
            </SharedCover>

            <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-4">
              {platforms.length > 0 && (
                <ul aria-label="Platforms" className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-wider text-white/80">
                  {platforms.map((name) => {
                    const Icon = platformIcon(name);
                    return <li key={name} className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{name}</li>;
                  })}
                </ul>
              )}
              <h1 tabIndex={-1} className="font-heading text-4xl font-bold leading-[0.95] tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)] focus:outline-none sm:text-5xl lg:text-6xl">{game.title}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
                <RatingBadge value={rating} size="md" />
                {rating && <span aria-hidden="true">•</span>}
                {[developer, year].filter(Boolean).map((value, index) => <span key={value}>{index > 0 && <span className="mr-3" aria-hidden="true">•</span>}{value}</span>)}
              </div>
              {game.genres?.length > 0 && (
                <ul aria-label="Genres" className="flex flex-wrap gap-2">
                  {game.genres.map((genre) => <li key={genre} className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/15 backdrop-blur-sm">{genre}</li>)}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2">
                {!entry ? (
                  <GameLibraryPanel game={game} state={entryState} />
                ) : (
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <Button className="bg-[#C8F135] text-[#080A08] hover:brightness-110">
                        {entry.status.replace(/^./, (c) => c.toUpperCase())}<ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content align="start" className="z-50 min-w-52 rounded-control border border-border bg-surface p-1 text-text shadow-xl">
                        <DropdownMenu.Item asChild><Link className="flex w-full cursor-pointer items-center rounded px-3 py-2 text-sm font-medium text-text outline-none hover:bg-surface-raised data-[highlighted]:bg-surface-raised" to={`/library/${entry.id}`}>Open in library</Link></DropdownMenu.Item>
                        <div className="border-t border-border/60 px-3 py-2">
                          <p className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">Move to</p>
                          {Object.entries(STATUS_META).filter(([status]) => status !== entry.status).map(([status, meta]) => <button key={status} type="button" disabled={moving} onClick={() => move(status)} className="block w-full rounded px-2 py-1.5 text-left text-sm font-medium text-text hover:bg-surface-raised disabled:opacity-40">{meta.label}</button>)}
                        </div>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                )}
                <Button variant="secondary" onClick={() => setTrailerOpen(true)} ref={triggerRef} className="border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20">
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" /> Watch trailer
                </Button>
                <ShareGame game={game} className="border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20" />
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild><Button variant="secondary" aria-label="More game actions" className="h-11 w-11 rounded-full border-white/30 bg-transparent px-0 text-white hover:bg-white/10"><MoreHorizontal className="h-5 w-5" aria-hidden="true" /></Button></DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content align="start" className="z-50 min-w-56 rounded-control border border-border bg-surface p-1 text-text shadow-xl">
                      <DropdownMenu.Item onSelect={onRecommend} className="flex w-full cursor-pointer items-center rounded px-3 py-2 text-sm font-medium text-text outline-none hover:bg-surface-raised data-[highlighted]:bg-surface-raised"><Send className="mr-2 h-4 w-4 text-text-muted" aria-hidden="true" />Recommend to a friend</DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={onSchedule} className="flex w-full cursor-pointer items-center rounded px-3 py-2 text-sm font-medium text-text outline-none hover:bg-surface-raised data-[highlighted]:bg-surface-raised"><CalendarPlus className="mr-2 h-4 w-4 text-text-muted" aria-hidden="true" />Schedule a session</DropdownMenu.Item>
                      {entry && <DropdownMenu.Item onSelect={() => setCollectionOpen(true)} className="flex w-full cursor-pointer items-center rounded px-3 py-2 text-sm font-medium text-text outline-none hover:bg-surface-raised data-[highlighted]:bg-surface-raised">Add to collection</DropdownMenu.Item>}
                      {isAdmin && (
                        <>
                          <DropdownMenu.Separator className="my-1 h-px bg-border" />
                          <DropdownMenu.Label className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-widest text-text-muted">Admin</DropdownMenu.Label>
                          <DropdownMenu.Item onSelect={() => setHeaderOpen(true)} className="flex w-full cursor-pointer items-center rounded px-3 py-2 text-sm font-medium text-text outline-none hover:bg-surface-raised data-[highlighted]:bg-surface-raised"><ImageIcon className="mr-2 h-4 w-4 text-text-muted" aria-hidden="true" />Edit header</DropdownMenu.Item>
                          <DropdownMenu.Item onSelect={() => setTrailerOpen(true)} className="flex w-full cursor-pointer items-center rounded px-3 py-2 text-sm font-medium text-text outline-none hover:bg-surface-raised data-[highlighted]:bg-surface-raised"><EyeOff className="mr-2 h-4 w-4 text-text-muted" aria-hidden="true" />Hide a trailer</DropdownMenu.Item>
                        </>
                      )}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
              {collectionOpen && entry && <AddToCollection entryId={entry.id} />}
            </div>
          </div>
        </div>
      </BackdropHero>
      {isAdmin && <HeaderEditor game={game} open={headerOpen} onOpenChange={setHeaderOpen} onSaved={(updated) => setOverride(updated?.heroOverride ?? null)} />}
      <TrailerModal slug={game.slug} title={game.title} isOpen={trailerOpen} onClose={() => setTrailerOpen(false)} triggerRef={triggerRef} />
    </>
  );
}
