// New Plan sheet, and the flow that turns an idea into a time.
//
// Three steps in one sheet:
//   compose  — describe it in a sentence (pre-fills the form) or fill it in:
//              what, who, where, when, other details. Then ask the group,
//              find a time, or — already know when — hand off to the
//              calendar's event sheet.
//   prefs    — Plan asks about scheduling preferences first (time of day,
//              how soon, which days, how long).
//   options  — a few times that work for everyone; create & share an invite,
//              or keep the idea in Proposed with those dates attached.
// Existing ideas enter at `prefs` ("Find a time") or `options` (a date that
// was proposed earlier).
//
// The audience picker is chunked into Groups / People / Your people, and long
// lists show five at a time with an explicit "Show all" to keep each chunk
// scannable.

import React, { useEffect, useMemo, useState } from 'react';
import { notify } from '../../lib/alert';
import { ActivityIndicator, Platform, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { addDemoEvent, DEMO_CONTACTS, DEMO_EVENTS, DEMO_MEMBERS, DEMO_ME, isDemoGroup } from '../../lib/demo';
import { parseIdeaText, ParsedIdea } from '../../lib/nlIdea';
import {
  Busy, DURATION_LABEL, DayKind, Horizon, PartOfDay, PlanPrefs,
  defaultPrefs, findSlots, searchRange, slotDay, slotLabel, slotTime,
} from '../../lib/planner';
import { sendNotifications } from '../../lib/notifications';
import { useWorkSchedules } from '../../lib/workSchedule';
import { expandEvents } from '../../lib/recurrence';
import { blocksTime } from '../../lib/rsvp';
import { AppNotificationInsert, Contact, Event, Idea, Profile, TimeSlot } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../../components/Avatar';
import {
  Button, Field, Icon, ListRow, ListSection, SectionHeader, Segmented, Sheet, Toggle, Txt,
} from '../../components/ui';
import { space, useTheme } from '../../theme';
import CalendarGrid from '../calendar/CalendarGrid';
import { DescribeField } from '../calendar/EventViews';
import { longDate, relativeDay, shortDate, todayKey } from '../calendar/dates';
import type { PlanPrefill } from '../../components/PlanComposer';

interface PersonInGroup {
  profile: Profile;
  groupIds: string[];
  groupNames: string[];
}

type Step = 'compose' | 'prefs' | 'options';

export interface PlanEntry {
  idea: Idea;
  step: 'prefs' | 'options';
  slot?: TimeSlot;            // pre-select this proposed date
}

const CHUNK = 5;

const PART_OPTIONS: { key: PartOfDay; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'daytime', label: 'Daytime' },
  { key: 'evening', label: 'Evening' },
  { key: 'any', label: 'Any time' },
];
const HORIZON_OPTIONS: { key: Horizon; label: string }[] = [
  { key: 'soon', label: 'This week' },
  { key: 'twoWeeks', label: 'Next 2 weeks' },
  { key: 'later', label: 'Later' },
];
const DAY_OPTIONS: { key: DayKind; label: string }[] = [
  { key: 'any', label: 'Any day' },
  { key: 'weekdays', label: 'Weekdays' },
  { key: 'weekends', label: 'Weekends' },
];
const DURATION_OPTIONS = (['60', '120', '180', '240'] as const).map(k => ({ key: k, label: DURATION_LABEL(Number(k)) }));

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Demo mode has no database; the saved idea comes back so the list can show it. */
  onSaved: (idea?: Idea) => void;
  entry?: PlanEntry | null;
  prefill?: PlanPrefill;
  /** "I know when": continue as a calendar event with what's filled in. */
  onKnowWhen?: (prefill: PlanPrefill) => void;
}

