// Small shared pieces of People: the "needs you" dot, the pinned grid, group
// cards, round actions, and the Needs you list atop a person's or group's detail.

import React from 'react';
import { ScrollView, View } from 'react-native';
import { NeedsYouItem } from '../../lib/needsYou';
import { Group, Profile } from '../../types';
import AvatarStack from '../../components/AvatarStack';
import GroupCover, { useCoverInk } from '../../components/GroupCover';
import { AvatarPerson } from '../../components/Avatar';
import { Icon, IconName, ListRow, ListSection, Menu, MenuItem, Tappable, Txt } from '../../components/ui';
import { continuous, radius, space, useLayout, useTheme } from '../../theme';

/** A green dot on an avatar's corner, like an unread conversation. */
export function Dotted({ on, size, ringColor, children }: { on: boolean; size: number; ringColor?: string; children: React.ReactNode }) {
  const { c } = useTheme();
  const dot = Math.max(10, Math.round(size * 0.28));
  return (
    <View>
      {children}
      {on ? (
        <View
          accessibilityLabel="Your turn"
          style={{
            position: 'absolute', top: -1, right: -1, width: dot, height: dot, borderRadius: dot / 2,
            backgroundColor: c.tint, borderWidth: 2, borderColor: ringColor ?? c.background,
          }}
        />
      ) : null}
    </View>
  );
}

export interface PinTile {
  key: string;
  label: string;
  avatar: (size: number) => React.ReactNode;
  needs: boolean;
  count: number;                 // things waiting on you; 2+ shows as a number badge
  bubble: string | null;         // why to look, when it's one thing: "Reply?", "🎂 Nov 2"
  onPress: () => void;
  onUnpin: () => void;
}

const PIN_AVATAR = 64;

/** Pinned people and groups as a grid of big avatars, three across; centered when fewer. */
export function PinnedGrid({ tiles }: { tiles: PinTile[] }) {
  const { compact } = useLayout();
  if (!tiles.length) return null;
  return (
    <View style={{
      flexDirection: 'row', flexWrap: 'wrap', rowGap: space.m, paddingHorizontal: compact ? 0 : space.s,
      justifyContent: tiles.length < 3 ? 'center' : 'flex-start', paddingTop: tiles.some(t => t.bubble) ? space.m : 0,
    }}>
      {tiles.map(t => (
        <View key={t.key} style={{ width: `${100 / 3}%` as any }}>
          <Menu title={t.label} sections={[{ items: [{ key: 'unpin', label: 'Unpin', icon: 'pin-outline', onSelect: t.onUnpin }] }]}>
            {(open) => (
              <Tappable
                onPress={t.onPress}
                onLongPress={open}
                feedback="opacity"
                accessibilityLabel={`${t.label}${t.needs ? ', your turn' : ''}, pinned`}
                style={{ alignItems: 'center', gap: space.s, paddingVertical: space.hair }}
              >
                <View>
                  <Dotted on={t.needs && !t.bubble && t.count < 2} size={PIN_AVATAR}>{t.avatar(PIN_AVATAR)}</Dotted>
                  {t.count > 1 ? <CountBadge n={t.count} /> : t.bubble ? <Bubble text={t.bubble} tint={t.needs} /> : null}
                </View>
                <Txt v="footnote" align="center" numberOfLines={1} style={{ maxWidth: PIN_AVATAR + space.l }}>{t.label}</Txt>
              </Tappable>
            )}
          </Menu>
        </View>
      ))}
    </View>
  );
}

/** A count on a pinned avatar's corner, like an app icon's badge. */
function CountBadge({ n }: { n: number }) {
  const { c } = useTheme();
  return (
    <View
      accessibilityLabel={`Your turn: ${n} things`}
      style={{
        position: 'absolute', top: -2, right: -2, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6,
        alignItems: 'center', justifyContent: 'center', backgroundColor: c.tint, borderWidth: 2, borderColor: c.background,
      }}
    >
      <Txt v="caption" tone="onTint">{n > 9 ? '9+' : n}</Txt>
    </View>
  );
}

/** A little speech bubble over a pinned avatar, like a pinned conversation's. */
function Bubble({ text, tint }: { text: string; tint: boolean }) {
  const { c } = useTheme();
  const bg = tint ? c.tint : c.background;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -space.m, left: PIN_AVATAR * 0.45, alignItems: 'flex-start' }}>
      <View style={{
        paddingHorizontal: space.s, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: bg, ...continuous,
        shadowColor: c.shadow, shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2,
      }}>
        <Txt v="caption" tone={tint ? 'onTint' : 'primary'} numberOfLines={1}>{text}</Txt>
      </View>
      {/* The tail, pointing down-left at the avatar. */}
      <View style={{ width: 8, height: 8, marginTop: -5, marginLeft: space.s, backgroundColor: bg, transform: [{ rotate: '45deg' }] }} />
    </View>
  );
}

