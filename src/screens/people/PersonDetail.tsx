// One person: what they've shared about themselves, what you've done
// together, and what you keep about them.
//
// Like a contact card: photo, name, a line on what's most worth knowing, and
// three round actions (Plan, Note, Pin). Then what's waiting on you, your
// plans together as a timeline with their photos, what they've shared, and
// your private notes. Sections show only when there's something in them, so
// no two people's pages read quite the same.

import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { notify, confirmAction } from '../../lib/alert';
import { DEMO_COMMENTS, DEMO_EVENTS } from '../../lib/demo';
import { expandEvents } from '../../lib/recurrence';
import { MAX_PHOTOS, PickedPhoto, photoLinks, pickPhotos } from '../../lib/memories';
import { birthdayLabel, daysUntilBirthday, sharedHistory } from '../../lib/personal';
import { NoteSubject, usePersonNotes } from '../../lib/personNotes';
import { usePlanComposer } from '../../components/PlanComposer';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import { Event, PersonNote, Profile } from '../../types';
import { Field, Icon, IconButton, ListRow, ListSection, Sheet, Tag, Tappable, Txt } from '../../components/ui';
import { CircleAction } from './PeoplePieces';
import { keyOf, relativeDay, shortDate } from '../calendar/dates';
import { continuous, radius, space, useTheme } from '../../theme';

const DAY = 86400000;
const RECONNECT_AFTER_DAYS = 28;
const BIRTHDAY_SOON_DAYS = 30;
const RECENT = 3;
const THUMB = 72;

const firstName = (name?: string | null) => (name ?? 'them').split(' ')[0];

/** "September", or "September 2025" when it wasn't this year. */
const monthYear = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', d.getFullYear() === new Date().getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' });
};

function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  if (days < 1) return 'today';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

const dayLabel = (iso: string) => relativeDay(keyOf(iso)) ?? shortDate(keyOf(iso));

// ─── Someone on sheep ────────────────────────────────────────────────────────

