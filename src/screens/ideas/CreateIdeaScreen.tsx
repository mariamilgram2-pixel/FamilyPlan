// New Plan sheet, and the flow that turns an idea into a time.
//
// Steps in one sheet:
//   compose  — one sentence ("dinner with Ana this week"), with who, when,
//              and where filling in under it as you type, each a tap to
//              change (or fill it all in yourself). One main button says
//              exactly what will happen, from what's known: save the idea,
//              ask people to pick from three times, or invite them to the
//              one that's set. Everything else is under More options, and
//              closing keeps what you typed as a private draft.
//   prefs    — Plan asks about scheduling preferences first (time of day,
//              how soon, which days, how long).
//   options  — a few suggested times, ranked by calendar fit first and
//              everyone's private preferences second (lib/suggest); create &
//              share an invite, or let everyone vote on those dates. Each
//              option shows its calendar fit ("3 of 4 calendars appear
//              free"), which is a guess, never a vote.
// Existing ideas enter at `prefs` ("Find a time") or `options` (a date that
// was proposed earlier).
//
// The audience picker is chunked into Groups / People / Your people, and long
// lists show five at a time with an explicit "Show all" to keep each chunk
// scannable.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ask, confirmAction, notify } from '../../lib/alert';
import { ActivityIndicator, Platform, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { addDemoEvent, DEMO_CONTACTS, DEMO_EVENTS, DEMO_MEMBERS, DEMO_ME, isDemoGroup, removeDemoIdea } from '../../lib/demo';
import { REPEAT_OPTIONS, RepeatKey, ruleFor } from '../../lib/recurrence';
import { parseIdeaText, ParsedIdea } from '../../lib/nlIdea';
import {
  DURATION_LABEL, DayKind, Horizon, PartOfDay, PlanPrefs,
  MAX_SPAN_DAYS, candidateSlots, defaultPrefs, laterMonths, parseSpan, searchRange, slotDay, slotLabel, slotTime, slotTitle, spanHint, spanOf,
} from '../../lib/planner';
import { Candidate, MIN_OPTIONS, Scored, SheepPlan, rankSuggestions, scoreLocally, sheepContext } from '../../lib/suggest';
import { estimateLabel, fitKnown, fromRow } from '../../lib/availability';
import { useMyPrefs } from '../../lib/availabilityPrefs';
import { sendNotifications } from '../../lib/notifications';
import { useWorkSchedules, workConflict } from '../../lib/workSchedule';
import {
  ANY_WHEN, DayChoice, PART_LABEL, RANGE_LABEL, TimeChoice, TimePart, When,
  clockLabel, clockRangeLabel, dayLabel, isExact, lockedSlot, parseClockRange, prefsFor, rangeDays, whenLabel,
} from '../../lib/planWhen';
import { Place, PlaceHit, newSession, placeDetails, placeText, searchPlaces, splitPlace, useSavedPlaces } from '../../lib/places';
import { expandEvents } from '../../lib/recurrence';
import { blocksTime } from '../../lib/rsvp';
import { AppNotificationInsert, Contact, Event, Idea, Profile, TimeSlot } from '../../types';
import type { EstimateRow } from '../../lib/availability';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../../components/Avatar';
import {
  Button, Field, Icon, IconName, ListRow, ListSection, Menu, SectionHeader, Segmented, Sheet, Tappable, Toggle, Txt,
} from '../../components/ui';
import { space, useTheme } from '../../theme';
import WhenCalendar from './WhenCalendar';
import { addDays, parseKey, relativeDay, shortDate, todayKey } from '../calendar/dates';
import type { PlanPrefill } from '../../components/PlanComposer';

interface PersonInGroup {
  profile: Profile;
  groupIds: string[];
  groupNames: string[];
}

type Step = 'compose' | 'prefs' | 'options';

export interface PlanEntry {
  idea: Idea;
  step: 'compose' | 'prefs' | 'options';   // compose: a draft, picked up where you left off
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
// Within a day the length is optional: it matters for a recital, not for dinner.
const HOUR_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Doesn’t matter' },
  ...[60, 120, 180, 240].map(m => ({ value: m, label: DURATION_LABEL(m) })),
];
// A trip over your work days still shows (you can take time off), after ones that don't.
const WORK_PENALTY = 2;
// Kinds of plan to start from. Each only nudges: a trip runs several days.
type Kind = 'food' | 'activity' | 'together' | 'trip';
const KINDS: { key: Kind; label: string; icon: IconName; example: string }[] = [
  { key: 'food', label: 'Food and drinks', icon: 'restaurant-outline', example: 'Dinner with Ana this week' },
  { key: 'activity', label: 'Activity', icon: 'bicycle-outline', example: 'Bowling Saturday afternoon' },
  { key: 'together', label: 'Get-together', icon: 'people-outline', example: 'Game night at ours next week' },
  { key: 'trip', label: 'Trip', icon: 'compass-outline', example: 'Camping at the lake, two nights' },
];
const uniq = (list: (string | null | undefined)[]) => Array.from(new Set(list.map(x => x?.trim()).filter(Boolean) as string[]));

const LENGTH_KIND: { key: 'one' | 'several'; label: string }[] = [{ key: 'one', label: '1 day' }, { key: 'several', label: 'Several days' }];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Demo mode has no database; the saved idea comes back so the list can show it. */
  onSaved: (idea?: Idea) => void;
  entry?: PlanEntry | null;
  prefill?: PlanPrefill;
}

