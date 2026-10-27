import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/libraryApi.js', () => ({ getLibraryEntry: vi.fn(), changeStatus: vi.fn(), setVisibility: vi.fn(), removeFromLibrary: vi.fn() }));
vi.mock('@/services/progressApi.js', () => ({
  setProgress: vi.fn(),
  logSession: vi.fn(),
  listLogs: vi.fn().mockResolvedValue({ items: [] }),
  deleteLog: vi.fn(),
  addJournalEntry: vi.fn(),
  listJournalEntries: vi.fn().mockResolvedValue({ items: [] }),
  deleteJournalEntry: vi.fn(),
}));
vi.mock('@/services/reviewApi.js', () => ({
  getMyReview: vi.fn().mockResolvedValue(null),
  listReviewsForGame: vi.fn().mockResolvedValue({ items: [] }),
  upsertReview: vi.fn(),
  deleteReview: vi.fn(),
}));
vi.mock('@/services/collectionsApi.js', () => ({ listCollections: vi.fn().mockResolvedValue({ items: [] }), addCollectionItem: vi.fn() }));
vi.mock('@/services/socialApi.js', () => ({ listFriends: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/recommendationsApi.js', () => ({ sendRecommendation: vi.fn() }));

const { getLibraryEntry, changeStatus, removeFromLibrary } = await import('@/services/libraryApi.js');
const { setProgress } = await import('@/services/progressApi.js');
const { default: LibraryEntry } = await import('./LibraryEntry.jsx');

const entry = (extra = {}) => ({
  id: 'e1',
  gameId: 'g1',
  status: 'playing',
  manualProgress: 30,
  loggedMinutes: 600,
  ownerships: [],
  achievements: { unlocked: null, total: null },
  game: {
    title: 'Hades',
    slug: 'hades',
    cover: null,
    backdrop: 'https://images.igdb.com/igdb/image/upload/t_1080p/bd.jpg',
    releaseDate: '2020-09-17T00:00:00Z',
    ratingAvg: 4.5,
    timeToBeat: { main: 22 },
    genres: ['Roguelike'],
    summary: 'Defy the god of the dead.',
  },
  ...extra,
});

function renderEntry() {
  return render(
    <MemoryRouter initialEntries={['/library/e1']}>
      <Routes>
        <Route path="/library/:id" element={<LibraryEntry />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Library entry page hero', () => {
  it('puts the game on its backdrop with the status as icon + label and the quick stats', async () => {
    getLibraryEntry.mockResolvedValue(entry());
    const { container } = renderEntry();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hades' })).toBeInTheDocument();
    const hero = container.querySelector('[data-hero="art"]');
    expect(hero).not.toBeNull();
    expect(hero.querySelector('img')).toHaveAttribute('src', 'https://images.igdb.com/igdb/image/upload/t_1080p/bd.jpg'); // the large backdrop, not the small art variant
    expect(hero).toContainElement(screen.getByRole('heading', { level: 1 }));
    expect(hero).toHaveTextContent('Playing');
    expect(hero.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(hero).toHaveTextContent('10h');
    expect(hero).toHaveTextContent('4.5');
    expect(hero).toHaveTextContent('~22h');
  });

  it('falls back to a gradient hero for a game without art, and the page below still renders', async () => {
    getLibraryEntry.mockResolvedValue(entry({ game: { ...entry().game, backdrop: null, cover: null } }));
    const { container } = renderEntry();
    await screen.findByRole('heading', { level: 1, name: 'Hades' });
    expect(container.querySelector('[data-hero="gradient"]')).not.toBeNull();
    expect(screen.getByLabelText('Manual progress')).toBeInTheDocument();
  });

  it('shows the error with Retry when the entry cannot load', async () => {
    getLibraryEntry.mockRejectedValue(new Error('down'));
    renderEntry();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('Library entry page actions', () => {
  it('sends one status change on a double click, with 44 px buttons', async () => {
    getLibraryEntry.mockResolvedValue(entry({ status: 'backlog' }));
    changeStatus.mockImplementation(() => new Promise(() => {})); // never settles: still busy
    renderEntry();
    const button = await screen.findByRole('button', { name: 'Move to Playing' });
    expect(button.className).toMatch(/min-h-11/);
    await userEvent.dblClick(button);
    expect(changeStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Move to Playing' })).toBeDisabled();
  });

  it('removes only after an in-place confirm whose safe choice has focus', async () => {
    getLibraryEntry.mockResolvedValue(entry());
    removeFromLibrary.mockResolvedValue();
    renderEntry();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove from library' }));
    const group = screen.getByRole('group', { name: 'Confirm removal' });
    expect(removeFromLibrary).not.toHaveBeenCalled();
    await waitFor(() => expect(within(group).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await userEvent.click(within(group).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Confirm removal' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove from library' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm removal' })).getByRole('button', { name: 'Remove' }));
    expect(removeFromLibrary).toHaveBeenCalledWith('e1');
  });

  it('updates manual progress and disables save button after successful save', async () => {
    getLibraryEntry.mockResolvedValue(entry({ manualProgress: 30 }));
    setProgress.mockResolvedValue({ id: 'e1', manualProgress: 60 });
    renderEntry();

    const slider = await screen.findByLabelText('Manual progress');
    const saveBtn = screen.getByRole('button', { name: 'Save progress' });
    expect(saveBtn).toBeDisabled();

    fireEvent.change(slider, { target: { value: '60' } });
    expect(saveBtn).not.toBeDisabled();

    await userEvent.click(saveBtn);
    expect(setProgress).toHaveBeenCalledWith('e1', 60);
    await waitFor(() => expect(saveBtn).toBeDisabled());
  });

  it('preserves tab state across switching tabs because panels are forceMounted', async () => {
    getLibraryEntry.mockResolvedValue(entry({ manualProgress: 30 }));
    renderEntry();

    // Switch to Journal tab and click Add note
    const journalTab = await screen.findByRole('tab', { name: 'Journal' });
    await userEvent.click(journalTab);

    const addNoteBtn = await screen.findByRole('button', { name: 'Add note' });
    await userEvent.click(addNoteBtn);

    const textarea = screen.getByPlaceholderText(/Where did you leave off/);
    await userEvent.type(textarea, 'Reached chapter 4 boss');
    expect(textarea).toHaveValue('Reached chapter 4 boss');

    // Switch back to Progress tab
    const progressTab = screen.getByRole('tab', { name: 'Progress' });
    await userEvent.click(progressTab);
    expect(screen.getByLabelText('Manual progress')).toBeInTheDocument();

    // Switch back to Journal tab - draft note must still be there
    await userEvent.click(journalTab);
    expect(screen.getByPlaceholderText(/Where did you leave off/)).toHaveValue('Reached chapter 4 boss');
  });
});