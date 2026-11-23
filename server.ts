import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './server/app.ts';
import { isClerkConfigured } from './server/auth.ts';
import { isSupabaseConfigured } from './server/db.ts';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = createApiApp();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Monetra server running on http://0.0.0.0:${PORT} (auth=${isClerkConfigured ? 'clerk' : 'preview'}, db=${isSupabaseConfigured ? 'supabase' : 'sqlite'})`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start Monetra server:', err);
  process.exit(1);
});
