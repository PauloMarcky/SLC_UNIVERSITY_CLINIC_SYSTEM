import { HttpError } from '../utils/http-error.js';

/** Last in the chain. Clients see HttpError messages only; anything else is logged and hidden. */
export function createErrorHandler(onError) {
  // Four parameters on purpose: that is how the router recognises an error handler.
  return function errorHandler(error, req, res, next) {
    if (res.headersSent) { res.end(); return; }
    if (!(error instanceof HttpError)) onError?.(error, req);
    res.status(error instanceof HttpError ? error.status : 500).json({
      error: error instanceof HttpError ? error.message : 'The request could not be completed.'
    });
  };
}
