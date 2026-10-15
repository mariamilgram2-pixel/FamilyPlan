// Natural-language event entry: "dinner with Ana next Tuesday at 7pm".
//
// A small, local, rule-based parser — runs on-device, instantly, no network.
// It pulls out the parts people actually say (date, time or range, duration,
// people from your groups, "at <place>") and leaves the rest as the title.
// Results only PRE-FILL the composer; the person reviews before adding.
// A model-backed parser could later replace this behind the same signature
// for messier phrasing ("the Thursday after Ana's birthday").

import { addDays, dateKey, parseKey } from '../screens/calendar/dates';
import type { RepeatKey } from './recurrence';

export interface NLMember { id: string; full_name?: string | null; email?: string | null }

export interface ParsedEvent {
  title: string;
  date?: string;          // YYYY-MM-DD
  start?: string;         // HH:MM (24h)
  end?: string;           // HH:MM (24h)
  location?: string;
  repeat?: RepeatKey;     // "every Tuesday", "weekly"
  inviteIds: string[];
  people: string[];       // display names that matched
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WD = '(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const TIME = '(?:(?:\\d{1,2})(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?|am|pm|a|p)?|noon|midnight)';

// Words that end a "with …" or "at …" phrase.
const STOP = '(?=\\s+(?:on|at|@|with|next|this|today|tonight|tomorrow|for|from|in|by|' + WD + ')\\b|[,.;!?]|$)';

const MEALS: Record<string, [string, number]> = {   // default start, minutes
  breakfast: ['08:30', 60], brunch: ['11:00', 90], lunch: ['12:00', 60],
  coffee: ['10:00', 45], drinks: ['18:30', 90], dinner: ['19:00', 120], 'happy hour': ['17:30', 90],
};

const pad = (n: number) => String(n).padStart(2, '0');
const hm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

function weekdayIndex(word: string) {
  const w = word.toLowerCase().slice(0, 3);
  return WEEKDAYS.findIndex(d => d.startsWith(w));
}

/** Upcoming occurrence of a weekday (never today). */
function upcoming(today: string, wd: number) {
  const diff = (wd - parseKey(today).getDay() + 7) % 7 || 7;
  return addDays(today, diff);
}

/** Minutes since midnight for a time token, with meridiem inference. */
function toMinutes(tok: string, hint: 'am' | 'pm' | null): { min: number; explicit: boolean } | null {
  const t = tok.toLowerCase().replace(/\./g, '').trim();
  if (t === 'noon') return { min: 720, explicit: true };
  if (t === 'midnight') return { min: 0, explicit: true };
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]); const mm = Number(m[2] ?? 0);
  if (mm > 59 || h > 23) return null;
  const mer = m[3]?.[0] as 'a' | 'p' | undefined;
  if (mer) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (mer === 'p' ? 12 : 0);
    return { min: h * 60 + mm, explicit: true };
  }
  if (h >= 13) return { min: h * 60 + mm, explicit: true };
  // No am/pm: social plans skew afternoon/evening. 1–7 → PM, 8–11 → AM,
  // unless context (dinner, tonight, evening) says otherwise.
  const pm = hint === 'pm' || (hint !== 'am' && h >= 1 && h <= 7);
  return { min: ((h % 12) + (pm ? 12 : 0)) * 60 + mm, explicit: false };
}

function firstName(m: NLMember) {
  return (m.full_name ?? m.email ?? '').trim().split(/[\s@]+/)[0] ?? '';
}

