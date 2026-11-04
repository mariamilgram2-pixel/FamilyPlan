// Plans' visual vocabulary, borrowed from Home: each stage is its own shape,
// so the three tabs never look like the same list with a different name.
//
//   The path      three sheep in their meadows, joined by a thread, left to
//                 right the way a plan moves: Brainstorm → Finish planning →
//                 Coming up. It's the tab switcher.
//   Brainstorm    paper notes pinned up in two columns. Shared ones are solid
//                 paper; private ones are dashed outlines, waiting to be shared.
//   Finish        what's waiting on you as bold olive cards that say what to
//   planning      do; the rest as cards with a Who / When / Where line that
//                 fills in as the plan does.
//   Coming up     calendar pages: the weekday on an olive band, the date big.
//
// Full sentences live in the accessibility labels, as on Home.

import React from 'react';
import { ScrollView, View } from 'react-native';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import AvatarStack from '../../components/AvatarStack';
import GroupAvatar from '../../components/GroupAvatar';
import { Button, Icon, IconName, Menu, MenuItem, Tappable, Txt } from '../../components/ui';
import { brand, continuous, radius, space, tabularNums, useLayout, useTheme } from '../../theme';
import { Meadow, SheepArt } from '../home/HomeViews';
import { ART } from '../home/FieldFlock';
import { InButton } from './IdeaViews';
import { timeParts } from '../calendar/dates';

// ─── The path: the tab switcher ──────────────────────────────────────────────

export interface PathStep<K extends string> {
  key: K;
  label: string;
  count: number;
  sheep: SheepArt;
  waiting?: boolean;   // something here needs you: the count turns olive from any tab
}

const STEP = 56;