// ─── Group cards ─────────────────────────────────────────────────────────────

const CARD_WIDTH = 176;
const CARD_HEIGHT = 132;

export interface GroupCardData {
  group: Group;
  members: Profile[];
  active: boolean;
  needs: boolean;
  selected: boolean;
  pinItem: MenuItem;
  onPress: () => void;
}

/**
 * Your groups as a row of covers you scroll sideways: the group's photo,
 * blurred, with its name set over it. Ends in "New Group".
 */
export function GroupCards({ cards, onNew }: { cards: GroupCardData[]; onNew: () => void }) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const bleed = compact ? space.m : space.s;
  const card = { width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: radius.group, ...continuous };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -bleed }}
      contentContainerStyle={{ paddingHorizontal: bleed, gap: space.s }}
    >
      {cards.map(d => (
        <Menu key={d.group.id} title={d.group.name} sections={[{ items: [d.pinItem] }]}>
          {(open) => (
            <Tappable
              onPress={d.onPress}
              onLongPress={open}
              feedback="opacity"
              accessibilityLabel={`${d.group.name}, ${d.members.length} members${d.needs ? ', your turn' : ''}`}
              style={[card, d.selected && { borderWidth: 2, borderColor: c.tint, borderRadius: radius.group + 2 }]}
            >
              <GroupCard data={d} />
            </Tappable>
          )}
        </Menu>
      ))}
      <Tappable
        onPress={onNew}
        accessibilityLabel="New group"
        style={{
          ...card, alignItems: 'center', justifyContent: 'center',
          borderWidth: 2, borderStyle: 'dashed', borderColor: c.separator,
        }}
      >
        <Icon name="add" size={24} color={c.tint} />
        <Txt v="footnote" tone="tint" semibold>New Group</Txt>
      </Tappable>
    </ScrollView>
  );
}

function GroupCard({ data: d }: { data: GroupCardData }) {
  const { c } = useTheme();
  const { ink, soft } = useCoverInk(d.group);
  return (
    <GroupCover group={d.group} style={{ flex: 1, padding: space.m, justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 22 }}>
        {d.needs ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair + 2, paddingHorizontal: space.s, height: 22, borderRadius: radius.pill, backgroundColor: c.tint }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.onTint }} />
            <Txt v="caption" tone="onTint">Your turn</Txt>
          </View>
        ) : <View />}
        {d.members.length ? <AvatarStack people={d.members as AvatarPerson[]} max={3} size={22} ringColor={soft} /> : null}
      </View>
      <View>
        <Txt v="title" numberOfLines={2} style={{ color: ink, fontSize: 22, lineHeight: 26 }}>{d.group.name}</Txt>
        <Txt v="footnote" numberOfLines={1} style={{ color: soft }}>
          {`${d.members.length} member${d.members.length === 1 ? '' : 's'}${d.active ? ' · Active' : ''}`}
        </Txt>
      </View>
    </GroupCover>
  );
}

// ─── Round actions ───────────────────────────────────────────────────────────

/** A round button with a label under it, like a contact card's Message / Call. */
export function CircleAction({ icon, label, onPress, active, a11y }: {
  icon: IconName; label: string; onPress: () => void; active?: boolean; a11y?: string;
}) {
  const { c } = useTheme();
  return (
    <Tappable
      onPress={onPress}
      feedback="opacity"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ selected: !!active }}
      style={{ alignItems: 'center', gap: space.hair + 2, minWidth: 72 }}
    >
      <View style={{
        width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? c.tint : c.fill,
      }}>
        <Icon name={icon} size={22} color={active ? c.onTint : c.tint} />
      </View>
      <Txt v="caption" tone="tint">{label}</Txt>
    </Tappable>
  );
}

/** What's waiting on you from this person or group; tapping goes to it. */
export function NeedsYouSection({ items, onOpen }: { items: NeedsYouItem[]; onOpen: (item: NeedsYouItem) => void }) {
  const { c } = useTheme();
  if (!items.length) return null;
  return (
    <ListSection header="Your turn" separatorInset={44}>
      {items.map(i => (
        <ListRow
          key={i.key}
          leading={<View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.tint, marginHorizontal: space.hair }} />}
          title={i.label}
          chevron
          onPress={() => onOpen(i)}
        />
      ))}
    </ListSection>
  );
}
