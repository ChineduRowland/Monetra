import { clerkMiddleware, getAuth, clerkClient } from '@clerk/express';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Profile } from '../src/shared/types.ts';
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  createProfile,
  ensureDemoUserSeeded,
  getProfileByEmail,
  getProfileById,
} from './db.ts';

export const isClerkConfigured = Boolean(
  process.env.VITE_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

// Per security guidelines: read signing secret from env with ephemeral fallback
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export interface AuthenticatedRequest extends Request {
  authUser?: Profile;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  return derived.length === storedBuf.length && crypto.timingSafeEqual(derived, storedBuf);
}

export function signPreviewToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyPreviewToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
    if (!parsed.sub || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed.sub;
  } catch {
    return null;
  }
}

export function applyAuthMiddleware() {
  if (isClerkConfigured) {
    return clerkMiddleware();
  }
  return (_req: Request, _res: Response, next: NextFunction) => next();
}

export async function requireAuthenticatedUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (isClerkConfigured) {
      const auth = getAuth(req);
      if (!auth?.userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      let profile = await getProfileById(auth.userId);
      if (!profile) {
        const clerkUser = await clerkClient.users.getUser(auth.userId);
        const primaryEmail =
          clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
            ?.emailAddress ??
          clerkUser.emailAddresses[0]?.emailAddress ??
          `${auth.userId}@users.monetra.app`;
        const fullName =
          [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim() ||
          primaryEmail.split('@')[0];

        profile = await createProfile({
          id: auth.userId,
          email: primaryEmail,
          display_name: fullName,
          avatar_url: clerkUser.imageUrl ?? null,
          onboarding_completed: false,
          is_demo: false,
        });
      }

      req.authUser = profile;
      return next();
    }

    // Preview Auth via signed Bearer token
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = verifyPreviewToken(token);
    if (!userId) {
      return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    }

    const profile = await getProfileById(userId);
    if (!profile) {
      return res.status(401).json({ error: 'User profile not found' });
    }

    req.authUser = profile;
    return next();
  } catch (err) {
    return res.status(401).json({
      error: err instanceof Error ? err.message : 'Unable to verify authentication session',
    });
  }
}

export async function registerPreviewAccount(params: {
  email: string;
  password: string;
  display_name: string;
}): Promise<{ profile: Profile; token: string }> {
  const existing = await getProfileByEmail(params.email);
  if (existing) {
    throw new Error('An account with this email address already exists');
  }
  const userId = `usr_${crypto.randomUUID()}`;
  const profile = await createProfile({
    id: userId,
    email: params.email,
    display_name: params.display_name,
    password_hash: hashPassword(params.password),
    country: 'Nigeria',
    preferred_currency: 'NGN',
    onboarding_completed: false,
    is_demo: false,
  });
  return { profile, token: signPreviewToken(profile.id) };
}

export async function loginPreviewAccount(params: {
  email: string;
  password: string;
}): Promise<{ profile: Profile; token: string }> {
  const existing = await getProfileByEmail(params.email);
  if (!existing || !existing.password_hash) {
    throw new Error('Invalid email or password');
  }
  if (!verifyPassword(params.password, existing.password_hash)) {
    throw new Error('Invalid email or password');
  }
  const { password_hash: _pw, ...profile } = existing;
  return { profile, token: signPreviewToken(profile.id) };
}

export async function loginDemoAccount(): Promise<{ profile: Profile; token: string }> {
  const profile = await ensureDemoUserSeeded();
  return { profile, token: signPreviewToken(profile.id) };
}

export async function requestPreviewPasswordReset(email: string): Promise<{
  resetCodePreview: string | null;
  message: string;
}> {
  const existing = await getProfileByEmail(email);
  if (!existing || existing.is_demo) {
    return {
      resetCodePreview: null,
      message: 'If an account matches that email, a password recovery code has been issued.',
    };
  }
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  await createPasswordResetToken(existing.id, code);
  return {
    resetCodePreview: code,
    message: 'Recovery code generated. Enter it below to set a new password.',
  };
}

export async function completePreviewPasswordReset(params: {
  code: string;
  newPassword: string;
}): Promise<void> {
  const userId = await consumePasswordResetToken(params.code);
  if (!userId) {
    throw new Error('Invalid or expired recovery code');
  }
  const { updateProfilePassword } = await import('./db.ts');
  await updateProfilePassword(userId, hashPassword(params.newPassword));
}
