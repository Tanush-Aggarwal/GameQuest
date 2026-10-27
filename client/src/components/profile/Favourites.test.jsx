import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('@/services/gamesApi.js', () => ({ searchGames: vi.fn() }));
vi.mock('@/services/libraryApi.js', () => ({ listLibrary: vi.fn() }));

const { searchGames } = await import('@/services/gamesApi.js');
const { listLibrary } = await import('@/services/libraryApi.js');
const { FavouriteTiles, SLOT_COUNT, TILE } = await import('./FavouriteTiles.jsx');
const { FavouritePicker } = await import('./FavouritePicker.jsx');

const game = (n, extra = {}) => ({ id: `g${n}`, slug: `game-${n}`, title: `Game ${n}`, cover: null, ...extra });
const slotsOf = (...games) => Array.from({ length: SLOT_COUNT }, (_, i) => games[i] ?? null);

beforeEach(() => vi.resetAllMocks());

describe('FavouriteTiles', () => {
  it('is a compact row of four cover-sized tiles, not a page-wide grid', () => {
    render(<FavouriteTiles slots={slotsOf(game(1))} openSlot={null} onOpen={vi.fn()} onRemove={vi.fn()} />);
    const list = screen.getByRole('list', { name: 'Favourite games' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(list.className).toMatch(/\bflex\b/);
    expect(list.className).not.toMatch(/grid-cols/);
    for (const li of within(list).getAllByRole('listitem')) {
      expect(li.className).toContain('w-24'); // 96 px, 112 px from sm: a cover, not a quarter of the screen
      expect(li.className).toContain('sm:w-28');
      expect(li.className).toMatch(/shrink-0/);
    }
    expect(TILE).toContain('w-24');
  });

  it('shows a filled tile with its cover, title and a 44 px remove button, and an empty tile as an add button', async () => {
    const onRemove = vi.fn();
    const onOpen = vi.fn();
    render(<FavouriteTiles slots={slotsOf(game(1), null, game(3))} openSlot={null} onOpen={onOpen} onRemove={onRemove} />);
    expect(screen.getByText('Game 1')).toBeInTheDocument();
    const remove = screen.getByRole('button', { name: 'Remove Game 1 from favourites' });
    expect(remove.className).toMatch(/h-11/);
    expect(remove.className).toMatch(/w-11/);
    await userEvent.click(remove);
    expect(onRemove).toHaveBeenCalledWith(0);

    expect(screen.queryByRole('button', { name: 'Add favourite game 1' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add favourite game 2' }));
    expect(onOpen).toHaveBeenCalledWith(1);
    expect(screen.getByRole('button', { name: 'Add favourite game 4' })).toBeInTheDocument();
  });

  it('marks the slot whose picker is open', () => {
    render(<FavouriteTiles slots={slotsOf()} openSlot={2} onOpen={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add favourite game 3' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Add favourite game 1' })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('FavouritePicker', () => {
  const setup = (props = {}) => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<FavouritePicker slot={1} chosenIds={new Set()} onPick={onPick} onClose={onClose} {...props} />);
    return { onPick, onClose };
  };
  beforeEach(() => {
    listLibrary.mockResolvedValue({ items: [{ game: game(1) }, { game: game(2) }, { game: null }] });
    searchGames.mockResolvedValue({ items: [game(7, { title: 'Zelda' })] });
  });

  it('opens focused on the search box, titled with the slot, and lists your library games', async () => {
    setup();
    expect(screen.getByRole('group', { name: 'Choose favourite 2' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search the catalog' })).toHaveFocus();
    const library = await screen.findByRole('list', { name: 'Library games' });
    expect(within(library).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Game 1', 'Game 2']);
    expect(searchGames).not.toHaveBeenCalled(); // nothing typed, nothing searched
  });

  it('searches the catalog after a pause once two characters are typed, and picks from the results', async () => {
    const { onPick } = setup();
    await userEvent.type(screen.getByRole('searchbox'), 'z');
    await new Promise((r) => setTimeout(r, 400));
    expect(searchGames).not.toHaveBeenCalled(); // one character is too short

    await userEvent.type(screen.getByRole('searchbox'), 'el');
    const results = await screen.findByRole('list', { name: 'Search results' });
    expect(searchGames).toHaveBeenCalledTimes(1); // typed fast: a single request, with the full text
    expect(searchGames).toHaveBeenCalledWith(expect.objectContaining({ q: 'zel', limit: 8 }), expect.anything());
    await userEvent.click(within(results).getByRole('button', { name: 'Zelda' }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'g7', title: 'Zelda' }));
  });

  it('says so when nothing matches', async () => {
    searchGames.mockResolvedValue({ items: [] });
    setup();
    await userEvent.type(screen.getByRole('searchbox'), 'qqqq');
    expect(await screen.findByText('No games match "qqqq".')).toBeInTheDocument();
  });

  it('shows games already chosen elsewhere as disabled, so a game cannot take two slots', async () => {
    const { onPick } = setup({ chosenIds: new Set(['g1']) });
    const taken = await screen.findByRole('button', { name: 'Game 1 (already a favourite)' });
    expect(taken).toBeDisabled();
    await userEvent.click(taken);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Game 2' })).toBeEnabled();
  });

  it('closes with Escape and with the Close button', async () => {
    const { onClose } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Close picker' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows a loading state, a scoped error with Retry, and an empty library message', async () => {
    let fail = true;
    listLibrary.mockImplementation(async () => {
      if (fail) throw new Error('down');
      return { items: [] };
    });
    setup();
    expect(screen.getByRole('status', { name: 'Loading library games' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Games you add to your library show up here.')).toBeInTheDocument();
    // a failing library never stops the catalog search from working
    await userEvent.type(screen.getByRole('searchbox'), 'zel');
    expect(await screen.findByRole('button', { name: 'Zelda' })).toBeInTheDocument();
  });

  it('a failing search shows an error with Retry and keeps the library picks', async () => {
    searchGames.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ items: [game(7, { title: 'Zelda' })] });
    setup();
    await userEvent.type(screen.getByRole('searchbox'), 'zel');
    const search = await screen.findByRole('region', { name: 'Search results' });
    await waitFor(() => expect(within(search).getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Game 1' })).toBeInTheDocument();
    await userEvent.click(within(search).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Zelda' })).toBeInTheDocument();
  });
});

describe('FavouritePicker inside a form', () => {
  beforeEach(() => {
    listLibrary.mockResolvedValue({ items: [{ game: game(1) }] });
    searchGames.mockResolvedValue({ items: [game(7, { title: 'Zelda' })] });
  });

  it('Enter in the search box never submits the surrounding form (that would save the whole profile)', async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <FavouritePicker slot={0} chosenIds={new Set()} onPick={vi.fn()} onClose={vi.fn()} />
        <button type="submit">Save Profile</button>
      </form>,
    );
    await userEvent.type(screen.getByRole('searchbox'), 'zel{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Zelda' })).toBeInTheDocument(); // it searched by itself anyway
  });

  it('the first Escape clears the typed text, and only an Escape on an empty box closes the picker', async () => {
    const onClose = vi.fn();
    render(<FavouritePicker slot={0} chosenIds={new Set()} onPick={vi.fn()} onClose={onClose} />);
    const box = screen.getByRole('searchbox');
    await userEvent.type(box, 'zel');
    await userEvent.keyboard('{Escape}');
    expect(box).toHaveValue('');
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not show results for older text while typing: a loading state until the new search answers', async () => {
    let release;
    searchGames.mockImplementation(({ q }) => (q === 'zel' ? Promise.resolve({ items: [game(7, { title: 'Zelda' })] }) : new Promise((resolve) => { release = () => resolve({ items: [game(8, { title: 'Zelda Two' })] }); })));
    render(<FavouritePicker slot={0} chosenIds={new Set()} onPick={vi.fn()} onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole('searchbox'), 'zel');
    expect(await screen.findByRole('button', { name: 'Zelda' })).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox'), 'd'); // "zeld": typed, but not searched yet
    expect(screen.queryByRole('button', { name: 'Zelda' })).not.toBeInTheDocument(); // the list for "zel" is not shown for "zeld"
    expect(screen.getByRole('status', { name: 'Loading search results' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Search results' })).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => expect(release).toBeTypeOf('function'));
    release();
    expect(await screen.findByRole('button', { name: 'Zelda Two' })).toBeInTheDocument();
  });

  it('hides the search results as soon as the text is shorter than two characters', async () => {
    render(<FavouritePicker slot={0} chosenIds={new Set()} onPick={vi.fn()} onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole('searchbox'), 'zel');
    expect(await screen.findByRole('button', { name: 'Zelda' })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox'));
    expect(screen.queryByRole('region', { name: 'Search results' })).not.toBeInTheDocument();
  });

  it('announces how many results there are, once, for the current text', async () => {
    render(<FavouritePicker slot={0} chosenIds={new Set()} onPick={vi.fn()} onClose={vi.fn()} />);
    await userEvent.type(screen.getByRole('searchbox'), 'zel');
    await waitFor(() => expect(screen.getAllByRole('status').some((s) => s.textContent === '1 result')).toBe(true));
  });
});