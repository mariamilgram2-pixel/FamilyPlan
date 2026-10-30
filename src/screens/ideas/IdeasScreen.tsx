// Plans: your own planning space, and where you plan with friends.
//
// Three tabs along the top, the steps a plan moves through, and it keeps
// whoever it's shared with all the way. What a plan needs decides where it
// sits, not a status someone has to set:
//   Ideas            a whiteboard: things you'd like to do someday, with
//                    notes and suggestions anyone on them can add. Jot one
//                    down and it's a private draft until you share it. What's
//                    moving (and what's in season) sits on top.
//   Finish planning  once someone starts planning it, even halfway: what's
//                    waiting on you first (dates to answer, an invite ready
//                    to send), then the rest. Vote on dates, or say you
//                    can't make it.
//   Coming up        booked, and what already happened
// Plans spans every group you're in, plus ideas shared with you by name and
// your own. The filter narrows it to a group, a person, or just you. Search
// finds any plan by a word in its title, place, notes, people, or what was
// said on it. Ideas and drafts can be hidden (a Hidden folder at the bottom
// of Ideas) or deleted, from the detail or by swiping a row left.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, SectionList, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { confirmAction, notify } from '../../lib/alert';
import { supabase } from '../../lib/supabase';
import {
  DEMO_COMMENTS, DEMO_CONTACTS, DEMO_EVENTS, DEMO_EXTRA_GROUPS, DEMO_HIDDEN, DEMO_IDEAS, DEMO_MEMBERS, DEMO_ME, DEMO_PEOPLE, isDemoGroup, removeDemoIdea, updateDemoIdea, upsertDemoIdea,
} from '../../lib/demo';
import { useShortcut } from '../../lib/shortcuts';
import { sendNotifications } from '../../lib/notifications';
import { Reply, awaitedVoters, dateVoters, replyOf, repliesByStatus, rsvpChangeNotice, rsvpNotice, tallySlots } from '../../lib/rsvp';
import { slotLabel } from '../../lib/planner';
import { Stage, awaitingYourDates, readyToSend, responders, responseOf, stageOf } from '../../lib/plans';
import { activityAt, isNew, sortIdeas } from '../../lib/whiteboard';
import { SearchField, SearchHit, searchIdea } from '../../lib/ideaSearch';
import { useIdeaSeen } from '../../lib/ideaSeen';
import { Contact, Event, Group, Idea, IdeaResponse, PlanComment, Profile, Rsvp, Season } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import { AvatarPerson } from '../../components/Avatar';
import { useVisibleGroups } from '../../components/GroupSwitcher';
import { usePlanComposer } from '../../components/PlanComposer';
import CommentThread from '../../components/CommentThread';
import {
  EmptyState, Icon, IconButton, ListRow, Menu, MenuSection, ReadingColumn,
  ScreenHeader, Sheet, SplitView, Tappable, Txt, useBottomClearance,
} from '../../components/ui';
import { continuous, eyebrow, radius, space, tabularNums, type, useLayout, useTheme } from '../../theme';
import SwipeRow, { SwipeAction } from '../../components/SwipeRow';
import { Sheep } from '../../components/Sheep';
import { Answers, IdeaDetail, IdeaRow, SharePill } from './IdeaViews';
import { PlanEntry } from './CreateIdeaScreen';
import ShareSheet, { ShareTarget } from './ShareSheet';
import NewIdeaSheet, { NewIdeaText } from './NewIdeaSheet';
import { keyOf, shortDate } from '../calendar/dates';

type AudienceFilter =
  | { kind: 'all' }
  | { kind: 'mine' }                   // just yours: no group, no one else
  | { kind: 'group'; id: string }
  | { kind: 'user'; id: string }
  | { kind: 'contact'; id: string };

type Bucket = 'draft' | 'needsYou' | Stage;
const BUCKETS: { key: Bucket; title: string }[] = [
  { key: 'draft', title: 'Drafts' },
  { key: 'needsYou', title: 'Waiting on you' },
  { key: 'dates', title: 'In progress' },
  { key: 'idea', title: 'Ideas' },
  { key: 'on', title: 'Coming up' },
  { key: 'happened', title: 'Happened' },
];
const HAPPENED_SHOWN = 5;

type TabKey = 'ideas' | 'finish' | 'coming';
const TABS: { key: TabKey; label: string; buckets: Bucket[] }[] = [
  { key: 'ideas', label: 'Ideas', buckets: ['draft', 'idea'] },
  { key: 'finish', label: 'Finish planning', buckets: ['needsYou', 'dates'] },
  { key: 'coming', label: 'Coming up', buckets: ['on', 'happened'] },
];
const tabOf = (b: Bucket) => TABS.find(t => t.buckets.includes(b))!.key;

/** Demo ideas follow their events the way the database does: moved or cancelled. */
function reconcileDemo(i: Idea): Idea {
  const ev = i.event_id ? DEMO_EVENTS.find(e => e.id === i.event_id) : null;
  if (!ev) return i;
  if (ev.cancelled_at) return { ...i, status: 'proposed', event_id: null, proposed_slots: [], planned_at: null };
  return { ...i, proposed_slots: [{ start: ev.start_time, end: ev.end_time }] };
}

