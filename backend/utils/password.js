import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, hash) {
  const [salt, encoded] = hash.split(':');
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}
