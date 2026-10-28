import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthError, ConflictError, RateLimitError } from '../utils/errors.js';

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown so login timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

/**
 * Computes a purpose-specific HMAC for 6-digit verification codes using the server secret.
 * Low-entropy 6-digit codes are protected with HMAC-SHA256 keyed with server secrets.
 */
export function hashVerificationCode(email, code, secret) {
  return createHmac('sha256', secret)
    .update(`email-verification:${String(email || '').toLowerCase().trim()}:${String(code || '').trim()}`)
    .digest('hex');
}

/**
 * Evaluates whether an account possesses trustworthy evidence of prior email verification.
 * Trustworthy evidence is established ONLY through:
 * 1. Google OAuth identity provider assertion (sub + email_verified === true)
 * 2. Cryptographic email verification token redemption with verified timestamp evidence (emailVerifiedAt)
 * Legacy password accounts with missing/null emailVerified or unevidenced flags are treated as unverified.
 */
export function isUserEmailVerified(user) {
  if (!user || !user.emailVerified) return false;
  // Account verified via Google OAuth claim
  if (user.googleId && user.emailVerified === true) return true;
  // Account verified via email token confirmation with verified timestamp evidence
  if (user.emailVerified === true && user.emailVerifiedAt != null) {
    const timestamp = new Date(user.emailVerifiedAt).getTime();
    if (!Number.isNaN(timestamp) && timestamp > 0) return true;
  }
  return false;
}

export function toPublicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    avatar: user.avatar ?? null,
    email: user.email,
    emailVerified: isUserEmailVerified(user),
    role: user.role,
    createdAt: user.createdAt,
  };
}

function isDuplicateKey(err) {
  return err?.code === 11000;
}

// A replay this soon after rotation is treated as a client racing itself (two tabs),
// not theft: it gets a 401 but the token family survives.
const REUSE_GRACE_MS = 10_000;

