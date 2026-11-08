// Phone numbers as people type them: "(555) 123-4567", "+44 20 7946 0958",
// "555.123.4567". Kept as typed, apart from tidying US numbers; compared by
// digits so the same number written two ways is one person.

/** Just the digits, keeping a leading + for international numbers. */
export function digitsOf(s: string): string {
  return s.replace(/\D/g, '');
}

/** Whether what's typed is a phone number rather than a name: phone characters only, and enough digits. */
export function looksLikePhone(s: string): boolean {
  const t = s.trim();
  return /^\+?[\d\s().\-]+$/.test(t) && digitsOf(t).length >= 7;
}

/** "5551234567" → "(555) 123-4567"; other countries stay as typed, tidied. */
export function formatPhone(s: string): string {
  const t = s.trim();
  const d = digitsOf(t);
  const us = d.length === 10 ? d : d.length === 11 && d.startsWith('1') ? d.slice(1) : null;
  if (us && !(t.startsWith('+') && !t.startsWith('+1'))) return `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}`;
  return t.replace(/\s+/g, ' ');
}

/** The same number, however it's written: the last 10 digits match (so +1 and a missing country code agree). */
/** A number as sheep matches it: its digits, the last 10 for longer ones (so +1 and no +1 match). Null if too short. */
export function phoneKey(s: string | null | undefined): string | null {
  const d = digitsOf(s ?? '');
  return d.length < 7 ? null : d.slice(-10);
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = digitsOf(a), db = digitsOf(b);
  if (da.length < 7 || db.length < 7) return false;
  return da.slice(-10) === db.slice(-10);
}

/** Whether a phone number contains the digits typed so far, for search. */
export function phoneMatches(phone: string | null | undefined, query: string): boolean {
  const q = digitsOf(query);
  return !!phone && q.length >= 3 && digitsOf(phone).includes(q);
}

/** What to call someone in a short list: their first name, or the whole number for someone saved by number. */
export function firstNameOf(name: string): string {
  return looksLikePhone(name) ? name : name.split(' ')[0];
}