export default function PlansScreen() {
  const { activeGroup, groups } = useGroup();
  const visibleGroups = useVisibleGroups();
  const { user, profile } = useAuth();
  const { c } = useTheme();
  const { compact, threeColumn } = useLayout();
  const bottomClearance = useBottomClearance();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const composer = usePlanComposer();
  const isDemo = isDemoGroup(activeGroup);
  const meId = user?.id ?? (isDemo ? DEMO_ME : null);
  const myName = (profile?.full_name ?? (isDemo ? DEMO_MEMBERS[0].full_name : null) ?? 'Someone').split(' ')[0];
  // Every group you're in. The demo has a few more than the switcher shows.
  const myGroups = useMemo(() => (isDemo
    ? [...visibleGroups, ...DEMO_EXTRA_GROUPS.filter(g => g.memberIds.includes(DEMO_ME)).map(g => g.group)]
    : visibleGroups), [isDemo, visibleGroups]);

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>({ kind: 'all' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAllHappened, setShowAllHappened] = useState(false);
  const [chosenTab, setChosenTab] = useState<TabKey | null>(null);   // null: not chosen yet
  const jumpTo = useRef<string | null>(null);                         // a plan to open once it's loaded
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState<Idea | null>(null);           // the Share sheet's idea
  const [writing, setWriting] = useState(false);                      // the New Idea sheet
  const [searchOpen, setSearchOpen] = useState(false);                // the search field, from the header
  const [query, setQuery] = useState('');                             // search
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set()); // hidden from your Plans
  const [showHidden, setShowHidden] = useState(false);                // the Hidden folder
  const [comments, setComments] = useState<Pick<PlanComment, 'idea_id' | 'user_id' | 'body'>[]>([]);   // for search
  const [swiped, setSwiped] = useState<string | null>(null);          // the row swiped open
  const [events, setEvents] = useState<Event[]>([]);                  // booked plans' invites, for Going / Maybe / Can't
  const { baseline, seen, markSeen } = useIdeaSeen(isDemo);

  const fetchAll = useCallback(async () => {
    if (!activeGroup) return;
    if (isDemo) {
      setIdeas(DEMO_IDEAS.map(reconcileDemo));
      setMembers(DEMO_PEOPLE);
      setContacts(DEMO_CONTACTS);
      setHiddenIds(new Set(DEMO_HIDDEN));
      setComments(DEMO_COMMENTS.filter(m => m.idea_id));
      setEvents(DEMO_EVENTS.map(e => ({ ...e })));
      setLoading(false);
      return;
    }
    setLoading(true);

    // Every idea you can see: RLS limits it to yours, your groups', and any
    // shared with you by name.
    const [{ data: ideasData, error }, memberResults, contactsRes, hiddenRes, commentsRes] = await Promise.all([
      supabase.from('ideas')
        .select('*, profiles(id, full_name, email), idea_votes(id, user_id)')
        .order('votes', { ascending: false }),
      groups.length === 0
        ? Promise.resolve([] as { members: Profile[] }[])
        : Promise.all(groups.map(g =>
            supabase.from('group_members').select('profiles(id, full_name, email, avatar_url)').eq('group_id', g.id)
              .then(({ data }) => ({ members: ((data ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[] })))),
      user
        ? supabase.from('contacts').select('*').eq('owner_id', user.id).order('name')
        : Promise.resolve({ data: [] as Contact[] } as any),
      supabase.from('hidden_ideas').select('idea_id'),
      // What people said on ideas, so search can find it.
      supabase.from('plan_comments').select('idea_id, user_id, body').not('idea_id', 'is', null),
    ]);
    if (error) notify('Couldn’t load plans', error.message);
    else setIdeas((ideasData as Idea[]) ?? []);
    const uniq = new Map<string, Profile>();
    memberResults.forEach(({ members: ms }) => ms.forEach(p => uniq.set(p.id, p)));
    setMembers(Array.from(uniq.values()));
    setContacts(((contactsRes?.data ?? []) as Contact[]));
    setHiddenIds(new Set(((hiddenRes.data ?? []) as { idea_id: string }[]).map(r => r.idea_id)));
    setComments((commentsRes.data ?? []) as Pick<PlanComment, 'idea_id' | 'user_id' | 'body'>[]);
    // Booked plans' invites: once it's on the calendar, answers are the invite's RSVPs.
    const eventIds = ((ideasData as Idea[]) ?? []).map(i => i.event_id).filter((id): id is string => !!id);
    if (eventIds.length) {
      const { data: evs } = await supabase.from('events').select('*').in('id', eventIds);
      setEvents((evs as Event[]) ?? []);
    } else setEvents([]);
    setLoading(false);
  }, [activeGroup, groups, user, isDemo]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));
  useEffect(() => { fetchAll(); }, [composer.version]);

  // Arriving from Home or the calendar with a plan to open.
  useEffect(() => {
    const id = route.params?.ideaId;
    if (!id) return;
    setSelectedId(id);
    jumpTo.current = id;
    navigation.setParams({ ideaId: undefined });
  }, [route.params?.ideaId]);

  const memberById = useMemo(() => new Map(members.map(p => [p.id, p])), [members]);
  const contactById = useMemo(() => new Map(contacts.map(ct => [ct.id, ct])), [contacts]);
  const groupById = useMemo(() => new Map<string, Group>(myGroups.map(g => [g.id, g])), [myGroups]);
  const personOf = (id: string): AvatarPerson => memberById.get(id) ?? { id };

  const ideaGroupIds = (idea: Idea) => Array.from(new Set<string>([...(idea.group_id ? [idea.group_id] : []), ...(idea.audience_group_ids ?? [])]));

  function resolveAudience(idea: Idea): AvatarPerson[] {
    const users = (idea.audience_user_ids ?? []).map(id => memberById.get(id)).filter(Boolean) as AvatarPerson[];
    const cts = (idea.audience_contact_ids ?? [])
      .map(id => contactById.get(id)).filter(Boolean)
      .map(ct => ({ id: ct!.id, full_name: ct!.name, email: ct!.email ?? undefined })) as AvatarPerson[];
    return [...users, ...cts];
  }

  /** "My Family", "Climbing crew +2", "Ana": who it's for, groups first. */
  function audienceSummary(idea: Idea): string | null {
    const names = [
      ...ideaGroupIds(idea).map(id => groupById.get(id)?.name).filter((n): n is string => !!n),
      ...resolveAudience(idea).map(p => p.full_name?.split(' ')[0] ?? 'someone'),
    ];
    if (names.length === 0) return null;
    return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
  }

  const hasVoted = (idea: Idea) => !!meId && (idea.idea_votes?.some(v => v.user_id === meId) ?? false);

  // ─── Actions ───────────────────────────────────────────────────────────────

  /**
   * Your answer, like an RSVP: In, Maybe, or Can't. Tapping the one you
   * already gave takes it back. Can't asks first, since it takes you out of
   * the planning; Maybe and Can't let whoever started it know.
   */
  async function respond(idea: Idea, choice: IdeaResponse) {
    if (!meId) return;
    if (stageOf(idea) === 'on') return answerInvite(idea, choice);
    const current = responseOf(idea, meId);
    const next = current === choice ? null : choice;
    if (next === 'cant' && !(await confirmAction(`Can’t make ${idea.title}?`, 'You’ll be removed from planning.', 'Can’t Make It', 'Never Mind'))) return;
    if (isDemo) {
      const without = (ids: string[] | undefined) => (ids ?? []).filter(id => id !== meId);
      const votes = (idea.idea_votes ?? []).filter(v => v.user_id !== meId);
      if (next === 'in') votes.push({ id: `${idea.id}-me`, idea_id: idea.id, user_id: meId, created_at: '' });
      const { [meId]: _, ...otherSlotVotes } = idea.slot_votes ?? {};
      updateDemoIdea(idea.id, {
        idea_votes: votes, votes: votes.length,
        tentative_user_ids: next === 'maybe' ? [...without(idea.tentative_user_ids), meId] : without(idea.tentative_user_ids),
        declined_user_ids: next === 'cant' ? [...without(idea.declined_user_ids), meId] : without(idea.declined_user_ids),
        ...(next === 'cant' ? { slot_votes: otherSlotVotes } : {}),
      });
    } else {
      const { error } = await supabase.rpc('set_idea_response', { p_idea: idea.id, p_response: next ?? 'none' });
      if (error) return notify('Couldn’t save', error.message);
    }
    if ((next === 'maybe' || next === 'cant') && idea.created_by && idea.created_by !== meId) {
      await sendNotifications([{
        user_id: idea.created_by, actor_id: meId, kind: 'date_votes', idea_id: idea.id, event_id: null,
        title: next === 'maybe' ? `${myName} might make ${idea.title}` : `${myName} can’t make ${idea.title}`,
        body: next === 'maybe' ? 'Keep planning without waiting on them. They’ll still get the invite.' : 'They’re out of the planning.',
      }], isDemo);
    }
    setChosenTab(tab);   // stay put, even if nothing's waiting on you now
    fetchAll();
  }

  /** Once it's booked, In / Maybe / Can't are the invite's Going / Maybe / Can't go. */
  async function answerInvite(idea: Idea, choice: IdeaResponse) {
    const event = idea.event_id ? eventById.get(idea.event_id) : null;
    if (!event || !meId) return;
    const reply: Rsvp = choice === 'in' ? 'going' : choice === 'maybe' ? 'maybe' : 'declined';
    const before = replyOf(event, meId);
    if (before === reply) return;
    if (isDemo) {
      const base = DEMO_EVENTS.find(e => e.id === event.id);
      if (base) base.rsvps = { ...base.rsvps, [meId]: reply };
      return fetchAll();
    }
    const { error } = await supabase.rpc('set_rsvp', { p_event: event.id, p_status: reply, p_note: null } as any);
    if (error) return notify('Couldn’t update your RSVP', error.message);
    if (event.created_by && event.created_by !== meId) {
      const changed = !!before && before !== 'pending';
      await sendNotifications([{
        user_id: event.created_by, actor_id: meId, kind: 'rsvp', idea_id: null, event_id: event.id,
        title: (changed ? rsvpChangeNotice : rsvpNotice)(myName, reply, event.title), body: null,
      }], false);
    }
    fetchAll();
  }

  // "These dates work for me." Replaces only your own answer.
  async function handleSlotVotes(idea: Idea, starts: string[]) {
    if (!meId) return;
    const next = { ...(idea.slot_votes ?? {}), [meId]: starts };
    if (isDemo) { updateDemoIdea(idea.id, { slot_votes: next }); return fetchAll(); }
    const { error } = await supabase.rpc('set_slot_votes', { p_idea: idea.id, p_starts: starts } as any);
    if (error) return notify('Couldn’t save', error.message);
    // Last answer in: tell whoever proposed it which date wins.
    const updated = { ...idea, slot_votes: next };
    const everyone = awaitedVoters(updated);
    const wasWaiting = awaitedVoters(idea).some(id => !idea.slot_votes?.[id]);
    if (wasWaiting && everyone.every(id => next[id]) && idea.created_by && idea.created_by !== meId) {
      const top = tallySlots(updated, idea.proposed_slots ?? []).sort((a, b) => b.yes.length - a.yes.length)[0];
      await sendNotifications([{
        user_id: idea.created_by, actor_id: meId, kind: 'date_votes', idea_id: idea.id, event_id: null,
        title: `Everyone answered on ${idea.title}`,
        body: top?.yes.length === everyone.length ? `${slotLabel(top.slot)} works for everyone` : `${myName} was the last to answer`,
      }], false);
    }
    fetchAll();
  }

  async function handleDrop(idea: Idea) {
    const draft = idea.status === 'draft';
    const body = draft ? 'It’s gone for good. To keep it out of the way instead, hide it.'
      : 'It comes off everyone’s Plans. Votes, notes, and suggestions on it go too. To keep it out of the way instead, hide it.';
    if (!(await confirmAction(`Delete ${idea.title}?`, body, 'Delete', 'Keep It'))) return;
    if (isDemo) { removeDemoIdea(idea.id); setSelectedId(null); return fetchAll(); }
    const { error } = await supabase.from('ideas').delete().eq('id', idea.id);
    if (error) return notify('Couldn’t delete it', error.message);
    setSelectedId(null);
    fetchAll();
  }

  // ─── Whiteboard ────────────────────────────────────────────────────────────

  /**
   * Save a new idea as a draft. Just yours, or with the people and groups
   * added, who see it in their Ideas and can add notes. People named hear about it.
   */
  async function addIdea({ title, notes }: NewIdeaText, { groupIds, userIds }: ShareTarget, planning = false): Promise<Idea | null> {
    if (!meId) return null;
    const shared = groupIds.length > 0 || userIds.length > 0;
    const row = {
      title, description: notes, status: shared ? 'proposed' as const : 'draft' as const, created_by: meId,
      group_id: groupIds[0] ?? null, audience_group_ids: groupIds.slice(1), audience_user_ids: userIds, audience_contact_ids: [],
      location: null, target_date: null, proposed_slots: [], event_id: null, planned_at: null,
      planning_started_at: planning ? new Date().toISOString() : null,
    };
    let idea: Idea;
    if (isDemo) {
      const me = DEMO_MEMBERS[0];
      const now = new Date().toISOString();
      idea = {
        ...row, id: `i-${Date.now()}`, votes: 0, idea_votes: [], created_at: now, last_activity_at: now, last_activity_by: meId,
        profiles: { id: me.id, full_name: me.full_name, email: me.email },
      };
      upsertDemoIdea(idea);
    } else {
      const { data, error } = await supabase.from('ideas').insert(row as any).select('*').single();
      if (error) { notify('Couldn’t save', error.message); return null; }
      idea = data as Idea;
    }
    if (userIds.length) {
      await sendNotifications(userIds.filter(u => u !== meId).map(uid => ({
        user_id: uid, actor_id: meId, kind: 'idea_proposed' as const, idea_id: idea.id, event_id: null,
        title: `${myName} added you to ${title}`, body: notes,
      })), isDemo);
    }
    fetchAll();
    return idea;
  }

  /** Hide it from your own Plans (it waits in Hidden), or bring it back. Everyone else still sees it. */
  async function toggleHidden(idea: Idea) {
    if (!meId) return;
    const hide = !hiddenIds.has(idea.id);
    const apply = (on: boolean) => setHiddenIds(prev => {
      const next = new Set(prev);
      if (on) next.add(idea.id); else next.delete(idea.id);
      return next;
    });
    apply(hide);
    if (isDemo) { if (hide) DEMO_HIDDEN.add(idea.id); else DEMO_HIDDEN.delete(idea.id); return; }
    const { error } = hide
      ? await supabase.from('hidden_ideas').insert({ user_id: meId, idea_id: idea.id })
      : await supabase.from('hidden_ideas').delete().eq('user_id', meId).eq('idea_id', idea.id);
    if (error) { apply(!hide); notify('Couldn’t save', error.message); }
  }

  /** From the New Idea sheet into New Plan, with what's written and who's added. */
  // Saved first, in Finish planning, so leaving New Plan halfway doesn't lose it.
  async function startPlanningNew(text: NewIdeaText, target: ShareTarget) {
    const idea = await addIdea(text, target, true);
    if (!idea) return;
    setWriting(false);
    setChosenTab('finish');
    setTimeout(() => composer.planIdea({ idea, step: 'compose' }), 450);
  }

  /** Into New Plan for an idea. From here it's in Finish planning until it's booked. */
  async function startPlanning(idea: Idea) {
    let planned = idea;
    if (!idea.planning_started_at) {
      const at = new Date().toISOString();
      if (!(await updateIdea(idea, { planning_started_at: at }))) return;
      planned = { ...idea, planning_started_at: at };
      setChosenTab('finish');
    }
    openPlanner(planned, 'compose');
  }

  /** Notes, season, sharing. The server stamps who touched it and when; the demo does it here. */
  async function updateIdea(idea: Idea, patch: Partial<Idea>): Promise<boolean> {
    if (isDemo) {
      const now = new Date().toISOString();
      const notes = 'description' in patch;
      const shared = idea.status === 'draft' && patch.status === 'proposed';
      updateDemoIdea(idea.id, {
        ...patch,
        ...(notes ? { notes_edited_by: meId, notes_edited_at: now } : {}),
        ...(notes || shared ? { last_activity_at: now, last_activity_by: meId } : {}),
      });
      fetchAll();
      return true;
    }
    const { error } = await supabase.from('ideas').update(patch as any).eq('id', idea.id);
    if (error) { notify('Couldn’t save', error.message); return false; }
    fetchAll();
    return true;
  }

  /**
   * Share with the people and groups picked. The first group becomes its
   * home; the rest are tagged in. People named hear about it; groups see it
   * marked new in their Ideas.
   */
  async function shareIdea(idea: Idea, { groupIds, userIds }: ShareTarget) {
    const before = new Set(idea.audience_user_ids ?? []);
    const ok = await updateIdea(idea, {
      status: idea.status === 'draft' ? 'proposed' : idea.status,
      group_id: groupIds[0] ?? null,
      audience_group_ids: groupIds.slice(1),
      audience_user_ids: userIds,
    });
    if (!ok) return;
    setSharing(null);
    const added = userIds.filter(id => !before.has(id) && id !== meId);
    if (added.length) {
      await sendNotifications(added.map(uid => ({
        user_id: uid, actor_id: meId, kind: 'idea_proposed' as const, idea_id: idea.id, event_id: null,
        title: `${myName} shared ${idea.title}`, body: idea.description,
      })), isDemo);
    }
    const names = [
      ...groupIds.map(id => groupById.get(id)?.name ?? 'a group'),
      ...userIds.map(id => memberById.get(id)?.full_name?.split(' ')[0] ?? 'someone'),
    ];
    const who = names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    notify('Shared', `${who} can see it now and add notes and suggestions.`);
  }

  const freshLabel = (idea: Idea) => {
    if (!isNew(idea, seen[idea.id], baseline, meId)) return null;
    const by = idea.last_activity_by ? memberById.get(idea.last_activity_by)?.full_name?.split(' ')[0] : null;
    return by ? `New from ${by}` : 'New activity';
  };

  function openPlanner(idea: Idea, step: PlanEntry['step'], slot?: Idea['proposed_slots'][number]) {
    if (!threeColumn) setSelectedId(null);
    setTimeout(() => composer.planIdea({ idea, step, slot }), threeColumn ? 0 : 450);
  }

  function openEvent(idea: Idea) {
    const booked = idea.proposed_slots?.[0];
    navigation.navigate('Calendar', { eventId: idea.event_id ?? undefined, date: booked ? keyOf(booked.start) : undefined });
  }

  // After it happened. On phones the plan is a sheet; close it first.
  const afterDetail = (fn: () => void) => {
    if (!threeColumn) setSelectedId(null);
    setTimeout(fn, threeColumn ? 0 : 450);
  };
  const peopleOn = (idea: Idea) => Array.from(new Set([...(idea.audience_user_ids ?? []), ...(idea.idea_votes ?? []).map(v => v.user_id)]))
    .filter(id => id !== meId);
  const doAgain = (idea: Idea) => afterDetail(() =>
    composer.newPlan({ title: idea.title, location: idea.location ?? undefined, notes: idea.description ?? undefined, people: peopleOn(idea) }));
  const samePeople = (idea: Idea) => afterDetail(() => composer.newPlan({ people: peopleOn(idea) }));
  const addMemories = (idea: Idea) => {
    const booked = idea.proposed_slots?.[0];
    if (!idea.event_id) return;
    afterDetail(() => composer.addMemories({
      eventId: idea.event_id!,
      title: idea.title,
      when: booked ? shortDate(keyOf(booked.start)) : 'Recently',
      recipients: [...peopleOn(idea), ...(meId ? [meId] : [])],
    }));
  };

  // ─── Sections ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = ideas;
    if (audienceFilter.kind === 'mine') list = list.filter(i => !ideaGroupIds(i).length && !(i.audience_user_ids ?? []).length);
    else if (audienceFilter.kind === 'group') list = list.filter(i => ideaGroupIds(i).includes(audienceFilter.id));
    else if (audienceFilter.kind === 'user') list = list.filter(i => i.audience_user_ids?.includes(audienceFilter.id));
    else if (audienceFilter.kind === 'contact') list = list.filter(i => i.audience_contact_ids?.includes(audienceFilter.id));
    return list;
  }, [ideas, audienceFilter, groupById]);

  const bucketOf = (i: Idea): Bucket | null =>
    i.status === 'draft' ? (i.created_by !== meId ? null : i.planning_started_at ? 'dates' : 'draft')
    : awaitingYourDates(i, meId) || readyToSend(i, meId) ? 'needsYou'
    : stageOf(i);

  // Hidden only applies on the whiteboard: once someone picks dates, it's back.
  const whiteboardBucket = (b: Bucket | null) => b === 'draft' || b === 'idea';
  const by = useMemo(() => {
    const out: Record<Bucket, Idea[]> = { draft: [], needsYou: [], dates: [], idea: [], on: [], happened: [] };
    filtered.forEach(i => { const b = bucketOf(i); if (b && !(whiteboardBucket(b) && hiddenIds.has(i.id))) out[b].push(i); });
    const when = (i: Idea) => i.proposed_slots?.[0]?.start ?? '';
    out.idea = sortIdeas(out.idea);
    out.draft = sortIdeas(out.draft);
    out.on.sort((a, b) => when(a).localeCompare(when(b)));
    out.happened.sort((a, b) => when(b).localeCompare(when(a)));
    return out;
  }, [filtered, meId, hiddenIds]);

  const hiddenList = useMemo(() =>
    sortIdeas(filtered.filter(i => hiddenIds.has(i.id) && whiteboardBucket(bucketOf(i)))), [filtered, hiddenIds, meId]);

  // ─── Search ────────────────────────────────────────────────────────────────

  const commentsByIdea = useMemo(() => {
    const out = new Map<string, typeof comments>();
    comments.forEach(m => { if (m.idea_id && m.body) out.set(m.idea_id, [...(out.get(m.idea_id) ?? []), m]); });
    return out;
  }, [comments]);

  /** Everything a search can match on a plan, in the order results prefer. */
  function searchFields(idea: Idea): SearchField[] {
    const fullName = (id: string) => memberById.get(id)?.full_name ?? null;
    const first = (id: string) => (id === meId ? 'You' : fullName(id)?.split(' ')[0] ?? 'Someone');
    const people = Array.from(new Set([
      ...(idea.audience_user_ids ?? []).map(fullName),
      ...(idea.idea_votes ?? []).map(v => fullName(v.user_id)),
      ...(idea.audience_contact_ids ?? []).map(id => contactById.get(id)?.name ?? null),
    ].filter((n): n is string => !!n)));
    const groupNames = ideaGroupIds(idea).map(id => groupById.get(id)?.name).filter((n): n is string => !!n);
    const fields: (SearchField | null)[] = [
      { label: null, text: idea.title },
      idea.location ? { label: 'Place', text: idea.location } : null,
      idea.description ? { label: 'Notes', text: idea.description } : null,
      people.length ? { label: 'With', text: people.join(', ') } : null,
      groupNames.length ? { label: 'For', text: groupNames.join(', ') } : null,
      idea.profiles?.full_name ? { label: 'By', text: idea.profiles.full_name } : null,
      ...(commentsByIdea.get(idea.id) ?? []).map(m => ({ label: first(m.user_id), text: m.body })),
    ];
    return fields.filter((f): f is SearchField => !!f);
  }

  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    if (!searching) return [] as { idea: Idea; hit: SearchHit }[];
    return filtered
      .filter(i => bucketOf(i))
      .map(i => ({ idea: i, hit: searchIdea(searchFields(i), query) }))
      .filter((r): r is { idea: Idea; hit: SearchHit } => !!r.hit)
      // Title matches first, then what's most recent.
      .sort((a, b) => Number(a.hit.field.label !== null) - Number(b.hit.field.label !== null) || activityAt(b.idea).localeCompare(activityAt(a.idea)));
  }, [searching, query, filtered, memberById, groupById, contactById, commentsByIdea, meId]);
  const hitById = useMemo(() => new Map(results.map(r => [r.idea.id, r.hit])), [results]);

  // Until you pick a tab: Finish planning when something's waiting on you, else Ideas.
  const tab: TabKey = chosenTab ?? (by.needsYou.length ? 'finish' : 'ideas');
  const tabCount = (t: TabKey) => TABS.find(x => x.key === t)!.buckets.reduce((n, b) => n + by[b].length, 0);

  // Arriving with a plan to open: show the tab it's in.
  useEffect(() => {
    const id = jumpTo.current;
    const idea = id ? ideas.find(i => i.id === id) : null;
    const b = idea ? bucketOf(idea) : null;
    if (!b) return;
    jumpTo.current = null;
    setChosenTab(tabOf(b));
  }, [ideas]);

  // A tab's own groups; or, while searching, the results; or the Hidden folder.
  type Section = { key: Bucket | 'results' | 'hidden'; title: string; total: number; data: Idea[] };
  const sections = useMemo((): Section[] => {
    if (searching) return results.length ? [{ key: 'results', title: 'Results', total: results.length, data: results.map(r => r.idea) }] : [];
    if (showHidden) return hiddenList.length ? [{ key: 'hidden', title: 'Hidden', total: hiddenList.length, data: hiddenList }] : [];
    const current = TABS.find(t => t.key === tab)!;
    return BUCKETS
      .filter(b => current.buckets.includes(b.key))
      .map(b => ({ key: b.key, title: b.title, total: by[b.key].length, data: b.key === 'happened' && !showAllHappened ? by[b.key].slice(0, HAPPENED_SHOWN) : by[b.key] }))
      .filter(s => s.data.length > 0);
  }, [by, tab, showAllHappened, searching, results, showHidden, hiddenList]);

  // The Hidden folder closes when it empties.
  useEffect(() => { if (showHidden && !hiddenList.length) setShowHidden(false); }, [showHidden, hiddenList.length]);

  /** Swipe left on an idea or draft: Hide (or Unhide), and Delete if it's yours. */
  const swipeActions = (idea: Idea): SwipeAction[] => {
    if (!whiteboardBucket(bucketOf(idea))) return [];
    const hidden = hiddenIds.has(idea.id);
    return [
      { key: 'hide', label: hidden ? 'Unhide' : 'Hide', icon: hidden ? 'eye-outline' : 'eye-off-outline', onPress: () => toggleHidden(idea) },
      ...(idea.created_by === meId ? [{ key: 'delete', label: 'Delete', icon: 'trash-outline' as const, destructive: true, onPress: () => handleDrop(idea) }] : []),
    ];
  };

  const flat = useMemo(() => sections.flatMap(s => s.data), [sections]);

  // Detail column: keep something selected when there's room to show it.
  // (Only on leaving that layout does compact drop the selection; clearing it
  // on every list change would close the open sheet after a vote.)
  // Skips the first render, so arriving with a plan to open still opens it.
  const layoutSeen = useRef(false);
  useEffect(() => {
    if (!layoutSeen.current) { layoutSeen.current = true; return; }
    if (!threeColumn) setSelectedId(null);
  }, [threeColumn]);
  useEffect(() => {
    if (threeColumn && !flat.some(i => i.id === selectedId)) setSelectedId(flat[0]?.id ?? null);
  }, [flat, threeColumn]);

  useShortcut('n', () => setWriting(true));
  useShortcut('f', () => setSearchOpen(true));

  const selected = ideas.find(i => i.id === selectedId) ?? null;

  // Opening an idea catches you up on it.
  useEffect(() => { if (selectedId) markSeen(selectedId); }, [selectedId, selected?.last_activity_at]);

  // ─── Filter menu ───────────────────────────────────────────────────────────
  const isActive = (f: AudienceFilter) =>
    f.kind === audienceFilter.kind && (f.kind === 'all' || (audienceFilter as any).id === (f as any).id);

  const filterSections: MenuSection[] = [
    { items: [
      { key: 'all', label: 'Everything', checked: audienceFilter.kind === 'all', onSelect: () => setAudienceFilter({ kind: 'all' }) },
      { key: 'mine', label: 'Just me', checked: audienceFilter.kind === 'mine', onSelect: () => setAudienceFilter({ kind: 'mine' }) },
    ] },
    {
      title: 'Groups',
      items: myGroups.map(g => ({
        key: `g-${g.id}`, label: g.name, checked: isActive({ kind: 'group', id: g.id }),
        onSelect: () => setAudienceFilter({ kind: 'group', id: g.id }),
      })),
    },
    {
      title: 'People',
      items: [
        ...members.filter(m => m.id !== meId).map(m => ({
          key: `u-${m.id}`, label: m.full_name ?? m.email, checked: isActive({ kind: 'user', id: m.id }),
          onSelect: () => setAudienceFilter({ kind: 'user', id: m.id }),
        })),
        ...contacts.map(ct => ({
          key: `c-${ct.id}`, label: ct.name, checked: isActive({ kind: 'contact', id: ct.id }),
          onSelect: () => setAudienceFilter({ kind: 'contact', id: ct.id }),
        })),
      ],
    },
  ];

  const audienceLabel =
    audienceFilter.kind === 'mine' ? 'just you' :
    audienceFilter.kind === 'group' ? groupById.get(audienceFilter.id)?.name :
    audienceFilter.kind === 'user' ? (memberById.get(audienceFilter.id)?.full_name ?? 'someone') :
    audienceFilter.kind === 'contact' ? contactById.get(audienceFilter.id)?.name : null;

  // ─── Layout ────────────────────────────────────────────────────────────────
  const list = (
    <SectionList
      sections={sections}
      keyExtractor={i => i.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: bottomClearance }}
      ItemSeparatorComponent={() => <View style={{ height: space.s }} />}
      ListHeaderComponent={
        <View style={{ paddingBottom: space.s }}>
          <ScreenHeader
            title="Plans"
            eyebrow={audienceFilter.kind === 'all' ? 'All groups' : undefined}
            trailing={
              <>
                <IconButton
                  icon="search"
                  label="Search ideas and plans"
                  variant="gray"
                  onPress={() => { setSearchOpen(true); setSwiped(null); }}
                />
                <Menu sections={filterSections} title="Show plans for">
                  {(open) => (
                    <IconButton
                      icon={audienceFilter.kind === 'all' ? 'filter-circle-outline' : 'filter-circle'}
                      label="Filter by group or person"
                      variant="gray"
                      onPress={open}
                    />
                  )}
                </Menu>
                <IconButton icon="add" label="New idea" variant="filled" onPress={() => setWriting(true)} />
              </>
            }
          />
          {searchOpen ? (
            <SearchBar
              value={query}
              onChange={(q) => { setQuery(q); setSwiped(null); }}
              onCancel={() => { setQuery(''); setSearchOpen(false); }}
            />
          ) : null}
          {audienceLabel ? (
            <View style={{ marginHorizontal: compact ? space.m : space.l, marginTop: space.s, backgroundColor: c.fill, borderRadius: 12, overflow: 'hidden' }}>
              <ListRow
                icon="filter"
                title={`For ${audienceLabel}`}
                trailing={<IconButton icon="close-circle" label="Clear filter" onPress={() => setAudienceFilter({ kind: 'all' })} />}
              />
            </View>
          ) : null}
          {searching ? null : showHidden ? (
            <View style={{ marginHorizontal: compact ? space.m : space.l, marginTop: space.s, backgroundColor: c.fill, borderRadius: 12, overflow: 'hidden' }}>
              <ListRow icon="chevron-back" title="Back to Ideas" tintTitle onPress={() => setShowHidden(false)} />
            </View>
          ) : (
            <>
              <PlanTabs tab={tab} count={tabCount} waiting={by.needsYou.length > 0} onChange={(t) => { setChosenTab(t); setSelectedId(null); setSwiped(null); }} />
            </>
          )}
        </View>
      }
      renderSectionHeader={({ section }) => (
        sections.length > 1 || section.key === 'draft' || section.key === 'idea' || section.key === 'results' || section.key === 'hidden' ? (
          <View style={{ paddingHorizontal: space.m, paddingTop: space.l, paddingBottom: space.s }}>
            <Txt v="footnote" tone="secondary" accessibilityRole="header" style={eyebrow}>{`${section.title} · ${section.total}`}</Txt>
          </View>
        ) : <View style={{ height: space.s }} />
      )}
      renderItem={({ item }) => (
        <SwipeRow actions={swipeActions(item)} open={swiped === item.id} onOpenChange={(o) => setSwiped(o ? item.id : null)}>
          {(guard) => <IdeaRow
            idea={item}
            voted={hasVoted(item)}
            meId={meId}
            audienceSummary={audienceSummary(item)}
            selected={threeColumn && item.id === selectedId}
            fresh={freshLabel(item)}
            share={item.status === 'draft' ? <SharePill onPress={guard(() => setSharing(item))} /> : null}
            hit={hitById.get(item.id) ?? null}
            onVote={guard(() => respond(item, 'in'))}
            onPress={guard(() => { setSwiped(null); setSelectedId(item.id); })}
          />}
        </SwipeRow>
      )}
      renderSectionFooter={({ section }) => section.key === 'happened' && section.total > HAPPENED_SHOWN ? (
        <ListRow title={showAllHappened ? 'Show fewer' : `Show all ${section.total}`} tintTitle onPress={() => setShowAllHappened(x => !x)} />
      ) : section.key === 'hidden' ? (
        <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m, paddingTop: space.m }}>
          Only hidden for you. Swipe left to unhide or delete.
        </Txt>
      ) : null}
      ListFooterComponent={
        // The Hidden folder, at the bottom of Ideas.
        !searching && !showHidden && tab === 'ideas' && hiddenList.length ? (
          <View style={{ marginHorizontal: compact ? space.m : space.l, marginTop: space.l, backgroundColor: c.fill, borderRadius: 12, overflow: 'hidden' }}>
            <ListRow icon="eye-off-outline" title="Hidden" value={String(hiddenList.length)} chevron onPress={() => { setShowHidden(true); setSwiped(null); }} />
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        loading ? <ActivityIndicator style={{ marginTop: space.xl }} color={c.secondaryLabel} /> : searching ? (
          <EmptyState icon="search" title={`No results for “${query.trim()}”`} body="Try a name, a place, or a word from the notes." />
        ) : showHidden ? undefined : tabCount(tab) > 0 ? undefined : (
          <EmptyState
            icon="bulb-outline"
            illustration={<Sheep size={72} pose="graze" style={{ marginBottom: space.s }} />}
            title={audienceLabel ? `Nothing here for ${audienceLabel}` : EMPTY[tab].title}
            body={audienceLabel ? 'Try someone else, or clear the filter.' : EMPTY[tab].body}
          />
        )
      }
    />
  );

  const eventById = useMemo(() => new Map(events.map(e => [e.id, e])), [events]);

  /**
   * In / Maybe / Can't through every stage: on the idea itself while it's an
   * idea or being planned, then on the invite once it's booked.
   */
  function answersFor(idea: Idea): Answers | null {
    if (idea.status === 'draft' || !meId) return null;
    const stage = stageOf(idea);
    if (stage === 'idea' || stage === 'dates') {
      const r = responders(idea);
      return {
        responders: { in: r.in.map(personOf), maybe: r.maybe.map(personOf), cant: r.cant.map(personOf) },
        response: responseOf(idea, meId), organizer: idea.created_by === meId,
        canUndo: true, kind: stage === 'idea' ? 'idea' : 'planning',
      };
    }
    const event = stage === 'on' && idea.event_id ? eventById.get(idea.event_id) : null;
    const mine = event ? replyOf(event, meId) : null;
    if (!event || !mine) return null;   // not invited
    const by = repliesByStatus(event);
    const asAnswer: Record<Reply, IdeaResponse | null> = { going: 'in', maybe: 'maybe', declined: 'cant', pending: null };
    return {
      responders: { in: by.going.map(personOf), maybe: by.maybe.map(personOf), cant: by.declined.map(personOf) },
      response: asAnswer[mine], organizer: event.created_by === meId, canUndo: false, kind: 'event',
    };
  }

  const detailFor = (idea: Idea) => {
    const stage = stageOf(idea);
    return (
      <IdeaDetail
        idea={idea}
        answers={answersFor(idea)}
        audience={resolveAudience(idea)}
        audienceGroupNames={ideaGroupIds(idea).map(id => groupById.get(id)?.name).filter((n): n is string => !!n)}
        meId={meId}
        onRespond={(choice) => respond(idea, choice)}
        onPlan={() => openPlanner(idea, 'prefs')}
        onStartPlanning={() => startPlanning(idea)}
        onSaveNotes={(text) => updateIdea(idea, { description: text || null })}
        onSeason={(season: Season | null) => updateIdea(idea, { season })}
        onShare={idea.created_by === meId ? () => afterDetail(() => setSharing(idea)) : undefined}
        onPickSlot={(slot) => openPlanner(idea, 'options', slot)}
        onSlotVotes={(starts) => handleSlotVotes(idea, starts)}
        personOf={personOf}
        onOpenEvent={idea.event_id ? () => openEvent(idea) : undefined}
        onDoAgain={() => doAgain(idea)}
        onSamePeople={() => samePeople(idea)}
        onAddMemories={idea.event_id ? () => addMemories(idea) : undefined}
        onDrop={idea.created_by === meId ? () => handleDrop(idea) : undefined}
        hidden={hiddenIds.has(idea.id)}
        onToggleHidden={() => toggleHidden(idea)}
        conversation={
          // Once it's booked, the conversation lives on the event.
          // A draft is only yours, so there's no one to talk to yet.
          idea.status !== 'draft' && (stage === 'idea' || stage === 'dates') ? (
            <CommentThread
              ideaId={idea.id}
              planTitle={idea.title}
              meId={meId}
              myName={myName}
              personOf={personOf}
              recipients={dateVoters(idea)}
              isDemo={isDemo}
              suggestions={stage === 'idea'}
              onPosted={() => {
                if (isDemo) updateDemoIdea(idea.id, { last_activity_at: new Date().toISOString(), last_activity_by: meId });
                fetchAll();
              }}
            />
          ) : null
        }
      />
    );
  };

  const detail = selected ? (
    <ReadingColumn>{detailFor(selected)}</ReadingColumn>
  ) : (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState icon="bulb-outline" title="No plan selected" />
    </View>
  );

  return (
    <>
      <SplitView list={list} detail={detail} />
      <NewIdeaSheet
        visible={writing}
        groups={myGroups}
        people={members.filter(m => m.id !== meId)}
        onClose={() => setWriting(false)}
        onSave={async (text, target) => {
          const idea = await addIdea(text, target);
          if (idea) setChosenTab('ideas');   // a new idea starts in Ideas, wherever you added it from
          return !!idea;
        }}
        onStartPlanning={startPlanningNew}
      />
      <ShareSheet
        idea={sharing}
        groups={myGroups}
        people={members.filter(m => m.id !== meId)}
        onClose={() => setSharing(null)}
        onShare={(target) => shareIdea(sharing!, target)}
      />
      {!threeColumn && (
        <Sheet visible={!!selected} onClose={() => setSelectedId(null)} title="Plan" cancelLabel="Done">
          {selected ? detailFor(selected) : null}
        </Sheet>
      )}
    </>
  );
}

