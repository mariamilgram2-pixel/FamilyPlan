// The sheep profile pictures anyone can pick (drawn by components/SheepAvatar).
// Stored like a photo, in avatar_url, as "sheep:<id>" (e.g. "sheep:clay").

export type Accessory = 'none' | 'glasses' | 'beanie' | 'headphones' | 'flower' | 'bow' | 'scarf' | 'beret' | 'partyHat' | 'sunglasses';

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

export const SHEEP_AVATARS: SheepLook[] = [
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
];

const byId = new Map(SHEEP_AVATARS.map(s => [s.id, s]));

/** "sheep:clay" → the Cozy sheep; anything else → null (a photo, or nothing). */
export function sheepLookOf(url: string | null | undefined): SheepLook | null {
  if (!url?.startsWith('sheep:')) return null;
  return byId.get(url.slice(6)) ?? null;
}

export const sheepAvatarUrl = (id: string) => `sheep:${id}`;

