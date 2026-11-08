// A group's cover: its photo, blurred, with its name set over it. Groups
// without a photo get a warm wash of their color instead. No emoji.

import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Group } from '../types';
import { DEMO_GROUP_PHOTOS } from '../lib/demo';
import { groupLook } from './GroupAvatar';
import Cover, { useCoverInk as useInk } from './Cover';
import { initialsFor, fonts } from '../theme';
import { Txt } from './ui';

type CoverGroup = Pick<Group, 'id' | 'name'> & Partial<Group>;

/** The group's photo: its own, or a demo cover. */
export const coverPhoto = (group: CoverGroup) => group.avatar_url ?? DEMO_GROUP_PHOTOS[group.id] ?? null;

/** What sits on a group's cover: cream on a photo, the group's ink on a color wash. */
export const useCoverInk = (group: CoverGroup) => useInk(coverPhoto(group), groupLook(group).color);

export default function GroupCover({ group, blur = 3, round, style, children }: {
  group: CoverGroup;
  blur?: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  return (
    <Cover photo={coverPhoto(group)} wash={groupLook(group).color} blur={blur} round={round} label={`${group.name}, shared calendar`} style={style}>
      {children}
    </Cover>
  );
}

/** A round cover with the group's initials in the title serif, for pins. */
export function GroupCoverCircle({ group, size }: { group: CoverGroup; size: number }) {
  const { ink } = useCoverInk(group);
  return (
    <GroupCover group={group} round blur={2} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Txt v="title" style={{ color: ink, fontSize: Math.round(size * 0.36), lineHeight: Math.round(size * 0.42), fontFamily: fonts.display }}>
        {initialsFor(group.name)}
      </Txt>
    </GroupCover>
  );
}