export function PlanPath<K extends string>({ steps, current, onChange }: {
  steps: PathStep<K>[]; current: K; onChange: (key: K) => void;
}) {
  const { c } = useTheme();
  const inset = `${50 / steps.length}%` as const;   // from the first circle's center to the last's
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', paddingTop: space.s }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: space.s + STEP / 2 - 1, left: inset, right: inset, height: 2, borderRadius: 1, backgroundColor: c.tint, opacity: 0.25 }} />
      {steps.map(st => {
        const on = st.key === current;
        const strong = on || st.waiting;
        return (
          <Tappable
            key={st.key}
            feedback="opacity"
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${st.label}, ${st.count}${st.waiting ? ', something’s waiting on you' : ''}`}
            onPress={() => onChange(st.key)}
            style={{ flex: 1, alignItems: 'center', gap: space.hair + 2, borderRadius: radius.row, paddingBottom: space.hair }}
          >
            <View style={{
              width: STEP, height: STEP, borderRadius: STEP / 2, padding: 3,
              backgroundColor: c.background, borderWidth: 2.5, borderColor: on ? c.tint : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <View style={{ opacity: on ? 1 : 0.7 }}><Meadow sheep={st.sheep} size={STEP - 11} /></View>
              {st.count ? (
                <View style={{
                  position: 'absolute', right: -6, top: -4, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11,
                  alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.background,
                  backgroundColor: strong ? c.tint : c.card,
                }}>
                  <Txt v="caption" style={[tabularNums, { fontSize: 11, lineHeight: 14, color: strong ? c.onTint : c.secondaryLabel }]}>{st.count}</Txt>
                </View>
              ) : null}
            </View>
            <Txt v="footnote" semibold={on} align="center" style={{ color: on ? c.label : c.secondaryLabel }}>{st.label}</Txt>
          </Tappable>
        );
      })}
    </View>
  );
}

// ─── The week at a glance, and See all ───────────────────────────────────────

export interface SummaryPart { key: string; text: string; strong?: boolean; onPress: () => void }

/**
 * One quiet line under the path: "2 need you · 3 this week · 6 new ideas".
 * Only what's moving; counts that just sit there stay on the path. Each part
 * goes to its stage.
 */
export function SummaryLine({ parts }: { parts: SummaryPart[] }) {
  const { c } = useTheme();
  if (!parts.length) {
    return <Txt v="footnote" tone="secondary" align="center" style={{ paddingTop: space.s }}>All caught up</Txt>;
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', paddingTop: space.s }}>
      {parts.map((p, i) => (
        <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
          {i ? <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.hair + 2 }}>·</Txt> : null}
          <Tappable feedback="opacity" onPress={p.onPress} accessibilityLabel={p.text} hitSlop={6} style={{ borderRadius: 6 }}>
            <Txt v="footnote" semibold={p.strong} style={{ color: p.strong ? c.tint : c.secondaryLabel }}>{p.text}</Txt>
          </Tappable>
        </View>
      ))}
    </View>
  );
}

/** Under a section's short look: See all, which opens the rest underneath as a compact list. */
export function SeeAll({ open, total, more, title, onPress }: { open: boolean; total: number; more: number; title: string; onPress: () => void }) {
  const { c } = useTheme();
  const { compact } = useLayout();
  return (
    <Tappable
      feedback="opacity"
      onPress={onPress}
      accessibilityLabel={open ? `Show less of ${title}` : `See all ${total} in ${title}, ${more} more`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', marginHorizontal: compact ? space.m : space.l, marginTop: space.m, paddingVertical: space.hair, borderRadius: 6 }}
    >
      <Txt v="footnote" tone="tint" semibold>{open ? 'Show less' : `See all ${total}`}</Txt>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={13} color={c.tint} />
    </Tappable>
  );
}

// ─── Brainstorm: notes on a board ────────────────────────────────────────────

export interface NoteProps {
  key: string;
  title: string;
  notes: string | null;
  season: string | null;       // "Winter"
  by: AvatarPerson | null;     // who jotted it down
  byName: string | null;       // "Chloe" / "You"
  isPrivate: boolean;          // a draft only you see
  fresh: string | null;        // "New from Ben"
  selected?: boolean;
  votes: number;
  voted: boolean;
  a11y: string;
  onPress: () => void;
  onVote: () => void;
  onShare?: () => void;
  more: MenuItem[];            // Hide, Delete
}

/** Two columns, filled alternately, so notes of different lengths settle like a pinboard. */
export function NoteBoard({ notes }: { notes: NoteProps[] }) {
  const cols = [notes.filter((_, i) => i % 2 === 0), notes.filter((_, i) => i % 2 === 1)];
  return (
    <View style={{ flexDirection: 'row', gap: space.s + 4, alignItems: 'flex-start' }}>
      {cols.map((col, ci) => (
        <View key={ci} style={{ flex: 1, gap: space.s + 4, paddingTop: ci ? space.m : 0 }}>
          {col.map((n, i) => <Note key={n.key} n={n} tilt={(i + ci) % 2 ? 1 : -1} />)}
        </View>
      ))}
    </View>
  );
}

function Note({ n, tilt }: { n: NoteProps; tilt: 1 | -1 }) {
  const { c } = useTheme();
  return (
    <View style={{ transform: [{ rotate: `${tilt * 0.8}deg` }] }}>
      <Tappable
        feedback="opacity"
        onPress={n.onPress}
        selected={n.selected}
        accessibilityLabel={n.a11y}
        style={[
          { padding: space.s + 4, paddingTop: space.m, gap: space.s, borderRadius: radius.block, minHeight: 120 },
          n.isPrivate
            ? { borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.secondaryLabel, opacity: 0.95 }
            : {
              backgroundColor: c.card,
              shadowColor: c.shadow, shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
            },
          n.selected && { borderWidth: 2, borderStyle: 'solid', borderColor: c.tint },
        ]}
      >
        {n.season ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Icon name="leaf-outline" size={11} color={c.secondaryLabel} />
            <Txt v="caption" tone="secondary" style={{ fontSize: 11, letterSpacing: 0.6 }}>{n.season.toUpperCase()}</Txt>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.hair + 2, paddingRight: n.more.length ? space.m : 0 }}>
          {n.fresh ? <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: c.tint }} /> : null}
          <Txt v="headline" numberOfLines={4} style={{ flex: 1, fontSize: 17, lineHeight: 22 }}>{n.title}</Txt>
        </View>
        {n.notes ? <Txt v="footnote" tone="secondary" numberOfLines={3}>{n.notes}</Txt> : null}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair + 2 }}>
          {n.isPrivate && n.onShare ? (
            <Tappable feedback="opacity" onPress={n.onShare} accessibilityLabel={`Share ${n.title}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: space.s + 2, borderRadius: radius.pill, backgroundColor: c.tint, ...continuous }}>
              <Icon name="share-outline" size={13} color={c.onTint} />
              <Txt v="caption" style={{ color: c.onTint }}>Share</Txt>
            </Tappable>
          ) : (
            <>
              {n.by ? <Avatar person={n.by} size={20} /> : null}
              <Txt v="caption" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>{n.byName ?? ''}</Txt>
              <InButton count={n.votes} voted={n.voted} onPress={n.onVote} />
            </>
          )}
        </View>
      </Tappable>
      {/* The pin: a little meadow-green tab at the top, like tape. */}
      <View pointerEvents="none" style={{
        position: 'absolute', top: -5, alignSelf: 'center', width: 34, height: 11, borderRadius: 2,
        backgroundColor: brand.meadow, opacity: n.isPrivate ? 0.6 : 0.95, transform: [{ rotate: `${-tilt * 3}deg` }],
      }} />
      {n.more.length ? (
        <View style={{ position: 'absolute', top: space.s, right: space.s - 2 }}>
          <Menu title={n.title} sections={[{ items: n.more }]}>
            {(open) => (
              <Tappable feedback="opacity" onPress={open} accessibilityLabel={`More for ${n.title}`} hitSlop={8}
                style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="ellipsis-horizontal" size={15} color={c.secondaryLabel} />
              </Tappable>
            )}
          </Menu>
        </View>
      ) : null}
    </View>
  );
}

