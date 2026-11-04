// A group's round avatar: its little flock (components/GroupFlock), or the
// photo the group uploaded. GROUP_COLORS and groupLook still color group
// covers that use them.

import React from 'react';
import { ViewStyle } from 'react-native';
import { GroupFlock } from './GroupFlock';
import { Group } from '../types';

/** Soft circles with readable text in both themes. */
export const GROUP_COLORS: Record<string, { light: string; dark: string; ink: { light: string; dark: string } }> = {
  sky:     { light: '#DCEBFA', dark: '#1F3550', ink: { light: '#1F4E7A', dark: '#B9D7F5' } },
  apricot: { light: '#FCE4D2', dark: '#4A2F1E', ink: { light: '#8A4A1C', dark: '#F6C9A6' } },
  lilac:   { light: '#E9E1F7', dark: '#352B4C', ink: { light: '#5B3F8C', dark: '#D4C5F0' } },
  rose:    { light: '#F9DEE3', dark: '#4A2430', ink: { light: '#8C2F48', dark: '#F2BCC8' } },
  sand:    { light: '#F2EBD9', dark: '#3E3726', ink: { light: '#6B5A2E', dark: '#E5D8B0' } },
  sage:    { light: '#E1EEDC', dark: '#26392A', ink: { light: '#3A6A3A', dark: '#C2DDBB' } },
};
const COLOR_KEYS = Object.keys(GROUP_COLORS);

// A first guess from the name; anything unmatched gets its initials.
const EMOJI_BY_WORD: [RegExp, string][] = [
  [/\b(family|fam|home|house|cousins?)\b/i, '🏡'],
  [/\b(book|books|reading|read)\b/i, '📚'],
  [/\b(soccer|football)\b/i, '⚽'],
  [/\b(basketball|hoops)\b/i, '🏀'],
  [/\b(hike|hiking|trail|outdoors?|camping)\b/i, '🥾'],
  [/\b(run|running|runners?)\b/i, '👟'],
  [/\b(dinner|supper|food|cook|cooking|brunch)\b/i, '🍽️'],
  [/\b(game|games|board)\b/i, '🎲'],
  [/\b(work|team|office)\b/i, '💼'],
  [/\b(school|class|pta|parents)\b/i, '🎒'],
  [/\b(music|band|choir)\b/i, '🎵'],
  [/\b(trip|travel)\b/i, '✈️'],
  [/\b(spouse|partner|couple|us two|date night)\b|\+/i, '💞'],
  [/\b(friends|crew|gang|squad)\b/i, '🎉'],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function groupLook(group: Pick<Group, 'id' | 'name'> & Partial<Group>) {
  const emoji = group.avatar_emoji ?? EMOJI_BY_WORD.find(([re]) => re.test(group.name))?.[1] ?? null;
  const color = group.avatar_color && GROUP_COLORS[group.avatar_color] ? group.avatar_color : COLOR_KEYS[hash(group.id) % COLOR_KEYS.length];
  return { emoji, color };
}

/** A group's round picture: its flock (see GroupFlock). Kept under this name for existing callers. */
export default function GroupAvatar({ group, size = 32, count, style }: {
  group: Pick<Group, 'id' | 'name'> & Partial<Group>;
  size?: number;
  count?: number;          // members, when known: one to three sheep
  style?: ViewStyle;
}) {
  return <GroupFlock group={group} size={size} count={count} style={style} />;
}
