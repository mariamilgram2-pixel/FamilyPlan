import React from 'react';
import { View } from 'react-native';
import { AppNotification, Idea, TimeSlot } from '../../types';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import { Button, Icon, ListRow, ListSection, Segmented, Tag, Tappable, Txt } from '../../components/ui';
import { continuous, radius, space, tabularNums, useTheme } from '../../theme';
import { slotDay, slotLabel, slotTime } from '../../lib/planner';
import { shortDate } from '../calendar/dates';

export const STATUS_LABEL: Record<Idea['status'], string> = {
  proposed: 'Proposed',
  planned: 'Planned',
  done: 'Done',
};

export const STATUS_OPTIONS = (['proposed', 'planned', 'done'] as const).map(k => ({ key: k, label: STATUS_LABEL[k] }));

/** Upcoming date options on a proposed idea. */
export function upcomingSlots(idea: Idea): TimeSlot[] {
  return (idea.proposed_slots ?? []).filter(s => new Date(s.start).getTime() > Date.now());
}

/** "Proposed Oct 14" / "Planned Oct 15" / "Done". */
export function statusStamp(idea: Idea) {
  const at = idea.status === 'proposed' ? idea.created_at : idea.status === 'planned' ? idea.planned_at : null;
  return at ? `${STATUS_LABEL[idea.status]} ${stampDate(at)}` : STATUS_LABEL[idea.status];
}

