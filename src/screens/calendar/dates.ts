// Local-time date helpers. Keys are YYYY-MM-DD in the device's timezone.

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayKey = () => dateKey(new Date());

/** Day key for an ISO timestamp, in local time (not UTC). */
export const keyOf = (iso: string) => dateKey(new Date(iso));

export function parseKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Minutes `timeZone` is ahead of UTC at instant `ms` (-240 for New York in summer). */
function zoneOffset(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUtc - Math.floor(ms / 1000) * 1000) / 60000;
}

/**
 * The instant (epoch ms) a wall-clock time happens on a day: "7pm on Mar 8"
 * stays 7pm across a daylight-saving change, unlike midnight + 19 hours.
 * Without a zone, the device's. A time skipped when clocks spring forward
 * lands an hour later; one repeated when they fall back is the first.
 */
export function wallTime(key: string, minutes: number, timeZone?: string) {
  const [y, m, d] = key.split('-').map(Number);
  if (!timeZone) return new Date(y, m - 1, d, 0, minutes).getTime();
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const before = guess - zoneOffset(guess, timeZone) * 60000;
  const after = guess - zoneOffset(before, timeZone) * 60000;
  // `after` reads back as the asked-for time unless that time doesn't exist (a
  // spring-forward gap); then `before` is the same clock reading an hour on.
  return guess - zoneOffset(after, timeZone) * 60000 === after ? after : before;
}

/** Day key for an instant in a zone (the device's when omitted). */
export function keyIn(ms: number, timeZone?: string) {
  if (!timeZone) return dateKey(new Date(ms));
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

export function addDays(key: string, n: number) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function relativeDay(key: string): string | null {
  const diff = Math.round((parseKey(key).getTime() - parseKey(todayKey()).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  return null;
}

export const longDate = (key: string) =>
  parseKey(key).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

export const shortDate = (key: string) =>
  parseKey(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export function timeParts(iso: string) {
  const [hm, ampm = ''] = new Date(iso)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .split(' ');
  return { hm, ampm };
}

export function timeRange(startIso: string, endIso: string) {
  const f = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${f(startIso)} – ${f(endIso)}`;
}

/**
 * A date range short enough for a phone header: "Oct 18–24", "Oct 30–Nov 5",
 * "Dec 28–Jan 3". The year appears only when neither end is in this year
 * ("Mar 1–7, 2027"). `spoken` always has the full dates, for screen readers.
 */
export function rangeLabel(from: string, to: string, now = new Date()) {
  const a = parseKey(from), b = parseKey(to);
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  const thisYear = now.getFullYear();
  const needsYear = a.getFullYear() !== thisYear && b.getFullYear() !== thisYear;
  const crossYear = a.getFullYear() !== b.getFullYear();

  let text = a.getMonth() === b.getMonth() && !crossYear
    ? `${mon(a)} ${a.getDate()}–${b.getDate()}`
    : `${mon(a)} ${a.getDate()}–${mon(b)} ${b.getDate()}`;
  if (needsYear) {
    text = crossYear
      ? `${mon(a)} ${a.getDate()}, ${a.getFullYear()}–${mon(b)} ${b.getDate()}, ${b.getFullYear()}`
      : `${text}, ${b.getFullYear()}`;
  }

  const full = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return { text, spoken: `${full(a)} to ${full(b)}` };
}
