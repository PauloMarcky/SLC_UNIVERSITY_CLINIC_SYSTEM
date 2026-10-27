// Calendar-day helpers for the clinic. Dates are compared in the CLINIC's time zone, never the
// server's, so a server running on UTC does not roll over to "tomorrow" at 8:00 AM in Manila.
export const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'Asia/Manila';

// How many calendar days a triaged visit may wait before it is saved as "missed".
// A visit taken today is 0 days old, yesterday's is 1 day old, and so on.
export const MISSED_AFTER_DAYS = Math.max(1, Number.parseInt(process.env.MISSED_AFTER_DAYS, 10) || 2);

/** Today's date in the clinic's time zone, as YYYY-MM-DD. */
export function clinicToday(now = new Date()) {
  // The en-CA locale prints dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

const dayNumber = iso => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD). Friday to Monday is 3. */
export function calendarDaysBetween(from, to) {
  return dayNumber(to) - dayNumber(from);
}

/** YYYY-MM-DD for `days` calendar days before `iso`. */
export function daysBefore(iso, days) {
  return new Date((dayNumber(iso) - days) * 86400000).toISOString().slice(0, 10);
}
