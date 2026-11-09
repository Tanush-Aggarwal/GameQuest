import { jest } from '@jest/globals';
import { createEmailService } from '../services/emailService.js';

describe('emailService (Google Apps Script HTTPS Mail Relay)', () => {
  it('reports unconfigured when MAIL_RELAY_URL or MAIL_RELAY_SECRET is missing', () => {
    const service1 = createEmailService({
      config: {
        env: 'test',
        clientOrigin: 'http://localhost:5173',
        email: { relayUrl: null, relaySecret: 'my_secret' },
      },
    });
    expect(service1.isConfigured()).toBe(false);

    const service2 = createEmailService({
      config: {
        env: 'test',
        clientOrigin: 'http://localhost:5173',
        email: { relayUrl: 'https://script.google.com/macros/s/xyz/exec', relaySecret: null },
      },
    });
    expect(service2.isConfigured()).toBe(false);
  });

  it('reports configured when both relayUrl and relaySecret are present', () => {
    const service = createEmailService({
      config: {
        env: 'test',
        clientOrigin: 'http://localhost:5173',
        email: {
          relayUrl: 'https://script.google.com/macros/s/xyz/exec',
          relaySecret: 'relay_shared_secret_123',
        },
      },
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

  describe('Mail Relay Delivery (Mocked Fetch)', () => {
    const mockRelayUrl = 'https://script.google.com/macros/s/AKfycbx_fake_script_id/exec';
    const mockSecret = 'super_secret_relay_key_456';
    let mockFetch;
    let mockLogger;

    beforeEach(() => {
      mockFetch = jest.fn();
      mockLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    });

    it('sends 6-digit verification code email via relay POST payload and handles { ok: true }', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { relayUrl: mockRelayUrl, relaySecret: mockSecret },
        },
        logger: mockLogger,
        fetchFn: mockFetch,
      });

      const result = await service.sendVerificationEmail({
        to: 'tester@example.com',
        username: 'QuestHero',
        code: '748291',
      });

      expect(result).toEqual({ sent: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(mockRelayUrl);
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({ 'Content-Type': 'application/json' });

      const parsedBody = JSON.parse(options.body);
      expect(parsedBody.secret).toBe(mockSecret);
      expect(parsedBody.to).toBe('tester@example.com');
      expect(parsedBody.subject).toBe('Your GameQuest verification code is 748291');
      expect(parsedBody.text).toContain('748291');
      expect(parsedBody.html).toContain('748291');

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 't***r@example.com' }),
        expect.any(String),
      );
    });

    it('sends password reset email via relay POST payload and handles { ok: true }', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { relayUrl: mockRelayUrl, relaySecret: mockSecret },
        },
        logger: mockLogger,
        fetchFn: mockFetch,
      });

      const result = await service.sendPasswordResetEmail({
        to: 'alex@example.com',
        username: 'AlexPlayer',
        token: 'secret-reset-token-999',
      });

      expect(result).toEqual({ sent: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];
      const parsedBody = JSON.parse(options.body);
      expect(parsedBody.secret).toBe(mockSecret);
      expect(parsedBody.to).toBe('alex@example.com');
      expect(parsedBody.subject).toBe('Reset your GameQuest password');
      expect(parsedBody.text).toContain('https://gamequest-five.vercel.app/reset-password?token=secret-reset-token-999');
      expect(parsedBody.html).toContain('https://gamequest-five.vercel.app/reset-password?token=secret-reset-token-999');
    });

    it('sends password changed notification via relay POST payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { relayUrl: mockRelayUrl, relaySecret: mockSecret },
        },
        logger: mockLogger,
        fetchFn: mockFetch,
      });

      const result = await service.sendPasswordChangedNotification({
        to: 'alex@example.com',
        username: 'AlexPlayer',
      });

      expect(result).toEqual({ sent: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];
      const parsedBody = JSON.parse(options.body);
      expect(parsedBody.subject).toBe('Your GameQuest password was changed');
    });

    it('does NOT report success when relay returns { ok: false, error: "..." }', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: false, error: 'Unauthorized: Invalid secret' }),
      });

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { relayUrl: mockRelayUrl, relaySecret: mockSecret },
        },
        logger: mockLogger,
        fetchFn: mockFetch,
      });

      await expect(
        service.sendVerificationEmail({
          to: 'gamer@example.com',
          username: 'GamerGuy',
          code: '123456',
        }),
      ).rejects.toThrow('Unauthorized: Invalid secret');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: { message: 'Unauthorized: Invalid secret' },
          recipient: 'g***r@example.com',
        }),
        expect.stringMatching(/failure/i),
      );
    });

    it('handles HTTP error responses (e.g. 500 or 502) without reporting success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => 'Service Unavailable',
      });

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { relayUrl: mockRelayUrl, relaySecret: mockSecret },
        },
        logger: mockLogger,
        fetchFn: mockFetch,
      });

      await expect(
        service.sendPasswordResetEmail({
          to: 'gamer@example.com',
          username: 'GamerGuy',
          token: 'token-xyz',
        }),
      ).rejects.toThrow('Mail relay HTTP 502');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ status: 502, recipient: 'g***r@example.com' }),
        expect.stringMatching(/not ok/i),
      );
    });

    it('handles malformed or non-JSON responses without crashing or reporting success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { relayUrl: mockRelayUrl, relaySecret: mockSecret },
        },
        logger: mockLogger,
        fetchFn: mockFetch,
      });

      await expect(
        service.sendVerificationEmail({
          to: 'gamer@example.com',
          username: 'GamerGuy',
          code: '123456',
        }),
      ).rejects.toThrow('Mail relay returned invalid JSON');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'g***r@example.com' }),
        expect.stringMatching(/invalid json/i),
      );
    });

    it('handles request timeout using AbortController and throws TimeoutError', async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortErr);

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { relayUrl: mockRelayUrl, relaySecret: mockSecret },
        },
        logger: mockLogger,
        fetchFn: mockFetch,
        timeoutMs: 5000,
      });

      await expect(
        service.sendVerificationEmail({
          to: 'gamer@example.com',
          username: 'GamerGuy',
          code: '123456',
        }),
      ).rejects.toThrow('Mail relay request timed out after 5000ms');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'g***r@example.com', timeoutMs: 5000 }),
        expect.stringMatching(/timed out/i),
      );
    });

    it('handles network failure gracefully and logs sanitized error without credentials', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { relayUrl: mockRelayUrl, relaySecret: mockSecret },
        },
        logger: mockLogger,
        fetchFn: mockFetch,
      });

      await expect(
        service.sendPasswordResetEmail({
          to: 'gamer@example.com',
          username: 'GamerGuy',
          token: 'token-xyz',
        }),
      ).rejects.toThrow('fetch failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: { name: 'TypeError', message: 'fetch failed' },
          recipient: 'g***r@example.com',
        }),
        expect.any(String),
      );

      // Verify that the secret key was never passed to any logger call
      for (const call of [...mockLogger.info.mock.calls, ...mockLogger.error.mock.calls, ...mockLogger.warn.mock.calls]) {
        const str = JSON.stringify(call);
        expect(str).not.toContain(mockSecret);
      }
    });

    it('warns and returns { sent: false } in production when relay is unconfigured', async () => {
      const service = createEmailService({
        config: {
          env: 'production',
          clientOrigin: 'https://gamequest-five.vercel.app',
          email: { relayUrl: null, relaySecret: null },
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
