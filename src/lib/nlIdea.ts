// Natural-language idea entry: "Natasha and I want to try Lilia for dinner".
//
// Ideas are phrased as wishes, not appointments, so on top of the event
// parser this understands who's in ("Natasha and I", "me and Ben", "with
// Ana") and drops the wishful lead-in ("want to", "we should", "let's") so
// what's left reads as a title ("Try Lilia for dinner"). Like the event
// parser it only pre-fills the form.

import { NLMember, parseEventText } from './nlEvent';

export interface ParsedIdea {
  title: string;
  date?: string;           // YYYY-MM-DD
  start?: string;          // HH:MM — a time hint for planning
  end?: string;
  location?: string;
  personIds: string[];     // ids from `people` that matched
  people: string[];        // display names that matched
}

const WISH = '(?:really\\s+)?(?:want(?:s)?\\s+to|wanna|would\\s+like\\s+to|\'d\\s+like\\s+to|should|could|need\\s+to|are\\s+going\\s+to|are\\s+gonna|have\\s+to|hope\\s+to|plan\\s+to|might)';

function firstName(m: NLMember) {
  return (m.full_name ?? m.email ?? '').trim().split(/[\s@]+/)[0] ?? '';
}

function matchPerson(name: string, people: NLMember[], meId?: string | null) {
  const q = name.toLowerCase().replace(/^the\s+/, '').trim();
  if (!q) return undefined;
  return people.find(p => p.id !== meId && (
    (p.full_name ?? '').toLowerCase() === q || firstName(p).toLowerCase() === q ||
    (q.length >= 3 && firstName(p).toLowerCase().startsWith(q))
  ));
}

export function parseIdeaText(text: string, opts: { today: string; people: NLMember[]; meId?: string | null }): ParsedIdea {
  const { today, people, meId } = opts;
  let s = text.trim();
  const personIds: string[] = [];
  const names: string[] = [];
  const add = (p: NLMember | undefined) => {
    if (!p || personIds.includes(p.id)) return;
    personIds.push(p.id);
    names.push(p.full_name ?? firstName(p));
  };

  // 1 · Subject: "Natasha and I …", "Ana, Ben and I …", "me and Grandma Rose …".
  // Only treated as a subject when every name is someone we know.
  const SEP = /^\s*(?:,|&|\band\b)\s*/i;
  const after = s.match(/^\s*(?:me|i)\s+and\s+/i);
  if (after) {
    // "me and …": names run until something that isn't a known name.
    let rest = s.slice(after[0].length);
    const hits: NLMember[] = [];
    for (;;) {
      const lower = rest.toLowerCase();
      const hit = people
        .filter(p => p.id !== meId)
        .flatMap(p => [p.full_name ?? '', firstName(p)].filter(Boolean).map(n => ({ p, n: n.toLowerCase() })))
        .sort((a, b) => b.n.length - a.n.length)
        .find(({ n }) => lower.startsWith(n) && !/[\w'’]/.test(lower.charAt(n.length)));
      if (!hit) break;
      hits.push(hit.p);
      rest = rest.slice(hit.n.length);
      const sep = rest.match(SEP);
      if (!sep) break;
      rest = rest.slice(sep[0].length);
    }
    if (hits.length) { hits.forEach(add); s = rest; }
  } else {
    const before = s.match(/^\s*(.+?)\s*(?:,|&|\band\b)\s*(?:i|me)\b\s*/i);
    if (before) {
      const hits = before[1].split(/\s*(?:,|&|\band\b)\s*/i).filter(Boolean).map(n => matchPerson(n, people, meId));
      if (hits.length && hits.every(Boolean)) { hits.forEach(add); s = s.slice(before[0].length); }
    }
  }

  // 2 · Wishful lead-ins: "we want to", "let's", "I think we should", "how about".
  s = s
    .replace(new RegExp(`^\\s*(?:i\\s+think\\s+)?(?:we|i|you)?\\s*${WISH}\\s+`, 'i'), '')
    .replace(/^\s*(?:let'?s|let\s+us|how\s+about|what\s+about|maybe|idea:)\s+/i, '');

  // 3 · Dates, times, place, "with …" — the event parser does the rest.
  const ev = parseEventText(s, { today, members: people, meId });
  ev.inviteIds.forEach(id => add(people.find(p => p.id === id)));

  let title = ev.title.replace(/[?!.]+$/, '').trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);

  return {
    title,
    date: ev.date,
    start: ev.start,
    end: ev.end,
    location: ev.location,
    personIds,
    people: names,
  };
}