export default function CreateIdeaSheet({ visible, onClose, onSaved, entry, prefill, onKnowWhen }: Props) {
  const { activeGroup, groups, fetchGroups } = useGroup();
  const { user, profile } = useAuth();
  const { c } = useTheme();
  const work = useWorkSchedules();
  const isDemo = isDemoGroup(activeGroup);
  const meId = user?.id ?? (isDemo ? DEMO_ME : null);
  const myName = (profile?.full_name ?? (isDemo ? DEMO_MEMBERS[0].full_name : null) ?? 'Someone').split(' ')[0];
  const existing = entry?.idea ?? null;

  // Fall back to activeGroup if the groups list came back empty (stale fetch).
  const effectiveGroups = useMemo(() => {
    if (groups.length > 0) return groups;
    if (activeGroup) return [activeGroup];
    return [];
  }, [groups, activeGroup]);

  const [step, setStep] = useState<Step>('compose');
  const [describe, setDescribe] = useState('');
  const [parsed, setParsed] = useState<ParsedIdea | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [pickingDate, setPickingDate] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);

  const [prefs, setPrefs] = useState<PlanPrefs>(defaultPrefs({}));
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);

  const [people, setPeople] = useState<PersonInGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saving, setSaving] = useState<'propose' | 'invite' | 'keep' | null>(null);
  const [loadingPeople, setLoadingPeople] = useState(false);

  // Reset + refetch groups each time the sheet opens so we never render
  // against a stale/empty list from an earlier failed fetch.
  useEffect(() => {
    if (!visible) return;
    setDescribe(''); setParsed(null); setPickingDate(false);
    setShowAllPeople(false); setShowAllContacts(false);
    setSlots([]); setChosen(null); setSaving(null);
    if (existing) {
      setTitle(existing.title); setDescription(existing.description ?? '');
      setLocation(existing.location ?? ''); setDate(existing.target_date);
      setSelectedGroupIds(new Set(existing.audience_group_ids ?? []));
      setSelectedUserIds(new Set(existing.audience_user_ids ?? []));
      setSelectedContactIds(new Set(existing.audience_contact_ids ?? []));
      const hint = parseIdeaText(existing.title, { today: todayKey(), people: [] });
      setPrefs(defaultPrefs({ start: hint.start, end: hint.end, date: existing.target_date }));
      setStep(entry!.step);
      if (entry!.step === 'options') {
        const proposed = (existing.proposed_slots ?? []).filter(s => new Date(s.start).getTime() > Date.now());
        setSlots(proposed);
        const i = entry!.slot ? proposed.findIndex(s => s.start === entry!.slot!.start) : -1;
        setChosen(i >= 0 ? i : proposed.length ? 0 : null);
      }
    } else {
      setTitle(prefill?.title ?? ''); setDescription(prefill?.notes ?? ''); setLocation(prefill?.location ?? ''); setDate(prefill?.date ?? null);
      setSelectedGroupIds(new Set()); setSelectedUserIds(new Set(prefill?.people ?? [])); setSelectedContactIds(new Set());
      setPrefs(defaultPrefs({ start: prefill?.start, end: prefill?.end, date: prefill?.date ?? null }));
      setStep('compose');
    }
    if (!isDemo) fetchGroups();
  }, [visible]);

  // Load members across ALL your groups + contacts.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    async function load() {
      if (isDemo) {
        setPeople(DEMO_MEMBERS.filter(m => m.id !== DEMO_ME).map(p => ({ profile: p, groupIds: ['demo'], groupNames: [activeGroup?.name ?? ''] })));
        setContacts(DEMO_CONTACTS);
        return;
      }
      if (!user) return;
      setLoadingPeople(true);
      const [memberResults, contactsRes] = await Promise.all([
        effectiveGroups.length === 0
          ? Promise.resolve([] as { group: { id: string; name: string }; members: Profile[] }[])
          : Promise.all(
              effectiveGroups.map(g =>
                supabase.from('group_members')
                  .select('profiles(id, full_name, email, avatar_url)')
                  .eq('group_id', g.id)
                  .then(({ data }) => ({
                    group: g,
                    members: ((data ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[],
                  }))
              )
            ),
        supabase.from('contacts').select('*').eq('owner_id', user.id).order('name'),
      ]);
      if (cancelled) return;

      const map = new Map<string, PersonInGroup>();
      memberResults.forEach(({ group, members }) => {
        members.forEach(p => {
          if (p.id === user.id) return;
          const existingPerson = map.get(p.id);
          if (existingPerson) {
            if (!existingPerson.groupIds.includes(group.id)) {
              existingPerson.groupIds.push(group.id);
              existingPerson.groupNames.push(group.name);
            }
          } else {
            map.set(p.id, { profile: p, groupIds: [group.id], groupNames: [group.name] });
          }
        });
      });

      setPeople(Array.from(map.values()).sort((a, b) => {
        const an = a.profile.full_name ?? a.profile.email ?? '';
        const bn = b.profile.full_name ?? b.profile.email ?? '';
        return an.localeCompare(bn);
      }));
      setContacts((contactsRes?.data ?? []) as Contact[]);
      setLoadingPeople(false);
    }
    load();
    return () => { cancelled = true; };
  }, [visible, effectiveGroups, user, isDemo]);

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  }

  // ─── Natural language ──────────────────────────────────────────────────────
  // Contacts are matched too, under a prefixed id so they land in the right list.
  const nlPeople = useMemo(() => [
    ...people.map(p => p.profile),
    ...contacts.map(ct => ({ id: `contact:${ct.id}`, full_name: ct.name, email: ct.email })),
  ], [people, contacts]);

  function onDescribe(text: string) {
    setDescribe(text);
    if (!text.trim()) { setParsed(null); return; }
    const p = parseIdeaText(text, { today: todayKey(), people: nlPeople, meId });
    setParsed(p);
    setTitle(p.title);
    setLocation(p.location ?? '');
    setDate(p.date ?? null);
    setSelectedUserIds(new Set(p.personIds.filter(id => !id.startsWith('contact:'))));
    setSelectedContactIds(new Set(p.personIds.filter(id => id.startsWith('contact:')).map(id => id.slice(8))));
    setPrefs(defaultPrefs({ start: p.start, end: p.end, date: p.date }));
  }

  // ─── Who's involved ────────────────────────────────────────────────────────
  // App users we can notify and whose calendars we can check: picked people,
  // members of picked groups, and (for an existing idea) anyone who said "I'm in"
  // or said some of its dates work.
  const participantIds = useMemo(() => {
    const ids = new Set(selectedUserIds);
    people.forEach(p => { if (p.groupIds.some(g => selectedGroupIds.has(g))) ids.add(p.profile.id); });
    existing?.idea_votes?.forEach(v => ids.add(v.user_id));
    Object.entries(existing?.slot_votes ?? {}).forEach(([id, starts]) => { if (starts.length) ids.add(id); });
    if (meId) ids.delete(meId);
    return Array.from(ids);
  }, [selectedUserIds, selectedGroupIds, people, existing, meId]);

  const nameOf = (id: string) => {
    const p = people.find(x => x.profile.id === id)?.profile;
    return (p?.full_name ?? p?.email ?? 'Someone').split(' ')[0];
  };
  const participantNames = participantIds.map(nameOf);
  const offAppNames = contacts.filter(ct => selectedContactIds.has(ct.id)).map(ct => ct.name);

  // Storage group: pick a home for the idea (needed for RLS).
  // Prefer the first selected group; else the active group.
  const storageGroupId = useMemo(() => {
    if (existing) return existing.group_id;
    if (selectedGroupIds.size > 0) {
      for (const g of effectiveGroups) if (selectedGroupIds.has(g.id)) return g.id;
    }
    return activeGroup?.id ?? effectiveGroups[0]?.id ?? null;
  }, [existing, selectedGroupIds, activeGroup, effectiveGroups]);

  // ─── Saving ────────────────────────────────────────────────────────────────

  function ready() {
    if (!title.trim()) { notify('What’s the idea?', 'Give it a short description first.'); return false; }
    if (!storageGroupId || !meId) {
      notify('Pick a group', 'Ideas need to belong to at least one group. Create or join one first.');
      return false;
    }
    return true;
  }

  /** Insert the new idea, or update the existing one. */
  async function persist(fields: Pick<Idea, 'status' | 'proposed_slots' | 'event_id'> & Pick<Partial<Idea>, 'slot_votes'>): Promise<Idea | null> {
    const planned_at = fields.status === 'planned' ? new Date().toISOString() : null;
    const extraGroupIds = Array.from(selectedGroupIds).filter(id => id !== storageGroupId);
    const row = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      target_date: date,
      audience_group_ids: extraGroupIds,
      audience_user_ids: Array.from(selectedUserIds),
      audience_contact_ids: Array.from(selectedContactIds),
      ...fields,
      planned_at,
    };
    if (isDemo) {
      const me = DEMO_MEMBERS[0];
      return {
        id: existing?.id ?? `i-${Date.now()}`,
        group_id: storageGroupId!,
        votes: existing?.votes ?? 0,
        idea_votes: existing?.idea_votes ?? [],
        created_by: existing?.created_by ?? meId,
        created_at: existing?.created_at ?? new Date().toISOString(),
        profiles: existing?.profiles ?? { id: me.id, full_name: me.full_name, email: me.email },
        ...row,
      };
    }
    const q = existing
      ? supabase.from('ideas').update(row as any).eq('id', existing.id)
      : supabase.from('ideas').insert({ ...row, group_id: storageGroupId, created_by: meId } as any);
    const { data, error } = await q.select().single();
    if (error) { notify('Couldn’t save', error.message); return null; }
    return data as Idea;
  }

  function notifyAll(idea: Idea, kind: AppNotificationInsert['kind'], titleText: string, body: string | null, eventId: string | null = null) {
    return sendNotifications(participantIds.map(uid => ({
      user_id: uid, actor_id: meId, kind, idea_id: idea.id, event_id: eventId, title: titleText, body,
    })), isDemo);
  }

  function finish(idea: Idea) {
    onSaved(idea);
    onClose();
  }

  const who = (names: string[]) =>
    names.length === 0 ? 'no one yet' :
    names.length === 1 ? names[0] :
    `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  async function handlePropose() {
    if (!ready()) return;
    setSaving('propose');
    const idea = await persist({ status: 'proposed', proposed_slots: [], event_id: null });
    if (!idea) return setSaving(null);
    const bits = [idea.location, idea.target_date ? shortDate(idea.target_date) : null].filter(Boolean).join(' · ');
    await notifyAll(idea, 'idea_proposed', `${myName} proposed ${idea.title}`, bits || idea.description);
    setSaving(null);
    finish(idea);
    notify('Shared', participantIds.length
      ? `${who(participantNames)} ${participantIds.length === 1 ? 'has' : 'have'} been asked. It’s in Plans so people can say they’re in.`
      : 'It’s in Plans so your group can say they’re in.');
  }

  // ─── Planning ──────────────────────────────────────────────────────────────

  function startPlan() {
    if (!ready()) return;
    setStep('prefs');
  }

  async function loadBusy(): Promise<Busy[]> {
    const everyone = [meId!, ...participantIds];
    const [from, to] = searchRange(prefs);
    let rows: Event[];
    if (isDemo) {
      rows = DEMO_EVENTS;
    } else {
      // One-off events in range, plus every repeating series (expanded below).
      const cols = 'id, title, start_time, end_time, attendees, recurrence, rsvps, cancelled_at';
      const [oneOff, repeating] = await Promise.all([
        supabase.from('events').select(cols).overlaps('attendees', everyone).is('recurrence', null).lt('start_time', to).gt('end_time', from),
        supabase.from('events').select(cols).overlaps('attendees', everyone).not('recurrence', 'is', null).lt('start_time', to),
      ]);
      const error = oneOff.error ?? repeating.error;
      if (error) { notify('Couldn’t check calendars', error.message); return []; }
      rows = [...(oneOff.data ?? []), ...(repeating.data ?? [])] as Event[];
    }
    // Busy = invited and not declined, on an event that's still on.
    return expandEvents(rows, new Date(from), new Date(to)).flatMap(e =>
      everyone.filter(id => blocksTime(e, id))
        .map(id => ({ start: new Date(e.start_time).getTime(), end: new Date(e.end_time).getTime(), who: id })));
  }

  async function handleFindTimes() {
    setSearching(true);
    const busy = await loadBusy();
    const hint = parsed ?? parseIdeaText(title, { today: todayKey(), people: [] });
    const found = findSlots({ busy, prefs, work, preferredStart: hint.start });
    setSlots(found);
    setChosen(found.length ? 0 : null);
    setSearching(false);
    setStep('options');
  }

  async function handleKeepProposed() {
    setSaving('keep');
    // New options start a fresh vote; these all fit your calendar, so you're in on each.
    const idea = await persist({ status: 'proposed', proposed_slots: slots, event_id: null, slot_votes: { [meId!]: slots.map(s => s.start) } });
    if (!idea) return setSaving(null);
    await notifyAll(idea, 'dates_proposed', `${myName} suggested times for ${idea.title}`, slots.map(slotLabel).join('\n'));
    setSaving(null);
    finish(idea);
    notify('Dates shared', `${slots.length} date option${slots.length === 1 ? '' : 's'} saved${participantIds.length ? ` and shared with ${who(participantNames)}` : ''}.`);
  }

  async function handleInvite() {
    if (chosen === null || !slots[chosen]) return;
    const slot = slots[chosen];
    setSaving('invite');
    const attendees = [meId!, ...participantIds];
    // Anyone who already said this date works is going.
    const rsvps = Object.fromEntries(participantIds
      .filter(id => existing?.slot_votes?.[id]?.includes(slot.start))
      .map(id => [id, 'going' as const]));
    let eventId: string | null = null;
    const eventRow = {
      rsvps,
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      start_time: slot.start,
      end_time: slot.end,
      created_by: meId,
      attendees,
    };
    if (isDemo) {
      eventId = addDemoEvent(eventRow).id;
    } else {
      const { data, error } = await supabase.from('events').insert({ ...eventRow, group_id: storageGroupId } as any).select('id').single();
      if (error) { setSaving(null); return notify('Couldn’t create the invite', error.message); }
      eventId = (data as { id: string }).id;
    }
    const idea = await persist({ status: 'planned', proposed_slots: [slot], event_id: eventId });
    if (!idea) return setSaving(null);
    await notifyAll(idea, 'invite', `${myName} invited you to ${idea.title}`, `${slotLabel(slot)}${idea.location ? ` · ${idea.location}` : ''}`, eventId);
    setSaving(null);
    finish(idea);
    await shareInvite(idea, slot);
  }

  /** System share sheet, so people who aren't on sheep get it too. */
  async function shareInvite(idea: Idea, slot: TimeSlot) {
    const message = [
      `You’re invited: ${idea.title}`,
      slotLabel(slot),
      idea.location,
      idea.description,
    ].filter(Boolean).join('\n');
    try {
      if (Platform.OS === 'web' && !(navigator as any).share) {
        await Clipboard.setStringAsync(message);
        notify('Invite created', `It’s on the calendar${participantIds.length ? ` and ${who(participantNames)} got an invite` : ''}. Details are copied — paste them anywhere to share.`);
        return;
      }
      await Share.share({ title: idea.title, message });
    } catch {
      // User dismissed the share sheet.
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const audienceCount = selectedGroupIds.size + selectedUserIds.size + selectedContactIds.size;
  // Whoever's already picked comes first, so a pre-filled plan shows who it's with.
  const orderedPeople = [...people].sort((a, b) => Number(selectedUserIds.has(b.profile.id)) - Number(selectedUserIds.has(a.profile.id)));
  const shownPeople = showAllPeople ? orderedPeople : orderedPeople.slice(0, CHUNK);
  const shownContacts = showAllContacts ? contacts : contacts.slice(0, CHUNK);

  const sheetTitle = step === 'compose' ? 'New Plan' : step === 'prefs' ? 'Find a Time' : 'Pick a Time';

  function knowWhen() {
    if (!title.trim()) return notify('What’s the plan?', 'Give it a short description first.');
    onKnowWhen?.({
      title: title.trim(), location: location.trim() || undefined, notes: description.trim() || undefined,
      people: participantIds, date, start: parsed?.start, end: parsed?.end,
    });
  }
  // A sentence with a day and a time ("dinner Friday at 7") already knows when.
  const timeKnown = !!(date && parsed?.start);

  return (
    <Sheet visible={visible} onClose={onClose} title={sheetTitle} cancelLabel="Cancel">
      {step === 'compose' && (
        <>
          <DescribeField
            value={describe}
            onChange={onDescribe}
            parsed={parsed}
            placeholder="Natasha and I want to try Lilia for dinner"
            filledHint="Filled in below — adjust anything, then choose how to plan it."
            emptyHint="Filled in below. A day, place, or who’s in helps, but it’s all optional."
            accessibilityLabel="Describe the plan in your own words"
          />

          <Field label="What’s the plan?" value={title} onChangeText={setTitle} placeholder="Weekend camping trip, theme dinner…" accessibilityLabel="What’s the plan?" />

          <Txt v="headline" style={{ paddingHorizontal: space.m, marginBottom: -space.s }}>
            Who’s in?{audienceCount > 0 ? <Txt v="callout" tone="secondary">{`  ${audienceCount} selected`}</Txt> : null}
          </Txt>

          {effectiveGroups.length > 0 && (
            <ListSection
              header="Groups"
              footer={selectedGroupIds.size === 0 ? `Nothing picked — it’ll go to ${activeGroup?.name ?? 'your active group'}.` : undefined}
            >
              {effectiveGroups.map(g => (
                <ListRow
                  key={g.id}
                  title={g.name}
                  checked={selectedGroupIds.has(g.id)}
                  onPress={() => toggle(selectedGroupIds, g.id, setSelectedGroupIds)}
                />
              ))}
            </ListSection>
          )}

          {loadingPeople ? (
            <ActivityIndicator color={c.secondaryLabel} />
          ) : (
            <>
              {people.length > 0 && (
                <ListSection header="People from your groups" separatorInset={64}>
                  {shownPeople.map(p => (
                    <ListRow
                      key={`u-${p.profile.id}`}
                      leading={<Avatar person={p.profile} size={32} />}
                      title={p.profile.full_name ?? p.profile.email}
                      subtitle={p.groupNames.join(', ')}
                      checked={selectedUserIds.has(p.profile.id)}
                      onPress={() => toggle(selectedUserIds, p.profile.id, setSelectedUserIds)}
                    />
                  ))}
                  {people.length > CHUNK && (
                    <ListRow
                      key="more-people"
                      title={showAllPeople ? 'Show fewer' : `Show all ${people.length}`}
                      tintTitle
                      onPress={() => setShowAllPeople(x => !x)}
                    />
                  )}
                </ListSection>
              )}

              {contacts.length > 0 && (
                <ListSection header="Your people" separatorInset={64}>
                  {shownContacts.map(ct => (
                    <ListRow
                      key={`c-${ct.id}`}
                      leading={<Avatar person={{ id: ct.id, full_name: ct.name }} size={32} />}
                      title={ct.name}
                      checked={selectedContactIds.has(ct.id)}
                      onPress={() => toggle(selectedContactIds, ct.id, setSelectedContactIds)}
                    />
                  ))}
                  {contacts.length > CHUNK && (
                    <ListRow
                      key="more-contacts"
                      title={showAllContacts ? 'Show fewer' : `Show all ${contacts.length}`}
                      tintTitle
                      onPress={() => setShowAllContacts(x => !x)}
                    />
                  )}
                </ListSection>
              )}

              {effectiveGroups.length === 0 && people.length === 0 && contacts.length === 0 && (
                <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>
                  You’re not in any groups and haven’t added anyone yet. Head to People first.
                </Txt>
              )}
            </>
          )}

          <Field label="Where" value={location} onChangeText={setLocation} placeholder="Optional" accessibilityLabel="Location" />

          <ListSection header="When">
            <ListRow
              icon="calendar-outline"
              title={date ? longDate(date) : 'Any day'}
              value={pickingDate ? 'Done' : date ? 'Change' : 'Optional'}
              onPress={() => setPickingDate(p => !p)}
            />
            {pickingDate ? (
              <CalendarGrid
                selected={date ?? todayKey()}
                onSelect={(k) => { setDate(k); setPrefs(p => ({ ...p, onlyDate: k })); setPickingDate(false); }}
                marked={new Set()}
                expanded
              />
            ) : null}
            {date ? (
              <ListRow title="Clear date" tintTitle onPress={() => { setDate(null); setPrefs(p => ({ ...p, onlyDate: null })); }} />
            ) : null}
          </ListSection>

          <Field label="Other details" value={description} onChangeText={setDescription} placeholder="Budget, reservations, what to bring… (optional)" multiline accessibilityLabel="Other details" />

          <View style={{ gap: space.s }}>
            <Txt v="headline" style={{ paddingHorizontal: space.m }}>How do you want to plan it?</Txt>
            {timeKnown && onKnowWhen ? (
              <Button label="Add to Calendar" icon="calendar" onPress={knowWhen} disabled={!title.trim() || !!saving} block />
            ) : null}
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button label="Ask the Group" icon="chatbubbles-outline" variant="gray" onPress={handlePropose} loading={saving === 'propose'} disabled={!title.trim() || !!saving} style={{ flex: 1 }} />
              <Button label="Find a Time" icon="search-outline" variant={timeKnown ? 'gray' : 'filled'} onPress={startPlan} disabled={!title.trim() || !!saving} style={{ flex: 1 }} />
            </View>
            {!timeKnown && onKnowWhen ? (
              <Button label="I Know When" icon="calendar-outline" variant="plain" onPress={knowWhen} disabled={!title.trim() || !!saving} />
            ) : null}
            <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>
              Ask the Group shares it so people can say they’re in. Find a Time checks everyone’s calendars and suggests dates they can vote on.
            </Txt>
          </View>
        </>
      )}

      {step === 'prefs' && (
        <>
          <View style={{ gap: space.s, paddingHorizontal: space.m }}>
            <Txt v="title" accessibilityRole="header">Any scheduling preferences?</Txt>
            <Txt v="callout" tone="secondary">
              {participantIds.length
                ? `We’ll check calendars for ${who(['you', ...participantNames])}, then suggest a few times that work for everyone.`
                : 'We’ll check your calendar and suggest a few times that work.'}
            </Txt>
          </View>

          <View>
            <SectionHeader title="Time of day" />
            <Segmented options={PART_OPTIONS} value={prefs.partOfDay} onChange={k => setPrefs(p => ({ ...p, partOfDay: k }))} />
          </View>

          {date ? (
            <ListSection footer={prefs.onlyDate ? 'Turn off to look at other days too.' : undefined}>
              <ListRow
                icon="calendar-outline"
                title={`Only ${shortDate(date)}`}
                trailing={<Toggle label={`Only ${shortDate(date)}`} value={!!prefs.onlyDate} onValueChange={v => setPrefs(p => ({ ...p, onlyDate: v ? date : null }))} />}
              />
            </ListSection>
          ) : null}

          {!prefs.onlyDate && (
            <>
              <View>
                <SectionHeader title="How soon" />
                <Segmented options={HORIZON_OPTIONS} value={prefs.horizon} onChange={k => setPrefs(p => ({ ...p, horizon: k }))} />
              </View>
              <View>
                <SectionHeader title="Days" />
                <Segmented options={DAY_OPTIONS} value={prefs.days} onChange={k => setPrefs(p => ({ ...p, days: k }))} />
              </View>
            </>
          )}

          <View>
            <SectionHeader title="How long" />
            <Segmented
              options={DURATION_OPTIONS}
              value={String(prefs.duration) as typeof DURATION_OPTIONS[number]['key']}
              onChange={k => setPrefs(p => ({ ...p, duration: Number(k) }))}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: space.s }}>
            {!existing && <Button label="Back" variant="gray" onPress={() => setStep('compose')} style={{ flex: 1 }} />}
            <Button label="Find Times" icon="search" onPress={handleFindTimes} loading={searching} style={{ flex: 2 }} />
          </View>
        </>
      )}

      {step === 'options' && (
        <>
          <View style={{ gap: space.s, paddingHorizontal: space.m }}>
            <Txt v="title" accessibilityRole="header">{title}</Txt>
            <Txt v="callout" tone="secondary">
              {slots.length === 0
                ? 'Nothing works for everyone in that range.'
                : participantIds.length
                  ? `These work for ${who(['you', ...participantNames])}.`
                  : 'These are open on your calendar.'}
            </Txt>
          </View>

          {slots.length > 0 ? (
            <ListSection header="Date options" footer={`${DURATION_LABEL(prefs.duration)} each · checked against sheep calendars${work.length ? ' and your work hours' : ''}.`}>
              {slots.map((s, i) => {
                const rel = relativeDay(slotDay(s));
                return (
                  <ListRow
                    key={s.start}
                    icon="calendar-outline"
                    title={rel ? `${rel} · ${shortDate(slotDay(s))}` : shortDate(slotDay(s))}
                    subtitle={slotTime(s)}
                    checked={chosen === i}
                    onPress={() => setChosen(i)}
                  />
                );
              })}
            </ListSection>
          ) : (
            <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>
              Try a different time of day, more days, or a later range.
            </Txt>
          )}

          {offAppNames.length > 0 && (
            <View style={{ flexDirection: 'row', gap: space.s, paddingHorizontal: space.m }}>
              <Icon name="information-circle-outline" size={16} color={c.secondaryLabel} style={{ marginTop: 1 }} />
              <Txt v="footnote" tone="secondary" style={{ flex: 1 }}>
                {who(offAppNames)} {offAppNames.length === 1 ? 'isn’t' : 'aren’t'} on sheep, so we couldn’t check {offAppNames.length === 1 ? 'their calendar' : 'those calendars'}. Sharing the invite sends them the details.
              </Txt>
            </View>
          )}

          {slots.length > 0 && (
            <View style={{ gap: space.s }}>
              <Txt v="headline" style={{ paddingHorizontal: space.m }}>Send the invite now, or let everyone vote?</Txt>
              <Button
                label={chosen !== null ? `Create & Share Invite` : 'Pick a time to invite'}
                icon="send"
                onPress={handleInvite}
                loading={saving === 'invite'}
                disabled={chosen === null || !!saving}
                block
              />
              <Button
                label="Let Everyone Vote on These Dates"
                variant="gray"
                onPress={handleKeepProposed}
                loading={saving === 'keep'}
                disabled={!!saving}
                block
              />
            </View>
          )}

          <Button label="Change Preferences" variant="plain" onPress={() => setStep('prefs')} disabled={!!saving} />
        </>
      )}
    </Sheet>
  );
}
