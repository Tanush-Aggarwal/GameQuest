import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Login from '@/pages/Login.jsx';
import Register from '@/pages/Register.jsx';
import { AuthContext } from './AuthContext.jsx';

// the collage behind the form; its own tests are in CoverCollage.test.jsx
vi.mock('@/services/publicApi.js', () => ({ getPublicCovers: vi.fn().mockResolvedValue([]) }));

function renderPage(Page, auth = {}, url = '/') {
  const value = { login: vi.fn(), register: vi.fn(), ...auth };
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[url]}>
        <Page />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return value;
}

const apiError = (status, error) => Object.assign(new Error('x'), { response: { status, data: { error } } });

describe('Login form', () => {
  it('shows field errors from the shared schema and does not call the API', async () => {
    const value = renderPage(Login);
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(value.login).not.toHaveBeenCalled();
  });

  it('submits normalised credentials', async () => {
    const value = renderPage(Login);
    await userEvent.type(screen.getByLabelText('Email'), ' Neo@Example.com ');
    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(value.login).toHaveBeenCalledWith({ email: 'neo@example.com', password: 'secret-pass' }));
  });

  it('shows the API message as a form error on bad credentials', async () => {
    const login = vi.fn().mockRejectedValue(apiError(401, { code: 'AUTH_ERROR', message: 'Invalid email or password' }));
    renderPage(Login, { login });
    await userEvent.type(screen.getByLabelText('Email'), 'neo@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  it('explains a network failure', async () => {
    const login = vi.fn().mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    renderPage(Login, { login });
    await userEvent.type(screen.getByLabelText('Email'), 'neo@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever-1');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot reach the server/i);
  });
});

describe('Continue with Google', () => {
  it('is a link to the API that starts the Google flow, on both pages', () => {
    for (const Page of [Login, Register]) {
      const { unmount } = render(
        <AuthContext.Provider value={{ login: vi.fn(), register: vi.fn() }}>
          <MemoryRouter>
            <Page />
          </MemoryRouter>
        </AuthContext.Provider>,
      );
      expect(screen.getByRole('link', { name: 'Continue with Google' }).getAttribute('href')).toMatch(/\/auth\/google$/);
      unmount();
    }
  });

  it('says the Terms and Privacy Policy apply', () => {
    renderPage(Login);
    const notice = within(screen.getByTestId('google-terms-notice'));
    expect(notice.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(notice.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });

  it('shows why Google sign-in failed when the API sends people back with an error code', () => {
    renderPage(Login, {}, '/login?error=google_email_exists');
    expect(screen.getByRole('alert')).toHaveTextContent(/account with that email already exists/i);
  });

  it('shows nothing for an unknown error code', () => {
    renderPage(Login, {}, '/login?error=whatever');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Register form', () => {
  it('maps a 409 conflict onto the offending field', async () => {
    const register = vi
      .fn()
      .mockRejectedValue(apiError(409, { code: 'CONFLICT', message: 'That email is already taken', details: { field: 'email' } }));
    renderPage(Register, { register });
    await userEvent.type(screen.getByLabelText('Username'), 'neo_1');
    await userEvent.type(screen.getByLabelText('Email'), 'neo@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'long-enough-1');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('That email is already taken')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects a short password before calling the API', async () => {
    const value = renderPage(Register);
    await userEvent.type(screen.getByLabelText('Username'), 'neo_1');
    await userEvent.type(screen.getByLabelText('Email'), 'neo@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(value.register).not.toHaveBeenCalled();
  });

  it('submits acceptTerms: true when the checkbox is checked', async () => {
    const value = renderPage(Register);
    await userEvent.type(screen.getByLabelText('Username'), 'neo_1');
    await userEvent.type(screen.getByLabelText('Email'), 'neo@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'valid-password-1');
    await userEvent.click(screen.getByRole('checkbox', { name: /terms/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() =>
      expect(value.register).toHaveBeenCalledWith({
        username: 'neo_1',
        email: 'neo@example.com',
        password: 'valid-password-1',
        acceptTerms: true,
      }),
    );
  });
});
