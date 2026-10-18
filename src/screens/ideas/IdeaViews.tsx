import React from 'react';
import { View } from 'react-native';
import { AppNotification, Idea, TimeSlot } from '../../types';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import { Button, Icon, ListRow, ListSection, Tag, Tappable, Txt } from '../../components/ui';
import { continuous, radius, space, tabularNums, useTheme } from '../../theme';
import { slotDay, slotLabel, slotTime, slotTitle } from '../../lib/planner';
import { awaitedVoters, bestSlot, tallySlots } from '../../lib/rsvp';
import { estimateLabel, fitKnown, votesLabel } from '../../lib/availability';
import { STAGE_LABEL, awaitingYourDates, readyToSend, stageOf } from '../../lib/plans';
import AvatarStack from '../../components/AvatarStack';
import { shortDate } from '../calendar/dates';

export const STATUS_LABEL: Record<Idea['status'], string> = {
  proposed: 'Proposed',
  planned: 'Planned',
  done: 'Done',
};


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
  meId: string | null;
  audienceSummary: string | null;
  selected: boolean;
  onVote: () => void;
  onPress: () => void;
}

export function IdeaRow({ idea, voted, meId, audienceSummary, selected, onVote, onPress }: RowProps) {
  const { c } = useTheme();
  const stage = stageOf(idea);
  const booked = scheduled(idea);
  const options = stage === 'dates' ? upcomingSlots(idea).length : 0;
  const answered = Object.keys(idea.slot_votes ?? {}).length;
  const voters = awaitedVoters(idea).length;
  const needsYou = awaitingYourDates(idea, meId);
  const ready = readyToSend(idea, meId);

  // One line that says where it stands, then who it's for.
  const where =
    ready ? 'Everyone answered — send the invite'
    : needsYou ? 'Say which dates work for you'
    : stage === 'dates' ? `${options} date option${options === 1 ? '' : 's'} · ${answered} of ${voters} answered`
    : booked ? `${stage === 'happened' ? '' : 'On '}${slotLabel(booked)}`
    : stage === 'happened' ? 'Happened'
    : statusStamp(idea);
  const meta = [where, audienceSummary ? `For ${audienceSummary}` : null, idea.profiles?.full_name ? `by ${idea.profiles.full_name.split(' ')[0]}` : null]
    .filter(Boolean).join(' · ');
  const strong = needsYou || ready;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: space.m }}>
      {stage === 'idea' || stage === 'dates' ? (
        <VoteButton count={idea.votes} voted={voted} onPress={onVote} />
      ) : (
        <View style={{ width: 48, height: 56, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={stage === 'on' ? 'calendar' : 'checkmark-done'} size={22} color={stage === 'on' ? c.tint : c.secondaryLabel} />
        </View>
      )}
      <Tappable
        onPress={onPress}
        selected={selected}
        accessibilityLabel={[idea.title, meta || null].filter(Boolean).join(', ')}
        style={{
          flex: 1, minWidth: 0, minHeight: 72, justifyContent: 'center',
          paddingVertical: space.s, paddingHorizontal: space.s, marginRight: space.s,
          borderRadius: radius.row, ...continuous,
        }}
      >
        <Txt v="headline" numberOfLines={1} tone={stage === 'happened' ? 'secondary' : 'primary'}>{idea.title}</Txt>
        {idea.description ? <Txt v="callout" tone="secondary" numberOfLines={1}>{idea.description}</Txt> : null}
        {meta ? <Txt v="footnote" tone={strong ? 'tint' : 'secondary'} semibold={strong} numberOfLines={1} style={{ marginTop: 2 }}>{meta}</Txt> : null}
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
  onPlan: () => void;
  onPickSlot: (slot: TimeSlot) => void;
  onSlotVotes: (starts: string[]) => void;
  personOf: (id: string) => AvatarPerson;
  onOpenEvent?: () => void;     // "See on Calendar" once it's booked
  onDoAgain?: () => void;       // after: same plan again
  onSamePeople?: () => void;    // after: same people, new plan
  onAddMemories?: () => void;   // after: photos and notes on its event
  onDrop?: () => void;          // whoever proposed it can let it go
  conversation?: React.ReactNode;
}

export function IdeaDetail({ idea, voted, voters, audience, audienceGroupNames, meId, onVote, onPlan, onPickSlot, onSlotVotes, personOf, onOpenEvent, onDoAgain, onSamePeople, onAddMemories, onDrop, conversation }: DetailProps) {
  const stage = stageOf(idea);
  const options = stage === 'dates' ? upcomingSlots(idea) : [];
  const booked = scheduled(idea);
  const early = stage === 'idea' || stage === 'dates';
  const facts = [
    booked ? { icon: 'calendar' as const, text: slotLabel(booked) } : null,
    !booked && idea.target_date ? { icon: 'calendar-outline' as const, text: `Hoping for ${shortDate(idea.target_date)}` } : null,
    idea.location ? { icon: 'location-outline' as const, text: idea.location } : null,
  ].filter(Boolean) as { icon: 'calendar' | 'calendar-outline' | 'location-outline'; text: string }[];

  return (
    <View style={{ gap: space.l }}>
      <View style={{ gap: space.s }}>
        <View style={{ flexDirection: 'row' }}><Tag label={STAGE_LABEL[stage]} tone={stage === 'on' ? 'tint' : 'secondary'} /></View>
        <Txt v="title" accessibilityRole="header">{idea.title}</Txt>
        <Txt v="callout" tone="secondary">
          {`Proposed${idea.profiles?.full_name ? ` by ${idea.profiles.full_name}` : ''} on ${stampDate(idea.created_at)}`}
        </Txt>
        {facts.map(f => <FactLine key={f.text} icon={f.icon} text={f.text} />)}
        {idea.description ? <Txt v="body" style={{ marginTop: space.s }}>{idea.description}</Txt> : null}
      </View>

      {early ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <Button
            label={voted ? 'You’re in' : 'I’m in'}
            icon={voted ? 'checkmark' : 'arrow-up'}
            variant={voted ? 'gray' : 'filled'}
            onPress={onVote}
          />
          <Txt v="callout" tone="secondary">
            {idea.votes === 0 ? 'No one’s in yet' : `${idea.votes} ${idea.votes === 1 ? 'person' : 'people'} in`}
          </Txt>
        </View>
      ) : null}

      {options.length > 0 && (
        <DateVotes idea={idea} options={options} meId={meId} personOf={personOf} onSlotVotes={onSlotVotes} onPickSlot={onPickSlot} />
      )}

      {early && (
        <Button label={options.length ? 'Find Other Times' : 'Find a Time'} icon="search-outline" variant="gray" onPress={onPlan} />
      )}
      {stage === 'on' && onOpenEvent ? (
        <Button label="See on Calendar" icon="calendar-outline" variant="gray" onPress={onOpenEvent} />
      ) : null}
      {stage === 'happened' ? (
        <View style={{ gap: space.s }}>
          <Txt v="headline" style={{ paddingHorizontal: space.m }}>How was it?</Txt>
          {onAddMemories ? <Button label="Add Memories" icon="images-outline" onPress={onAddMemories} block /> : null}
          {onDoAgain || onSamePeople ? (
            <ListSection separatorInset={60}>
              {onDoAgain ? <ListRow icon="refresh" title="Same plan again" tintTitle chevron onPress={onDoAgain} /> : null}
              {onSamePeople ? <ListRow icon="people-outline" title="Same people, new plan" tintTitle chevron onPress={onSamePeople} /> : null}
            </ListSection>
          ) : null}
        </View>
      ) : null}

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

      {voters.length > 0 && early && (
        <ListSection header={`In · ${voters.length}`} separatorInset={64}>
          {voters.map(v => (
            <ListRow
              key={v.id}
              leading={<Avatar person={v} size={32} highlight={v.id === meId} />}
              title={v.id === meId ? `${v.full_name ?? 'You'} (you)` : (v.full_name ?? v.email ?? 'Someone')}
            />
          ))}
        </ListSection>
      )}

      {conversation}

      {onDrop && early ? (
        <ListSection>
          <ListRow icon="trash-outline" title="Drop This Idea" destructive onPress={onDrop} />
        </ListSection>
      ) : null}
    </View>
  );
}