// ─── Finish planning ─────────────────────────────────────────────────────────

/** Something waiting on you, in olive: what it is, and the one thing to do. */
export function WaitingCard({ title, meta, action, icon, people, fresh, selected, a11y, onPress }: {
  title: string; meta: string | null; action: string; icon: IconName; people: AvatarPerson[];
  fresh: string | null; selected?: boolean; a11y: string; onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Tappable
      feedback="opacity"
      onPress={onPress}
      accessibilityLabel={a11y}
      style={{
        backgroundColor: c.tint, borderRadius: radius.row, padding: space.m, gap: space.s, ...continuous,
        borderWidth: selected ? 2 : 0, borderColor: c.onTint,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <Txt v="caption" style={{ color: c.onTint, opacity: 0.75, letterSpacing: 1, fontSize: 11 }}>{fresh ? fresh.toUpperCase() : 'YOUR TURN'}</Txt>
        <View style={{ flex: 1 }} />
        {people.length ? <AvatarStack people={people} max={3} size={22} ringColor={c.tint} /> : null}
      </View>
      <Txt v="title" numberOfLines={2} style={{ color: c.onTint, fontSize: 22, lineHeight: 27 }}>{title}</Txt>
      {meta ? <Txt v="footnote" numberOfLines={1} style={{ color: c.onTint, opacity: 0.8 }}>{meta}</Txt> : null}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: space.hair + 2, alignSelf: 'flex-start', marginTop: space.hair,
        height: 34, paddingHorizontal: space.m - 2, borderRadius: radius.pill, backgroundColor: c.onTint, ...continuous,
      }}>
        <Icon name={icon} size={15} color={c.tint} />
        <Txt v="footnote" semibold style={{ color: c.tint }}>{action}</Txt>
        <Icon name="arrow-forward" size={14} color={c.tint} />
      </View>
    </Tappable>
  );
}

export interface PlanPart { label: string; done: boolean; partial?: boolean; value: string | null }

/** A plan underway: Who / When / Where as a line that fills in. */
export function ProgressCard({ title, meta, parts, fresh, selected, votes, voted, onVote, a11y, onPress }: {
  title: string; meta: string | null; parts: PlanPart[]; fresh: string | null; selected?: boolean;
  votes: number; voted: boolean; onVote: () => void; a11y: string; onPress: () => void;
}) {
  const { c } = useTheme();
  const done = parts.filter(p => p.done).length;
  return (
    <Tappable
      feedback="opacity"
      onPress={onPress}
      selected={selected}
      accessibilityLabel={`${a11y}. ${done} of ${parts.length} decided: ${parts.map(p => `${p.label} ${p.value ?? 'to decide'}`).join(', ')}`}
      style={{
        backgroundColor: c.card, borderRadius: radius.row, padding: space.m, gap: space.s + 4, ...continuous,
        borderWidth: selected ? 2 : 1, borderColor: selected ? c.tint : c.separator,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair + 2 }}>
            {fresh ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.tint }} /> : null}
            <Txt v="headline" numberOfLines={2} style={{ flexShrink: 1 }}>{title}</Txt>
          </View>
          {meta ? <Txt v="footnote" tone="secondary" numberOfLines={1}>{meta}</Txt> : null}
        </View>
        <InButton count={votes} voted={voted} onPress={onVote} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.hair + 2 }}>
        {parts.map(p => (
          <View key={p.label} style={{ flex: 1, gap: space.hair + 1 }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: p.done ? c.tint : p.partial ? c.tintSoft : c.fill }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name={p.done ? 'checkmark-circle' : p.partial ? 'ellipsis-horizontal-circle' : 'ellipse-outline'} size={12} color={p.done || p.partial ? c.tint : c.secondaryLabel} />
              <Txt v="caption" numberOfLines={1} style={{ flex: 1, fontSize: 11, color: p.done ? c.label : c.secondaryLabel }}>{p.done || p.partial ? (p.value ?? p.label) : p.label}</Txt>
            </View>
          </View>
        ))}
      </View>
    </Tappable>
  );
}

