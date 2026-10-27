import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/services/collectionsApi.js', () => ({
  listCollections: vi.fn(),
  createCollection: vi.fn(),
  getCollection: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  addCollectionItem: vi.fn(),
  removeCollectionItem: vi.fn(),
  moveCollectionItem: vi.fn(),
  previewRules: vi.fn(),
}));

const api = await import('@/services/collectionsApi.js');
const { default: Collections } = await import('./Collections.jsx');
const { default: Collection } = await import('./Collection.jsx');
const { AddToCollection } = await import('@/components/collections/AddToCollection.jsx');
const { RuleBuilder } = await import('@/components/collections/RuleBuilder.jsx');

const game = (title) => ({ id: `g-${title}`, slug: title.toLowerCase(), title, cover: null, genres: [], platforms: [] });
const item = (id, title, extra = {}) => ({ id, position: Number(id.replace(/\D/g, '')) || 1, note: '', entry: { id: `e-${id}`, status: 'backlog', game: game(title) }, ...extra });
const summary = (over = {}) => ({
  id: 'c1', name: 'Favourites', description: '', visibility: 'private', type: 'manual', rules: [],
  itemCount: 2, covers: [], isOwner: true, owner: { id: 'u1', username: 'demo' }, ...over,
});
const detail = (items, over = {}) => ({ collection: summary({ itemCount: items.length, ...over }), items, nextCursor: null, truncated: false });

const renderAt = (path, element = null) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/collections" element={<Collections />} />
        <Route path="/collections/:id" element={<Collection />} />
        <Route path="/library" element={<p>library page</p>} />
        {element && <Route path="/test" element={element} />}
      </Routes>
    </MemoryRouter>,
  );

const order = () => screen.getAllByRole('listitem').map((li) => within(li).queryByRole('link')?.textContent).filter(Boolean);
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Collections page', () => {
  it('shows a skeleton, then a card per collection with type and visibility labels', async () => {
    api.listCollections.mockResolvedValue({ items: [summary({ type: 'smart', visibility: 'public', name: 'Short backlog' })], nextCursor: null });
    renderAt('/collections');
    expect(screen.getByRole('status', { name: 'Loading collections' })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: /Short backlog/ });
    expect(link).toHaveAttribute('href', '/collections/c1');
    expect(within(link).getByText('Smart')).toBeInTheDocument();
    expect(within(link).getByText('Public')).toBeInTheDocument();
    expect(within(link).getByText('2 games')).toBeInTheDocument();
  });

  it('shows an empty state with one action', async () => {
    api.listCollections.mockResolvedValue({ items: [], nextCursor: null });
    renderAt('/collections');
    expect(await screen.findByText('No collections yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a collection' })).toHaveAttribute('href', '/collections?new=1');
  });

  it('shows a scoped error with Retry', async () => {
    api.listCollections.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ items: [summary()], nextCursor: null });
    renderAt('/collections');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: /Favourites/ })).toBeInTheDocument();
  });

  it('validates the create form inline and creates a manual collection', async () => {
    api.listCollections.mockResolvedValue({ items: [], nextCursor: null });
    api.createCollection.mockResolvedValue(summary({ id: 'new1', name: 'Best RPGs' }));
    api.getCollection.mockResolvedValue(detail([], { id: 'new1', name: 'Best RPGs' }));
    renderAt('/collections?new=1');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    expect(await screen.findByText(/too small|at least 1|Required/i)).toBeInTheDocument();
    expect(api.createCollection).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Name'), 'Best RPGs');
    await userEvent.selectOptions(screen.getByLabelText('Who can see it'), 'public');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    await waitFor(() => expect(api.createCollection).toHaveBeenCalledWith(expect.objectContaining({ name: 'Best RPGs', visibility: 'public', type: 'manual', rules: [] })));
    expect(await screen.findByRole('heading', { name: 'Best RPGs' })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Created "Best RPGs"');
  });

  it('creates a smart collection from rule rows with a live preview', async () => {
    api.listCollections.mockResolvedValue({ items: [], nextCursor: null });
    api.previewRules.mockResolvedValue({ total: 1, truncated: false, items: [item('i1', 'Celeste')] });
    api.createCollection.mockResolvedValue(summary({ id: 's1', type: 'smart', name: 'Short backlog' }));
    api.getCollection.mockResolvedValue(detail([], { id: 's1', type: 'smart', name: 'Short backlog', rules: [] }));
    renderAt('/collections?new=1');
    await userEvent.type(screen.getByLabelText('Name'), 'Short backlog');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'smart');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' })); // default rule is status = backlog
    await waitFor(() =>
      expect(api.createCollection).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'smart', rules: [{ field: 'status', op: 'eq', value: 'backlog' }] }),
      ),
    );
  });
});

