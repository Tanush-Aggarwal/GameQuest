import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthError, ConflictError } from '../utils/errors.js';

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown so login timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

export function toPublicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
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
  bcryptRounds = BCRYPT_ROUNDS,
  reuseGraceMs = REUSE_GRACE_MS,
}) {
  const { accessSecret, refreshSecret, accessTtlSeconds, refreshTtlSeconds } = config.auth;

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

  async function register({ username, email, password }) {
    const usernameLower = username.toLowerCase();
    const existing = await User.findOne({ $or: [{ email }, { usernameLower }] });
    if (existing) {
      const field = existing.email === email ? 'email' : 'username';
      throw new ConflictError(`That ${field} is already taken`, { field });
    }
    const passwordHash = await bcrypt.hash(password, bcryptRounds);
    let user;
    try {
      user = await User.create({ username, usernameLower, email, passwordHash });
    } catch (err) {
      if (isDuplicateKey(err)) {
        const field = Object.keys(err.keyPattern ?? {})[0]?.startsWith('email') ? 'email' : 'username';
        throw new ConflictError(`That ${field} is already taken`, { field });
      }
      throw err;
    }
    return { user: toPublicUser(user), ...(await issueTokens(user)) };
  }

  async function login({ email, password }) {
    const user = await User.findOne({ email }).select('+passwordHash');
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new AuthError('Invalid email or password');
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

  return { register, login, refresh, logout, getMe, verifyAccess };
}
