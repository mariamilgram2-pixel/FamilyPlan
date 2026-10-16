import { describe, it, expect, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }));

const { findSlots } = await import('../planner');

describe('findSlots', () => {
  it('keeps the asked-for time on the day clocks change', () => {
    const [slot] = findSlots({
      busy: [], work: [], preferredStart: '19:00', timeZone: 'America/New_York',
      now: new Date('2026-03-07T12:00:00Z'),
      prefs: { partOfDay: 'evening', horizon: 'soon', days: 'any', duration: 120, onlyDate: '2026-03-08' },
    });
    expect(slot.start).toBe('2026-03-08T23:00:00.000Z');   // 7pm EDT, not 8pm
  });
});
