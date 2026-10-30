// You — account + settings.
//
// Settings are chunked into short groups (≤ 4 rows each). Anything with more
// than a couple of choices (reminder time, categories, hidden list, profile
// photo) is one row that discloses its options on demand.

import React, { useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { supabase } from '../lib/supabase';
import { notify, confirmAction } from '../lib/alert';
import { DEMO_MEMBERS, DEMO_ME, DEMO_EVENTS, isDemoGroup } from '../lib/demo';
import { exitDemo } from '../navigation/AppNavigator';
import { Profile, Event } from '../types';
import Avatar from '../components/Avatar';
import WorkScheduleSheet from './work/WorkScheduleSheet';
import { WorkSchedule, summarizePattern, summarizeScope, useWorkSchedules } from '../lib/workSchedule';
import {
  Button, Field, Icon, IconButton, ListRow, ListSection, Menu, ReadingColumn,
  ScreenHeader, Screen, Sheet, Tappable, Toggle, Txt, useBottomClearance,
} from '../components/ui';
import { toRRule } from '../lib/recurrence';
import { useMyPrefs } from '../lib/availabilityPrefs';
import { SoftPrefs } from '../lib/availability';
import { WeekendMode } from '../types';
import { splitPlace, useSavedPlaces } from '../lib/places';
import { space, useLayout, useTheme } from '../theme';

// User-chosen labels for their own events — content, not chrome.
const CATEGORY_COLORS = ['#C0392B', '#D68910', '#B7950B', '#229954', '#17A589', '#2471A3', '#7D3C98', '#717D7E'];

// "When should Sheep suggest plans?" — private, soft, optional.
const WEEKEND_OPTIONS: { key: WeekendMode; label: string; detail: string }[] = [
  { key: 'any', label: 'Any free time works', detail: 'Free weekend time can be suggested.' },
  { key: 'keep_one_free', label: 'Keep one day free when possible', detail: 'Sheep avoids filling both days of a weekend.' },
  { key: 'ask_first', label: 'Ask me before suggesting weekend times', detail: 'Others never see your weekends as free.' },
];

const REMINDER_OPTIONS = [
  { label: 'None', value: 0 },
  { label: '5 minutes before', value: 5 },
  { label: '15 minutes before', value: 15 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '1 day before', value: 1440 },
];

export interface EventCategory {
  id: string;
  name: string;
  color: string;
}

interface NotificationPrefs {
  eventInvites: boolean;
  eventChanges: boolean;
  reminders: boolean;
}

const DEFAULT_NOTIF_PREFS: NotificationPrefs = { eventInvites: true, eventChanges: true, reminders: true };

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { activeGroup } = useGroup();
  const { compact } = useLayout();
  const { c } = useTheme();
  const bottomClearance = useBottomClearance();
  const isDemo = !user || isDemoGroup(activeGroup);
  const navigation = useNavigation<any>();
  const savedPlaces = useSavedPlaces(user?.id ?? null, isDemo);

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [sharedWithFriends, setSharedWithFriends] = useState(true);
  const [hiddenFriends, setHiddenFriends] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const [defaultReminder, setDefaultReminder] = useState(15);
  const [exporting, setExporting] = useState(false);

  const [sheet, setSheet] = useState<null | 'profile' | 'categories' | 'hidden' | 'availability'>(null);
  const { prefs: suggestPrefs, save: saveSuggestPrefs } = useMyPrefs(user?.id ?? null);
  const workSchedules = useWorkSchedules();
  const hasOngoing = workSchedules.some(w => w.scope.kind === 'ongoing');
  const [workSheet, setWorkSheet] = useState<{ editing: WorkSchedule | null } | null>(null);
  // Regular schedule first, then week/month-specific ones in date order.
  const sortedWork = [...workSchedules].sort((a, b) =>
    (a.scope.kind === 'ongoing' ? -1 : 0) - (b.scope.kind === 'ongoing' ? -1 : 0) || summarizeScope(a).localeCompare(summarizeScope(b)));

  useEffect(() => {
    const read = (k: string, fn: (v: any) => void) =>
      AsyncStorage.getItem(k).then(d => { if (d !== null) fn(k === 'profile_avatar' ? d : JSON.parse(d)); });
    read('event_categories', setCategories);
    read('shared_with_friends', setSharedWithFriends);
    read('hidden_friends', setHiddenFriends);
    read('notification_prefs', setNotifPrefs);
    read('default_reminder', setDefaultReminder);
    read('profile_avatar', setAvatarUri);
    read('show_email', setShowEmail);
  }, []);

  useEffect(() => {
    if (!activeGroup) return;
    if (isDemoGroup(activeGroup)) { setGroupMembers(DEMO_MEMBERS.filter(m => m.id !== DEMO_ME)); return; }
    supabase.from('group_members').select('profiles(id, full_name, email)').eq('group_id', activeGroup.id)
      .then(({ data }) => {
        setGroupMembers((data ?? []).map((r: any) => r.profiles).filter(Boolean).filter((m: Profile) => m.id !== user?.id));
      });
  }, [activeGroup, user]);

  function persist<T>(key: string, setter: (v: T) => void) {
    return (v: T) => { setter(v); AsyncStorage.setItem(key, JSON.stringify(v)); };
  }
  const setShared = persist('shared_with_friends', setSharedWithFriends);
  const setShowEmailP = persist('show_email', setShowEmail);
  const setReminder = persist('default_reminder', setDefaultReminder);
  const setCats = persist('event_categories', setCategories);
  const setHidden = persist('hidden_friends', setHiddenFriends);
  const setNotif = (key: keyof NotificationPrefs, val: boolean) =>
    persist('notification_prefs', setNotifPrefs)({ ...notifPrefs, [key]: val });

  function setAvatar(uri: string | null) {
    setAvatarUri(uri);
    if (uri) AsyncStorage.setItem('profile_avatar', uri);
    else AsyncStorage.removeItem('profile_avatar');
  }

  // ─── Export (.ics) ─────────────────────────────────────────────────────────
  async function handleExportCalendar() {
    if (!activeGroup) return notify('No group', 'Join a group first to export events.');
    setExporting(true);
    let events: Event[] = DEMO_EVENTS;
    if (!isDemoGroup(activeGroup)) {
      const { data, error } = await supabase.from('events').select('*').eq('group_id', activeGroup.id).order('start_time', { ascending: true });
      if (error) { setExporting(false); return notify('Couldn’t export', error.message); }
      events = (data ?? []) as Event[];
    }
    events = events.filter(e => !e.cancelled_at);

    const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, m => `\\${m}`).replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FamilyPlan//sheep//EN', `X-WR-CALNAME:${esc(activeGroup.name)}`,
      ...events.map(e => [
        'BEGIN:VEVENT',
        `UID:${e.id}@familyplan`,
        `DTSTAMP:${stamp(new Date().toISOString())}`,
        `DTSTART:${stamp(e.start_time)}`,
        `DTEND:${stamp(e.end_time)}`,
        e.recurrence ? toRRule(e.recurrence) : '',
        `SUMMARY:${esc(e.title || '')}`,
        e.location ? `LOCATION:${esc(e.location)}` : '',
        e.description ? `DESCRIPTION:${esc(e.description)}` : '',
        'END:VEVENT',
      ].filter(Boolean).join('\r\n')),
      'END:VCALENDAR',
    ].join('\r\n');
    setExporting(false);

    if (Platform.OS === 'web') {
      // Desktop: hand the browser a real file for Calendar.app to open.
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeGroup.name.replace(/[^\w\s-]/g, '').trim() || 'sheep'}.ics`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    try {
      await Share.share(Platform.OS === 'ios'
        ? { title: `${activeGroup.name} Calendar`, url: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}` }
        : { title: `${activeGroup.name} Calendar`, message: ics });
    } catch {
      // User dismissed the share sheet.
    }
  }

  async function handleSignOut() {
    if (!user) return exitDemo();  // demo mode has no session to end
    if (await confirmAction('Sign out', 'You’ll need to sign in again to see your groups.', 'Sign Out')) signOut();
  }

  // Demo: you're Jordan, as Home and everyone else see you.
  const demoMe = isDemo ? DEMO_MEMBERS[0] : null;
  const displayName = profile?.full_name || user?.email || demoMe?.full_name || 'Guest';
  // Demo: Jordan's portrait until you pick your own.
  const myPhoto = avatarUri ?? (isDemo ? DEMO_MEMBERS[0].avatar_url : null);
  const me = { id: user?.id ?? 'me', full_name: displayName, avatar_url: myPhoto };
  const reminderLabel = REMINDER_OPTIONS.find(o => o.value === defaultReminder)?.label ?? 'None';
  const hiddenCount = hiddenFriends.filter(id => groupMembers.some(m => m.id === id)).length;

  return (
    <Screen>
      <ReadingColumn contentContainerStyle={{ paddingTop: 0, paddingBottom: bottomClearance, paddingHorizontal: compact ? space.m : space.l }}>
        <View style={{ marginHorizontal: compact ? -space.m : -space.l }}>
          {/* Reached from your avatar on Home; on phones it's not in the tab bar. */}
          <ScreenHeader title="You" trailing={compact ? <Button label="Done" variant="gray" onPress={() => navigation.navigate('Home')} /> : undefined} />
        </View>

        <ListSection>
          <ListRow
            leading={<Avatar person={me} size={56} highlight />}
            title={displayName}
            subtitle={user?.email ?? (demoMe ? 'Demo account' : 'Not signed in')}
            chevron
            onPress={() => setSheet('profile')}
            style={{ minHeight: 80 }}
          />
        </ListSection>

        <ListSection
          header="Work"
          separatorInset={60}
          footer={workSchedules.length
            ? 'Shown on your calendar, and flagged when a new event overlaps.'
            : 'Add your hours to see them on your calendar and get a heads-up when plans overlap.'}
        >
          {sortedWork.map(w => (
            <ListRow
              key={w.id}
              icon="briefcase-outline"
              title={summarizePattern(w.pattern)}
              subtitle={summarizeScope(w)}
              chevron
              onPress={() => setWorkSheet({ editing: w })}
            />
          ))}
          <ListRow
            key="add"
            icon="add-circle-outline"
            title={hasOngoing ? 'Add Schedule for Specific Weeks' : 'Add Work Schedule'}
            tintTitle
            onPress={() => setWorkSheet({ editing: null })}
          />
        </ListSection>

        {savedPlaces.saved.length ? (
          <ListSection header="Saved places" footer="Save a place from Add where when you make a plan." separatorInset={60}>
            {savedPlaces.saved.map(sp => (
              <ListRow
                key={sp.id}
                icon="bookmark-outline"
                title={sp.label}
                subtitle={splitPlace(sp.place).address ?? splitPlace(sp.place).name}
                trailing={<IconButton icon="trash-outline" label={`Remove ${sp.label}`} onPress={() => savedPlaces.remove(sp.id)} />}
              />
            ))}
          </ListSection>
        ) : null}

        <ListSection header="Notifications">
          <ListRow title="Event invites" trailing={<Toggle label="Event invites" value={notifPrefs.eventInvites} onValueChange={v => setNotif('eventInvites', v)} />} />
          <ListRow title="Changes to my events" trailing={<Toggle label="Changes to my events" value={notifPrefs.eventChanges} onValueChange={v => setNotif('eventChanges', v)} />} />
          <ListRow title="Reminders" trailing={<Toggle label="Reminders" value={notifPrefs.reminders} onValueChange={v => setNotif('reminders', v)} />} />
        </ListSection>

        <ListSection header="Calendar & availability">
          <ListRow
            title="When Sheep suggests plans"
            value={suggestPrefs.weekend_mode === 'any' && !suggestPrefs.spacing_enabled ? 'Any free time' : 'Custom'}
            chevron
            onPress={() => setSheet('availability')}
          />
          <Menu
            title="Default reminder"
            sections={[{ items: REMINDER_OPTIONS.map(o => ({
              key: String(o.value), label: o.label, checked: o.value === defaultReminder, onSelect: () => setReminder(o.value),
            })) }]}
          >
            {(open) => <ListRow title="Default reminder" value={reminderLabel} chevron onPress={open} />}
          </Menu>
          <ListRow title="Event categories" value={categories.length ? String(categories.length) : 'None'} chevron onPress={() => setSheet('categories')} />
          <ListRow
            title={exporting ? 'Exporting…' : 'Export calendar (.ics)'}
            tintTitle
            onPress={exporting ? undefined : handleExportCalendar}
            trailing={<Icon name="download-outline" size={18} color={c.tint} />}
          />
        </ListSection>

        <ListSection
          header="Privacy"
          footer={sharedWithFriends
            ? 'Friends can see your events unless you hide them from someone.'
            : 'New events default to private — only you can see them.'}
        >
          <ListRow title="Show my email to groups" trailing={<Toggle label="Show my email to groups" value={showEmail} onValueChange={setShowEmailP} />} />
          <ListRow title="Share my events with friends" trailing={<Toggle label="Share my events with friends" value={sharedWithFriends} onValueChange={setShared} />} />
          {sharedWithFriends ? (
            <ListRow title="Hide my events from" value={hiddenCount ? `${hiddenCount} ${hiddenCount === 1 ? 'person' : 'people'}` : 'No one'} chevron onPress={() => setSheet('hidden')} />
          ) : null}
        </ListSection>

        <ListSection>
          <ListRow title={user ? 'Sign Out' : 'Exit Demo'} destructive onPress={handleSignOut} />
        </ListSection>
      </ReadingColumn>

      <EditProfileSheet
        visible={sheet === 'profile'}
        onClose={() => setSheet(null)}
        isDemo={isDemo}
        initialName={profile?.full_name ?? demoMe?.full_name ?? ''}
        initialEmail={user?.email ?? demoMe?.email ?? ''}
        initialBirthday={profile?.birthday ?? (isDemo ? DEMO_MEMBERS[0].birthday ?? null : null)}
        initialAbout={(profile ?? (isDemo ? DEMO_MEMBERS[0] : null))?.about ?? ''}
        initialFavorites={(profile ?? (isDemo ? DEMO_MEMBERS[0] : null))?.favorites ?? []}
        avatarUri={myPhoto}
        onAvatar={setAvatar}
        userId={user?.id ?? null}
        currentEmail={user?.email ?? null}
        onSaved={refreshProfile}
      />
      <WorkScheduleSheet visible={!!workSheet} onClose={() => setWorkSheet(null)} editing={workSheet?.editing ?? null} hasOngoing={hasOngoing} />
      <CategoriesSheet visible={sheet === 'categories'} onClose={() => setSheet(null)} categories={categories} onChange={setCats} />
      <AvailabilitySheet
        visible={sheet === 'availability'}
        onClose={() => setSheet(null)}
        prefs={suggestPrefs}
        onChange={async next => { const error = await saveSuggestPrefs(next); if (error) notify('Couldn’t save', error); }}
      />
      <HiddenSheet visible={sheet === 'hidden'} onClose={() => setSheet(null)} members={groupMembers} hidden={hiddenFriends} onChange={setHidden} />
    </Screen>
  );
}

