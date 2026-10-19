// Vercel entrypoint. Vercel looks for a file that imports express and exports the app.
// All real wiring stays in backend/app.js; this just mounts it.
import express from 'express';
import { createClinicApp } from './backend/app.js';

const app = express();
app.use(createClinicApp());

export default app;