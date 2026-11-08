import { describe, it, expect, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
const { isHidden } = await import('../dismissed');

describe('isHidden', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  const ago = (d: number) => new Date(now - d * 86400000).toISOString();

  it('stays cleared for a while, then may come back', () => {
    expect(isHidden({ 'quiet:fran': ago(5) }, 'quiet:fran', now)).toBe(true);
    expect(isHidden({ 'quiet:fran': ago(61) }, 'quiet:fran', now)).toBe(false);
    expect(isHidden({}, 'quiet:fran', now)).toBe(false);
  });
});
