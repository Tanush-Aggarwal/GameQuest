import { createEmailService } from '../services/emailService.js';

describe('emailService', () => {
  it('reports unconfigured when SMTP is missing', () => {
    const service = createEmailService({
      config: {
        env: 'test',
        clientOrigin: 'http://localhost:5173',
        email: { smtpHost: null },
      },
    });
    expect(service.isConfigured()).toBe(false);
  });

  it('reports configured when host, user, and pass are present', () => {
    const service = createEmailService({
      config: {
        env: 'test',
        clientOrigin: 'http://localhost:5173',
        email: {
          smtpHost: 'smtp.example.com',
          smtpUser: 'user',
          smtpPass: 'secret',
          smtpPort: 587,
        },
      },
    });
    expect(service.isConfigured()).toBe(true);
  });

  it('safely simulates email in test environment without throwing', async () => {
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

  describe('6-digit Verification Code Handling', () => {
    it('dispatches verification code with correct testCode in test environment', async () => {
      const service = createEmailService({
        config: {
          env: 'test',
          clientOrigin: 'http://localhost:5174',
          email: {},
        },
      });

      const res = await service.sendVerificationEmail({
        to: 'gamer@example.com',
        username: 'GamerGuy',
        code: '849201',
      });

      expect(res.sent).toBe(false);
      expect(res.testCode).toBe('849201');
    });

    it('never exposes devVerificationUrl for verification codes in responses', async () => {
      const service = createEmailService({
        config: {
          env: 'development',
          clientOrigin: 'http://localhost:5174',
          email: {},
        },
      });

      const res = await service.sendVerificationEmail({
        to: 'gamer@example.com',
        username: 'GamerGuy',
        code: '849201',
      });

      expect(res.sent).toBe(false);
      expect(res.devVerificationUrl).toBeUndefined();
    });
  });
});
