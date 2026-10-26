import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('@/services/recommendationsApi.js', () => ({
  listInbox: vi.fn(),
  listSent: vi.fn(),
  sendRecommendation: vi.fn(),
  respondRecommendation: vi.fn(),
  deleteRecommendation: vi.fn(),
  getPickScore: vi.fn(),
}));

vi.mock('@/services/socialApi.js', () => ({
  listFriends: vi.fn(),
  listRequests: vi.fn().mockResolvedValue({ incoming: [], outgoing: [] }),
}));

const recApi = await import('@/services/recommendationsApi.js');
const socialApi = await import('@/services/socialApi.js');
const { RecommendationsTab } = await import('@/components/recommendations/RecommendationsTab.jsx');
const { RecommendationModal } = await import('@/components/recommendations/RecommendationModal.jsx');

const renderWithRouter = (ui) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={ui} />
      </Routes>
    </MemoryRouter>,
  );

describe('RecommendationsTab', () => {
  beforeEach(() => {
    recApi.listSent.mockResolvedValue({ items: [], cursor: null, hasMore: false });
    recApi.getPickScore.mockResolvedValue({ totalSent: 0, acceptedCount: 0, completedCount: 0 });
  });

  it('renders pick score and inbox list', async () => {
    recApi.getPickScore.mockResolvedValue({
      totalSent: 5,
      acceptedCount: 4,
      completedCount: 2,
      averageRating: 4.8,
    });
    recApi.listInbox.mockResolvedValue({
      items: [
        {
          id: 'rec1',
          from: { id: 'u1', username: 'alex' },
          to: { id: 'u2', username: 'demo' },
          game: { title: 'Celeste', slug: 'celeste', cover: 'celeste.jpg' },
          message: 'One of the best platformers ever',
          status: 'pending',
          review: { rating: 5, body: 'Must play' },
          recipientStatus: null,
          createdAt: new Date().toISOString(),
        },
      ],
      cursor: null,
      hasMore: false,
    });

    renderWithRouter(<RecommendationsTab />);

    await waitFor(() => {
      expect(screen.getByText('Your Recommendation Pick Score')).toBeInTheDocument();
      expect(screen.getByText('Celeste')).toBeInTheDocument();
      expect(screen.getByText(/@alex/)).toBeInTheDocument();
      expect(screen.getByText(/One of the best platformers ever/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Add to Backlog/i })).toBeInTheDocument();
    });
  });

  it('accepts a recommendation and updates via API', async () => {
    const user = userEvent.setup();
    recApi.listInbox.mockResolvedValue({
      items: [
        {
          id: 'rec1',
          from: { id: 'u1', username: 'alex' },
          to: { id: 'u2', username: 'demo' },
          game: { title: 'Hades', slug: 'hades' },
          message: 'Try it!',
          status: 'pending',
          recipientStatus: null,
        },
      ],
      cursor: null,
      hasMore: false,
    });
    recApi.respondRecommendation.mockResolvedValue({ id: 'rec1', status: 'accepted' });

    renderWithRouter(<RecommendationsTab />);

    await waitFor(() => expect(screen.getByText('Hades')).toBeInTheDocument());

    const addBtn = screen.getByRole('button', { name: /Add to Backlog/i });
    await user.click(addBtn);

    expect(recApi.respondRecommendation).toHaveBeenCalledWith('rec1', {
      status: 'accepted',
      libraryStatus: 'backlog',
    });
  });
});

describe('RecommendationModal', () => {
  it('loads friends and sends a recommendation', async () => {
    const user = userEvent.setup();
    socialApi.listFriends.mockResolvedValue({
      friends: [{ id: 'f1', username: 'alex' }],
    });
    recApi.sendRecommendation.mockResolvedValue({ id: 'rec1' });
    const onClose = vi.fn();

    renderWithRouter(
      <RecommendationModal
        game={{ id: 'g1', title: 'Hades' }}
        isOpen={true}
        onClose={onClose}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Recommend Hades/i)).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'alex' })).toBeInTheDocument();
    });

    const msgBox = screen.getByRole('textbox', { name: /Why should they play it/i });
    await user.type(msgBox, 'Great rogue-lite!');

    const sendBtn = screen.getByRole('button', { name: /Send Recommendation/i });
    await user.click(sendBtn);

    expect(recApi.sendRecommendation).toHaveBeenCalledWith({
      toId: 'f1',
      gameId: 'g1',
      message: 'Great rogue-lite!',
    });
    expect(toast.success).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
