import express from 'express';
import serverless from 'serverless-http';
import { createApiApp } from '../../server/app.ts';

const apiApp = createApiApp();
const wrapper = express();

// Normalize Netlify Function proxy paths so /api/* routes always match cleanly
wrapper.use((req, _res, next) => {
  if (req.url.startsWith('/.netlify/functions/api')) {
    const suffix = req.url.slice('/.netlify/functions/api'.length);
    req.url = `/api${suffix.startsWith('/') || suffix === '' ? suffix : `/${suffix}`}`;
  } else if (!req.url.startsWith('/api')) {
    req.url = `/api${req.url.startsWith('/') ? req.url : `/${req.url}`}`;
  }
  next();
});

wrapper.use(apiApp);

export const handler = serverless(wrapper);
