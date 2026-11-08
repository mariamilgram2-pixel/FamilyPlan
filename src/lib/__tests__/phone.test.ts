import { describe, it, expect } from 'vitest';
import { digitsOf, firstNameOf, formatPhone, looksLikePhone, phoneMatches, samePhone } from '../phone';

describe('phone', () => {
  it('tells numbers from names', () => {
    expect(looksLikePhone('(555) 123-4567')).toBe(true);
    expect(looksLikePhone('+44 20 7946 0958')).toBe(true);
    expect(looksLikePhone('555 12')).toBe(false);
    expect(looksLikePhone('Ana 5551234567')).toBe(false);
    expect(looksLikePhone('')).toBe(false);
  });

  it('tidies US numbers and leaves others as typed', () => {
    expect(formatPhone('5551234567')).toBe('(555) 123-4567');
    expect(formatPhone('+1 555.123.4567')).toBe('(555) 123-4567');
    expect(formatPhone('+44  20 7946 0958')).toBe('+44 20 7946 0958');
    expect(formatPhone('0123 4567')).toBe('0123 4567');
  });

  it('knows the same number written two ways', () => {
    expect(samePhone('+1 (555) 123-4567', '555.123.4567')).toBe(true);
    expect(samePhone('555 123 4567', '555 123 4568')).toBe(false);
    expect(samePhone(null, '5551234567')).toBe(false);
    expect(digitsOf('+1 (555)')).toBe('1555');
  });

  it('finds a number by the digits typed', () => {
    expect(phoneMatches('(555) 123-4567', '123')).toBe(true);
    expect(phoneMatches('(555) 123-4567', '12')).toBe(false);
    expect(phoneMatches(null, '555')).toBe(false);
  });
});

describe('firstNameOf', () => {
  it('keeps a number whole', () => {
    expect(firstNameOf('Lena Brooks')).toBe('Lena');
    expect(firstNameOf('(415) 555-0199')).toBe('(415) 555-0199');
  });
});
