import { z } from 'zod';

const secret = (name) => z.string().min(32, `${name} must be at least 32 characters`);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  // Optional: without them the IGDB adapter reports a clear error and the catalog serves cached games only.
  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),
  // Optional integrations: each feature degrades gracefully when its key is missing.
  STEAM_API_KEY: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  // Optional: without them "Continue with Google" sends people back to the login page with a clear message.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // Public URL of this API (used to build OAuth callback URLs). Defaults to localhost in development.
  PUBLIC_API_URL: z.string().url().optional(),
  // Email / SMTP delivery (used for password reset).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  EMAIL_FROM: z.string().optional(),
  REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).optional(),
  // Cookies: the client proxies /api through its own domain in production, so Lax works and
  // survives browsers that block third-party cookies. Use "none" only for a direct cross-site setup.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  // Number of proxy hops in front of Express (Render = 1, Vercel rewrite + Render = 2).
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
});

export function loadConfig(env = process.env) {
  const parsed = envSchema.safeParse(env);
  const problems = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  if (env.NODE_ENV === 'production' && !env.CLIENT_ORIGIN) {
    problems.push('CLIENT_ORIGIN: must be set explicitly in production');
  }
  if (problems.length) {
    throw new Error(`Invalid environment configuration:\n  ${problems.join('\n  ')}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    isProd: e.NODE_ENV === 'production',
    port: e.PORT,
    clientOrigin: e.CLIENT_ORIGIN.replace(/\/+$/, ''),
    mongoUri: e.MONGODB_URI,
    logLevel: e.LOG_LEVEL,
    auth: {
      accessSecret: e.JWT_ACCESS_SECRET,
      refreshSecret: e.JWT_REFRESH_SECRET,
      accessTtlSeconds: 15 * 60,
      refreshTtlSeconds: 7 * 24 * 60 * 60,
      rateLimitMax: e.AUTH_RATE_LIMIT_MAX,
      requireEmailVerification: e.REQUIRE_EMAIL_VERIFICATION
        ? e.REQUIRE_EMAIL_VERIFICATION === 'true'
        : e.NODE_ENV !== 'test',
    },
    cookieSameSite: e.COOKIE_SAMESITE,
    trustProxy: e.TRUST_PROXY,
    publicApiUrl: e.PUBLIC_API_URL ?? `http://localhost:${e.PORT}`,
    steam: { apiKey: e.STEAM_API_KEY || null },
    youtube: { apiKey: e.YOUTUBE_API_KEY || null },
    discord: { clientId: e.DISCORD_CLIENT_ID || null, clientSecret: e.DISCORD_CLIENT_SECRET || null },
    google: { clientId: e.GOOGLE_CLIENT_ID || null, clientSecret: e.GOOGLE_CLIENT_SECRET || null },
    twitch: {
      clientId: e.TWITCH_CLIENT_ID || null,
      clientSecret: e.TWITCH_CLIENT_SECRET || null,
    },
    email: {
      smtpHost: e.SMTP_HOST || null,
      smtpPort: e.SMTP_PORT || 587,
      smtpUser: e.SMTP_USER || null,
      smtpPass: e.SMTP_PASS || null,
      smtpSecure: e.SMTP_SECURE === 'true',
      from: e.EMAIL_FROM || 'GameQuest <noreply@gamequest.app>',
    },
  };
}