export function createAuthService({
  User,
  RefreshToken,
  config,
  emailService = null,
  logger = null,
  bcryptRounds = BCRYPT_ROUNDS,
  reuseGraceMs = REUSE_GRACE_MS,
}) {
  const { accessSecret, refreshSecret, accessTtlSeconds, refreshTtlSeconds } = config.auth;
  const requireEmailVerification = config.auth.requireEmailVerification ?? true;

  async function issueTokens(user, familyId = randomUUID()) {
    const jti = randomUUID();
    const accessToken = jwt.sign({ role: user.role }, accessSecret, {
      subject: String(user._id),
      expiresIn: accessTtlSeconds,
    });
    const refreshToken = jwt.sign({ fam: familyId }, refreshSecret, {
      subject: String(user._id),
      jwtid: jti,
      expiresIn: refreshTtlSeconds,
    });
    await RefreshToken.create({
      jti,
      familyId,
      userId: user._id,
      expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
    });
    return { accessToken, refreshToken };
  }

  function verifyRefresh(token) {
    try {
      return jwt.verify(token, refreshSecret);
    } catch {
      throw new AuthError('Session expired, please log in again');
    }
  }

  async function register({ username, email, password, acceptTerms }) {
    const normalisedEmail = email.toLowerCase().trim();
    const usernameLower = username.toLowerCase().trim();
    const existing = await User.findOne({ $or: [{ email: normalisedEmail }, { usernameLower }] });
    if (existing) {
      const field = existing.email === normalisedEmail ? 'email' : 'username';
      throw new ConflictError(`That ${field} is already taken`, { field });
    }
    const passwordHash = await bcrypt.hash(password, bcryptRounds);

    let user;
    if (requireEmailVerification) {
      const rawCode = String(randomInt(100000, 1000000));
      const emailVerificationCodeHmac = hashVerificationCode(normalisedEmail, rawCode, accessSecret);
      const emailVerificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      const emailVerificationSentAt = new Date();

      try {
        user = await User.create({
          username,
          usernameLower,
          email: normalisedEmail,
          passwordHash,
          emailVerified: false,
          emailVerifiedAt: null,
          emailVerificationCodeHmac,
          emailVerificationExpiresAt,
          emailVerificationAttempts: 0,
          emailVerificationSentAt,
          ...(acceptTerms === true && { termsAcceptedAt: new Date() }),
        });
      } catch (err) {
        if (isDuplicateKey(err)) {
          const field = Object.keys(err.keyPattern ?? {})[0]?.startsWith('email') ? 'email' : 'username';
          throw new ConflictError(`That ${field} is already taken`, { field });
        }
        throw err;
      }

      if (emailService) {
        try {
          await emailService.sendVerificationEmail({
            to: user.email,
            username: user.username,
            code: rawCode,
          });
        } catch (err) {
          logger?.error?.({ err: { name: err.name, message: err.message } }, 'Failed to dispatch verification email');
        }
      }

      return {
        user: toPublicUser(user),
        emailVerificationPending: true,
      };
    }

    try {
      user = await User.create({
        username,
        usernameLower,
        email: normalisedEmail,
        passwordHash,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        ...(acceptTerms === true && { termsAcceptedAt: new Date() }),
      });
    } catch (err) {
      if (isDuplicateKey(err)) {
        const field = Object.keys(err.keyPattern ?? {})[0]?.startsWith('email') ? 'email' : 'username';
        throw new ConflictError(`That ${field} is already taken`, { field });
      }
      throw err;
    }
    return { user: toPublicUser(user), ...(await issueTokens(user)) };
  }

  // A free username from the Google name: letters, numbers and underscores, 3 to 24 characters, with a number
  // added when it is taken (checked against usernameLower, the unique key).
  async function freeUsername(name, email) {
    const clean = (s) => String(s ?? '').replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    let base = clean(name) || clean(email?.split('@')[0]);
    if (base.length < 3) base = `${base}player`.slice(0, 24);
    base = base.slice(0, 20);
    for (let n = 0; n < 50; n += 1) {
      const candidate = n === 0 ? base : `${base}${n + 1}`;
      if (!(await User.findOne({ usernameLower: candidate.toLowerCase() }))) return candidate;
    }
    return `${base}${randomUUID().slice(0, 4)}`;
  }

  // Sign in (or sign up) with a verified Google profile. An email that already belongs to a password account is
  // refused, never linked: GameQuest does not verify emails, so linking could give the account to whoever
  // registered the address first.
  async function loginWithGoogle({ sub, email, emailVerified, name }) {
    if (!sub || !email || !emailVerified) throw new AuthError('Google did not confirm your email address');
    const normalisedEmail = email.toLowerCase().trim();
    const known = await User.findOne({ googleId: sub });
    if (known) return { user: toPublicUser(known), ...(await issueTokens(known)) };
    if (await User.findOne({ email: normalisedEmail })) {
      throw new ConflictError('An account with this email already exists. Log in with your password.', { field: 'email' });
    }
    // A duplicate key here is a race: the same person's second tab got there first (sign them in), or someone took
    // the username a moment ago (pick another once).
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const username = await freeUsername(name, normalisedEmail);
        const user = await User.create({
          username,
          usernameLower: username.toLowerCase(),
          email: normalisedEmail,
          googleId: sub,
          emailVerified: true,
          emailVerifiedAt: new Date(),
        });
        return { user: toPublicUser(user), ...(await issueTokens(user)) };
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        const raced = await User.findOne({ googleId: sub });
        if (raced) return { user: toPublicUser(raced), ...(await issueTokens(raced)) };
        if (await User.findOne({ email: normalisedEmail })) {
          throw new ConflictError('An account with this email already exists. Log in with your password.', { field: 'email' });
        }
      }
    }
    throw new ConflictError('Could not create your account. Please try again.');
  }

  async function login({ email, password }) {
    const normalisedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalisedEmail }).select('+passwordHash');
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new AuthError('Invalid email or password');
    if (requireEmailVerification && !isUserEmailVerified(user)) {
      throw new AuthError(
        'Please verify your email address before logging in.',
        { email: user.email, unverified: true },
        'EMAIL_NOT_VERIFIED',
      );
    }
    return { user: toPublicUser(user), ...(await issueTokens(user)) };
  }

  // Rotation: every refresh token works once. Replaying a used token means it was stolen
  // (or the client raced itself), so the whole family is revoked.
  async function refresh(refreshToken) {
    if (!refreshToken) throw new AuthError('Session expired, please log in again');
    const payload = verifyRefresh(refreshToken);

    const claimed = await RefreshToken.findOneAndUpdate(
      { jti: payload.jti, usedAt: null },
      { usedAt: new Date() },
    );
    if (!claimed) {
      const existing = await RefreshToken.findOne({ jti: payload.jti });
      const racedItself = existing?.usedAt && Date.now() - new Date(existing.usedAt).getTime() < reuseGraceMs;
      if (!racedItself) await RefreshToken.deleteMany({ familyId: payload.fam });
      throw new AuthError('Session expired, please log in again');
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      await RefreshToken.deleteMany({ familyId: payload.fam });
      throw new AuthError('Session expired, please log in again');
    }
    return { user: toPublicUser(user), ...(await issueTokens(user, payload.fam)) };
  }

  async function logout(refreshToken) {
    if (!refreshToken) return;
    try {
      const payload = jwt.verify(refreshToken, refreshSecret, { ignoreExpiration: true });
      await RefreshToken.deleteMany({ familyId: payload.fam });
    } catch {
      // Invalid token: nothing to revoke. Logout is idempotent.
    }
  }

  async function getMe(userId) {
    const user = await User.findById(userId);
    if (!user) throw new AuthError('Account no longer exists');
    return toPublicUser(user);
  }

  function verifyAccess(token) {
    try {
      const payload = jwt.verify(token, accessSecret);
      return { userId: payload.sub, role: payload.role };
    } catch {
      throw new AuthError();
    }
  }

  const GENERIC_RECOVERY_RESPONSE = {
    message: "If an eligible account exists for that email address, we'll send instructions to reset its password.",
  };

  async function forgotPassword({ email }) {
    const normalisedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalisedEmail }).select('+passwordHash');

    // Only accounts with a password AND verified email may reset (Google-only accounts sign in via Google).
    // Return identical response regardless of whether user exists, minimizing enumeration risk.
    if (!user || !user.passwordHash || (requireEmailVerification && !isUserEmailVerified(user))) {
      await bcrypt.compare('dummy', DUMMY_HASH);
      return GENERIC_RECOVERY_RESPONSE;
    }

    // 60-second cooldown check
    if (user.resetPasswordSentAt && Date.now() - new Date(user.resetPasswordSentAt).getTime() < 60_000) {
      const retryAfter = Math.ceil((60_000 - (Date.now() - new Date(user.resetPasswordSentAt).getTime())) / 1000);
      throw new RateLimitError('Please wait before requesting another password reset email.', { retryAfter });
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const sentAt = new Date();

    await User.updateOne(
      { _id: user._id },
      { $set: { resetPasswordTokenHash: tokenHash, resetPasswordExpiresAt: expiresAt, resetPasswordSentAt: sentAt } },
    );

    let devResetUrl;
    if (emailService) {
      try {
        const emailRes = await emailService.sendPasswordResetEmail({
          to: user.email,
          username: user.username,
          token: rawToken,
        });
        if (config.env === 'development' && emailRes?.devResetUrl) {
          devResetUrl = emailRes.devResetUrl;
        }
      } catch (err) {
        logger?.error?.({ err: { name: err.name, message: err.message } }, 'Failed to dispatch password reset email');
      }
    }

    return {
      ...GENERIC_RECOVERY_RESPONSE,
      ...(devResetUrl ? { devResetUrl } : {}),
    };
  }

  async function resetPassword({ token, password }) {
    if (!token || typeof token !== 'string') {
      throw new AuthError('Reset token is required');
    }

    const tokenHash = createHash('sha256').update(token.trim()).digest('hex');
    const passwordHash = await bcrypt.hash(password, bcryptRounds);

    // Atomically find user with matching valid unexpired token, update password, and unset token fields
    const user = await User.findOneAndUpdate(
      {
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpiresAt: { $gt: new Date() },
      },
      {
        $set: { passwordHash },
        $unset: { resetPasswordTokenHash: 1, resetPasswordExpiresAt: 1 },
      },
      { new: true },
    );

    if (!user) {
      throw new AuthError('This password reset link is invalid or has expired. Please request a new one.');
    }

    // Invalidate all existing sessions / refresh tokens for this user
    await RefreshToken.deleteMany({ userId: user._id });

    if (emailService) {
      try {
        await emailService.sendPasswordChangedNotification({
          to: user.email,
          username: user.username,
        });
      } catch (err) {
        logger?.error?.({ err: { name: err.name, message: err.message } }, 'Failed to dispatch password changed notification');
      }
    }

    return {
      success: true,
      message: 'Your password has been reset successfully. You can now log in.',
    };
  }

  const GENERIC_RESEND_RESPONSE = {
    message: 'If an unverified account exists for that email address, a verification code has been sent.',
  };

  async function resendVerification({ email }) {
    const normalisedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalisedEmail });

    if (!user || isUserEmailVerified(user)) {
      return GENERIC_RESEND_RESPONSE;
    }

    if (user.emailVerificationSentAt && Date.now() - new Date(user.emailVerificationSentAt).getTime() < 60_000) {
      const retryAfter = Math.ceil((60_000 - (Date.now() - new Date(user.emailVerificationSentAt).getTime())) / 1000);
      throw new RateLimitError('Please wait before requesting another verification code.', { retryAfter });
    }

    const rawCode = String(randomInt(100000, 1000000));
    const codeHmac = hashVerificationCode(normalisedEmail, rawCode, accessSecret);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const sentAt = new Date();

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerificationCodeHmac: codeHmac,
          emailVerificationExpiresAt: expiresAt,
          emailVerificationAttempts: 0,
          emailVerificationSentAt: sentAt,
        },
      },
    );

    if (emailService) {
      try {
        await emailService.sendVerificationEmail({
          to: user.email,
          username: user.username,
          code: rawCode,
        });
      } catch (err) {
        logger?.error?.({ err: { name: err.name, message: err.message } }, 'Failed to dispatch verification email');
      }
    }

    return GENERIC_RESEND_RESPONSE;
  }

  async function verifyEmail({ email, code }) {
    if (!email || typeof email !== 'string') {
      throw new AuthError('Email address is required');
    }
    const normalisedEmail = email.toLowerCase().trim();
    const trimmedCode = String(code || '').trim();

    if (!/^\d{6}$/.test(trimmedCode)) {
      throw new AuthError('Verification code must be exactly 6 digits');
    }

    const user = await User.findOne({ email: normalisedEmail }).select(
      '+emailVerificationCodeHmac +emailVerificationExpiresAt +emailVerificationAttempts',
    );

    if (!user) {
      throw new AuthError('Invalid or expired verification code.');
    }

    if (isUserEmailVerified(user)) {
      return {
        success: true,
        message: 'Your email address is already verified. You can log in.',
      };
    }

    if (!user.emailVerificationExpiresAt || new Date() > new Date(user.emailVerificationExpiresAt)) {
      throw new AuthError(
        'This verification code has expired. Please request a new one.',
        { expired: true },
        'CODE_EXPIRED',
      );
    }

    if ((user.emailVerificationAttempts ?? 0) >= 5) {
      throw new AuthError(
        'Too many incorrect attempts. This code is now invalid. Please request a new one.',
        { maxAttempts: true },
        'MAX_ATTEMPTS_EXCEEDED',
      );
    }

    const expectedHmac = hashVerificationCode(normalisedEmail, trimmedCode, accessSecret);
    const storedHmac = user.emailVerificationCodeHmac || '';

    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    const storedBuf = Buffer.from(storedHmac, 'hex');
    const isMatch =
      expectedBuf.length === storedBuf.length && timingSafeEqual(expectedBuf, storedBuf);

    if (!isMatch) {
      const updated = await User.findOneAndUpdate(
        { _id: user._id },
        { $inc: { emailVerificationAttempts: 1 } },
        { new: true, select: '+emailVerificationAttempts' },
      );
      const attempts = updated?.emailVerificationAttempts ?? 1;
      const remaining = Math.max(0, 5 - attempts);

      if (attempts >= 5) {
        await User.updateOne(
          { _id: user._id },
          { $unset: { emailVerificationCodeHmac: 1, emailVerificationExpiresAt: 1 } },
        );
        throw new AuthError(
          'Too many incorrect attempts. This code is now invalid. Please request a new one.',
          { attemptsRemaining: 0, maxAttempts: true },
          'MAX_ATTEMPTS_EXCEEDED',
        );
      }

      throw new AuthError(
        `Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        { attemptsRemaining: remaining },
        'INVALID_CODE',
      );
    }

    const verified = await User.findOneAndUpdate(
      {
        _id: user._id,
        emailVerificationCodeHmac: expectedHmac,
        emailVerificationExpiresAt: { $gt: new Date() },
      },
      {
        $set: { emailVerified: true, emailVerifiedAt: new Date() },
        $unset: {
          emailVerificationCodeHmac: 1,
          emailVerificationExpiresAt: 1,
          emailVerificationAttempts: 1,
          emailVerificationSentAt: 1,
        },
      },
      { new: true },
    );

    if (!verified) {
      throw new AuthError('This verification code is invalid or has expired. Please request a new one.');
    }

    return {
      success: true,
      message: 'Your email address has been verified successfully. You can now log in.',
    };
  }

  return {
    register,
    login,
    loginWithGoogle,
    refresh,
    logout,
    getMe,
    verifyAccess,
    forgotPassword,
    resetPassword,
    verifyEmail,
    resendVerification,
  };
}