export function parseEventText(text: string, opts: { today: string; members: NLMember[]; meId?: string | null }): ParsedEvent {
  const { today, members, meId } = opts;
  let s = ` ${text.trim()} `;
  const out: ParsedEvent = { title: '', inviteIds: [], people: [] };
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = s.match(re);
    if (m && fn(m) !== false) s = s.replace(m[0], ' ');
  };

  // 1 · Leading command words ("schedule", "add a", "can you set up").
  s = s.replace(/^\s*(?:(?:can|could)\s+you\s+|please\s+)?(?:schedule|add|create|plan|set\s+up|put|make|organi[sz]e|book(?=\s+(?:an?|the|my)\b))\b\s*(?:an?\s+|the\s+|my\s+)?/i, ' ');

  const ctxPm = /\b(dinner|tonight|evening|night|drinks|happy hour|party|movie)\b/i.test(s) ? 'pm' : /\b(breakfast|morning|brunch)\b/i.test(s) ? 'am' : null;

  // 2 · Repeats: "every Tuesday", "every other week", "each month", "weekly".
  take(new RegExp(`\\b(?:every|each)\\s+(other\\s+)?(day|weekday|week|month|year|${WD})\\b`, 'i'), m => {
    const other = !!m[1];
    const w = m[2].toLowerCase();
    if (w === 'day') out.repeat = 'daily';
    else if (w === 'weekday') out.repeat = 'weekdays';
    else if (w === 'week') out.repeat = other ? 'biweekly' : 'weekly';
    else if (w === 'month') out.repeat = 'monthly';
    else if (w === 'year') out.repeat = 'yearly';
    else { out.repeat = other ? 'biweekly' : 'weekly'; out.date = upcoming(today, weekdayIndex(w)); }
  });
  take(/\b(daily|weekly|biweekly|monthly|yearly|annually)\b/i, m => {
    const w = m[1].toLowerCase();
    out.repeat ??= w === 'annually' ? 'yearly' : (w as RepeatKey);
  });

  // 3 · Dates.
  take(/\b(?:the\s+)?day\s+after\s+tomorrow\b/i, () => { out.date = addDays(today, 2); });
  let tonight = false;
  take(/\btonight\b/i, () => { out.date ??= today; tonight = true; });
  take(/\btoday\b/i, () => { out.date ??= today; });
  take(/\btomorrow\b/i, () => { out.date ??= addDays(today, 1); });
  take(new RegExp(`\\b(next|this|coming)\\s+${WD}\\b`, 'i'), m => {
    const wd = weekdayIndex(m[2]);
    let d = upcoming(today, wd);
    // "next Friday" said on a Wednesday means the Friday of next week.
    if (m[1].toLowerCase() === 'next') {
      const daysAhead = (parseKey(d).getTime() - parseKey(today).getTime()) / 86400000;
      const todayIdx = (parseKey(today).getDay() + 6) % 7;   // Mon = 0
      if (daysAhead + todayIdx < 7) d = addDays(d, 7);
    }
    out.date ??= d;
  });
  take(/\b(this|next)\s+weekend\b/i, m => { const sat = upcoming(today, 6); out.date ??= m[1].toLowerCase() === 'next' && parseKey(today).getDay() < 6 && parseKey(today).getDay() > 0 ? addDays(sat, 7) : sat; });
  take(/\bnext\s+week\b/i, () => { out.date ??= upcoming(today, 1); });
  take(/\bin\s+(\d+|a|an|one|two|three)\s+(day|days|week|weeks)\b/i, m => {
    const n = ({ a: 1, an: 1, one: 1, two: 2, three: 3 } as Record<string, number>)[m[1].toLowerCase()] ?? Number(m[1]);
    out.date ??= addDays(today, m[2].toLowerCase().startsWith('week') ? n * 7 : n);
  });
  // "Oct 20", "October 20th", "20 Oct"
  const resolveMD = (mon: number, day: number, year?: number) => {
    if (day < 1 || day > 31) return undefined;
    const y0 = parseKey(today).getFullYear();
    let key = dateKey(new Date(year ?? y0, mon, day));
    if (!year && key < today) key = dateKey(new Date(y0 + 1, mon, day));
    return key;
  };
  take(new RegExp(`\\b(?:on\\s+)?${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'), m => {
    const d = resolveMD(MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)), Number(m[2]), m[3] ? Number(m[3]) : undefined);
    if (!d) return false; out.date ??= d;
  });
  take(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}\\b`, 'i'), m => {
    const d = resolveMD(MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)), Number(m[1]));
    if (!d) return false; out.date ??= d;
  });
  // "10/20", "10/20/2026"
  take(/\b(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, m => {
    const y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : undefined;
    const d = resolveMD(Number(m[1]) - 1, Number(m[2]), y);
    if (!d) return false; out.date ??= d;
  });
  // "on the 20th"
  take(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i, m => {
    const t = parseKey(today);
    const n = Number(m[1]);
    if (n < 1 || n > 31) return false;
    // This month if it's still ahead, otherwise next month.
    let d = dateKey(new Date(t.getFullYear(), t.getMonth(), n));
    if (d < today) d = dateKey(new Date(t.getFullYear(), t.getMonth() + 1, n));
    out.date ??= d;
  });
  // Bare weekday: "Tuesday", "on Fri"
  take(new RegExp(`\\b(?:on\\s+)?${WD}\\b`, 'i'), m => { out.date ??= upcoming(today, weekdayIndex(m[1])); });

  // 4 · Times: ranges first, then single times, then parts of day.
  take(new RegExp(`\\b(?:from\\s+|between\\s+)?(${TIME})\\s*(?:-|–|to|until|till|and)\\s*(${TIME})\\b`, 'i'), m => {
    const endTok = toMinutes(m[2], ctxPm);
    const endMer = /p/i.test(m[2]) ? 'pm' : /a/i.test(m[2]) && !/noon/i.test(m[2]) ? 'am' : ctxPm;
    const a = toMinutes(m[1], endMer as any);
    if (!a || !endTok) return false;
    let start = a.min;
    // "6-8pm": start inherits the end's meridiem when that keeps it before the end.
    if (!a.explicit && start >= endTok.min && start - 720 >= 0) start -= 720;
    out.start = hm(start); out.end = hm(endTok.min);
  });
  if (!out.start) {
    take(new RegExp(`(?:\\b(?:at|@|by|around)\\s*)(${TIME})(?=\\s|$|[,.;!?])`, 'i'), m => {
      const t = toMinutes(m[1], ctxPm);
      if (!t) return false;
      out.start = hm(t.min);
    });
  }
  if (!out.start) {
    take(/\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm)|noon|midnight)\b/i, m => {
      const t = toMinutes(m[1], ctxPm); if (!t) return false; out.start = hm(t.min);
    });
  }
  // Clock times anywhere ("team sync 14:30 tomorrow").
  if (!out.start) {
    take(/\b(\d{1,2}:[0-5]\d)\b/, m => {
      const t = toMinutes(m[1], ctxPm); if (!t) return false; out.start = hm(t.min);
    });
  }
  // Last resort: a bare hour standing alone at the end ("movie night friday 8").
  if (!out.start) {
    take(/(?:^|\s)(\d{1,2}(?::\d{2})?)(?=\s*(?:[,.;!?]|$))/, m => {
      if (Number(m[1].split(':')[0]) > 12) return false;
      const t = toMinutes(m[1], ctxPm); if (!t) return false; out.start = hm(t.min);
    });
  }
  if (!out.start && tonight) out.start = '19:00';
  take(/\b(?:in\s+the\s+|this\s+)?(morning|afternoon|evening)\b/i, m => {
    if (!out.start) out.start = ({ morning: '09:00', afternoon: '14:00', evening: '18:00' } as Record<string, string>)[m[1].toLowerCase()];
  });

  // 5 · Duration: "for 2 hours", "for 90 min", "for an hour", "for half an hour".
  let duration: number | null = null;
  take(/\bfor\s+(half\s+an?|an?|one|\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i, m => {
    const n = /half/i.test(m[1]) ? 0.5 : /^(an?|one)$/i.test(m[1]) ? 1 : Number(m[1]);
    duration = /^h/i.test(m[2]) ? n * 60 : n;
  });

  // Meals imply a sensible time and length when none was given.
  const meal = Object.keys(MEALS).find(k => new RegExp(`\\b${k}\\b`, 'i').test(s));
  if (meal && !out.start) out.start = MEALS[meal][0];
  if (out.start && !out.end) {
    const [h, m] = out.start.split(':').map(Number);
    out.end = hm(h * 60 + m + (duration ?? (meal ? MEALS[meal][1] : 60)));
  }

  // 6 · People: "with Ana", "with Ana and Ben", "with Ana, Ben & Chloe".
  // Commas separate names here, so they don't end the phrase.
  const PEOPLE_STOP = STOP.replace('|[,.;!?]|', '|[.;!?]|');
  take(new RegExp(`\\bwith\\s+(.+?)${PEOPLE_STOP}`, 'i'), m => {
    const names = m[1].split(/\s*(?:,|&|\band\b)\s*/i).map(n => n.trim()).filter(Boolean);
    names.forEach(n => {
      const q = n.toLowerCase().replace(/^the\s+/, '');
      const hit = members.find(p => p.id !== meId && (
        (p.full_name ?? '').toLowerCase() === q || firstName(p).toLowerCase() === q ||
        (q.length >= 3 && firstName(p).toLowerCase().startsWith(q))
      ));
      if (hit && !out.inviteIds.includes(hit.id)) {
        out.inviteIds.push(hit.id);
        out.people.push(hit.full_name ?? firstName(hit));
        // Show their name properly in the title ("with chloe" → "with Chloe").
        const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        s = s.replace(new RegExp(`\\b${escaped}\\b`, 'i'), firstName(hit));
      }
    });
    // Keep "with Ana" in the title — it reads naturally ("Dinner with Ana").
    return false;
  });

  // 7 · Place: "at Joe's Pizza" (anything after "at" that isn't a time).
  take(new RegExp(`\\b(?:at|@)\\s+(?!${TIME}\\b)([^,.;!?]+?)${STOP}`, 'i'), m => {
    const place = m[1].trim();
    if (!place || /^(the\s+)?(same|usual)\s+time$/i.test(place)) return false;
    out.location = place.replace(/\s+/g, ' ');
  });

  // 8 · Title: what's left, tidied.
  let title = s
    .replace(/\b(on|at|@|for|from|by|around|in the|this|next)\s*(?=[,.;!?]|$)/gi, ' ')
    .replace(/\s+(on|at|@|for|from|by)\s+(?=(on|at|@|for|from|by|with)\b)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, '')
    .replace(/\s+(on|at|for|from|by|the)$/i, '');
  if (title) title = title[0].toUpperCase() + title.slice(1);
  out.title = title;
  return out;
}