describe('RuleBuilder', () => {
  it('only offers operators valid for the field and previews matches', async () => {
    api.previewRules.mockResolvedValue({ total: 2, truncated: false, items: [item('i1', 'Celeste'), item('i2', 'Hades')] });
    const onChange = vi.fn();
    render(<RuleBuilder onChange={onChange} />);
    const ops = () => within(screen.getByLabelText('Rule 1 operator')).getAllByRole('option').map((o) => o.textContent);
    expect(ops()).toEqual(['is', 'is not', 'is any of', 'is none of']); // status (enum)
    await userEvent.selectOptions(screen.getByLabelText('Rule 1 field'), 'timeToBeat.main');
    expect(ops()).toContain('≤');
    await userEvent.selectOptions(screen.getByLabelText('Rule 1 operator'), 'lte');
    await userEvent.type(screen.getByLabelText('Rule 1 value'), '15');
    expect(await screen.findByText('2 games match', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(api.previewRules).toHaveBeenLastCalledWith([{ field: 'timeToBeat.main', op: 'lte', value: 15 }]);
    expect(onChange).toHaveBeenLastCalledWith({ rules: [{ field: 'timeToBeat.main', op: 'lte', value: 15 }], valid: true });
  });

  it('reports invalid rules and skips the preview until every row is complete', async () => {
    const onChange = vi.fn();
    render(<RuleBuilder onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Rule 1 field'), 'manualProgress');
    expect(onChange).toHaveBeenLastCalledWith({ rules: [], valid: false });
    expect(screen.getByText('Complete every rule to see which games match.')).toBeInTheDocument();
    expect(api.previewRules).not.toHaveBeenCalled();
  });

  it('adds and removes rule rows', async () => {
    render(<RuleBuilder onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Remove rule 1' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(screen.getByRole('group', { name: 'Rule 2' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove rule 2' }));
    expect(screen.queryByRole('group', { name: 'Rule 2' })).not.toBeInTheDocument();
  });

  it('shows a scoped preview error with Retry', async () => {
    api.previewRules.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ total: 0, truncated: false, items: [] });
    render(<RuleBuilder initialRules={[{ field: 'status', op: 'eq', value: 'backlog' }]} onChange={() => {}} />);
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/No games in your library match/)).toBeInTheDocument();
  });
});