// ─── Date votes ──────────────────────────────────────────────────────────────

/**
 * "Which of these work for you?" Everyone ticks the dates they can make; the
 * person who proposed it sees which one works for the most people and sends
 * the invite from there.
 */
function DateVotes({ idea, options, meId, personOf, onSlotVotes, onPickSlot }: {
  idea: Idea; options: TimeSlot[]; meId: string | null; personOf: (id: string) => AvatarPerson;
  onSlotVotes: (starts: string[]) => void; onPickSlot: (slot: TimeSlot) => void;
}) {
  const { c } = useTheme();
  const organizer = !!meId && idea.created_by === meId;
  const mine = meId ? idea.slot_votes?.[meId] : undefined;   // undefined = hasn't answered
  const tallies = tallySlots(idea, options);
  const best = bestSlot(tallies);
  const everyone = awaitedVoters(idea);
  const answered = everyone.filter(id => idea.slot_votes?.[id]);
  const waiting = everyone.filter(id => !idea.slot_votes?.[id]);
  const allIn = !!best && waiting.length === 0 && best.yes.length === everyone.length;
  const first = (id: string) => (id === meId ? 'you' : personOf(id).full_name?.split(' ')[0] ?? 'someone');
  const host = idea.created_by ? first(idea.created_by) : 'The organizer';

  function toggle(start: string) {
    const current = mine ?? [];
    onSlotVotes(current.includes(start) ? current.filter(s => s !== start) : [...current, start]);
  }

  const summary =
    waiting.length === 0 ? (allIn ? `${slotLabel(best!.slot)} works for everyone.` : 'Everyone has answered.')
    : `${answered.length} of ${everyone.length} answered · waiting on ${waiting.map(first).join(', ')}`;

  return (
    <View style={{ gap: space.s }}>
      <ListSection
        header={mine ? 'Dates · tap the ones that work' : 'Which dates work for you?'}
        footer={summary}
        separatorInset={60}
      >
        {tallies.map(({ slot, yes }) => {
          const checked = !!mine?.includes(slot.start);
          const top = best?.slot.start === slot.start;
          return (
            <ListRow
              key={slot.start}
              leading={<Icon name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={checked ? c.tint : c.secondaryLabel} />}
              title={slotTitle(slot)}
              subtitle={`${slotTime(slot)} · ${votesLabel(yes.length)}${top && yes.length > 1 ? ' · best so far' : ''}`}
              detail={fitKnown(slot.fit) ? `Calendar fit: ${estimateLabel(slot.fit!)}` : null}
              trailing={yes.length ? <AvatarStack people={yes.map(personOf)} max={3} size={24} ringColor={c.fill} /> : undefined}
              onPress={() => toggle(slot.start)}
            />
          );
        })}
        {mine === undefined || mine.length > 0 ? (
          <ListRow key="none" title="None of these work" tintTitle onPress={() => onSlotVotes([])} />
        ) : (
          <ListRow key="none" title="You said none of these work" subtitle="Tap a date if that changes" />
        )}
      </ListSection>

      {organizer ? (
        <View style={{ gap: space.s }}>
          <Button
            label={best ? `Send Invite for ${shortDate(slotDay(best.slot))}` : 'Choose a Date & Send Invite'}
            icon="send"
            variant={allIn || waiting.length === 0 ? 'filled' : 'gray'}
            onPress={() => onPickSlot(best?.slot ?? options[0])}
            block
          />
          {!allIn && waiting.length > 0 ? (
            <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>You can send it now, or wait until everyone answers.</Txt>
          ) : null}
        </View>
      ) : (
        <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>
          {host === 'you' ? 'You' : host.charAt(0).toUpperCase() + host.slice(1)} will send the invite once a date is picked.
        </Txt>
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
