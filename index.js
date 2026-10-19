// Vercel entrypoint. Vercel looks for a file that imports express and exports the app.
// All real wiring stays in backend/app.js; this just mounts it.
import express from 'express';
import { createClinicApp } from './backend/app.js';

const app = express();
app.use(createClinicApp({
  onError: (error, req) => console.error(
    `Request failed: ${req ? `${req.method} ${(req.originalUrl || req.url).split('?')[0]} ` : ''}${error.code || ''} ${error.stack || error.message}`
  )
}));

export default app;