import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only');

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

// bcrypt only uses the first 72 bytes, so reject anything longer instead of silently truncating.
const within72Bytes = (s) => new TextEncoder().encode(s).length <= 72;
const PASSWORD_TOO_LONG = 'Password must be at most 72 bytes';

export const passwordSchema = z.string().min(8).refine(within72Bytes, PASSWORD_TOO_LONG);

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).refine(within72Bytes, PASSWORD_TOO_LONG),
});
