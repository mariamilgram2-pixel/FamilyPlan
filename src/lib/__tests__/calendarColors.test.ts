import { describe, it, expect } from 'vitest';
import { CalendarColorPrefs, DEFAULT_PREFS, PALETTE, PERSONAL, calendarColor, categoryFor, colorFor, tintOf } from '../calendarColors';

const order = ['fam', 'books', 'climb'];
const prefs = (p: Partial<CalendarColorPrefs>): CalendarColorPrefs => ({ ...DEFAULT_PREFS, ...p });

describe('colorFor', () => {
  it('one color: no color at all', () => {
    expect(colorFor({ groupId: 'fam', key: 'e1' }, prefs({ mode: 'none' }), order)).toBeNull();
  });

  it('by calendar: your pick, else the palette by place, skipping olive', () => {
    expect(colorFor({ groupId: 'books', key: 'e1' }, prefs({ mode: 'calendar' }), order)).toBe(PALETTE[2].color);
    expect(colorFor({ groupId: 'books', key: 'e1' }, prefs({ mode: 'calendar', calendars: { books: '#123456' } }), order)).toBe('#123456');
  });

  it('a plan with just people is on your Personal calendar, not a group’s', () => {
    const p = prefs({ mode: 'calendar' });
    expect(colorFor({ groupId: null, key: 'e1' }, p, order)).not.toBe(calendarColor('fam', p, order));
    expect(colorFor({ groupId: null, key: 'e1' }, prefs({ mode: 'calendar', calendars: { [PERSONAL]: '#123456' } }), order)).toBe('#123456');
  });

  it('by category: the category, falling back to the calendar', () => {
    const p = prefs({ mode: 'category', assigned: { e1: 'cat-meals' } });
    expect(colorFor({ groupId: 'fam', key: 'e1' }, p, order)).toBe('#C0663F');
    expect(colorFor({ groupId: 'fam', key: 'e2' }, p, order)).toBe(calendarColor('fam', p, order));
  });

  it('a deleted category reads as unfiled', () => {
    const p = prefs({ mode: 'category', assigned: { e1: 'gone' } });
    expect(categoryFor('e1', p)).toBeNull();
  });
});

describe('tintOf', () => {
  it('turns a hex into rgba', () => {
    expect(tintOf('#C0663F', 0.2)).toBe('rgba(192,102,63,0.2)');
  });
});