const EMPTY: Record<TabKey, { title: string; body: string }> = {
  ideas: { title: 'Nothing brewing yet', body: 'Jot down something you’d like to do someday. Share it when you’re ready.' },
  finish: { title: 'Nothing to finish', body: 'Ideas move here once someone starts planning them, and stay until they’re booked.' },
  coming: { title: 'Nothing booked yet', body: 'Plans show up here once the invite goes out.' },
};

// ─── Tabs ────────────────────────────────────────────────────────────────────

/** The four steps as pills along the top; the chosen one is solid olive. */
function PlanTabs({ tab, count, waiting: anyWaiting, onChange }: { tab: TabKey; count: (t: TabKey) => number; waiting: boolean; onChange: (t: TabKey) => void }) {
  const { c } = useTheme();
  const { compact } = useLayout();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      contentContainerStyle={{ gap: space.s, paddingHorizontal: compact ? space.m : space.l, paddingTop: space.s }}
    >
      {TABS.map(t => {
        const on = t.key === tab;
        const n = count(t.key);
        // Finish planning calls for attention when something's waiting on you, even from another tab.
        const waiting = t.key === 'finish' && anyWaiting;
        return (
          <Tappable
            key={t.key}
            feedback="opacity"
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${t.label}, ${n}`}
            onPress={() => onChange(t.key)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: space.s - 2,
              height: 38, paddingLeft: space.m, paddingRight: n ? space.s - 2 : space.m,
              borderRadius: radius.pill, backgroundColor: on ? c.tint : c.fill, ...continuous,
            }}
          >
            <Txt v="callout" semibold style={{ color: on ? c.onTint : c.label }}>{t.label}</Txt>
            {n ? (
              <View style={{
                minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? c.onTint : waiting ? c.tint : c.background,
              }}>
                <Txt v="caption" style={[tabularNums, { color: on ? c.tint : waiting ? c.onTint : c.secondaryLabel }]}>{n}</Txt>
              </View>
            ) : null}
          </Tappable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Search, like Messages: opened from the magnifier in the header, a rounded
 * field with a clear button once there's text, and Cancel to put it away.
 */
function SearchBar({ value, onChange, onCancel }: { value: string; onChange: (q: string) => void; onCancel: () => void }) {
  const { c } = useTheme();
  const { compact } = useLayout();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, marginHorizontal: compact ? space.m : space.l, marginTop: space.s }}>
    <View
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m - 4, height: 40,
        borderRadius: radius.control, backgroundColor: c.fill, ...continuous,
      }}
    >
      <Icon name="search" size={17} color={c.secondaryLabel} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search titles, people, places, notes"
        placeholderTextColor={c.secondaryLabel}
        accessibilityLabel="Search ideas and plans"
        returnKeyType="search"
        autoCorrect={false}
        autoFocus
        onKeyPress={(e) => { if ((e.nativeEvent as any).key === 'Escape') onCancel(); }}
        style={[type.body, { flex: 1, minWidth: 0, color: c.label, paddingVertical: 0 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
      />
      {value ? <IconButton icon="close-circle" label="Clear search" onPress={() => onChange('')} /> : null}
    </View>
    <Tappable feedback="opacity" onPress={onCancel} accessibilityLabel="Cancel search" style={{ paddingVertical: space.s, paddingLeft: space.hair }}>
      <Txt v="body" tone="tint">Cancel</Txt>
    </Tappable>
    </View>
  );
}

