import { jest } from '@jest/globals';
import { createEmailService } from '../services/emailService.js';

describe('emailService (Resend HTTPS API)', () => {
  it('reports unconfigured when RESEND_API_KEY is missing', () => {
    const service = createEmailService({
      config: {
        env: 'test',
        clientOrigin: 'http://localhost:5173',
        email: { resendApiKey: null },
      },
    });
    expect(service.isConfigured()).toBe(false);
  });

  it('reports configured when RESEND_API_KEY is present', () => {
    const service = createEmailService({
      config: {
        env: 'test',
        clientOrigin: 'http://localhost:5173',
        email: {
          resendApiKey: 're_test_1234567890abcdef',
        },
      },
    });
    expect(service.isConfigured()).toBe(true);
  });

  it('reports configured when resendClient is explicitly injected', () => {
    const mockResend = { emails: { send: jest.fn() } };
    const service = createEmailService({
      config: {
        env: 'test',
        clientOrigin: 'http://localhost:5173',
        email: {},
      },
      resendClient: mockResend,
    });
    expect(service.isConfigured()).toBe(true);
  });

  it('safely simulates email in test environment without throwing when unconfigured', async () => {
    const service = createEmailService({
      config: {
        env: 'test',
        clientOrigin: 'http://localhost:5173',
        email: {},
      },
    });
    const result = await service.sendPasswordResetEmail({
      to: 'player@example.com',
      username: 'Player_One',
      token: 'abc123token',
    });
    expect(result.sent).toBe(false);
    expect(result.testToken).toBe('abc123token');

    const verifyResult = await service.sendVerificationEmail({
      to: 'player@example.com',
      username: 'Player_One',
      code: '654321',
    });
    expect(verifyResult.sent).toBe(false);
    expect(verifyResult.testCode).toBe('654321');

    const changedResult = await service.sendPasswordChangedNotification({
      to: 'player@example.com',
      username: 'Player_One',
    });
    expect(changedResult.sent).toBe(false);
  });

  describe('Password Reset Link Construction & Origin Handling', () => {
    const testCases = [
      {
        desc: 'local desktop environment (localhost)',
        origin: 'http://localhost:5174',
        expectedPrefix: 'http://localhost:5174/reset-password?token=',
      },
      {
        desc: 'local mobile LAN testing (IP address)',
        origin: 'http://192.168.1.15:5174',
        expectedPrefix: 'http://192.168.1.15:5174/reset-password?token=',
      },
      {
        desc: 'production canonical Vercel deployment',
        origin: 'https://gamequest-five.vercel.app',
        expectedPrefix: 'https://gamequest-five.vercel.app/reset-password?token=',
      },
    ];

    for (const { desc, origin, expectedPrefix } of testCases) {
      it(`constructs correct password reset link for ${desc}`, async () => {
        const service = createEmailService({
          config: {
            env: 'development',
            clientOrigin: origin,
            email: {},
          },
        });

        const res = await service.sendPasswordResetEmail({
          to: 'gamer@example.com',
          username: 'GamerGuy',
          token: 'crypto-random-token-xyz-123',
        });

        expect(res.sent).toBe(false);
        expect(res.devResetUrl).toBe(`${expectedPrefix}crypto-random-token-xyz-123`);
      });
    }

    it('safely URL-encodes reset tokens with special characters', async () => {
      const service = createEmailService({
        config: {
          env: 'development',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: {},
        },
      });

      const res = await service.sendPasswordResetEmail({
        to: 'gamer@example.com',
        username: 'GamerGuy',
        token: 'token with spaces&symbols==',
      });

      expect(res.devResetUrl).toBe('https://gamequest-five.vercel.app/reset-password?token=token%20with%20spaces%26symbols%3D%3D');
    });
  });

  describe('Resend Delivery (Mocked SDK)', () => {
    let mockSend;
    let mockResend;
    let mockLogger;

    beforeEach(() => {
      mockSend = jest.fn();
      mockResend = { emails: { send: mockSend } };
      mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    });

    it('sends 6-digit verification code email via Resend with onboarding@resend.dev sender default', async () => {
      mockSend.mockResolvedValueOnce({
        data: { id: 'resend_msg_001' },
        error: null,
      });

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { resendApiKey: 're_dummy_key' },
        },
        logger: mockLogger,
        resendClient: mockResend,
      });

      const result = await service.sendVerificationEmail({
        to: 'tester@example.com',
        username: 'QuestHero',
        code: '748291',
      });

      expect(result).toEqual({ sent: true, id: 'resend_msg_001' });
      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg.from).toBe('GameQuest <onboarding@resend.dev>');
      expect(callArg.to).toBe('tester@example.com');
      expect(callArg.subject).toBe('Your GameQuest verification code is 748291');
      expect(callArg.text).toContain('748291');
      expect(callArg.html).toContain('748291');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 't***r@example.com', id: 'resend_msg_001' }),
        expect.any(String),
      );
    });

    it('sends password reset email via Resend using custom EMAIL_FROM sender', async () => {
      mockSend.mockResolvedValueOnce({
        data: { id: 'resend_msg_002' },
        error: null,
      });

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: {
            resendApiKey: 're_dummy_key',
            from: 'GameQuest Support <security@gamequest.app>',
          },
        },
        logger: mockLogger,
        resendClient: mockResend,
      });

      const result = await service.sendPasswordResetEmail({
        to: 'alex@example.com',
        username: 'AlexPlayer',
        token: 'secret-token-12345',
      });

      expect(result).toEqual({ sent: true, id: 'resend_msg_002' });
      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg.from).toBe('GameQuest Support <security@gamequest.app>');
      expect(callArg.to).toBe('alex@example.com');
      expect(callArg.subject).toBe('Reset your GameQuest password');
      expect(callArg.text).toContain('https://gamequest-five.vercel.app/reset-password?token=secret-token-12345');
      expect(callArg.html).toContain('https://gamequest-five.vercel.app/reset-password?token=secret-token-12345');
    });

    it('sends password changed notification via Resend', async () => {
      mockSend.mockResolvedValueOnce({
        data: { id: 'resend_msg_003' },
        error: null,
      });

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { resendApiKey: 're_dummy_key' },
        },
        logger: mockLogger,
        resendClient: mockResend,
      });

      const result = await service.sendPasswordChangedNotification({
        to: 'alex@example.com',
        username: 'AlexPlayer',
      });

      expect(result).toEqual({ sent: true, id: 'resend_msg_003' });
      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg.subject).toBe('Your GameQuest password was changed');
    });

    it('does NOT report success when Resend API returns an error response (e.g. unverified domain or restricted recipient)', async () => {
      mockSend.mockResolvedValueOnce({
        data: null,
        error: {
          name: 'validation_error',
          message: 'You can only send testing emails to your own email address.',
          statusCode: 403,
        },
      });

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { resendApiKey: 're_dummy_key' },
        },
        logger: mockLogger,
        resendClient: mockResend,
      });

      await expect(
        service.sendVerificationEmail({
          to: 'someoneelse@gmail.com',
          username: 'Guest',
          code: '123456',
        }),
      ).rejects.toThrow('You can only send testing emails to your own email address.');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: { name: 'validation_error', message: 'You can only send testing emails to your own email address.' },
          recipient: 's***e@gmail.com',
        }),
        expect.stringMatching(/failed/i),
      );
    });

    it('handles unexpected network failure or SDK rejection gracefully and sanitizes logs', async () => {
      mockSend.mockRejectedValueOnce(new Error('Connection timeout to api.resend.com'));

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { resendApiKey: 're_dummy_key' },
        },
        logger: mockLogger,
        resendClient: mockResend,
      });

      await expect(
        service.sendPasswordResetEmail({
          to: 'gamer@example.com',
          username: 'GamerGuy',
          token: 'token-xyz',
        }),
      ).rejects.toThrow('Connection timeout to api.resend.com');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: { name: 'Error', message: 'Connection timeout to api.resend.com' },
          recipient: 'g***r@example.com',
        }),
        expect.any(String),
      );
    });

    it('warns and returns { sent: false } in production when Resend is unconfigured', async () => {
      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { resendApiKey: null },
        },
        logger: mockLogger,
      });

      const resVerify = await service.sendVerificationEmail({
        to: 'gamer@example.com',
        username: 'GamerGuy',
        code: '123456',
      });
      expect(resVerify.sent).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'g***r@example.com' }),
        expect.stringMatching(/not configured in production/i),
      );

      const resReset = await service.sendPasswordResetEmail({
        to: 'gamer@example.com',
        username: 'GamerGuy',
        token: 'token-abc',
      });
      expect(resReset.sent).toBe(false);
    });
  });
});
