import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import ForgotPassword from './ForgotPassword.jsx';
import ResetPassword from './ResetPassword.jsx';

vi.mock('@/services/publicApi.js', () => ({ getPublicCovers: vi.fn().mockResolvedValue([]) }));
vi.mock('@/services/authApi.js', () => ({
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}));

const { forgotPassword, resetPassword } = await import('@/services/authApi.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ForgotPassword Page', () => {
  it('renders recovery form with email field and links to login', () => {
    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /reset your password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset instructions/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login');
  });

  it('validates email format before submitting', async () => {
    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/email/i), 'invalid-email');
    await userEvent.click(screen.getByRole('button', { name: /send reset instructions/i }));

    expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    expect(forgotPassword).not.toHaveBeenCalled();
  });

  it('submits valid email and displays confirmation message', async () => {
    forgotPassword.mockResolvedValueOnce({
      message: "If an eligible account exists for that email address, we'll send instructions to reset its password.",
    });

    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/email/i), 'player@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset instructions/i }));

    await waitFor(() => expect(forgotPassword).toHaveBeenCalledWith({ email: 'player@example.com' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/check your inbox/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /return to log in/i })).toHaveAttribute('href', '/login');
  });
});

describe('ResetPassword Page', () => {
  it('displays error state when token query param is missing', () => {
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/missing a valid security token/i);
    expect(screen.getByRole('link', { name: /request new reset link/i })).toHaveAttribute('href', '/forgot-password');
  });

  it('validates password length and password match', async () => {
    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-test-token']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/^new password/i), 'short');
    await userEvent.type(screen.getByLabelText(/^confirm new password/i), 'different-password');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('submits token and matching password, then shows success message', async () => {
    resetPassword.mockResolvedValueOnce({ success: true });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=valid-test-token']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/^new password/i), 'secure-password-123');
    await userEvent.type(screen.getByLabelText(/^confirm new password/i), 'secure-password-123');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith({
        token: 'valid-test-token',
        password: 'secure-password-123',
      }),
    );

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/password updated successfully/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /log in to gamequest/i })).toHaveAttribute('href', '/login');
  });

  it('displays server error when reset token is invalid or expired', async () => {
    resetPassword.mockRejectedValueOnce({
      response: {
        status: 401,
        data: { error: { message: 'This password reset link is invalid or has expired. Please request a new one.' } },
      },
    });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=expired-token']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/^new password/i), 'secure-password-123');
    await userEvent.type(screen.getByLabelText(/^confirm new password/i), 'secure-password-123');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
    expect(screen.getByRole('link', { name: /request a new reset link/i })).toHaveAttribute('href', '/forgot-password');
  });
});