export default function CreateIdeaSheet({ visible, onClose, onSaved, entry, prefill }: Props) {
  const { activeGroup, groups, fetchGroups } = useGroup();
  const { user, profile } = useAuth();
  const { c } = useTheme();
  const work = useWorkSchedules();
  const isDemo = isDemoGroup(activeGroup);
  const { prefs: myPrefs } = useMyPrefs(user?.id ?? null);
  const timeZone = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
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
  const [when, setWhen] = useState<When>(ANY_WHEN);
  const date = when.day.kind === 'date' ? when.day.date : null;
  const setDate = (k: string | null) => setWhen(w => ({ ...w, day: k ? { kind: 'date', date: k } : { kind: 'any' } }));
  const [kind, setKind] = useState<Kind | null>(null);
  const [filling, setFilling] = useState(false);              // "Fill it in yourself": the rows, no sentence needed
  const [showDetails, setShowDetails] = useState(false);      // More details: repeat, notes
  const [repeat, setRepeat] = useState<RepeatKey>('never');
  // What you've set by hand; typing more in the sentence doesn't undo it.
  const touched = useRef(new Set<'who' | 'when' | 'place' | 'title' | 'repeat'>());
  const touch = (k: 'who' | 'when' | 'place' | 'title' | 'repeat') => touched.current.add(k);
  const [editingTitle, setEditingTitle] = useState(false);
  const [showWho, setShowWho] = useState(false);
  const [pickingTime, setPickingTime] = useState(false);
  const [editingWhen, setEditingWhen] = useState(false);
  const [suggested, setSuggested] = useState(false);   // "Help me pick" results, shown right in When
  const [timeText, setTimeText] = useState('');
  const [typingPlace, setTypingPlace] = useState(false);
  const [typingLength, setTypingLength] = useState(false);
  const [places, setPlaces] = useState<string[]>([]);       // where you've been lately, for Place
  const [showRecent, setShowRecent] = useState(false);
  const [placeDraft, setPlaceDraft] = useState('');
  const [placePick, setPlacePick] = useState<Place | null>(null);   // a search result or saved place, with its address
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([]);
  const [placeSession, setPlaceSession] = useState(newSession);
  const [savingAs, setSavingAs] = useState(false);
  const [saveLabel, setSaveLabel] = useState('');
  const [savedAs, setSavedAs] = useState<string | null>(null);
  const [calView, setCalView] = useState<'mine' | 'all' | null>(null);
  const [calEvents, setCalEvents] = useState<Event[]>([]);
  const [pickingDate, setPickingDate] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);

  const [prefs, setPrefs] = useState<PlanPrefs>(defaultPrefs({}));
  const [spanText, setSpanText] = useState('');   // "3", "10 days", "2 weeks"
  const [myPlans, setMyPlans] = useState<SheepPlan[]>([]);   // your own plans in range, to flag overlaps
  const multi = spanOf(prefs) > 1;
  // Several days start at midnight, so a trip can't start on a day already under way.
  const startDay = date && !(multi && date <= todayKey()) ? date : null;
  useEffect(() => { if (prefs.onlyDate && !startDay) setPrefs(p => ({ ...p, onlyDate: null })); }, [prefs.onlyDate, startDay]);
  const spanTyped = parseSpan(spanText);
  // Coming to preferences: show the number of days already chosen (e.g. from "two nights").
  useEffect(() => { if (step === 'prefs') setSpanText(multi ? `${spanOf(prefs)} days` : ''); }, [step]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);

  const [people, setPeople] = useState<PersonInGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saving, setSaving] = useState<'propose' | 'save' | 'invite' | 'keep' | null>(null);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const describeInput = useRef<React.ElementRef<typeof Field>>(null);

  // Reset + refetch groups each time the sheet opens so we never render
  // against a stale/empty list from an earlier failed fetch.
  useEffect(() => {
    if (!visible) {
      setDescribe('');
      setParsed(null);
      return;
    }
    setDescribe(''); setParsed(null); setPickingDate(false); setWhen(ANY_WHEN); setKind(null);
    setEditingTitle(false); setEditingWhen(false); setSuggested(false); setShowWho(false);
    setFilling(false); setShowDetails(false); setRepeat('never'); touched.current.clear(); setPickingTime(false); setTimeText('');
    setTypingPlace(false); setTypingLength(false); setCalView(null); setShowRecent(false);
    setShowAllPeople(false); setShowAllContacts(false);
    setSlots([]); setChosen(null); setSaving(null);
    if (existing) {
      setTitle(existing.title); setDescription(existing.description ?? '');
      setLocation(existing.location ?? ''); setDate(existing.target_date);
      // Everything already settled carries over: its own group too, not just
      // the extra ones, so Who reads "You and My Family" instead of empty.
      setSelectedGroupIds(new Set([...(existing.group_id ? [existing.group_id] : []), ...(existing.audience_group_ids ?? [])]));
      setSelectedUserIds(new Set(existing.audience_user_ids ?? []));
      setSelectedContactIds(new Set(existing.audience_contact_ids ?? []));
      const hint = parseIdeaText(existing.title, { today: todayKey(), people: [] });
      setPrefs({ ...defaultPrefs({ start: hint.start, end: hint.end, date: existing.target_date }), ...spanHint(`${existing.title} ${existing.description ?? ''}`) });
      // A draft reopens with its sentence, where you left it: "this week",
      // "evening", and the title read from it again.
      if (existing.status === 'draft') {
        const pd = parseIdeaText(existing.title, { today: todayKey(), people: [] });
        setDescribe(existing.title);
        setTitle(pd.title || existing.title);
        setRepeat(pd.repeat ?? 'never');
        setWhen({
          day: existing.target_date ? { kind: 'date', date: existing.target_date } : pd.range ? { kind: 'range', range: pd.range } : pd.date ? { kind: 'date', date: pd.date } : { kind: 'any' },
          time: pd.start ? { kind: 'exact', start: pd.start, end: pd.end } : pd.part ? { kind: 'part', part: pd.part } : { kind: 'any' },
        });
      } else {
        // A day hoped for is the day; the time is still open.
        setWhen({ day: existing.target_date ? { kind: 'date', date: existing.target_date } : { kind: 'any' }, time: { kind: 'any' } });
      }
      // What's settled stays settled; typing more doesn't reset it.
      if (existing.group_id || (existing.audience_group_ids ?? []).length || (existing.audience_user_ids ?? []).length || (existing.audience_contact_ids ?? []).length) touch('who');
      if (existing.location) touch('place');
      if (existing.target_date) touch('when');
      setStep(entry!.step);
      if (entry!.step === 'options') {
        const proposed = (existing.proposed_slots ?? []).filter(s => new Date(s.start).getTime() > Date.now());
        setSlots(proposed);
        const i = entry!.slot ? proposed.findIndex(s => s.start === entry!.slot!.start) : -1;
        setChosen(i >= 0 ? i : proposed.length ? 0 : null);
      }
    } else {
      setTitle(prefill?.title ?? ''); setDescription(prefill?.notes ?? ''); setLocation(prefill?.location ?? ''); setDate(prefill?.date ?? null);
      setSelectedGroupIds(new Set(prefill?.groups ?? [])); setSelectedUserIds(new Set(prefill?.people ?? [])); setSelectedContactIds(new Set());
      setPrefs(defaultPrefs({ start: prefill?.start, end: prefill?.end, date: prefill?.date ?? null }));
      setWhen({
        day: prefill?.date ? { kind: 'date', date: prefill.date } : { kind: 'any' },
        time: prefill?.start ? { kind: 'exact', start: prefill.start, end: prefill.end } : { kind: 'any' },
      });
      // "Do it again", "Plan with Ana": what's known is already filled in.
      setFilling(!!prefill?.title);
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

  const savedPlaces = useSavedPlaces(meId, isDemo);

  // Search as you type (a beat after the last key), until a place is picked.
  useEffect(() => {
    if (!typingPlace || placePick || placeDraft.trim().length < 2) { setPlaceHits([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      searchPlaces(placeDraft, placeSession, isDemo).then(hits => { if (!cancelled) setPlaceHits(hits); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [placeDraft, placePick, typingPlace]);

  // Places you've made plans lately, for Place.
  useEffect(() => {
    if (!visible) return;
    if (isDemo) { setPlaces(uniq(DEMO_EVENTS.map(e => e.location)).slice(0, 5)); return; }
    if (!meId) return;
    supabase.from('events').select('location').contains('attendees', [meId]).not('location', 'is', null)
      .order('start_time', { ascending: false }).limit(40)
      .then(({ data }) => setPlaces(uniq((data ?? []).map((r: any) => r.location)).slice(0, 5)));
  }, [visible]);

  // "See on calendars", in When's calendar: plans on the days in view, yours
  // or every shared calendar you can see.
  const [calWindow, setCalWindow] = useState<[string, string]>([todayKey(), addDays(todayKey(), 6)]);
  useEffect(() => {
    if (!calView) return;
    let cancelled = false;
    const from = parseKey(calWindow[0]), to = parseKey(addDays(calWindow[1], 1));
    (async () => {
      let list: Event[];
      if (isDemo) {
        list = DEMO_EVENTS;
      } else {
        const groupIds = effectiveGroups.map(g => g.id);
        const base = () => {
          const q = supabase.from('events').select('*');
          return calView === 'mine' || !groupIds.length ? q.contains('attendees', [meId]) : q.or(`group_id.in.(${groupIds.join(',')}),attendees.cs.{${meId}}`);
        };
        const [oneOff, repeating] = await Promise.all([
          base().is('recurrence', null).lt('start_time', to.toISOString()).gt('end_time', from.toISOString()),
          base().not('recurrence', 'is', null),
        ]);
        list = [...((oneOff.data ?? []) as Event[]), ...((repeating.data ?? []) as Event[])];
      }
      const shown = expandEvents(list, from, to).filter(e =>
        calView === 'all' || (e.attendees.includes(meId!) && e.rsvps?.[meId!] !== 'declined'));
      if (!cancelled) setCalEvents(shown);
    })();
    return () => { cancelled = true; };
  }, [calView, calWindow[0], calWindow[1]]);

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    touch('who');
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

  // A reopened draft's title, read again once names are in ("with ana" → "with Ana").
  useEffect(() => {
    if (existing?.status !== 'draft' || !describe.trim() || touched.current.has('title') || !nlPeople.length) return;
    setTitle(parseIdeaText(describe, { today: todayKey(), people: nlPeople, meId }).title || describe.trim());
  }, [nlPeople]);

  function onDescribe(text: string) {
    setDescribe(text);
    if (!text.trim()) { setParsed(null); return; }
    const p = parseIdeaText(text, { today: todayKey(), people: nlPeople, meId });
    const t = touched.current;
    setParsed(p);
    if (!t.has('title')) setTitle(p.title);
    if (!t.has('place')) setLocation(p.location ?? '');
    if (!t.has('repeat')) setRepeat(p.repeat ?? 'never');
    if (!t.has('when')) setWhen({
      day: p.range ? { kind: 'range', range: p.range } : p.date ? { kind: 'date', date: p.date } : { kind: 'any' },
      time: p.start ? { kind: 'exact', start: p.start, end: p.end } : p.part ? { kind: 'part', part: p.part } : { kind: 'any' },
    });
    if (!t.has('who')) {
      setSelectedUserIds(new Set(p.personIds.filter(id => !id.startsWith('contact:'))));
      setSelectedContactIds(new Set(p.personIds.filter(id => id.startsWith('contact:')).map(id => id.slice(8))));
    }
    // "Camping weekend", "two nights", or a trip picked below: several days.
    const span = spanHint(text) ?? (kind === 'trip' ? { spanDays: 3 } : null);
    setPrefs({ ...defaultPrefs({ start: p.start, end: p.end, date: p.date }), ...span });
  }

  function pickKind(k: Kind | null) {
    setKind(k);
    if (k === 'trip' && spanOf(prefs) === 1) setPrefs(p => ({ ...p, spanDays: 3 }));
    if (k !== 'trip' && kind === 'trip' && !spanHint(describe)) setPrefs(p => ({ ...p, spanDays: 1 }));
  }

  // Home (and any other entry) can hand over a sentence already being typed.
  // Parse it the same way a keystroke in this field would. If names load a
  // moment later, parse again — unless the sentence was edited in the meantime.
  const describeRef = useRef('');
  describeRef.current = describe;
  useEffect(() => {
    if (!visible || existing) return;
    const sentence = prefill?.sentence;
    if (!sentence) return;
    const current = describeRef.current;
    if (current && current !== sentence) return;
    onDescribe(sentence);
    const focus = setTimeout(() => describeInput.current?.focus(), 50);
    return () => clearTimeout(focus);
  }, [visible, prefill?.sentence, nlPeople]);

  // ─── Who's involved ────────────────────────────────────────────────────────
  // App users we can notify and whose calendars we can check: picked people,
  // members of picked groups, and (for an existing idea) anyone who said "I'm in"
  // or said some of its dates work.
  const participantIds = useMemo(() => {
    const ids = new Set(selectedUserIds);
    people.forEach(p => { if (p.groupIds.some(g => selectedGroupIds.has(g))) ids.add(p.profile.id); });
    existing?.idea_votes?.forEach(v => ids.add(v.user_id));
    Object.entries(existing?.slot_votes ?? {}).forEach(([id, starts]) => { if (starts.length) ids.add(id); });
    // Anyone who said they can't make it isn't asked or invited. Maybes still are.
    existing?.declined_user_ids?.forEach(id => ids.delete(id));
    if (meId) ids.delete(meId);
    return Array.from(ids);
  }, [selectedUserIds, selectedGroupIds, people, existing, meId]);

  const nameOf = (id: string) => {
    const p = people.find(x => x.profile.id === id)?.profile;
    return (p?.full_name ?? p?.email ?? 'Someone').split(' ')[0];
  };
  const participantNames = participantIds.map(nameOf);
  const offAppNames = contacts.filter(ct => selectedContactIds.has(ct.id)).map(ct => ct.name);

  // The idea's home group: the one it's in, else the first group picked.
  // None picked, it belongs to no group: just yours and whoever's named.
  const storageGroupId = useMemo(() => {
    if (existing?.group_id) return existing.group_id;
    for (const g of effectiveGroups) if (selectedGroupIds.has(g.id)) return g.id;
    return null;
  }, [existing, selectedGroupIds, effectiveGroups]);
  // Events still live on a group's calendar: the idea's, else the one you're on.
  const eventGroupId = storageGroupId ?? activeGroup?.id ?? effectiveGroups[0]?.id ?? null;

  // ─── Saving ────────────────────────────────────────────────────────────────

  function ready() {
    if (!title.trim() && !describe.trim()) { notify('What’s the idea?', 'Give it a short description first.'); return false; }
    if (!meId) return false;
    return true;
  }

  /** Insert the new idea, or update the existing one. */
  async function persist(fields: Pick<Idea, 'status' | 'proposed_slots' | 'event_id'> & Pick<Partial<Idea>, 'slot_votes'>): Promise<Idea | null> {
    const planned_at = fields.status === 'planned' ? new Date().toISOString() : null;
    const extraGroupIds = Array.from(selectedGroupIds).filter(id => id !== storageGroupId);
    const row = {
      // A draft keeps your sentence as you typed it, to read again later.
      title: fields.status === 'draft' ? (describe.trim() || title.trim()) : (title.trim() || describe.trim()),
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
        group_id: storageGroupId,
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

  /**
   * Save, with or without details: it goes into Plans either way. With people
   * in it, one question first — let them know now, or just keep it there.
   */
  async function saveToPlans() {
    if (!ready()) return;
    if (!audienceNames.length) return handleSave();
    const share = await ask(`Share with ${whoShort}?`, `It’s saved in Plans either way. Sharing lets ${whoShort === 'everyone' ? 'everyone' : whoShort} say they’re in, and you can add a time later.`, `Share with ${whoShort}`, 'Just save');
    return share ? handlePropose() : handleSave();
  }

  /** Into Plans without asking anyone, to pick up later. */
  async function handleSave() {
    if (!ready()) return;
    setSaving('save');
    const idea = await persist({ status: 'proposed', proposed_slots: [], event_id: null });
    setSaving(null);
    if (!idea) return;
    finish(idea);
    notify('Created', 'It’s in Plans. No one’s been asked yet.');
  }

  /**
   * Closing keeps what you typed as a private draft, so nothing's lost to a
   * meeting starting. A new draft asks once whether to keep it.
   */
  async function handleClose() {
    const typed = describe.trim() || title.trim();
    const draftable = step === 'compose' && !saving && !!typed && !!meId
      && (!existing || existing.status === 'draft');
    if (!draftable) return onClose();
    const idea = await persist({ status: 'draft', proposed_slots: [], event_id: null });
    onClose();
    if (!idea) return;
    onSaved(idea);
    if (existing) return;
    const discard = await confirmAction('Kept as a draft', 'It’s in Plans, where only you can see it.', 'Discard', 'Keep');
    if (!discard) return;
    if (isDemo) removeDemoIdea(idea.id);
    else await supabase.from('ideas').delete().eq('id', idea.id);
    onSaved();
  }

  // ─── Planning ──────────────────────────────────────────────────────────────

  /** From the summary: search whatever's still loose, keeping what's known. */
  // From the summary, suggestions open right in When, so the rest of the
  // plan stays in reach: pick one and carry on.
  function findFromCompose() {
    if (!ready()) return;
    const p = prefsFor(when, prefs, todayKey());
    setPrefs(p);
    handleFindTimes(p, true);
  }

  function takeSuggestion(slot: TimeSlot) {
    const day = slotDay(slot);
    const hm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    touch('when');
    setWhen({ day: { kind: 'date', date: day }, time: spanOf(prefs) > 1 ? { kind: 'any' } : { kind: 'exact', start: hm(slot.start), end: hm(slot.end) } });
    setSuggested(false); setEditingWhen(false); setPickingDate(false); setPickingTime(false);
  }

  function lockIn() {
    const slot = lockedSlot(when, prefs);
    if (!slot || !ready()) return;
    if (Date.parse(slot.start) < Date.now()) return notify('That time’s passed', 'Pick a later day or time.');
    createInvite(slot);
  }

  /** Sheep events each person is going to, around the search range. */
  async function loadPlans(everyone: string[], p: PlanPrefs): Promise<SheepPlan[]> {
    const [from, to] = searchRange(p);
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
    // Going = invited and not declined, on an event that's still on.
    return expandEvents(rows, new Date(from), new Date(to)).flatMap(e =>
      everyone.filter(id => blocksTime(e, id))
        .map(id => ({ who: id, start: new Date(e.start_time).getTime(), end: new Date(e.end_time).getTime() })));
  }

  /**
   * Calendar fit and preference fit for each candidate. Signed in, the server
   * weighs everyone's connected calendars and private preferences and returns
   * counts only; in the demo, or if that fails, it's Sheep events alone.
   */
  async function score(cands: Candidate[], everyone: string[], plans: SheepPlan[]): Promise<Scored[]> {
    const ctxs = cands.map(c => sheepContext(c.slot, everyone, plans, timeZone));
    const local = () => cands.map((c, i) => scoreLocally(c, ctxs[i], { people: everyone, meId: meId!, myPrefs, timeZone }));
    if (isDemo || !user || !cands.length) return local();
    const rows: EstimateRow[] = [];
    for (let i = 0; i < ctxs.length; i += 60) {
      const { data, error } = await supabase.rpc('availability_estimate', {
        p_member_ids: everyone, p_slots: ctxs.slice(i, i + 60), p_timezone: timeZone,
      });
      if (error || !data) return local();
      rows.push(...data);
    }
    const byStart = new Map(rows.map(r => [Date.parse(r.slot_start), r]));
    const fallback = local();
    return cands.map((c, i) => {
      const r = byStart.get(Date.parse(c.slot.start));
      return r ? { ...c, fit: fromRow(r), penalty: r.soft_penalty } : fallback[i];
    });
  }

  async function handleFindTimes(p: PlanPrefs = prefs, inline = false) {
    setSearching(true);
    const found = await searchTimes(p);
    setSlots(found);
    setChosen(found.length ? 0 : null);
    setSearching(false);
    if (inline) { setSuggested(true); setEditingWhen(true); setPickingDate(false); setPickingTime(false); setTypingPlace(false); return; }
    setStep('options');
  }

  /** Times that fit, best first, from what's set and everyone's calendars. */
  async function searchTimes(p: PlanPrefs): Promise<TimeSlot[]> {
    const multi = spanOf(p) > 1;
    // Maybes still get the invite, but their calendars don't shape the times.
    const maybes = new Set(existing?.tentative_user_ids ?? []);
    const everyone = [meId!, ...participantIds.filter(id => !maybes.has(id))];
    const plans = await loadPlans(everyone, p);
    const hint = parsed ?? parseIdeaText(title, { today: todayKey(), people: [] });
    // Within a day, your own plans and work hours rule a time out; everyone
    // else's only rank it lower. A trip of several days will cross things, so
    // there your plans and work days only rank it lower too, and the option says so.
    const mine = plans.filter(p => p.who === meId);
    setMyPlans(mine);
    const cands = candidateSlots({
      prefs: p, work, preferredStart: when.time.kind === 'exact' ? when.time.start : hint.start, timeZone, perDay: 4,
      skip: multi ? undefined : (s, e) => mine.some(p => s < p.end && e > p.start),
    });
    const scored = (await score(cands, everyone, plans))
      .map(c => (multi && workConflict(work, c.slot.start, c.slot.end) ? { ...c, penalty: c.penalty + WORK_PENALTY } : c));
    const ranked = rankSuggestions(scored, { soon: p.horizon === 'soon' });
    return ranked.map(r => ({ start: r.slot.start, end: r.slot.end, fit: r.fit }));
  }

  /** One tap for "dinner with Ana this week": the three best times, out for a vote. */
  async function askWithTimes() {
    if (!ready()) return;
    const p = prefsFor(when, prefs, todayKey());
    setPrefs(p);
    setSaving('keep');
    const top = (await searchTimes(p)).slice(0, 3);
    if (!top.length) {
      setSaving(null);
      setSlots([]); setSuggested(true); setEditingWhen(true);
      return;
    }
    setSlots(top);
    await handleKeepProposed(top);
  }

  async function handleKeepProposed(list: TimeSlot[] = slots) {
    const slots = list;
    setSaving('keep');
    // New options start a fresh vote. Fitting your calendar isn't a vote, so
    // nobody's answer is filled in — you can say which work like anyone else.
    const idea = await persist({ status: 'proposed', proposed_slots: slots, event_id: null, slot_votes: {} });
    if (!idea) return setSaving(null);
    await notifyAll(idea, 'dates_proposed', `${myName} suggested times for ${idea.title}`, slots.map(slotLabel).join('\n'));
    setSaving(null);
    finish(idea);
    notify('Dates shared', `${slots.length} date option${slots.length === 1 ? '' : 's'} saved${participantIds.length ? ` and shared with ${who(participantNames)}` : ''}.`);
  }

  function handleInvite() {
    if (chosen === null || !slots[chosen]) return;
    createInvite(slots[chosen]);
  }

  /** On the calendar, everyone invited, and the share sheet for anyone not on sheep. */
  async function createInvite(slot: TimeSlot) {
    setSaving('invite');
    const attendees = [meId!, ...participantIds];
    // Answers carry over: anyone who said this date works is going, and a
    // maybe stays a maybe.
    const rsvps = Object.fromEntries(participantIds.flatMap((id): [string, 'going' | 'maybe'][] =>
      existing?.slot_votes?.[id]?.includes(slot.start) ? [[id, 'going']]
      : existing?.tentative_user_ids?.includes(id) ? [[id, 'maybe']] : []));
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
      recurrence: ruleFor(repeat, null),
    };
    if (isDemo) {
      eventId = addDemoEvent(eventRow).id;
    } else {
      const { data, error } = await supabase.from('events').insert({ ...eventRow, group_id: eventGroupId } as any).select('id').single();
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

  const sheetTitle = step === 'compose' ? (existing?.status === 'draft' ? 'Draft' : existing ? 'Start Planning' : 'New Plan') : step === 'prefs' ? 'Find a Time' : 'Pick a Time';
  // The rows show once there's something to go on, or you chose to fill them in.
  const started = !!describe.trim() || filling || !!existing;

  // ─── The summary ───────────────────────────────────────────────────────────
  // Rows sit under "Still to decide" until they're settled, and stay put
  // while you're changing one so it doesn't jump mid-edit.
  const trip = spanOf(prefs) > 1;
  const today = todayKey();
  const audienceNames = [
    ...effectiveGroups.filter(g => selectedGroupIds.has(g.id)).map(g => g.name),
    ...people.filter(p => selectedUserIds.has(p.profile.id)).map(p => (p.profile.full_name ?? p.profile.email ?? 'Someone').split(' ')[0]),
    ...contacts.filter(ct => selectedContactIds.has(ct.id)).map(ct => ct.name.split(' ')[0]),
  ];
  const whoValue = audienceNames.length ? `You and ${who(audienceNames)}` : 'Add people';
  const whoSet = audienceNames.length > 0 && !showWho;
  const whenValue = trip
    ? [dayLabel(when.day), `${spanOf(prefs)} days`].filter(Boolean).join(' · ')
    : whenLabel(when) ?? 'Add a day and time';
  const whenSet = isExact(when, trip) && !editingWhen;
  const placeSet = !!location.trim() && !typingPlace;
  const locked = isExact(when, trip);
  const weekday = (k: string) => (k === today ? 'Today' : k === addDays(today, 1) ? 'Tomorrow' : parseKey(k).toLocaleDateString('en-US', { weekday: 'short' }));
  const exactLabel = (t: { start: string; end?: string }) => (t.end ? clockRangeLabel(t.start, t.end) : clockLabel(t.start));
  const lockText = date ? (trip ? `${weekday(date)} · ${spanOf(prefs)} days`
    : when.time.kind === 'allDay' ? `${weekday(date)}, all day`
    : when.time.kind === 'exact' ? `${weekday(date)} ${exactLabel(when.time)}` : '') : '';
  const findText = when.day.kind === 'range' ? `Find a time ${RANGE_LABEL[when.day.range].toLowerCase()}`
    : date ? `Find a time ${weekday(date) === 'Today' || weekday(date) === 'Tomorrow' ? weekday(date).toLowerCase() : `on ${weekday(date)}`}`
    : 'Find a time';
  const askText = `Ask ${audienceNames.length === 1 && selectedGroupIds.size === 0 ? audienceNames[0] : 'the group'}${locked ? ' first' : ''}`;

  // One main button, saying exactly what happens, from what's known.
  const whoShort = audienceNames.length === 1 ? audienceNames[0]
    : audienceNames.length === 2 && selectedGroupIds.size === 0 ? `${audienceNames[0]} and ${audienceNames[1]}` : 'everyone';
  const hasWho = audienceNames.length > 0;
  const looseWhen = when.day.kind !== 'any' || when.time.kind !== 'any';
  const within = when.day.kind === 'range' ? ` ${RANGE_LABEL[when.day.range].toLowerCase()}`
    : date ? ` ${weekday(date) === 'Today' || weekday(date) === 'Tomorrow' ? weekday(date).toLowerCase() : `on ${weekday(date)}`}` : '';
  // The big button creates it (into Plans, sharing it if you like); once the
  // day and time are set, it sends the invite instead. The button beside it
  // is the next step that fits: ask them to pick from the best times, or find one.
  type Action = { label: string; icon: IconName; note: string; run: () => void; busy: boolean };
  const create: Action = {
    label: existing && existing.status !== 'draft' ? 'Save' : 'Create', icon: 'add-circle-outline', run: saveToPlans, busy: saving === 'save' || saving === 'propose',
    note: hasWho ? `Saves it to Plans, and you choose whether to share it with ${whoShort === 'everyone' ? 'everyone' : whoShort}.` : 'Saves it to Plans. You can add the rest later.',
  };
  const primary: Action = locked ? {
    label: `${hasWho ? `Invite ${whoShort}` : 'Add to calendar'} · ${lockText}${repeat !== 'never' ? ` · ${REPEAT_OPTIONS.find(o => o.key === repeat)!.label.toLowerCase()}` : ''}`, icon: 'send',
    note: hasWho ? `Puts it on the calendar and sends ${whoShort === 'everyone' ? 'everyone' : whoShort} an invite.` : 'Puts it on your calendar.',
    run: lockIn, busy: saving === 'invite',
  } : create;
  const secondary: Action | null = locked ? create
    : hasWho ? {
      label: `Ask ${whoShort}${within ? ` ·${within.replace(/^ on /, ' ')}` : ''}`, icon: 'hand-left-outline',
      note: `Sends the three best ${trip ? 'dates' : 'times'} for your calendars, and ${whoShort === 'everyone' ? 'everyone picks' : `${whoShort} picks`}.`,
      run: askWithTimes, busy: saving === 'keep',
    } : looseWhen ? {
      label: `Find a time${within}`, icon: 'search', note: 'Suggests times from your calendar. Nothing’s sent.',
      run: findFromCompose, busy: searching,
    } : null;
  const moreOptions = [
    ...(!locked ? [{ key: 'pick', label: 'See times first', icon: 'time-outline' as IconName, onSelect: findFromCompose }] : []),
    ...(hasWho ? [{ key: 'ask', label: `Ask ${whoShort} without times`, icon: 'chatbubbles-outline' as IconName, onSelect: handlePropose }] : []),
    { key: 'draft', label: 'Keep as a private draft', icon: 'create-outline' as IconName, onSelect: handleClose },
  ];

  // When's calendar opens on the days in question: the range said, the week
  // of a chosen day, or the next seven days.
  const calRange: [string, string] = when.day.kind === 'range' ? rangeDays(when.day.range, today)
    : date ? [addDays(date, -parseKey(date).getDay()), addDays(date, 6 - parseKey(date).getDay())]
    : [today, addDays(today, 6)];
  const setDay = (day: DayChoice) => { touch('when'); setWhen(w => ({ ...w, day })); setPickingDate(false); };
  const setTime = (time: TimeChoice) => { touch('when'); setWhen(w => ({ ...w, time })); setPickingTime(false); };
  const isDay = (k: string) => when.day.kind === 'date' && when.day.date === k;
  const isRange = (r: string) => when.day.kind === 'range' && when.day.range === r;
  const isPart = (pt: TimePart) => when.time.kind === 'part' && when.time.part === pt;
  const pickedDate = date && date !== today && date !== addDays(today, 1) ? date : null;
  type Chip = { key: string; label: string; checked?: boolean; icon?: IconName; onSelect: () => void };
  const whenSections: { title: string; items: Chip[] }[] = [
    {
      title: trip ? 'Starting' : 'Day',
      items: [
        { key: 'any', label: trip ? 'Any time soon' : 'Any day', checked: when.day.kind === 'any', onSelect: () => setDay({ kind: 'any' }) },
        ...(trip ? [] : [{ key: 'today', label: 'Today', checked: isDay(today), onSelect: () => setDay({ kind: 'date', date: today }) }]),
        { key: 'tomorrow', label: 'Tomorrow', checked: isDay(addDays(today, 1)), onSelect: () => setDay({ kind: 'date', date: addDays(today, 1) }) },
        ...(trip ? [] : [{ key: 'thisWeek', label: 'This week', checked: isRange('thisWeek'), onSelect: () => setDay({ kind: 'range', range: 'thisWeek' }) }]),
        { key: 'thisWeekend', label: 'This weekend', checked: isRange('thisWeekend'), onSelect: () => setDay({ kind: 'range', range: 'thisWeekend' }) },
        { key: 'nextWeek', label: 'Next week', checked: isRange('nextWeek'), onSelect: () => setDay({ kind: 'range', range: 'nextWeek' }) },
        ...(trip ? [{ key: 'nextWeekend', label: 'Next weekend', checked: isRange('nextWeekend'), onSelect: () => setDay({ kind: 'range', range: 'nextWeekend' }) }] : []),
        ...(pickedDate ? [{ key: 'picked', label: shortDate(pickedDate), checked: true, onSelect: () => {} }] : []),
      ],
    },
    trip ? {
      title: 'How long',
      items: [
        ...[2, 3, 4, 7].map(n => ({ key: `len${n}`, label: n === 7 ? 'A week' : `${n} days`, checked: spanOf(prefs) === n, onSelect: () => setPrefs(p => ({ ...p, spanDays: n })) })),
        { key: 'other', label: 'Other…', icon: 'create-outline' as IconName, onSelect: () => { setPickingDate(false); setSpanText(`${spanOf(prefs)} days`); setTypingLength(true); } },
      ],
    } : {
      title: 'Time',
      items: [
        { key: 'anyTime', label: 'Any time', checked: when.time.kind === 'any', onSelect: () => setTime({ kind: 'any' }) },
        { key: 'allDay', label: 'All day', checked: when.time.kind === 'allDay', onSelect: () => setTime({ kind: 'allDay' }) },
        ...(['morning', 'daytime', 'evening'] as TimePart[]).map(pt => ({ key: pt, label: PART_LABEL[pt], checked: isPart(pt), onSelect: () => setTime({ kind: 'part', part: pt }) })),
        ...(when.time.kind === 'exact' ? [{ key: 'exact', label: exactLabel(when.time), checked: true, onSelect: () => {} }] : []),
        { key: 'pickTime', label: 'Pick a time…', icon: 'time-outline' as IconName, onSelect: () => {
          setPickingDate(false);
          setTimeText(when.time.kind === 'exact' ? exactLabel(when.time) : '');
          setPickingTime(true);
        } },
      ],
    },
  ];
  const typedTime = parseClockRange(timeText);
  const typedSpan = parseSpan(spanText);

  const chevron = (open = false) => <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.secondaryLabel} />;
  const doneIcon = 'checkmark-circle' as IconName;
  // A small ×, on any row with something in it, to clear just that.
  const clear = (what: string, onPress: () => void) => (
    <Tappable onPress={onPress} accessibilityLabel={`Remove ${what}`} hitSlop={8} style={{ padding: space.hair, borderRadius: 999 }}>
      <Icon name="close-circle" size={18} color={c.secondaryLabel} />
    </Tappable>
  );
  const trailing = (...nodes: React.ReactNode[]) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>{nodes}</View>;
  const clearWho = () => { touch('who'); setSelectedGroupIds(new Set()); setSelectedUserIds(new Set()); setSelectedContactIds(new Set()); };
  const clearWhen = () => { touch('when'); setWhen(ANY_WHEN); setPickingDate(false); setPickingTime(false); setTypingLength(false); setSuggested(false); };

  const whoRow = (
    <ListRow
      key="who" icon={whoSet ? doneIcon : 'people-outline'} title="Who" value={whoValue} onPress={() => setShowWho(x => !x)}
      trailing={trailing(audienceNames.length ? <React.Fragment key="x">{clear('everyone', clearWho)}</React.Fragment> : null, <React.Fragment key="c">{chevron(showWho)}</React.Fragment>)}
    />
  );
  // When opens in place: quick ways in at the top (a calendar, or let Find a
  // Time pick), then the day and the time as chips, one after the other.
  const toggleWhen = () => {
    if (editingWhen) { setEditingWhen(false); setPickingDate(false); setPickingTime(false); setTypingLength(false); setSuggested(false); return; }
    setTypingPlace(false); setEditingWhen(true);
  };
  const pill = (it: Chip, tone: 'chip' | 'action' = 'chip') => (
    <Tappable
      key={it.key}
      onPress={it.onSelect}
      accessibilityLabel={it.label}
      accessibilityState={{ selected: !!it.checked }}
      feedback="opacity"
      style={{
        flexDirection: 'row', alignItems: 'center', gap: space.hair + 2,
        paddingHorizontal: space.m - 4, paddingVertical: space.hair + 3, borderRadius: 999,
        backgroundColor: it.checked ? c.tint : tone === 'action' ? c.tintSoft : c.background,
      }}
    >
      {it.icon ? <Icon name={it.icon} size={14} color={it.checked ? c.onTint : c.tint} /> : null}
      <Txt v="footnote" style={{ color: it.checked ? c.onTint : tone === 'action' ? c.tint : c.label }} semibold={it.checked || tone === 'action'}>{it.label}</Txt>
    </Tappable>
  );
  // Date and Time, side by side: each shows what's set and opens a short list.
  const dateValue = dayLabel(when.day) ?? (trip ? 'Any time soon' : 'Any day');
  const timeValue = trip ? (spanOf(prefs) === 7 ? 'A week' : `${spanOf(prefs)} days`)
    : when.time.kind === 'any' ? 'Any time' : when.time.kind === 'allDay' ? 'All day'
    : when.time.kind === 'part' ? PART_LABEL[when.time.part] : exactLabel(when.time);
  const calendarItem: Chip = {
    key: 'calendar', label: 'Pick on calendar…', icon: 'calendar-outline',
    onSelect: () => { setPickingTime(false); setTypingLength(false); setPickingDate(x => !x); },
  };
  // "Help me pick": suggestions that fit, from whatever's set so far.
  const helpMePick = () => {
    if (searching) return;
    if (suggested) { setSuggested(false); return; }
    setPickingDate(false); setPickingTime(false); findFromCompose();
  };
  const whenField = (label: string, value: string, items: Chip[]) => (
    <View style={{ flex: 1 }}>
      <Menu title={label} sections={[{ items: items.map(it => ({ key: it.key, label: it.label, checked: it.checked, icon: it.icon, onSelect: it.onSelect })) }]}>
        {open => (
          <Tappable
            onPress={open}
            feedback="opacity"
            accessibilityLabel={`${label}, ${value}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m, paddingVertical: space.s, borderRadius: 12, backgroundColor: c.background }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="caption" tone="secondary">{label}</Txt>
              <Txt v="headline" numberOfLines={1}>{value}</Txt>
            </View>
            <Icon name="chevron-down" size={18} color={c.secondaryLabel} />
          </Tappable>
        )}
      </Menu>
    </View>
  );
  const whenRow = (
    <React.Fragment key="when">
      <ListRow
        icon={whenSet ? doneIcon : 'calendar-outline'} title="When" value={whenValue} onPress={toggleWhen}
        trailing={trailing(whenLabel(when) ? <React.Fragment key="x">{clear('when', clearWhen)}</React.Fragment> : null, <React.Fragment key="c">{chevron(editingWhen)}</React.Fragment>)}
      />
      {editingWhen ? (
        <View style={{ paddingHorizontal: space.m, paddingBottom: space.s, gap: space.s }}>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            {whenField(trip ? 'Starts' : 'Date', dateValue, [...whenSections[0].items, calendarItem])}
            {whenField(trip ? 'How long' : 'Time', timeValue, whenSections[1].items)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.s }}>
            {pill({ ...calendarItem, label: 'Pick on calendar', checked: pickingDate }, 'action')}
            {pill({ key: 'help', label: searching ? 'Looking…' : 'Help me pick', icon: 'sparkles-outline', checked: suggested, onSelect: helpMePick }, 'action')}
            <View style={{ flex: 1 }} />
            <Button label="Done" variant="plain" onPress={toggleWhen} />
          </View>
          {pickingDate ? (
            <View style={{ marginHorizontal: -space.s }}>
              <WhenCalendar
                range={calRange}
                selected={date}
                today={today}
                onPick={(k) => setDay({ kind: 'date', date: k })}
                events={calView ? calEvents : null}
                onVisible={(f, t) => setCalWindow(w => (w[0] === f && w[1] === t ? w : [f, t]))}
                calView={calView}
                onCalView={setCalView}
              />
            </View>
          ) : null}
          {suggested ? (
            <View style={{ gap: space.s }}>
              <Txt v="footnote" tone="secondary">
                {slots.length ? 'These work for everyone’s calendars. Pick one to use it.' : 'Nothing fits. Try another day or time above.'}
              </Txt>
              {slots.length ? (
                <View style={{ backgroundColor: c.background, borderRadius: 12, overflow: 'hidden' }}>
                  {slots.map(sl => {
                    const rel = relativeDay(slotDay(sl));
                    const fit = participantIds.length && fitKnown(sl.fit) ? estimateLabel(sl.fit!) : '';
                    return (
                      <ListRow
                        key={sl.start}
                        icon="time-outline"
                        title={spanOf(prefs) > 1 ? slotTitle(sl) : rel ? `${rel} · ${shortDate(slotDay(sl))}` : shortDate(slotDay(sl))}
                        subtitle={slotTime(sl)}
                        detail={fit ? `Calendar fit: ${fit}` : null}
                        chevron
                        onPress={() => takeSuggestion(sl)}
                      />
                    );
                  })}
                </View>
              ) : null}
              {slots.length > 1 ? (
                <Button label={`Let ${audienceNames.length === 1 && selectedGroupIds.size === 0 ? audienceNames[0] : 'everyone'} vote on these`} icon="hand-left-outline" variant="plain" onPress={handleKeepProposed} loading={saving === 'keep'} disabled={!!saving} />
              ) : null}
            </View>
          ) : null}
      {pickingTime ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s }}>
          <View style={{ flex: 1 }}>
            <Field
              value={timeText}
              onChangeText={setTimeText}
              placeholder="7pm, or 7–9pm"
              autoFocus
              accessibilityLabel="Time"
              style={{ backgroundColor: c.background }}
              onSubmitEditing={() => typedTime && setTime({ kind: 'exact', ...typedTime })}
              hint={timeText.trim() && !typedTime ? 'Try a time like 7pm, or a start and end like 7–9pm.' : undefined}
            />
          </View>
          <Button label="Set" onPress={() => typedTime && setTime({ kind: 'exact', ...typedTime })} disabled={!typedTime} />
        </View>
      ) : null}
      {typingLength ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s }}>
          <View style={{ flex: 1 }}>
            <Field
              value={spanText}
              onChangeText={setSpanText}
              placeholder="10 days, 2 weeks"
              autoFocus
              accessibilityLabel="How many days"
              style={{ backgroundColor: c.background }}
              hint={spanText.trim() && !typedSpan ? `From 2 to ${MAX_SPAN_DAYS} days, like 10 or 2 weeks.` : undefined}
            />
          </View>
          <Button label="Set" onPress={() => { if (typedSpan) { setPrefs(p => ({ ...p, spanDays: typedSpan })); setTypingLength(false); } }} disabled={!typedSpan} />
        </View>
      ) : null}
        </View>
      ) : null}
    </React.Fragment>
  );
  // Place works like When: tap "Add where", type it, and pick a match (your
  // saved places first, then search) or a recent place to fill it in with its
  // address; then Save. Anything typed by hand saves as it is.
  const shownPlace = splitPlace(location);
  const openPlace = () => {
    if (typingPlace) { setTypingPlace(false); return; }
    const cur = location.trim() ? splitPlace(location) : null;
    setPlaceDraft(cur?.name ?? ''); setPlacePick(cur?.address ? cur : null);
    setShowRecent(false); setSavingAs(false); setSavedAs(null); setPlaceSession(newSession()); setEditingWhen(false);
    setTypingPlace(true);
  };
  const editDraft = (t: string) => { setPlaceDraft(t); setPlacePick(null); setSavingAs(false); setSavedAs(null); };
  const pickPlace = (pl: Place) => { setPlaceDraft(pl.name); setPlacePick(pl); setPlaceHits([]); setShowRecent(false); setSavedAs(null); };
  const pickHit = async (hit: PlaceHit) => {
    pickPlace({ name: hit.name, address: hit.address || null });
    const full = await placeDetails(hit, placeSession, isDemo);
    setPlacePick(cur => (cur && cur.name === hit.name ? full : cur));
    setPlaceDraft(d => (d === hit.name ? full.name : d));
  };
  const savePlace = () => {
    touch('place');
    setLocation(placePick ? placeText(placePick.name, placePick.address) : placeDraft.trim());
    setTypingPlace(false);
  };
  const saveAs = async () => {
    const label = saveLabel.trim();
    if (!label) return;
    const place = placePick ?? { name: placeDraft.trim(), address: null };
    if (!(await savedPlaces.add(label, place))) return notify('Couldn’t save that place', 'Try again in a moment.');
    setSavingAs(false); setSaveLabel(''); setSavedAs(label);
  };
  const q = placeDraft.trim().toLowerCase();
  const savedMatches = !placePick && q ? savedPlaces.saved.filter(sp => sp.label.toLowerCase().includes(q) || sp.place.toLowerCase().includes(q)) : [];
  // Saved under any name: the same address (or, typed by hand, the same words).
  const alreadySaved = !!savedAs || savedPlaces.saved.some(sp => {
    const pl = splitPlace(sp.place);
    return placePick?.address ? pl.address === placePick.address : pl.name.toLowerCase() === q || sp.label.toLowerCase() === q;
  });
  const placeRow = (
    <React.Fragment key="place">
      {location.trim() ? (
        <ListRow
          icon={placeSet ? doneIcon : 'location-outline'} title={shownPlace.name} subtitle={shownPlace.address} onPress={openPlace}
          trailing={trailing(<React.Fragment key="x">{clear('place', () => { touch('place'); setLocation(''); setTypingPlace(false); })}</React.Fragment>, <React.Fragment key="c">{chevron(typingPlace)}</React.Fragment>)}
        />
      ) : (
        <ListRow icon="location-outline" title="Place" value="Add where" onPress={openPlace} trailing={chevron(typingPlace)} />
      )}
      {typingPlace ? (
        <View style={{ padding: space.s, gap: space.s }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s }}>
            <View style={{ flex: 1 }}>
              <Field
                value={placeDraft}
                onChangeText={editDraft}
                placeholder="Search or type a place"
                autoFocus
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={savePlace}
                accessibilityLabel="Where"
                style={{ backgroundColor: c.background }}
                hint={placePick?.address ?? undefined}
              />
            </View>
            <Button label="Save" onPress={savePlace} disabled={!placeDraft.trim() && !location.trim()} />
          </View>

          {savedMatches.map(sp => {
            const pl = splitPlace(sp.place);
            return (
              <ListRow key={sp.id} icon="bookmark" title={sp.label} subtitle={pl.address ?? pl.name}
                onPress={() => pickPlace({ name: sp.label, address: pl.address ?? (pl.name !== sp.label ? pl.name : null) })} />
            );
          })}
          {placeHits.map(h => (
            <ListRow key={h.id} icon="location-outline" title={h.name} subtitle={h.address} onPress={() => pickHit(h)} />
          ))}

          {placeDraft.trim() && !alreadySaved ? (
            savingAs ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s }}>
                <View style={{ flex: 1 }}>
                  <Field
                    value={saveLabel}
                    onChangeText={setSaveLabel}
                    placeholder="Home, Work, Grandma’s…"
                    autoFocus
                    onSubmitEditing={saveAs}
                    accessibilityLabel="Save this place as"
                    style={{ backgroundColor: c.background }}
                  />
                </View>
                <Button label="Save place" variant="gray" onPress={saveAs} disabled={!saveLabel.trim()} />
              </View>
            ) : (
              <Tappable onPress={() => { setSaveLabel(''); setSavingAs(true); }} accessibilityLabel="Save this place as"
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.s, paddingVertical: space.hair, alignSelf: 'flex-start', borderRadius: 6 }}>
                <Icon name="bookmark-outline" size={16} color={c.tint} />
                <Txt v="footnote" tone="tint">Save as…</Txt>
              </Tappable>
            )
          ) : null}
          {savedAs ? <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.s }}>{`Saved as ${savedAs}.`}</Txt> : null}

          {places.length ? (
            <Tappable
              onPress={() => setShowRecent(x => !x)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: showRecent }}
              accessibilityLabel="Show recent"
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.s, paddingVertical: space.hair, alignSelf: 'flex-start', borderRadius: 6 }}
            >
              <Icon name={showRecent ? 'checkbox' : 'square-outline'} size={16} color={showRecent ? c.tint : c.secondaryLabel} />
              <Txt v="footnote" tone="secondary">Show recent</Txt>
            </Tappable>
          ) : null}
          {showRecent ? places.map(pl => {
            const sp = splitPlace(pl);
            return <ListRow key={pl} title={sp.name} subtitle={sp.address} checked={placeText(placePick?.name ?? placeDraft, placePick?.address) === pl} onPress={() => pickPlace(sp)} />;
          }) : null}
        </View>
      ) : null}
    </React.Fragment>
  );
  const summaryRows = [
    { key: 'who', set: whoSet, node: whoRow },
    { key: 'when', set: whenSet, node: whenRow },
    { key: 'place', set: placeSet, node: placeRow },
  ];



  return (
    <Sheet visible={visible} onClose={handleClose} title={sheetTitle} cancelLabel={step === 'compose' && !existing && (describe.trim() || title.trim()) ? 'Close' : 'Cancel'}>
      {step === 'compose' && (
        <>
          {/* Planning an idea that already exists: its title is decided, so no box to describe it again. */}
          {existing ? null : (
            <Field
              ref={describeInput}
              value={describe}
              onChangeText={onDescribe}
              placeholder={KINDS.find(k => k.key === kind)?.example ?? 'Dinner with Ana this week'}
              multiline
              autoFocus={!prefill?.title}
              blurOnSubmit
              accessibilityLabel="What do you want to do?"
              style={{ minHeight: started ? 56 : 88 }}
            />
          )}

          {!started ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, paddingHorizontal: space.m }}>
                {KINDS.map(k => {
                  const on = kind === k.key;
                  return (
                    <Tappable
                      key={k.key}
                      onPress={() => pickKind(on ? null : k.key)}
                      feedback="opacity"
                      accessibilityLabel={k.label}
                      accessibilityState={{ selected: on }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: space.hair + 2,
                        paddingHorizontal: space.m, paddingVertical: space.s, borderRadius: 999,
                        backgroundColor: on ? c.tintSoft : c.fill,
                      }}
                    >
                      <Icon name={k.icon} size={16} color={on ? c.tint : c.secondaryLabel} />
                      <Txt v="footnote" tone={on ? 'tint' : 'primary'} semibold={on}>{k.label}</Txt>
                    </Tappable>
                  );
                })}
              </View>
              <Button label="Fill it in yourself" variant="plain" onPress={() => { setFilling(true); setEditingTitle(true); }} />
            </>
          ) : null}

          {started ? (
          <>
          {editingTitle || (filling && !describe.trim() && !title.trim()) ? (
            <Field
              label="Title"
              value={title}
              onChangeText={t => { touch('title'); setTitle(t); }}
              placeholder="Dinner with Ana"
              autoFocus={editingTitle}
              onBlur={() => setEditingTitle(false)}
              onSubmitEditing={() => setEditingTitle(false)}
              accessibilityLabel="Title"
            />
          ) : (
            <Tappable
              onPress={() => setEditingTitle(true)}
              accessibilityLabel={`Title: ${title || describe.trim()}. Rename`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m }}
            >
              <Txt v="headline" style={{ flexShrink: 1 }} numberOfLines={1}>{title || describe.trim()}</Txt>
              <Icon name="pencil" size={14} color={c.secondaryLabel} />
            </Tappable>
          )}

          {[summaryRows.filter(r => r.set), summaryRows.filter(r => !r.set)].map((list, i) => list.length ? (
            <React.Fragment key={i}>
              <ListSection header={i === 1 ? 'Still to decide' : undefined} separatorInset={52}>
                {list.map(r => r.node)}
              </ListSection>
              {showWho && list.some(r => r.key === 'who') ? (
                loadingPeople ? <ActivityIndicator color={c.secondaryLabel} /> : (
                  <>
          {effectiveGroups.length > 0 && (
            <ListSection
              header="Groups"
              footer={selectedGroupIds.size === 0 ? 'Nothing picked — it’s just for you and anyone you add.' : undefined}
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

                  </>
                )
              ) : null}
            </React.Fragment>
          ) : null)}

          {showDetails ? (
            <>
              <ListSection header="More details" separatorInset={52}>
                <Menu
                  title="Repeat"
                  sections={[{ items: REPEAT_OPTIONS.map(o => ({ key: o.key, label: o.label, checked: repeat === o.key, onSelect: () => { touch('repeat'); setRepeat(o.key); } })) }]}
                >
                  {open => <ListRow icon="repeat" title="Repeat" value={REPEAT_OPTIONS.find(o => o.key === repeat)!.label} trailing={chevron()} onPress={open} />}
                </Menu>
              </ListSection>
              <Field label="Notes" value={description} onChangeText={setDescription} placeholder="Budget, reservations, what to bring…" multiline accessibilityLabel="Notes" />
            </>
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <Button label="More details" icon="add" variant="plain" onPress={() => setShowDetails(true)} />
            </View>
          )}

          <View style={{ gap: space.hair }}>
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button label={primary.label} icon={primary.icon} onPress={primary.run} loading={primary.busy} disabled={!!saving || searching} style={{ flex: 1 }} />
              {secondary ? (
                <Button label={secondary.label} icon={secondary.icon} variant="gray" onPress={secondary.run} loading={secondary.busy} disabled={!!saving || searching} style={{ flex: 1 }} />
              ) : null}
            </View>
            <Txt v="footnote" tone="secondary" align="center" style={{ paddingHorizontal: space.m, paddingTop: space.hair }}>{primary.note}</Txt>
            <Menu title="More options" sections={[{ items: moreOptions }]}>
              {open => <Button label="More options" variant="plain" onPress={open} disabled={!!saving || searching} />}
            </Menu>
          </View>
          </>
          ) : null}
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

          <View style={{ gap: space.s }}>
            <SectionHeader title="Duration" />
            <Segmented
              options={LENGTH_KIND}
              value={multi ? 'several' : 'one'}
              onChange={k => {
                const days = k === 'several' ? spanTyped ?? 3 : 1;
                setPrefs(p => ({ ...p, spanDays: days }));
                if (k === 'several' && !spanTyped) setSpanText('3 days');
              }}
            />
            {multi ? (
              <Field
                label="How many days"
                value={spanText}
                onChangeText={t => { setSpanText(t); const n = parseSpan(t); if (n) setPrefs(p => ({ ...p, spanDays: n })); }}
                placeholder="3 days, 10 days, 2 weeks"
                accessibilityLabel="How many days"
                hint={spanText && !spanTyped ? `Use a number of days from 2 to ${MAX_SPAN_DAYS}, like 10 or 2 weeks.` : 'A weekend, a week away, two weeks — type it in.'}
              />
            ) : (
              <ListSection footer="Optional. It matters for something like a recital, not for dinner.">
                <Menu
                  title="How long"
                  sections={[{ items: HOUR_OPTIONS.map(o => ({
                    key: String(o.value), label: o.label, checked: o.value === prefs.duration,
                    onSelect: () => setPrefs(p => ({ ...p, duration: o.value })),
                  })) }]}
                >
                  {open => (
                    <ListRow
                      icon="time-outline"
                      title="Hours"
                      value={HOUR_OPTIONS.find(o => o.value === prefs.duration)?.label ?? DURATION_LABEL(prefs.duration!)}
                      chevron
                      onPress={open}
                    />
                  )}
                </Menu>
              </ListSection>
            )}
          </View>

          {!multi ? (
            <View>
              <SectionHeader title="Time of day" />
              <Segmented options={PART_OPTIONS} value={prefs.partOfDay} onChange={k => setPrefs(p => ({ ...p, partOfDay: k }))} />
            </View>
          ) : null}

          {startDay ? (
            <ListSection footer={prefs.onlyDate ? 'Turn off to look at other days too.' : undefined}>
              <ListRow
                icon="calendar-outline"
                title={spanOf(prefs) > 1 ? `Starting ${shortDate(startDay)}` : `Only ${shortDate(startDay)}`}
                trailing={<Toggle label={spanOf(prefs) > 1 ? `Starting ${shortDate(startDay)}` : `Only ${shortDate(startDay)}`} value={!!prefs.onlyDate} onValueChange={v => setPrefs(p => ({ ...p, onlyDate: v ? startDay : null }))} />}
              />
            </ListSection>
          ) : null}

          {!prefs.onlyDate && (
            <>
              <View>
                <SectionHeader title="How soon" />
                <Segmented options={HORIZON_OPTIONS} value={prefs.horizon} onChange={k => setPrefs(p => ({ ...p, horizon: k, range: null }))} />
                {prefs.horizon === 'later' ? (
                  <ListSection>
                    <Menu
                      title="When"
                      sections={[
                        { items: [{ key: 'weeks', label: 'In a few weeks', checked: !prefs.month, onSelect: () => setPrefs(p => ({ ...p, month: null })) }] },
                        { title: 'A month', items: laterMonths().map(m => ({
                          key: m.key, label: m.label, checked: prefs.month === m.key,
                          onSelect: () => setPrefs(p => ({ ...p, month: m.key })),
                        })) },
                      ]}
                    >
                      {open => (
                        <ListRow
                          icon="calendar-outline"
                          title="When"
                          value={laterMonths().find(m => m.key === prefs.month)?.label ?? 'In a few weeks'}
                          chevron
                          onPress={open}
                        />
                      )}
                    </Menu>
                  </ListSection>
                ) : null}
              </View>
              <View>
                <SectionHeader title="Days" />
                <Segmented options={DAY_OPTIONS} value={prefs.days} onChange={k => setPrefs(p => ({ ...p, days: k }))} />
                {spanOf(prefs) > 1 && prefs.days === 'weekends' ? (
                  <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m, paddingTop: space.s }}>Each option takes in a whole Saturday and Sunday.</Txt>
                ) : null}
              </View>
            </>
          )}

          <View style={{ flexDirection: 'row', gap: space.s }}>
            {!existing && <Button label="Back" variant="gray" onPress={() => setStep('compose')} style={{ flex: 1 }} />}
            <Button label="Find Times" icon="search" onPress={() => handleFindTimes()} loading={searching} disabled={multi && !spanTyped} style={{ flex: 2 }} />
          </View>
        </>
      )}

      {step === 'options' && (
        <>
          <View style={{ gap: space.s, paddingHorizontal: space.m }}>
            <Txt v="title" accessibilityRole="header">{title}</Txt>
            <Txt v="callout" tone="secondary">
              {slots.length === 0
                ? 'Nothing fits in that range.'
                : participantIds.length
                  ? 'Suggested from calendars first, then preferences. Nobody has answered yet.'
                  : 'These are open on your calendar.'}
            </Txt>
            {slots.length > 0 && slots.length < MIN_OPTIONS ? (
              <Txt v="footnote" tone="secondary">
                Only {slots.length} {slots.length === 1 ? 'time fits' : 'times fit'} in that range. For more, {spanOf(prefs) > 1 ? 'try fewer days in a row, other days, or a later range.' : 'try another time of day, more days, or a later range.'}
              </Txt>
            ) : null}
          </View>

          {slots.length > 0 ? (
            <ListSection header="Date options">
              {slots.map((s, i) => {
                const rel = relativeDay(slotDay(s));
                const fit = participantIds.length && fitKnown(s.fit) ? estimateLabel(s.fit!) : '';
                const overlapsMine = myPlans.some(p => p.start < Date.parse(s.end) && p.end > Date.parse(s.start));
                const crossesWork = spanOf(prefs) > 1 && !!workConflict(work, s.start, s.end);
                return (
                  <ListRow
                    key={s.start}
                    icon="calendar-outline"
                    title={spanOf(prefs) > 1 ? slotTitle(s) : rel ? `${rel} · ${shortDate(slotDay(s))}` : shortDate(slotDay(s))}
                    subtitle={slotTime(s)}
                    detail={overlapsMine && crossesWork ? 'Overlaps some of your plans and work days'
                      : overlapsMine ? 'Overlaps some of your plans'
                      : crossesWork ? 'Takes in some of your work days'
                      : fit ? `Calendar fit: ${fit}` : null}
                    checked={chosen === i}
                    onPress={() => setChosen(i)}
                  />
                );
              })}
            </ListSection>
          ) : (
            <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>
              {spanOf(prefs) > 1 ? 'Try fewer days in a row, other days, or a later range.' : 'Try a different time of day, more days, or a later range.'}
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
