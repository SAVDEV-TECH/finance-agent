import type { Express } from 'express';
import fs from 'fs/promises';
import { storageGetLocalPath } from '../storage';

export function registerStorageProxy(app: Express): void {
  app.get('/api/storage/:key(*)', async (req, res) => {
    try {
      const rawKey = decodeURIComponent(req.params.key || '');
      if (!rawKey) {
        res.status(400).json({ error: 'Missing file key' });
        return;
      }

      const filePath = await storageGetLocalPath(rawKey);
      const content = await fs.readFile(filePath);
      const ext = filePath.split('.').pop()?.toLowerCase();

      const contentType =
        ext === 'pdf'
          ? 'application/pdf'
          : ext === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : ext === 'docx'
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : 'text/csv; charset=utf-8';

      res.setHeader('Content-Type', contentType);
      res.send(content);
    } catch {
      res.status(404).json({ error: 'Stored file not found' });
    }
  });
}
