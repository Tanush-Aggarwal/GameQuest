import { vi } from 'vitest';

vi.mock('./api.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const { api } = await import('./api.js');
const { restoreSession } = await import('./authApi.js');

const http401 = () => Object.assign(new Error('401'), { response: { status: 401 } });

beforeEach(() => vi.resetAllMocks());

describe('restoreSession', () => {
  it('returns the user when the access cookie is valid', async () => {
    api.get.mockResolvedValue({ data: { user: { id: '1' } } });
    expect(await restoreSession()).toEqual({ id: '1' });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('falls back to one refresh when /me says 401', async () => {
    api.get.mockRejectedValue(http401());
    api.post.mockResolvedValue({ data: { user: { id: '2' } } });
    expect(await restoreSession()).toEqual({ id: '2' });
  });

  it('returns null when both /me and refresh say 401', async () => {
    api.get.mockRejectedValue(http401());
    api.post.mockRejectedValue(http401());
    expect(await restoreSession()).toBeNull();
  });

  it('throws on non-401 failures so the UI can show a retry', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('down'), { code: 'ERR_NETWORK' }));
    await expect(restoreSession()).rejects.toThrow('down');
  });

  it('shares one in-flight request between concurrent callers', async () => {
    api.get.mockRejectedValue(http401());
    api.post.mockResolvedValue({ data: { user: { id: '3' } } });
    const [a, b] = await Promise.all([restoreSession(), restoreSession()]);
    expect(a).toEqual(b);
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