export function PersonDetail({ profile, groups, meId, isDemo, closeFirst, needs, pinned, onTogglePin }: {
  profile: Profile;
  groups: { id: string; name: string }[];
  meId: string | null;
  isDemo: boolean;
  /** On phones the detail is a sheet: close it, then run `then`. */
  closeFirst: (then: () => void) => void;
  needs: React.ReactNode;        // what's waiting on you from them
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const navigation = useNavigation<any>();
  const composer = usePlanComposer();
  const [events, setEvents] = useState<Event[]>([]);
  const [photos, setPhotos] = useState<Record<string, string[]>>({});   // series id → photo links
  const [showAll, setShowAll] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const first = firstName(profile.full_name ?? profile.email);

  // Everything you've both been on, the last two years through the next two months.
  useEffect(() => {
    setShowAll(false);
    setEvents([]); setPhotos({});
    if (!meId) return;
    let cancelled = false;
    const from = new Date(Date.now() - 730 * DAY), to = new Date(Date.now() + 60 * DAY);
    (async () => {
      const raw = isDemo
        ? DEMO_EVENTS.filter(e => e.attendees.includes(profile.id) && e.attendees.includes(meId))
        : (((await supabase.from('events').select('*').contains('attendees', [meId, profile.id]).lt('start_time', to.toISOString())).data ?? []) as Event[]);
      if (cancelled) return;
      const expanded = expandEvents(raw, from, to);
      setEvents(expanded);

      // Photos from the memories of plans you shared, filed under each plan.
      const pastIds = Array.from(new Set(expanded.filter(e => new Date(e.end_time).getTime() < Date.now()).map(e => e.series_id ?? e.id)));
      if (!pastIds.length) return;
      const byEvent: Record<string, string[]> = {};
      const file = (id: string | null, urls: string[]) => { if (id && urls.length) byEvent[id] = [...(byEvent[id] ?? []), ...urls]; };
      if (isDemo) {
        DEMO_COMMENTS.filter(m => m.event_id && pastIds.includes(m.event_id)).forEach(m => file(m.event_id, m.photo_urls ?? []));
        setPhotos(byEvent);
        return;
      }
      const { data } = await supabase.from('plan_comments').select('event_id, photo_urls, created_at')
        .in('event_id', pastIds).order('created_at', { ascending: false }).limit(50);
      const rows = (data ?? []) as { event_id: string | null; photo_urls: string[] }[];
      const links = await photoLinks(rows.flatMap(r => r.photo_urls));
      rows.forEach(r => file(r.event_id, r.photo_urls.map(p => links[p]).filter(Boolean)));
      if (!cancelled) setPhotos(byEvent);
    })();
    return () => { cancelled = true; };
  }, [profile.id, meId, isDemo]);

  const history = useMemo(() => (meId ? sharedHistory(events, meId, profile.id) : null), [events, meId, profile.id]);
  const last = history?.past[0]?.event ?? null;
  const bdayIn = profile.birthday ? daysUntilBirthday(profile.birthday) : null;
  const birthdaySoon = bdayIn !== null && bdayIn <= BIRTHDAY_SOON_DAYS;
  const quiet = !!last && !history?.next && Date.now() - new Date(last.end_time).getTime() > RECONNECT_AFTER_DAYS * DAY;

  // Plan follows from what you have together: a birthday coming up gets a
  // birthday plan; otherwise a plan with them.
  const plan = () => closeFirst(() => composer.newPlan(birthdaySoon
    ? { people: [profile.id], title: `${first}’s birthday`, date: keyOf(new Date(Date.now() + bdayIn! * DAY).toISOString()) }
    : { people: [profile.id] }));

  const openEvent = (e: Event) => closeFirst(() => navigation.navigate('Calendar', { eventId: e.id, date: keyOf(e.start_time) }));

  // One line under the name: what's most worth knowing right now.
  const glance = birthdaySoon
    ? (bdayIn === 0 ? 'Birthday today 🎂' : `Birthday ${birthdayLabel(profile.birthday!)} · in ${bdayIn} day${bdayIn === 1 ? '' : 's'}`)
    : quiet ? `Last together ${ago(last!.start_time)}`
    : history?.pastCount
      ? history.pastCount === 1 ? '1 plan together so far' : `${history.pastCount} plans together since ${monthYear(history.firstAt!)}`
      : history?.next ? 'Your first plan together is coming up' : groups.map(g => g.name).join(', ');

  const favorites = profile.favorites ?? [];
  const sharedSomething = !!profile.about || favorites.length > 0 || !!profile.birthday;
  const shownPast = showAll ? history?.past ?? [] : (history?.past ?? []).slice(0, RECENT);

  return (
    <View style={{ gap: space.l }}>
      <View style={{ alignItems: 'center', gap: space.s, paddingTop: space.m }}>
        <Avatar person={profile} size={96} />
        <Txt v="title" align="center">{profile.full_name ?? profile.email}</Txt>
        {glance ? <Txt v="callout" tone={birthdaySoon ? 'tint' : 'secondary'} align="center">{glance}</Txt> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.m, paddingTop: space.s }}>
          <CircleAction icon={birthdaySoon ? 'gift-outline' : 'sparkles-outline'} label="Plan"
            a11y={birthdaySoon ? `Plan something for ${first}’s birthday` : `Make plans with ${first}`} onPress={plan} />
          <CircleAction icon="create-outline" label="Note" a11y={`Add a note about ${first}`} onPress={() => setAddingNote(true)} />
          <CircleAction icon={pinned ? 'pin' : 'pin-outline'} label={pinned ? 'Pinned' : 'Pin'} active={pinned}
            a11y={pinned ? `Unpin ${first}` : `Pin ${first}`} onPress={onTogglePin} />
        </View>
      </View>

      {needs}

      {history && (history.next || history.past.length) ? (
        <ListSection header="Together" separatorInset={space.m + 12 + space.m}>
          {history.next ? (
            <TimelineItem
              title={history.next.title}
              when={`Next · ${dayLabel(history.next.start_time)}`}
              upcoming
              first
              last={!history.past.length}
              onPress={() => openEvent(history.next!)}
            />
          ) : null}
          {shownPast.map(({ event, times }, i) => (
            <TimelineItem
              key={event.series_id ?? event.id}
              title={event.title}
              when={times > 1 ? `${times} times · last ${dayLabel(event.start_time)}` : dayLabel(event.start_time)}
              photos={photos[event.series_id ?? event.id]}
              first={i === 0 && !history.next}
              last={i === shownPast.length - 1 && history.past.length <= RECENT}
              onPress={() => openEvent(event)}
            />
          ))}
          {history.past.length > RECENT ? (
            <ListRow title={showAll ? 'Show fewer' : `Show all ${history.past.length}`} tintTitle onPress={() => setShowAll(x => !x)} />
          ) : null}
        </ListSection>
      ) : null}

      {sharedSomething ? (
        <ListSection header={`About ${first}`} footer={`Shared by ${first}.`}>
          {profile.about || favorites.length ? (
            <View style={{ padding: space.m, gap: space.s }}>
              {profile.about ? <Txt v="body">{profile.about}</Txt> : null}
              {favorites.length ? (
                <View style={{ gap: space.s }}>
                  <Txt v="footnote" tone="secondary">Loves</Txt>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
                    {favorites.map(f => <Tag key={f} label={f} tone="tint" />)}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
          {profile.birthday ? <ListRow icon="gift-outline" title="Birthday" value={birthdayLabel(profile.birthday)} /> : null}
        </ListSection>
      ) : null}

      <NotesSection ownerId={meId} subject={{ kind: 'user', id: profile.id }} isDemo={isDemo} name={first} adding={addingNote} onAddingChange={setAddingNote} />

      {groups.length ? (
        <ListSection header="Shared groups">
          {groups.map(g => <ListRow key={g.id} title={g.name} />)}
        </ListSection>
      ) : null}
    </View>
  );
}

/** One stop on the Together timeline: a dot on a rail, the plan, and its photos. */
function TimelineItem({ title, when, photos, upcoming, first, last, onPress }: {
  title: string; when: string; photos?: string[]; upcoming?: boolean; first?: boolean; last?: boolean; onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Tappable onPress={onPress} accessibilityLabel={`${title}, ${when}`} style={{ flexDirection: 'row', gap: space.m, paddingHorizontal: space.m }}>
      <View style={{ width: 12, alignItems: 'center' }}>
        {/* The rail runs through every stop: in from above (unless first), out below (unless last). */}
        <View style={{ width: 2, height: space.m, backgroundColor: first ? 'transparent' : c.separator }} />
        <View style={{
          width: 12, height: 12, borderRadius: 6,
          backgroundColor: upcoming ? c.tint : c.background, borderWidth: 2, borderColor: upcoming ? c.tint : c.secondaryLabel,
        }} />
        {!last ? <View style={{ flex: 1, width: 2, backgroundColor: c.separator }} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingVertical: space.s + space.hair, gap: space.hair }}>
        <Txt v="callout" semibold numberOfLines={1}>{title}</Txt>
        <Txt v="footnote" tone={upcoming ? 'tint' : 'secondary'}>{when}</Txt>
        {photos?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingTop: space.s }}>
            {photos.slice(0, 6).map((u, i) => (
              <Image key={`${u}-${i}`} source={{ uri: u }} accessibilityLabel={`Photo ${i + 1} from ${title}`}
                style={{ width: THUMB, height: THUMB, borderRadius: radius.control, backgroundColor: c.background }} />
            ))}
          </ScrollView>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={16} color={c.secondaryLabel} style={{ alignSelf: 'center' }} />
    </Tappable>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

export function IdentityHeader({ person, title, subtitle }: { person: AvatarPerson; title: string; subtitle?: string | null }) {
  return (
    <View style={{ alignItems: 'center', gap: space.s, paddingVertical: space.m }}>
      <Avatar person={person} size={80} />
      <Txt v="title" align="center">{title}</Txt>
      {subtitle ? <Txt v="callout" tone="secondary" align="center">{subtitle}</Txt> : null}
    </View>
  );
}

/** Your private notes and photos about someone. */
export function NotesSection({ ownerId, subject, isDemo, name, adding: addingProp, onAddingChange }: {
  ownerId: string | null; subject: NoteSubject; isDemo: boolean; name: string;
  /** Optional: let the page open the note sheet (the Note button). */
  adding?: boolean; onAddingChange?: (v: boolean) => void;
}) {
  const { c } = useTheme();
  const { notes, add, remove, photoUri } = usePersonNotes(ownerId, subject, isDemo);
  const [addingOwn, setAddingOwn] = useState(false);
  const adding = addingProp ?? addingOwn;
  const setAdding = onAddingChange ?? setAddingOwn;

  async function confirmRemove(n: PersonNote) {
    if (!(await confirmAction('Delete note', 'This note and its photos will be deleted.', 'Delete'))) return;
    const error = await remove(n);
    if (error) notify('Couldn’t delete', error);
  }

  return (
    <>
      <ListSection header="Just for you" footer={`Only you can see these, not ${name}.`}>
        {notes.map(n => (
          <View key={n.id} style={{ paddingHorizontal: space.m, paddingVertical: space.s + space.hair, gap: space.s }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s }}>
              <View style={{ flex: 1, gap: space.hair }}>
                {n.body ? <Txt v="body">{n.body}</Txt> : null}
                <Txt v="footnote" tone="secondary">{shortDate(keyOf(n.created_at))}</Txt>
              </View>
              <IconButton icon="trash-outline" label="Delete note" onPress={() => confirmRemove(n)} />
            </View>
            {n.photo_urls.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
                {n.photo_urls.map((p, i) => (
                  <Image key={p} source={{ uri: photoUri(p) }} accessibilityLabel={`Photo ${i + 1}`}
                    style={{ width: THUMB, height: THUMB, borderRadius: radius.control, backgroundColor: c.background }} />
                ))}
              </View>
            ) : null}
          </View>
        ))}
        <ListRow icon="add-circle-outline" title={notes.length ? 'Add Note or Photo' : `Add a Note or Photo About ${name}`} tintTitle onPress={() => setAdding(true)} />
      </ListSection>
      <NoteSheet visible={adding} onClose={() => setAdding(false)} name={name} onSave={add} />
    </>
  );
}

function NoteSheet({ visible, onClose, name, onSave }: {
  visible: boolean; onClose: () => void; name: string;
  onSave: (body: string, photos: PickedPhoto[]) => Promise<string | null>;
}) {
  const { c } = useTheme();
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (visible) { setBody(''); setPhotos([]); setSaving(false); } }, [visible]);

  async function addPhotos() {
    try {
      const picked = await pickPhotos(MAX_PHOTOS - photos.length);
      setPhotos(prev => [...prev, ...picked].slice(0, MAX_PHOTOS));
    } catch (e: any) {
      notify('Couldn’t open photos', e?.message ?? 'Try again.');
    }
  }

  async function save() {
    if (!body.trim() && !photos.length) return;
    setSaving(true);
    const error = await onSave(body, photos);
    setSaving(false);
    if (error) return notify('Couldn’t save', error);
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`About ${name}`}
      width={480}
      action={{ label: 'Save', onPress: save, disabled: !body.trim() && !photos.length, loading: saving }}
    >
      <Field
        label="Note"
        value={body}
        onChangeText={setBody}
        placeholder="Kids’ names, allergies, the place they keep talking about…"
        multiline
        maxLength={1000}
        autoFocus
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, paddingHorizontal: space.m }}>
        {photos.map((p, i) => (
          <View key={`${p.uri}-${i}`} style={{ width: THUMB, height: THUMB }}>
            <Image source={{ uri: p.uri }} style={{ width: THUMB, height: THUMB, borderRadius: radius.control, backgroundColor: c.fill }} accessibilityLabel={`Photo ${i + 1}`} />
            <IconButton
              icon="close-circle"
              label={`Remove photo ${i + 1}`}
              onPress={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
              style={{ position: 'absolute', top: -10, right: -10 }}
            />
          </View>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <Tappable
            onPress={addPhotos}
            accessibilityLabel="Add photos"
            style={{
              width: THUMB, height: THUMB, borderRadius: radius.control, ...continuous,
              borderWidth: 2, borderStyle: 'dashed', borderColor: c.tint,
              alignItems: 'center', justifyContent: 'center', gap: space.hair, backgroundColor: c.tintSoft,
            }}
          >
            <Icon name="images-outline" size={22} color={c.tint} />
            <Txt v="caption" tone="tint" semibold>{photos.length ? 'More' : 'Photos'}</Txt>
          </Tappable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: space.s, paddingHorizontal: space.m, alignItems: 'flex-start' }}>
        <Icon name="lock-closed-outline" size={15} color={c.secondaryLabel} style={{ marginTop: 1 }} />
        <Txt v="footnote" tone="secondary" style={{ flex: 1 }}>Only you can see this.</Txt>
      </View>
    </Sheet>
  );
}
