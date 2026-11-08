// The sheep profile pictures anyone can pick (drawn by components/SheepAvatar).
// Stored like a photo, in avatar_url, as "sheep:<id>:<skin tone>" (e.g.
// "sheep:clay:medium"). Older ones have no tone ("sheep:clay") and keep the
// face they were drawn with.

export type Accessory = 'none' | 'glasses' | 'beanie' | 'headphones' | 'flower' | 'bow' | 'scarf' | 'beret' | 'partyHat' | 'sunglasses'
  | 'strawHat' | 'chefHat' | 'suit' | 'nightcap' | 'ghost' | 'antenna' | 'model' | 'doctor' | 'comedian' | 'gardener';

export interface SheepLook {
  id: string;
  label: string;        // what a picker would call it
  bg: string;
  wool: string;
  face: string;
  eye: string;
  accessory: Accessory;
  accent?: string;      // the accessory's color
}

export const INK = '#2E2A24';
export const CREAM = '#FBF7EE';
const WHITE = '#FFFFFF';
const CHARCOAL = '#3B3631';
const CARAMEL = '#C79A6B';
const LIGHT_FACE = '#F3E7D6';
const DARK_FACE = '#2F2B26';

const ALL_SHEEP: SheepLook[] = [
  { id: 'meadow', label: 'Meadow',       bg: '#C9DDB5', wool: CREAM,    face: DARK_FACE, eye: CREAM, accessory: 'none' },
  { id: 'butter', label: 'Bookworm',     bg: '#F2DE9B', wool: WHITE,    face: LIGHT_FACE, eye: INK,  accessory: 'glasses' },
  { id: 'clay',   label: 'Cozy',         bg: '#E7B9A0', wool: CARAMEL,  face: DARK_FACE, eye: CREAM, accessory: 'beanie', accent: '#56653F' },
  { id: 'sky',    label: 'DJ',           bg: '#B9D3E3', wool: CREAM,    face: DARK_FACE, eye: CREAM, accessory: 'headphones', accent: '#D9643F' },
  { id: 'dusk',   label: 'Black sheep',  bg: '#CDBFDD', wool: CHARCOAL, face: '#24201C', eye: CREAM, accessory: 'flower', accent: '#F2C14E' },
  { id: 'peach',  label: 'Bow',          bg: '#F4C6A8', wool: WHITE,    face: LIGHT_FACE, eye: INK,  accessory: 'bow', accent: '#C8506A' },
  { id: 'moss',   label: 'Scarf',        bg: '#A9BE8E', wool: '#D3CEC6', face: DARK_FACE, eye: CREAM, accessory: 'scarf', accent: '#B5543C' },
  { id: 'sand',   label: 'Artist',       bg: '#E9DCC3', wool: CREAM,    face: '#8A5E3C', eye: CREAM, accessory: 'beret', accent: '#3E4A2E' },
  { id: 'rose',   label: 'Party',        bg: '#E8BDC2', wool: CREAM,    face: DARK_FACE, eye: CREAM, accessory: 'partyHat', accent: '#4C7FA8' },
  { id: 'sea',    label: 'Beach',        bg: '#9FC6BE', wool: WHITE,    face: LIGHT_FACE, eye: INK,  accessory: 'sunglasses' },
  { id: 'oat',    label: 'Oat',          bg: '#EFE3CB', wool: CARAMEL,  face: LIGHT_FACE, eye: INK,  accessory: 'none' },
  { id: 'plum',   label: 'Professor',    bg: '#C7A9B8', wool: CREAM,    face: DARK_FACE, eye: CREAM, accessory: 'glasses' },
  // The personas.
  { id: 'farmer',     label: 'Farmer',     bg: '#F0D9A4', wool: CREAM,     face: DARK_FACE, eye: CREAM, accessory: 'strawHat', accent: '#B5543C' },
  { id: 'foodie',     label: 'Foodie',     bg: '#F4C6A8', wool: WHITE,     face: LIGHT_FACE, eye: INK,  accessory: 'chefHat' },
  { id: 'politician', label: 'Politician', bg: '#B9C7DD', wool: CREAM,     face: DARK_FACE, eye: CREAM, accessory: 'suit', accent: '#C0392B' },
  { id: 'tired',      label: 'Tired',      bg: '#CDBFDD', wool: '#D3CEC6', face: LIGHT_FACE, eye: INK,  accessory: 'nightcap', accent: '#4C7FA8' },
  { id: 'ghost',      label: 'Ghost',      bg: '#8E9AAE', wool: WHITE,     face: DARK_FACE, eye: CREAM, accessory: 'ghost' },
  { id: 'bot',        label: 'Bot',        bg: '#A9D6CF', wool: '#C9CED6', face: DARK_FACE, eye: CREAM, accessory: 'antenna', accent: '#D9643F' },
  { id: 'model',      label: 'Model',      bg: '#F2DE9B', wool: WHITE,     face: LIGHT_FACE, eye: INK,  accessory: 'model' },
  { id: 'doctor',     label: 'Doctor',     bg: '#C9DDB5', wool: CREAM,     face: LIGHT_FACE, eye: INK,  accessory: 'doctor', accent: '#5B6B7A' },
  { id: 'comedian',   label: 'Comedian',   bg: '#E7B9A0', wool: CREAM,     face: DARK_FACE, eye: CREAM, accessory: 'comedian', accent: '#C8506A' },
  { id: 'gardener',   label: 'Gardener',   bg: '#F3D7B6', wool: CREAM,     face: LIGHT_FACE, eye: INK,  accessory: 'gardener', accent: '#5E8C3A' },
];

