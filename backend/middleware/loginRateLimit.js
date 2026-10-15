import { HttpError } from '../utils/http-error.js';

/** Counts login attempts per address for ten minutes. One limiter per server instance. */
export function createLoginRateLimit(maximumAttempts = 30) {
  const attempts = new Map();
  return function loginRateLimit(req, res, next) {
    const key = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    for (const [address, attempt] of attempts) {
      if (attempt.until < now) attempts.delete(address);
    }
    let attempt = attempts.get(key);
    if (!attempt) {
      attempt = { count: 0, until: now + 10 * 60 * 1000 };
      attempts.set(key, attempt);
    }
    if (attempt.count >= maximumAttempts) {
      throw new HttpError(429, 'Too many login attempts. Try again in ten minutes.');
    }
    attempt.count += 1;
    next();
  };
}
