import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppNotification, Idea, IdeaResponse, Season, TimeSlot } from '../../types';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import { Button, Field, Icon, IconName, ListRow, ListSection, Menu, Tag, Tappable, Txt } from '../../components/ui';
import { continuous, radius, space, tabularNums, useTheme } from '../../theme';
import { slotDay, slotLabel, slotTime, slotTitle } from '../../lib/planner';
import { awaitedVoters, bestSlot, tallySlots } from '../../lib/rsvp';
import { estimateLabel, fitKnown, votesLabel } from '../../lib/availability';
import { STAGE_LABEL, stageOf } from '../../lib/plans';
import { SEASONS, SEASON_LABEL } from '../../lib/whiteboard';
import { SearchHit } from '../../lib/ideaSearch';
import AvatarStack from '../../components/AvatarStack';
import { shortDate } from '../calendar/dates';

export const STATUS_LABEL: Record<Idea['status'], string> = {
  draft: 'Draft',
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

/**
 * "I'm in" as a small reaction: a raised hand and how many are in. Interest,
 * not a commitment; the idea itself is the point.
 */
export function InButton({ count, voted, onPress }: { count: number; voted: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Tappable
      feedback="opacity"
      onPress={onPress}
      accessibilityLabel={voted ? `You're in. ${count} in. Tap to leave` : `I'm in. ${count} in so far`}
      accessibilityState={{ selected: voted }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: space.hair,
        height: 28, paddingHorizontal: space.s + 2, borderRadius: radius.pill, ...continuous,
        backgroundColor: voted ? c.tintSoft : 'transparent', borderWidth: 1, borderColor: voted ? c.tintSoft : c.separator,
      }}
    >
      <Icon name={voted ? 'hand-left' : 'hand-left-outline'} size={14} color={c.tint} />
      {count ? <Txt v="footnote" semibold style={[tabularNums, { color: c.tint }]}>{count}</Txt> : null}
    </Tappable>
  );
}

