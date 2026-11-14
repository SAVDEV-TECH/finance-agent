import express, { type Express } from 'express';
import fs from 'fs';
import path from 'path';
import type { Server } from 'http';

export async function setupVite(app: Express, server: Server): Promise<void> {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: { server },
    },
    appType: 'custom',
  });

  app.use(vite.middlewares);

  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    if (url.startsWith('/api/')) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        process.cwd(),
        'client',
        'index.html'
      );
      let template = await fs.promises.readFile(clientTemplate, 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express): void {
  const distPath = path.resolve(process.cwd(), 'dist', 'public');
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Build directory not found at ${distPath}. Run 'pnpm build' first.`
    );
  }

  app.use(express.static(distPath));
  app.use('*', (req, res, next) => {
    if (req.originalUrl.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
}