const byId = new Map(ALL_SHEEP.map(s => [s.id, s]));

/**
 * The ones to pick from, in order: personas. The earlier sheep (Meadow,
 * Bookworm, Black sheep…) still draw for anyone who already has one.
 */
const PICKER = ['farmer', 'sky', 'foodie', 'politician', 'tired', 'ghost', 'bot', 'model', 'rose', 'doctor', 'comedian', 'gardener'];
const PERSONA: Record<string, string> = { sky: 'DJ', rose: 'Party' };
export const SHEEP_AVATARS: SheepLook[] = PICKER.map(id => ({ ...byId.get(id)!, label: PERSONA[id] ?? byId.get(id)!.label }));

/** Skin tones for the face, light to deep, like emoji skin tones. Any sheep can wear any of them. */
export interface SkinTone { id: string; label: string; face: string; eye: string }
export const SKIN_TONES: SkinTone[] = [
  { id: 'light',       label: 'Light',        face: '#F6E3CF', eye: INK },
  { id: 'mediumLight', label: 'Medium light', face: '#E3BF98', eye: INK },
  { id: 'medium',      label: 'Medium',       face: '#C3936A', eye: INK },
  { id: 'mediumDark',  label: 'Medium dark',  face: '#94643F', eye: CREAM },
  { id: 'dark',        label: 'Dark',         face: '#5F3F2A', eye: CREAM },
  { id: 'deep',        label: 'Deep',         face: '#2F2B26', eye: CREAM },
];
const toneById = new Map(SKIN_TONES.map(t => [t.id, t]));

/** Just the sheep and tone named in an avatar_url; null if it isn't a sheep. */
export function parseSheepUrl(url: string | null | undefined): { id: string; tone: string | null } | null {
  if (!url?.startsWith('sheep:')) return null;
  const [id, tone] = url.slice(6).split(':');
  if (!byId.has(id)) return null;
  return { id, tone: tone && toneById.has(tone) ? tone : null };
}

/** A sheep in a skin tone (or its own face, with none). */
export function withTone(look: SheepLook, tone: string | null | undefined): SheepLook {
  const t = tone ? toneById.get(tone) : undefined;
  return t ? { ...look, face: t.face, eye: t.eye } : look;
}

/** "sheep:clay:medium" → the Cozy sheep with a medium face; anything else → null (a photo, or nothing). */
export function sheepLookOf(url: string | null | undefined): SheepLook | null {
  const parsed = parseSheepUrl(url);
  return parsed ? withTone(byId.get(parsed.id)!, parsed.tone) : null;
}

export const sheepAvatarUrl = (id: string, tone?: string | null) => (tone ? `sheep:${id}:${tone}` : `sheep:${id}`);

