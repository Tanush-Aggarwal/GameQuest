import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import VerifyEmail from '@/pages/VerifyEmail.jsx';
import Register from '@/pages/Register.jsx';
import Login from '@/pages/Login.jsx';
import { AuthContext } from '@/features/auth/AuthContext.jsx';
import * as authApi from '@/services/authApi.js';

vi.mock('@/services/authApi.js');
vi.mock('@/components/auth/CoverCollage.jsx', () => ({
  CoverCollage: () => <div data-testid="cover-collage" />,
}));

describe('Email Verification Client Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('VerifyEmail Page', () => {
    it('renders verification form with 6 digit boxes and pre-filled email from query param', () => {
      render(
        <MemoryRouter initialEntries={['/verify-email?email=test%40gamequest.dev']}>
          <VerifyEmail />
        </MemoryRouter>,
      );

      expect(screen.getByRole('heading', { name: /Email verification/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Email address/i)).toHaveValue('test@gamequest.dev');
      expect(screen.getByLabelText(/Digit 1 of 6/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Digit 6 of 6/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Verify Email Code/i })).toBeDisabled();
    });

    it('submits 6-digit code and email, displays success state upon verification', async () => {
      authApi.verifyEmail.mockResolvedValueOnce({
        success: true,
        message: 'Your email address has been verified successfully.',
      });

      render(
        <MemoryRouter initialEntries={['/verify-email?email=player%40gamequest.dev']}>
          <VerifyEmail />
        </MemoryRouter>,
      );

      const d1 = screen.getByLabelText('Digit 1 of 6');
      const d2 = screen.getByLabelText('Digit 2 of 6');
      const d3 = screen.getByLabelText('Digit 3 of 6');
      const d4 = screen.getByLabelText('Digit 4 of 6');
      const d5 = screen.getByLabelText('Digit 5 of 6');
      const d6 = screen.getByLabelText('Digit 6 of 6');

      await userEvent.type(d1, '1');
      await userEvent.type(d2, '2');
      await userEvent.type(d3, '3');
      await userEvent.type(d4, '4');
      await userEvent.type(d5, '5');
      await userEvent.type(d6, '6');

      const submitBtn = screen.getByRole('button', { name: /Verify Email Code/i });
      expect(submitBtn).not.toBeDisabled();

      await userEvent.click(submitBtn);

      await waitFor(() => {
        expect(authApi.verifyEmail).toHaveBeenCalledWith({
          email: 'player@gamequest.dev',
          code: '123456',
        });
      });

      expect(await screen.findByText(/Account activated!/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Log in to GameQuest/i })).toBeInTheDocument();
    });

    it('handles paste of 6-digit code across digit inputs', () => {
      render(
        <MemoryRouter initialEntries={['/verify-email?email=player%40gamequest.dev']}>
          <VerifyEmail />
        </MemoryRouter>,
      );

      const d1 = screen.getByLabelText('Digit 1 of 6');
      fireEvent.paste(d1, {
        clipboardData: {
          getData: () => '654321',
        },
      });

      expect(screen.getByLabelText('Digit 1 of 6')).toHaveValue('6');
      expect(screen.getByLabelText('Digit 2 of 6')).toHaveValue('5');
      expect(screen.getByLabelText('Digit 3 of 6')).toHaveValue('4');
      expect(screen.getByLabelText('Digit 4 of 6')).toHaveValue('3');
      expect(screen.getByLabelText('Digit 5 of 6')).toHaveValue('2');
      expect(screen.getByLabelText('Digit 6 of 6')).toHaveValue('1');
    });

    it('displays error state with remaining attempts when code verification fails', async () => {
      authApi.verifyEmail.mockRejectedValueOnce({
        response: {
          status: 401,
          data: {
            error: {
              code: 'INVALID_CODE',
              message: 'Incorrect verification code.',
              details: { attemptsRemaining: 4 },
            },
          },
        },
      });

      render(
        <MemoryRouter initialEntries={['/verify-email?email=player%40gamequest.dev']}>
          <VerifyEmail />
        </MemoryRouter>,
      );

      const d1 = screen.getByLabelText('Digit 1 of 6');
      fireEvent.paste(d1, {
        clipboardData: {
          getData: () => '000000',
        },
      });

      await userEvent.click(screen.getByRole('button', { name: /Verify Email Code/i }));

      expect(await screen.findByText(/Verification failed/i)).toBeInTheDocument();
      expect(screen.getByText(/Incorrect verification code/i)).toBeInTheDocument();
      expect(screen.getByText(/4 attempts remaining/i)).toBeInTheDocument();
    });

    it('resends verification code and starts 60-second cooldown', async () => {
      authApi.resendVerification.mockResolvedValueOnce({
        message: 'If an unverified account exists for that email address, a verification code has been sent.',
      });

      render(
        <MemoryRouter initialEntries={['/verify-email?email=player%40gamequest.dev']}>
          <VerifyEmail />
        </MemoryRouter>,
      );

      const resendBtn = screen.getByRole('button', { name: /Resend code/i });
      await userEvent.click(resendBtn);

      await waitFor(() => {
        expect(authApi.resendVerification).toHaveBeenCalledWith({ email: 'player@gamequest.dev' });
      });

      expect(await screen.findByRole('button', { name: /Resend code \(60s\)/i })).toBeDisabled();
    });
  });

  describe('Register Page Verification Pending', () => {
    it('navigates to verify-email with email query param when registration requires verification', async () => {
      const mockRegister = vi.fn().mockResolvedValueOnce({
        user: { id: '1', username: 'NewPlayer', email: 'newplayer@example.com' },
        emailVerificationPending: true,
      });

      render(
        <MemoryRouter initialEntries={['/register']}>
          <AuthContext.Provider value={{ register: mockRegister }}>
            <Routes>
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<div data-testid="verify-email-page">Verify Email Destination</div>} />
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>,
      );

      await userEvent.type(screen.getByLabelText(/Username/i), 'NewPlayer');
      await userEvent.type(screen.getByLabelText(/^Email/i), 'newplayer@example.com');
      await userEvent.type(screen.getByLabelText(/^Password/i), 'ValidPassword123!');

      await userEvent.click(screen.getByRole('button', { name: /Create account/i }));

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({
          username: 'NewPlayer',
          email: 'newplayer@example.com',
        }));
      });

      expect(await screen.findByTestId('verify-email-page')).toBeInTheDocument();
    });
  });

  describe('Login Page Unverified Banner', () => {
    it('shows unverified banner with link to enter code and resend action when login returns EMAIL_NOT_VERIFIED', async () => {
      const mockLogin = vi.fn().mockRejectedValueOnce({
        response: {
          status: 401,
          data: {
            error: {
              code: 'EMAIL_NOT_VERIFIED',
              message: 'Please verify your email address before logging in.',
              details: { email: 'unverified@example.com', unverified: true },
            },
          },
        },
      });

      authApi.resendVerification.mockResolvedValueOnce({
        message: 'If an unverified account exists for that email address, a verification code has been sent.',
      });

      render(
        <MemoryRouter initialEntries={['/login']}>
          <AuthContext.Provider value={{ login: mockLogin }}>
            <Login />
          </AuthContext.Provider>
        </MemoryRouter>,
      );

      await userEvent.type(screen.getByLabelText(/^Email/i), 'unverified@example.com');
      await userEvent.type(screen.getByLabelText(/^Password/i), 'ValidPassword123!');
      await userEvent.click(screen.getByRole('button', { name: /Log in/i }));

      expect(await screen.findByText(/Email verification required/i)).toBeInTheDocument();
      expect(screen.getByText(/unverified@example.com/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Enter 6-digit verification code/i })).toHaveAttribute(
        'href',
        '/verify-email?email=unverified%40example.com',
      );
      const resendBtn = screen.getByRole('button', { name: /Resend verification code/i });
      expect(resendBtn).toBeInTheDocument();

      await userEvent.click(resendBtn);
      await waitFor(() => {
        expect(authApi.resendVerification).toHaveBeenCalledWith({ email: 'unverified@example.com' });
      });
    });
  });
});
