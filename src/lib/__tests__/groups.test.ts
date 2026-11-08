import { describe, it, expect } from 'vitest';
import { isCalendar, isPastGroup, lastUsedAt, nameFromPeople } from '../groupKinds';

describe('groups', () => {
  it('names an unnamed group by who is in it', () => {
    expect(nameFromPeople([])).toBe('Just you');
    expect(nameFromPeople(['Ana Reyes'])).toBe('Ana');
    expect(nameFromPeople(['Ana Reyes', 'Ben Okafor'])).toBe('Ana & Ben');
    expect(nameFromPeople(['Ana', 'Ben', 'Chloe'])).toBe('Ana, Ben & Chloe');
    expect(nameFromPeople(['Ana', 'Ben', 'Chloe', 'Dev', 'Eli'])).toBe('Ana, Ben +3');
  });

  it('treats groups made before this as shared calendars', () => {
    expect(isCalendar({})).toBe(true);
    expect(isCalendar({ shared_calendar: true })).toBe(true);
    expect(isCalendar({ shared_calendar: false })).toBe(false);
    expect(isCalendar(null)).toBe(false);
  });
});

describe('past groups', () => {
  const DAY = 86400000;
  const now = Date.UTC(2026, 10, 8);
  const ago = (d: number) => new Date(now - d * DAY).toISOString();
  const g = { id: 'g1', created_at: ago(200), shared_calendar: false };

  it('counts its newest plan or event, and a coming one as now', () => {
    expect(lastUsedAt(g, [{ group_id: 'g1', start_time: ago(10) }], [], now)).toBe(now - 10 * DAY);
    expect(lastUsedAt(g, [{ group_id: 'g1', start_time: ago(-5) }], [], now)).toBe(now);
    expect(lastUsedAt(g, [], [{ group_id: null, audience_group_ids: ['g1'], created_at: ago(90), last_activity_at: ago(3) }], now)).toBe(now - 3 * DAY);
    expect(lastUsedAt(g, [{ group_id: 'other', start_time: ago(1) }], [], now)).toBe(now - 200 * DAY);
  });

  it('moves a group out of the way after 60 days, never a shared calendar', () => {
    expect(isPastGroup(g, now - 61 * DAY, now)).toBe(true);
    expect(isPastGroup(g, now - 30 * DAY, now)).toBe(false);
    expect(isPastGroup({ shared_calendar: true }, now - 400 * DAY, now)).toBe(false);
  });
});