/** Share a draft: a small olive pill on its row. */
export function SharePill({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Tappable
      feedback="opacity"
      onPress={onPress}
      accessibilityLabel="Share"
      style={{
        flexDirection: 'row', alignItems: 'center', gap: space.hair,
        height: 30, paddingHorizontal: space.m - 4, borderRadius: radius.pill, ...continuous, backgroundColor: c.tint,
      }}
    >
      <Icon name="share-outline" size={14} color={c.onTint} />
      <Txt v="footnote" semibold style={{ color: c.onTint }}>Share</Txt>
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
  fresh?: string | null;          // "New from Ana": something happened since you looked
  share?: React.ReactNode;        // a draft's Share control
  hit?: SearchHit | null;         // searching: the line that matched
  onVote: () => void;
  onPress: () => void;
}

/** The date it's for, if there is one: booked, the first of the dates proposed, or the day hoped for. */
function proposedDate(idea: Idea): string | null {
  const booked = scheduled(idea);
  if (booked) return slotLabel(booked);
  const options = stageOf(idea) === 'dates' ? upcomingSlots(idea) : [];
  if (options.length) return options.length > 1 ? `${options.length} dates from ${shortDate(slotDay(options[0]))}` : shortDate(slotDay(options[0]));
  return idea.target_date ? shortDate(idea.target_date) : null;
}

/** Text with the matched words picked out, like search in Messages. */
function Highlighted({ text, start, length, v, tone, numberOfLines }: {
  text: string; start: number; length: number; v: 'headline' | 'callout'; tone: 'primary' | 'secondary'; numberOfLines: number;
}) {
  const { c } = useTheme();
  return (
    <Txt v={v} tone={tone} numberOfLines={numberOfLines} style={{ flexShrink: 1 }}>
      {text.slice(0, start)}
      <Txt v={v} semibold style={{ color: c.label, backgroundColor: c.tintSoft }}>{text.slice(start, start + length)}</Txt>
      {text.slice(start + length)}
    </Txt>
  );
}

export function IdeaRow({ idea, voted, meId, audienceSummary, selected, fresh, share, hit, onVote, onPress }: RowProps) {
  const { c } = useTheme();
  const stage = stageOf(idea);
  const draft = idea.status === 'draft';

  // Under the title, just who made it, who it's for, and its date if it has one.
  const by = idea.created_by === meId ? 'you' : idea.profiles?.full_name?.split(' ')[0] ?? null;
  const meta = [
    by ? `By ${by}` : null,
    audienceSummary ? `For ${audienceSummary}` : draft ? 'Just you' : null,
    proposedDate(idea),
  ].filter(Boolean).join(' · ');

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: space.s, paddingRight: space.m }}>
      <Tappable
        onPress={onPress}
        selected={selected}
        accessibilityLabel={[idea.title, fresh, meta || null].filter(Boolean).join(', ')}
        style={{
          flex: 1, minWidth: 0, minHeight: 60, justifyContent: 'center',
          paddingVertical: space.s, paddingHorizontal: space.s,
          borderRadius: radius.row, ...continuous,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s - 2 }}>
          {fresh ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.tint }} /> : null}
          {hit && hit.field.label === null
            ? <Highlighted v="headline" tone="primary" numberOfLines={1} text={hit.text} start={hit.start} length={hit.length} />
            : <Txt v="headline" numberOfLines={1} tone={stage === 'happened' ? 'secondary' : 'primary'} style={{ flexShrink: 1 }}>{idea.title}</Txt>}
        </View>
        {/* Searching, the line that matched (when it wasn't the title). */}
        {hit && hit.field.label !== null ? (
          <Highlighted
            v="callout" tone="secondary" numberOfLines={2}
            text={`${hit.field.label}: ${hit.text}`} start={hit.field.label.length + 2 + hit.start} length={hit.length}
          />
        ) : null}
        {meta ? <Txt v="footnote" tone="secondary" numberOfLines={1} style={{ marginTop: 2 }}>{meta}</Txt> : null}
      </Tappable>
      {draft ? share : stage === 'idea' || stage === 'dates' ? <InButton count={idea.votes} voted={voted} onPress={onVote} /> : null}
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
  answers: Answers | null;      // In / Maybe / Can't, through every stage; null when there's no one to answer
  audience: AvatarPerson[];
  audienceGroupNames: string[];
  meId: string | null;
  onRespond: (choice: IdeaResponse) => void;
  onPlan: () => void;
  onStartPlanning: () => void;  // into New Plan with what's on the whiteboard (or back to it, once started)
  onSaveNotes: (text: string) => void;
  onSeason: (season: Season | null) => void;
  onShare?: () => void;         // pick people and groups; whoever made it can

  onPickSlot: (slot: TimeSlot) => void;
  onSlotVotes: (starts: string[]) => void;
  personOf: (id: string) => AvatarPerson;
  onOpenEvent?: () => void;     // "See on Calendar" once it's booked
  onDoAgain?: () => void;       // after: same plan again
  onSamePeople?: () => void;    // after: same people, new plan
  onAddMemories?: () => void;   // after: photos and notes on its event
  onDrop?: () => void;          // whoever made it can delete it
  hidden?: boolean;
  onToggleHidden?: () => void;  // hide it from your own Plans, or bring it back
  conversation?: React.ReactNode;
}