function stampDate(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** The booked time on a planned idea. */
function scheduled(idea: Idea): TimeSlot | null {
  return idea.status !== 'proposed' && idea.event_id && idea.proposed_slots?.length ? idea.proposed_slots[0] : null;
}

// ─── Vote control ────────────────────────────────────────────────────────────

export function VoteButton({ count, voted, onPress }: { count: number; voted: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Tappable
      feedback="opacity"
      onPress={onPress}
      accessibilityLabel={voted ? `Remove your vote, ${count} votes` : `Vote, ${count} votes`}
      accessibilityState={{ selected: voted }}
      style={{
        width: 48, height: 56, borderRadius: radius.row, ...continuous,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: voted ? c.tint : c.fill,
      }}
    >
      <Icon name={voted ? 'arrow-up' : 'arrow-up-outline'} size={18} color={voted ? c.onTint : c.tint} />
      <Txt v="callout" semibold style={[tabularNums, { color: voted ? c.onTint : c.label }]}>{count}</Txt>
    </Tappable>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

interface RowProps {
  idea: Idea;
  voted: boolean;
  showStatus: boolean;
  audienceSummary: string | null;
  selected: boolean;
  onVote: () => void;
  onPress: () => void;
}

export function IdeaRow({ idea, voted, showStatus, audienceSummary, selected, onVote, onPress }: RowProps) {
  const options = idea.status === 'proposed' ? upcomingSlots(idea).length : 0;
  const booked = scheduled(idea);
  // With "Show all" the tag carries the stamp; otherwise it leads the meta line.
  const stamp = idea.status !== 'done' ? statusStamp(idea) : null;
  const meta = [
    showStatus ? null : stamp,
    booked ? `On ${slotLabel(booked)}` : null,
    options ? `${options} date option${options === 1 ? '' : 's'}` : null,
    audienceSummary ? `For ${audienceSummary}` : null,
    idea.profiles?.full_name ? `by ${idea.profiles.full_name}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: space.m }}>
      <VoteButton count={idea.votes} voted={voted} onPress={onVote} />
      <Tappable
        onPress={onPress}
        selected={selected}
        accessibilityLabel={[idea.title, showStatus ? statusStamp(idea) : null, meta || null].filter(Boolean).join(', ')}
        style={{
          flex: 1, minWidth: 0, minHeight: 72, justifyContent: 'center',
          paddingVertical: space.s, paddingHorizontal: space.s, marginRight: space.s,
          borderRadius: radius.row, ...continuous,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
          <Txt v="headline" numberOfLines={1} style={{ flexShrink: 1 }}>{idea.title}</Txt>
          {showStatus ? <Tag label={statusStamp(idea)} tone={idea.status === 'planned' ? 'tint' : 'secondary'} /> : null}
        </View>
        {idea.description ? <Txt v="callout" tone="secondary" numberOfLines={1}>{idea.description}</Txt> : null}
        {meta ? <Txt v="footnote" tone="secondary" numberOfLines={1} style={{ marginTop: 2 }}>{meta}</Txt> : null}
      </Tappable>
    </View>
  );
}

function GroupGlyph() {
  const { c } = useTheme();
  return (
    <View style={{ width: 32, height: 32, borderRadius: radius.control, ...continuous, backgroundColor: c.tintSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="people" size={16} color={c.tint} />
    </View>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────────────

interface DetailProps {
  idea: Idea;
  voted: boolean;
  voters: AvatarPerson[];
  audience: AvatarPerson[];
  audienceGroupNames: string[];
  meId: string | null;
  onVote: () => void;
  onStatusChange: (s: Idea['status']) => void;
  onPlan: () => void;
  onPickSlot: (slot: TimeSlot) => void;
}

export function IdeaDetail({ idea, voted, voters, audience, audienceGroupNames, meId, onVote, onStatusChange, onPlan, onPickSlot }: DetailProps) {
  const options = idea.status === 'proposed' ? upcomingSlots(idea) : [];
  const booked = scheduled(idea);
  const facts = [
    booked ? { icon: 'calendar' as const, text: slotLabel(booked) } : null,
    !booked && idea.target_date ? { icon: 'calendar-outline' as const, text: `Hoping for ${shortDate(idea.target_date)}` } : null,
    idea.location ? { icon: 'location-outline' as const, text: idea.location } : null,
  ].filter(Boolean) as { icon: 'calendar' | 'calendar-outline' | 'location-outline'; text: string }[];

  return (
    <View style={{ gap: space.l }}>
      <View style={{ gap: space.s }}>
        <Txt v="title" accessibilityRole="header">{idea.title}</Txt>
        <Txt v="callout" tone="secondary">
          {[
            `Proposed${idea.profiles?.full_name ? ` by ${idea.profiles.full_name}` : ''} on ${stampDate(idea.created_at)}`,
            idea.status !== 'proposed' && idea.planned_at ? `planned ${stampDate(idea.planned_at)}` : null,
          ].filter(Boolean).join(' · ')}
        </Txt>
        {facts.map(f => <FactLine key={f.text} icon={f.icon} text={f.text} />)}
        {idea.description ? <Txt v="body" style={{ marginTop: space.s }}>{idea.description}</Txt> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <Button
          label={voted ? 'You’re in' : 'I’m in'}
          icon={voted ? 'checkmark' : 'arrow-up'}
          variant={voted ? 'gray' : 'filled'}
          onPress={onVote}
        />
        <Txt v="callout" tone="secondary">
          {idea.votes === 0 ? 'No votes yet' : `${idea.votes} ${idea.votes === 1 ? 'person' : 'people'} interested`}
        </Txt>
      </View>

      {options.length > 0 && (
        <ListSection header="Proposed dates" footer="Tap a date to send the invite.">
          {options.map(s => (
            <ListRow key={s.start} icon="calendar-outline" title={shortDate(slotDay(s))} subtitle={slotTime(s)} chevron onPress={() => onPickSlot(s)} />
          ))}
        </ListSection>
      )}

      {idea.status === 'proposed' && (
        <Button label={options.length ? 'Find Other Times' : 'Find a Time'} icon="calendar-outline" variant="gray" onPress={onPlan} />
      )}

      <View style={{ gap: space.s }}>
        <Txt v="footnote" tone="secondary" semibold style={{ textTransform: 'uppercase', letterSpacing: 0.4, paddingHorizontal: space.m }}>Status</Txt>
        <Segmented options={STATUS_OPTIONS} value={idea.status} onChange={onStatusChange} />
      </View>

      {(audienceGroupNames.length > 0 || audience.length > 0) && (
        <ListSection header="For" separatorInset={64}>
          {audienceGroupNames.map(n => (
            <ListRow key={`g-${n}`} leading={<GroupGlyph />} title={n} />
          ))}
          {audience.map(p => (
            <ListRow key={p.id} leading={<Avatar person={p} size={32} />} title={p.full_name ?? p.email ?? 'Someone'} />
          ))}
        </ListSection>
      )}

      {voters.length > 0 && (
        <ListSection header={`Interested · ${voters.length}`} separatorInset={64}>
          {voters.map(v => (
            <ListRow
              key={v.id}
              leading={<Avatar person={v} size={32} highlight={v.id === meId} />}
              title={v.id === meId ? `${v.full_name ?? 'You'} (you)` : (v.full_name ?? v.email ?? 'Someone')}
            />
          ))}
        </ListSection>
      )}
    </View>
  );
}

function FactLine({ icon, text }: { icon: React.ComponentProps<typeof Icon>['name']; text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
      <Icon name={icon} size={16} color={c.secondaryLabel} />
      <Txt v="callout" tone="secondary" style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}

// ─── Notifications inbox ─────────────────────────────────────────────────────

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

export function NotificationList({ items, onOpen }: { items: AppNotification[]; onOpen: (n: AppNotification) => void }) {
  const { c } = useTheme();
  if (items.length === 0) {
    return <Txt v="callout" tone="secondary" align="center" style={{ marginTop: space.xl }}>Nothing new. Proposals and invites will show up here.</Txt>;
  }
  return (
    <ListSection separatorInset={64}>
      {items.map(n => (
        <ListRow
          key={n.id}
          leading={
            <View>
              <Avatar person={n.profiles ?? { id: n.actor_id ?? n.id }} size={32} />
              {!n.read_at ? <View style={{ position: 'absolute', top: -2, left: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: c.tint, borderWidth: 2, borderColor: c.fill }} /> : null}
            </View>
          }
          title={n.title}
          subtitle={n.body?.split('\n').join(' · ') || undefined}
          value={ago(n.created_at)}
          onPress={() => onOpen(n)}
        />
      ))}
    </ListSection>
  );
}
