import type { Express } from 'express';
import { SignJWT } from 'jose';
import { serialize as serializeCookie } from 'cookie';
import { ENV } from './env';
import { SESSION_COOKIE_NAME } from './context';
import { upsertUser, getUserByOpenId } from '../db';

export function registerOAuthRoutes(app: Express): void {
  app.post('/api/auth/login', async (req, res) => {
    try {
      const name = String(req.body?.name || 'Alex Morgan').trim();
      const email = String(req.body?.email || 'alex.morgan@savdev.tech').trim();
      const openId = `user-${email.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      await upsertUser({
        openId,
        name,
        email,
        loginMethod: 'session',
        lastSignedIn: new Date(),
      });

      const user = await getUserByOpenId(openId);
      const secret = new TextEncoder().encode(ENV.jwtSecret);
      const token = await new SignJWT({ openId, email, name })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(secret);

      res.setHeader(
        'Set-Cookie',
        serializeCookie(SESSION_COOKIE_NAME, token, {
          httpOnly: true,
          path: '/',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30,
        })
      );

      res.json({ success: true, user });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader(
      'Set-Cookie',
      serializeCookie(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        path: '/',
        maxAge: 0,
      })
    );
    res.json({ success: true });
  });
}