// ─── Coming up: calendar pages ───────────────────────────────────────────────

/** A booked plan as a calendar page: the weekday on an olive band, the date big, then what and who. */
export function TicketCard({ start, title, place, people, today, fresh, selected, a11y, onPress }: {
  start: string; title: string; place: string | null; people: AvatarPerson[]; today: boolean;
  fresh: string | null; selected?: boolean; a11y: string; onPress: () => void;
}) {
  const { c } = useTheme();
  const d = new Date(start);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const { hm, ampm } = timeParts(start);
  return (
    <Tappable
      feedback="opacity"
      onPress={onPress}
      accessibilityLabel={a11y}
      style={{
        flexDirection: 'row', backgroundColor: c.card, borderRadius: radius.block, overflow: 'hidden',
        borderWidth: selected ? 2 : 1, borderColor: selected ? c.tint : c.separator,
        shadowColor: c.shadow, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
      }}
    >
      <View style={{ width: 72, borderRightWidth: 1, borderRightColor: c.separator }}>
        <View style={{ backgroundColor: c.tint, paddingVertical: space.hair + 1, alignItems: 'center' }}>
          <Txt v="caption" style={{ color: c.onTint, letterSpacing: 1, fontSize: 11 }}>{today ? 'TODAY' : weekday}</Txt>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space.s }}>
          <Txt v="largeTitle" style={[tabularNums, { fontSize: 32, lineHeight: 36 }]}>{d.getDate()}</Txt>
          <Txt v="caption" tone="secondary" style={{ fontSize: 10, letterSpacing: 1 }}>{month}</Txt>
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0, padding: space.s + 4, gap: 3, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair + 2 }}>
          {fresh ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.tint }} /> : null}
          <Txt v="headline" numberOfLines={2} style={{ flexShrink: 1 }}>{title}</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair }}>
          <Icon name="time-outline" size={13} color={c.secondaryLabel} />
          <Txt v="footnote" tone="secondary">{`${hm.replace(':00', '')} ${ampm}`}</Txt>
          {place ? (
            <>
              <Icon name="location-outline" size={13} color={c.secondaryLabel} style={{ marginLeft: space.s - 2 }} />
              <Txt v="footnote" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>{place}</Txt>
            </>
          ) : null}
        </View>
        {people.length ? <View style={{ marginTop: space.hair }}><AvatarStack people={people} max={4} size={22} ringColor={c.card} /></View> : null}
      </View>
    </Tappable>
  );
}

// ─── Quiet lately: "Still on?" ───────────────────────────────────────────────

/** A plan nothing's happened on for a while: keep going, or put it back on the board. */
export function QuietCard({ title, meta, quietFor, onPress, onKeep, onBack }: {
  title: string; meta: string | null; quietFor: string; onPress: () => void; onKeep: () => void; onBack?: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ borderRadius: radius.row, padding: space.m, gap: space.s + 2, borderWidth: 1, borderColor: c.separator, borderStyle: 'dashed', ...continuous }}>
      <Tappable feedback="opacity" onPress={onPress} accessibilityLabel={`${title}, ${quietFor}`} style={{ gap: 2, borderRadius: 6 }}>
        <Txt v="headline" numberOfLines={2} tone="secondary">{title}</Txt>
        <Txt v="footnote" tone="secondary" numberOfLines={1}>{[meta, quietFor].filter(Boolean).join(' · ')}</Txt>
      </Tappable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <Txt v="footnote" semibold style={{ flex: 1 }}>Still on?</Txt>
        <Button small label="Keep going" variant="gray" onPress={onKeep} />
        {onBack ? <Button small label="Back to Brainstorm" icon="bulb-outline" variant="plain" onPress={onBack} /> : null}
      </View>
    </View>
  );
}

