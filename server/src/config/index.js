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
    clientOrigin: e.CLIENT_ORIGIN,
    mongoUri: e.MONGODB_URI,
    logLevel: e.LOG_LEVEL,
    auth: {
      accessSecret: e.JWT_ACCESS_SECRET,
      refreshSecret: e.JWT_REFRESH_SECRET,
      accessTtlSeconds: 15 * 60,
      refreshTtlSeconds: 7 * 24 * 60 * 60,
      rateLimitMax: e.AUTH_RATE_LIMIT_MAX,
    },
    twitch: {
      clientId: e.TWITCH_CLIENT_ID || null,
      clientSecret: e.TWITCH_CLIENT_SECRET || null,
    },
  };
}
