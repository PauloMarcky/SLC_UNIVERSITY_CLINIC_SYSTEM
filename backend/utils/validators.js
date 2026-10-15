// Input checks shared by every service. They throw HttpError(400) with a message the user can read.
import { HttpError } from './http-error.js';

export function text(value, field, max, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text.`);
  const result = value.trim();
  if (required && !result) throw new HttpError(400, `${field} is required.`);
  if (result.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return result;
}

export function number(value, field, min, max) {
  const result = typeof value === 'string' && !value.trim() ? NaN : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) {
    throw new HttpError(400, `${field} must be a number from ${min} to ${max}.`);
  }
  return result;
}

export function wholeNumber(value, field, min, max) {
  const n = typeof value === 'string' && !value.trim() ? NaN : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${field} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

const isRealDate = date =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date;

/** Required YYYY-MM-DD date used for visits. */
export function validDate(value) {
  const date = text(value, 'Visit date', 10, true);
  if (!isRealDate(date)) throw new HttpError(400, 'Enter a valid visit date.');
  return date;
}

/** Required YYYY-MM-DD date with a custom field name. */
export function dateText(value, field) {
  const date = text(value, field, 10, true);
  if (!isRealDate(date)) throw new HttpError(400, `Enter a valid ${field.toLowerCase()}.`);
  return date;
}

/** Optional YYYY-MM-DD date. Empty returns null. */
export function optionalDate(value, field) {
  const date = text(value, field, 10);
  if (!date) return null;
  if (!isRealDate(date)) throw new HttpError(400, `Enter a valid ${field.toLowerCase()}.`);
  return date;
}

/** Checkbox-style value to 0/1. */
export function flag(value) {
  return value === true || value === 'true' ? 1 : 0;
}

/** Positive integer from a URL part, else 404. */
export function idFrom(value) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new HttpError(404, 'Record not found.');
  }
  return Number(value);
}

/** Numeric id in a URL. Not digits means the route does not exist (404); otherwise same rules as idFrom. */
export function routeId(value) {
  if (!/^\d+$/.test(value)) throw new HttpError(404, 'API endpoint not found.');
  return idFrom(value);
}
