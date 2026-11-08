// Birthdays are just a month and day, stored as "MM-DD".

/** "10/23" or "10-23" → "10-23"; null when blank; undefined when invalid. */
export function parseBirthday(text: string): string | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (!m) return undefined;
  const mm = Number(m[1]), dd = Number(m[2]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > new Date(2024, mm, 0).getDate()) return undefined;
  return `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** "10-23" → "10/23", for editing. */
export const birthdayText = (b: string | null | undefined) => (b ? b.replace('-', '/') : '');
