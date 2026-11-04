// Search across ideas and plans, like searching Messages: every word you type
// has to turn up somewhere on the plan (its title, place, notes, who it's
// for, who made it, what people said), and the result shows the line where
// it matched, with the match picked out.

export interface SearchField {
  label: string | null;      // "Place", "Ana", "Notes"; null for the title
  text: string;
}

export interface SearchHit {
  field: SearchField;
  text: string;              // the matching line, trimmed to fit
  start: number;             // where the match sits in `text`
  length: number;
}

export const searchTokens = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/** A window of `text` around the match, on one line, with ellipses where it's cut. */
export function snippet(text: string, start: number, length: number, max = 90): { text: string; start: number } {
  const flat = text.replace(/\s+/g, ' ');
  // Collapsing whitespace can shift the match; find it again.
  const needle = text.slice(start, start + length).replace(/\s+/g, ' ').toLowerCase();
  const at = Math.max(0, flat.toLowerCase().indexOf(needle));
  if (flat.length <= max) return { text: flat, start: at };
  const from = Math.max(0, Math.min(at - Math.floor((max - length) / 3), flat.length - max));
  const cut = flat.slice(from, from + max);
  const lead = from > 0 ? '…' : '';
  const tail = from + max < flat.length ? '…' : '';
  return { text: `${lead}${cut}${tail}`, start: at - from + lead.length };
}

/**
 * Null unless every word is found in some field. The hit is the field that
 * matches the most words (earlier fields win ties), at its first match.
 */
export function searchIdea(fields: SearchField[], query: string): SearchHit | null {
  const words = searchTokens(query);
  if (!words.length) return null;
  const hay = fields.map(f => f.text.toLowerCase());
  if (!words.every(w => hay.some(h => h.includes(w)))) return null;

  let best = -1;
  let bestCount = 0;
  hay.forEach((h, i) => {
    const n = words.filter(w => h.includes(w)).length;
    if (n > bestCount) { best = i; bestCount = n; }
  });
  const field = fields[best];
  const word = words.find(w => hay[best].includes(w))!;
  const cut = snippet(field.text, hay[best].indexOf(word), word.length);
  return { field, text: cut.text, start: cut.start, length: word.length };
}
