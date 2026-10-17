// A tiny router that follows Express conventions: Router(), app.use(), (req, res, next),
// error handlers with 4 arguments, req.params, req.query, res.status().json().
// It is a thin wrapper over Express 5, so the rest of the project imports Router and createApp from here and never imports 'express' directly.
//
// HISTORY: an earlier version used a hand-written router. This file now uses real Express 5, and the notes below are no longer needed:
//   replace the whole body of this file with:
//     import express from 'express';
//     export const Router = express.Router;
//     export const createApp = () => { const app = express(); app.disable('x-powered-by'); app.set('etag', false); app.locals = app.locals || {}; return app; };
//   Nothing else in the project imports 'express'.
import express from 'express';

// Keep compatibility with existing imports.
export const Router = express.Router;

// Create an Express application.
export const createApp = () => {
    const app = express();

    app.disable('x-powered-by');
    app.set('etag', false);

    app.locals = app.locals || {};

    return app;
};
