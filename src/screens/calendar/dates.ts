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