// ─── Edit profile ────────────────────────────────────────────────────────────

/** "10/23" or "10-23" → "10-23"; null when blank; undefined when invalid. */
function parseBirthday(text: string): string | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (!m) return undefined;
  const mm = Number(m[1]), dd = Number(m[2]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > new Date(2024, mm, 0).getDate()) return undefined;
  return `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** "hiking, board games,  " → ["hiking", "board games"]; at most six, each short. */
function parseFavorites(text: string): string[] {
  return text.split(',').map(t => t.trim().slice(0, 30)).filter(Boolean).slice(0, 6);
}

function EditProfileSheet({ visible, onClose, isDemo, initialName, initialEmail, initialBirthday, initialAbout, initialFavorites, avatarUri, onAvatar, userId, currentEmail, onSaved }: {
  visible: boolean; onClose: () => void; isDemo: boolean; initialName: string; initialEmail: string; initialBirthday: string | null;
  initialAbout: string; initialFavorites: string[];
  avatarUri: string | null; onAvatar: (u: string | null) => void; userId: string | null; currentEmail: string | null;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [birthday, setBirthday] = useState('');
  const [about, setAbout] = useState('');
  const [favorites, setFavorites] = useState('');
  const [urlMode, setUrlMode] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(initialName); setEmail(initialEmail); setUrlMode(false); setPhotoUrl('');
    setBirthday(initialBirthday ? initialBirthday.replace('-', '/') : '');
    setAbout(initialAbout); setFavorites(initialFavorites.join(', '));
  }, [visible]);

  function pickFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) return notify('Too large', 'Choose an image under 5 MB.');
      const reader = new FileReader();
      reader.onload = () => onAvatar(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function applyUrl() {
    const url = photoUrl.trim();
    if (!/^https?:\/\//.test(url)) return notify('Invalid URL', 'Use a link starting with http:// or https://');
    onAvatar(url);
    setUrlMode(false);
  }

  async function save() {
    if (!name.trim()) return;
    const bday = parseBirthday(birthday);
    if (bday === undefined) return notify('Check your birthday', 'Use month and day, like 10/23.');
    if (isDemo || !userId) return notify('Demo mode', 'Sign in to save profile changes.');
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: name.trim(), birthday: bday, about: about.trim() || null, favorites: parseFavorites(favorites),
    } as any).eq('id', userId);
    if (error) { setSaving(false); return notify('Couldn’t save', error.message); }

    const newEmail = email.trim();
    if (newEmail && newEmail !== currentEmail) {
      const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });
      if (emailError) { setSaving(false); return notify('Email update failed', emailError.message); }
      await supabase.from('profiles').update({ email: newEmail } as any).eq('id', userId);
      notify('Check your inbox', 'We sent a confirmation link to your new email address.');
    }
    setSaving(false);
    await onSaved();
    onClose();
  }

  const photoItems = [
    ...(Platform.OS === 'web' ? [{ key: 'file', label: 'Choose File…', icon: 'image-outline' as const, onSelect: pickFile }] : []),
    { key: 'url', label: 'Use Image URL…', icon: 'link-outline' as const, onSelect: () => setUrlMode(true) },
    ...(avatarUri ? [{ key: 'remove', label: 'Remove Photo', icon: 'trash-outline' as const, destructive: true, onSelect: () => onAvatar(null) }] : []),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="Profile" width={480} action={{ label: 'Save', onPress: save, disabled: !name.trim(), loading: saving }}>
      <View style={{ alignItems: 'center', gap: space.s }}>
        <Avatar person={{ id: userId ?? 'me', full_name: name || initialName, avatar_url: avatarUri }} size={96} highlight />
        <Menu title="Profile photo" sections={[{ items: photoItems }]}>
          {(open) => <Button label="Edit Photo" variant="plain" onPress={open} />}
        </Menu>
      </View>
      {urlMode ? (
        <View style={{ gap: space.s }}>
          <Field label="Image URL" value={photoUrl} onChangeText={setPhotoUrl} placeholder="https://…" autoCapitalize="none" autoCorrect={false} keyboardType="url" autoFocus onSubmitEditing={applyUrl} />
          <Button label="Use This Photo" variant="gray" onPress={applyUrl} />
        </View>
      ) : null}
      <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" />
      <Field
        label="Birthday"
        value={birthday}
        onChangeText={setBirthday}
        placeholder="MM/DD"
        keyboardType="numbers-and-punctuation"
        hint="Just the month and day. People you plan with get a nudge to celebrate."
      />
      <Field
        label="About you"
        value={about}
        onChangeText={setAbout}
        placeholder="Optional"
        maxLength={140}
      />
      <Field
        label="Things you love doing"
        value={favorites}
        onChangeText={setFavorites}
        placeholder="Hiking, board games, trying new tacos"
        hint="Separate with commas. Shown on your profile to people you plan with."
      />
      <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" hint="Changing your email sends a confirmation link." />
    </Sheet>
  );
}

// ─── When should Sheep suggest plans? ───────────────────────────────────────

function AvailabilitySheet({ visible, onClose, prefs, onChange }: {
  visible: boolean; onClose: () => void; prefs: SoftPrefs; onChange: (p: SoftPrefs) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Availability" cancelLabel="Done" width={480}>
      <View style={{ gap: space.hair, paddingHorizontal: space.m }}>
        <Txt v="title" accessibilityRole="header">When should Sheep suggest plans?</Txt>
        <Txt v="callout" tone="secondary">Free time doesn’t always mean you’re up for plans.</Txt>
      </View>

      <ListSection header="My weekends">
        {WEEKEND_OPTIONS.map(o => (
          <ListRow
            key={o.key}
            title={o.label}
            subtitle={o.detail}
            checked={prefs.weekend_mode === o.key}
            onPress={() => onChange({ ...prefs, weekend_mode: o.key })}
          />
        ))}
      </ListSection>

      <ListSection footer="Avoid recommending back-to-back social events when possible.">
        <ListRow
          title="Space out my plans"
          trailing={<Toggle label="Space out my plans" value={prefs.spacing_enabled} onValueChange={v => onChange({ ...prefs, spacing_enabled: v })} />}
        />
      </ListSection>

      <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>
        Only you can see these. They change which times Sheep suggests first. They never block a time, hide an invite, or answer for you.
      </Txt>
    </Sheet>
  );
}

// ─── Categories ──────────────────────────────────────────────────────────────

function CategoriesSheet({ visible, onClose, categories, onChange }: {
  visible: boolean; onClose: () => void; categories: EventCategory[]; onChange: (c: EventCategory[]) => void;
}) {
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[0]);

  function add() {
    if (!name.trim()) return;
    onChange([...categories, { id: Date.now().toString(), name: name.trim(), color }]);
    setName('');
  }

  async function remove(cat: EventCategory) {
    if (await confirmAction('Delete category', `Delete “${cat.name}”?`, 'Delete')) onChange(categories.filter(x => x.id !== cat.id));
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Event Categories" cancelLabel="Done" width={480}>
      {categories.length > 0 && (
        <ListSection separatorInset={56}>
          {categories.map(cat => (
            <ListRow
              key={cat.id}
              leading={<View style={{ width: 24, alignItems: 'center' }}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: cat.color }} /></View>}
              title={cat.name}
              trailing={<IconButton icon="trash-outline" label={`Delete ${cat.name}`} onPress={() => remove(cat)} />}
            />
          ))}
        </ListSection>
      )}

      <View style={{ gap: space.m }}>
        <Field label="New category" value={name} onChangeText={setName} placeholder="Date night, Dinners, Work…" onSubmitEditing={add} />
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {CATEGORY_COLORS.map(col => (
            <Tappable
              key={col}
              feedback="opacity"
              accessibilityRole="radio"
              accessibilityState={{ checked: col === color }}
              accessibilityLabel={`Color ${col}`}
              onPress={() => setColor(col)}
              style={{
                width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: col === color ? c.label : 'transparent',
              }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: col }} />
            </Tappable>
          ))}
        </View>
        <Button label="Add Category" variant="gray" icon="add" onPress={add} disabled={!name.trim()} />
      </View>
    </Sheet>
  );
}

// ─── Hidden-from list ────────────────────────────────────────────────────────

function HiddenSheet({ visible, onClose, members, hidden, onChange }: {
  visible: boolean; onClose: () => void; members: Profile[]; hidden: string[]; onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { if (visible) setQ(''); }, [visible]);
  const list = members.filter(m => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (m.full_name ?? '').toLowerCase().includes(s) || (m.email ?? '').toLowerCase().includes(s);
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Hide Events From" cancelLabel="Done" width={480}>
      <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>
        People you check won’t see any of your events.
      </Txt>
      <Field value={q} onChangeText={setQ} placeholder="Search" accessibilityLabel="Search people" />
      {members.length === 0 ? (
        <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>No one in this group yet.</Txt>
      ) : (
        <ListSection separatorInset={64}>
          {list.map(m => {
            const on = hidden.includes(m.id);
            return (
              <ListRow
                key={m.id}
                leading={<Avatar person={m} size={32} />}
                title={m.full_name ?? m.email}
                subtitle={m.full_name ? m.email : null}
                checked={on}
                onPress={() => onChange(on ? hidden.filter(x => x !== m.id) : [...hidden, m.id])}
              />
            );
          })}
        </ListSection>
      )}
    </Sheet>
  );
}

