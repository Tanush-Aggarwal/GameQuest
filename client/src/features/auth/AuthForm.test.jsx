import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import Login from '@/pages/Login.jsx';
import Register from '@/pages/Register.jsx';
import { AuthContext } from './AuthContext.jsx';

// the collage behind the form; its own tests are in CoverCollage.test.jsx
vi.mock('@/services/publicApi.js', () => ({ getPublicCovers: vi.fn().mockResolvedValue([]) }));

function renderPage(Page, auth = {}) {
  const value = { login: vi.fn(), register: vi.fn(), ...auth };
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter>
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