describe('Collection detail', () => {
  const three = () => [item('i1', 'Alpha'), item('i2', 'Beta'), item('i3', 'Gamma')];

  it('renders items in order with loading skeleton first', async () => {
    api.getCollection.mockResolvedValue(detail(three()));
    renderAt('/collections/c1');
    expect(screen.getByRole('status', { name: 'Loading collection' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Favourites' })).toBeInTheDocument();
    expect(order()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('reorders optimistically with the down button and sends the previous neighbour', async () => {
    const pending = deferred();
    api.getCollection.mockResolvedValue(detail(three()));
    api.moveCollectionItem.mockReturnValue(pending.promise);
    renderAt('/collections/c1');
    await screen.findByRole('heading', { name: 'Favourites' });
    await userEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    expect(order()).toEqual(['Beta', 'Alpha', 'Gamma']); // shown before the server answers
    expect(api.moveCollectionItem).toHaveBeenCalledWith('c1', 'i1', 'i2');
    pending.resolve({ id: 'i1', position: 2.5 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move Beta up' })).toBeDisabled());
    expect(order()).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('moves to the top with afterItemId = null', async () => {
    api.getCollection.mockResolvedValue(detail(three()));
    api.moveCollectionItem.mockResolvedValue({ id: 'i3', position: 0 });
    renderAt('/collections/c1');
    await screen.findByRole('heading', { name: 'Favourites' });
    await userEvent.click(screen.getByRole('button', { name: 'Move Beta up' }));
    expect(api.moveCollectionItem).toHaveBeenCalledWith('c1', 'i2', null);
    expect(order()).toEqual(['Beta', 'Alpha', 'Gamma']);
  });

  it('rolls back the order and toasts when the server rejects the move', async () => {
    api.getCollection.mockResolvedValue(detail(three()));
    api.moveCollectionItem.mockRejectedValue(new Error('down'));
    renderAt('/collections/c1');
    await screen.findByRole('heading', { name: 'Favourites' });
    await userEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Couldn't reorder")));
    expect(order()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('supports drag and drop reordering', async () => {
    api.getCollection.mockResolvedValue(detail(three()));
    api.moveCollectionItem.mockResolvedValue({ id: 'i1', position: 4 });
    renderAt('/collections/c1');
    await screen.findByRole('heading', { name: 'Favourites' });
    const rows = screen.getAllByRole('listitem');
    fireEvent.dragStart(rows[0]);
    fireEvent.dragOver(rows[2]);
    fireEvent.drop(rows[2]);
    await waitFor(() => expect(api.moveCollectionItem).toHaveBeenCalledWith('c1', 'i1', 'i3'));
    expect(order()).toEqual(['Beta', 'Gamma', 'Alpha']);
  });

  it('removes an item only after confirming', async () => {
    api.getCollection.mockResolvedValue(detail(three()));
    api.removeCollectionItem.mockResolvedValue();
    renderAt('/collections/c1');
    await screen.findByRole('heading', { name: 'Favourites' });
    await userEvent.click(screen.getByRole('button', { name: 'Remove Beta from collection' }));
    expect(api.removeCollectionItem).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm removing Beta' })).getByRole('button', { name: 'Remove' }));
    expect(api.removeCollectionItem).toHaveBeenCalledWith('c1', 'i2');
    await waitFor(() => expect(order()).toEqual(['Alpha', 'Gamma']));
  });

  it('shows no editing controls for a smart collection or for someone else’s collection', async () => {
    api.getCollection.mockResolvedValue(detail(three(), { type: 'smart', rules: [{ field: 'status', op: 'eq', value: 'backlog' }] }));
    const { unmount } = renderAt('/collections/c1');
    expect(await screen.findByText(/Filled automatically: Status is backlog/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move Alpha/ })).not.toBeInTheDocument();
    unmount();

    api.getCollection.mockResolvedValue(detail(three(), { isOwner: false, visibility: 'public' }));
    renderAt('/collections/c1');
    expect(await screen.findByText('by demo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move Alpha/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/games/alpha');
  });

  it('shows empty, not-found and error states', async () => {
    api.getCollection.mockResolvedValue(detail([]));
    const first = renderAt('/collections/c1');
    expect(await screen.findByText('This collection is empty')).toBeInTheDocument();
    first.unmount();

    api.getCollection.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 404, data: { error: { code: 'NOT_FOUND', message: 'Collection not found' } } } }));
    const second = renderAt('/collections/c1');
    expect(await screen.findByText('Collection not found')).toBeInTheDocument();
    second.unmount();

    api.getCollection.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(detail(three()));
    renderAt('/collections/c1');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Favourites' })).toBeInTheDocument();
  });

  it('deletes the collection after confirming and returns to the list', async () => {
    api.getCollection.mockResolvedValue(detail(three()));
    api.deleteCollection.mockResolvedValue();
    api.listCollections.mockResolvedValue({ items: [], nextCursor: null });
    renderAt('/collections/c1');
    await screen.findByRole('heading', { name: 'Favourites' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete collection' }));
    expect(api.deleteCollection).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('group', { name: 'Confirm deleting collection' })).getByRole('button', { name: 'Delete' }));
    expect(api.deleteCollection).toHaveBeenCalledWith('c1');
    expect(await screen.findByText('No collections yet')).toBeInTheDocument();
  });
});

describe('AddToCollection', () => {
  const renderPicker = () =>
    render(
      <MemoryRouter>
        <AddToCollection entryId="e1" />
      </MemoryRouter>,
    );

  it('adds the entry to the chosen collection', async () => {
    api.listCollections.mockResolvedValue({ items: [summary({ id: 'c1' }), summary({ id: 'c2', name: 'Cozy games' })], nextCursor: null });
    api.addCollectionItem.mockResolvedValue({});
    renderPicker();
    await userEvent.click(await screen.findByRole('button', { name: 'Add to Cozy games' }));
    expect(api.addCollectionItem).toHaveBeenCalledWith('c2', { entryId: 'e1' });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Added to "Cozy games"'));
    expect(api.listCollections).toHaveBeenCalledWith({ type: 'manual', limit: 50 }, expect.anything());
  });

  it('toasts the server message when the game is already in the collection', async () => {
    api.listCollections.mockResolvedValue({ items: [summary()], nextCursor: null });
    api.addCollectionItem.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 409, data: { error: { code: 'CONFLICT', message: 'That game is already in this collection' } } } }));
    renderPicker();
    await userEvent.click(await screen.findByRole('button', { name: 'Add to Favourites' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('That game is already in this collection'));
  });

  it('offers to create a collection when there are none, and shows a scoped error with Retry', async () => {
    api.listCollections.mockResolvedValueOnce({ items: [], nextCursor: null });
    const first = renderPicker();
    expect(await screen.findByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/collections?new=1');
    first.unmount();

    api.listCollections.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce({ items: [summary()], nextCursor: null });
    renderPicker();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Add to Favourites' })).toBeInTheDocument();
  });
});