// ─── Filters: faces, groups, seasons ─────────────────────────────────────────

export interface FilterChip { key: string; label: string; person?: AvatarPerson; group?: { id: string; name: string }; active: boolean; onPress: () => void }

/**
 * Once a stage gets long: the people and groups in it, as faces to tap.
 * "What were we going to do with Ana?" is one tap. Tap again to clear.
 */
export function FilterStrip({ chips, label }: { chips: FilterChip[]; label: string }) {
  const { c } = useTheme();
  const { compact } = useLayout();
  if (!chips.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      contentContainerStyle={{ gap: space.s, paddingHorizontal: compact ? space.m : space.l, paddingTop: space.m }}
    >
      {chips.map(ch => (
        <Tappable
          key={ch.key}
          feedback="opacity"
          onPress={ch.onPress}
          accessibilityRole="button"
          accessibilityState={{ selected: ch.active }}
          accessibilityLabel={ch.active ? `Showing ${ch.label}. Tap to show everyone` : `Show plans with ${ch.label}`}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: space.hair + 2, height: 34,
            paddingLeft: ch.person || ch.group ? 3 : space.m - 2, paddingRight: space.m - 4,
            borderRadius: radius.pill, borderWidth: 1, ...continuous,
            backgroundColor: ch.active ? c.tint : 'transparent', borderColor: ch.active ? c.tint : c.separator,
          }}
        >
          {ch.person ? <Avatar person={ch.person} size={26} /> : ch.group ? <GroupAvatar group={ch.group} size={26} style={{ borderRadius: 13 }} /> : null}
          <Txt v="footnote" semibold style={{ color: ch.active ? c.onTint : c.label }}>{ch.label}</Txt>
        </Tappable>
      ))}
    </ScrollView>
  );
}

// ─── Tidy: once a month, one idea at a time ──────────────────────────────────

/** At the top of Brainstorm, now and then: a few ideas are resting; look through them? */
export function TidyCard({ count, onLook, onLater }: { count: number; onLook: () => void; onLater: () => void }) {
  const { c } = useTheme();
  const { compact } = useLayout();
  return (
    <View style={{
      marginHorizontal: compact ? space.m : space.l, marginTop: space.m, padding: space.m, gap: space.s + 2,
      borderRadius: radius.row, backgroundColor: c.card, borderWidth: 1, borderColor: c.separator, ...continuous,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s + 2 }}>
        <Meadow sheep={ART.lying1} size={40} />
        <View style={{ flex: 1, gap: 1 }}>
          <Txt v="headline">{count === 1 ? 'An idea has been resting a while' : `${count} ideas have been resting a while`}</Txt>
          <Txt v="footnote" tone="secondary">Keep the ones you still like. It takes a minute.</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Button small label="Take a look" onPress={onLook} style={{ flex: 1 }} />
        <Button small label="Not now" variant="gray" onPress={onLater} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/** One resting idea in the tidy: what it is, how long it's been quiet, Keep or Let go. */
export function TidyStep({ index, total, title, notes, by, quietFor, onKeep, onLetGo }: {
  index: number; total: number; title: string; notes: string | null; by: string | null; quietFor: string;
  onKeep: () => void; onLetGo: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.l }}>
      <View style={{ flexDirection: 'row', gap: space.hair }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= index ? c.tint : c.fill }} />
        ))}
      </View>
      <View style={{ padding: space.m, paddingTop: space.l, gap: space.s, borderRadius: radius.block, backgroundColor: c.card,
        shadowColor: c.shadow, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}>
        <Txt v="title">{title}</Txt>
        {notes ? <Txt v="callout" tone="secondary" numberOfLines={5}>{notes}</Txt> : null}
        <Txt v="footnote" tone="secondary">{[by, quietFor].filter(Boolean).join(' · ')}</Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Button label="Keep" icon="pin-outline" onPress={onKeep} style={{ flex: 1 }} />
        <Button label="Let go" icon="eye-off-outline" variant="gray" onPress={onLetGo} style={{ flex: 1 }} />
      </View>
      <Txt v="footnote" tone="secondary" align="center">{`${index + 1} of ${total} · Let go hides it for you. It stays in Hidden.`}</Txt>
    </View>
  );
}
