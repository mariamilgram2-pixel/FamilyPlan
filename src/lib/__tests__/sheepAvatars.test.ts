import { describe, it, expect } from 'vitest';
import { SHEEP_AVATARS, SKIN_TONES, parseSheepUrl, sheepAvatarUrl, sheepLookOf } from '../sheepAvatars';

describe('sheep avatars', () => {
  it('leaves Black sheep out of the picker but still draws it', () => {
    expect(SHEEP_AVATARS.some(s => s.id === 'dusk')).toBe(false);
    expect(sheepLookOf('sheep:dusk')?.id).toBe('dusk');
  });

  it('round-trips a sheep with a skin tone', () => {
    const url = sheepAvatarUrl('clay', 'medium');
    expect(url).toBe('sheep:clay:medium');
    expect(parseSheepUrl(url)).toEqual({ id: 'clay', tone: 'medium' });
    const tone = SKIN_TONES.find(t => t.id === 'medium')!;
    expect(sheepLookOf(url)).toMatchObject({ id: 'clay', face: tone.face, eye: tone.eye });
  });

  it('keeps the drawn face when there is no tone, or an unknown one', () => {
    const own = sheepLookOf('sheep:butter')!;
    expect(parseSheepUrl('sheep:butter')).toEqual({ id: 'butter', tone: null });
    expect(sheepLookOf('sheep:butter:purple')!.face).toBe(own.face);
  });

  it('is not a sheep for photos, unknown sheep, or nothing', () => {
    expect(sheepLookOf('https://example.com/me.jpg')).toBeNull();
    expect(sheepLookOf('sheep:nope')).toBeNull();
    expect(sheepLookOf(null)).toBeNull();
  });
});

describe('persona picker', () => {
  it('offers the 12 personas in order', () => {
    expect(SHEEP_AVATARS.map(s => s.label)).toEqual(
      ['Farmer', 'DJ', 'Foodie', 'Politician', 'Tired', 'Ghost', 'Bot', 'Model', 'Party', 'Doctor', 'Comedian', 'Gardener']);
  });

  it('still draws sheep picked before the personas', () => {
    expect(sheepLookOf('sheep:butter')?.label).toBe('Bookworm');
    expect(sheepLookOf('sheep:sky')?.accessory).toBe('headphones');
  });
});
