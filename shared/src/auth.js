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

// New passwords only (login accepts any existing password): 8+ characters with at least one letter and one number.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine(within72Bytes, PASSWORD_TOO_LONG)
  .refine((s) => /[A-Za-z]/.test(s) && /\d/.test(s), 'Use at least one letter and one number');

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  // The register form's "I agree to the Terms and Privacy Policy" box. Optional for older clients; when sent it must
  // be true, and the time is stored on the account.
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Accept the Terms and Privacy Policy to create an account' }) }).optional(),
});

// The register form: the API schema plus a "Confirm password" box that must match. Only the client uses it;
// confirmPassword is never sent to the API.
export const registerFormSchema = registerSchema
  .extend({ confirmPassword: z.string().min(1, 'Type your password again') })
  .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: "Passwords don't match" });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).refine(within72Bytes, PASSWORD_TOO_LONG),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required'),
  password: passwordSchema,
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Verification code must be exactly 6 digits'),
});
