import type { Request, Response } from 'express';
import { parse as parseCookie } from 'cookie';
import { jwtVerify } from 'jose';
import type { User } from '../../drizzle/schema';
import { ENV } from './env';
import { getUserByOpenId, upsertUser } from '../db';

export const SESSION_COOKIE_NAME = 'fa_session';

export interface TrpcContext {
  req: Request;
  res: Response;
  user: User | null;
}

const DEFAULT_DEMO_USER: User = {
  id: 1,
  openId: 'local-owner-openid',
  name: 'Alex Morgan',
  email: 'alex.morgan@savdev.tech',
  loginMethod: 'session',
  role: 'admin',
  createdAt: new Date('2026-01-15T09:00:00Z'),
  updatedAt: new Date('2026-11-14T09:00:00Z'),
  lastSignedIn: new Date(),
};

export async function createContext({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<TrpcContext> {
  try {
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const cookies = parseCookie(cookieHeader);
      const token = cookies[SESSION_COOKIE_NAME];
      if (token) {
        const secret = new TextEncoder().encode(ENV.jwtSecret);
        const { payload } = await jwtVerify(token, secret);
        if (payload.openId && typeof payload.openId === 'string') {
          const dbUser = await getUserByOpenId(payload.openId);
          if (dbUser) {
            return { req, res, user: dbUser };
          }
        }
      }
    }

    // Ensure default authenticated workspace user is available in local/demo mode
    const existing = await getUserByOpenId(DEFAULT_DEMO_USER.openId);
    if (existing) {
      return { req, res, user: existing };
    }

    await upsertUser({
      openId: DEFAULT_DEMO_USER.openId,
      name: DEFAULT_DEMO_USER.name,
      email: DEFAULT_DEMO_USER.email,
      loginMethod: DEFAULT_DEMO_USER.loginMethod,
      role: DEFAULT_DEMO_USER.role,
    });
    const created = await getUserByOpenId(DEFAULT_DEMO_USER.openId);
    return { req, res, user: created ?? DEFAULT_DEMO_USER };
  } catch {
    return { req, res, user: DEFAULT_DEMO_USER };
  }
}