export function IdeaDetail({ idea, answers, audience, audienceGroupNames, meId, onRespond, onPlan, onStartPlanning, onSaveNotes, onSeason, onShare, onPickSlot, onSlotVotes, personOf, onOpenEvent, onDoAgain, onSamePeople, onAddMemories, onDrop, hidden, onToggleHidden, conversation }: DetailProps) {
  const stage = stageOf(idea);
  const options = stage === 'dates' ? upcomingSlots(idea) : [];
  const booked = scheduled(idea);
  const draft = idea.status === 'draft';
  const early = stage === 'idea' || stage === 'dates';
  const whiteboard = draft || stage === 'idea';
  const planLabel = idea.planning_started_at ? 'Continue Planning' : 'Start Planning';
  const facts = [
    booked ? { icon: 'calendar' as const, text: slotLabel(booked) } : null,
    !booked && idea.target_date ? { icon: 'calendar-outline' as const, text: `Hoping for ${shortDate(idea.target_date)}` } : null,
    idea.location ? { icon: 'location-outline' as const, text: idea.location } : null,
  ].filter(Boolean) as { icon: 'calendar' | 'calendar-outline' | 'location-outline'; text: string }[];

  return (
    <View style={{ gap: space.l }}>
      <View style={{ gap: space.s }}>
        <View style={{ flexDirection: 'row' }}><Tag label={draft ? 'Draft' : STAGE_LABEL[stage]} tone={stage === 'on' ? 'tint' : 'secondary'} /></View>
        <Txt v="title" accessibilityRole="header">{idea.title}</Txt>
        <Txt v="callout" tone="secondary">
          {draft ? `Jotted down ${stampDate(idea.created_at)} · only you can see it`
            : `Proposed${idea.profiles?.full_name ? ` by ${idea.profiles.full_name}` : ''} on ${stampDate(idea.created_at)}`}
        </Txt>
        {/* While it's being finished, the details checklist below says this. */}
        {stage === 'dates' && !draft ? null : facts.map(f => <FactLine key={f.text} icon={f.icon} text={f.text} />)}
        {!whiteboard && idea.description ? <Txt v="body" style={{ marginTop: space.s }}>{idea.description}</Txt> : null}
      </View>

      {/* What to do with it: share a draft, or start planning. */}
      {draft && onShare ? (
        <View style={{ gap: space.s }}>
          <Button label="Share" icon="share-outline" onPress={onShare} block />
          <Button label={planLabel} icon="calendar-outline" variant="gray" onPress={onStartPlanning} block />
        </View>
      ) : stage === 'idea' ? (
        <Button label="Start Planning" icon="calendar-outline" onPress={onStartPlanning} block />
      ) : null}

      {/* Your answer, like an RSVP: In, Maybe, Can't. */}
      {answers ? <Responses answers={answers} onRespond={onRespond} /> : null}

      {/* Finish planning: what's settled, and what's still open. Only the open parts need doing. */}
      {stage === 'dates' && !draft ? (
        <Details
          who={[...audienceGroupNames, ...audience.map(p => p.full_name?.split(' ')[0] ?? 'Someone')]}
          when={options.length ? `Voting on ${options.length} date${options.length === 1 ? '' : 's'}` : idea.target_date ? shortDate(idea.target_date) : null}
          whenVoting={options.length > 0}
          where={idea.location}
          onFinish={onStartPlanning}
        />
      ) : null}

      {whiteboard ? <Notes idea={idea} personOf={personOf} meId={meId} onSave={onSaveNotes} shared={!draft} /> : null}
      {whiteboard ? <SeasonRow season={idea.season ?? null} onChange={onSeason} /> : null}

      {options.length > 0 && (
        <DateVotes idea={idea} options={options} meId={meId} personOf={personOf} onSlotVotes={onSlotVotes} onPickSlot={onPickSlot} />
      )}

      {stage === 'dates' && options.length > 0 && (
        <Button label="Find Other Times" icon="search-outline" variant="gray" onPress={onPlan} />
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

      {!draft && (audienceGroupNames.length > 0 || audience.length > 0 || (whiteboard && onShare)) && (
        <ListSection header="For" separatorInset={64}>
          {audienceGroupNames.map(n => (
            <ListRow key={`g-${n}`} leading={<GroupGlyph />} title={n} />
          ))}
          {audience.map(p => (
            <ListRow key={p.id} leading={<Avatar person={p} size={32} />} title={p.full_name ?? p.email ?? 'Someone'} />
          ))}
          {whiteboard && onShare ? <ListRow icon="person-add-outline" title="Share with more people" tintTitle onPress={onShare} /> : null}
        </ListSection>
      )}

      {/* Who said what, like a guest list. */}
      {answers ? (
        <>
          <PeopleList title={answers.kind === 'event' ? 'Going' : 'In'} people={answers.responders.in} meId={meId} />
          <PeopleList title="Maybe" people={answers.responders.maybe} meId={meId} />
          <PeopleList title={answers.kind === 'event' ? 'Can’t go' : 'Can’t make it'} people={answers.responders.cant} meId={meId} />
        </>
      ) : null}

      {conversation}

      {(onToggleHidden && whiteboard) || (onDrop && (early || draft)) ? (
        <ListSection
          separatorInset={60}
          footer={onToggleHidden && whiteboard ? (hidden ? 'Hidden from your Plans. Everyone else still sees it.' : 'Hiding keeps it out of your list without deleting it.') : undefined}
        >
          {onToggleHidden && whiteboard ? (
            <ListRow icon={hidden ? 'eye-outline' : 'eye-off-outline'} title={hidden ? 'Unhide' : 'Hide'} tintTitle onPress={onToggleHidden} />
          ) : null}
          {onDrop && (early || draft) ? (
            <ListRow icon="trash-outline" title={draft ? 'Delete Draft' : 'Delete Idea'} destructive onPress={onDrop} />
          ) : null}
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

// ─── Answers ─────────────────────────────────────────────────────────────────

/** Everyone's answers on a plan, and yours. */
export interface Answers {
  responders: Record<IdeaResponse, AvatarPerson[]>;
  response: IdeaResponse | null;
  organizer: boolean;       // you started it: always in
  canUndo: boolean;         // ideas and planning: tap your answer again to take it back; invites: no
  kind: 'idea' | 'planning' | 'event';
}

const RESPONSES: { key: IdeaResponse; label: string; icon: IconName; iconOn: IconName }[] = [
  { key: 'in', label: 'In', icon: 'hand-left-outline', iconOn: 'hand-left' },
  { key: 'maybe', label: 'Maybe', icon: 'help-circle-outline', iconOn: 'help-circle' },
  { key: 'cant', label: 'Can’t', icon: 'close-circle-outline', iconOn: 'close-circle' },
];

const STATUS: Record<'idea' | 'planning' | 'event', Record<IdeaResponse, string>> = {
  idea: { in: 'You’re in', maybe: 'You’re a maybe', cant: 'You can’t make it' },
  planning: { in: 'You’re in', maybe: 'You’re a maybe', cant: 'You can’t make it' },
  event: { in: 'You’re going', maybe: 'You’re a maybe', cant: 'You can’t go' },
};

/**
 * Your answer, like Partiful: before you answer, In, Maybe, and Can't side by
 * side; once you have, just yours ("You're in"), with a small Change to pick
 * again. Whoever started it is always in.
 */
function Responses({ answers, onRespond }: { answers: Answers; onRespond: (choice: IdeaResponse) => void }) {
  const { c } = useTheme();
  const { responders, organizer, kind } = answers;
  const response = organizer ? 'in' : answers.response;
  const [changing, setChanging] = useState(false);
  useEffect(() => { setChanging(false); }, [answers.response]);

  const counts = [
    `${responders.in.length} ${kind === 'event' ? 'going' : 'in'}`,
    responders.maybe.length ? `${responders.maybe.length} maybe` : null,
    responders.cant.length ? `${responders.cant.length} can’t` : null,
  ].filter(Boolean).join(' · ');
  const note = organizer ? `You started this · ${counts}`
    : response === 'maybe' ? (kind === 'idea' ? 'Nobody will wait on you once it’s being planned.'
      : kind === 'planning' ? 'They’re planning without waiting on you, and you’ll still get the invite.' : counts)
    : response === 'cant' && kind !== 'event' ? 'You’re out of the planning. Change your answer anytime.'
    : counts;

  if (response && !changing) {
    const r = RESPONSES.find(x => x.key === response)!;
    return (
      <View style={{ gap: space.s }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: space.hair + 2,
            height: 40, paddingHorizontal: space.m, borderRadius: radius.pill, ...continuous, backgroundColor: c.tint,
          }}>
            <Icon name={r.iconOn} size={16} color={c.onTint} />
            <Txt v="callout" semibold style={{ color: c.onTint }}>{STATUS[kind][response]}</Txt>
          </View>
          {!organizer ? (
            <Tappable feedback="opacity" onPress={() => setChanging(true)} accessibilityLabel="Change your answer" style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: space.s, paddingHorizontal: space.s }}>
              <Txt v="footnote" semibold tone="tint">Change</Txt>
              <Icon name="chevron-down" size={14} color={c.tint} />
            </Tappable>
          ) : null}
        </View>
        <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>{note}</Txt>
      </View>
    );
  }

  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', gap: space.s }}>
        {RESPONSES.map(r => {
          const on = response === r.key;
          const n = responders[r.key].length;
          return (
            <Tappable
              key={r.key}
              feedback="opacity"
              onPress={() => { if (on && !answers.canUndo) { setChanging(false); return; } onRespond(r.key); }}
              accessibilityLabel={`${r.label}, ${n}${on ? ', your answer' : ''}`}
              accessibilityState={{ selected: on }}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.hair + 2,
                height: 40, borderRadius: radius.pill, ...continuous,
                backgroundColor: on ? c.tint : c.fill,
              }}
            >
              <Icon name={on ? r.iconOn : r.icon} size={16} color={on ? c.onTint : c.tint} />
              <Txt v="footnote" semibold style={{ color: on ? c.onTint : c.tint }}>{kind === 'event' && r.key === 'in' ? 'Going' : r.label}</Txt>
              {n ? <Txt v="footnote" style={[tabularNums, { color: on ? c.onTint : c.secondaryLabel }]}>{n}</Txt> : null}
            </Tappable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.m }}>
        <Txt v="footnote" tone="secondary" style={{ flex: 1 }}>{counts}</Txt>
        {changing ? (
          <Tappable feedback="opacity" onPress={() => setChanging(false)} accessibilityLabel="Keep your answer" style={{ paddingVertical: space.hair }}>
            <Txt v="footnote" semibold tone="tint">Done</Txt>
          </Tappable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Finish planning's checklist: who, when, where. What was settled as an idea
 * shows as done, so nobody adds it again; tap anything still open to finish it.
 */
function Details({ who, when, whenVoting, where, onFinish }: {
  who: string[]; when: string | null; whenVoting: boolean; where: string | null; onFinish: () => void;
}) {
  const { c } = useTheme();
  const row = (key: string, title: string, value: string | null, onPress?: () => void) => (
    <ListRow
      key={key}
      leading={<Icon name={value ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={value ? c.tint : c.secondaryLabel} />}
      title={title}
      value={value ?? 'To decide'}
      chevron={!!onPress}
      onPress={onPress}
    />
  );
  const open = !who.length || !when || !where;
  return (
    <ListSection header="Details" footer={open ? 'Tap anything still open to finish it.' : 'All set. Send the invite once a date is picked.'} separatorInset={60}>
      {row('who', 'Who', who.length ? who.join(', ') : null, onFinish)}
      {row('when', 'When', when, whenVoting ? undefined : onFinish)}
      {row('where', 'Where', where, onFinish)}
    </ListSection>
  );
}

function PeopleList({ title, people, meId }: { title: string; people: AvatarPerson[]; meId: string | null }) {
  if (!people.length) return null;
  return (
    <ListSection header={`${title} · ${people.length}`} separatorInset={64}>
      {people.map(p => (
        <ListRow
          key={p.id}
          leading={<Avatar person={p} size={32} highlight={p.id === meId} />}
          title={p.id === meId ? `${p.full_name ?? 'You'} (you)` : (p.full_name ?? p.email ?? 'Someone')}
        />
      ))}
    </ListSection>
  );
}

// ─── Whiteboard ──────────────────────────────────────────────────────────────

function agoText(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (min < 1440) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
}

/**
 * Notes anyone on the idea can edit, like a shared doc: where to stay, what
 * it might cost, who's thinking what. Says who touched it last.
 */
function Notes({ idea, personOf, meId, onSave, shared }: {
  idea: Idea; personOf: (id: string) => AvatarPerson; meId: string | null; onSave: (text: string) => void; shared: boolean;
}) {
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(idea.description ?? '');
  useEffect(() => { setEditing(false); setText(idea.description ?? ''); }, [idea.id, idea.description]);

  const by = idea.notes_edited_by;
  const who = by === meId ? 'you' : by ? (personOf(by).full_name ?? 'Someone').split(' ')[0] : null;
  const footer = editing ? (shared ? 'Everyone on this idea can see and edit the notes.' : undefined)
    : who && idea.notes_edited_at ? `Edited by ${who} · ${agoText(idea.notes_edited_at)}`
    : shared ? 'Anyone on this idea can add to these.' : undefined;

  function save() {
    const next = text.trim();
    setEditing(false);
    if (next !== (idea.description ?? '').trim()) onSave(next);
  }

  return (
    <View style={{ gap: space.s }}>
      <ListSection header="Notes" footer={footer}>
        {editing ? (
          <View style={{ padding: space.s }}>
            <Field
              value={text}
              onChangeText={setText}
              placeholder="Where to stay, what it costs, who’s thinking what…"
              accessibilityLabel="Notes"
              maxLength={4000}
              multiline
              autoFocus
              style={{ minHeight: 140, backgroundColor: c.background }}
            />
          </View>
        ) : (
          <Tappable onPress={() => setEditing(true)} accessibilityLabel={idea.description ? 'Edit notes' : 'Add notes'} style={{ padding: space.m }}>
            {idea.description
              ? <Txt v="body">{idea.description}</Txt>
              : <Txt v="body" tone="secondary">Add notes, links, places…</Txt>}
          </Tappable>
        )}
      </ListSection>
      {editing ? (
        <View style={{ flexDirection: 'row', gap: space.s, justifyContent: 'flex-end' }}>
          <Button label="Cancel" variant="gray" onPress={() => { setText(idea.description ?? ''); setEditing(false); }} />
          <Button label="Save Notes" onPress={save} />
        </View>
      ) : null}
    </View>
  );
}

/** The time of year it's best in. It comes back to the top when that season arrives. */
function SeasonRow({ season, onChange }: { season: Season | null; onChange: (s: Season | null) => void }) {
  return (
    <Menu
      title="Best time of year"
      sections={[{ items: [
        { key: 'any', label: 'Any time', checked: !season, onSelect: () => onChange(null) },
        ...SEASONS.map(s => ({ key: s, label: SEASON_LABEL[s], checked: season === s, onSelect: () => onChange(s) })),
      ] }]}
    >
      {(open) => (
        <ListSection footer={season ? `It moves to the top of Ideas when ${season} comes around.` : undefined}>
          <ListRow icon="leaf-outline" title="Best time of year" value={season ? SEASON_LABEL[season] : 'Any time'} chevron onPress={open} />
        </ListSection>
      )}
    </Menu>
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
