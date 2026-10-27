import { describe, it, expect, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
vi.mock('../supabase', () => ({ supabase: {} }));
const { placeText, searchPlaces, splitPlace } = await import('../places');

describe('places in one line', () => {
  it('name first, then the address', () => {
    expect(placeText('Via Carota', '51 Grove St, New York, NY 10014, USA')).toBe('Via Carota, 51 Grove St, New York, NY 10014, USA');
    expect(splitPlace('Via Carota, 51 Grove St, New York, NY 10014, USA')).toEqual({ name: 'Via Carota', address: '51 Grove St, New York, NY 10014, USA' });
  });
  it('an address on its own isn’t doubled', () => {
    expect(placeText('51 Grove St', '51 Grove St, New York, NY 10014, USA')).toBe('51 Grove St, New York, NY 10014, USA');
  });
  it('typed by hand, it’s just a name', () => {
    expect(placeText('Grandma’s house')).toBe('Grandma’s house');
    expect(splitPlace('Grandma’s house')).toEqual({ name: 'Grandma’s house', address: null });
  });
  it('the demo finds a few real places', async () => {
    expect((await searchPlaces('via car', 's', true)).map(h => h.name)).toEqual(['Via Carota']);
    expect(await searchPlaces('v', 's', true)).toEqual([]);
  });
});
