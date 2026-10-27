import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { CalendarPlus, ChevronDown, Gamepad2, MoreHorizontal, Play, Sparkles, Star } from 'lucide-react';
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
      <BackdropHero art={game} seed={game.title} className="gq-game-hero relative w-full overflow-hidden !rounded-none !border-0 !border-b !border-white/10 !bg-[#0B0C0F] text-white">
        <div className="relative z-10 mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 pt-4 pb-8 sm:px-8 sm:pt-6 sm:pb-8">
          <div className="flex items-center gap-2 text-sm text-white/65">
            <Link to="/explore" className="inline-flex items-center gap-2 hover:text-white">
              <span aria-hidden="true">←</span> Explore
            </Link>
            <span aria-hidden="true">/</span>
            <span className="truncate text-white/90">{game.title}</span>
          </div>

          <div className="flex flex-col gap-7 md:flex-row md:items-end md:gap-9">
            <SharedCover slug={game.slug} className="w-40 shrink-0 self-center overflow-hidden rounded-[10px] border-2 border-[#C8F135] shadow-2xl sm:w-48 lg:w-56 md:self-end">
              <GameCover game={game} className="h-full w-full object-cover" />
            </SharedCover>

            <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-4">
              {platforms.length > 0 && (
                <ul aria-label="Platforms" className="flex flex-wrap gap-3 text-xs font-medium text-white/75">
                  {platforms.map((name) => {
                    const Icon = platformIcon(name);
                    return <li key={name} className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{name}</li>;
                  })}
                </ul>
              )}
              <h1 tabIndex={-1} className="font-heading text-4xl font-bold leading-none tracking-tight text-white focus:outline-none sm:text-6xl">{game.title}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
                {rating && <span className="inline-flex items-center gap-1 font-semibold text-white"><Star className="h-4 w-4 fill-[#E58A2B] text-[#E58A2B]" aria-hidden="true" />{rating}</span>}
                {rating && <span aria-hidden="true">•</span>}
                {[developer, year].filter(Boolean).map((value, index) => <span key={value}>{index > 0 && <span className="mr-3" aria-hidden="true">•</span>}{value}</span>)}
              </div>
              {game.genres?.length > 0 && (
                <ul aria-label="Genres" className="flex flex-wrap gap-2">
                  {game.genres.map((genre) => <li key={genre} className="rounded-full bg-black/35 px-3 py-1 text-xs text-white/80">{genre}</li>)}
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
                <Button variant="secondary" onClick={() => setTrailerOpen(true)} ref={triggerRef} className="border-white/30 bg-transparent text-white hover:bg-white/10">
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" /> Watch trailer
                </Button>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild><Button variant="secondary" aria-label="More game actions" className="h-11 w-11 rounded-full border-white/30 bg-transparent px-0 text-white hover:bg-white/10"><MoreHorizontal className="h-5 w-5" aria-hidden="true" /></Button></DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content align="start" className="z-50 min-w-56 rounded-control border border-border bg-surface p-1 text-text shadow-xl">
                      <DropdownMenu.Item onSelect={onRecommend} className="flex w-full cursor-pointer items-center rounded px-3 py-2 text-sm font-medium text-text outline-none hover:bg-surface-raised data-[highlighted]:bg-surface-raised"><Sparkles className="mr-2 h-4 w-4 text-text-muted" aria-hidden="true" />Recommend to a friend</DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={onSchedule} className="flex w-full cursor-pointer items-center rounded px-3 py-2 text-sm font-medium text-text outline-none hover:bg-surface-raised data-[highlighted]:bg-surface-raised"><CalendarPlus className="mr-2 h-4 w-4 text-text-muted" aria-hidden="true" />Schedule a session</DropdownMenu.Item>
                      {entry && <DropdownMenu.Item onSelect={() => setCollectionOpen(true)} className="flex w-full cursor-pointer items-center rounded px-3 py-2 text-sm font-medium text-text outline-none hover:bg-surface-raised data-[highlighted]:bg-surface-raised">Add to collection</DropdownMenu.Item>}
                      <DropdownMenu.Item onSelect={() => setTrailerOpen(true)} className="flex w-full cursor-pointer items-center rounded px-3 py-2 text-sm font-medium text-text outline-none hover:bg-surface-raised data-[highlighted]:bg-surface-raised">Wrong trailer?</DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
              {collectionOpen && entry && <AddToCollection entryId={entry.id} />}
            </div>
          </div>
        </div>
      </BackdropHero>
      <TrailerModal slug={game.slug} title={game.title} isOpen={trailerOpen} onClose={() => setTrailerOpen(false)} triggerRef={triggerRef} />
    </>
  );
}
