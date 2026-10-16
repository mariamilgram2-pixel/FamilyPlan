import { describe, it, expect } from 'vitest';
import { rangeLabel } from '../dates';

const now = new Date(2026, 9, 15);

describe('rangeLabel', () => {
  it.each([
    ['2026-10-18', '2026-10-24', 'Oct 18–24'],
    ['2026-10-30', '2026-11-05', 'Oct 30–Nov 5'],
    ['2026-12-28', '2027-01-03', 'Dec 28–Jan 3'],
    ['2027-03-01', '2027-03-07', 'Mar 1–7, 2027'],
    ['2027-12-27', '2028-01-02', 'Dec 27, 2027–Jan 2, 2028'],
  ])('%s to %s → %s', (from, to, text) => {
    expect(rangeLabel(from, to, now).text).toBe(text);
  });

  it('spoken form has full dates', () => {
    expect(rangeLabel('2026-10-18', '2026-10-24', now).spoken)
      .toBe('October 18, 2026 to October 24, 2026');
  });
});
