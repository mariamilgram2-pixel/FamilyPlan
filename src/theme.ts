// Design tokens for the sheep redesign.
// Green is now a role (today, primary CTA, active tab) — not a background.
// Rose signals social state (you're going, notifications, "idea" proposals).

export const colors = {
  ground:     '#F3EFE4',
  ground2:    '#EBE5D4',
  card:       '#FFFFFF',
  ink:        '#2B2A26',
  ink2:       '#4B4842',
  muted:      '#8A8579',
  muted2:     '#B4AE9F',
  border:     '#E8E1D0',
  border2:    '#DCD3BE',
  sheep:      '#8FB569',
  sheepDeep:  '#6E9A46',
  sheepTint:  '#E4EED4',
  rose:       '#C77A6E',
  roseDeep:   '#A65A4E',
  roseTint:   '#F3DED8',
  danger:     '#B04A3A',
};

// Deterministic per-person color from a stable palette, so the same
// person keeps the same avatar tint across the whole app.
const AVATAR_PALETTE = [
  '#C77A6E', // rose
  '#5B7C99', // dusty blue
  '#D4A94B', // honey
  '#8C6E9B', // muted plum
  '#6E9A46', // deep sheep
  '#B58C6F', // taupe
  '#4E9A8F', // teal
  '#7B6BA0', // dusty purple
];

export function avatarColorFor(seed: string | null | undefined): string {
  if (!seed) return colors.muted2;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function initialsFor(name: string | null | undefined, fallback = '?'): string {
  const s = (name ?? '').trim();
  if (!s) return fallback;
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 20,
  pill: 999,
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28,
};

export const shadow = {
  card: {
    shadowColor: '#3c321e',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  lifted: {
    shadowColor: '#3c321e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
};
