// A tiny router that follows Express conventions: Router(), app.use(), (req, res, next),
// error handlers with 4 arguments, req.params, req.query, res.status().json().
// It exists so the server has no dependency beyond mysql2 and can be tested without installing anything.
//
// TO USE REAL EXPRESS INSTEAD (npm i express, v5 so async errors reach the error handler):
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
