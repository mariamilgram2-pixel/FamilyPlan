// You — account + settings.
//
// Settings are chunked into short groups (≤ 4 rows each). Anything with more
// than a couple of choices (reminder time, categories, hidden list, profile
// photo) is one row that discloses its options on demand.

import React, { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { supabase } from '../lib/supabase';
import { notify, confirmAction } from '../lib/alert';
import { DEMO_EXTRA_GROUPS, DEMO_MEMBERS, DEMO_ME, DEMO_EVENTS, isDemoGroup } from '../lib/demo';
import { useCalendarGroups } from '../components/GroupSwitcher';
import { ColorMode, PALETTE, PERSONAL, calendarColor, colorName } from '../lib/calendarColors';
import { useCalendarColors } from '../lib/calendarColorsStore';
import { exitDemo } from '../navigation/AppNavigator';
import { Profile, Event, Group } from '../types';
import Avatar from '../components/Avatar';
import { SHEEP_AVATARS, SKIN_TONES, SheepLook, parseSheepUrl, sheepAvatarUrl } from '../lib/sheepAvatars';
import { PickedPhoto, pickProfilePhoto, saveAvatarUrl, uploadProfilePhoto } from '../lib/profilePhoto';
import { loadMyPhone, saveMyPhone } from '../lib/friends';
import { formatPhone, looksLikePhone } from '../lib/phone';
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
import { parseBirthday } from '../lib/birthday';
import { isCalendar } from '../lib/groups';
import { useConnectedCalendars } from '../lib/phoneCalendars';
import ConnectedCalendarsSheet from './calendar/ConnectedCalendarsSheet';
import SetupSheet from './onboarding/SetupSheet';
import ImportContactsSheet from './people/ImportContactsSheet';
import { space, useLayout, useTheme } from '../theme';


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

  const [demoAvatar, setDemoAvatar] = useState<string | null>(null);   // demo only; signed in, it's on your profile
  const [showEmail, setShowEmail] = useState(false);
  const [sharedWithFriends, setSharedWithFriends] = useState(true);
  const [hiddenFriends, setHiddenFriends] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<Profile[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const [defaultReminder, setDefaultReminder] = useState(15);
  const [exporting, setExporting] = useState(false);

  const [sheet, setSheet] = useState<null | 'profile' | 'colors' | 'hidden' | 'availability' | 'calendars' | 'setup' | 'contacts'>(null);
  const colors = useCalendarColors();
  // "Edit Categories and Colors…" from an event opens straight to the sheet.
  const route = useRoute<any>();
  useEffect(() => {
    if (route.params?.open !== 'colors') return;
    setSheet('colors');
    navigation.setParams({ open: undefined });
  }, [route.params?.open]);
  // Same order as the calendar, so a calendar's starting color matches there.
  const visibleGroups = useCalendarGroups();
  const allCalendars: Group[] = [...visibleGroups, ...(isDemo ? DEMO_EXTRA_GROUPS.map(g => g.group).filter(g => isCalendar(g) && !visibleGroups.some(v => v.id === g.id)) : [])];
  const calendars = allCalendars.filter(g => !isDemo || visibleGroups.some(v => v.id === g.id) || DEMO_EXTRA_GROUPS.some(x => x.group.id === g.id && x.memberIds.includes(DEMO_ME)));
  const { prefs: suggestPrefs, save: saveSuggestPrefs } = useMyPrefs(user?.id ?? null);
  const workSchedules = useWorkSchedules();
  const connected = useConnectedCalendars(isDemo);
  const hasOngoing = workSchedules.some(w => w.scope.kind === 'ongoing');
  const [workSheet, setWorkSheet] = useState<{ editing: WorkSchedule | null } | null>(null);
  // Regular schedule first, then week/month-specific ones in date order.
  const sortedWork = [...workSchedules].sort((a, b) =>
    (a.scope.kind === 'ongoing' ? -1 : 0) - (b.scope.kind === 'ongoing' ? -1 : 0) || summarizeScope(a).localeCompare(summarizeScope(b)));

  useEffect(() => {
    const read = (k: string, fn: (v: any) => void) =>
      AsyncStorage.getItem(k).then(d => { if (d !== null) fn(JSON.parse(d)); });
    read('shared_with_friends', setSharedWithFriends);
    read('hidden_friends', setHiddenFriends);
    read('notification_prefs', setNotifPrefs);
    read('default_reminder', setDefaultReminder);
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
  const setHidden = persist('hidden_friends', setHiddenFriends);
  const setNotif = (key: keyof NotificationPrefs, val: boolean) =>
    persist('notification_prefs', setNotifPrefs)({ ...notifPrefs, [key]: val });

  /** Your picture, saved on your profile so everyone you plan with sees it. */
  async function setAvatar(choice: AvatarChoice) {
    const local = choice.kind === 'photo' ? choice.photo.uri : choice.kind === 'sheep' ? choice.url : null;
    if (isDemo || !user) return setDemoAvatar(local);
    try {
      const url = choice.kind === 'photo' ? await uploadProfilePhoto(user.id, choice.photo) : local;
      await saveAvatarUrl(user.id, url);
      await refreshProfile();
    } catch (e: any) {
      notify('Couldn’t update your photo', e?.message ?? String(e));
    }
  }

  // ─── Export (.ics) ─────────────────────────────────────────────────────────
  async function handleExportCalendar() {
    if (!activeGroup && !user) return;
    setExporting(true);
    let events: Event[] = DEMO_EVENTS;
    const calName = activeGroup?.name ?? 'My plans';
    if (!isDemoGroup(activeGroup)) {
      // This group's calendar, plus your own plans with people (no group).
      // Not in a group yet: just your own plans.
      const q = supabase.from('events').select('*');
      const { data, error } = await (activeGroup
        ? (user ? q.or(`group_id.eq.${activeGroup.id},attendees.cs.{${user.id}}`) : q.eq('group_id', activeGroup.id))
        : q.contains('attendees', [user!.id])).order('start_time', { ascending: true });
      if (error) { setExporting(false); return notify('Couldn’t export', error.message); }
      events = (data ?? []) as Event[];
    }
    events = events.filter(e => !e.cancelled_at);

    const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, m => `\\${m}`).replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sheep//sheep//EN', `X-WR-CALNAME:${esc(calName)}`,
      ...events.map(e => [
        'BEGIN:VEVENT',
        `UID:${e.id}@sheep`,
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
      a.download = `${calName.replace(/[^\w\s-]/g, '').trim() || 'sheep'}.ics`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    try {
      await Share.share(Platform.OS === 'ios'
        ? { title: `${calName} Calendar`, url: `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}` }
        : { title: `${calName} Calendar`, message: ics });
    } catch {
      // User dismissed the share sheet.
    }
  }

  async function handleSignOut() {
    if (!user) return exitDemo();  // demo mode has no session to end
    if (await confirmAction('Sign out', 'You’ll need to sign in again to see your groups.', 'Sign Out')) signOut();
  }

  // Delete Account: asked twice, since it can't be undone. Your sign-in and
  // everything that's yours go; plans you made stay for the others in them.
  const [deleting, setDeleting] = useState(false);
  async function handleDeleteAccount() {
    if (!user || deleting) return;
    const sure = await confirmAction(
      'Delete your account?',
      'This permanently deletes your account, your people, notes, saved places and connected calendars. Plans you made stay for the people in them. This can’t be undone.',
      'Continue',
    );
    if (!sure) return;
    const really = await confirmAction('Delete account', `Delete ${user.email ?? 'your account'} for good?`, 'Delete Account');
    if (!really) return;
    setDeleting(true);
    const { error } = await supabase.rpc('delete_my_account' as any);
    if (error) { setDeleting(false); return notify('Couldn’t delete your account', error.message); }
    await AsyncStorage.multiRemove([`calendar_setup_seen:${user.id}`]).catch(() => {});
    await signOut();
  }

  // Demo: you're Jordan, as Home and everyone else see you.
  const demoMe = isDemo ? DEMO_MEMBERS[0] : null;
  const displayName = profile?.full_name || user?.email || demoMe?.full_name || 'Guest';
  // Demo: Jordan's portrait until you pick your own.
  const myPhoto = isDemo ? (demoAvatar ?? DEMO_MEMBERS[0].avatar_url ?? null) : (profile?.avatar_url ?? null);
  const me = { id: user?.id ?? 'me', full_name: displayName, avatar_url: myPhoto };
  const reminderLabel = REMINDER_OPTIONS.find(o => o.value === defaultReminder)?.label ?? 'None';
  const hiddenCount = hiddenFriends.filter(id => groupMembers.some(m => m.id === id)).length;

  return (
    <Screen>
      <ReadingColumn contentContainerStyle={{ paddingTop: 0, paddingBottom: bottomClearance, paddingHorizontal: compact ? space.m : space.l }}>
        <View style={{ marginHorizontal: compact ? -space.m : -space.l }}>
          {/* Reached from your avatar on Home; on phones it's not in the tab bar. */}
          <ScreenHeader title="You" trailing={compact ? <Button label="Done" variant="gray" onPress={() => navigation.navigate('Sheep')} /> : undefined} />
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

        <ListSection>
          <ListRow icon="sparkles-outline" title="Set up sheep" subtitle="Calendars, contacts, birthday, groups" chevron onPress={() => setSheet('setup')} />
          <ListRow icon="book-outline" title="Add people from contacts" chevron onPress={() => setSheet('contacts')} />
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
            title="Connected calendars"
            value={connected.connections.length ? `${connected.connections.length} ${connected.connections.length === 1 ? 'calendar' : 'calendars'}` : 'None'}
            chevron
            onPress={() => setSheet('calendars')}
          />
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
          <ListRow title="Calendar colors" value={MODE_LABEL[colors.prefs.mode]} chevron onPress={() => setSheet('colors')} />
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
        {user ? (
          <ListSection footer="Permanently deletes your account and everything that’s only yours.">
            <ListRow title={deleting ? 'Deleting…' : 'Delete Account'} destructive onPress={deleting ? undefined : handleDeleteAccount} />
          </ListSection>
        ) : null}
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
      <ColorsSheet visible={sheet === 'colors'} onClose={() => setSheet(null)} calendars={calendars} order={allCalendars.map(g => g.id)} />
      <AvailabilitySheet
        visible={sheet === 'availability'}
        onClose={() => setSheet(null)}
        prefs={suggestPrefs}
        onChange={async next => { const error = await saveSuggestPrefs(next); if (error) notify('Couldn’t save', error); }}
      />
      <ConnectedCalendarsSheet visible={sheet === 'calendars'} onClose={() => setSheet(null)} demo={isDemo} />
      <SetupSheet visible={sheet === 'setup'} onClose={() => setSheet(null)} demo={isDemo} />
      <ImportContactsSheet visible={sheet === 'contacts'} onClose={() => setSheet(null)} demo={isDemo} />
      <HiddenSheet visible={sheet === 'hidden'} onClose={() => setSheet(null)} members={groupMembers} hidden={hiddenFriends} onChange={setHidden} />
    </Screen>
  );
}

// ─── Edit profile ────────────────────────────────────────────────────────────

/** "hiking, board games,  " → ["hiking", "board games"]; at most six, each short. */
function parseFavorites(text: string): string[] {
  return text.split(',').map(t => t.trim().slice(0, 30)).filter(Boolean).slice(0, 6);
}

type AvatarChoice = { kind: 'photo'; photo: PickedPhoto } | { kind: 'sheep'; url: string } | { kind: 'remove' };

/**
 * The drawn sheep to pick from, four across. Tap one and a bar pops up under
 * its row with its skin tones, like a hand emoji in iMessage: its own face,
 * then light to deep. Picking one previews it; Save keeps it.
 */
function SheepGrid({ value, onChange }: { value: string | null; onChange: (url: string) => void }) {
  const { c } = useTheme();
  const chosen = parseSheepUrl(value);
  const [open, setOpen] = useState<string | null>(null);   // the sheep whose tones are showing
  const rows: SheepLook[][] = [];
  SHEEP_AVATARS.forEach((s, i) => { if (i % 4 === 0) rows.push([]); rows[rows.length - 1].push(s); });

  const face = (id: string, tone: string | null, size: number) => (
    <Avatar person={{ id: `${id}-${tone ?? ''}`, full_name: id, avatar_url: sheepAvatarUrl(id, tone) }} size={size} />
  );
  const pick = (id: string, tone: string | null) => { onChange(sheepAvatarUrl(id, tone)); setOpen(null); };

  return (
    <View style={{ gap: space.m }}>
      {rows.map((row, r) => {
        const col = row.findIndex(s => s.id === open);
        return (
          <View key={r} style={{ gap: space.s }}>
            <View style={{ flexDirection: 'row' }}>
              {row.map(s => {
                const on = s.id === chosen?.id;
                return (
                  <Tappable
                    key={s.id}
                    feedback="opacity"
                    onPress={() => setOpen(open === s.id ? null : s.id)}
                    accessibilityLabel={`${s.label} sheep${on ? ', selected' : ''}. Shows skin tones.`}
                    accessibilityState={{ expanded: open === s.id }}
                    style={{ width: '25%', alignItems: 'center', gap: space.hair }}
                  >
                    <View style={{ padding: 3, borderRadius: 40, borderWidth: 2, borderColor: on ? c.tint : 'transparent' }}>
                      {face(s.id, on ? chosen!.tone : null, 60)}
                    </View>
                    <Txt v="caption" tone={on ? undefined : 'secondary'} semibold={on} numberOfLines={1}>{s.label}</Txt>
                  </Tappable>
                );
              })}
            </View>
            {col >= 0 ? (
              <View>
                {/* The little point up at the sheep it belongs to. */}
                <View style={{
                  position: 'absolute', top: -6, left: `${col * 25 + 12.5}%`, marginLeft: -7,
                  width: 14, height: 14, backgroundColor: c.card, transform: [{ rotate: '45deg' }],
                }} />
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: space.s, paddingHorizontal: space.s, borderRadius: 20, backgroundColor: c.card,
                  shadowColor: c.shadow, shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
                }}>
                  <Tappable feedback="opacity" onPress={() => pick(open!, null)} accessibilityLabel={`${row[col].label} sheep, its own face`}>
                    {face(open!, null, 40)}
                  </Tappable>
                  <View style={{ width: StyleSheet.hairlineWidth * 2, height: 32, backgroundColor: c.separator }} />
                  {SKIN_TONES.map(t => (
                    <Tappable key={t.id} feedback="opacity" onPress={() => pick(open!, t.id)} accessibilityLabel={`${row[col].label} sheep, ${t.label.toLowerCase()} skin tone`}>
                      {face(open!, t.id, 40)}
                    </Tappable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function EditProfileSheet({ visible, onClose, isDemo, initialName, initialEmail, initialBirthday, initialAbout, initialFavorites, avatarUri, onAvatar, userId, currentEmail, onSaved }: {
  visible: boolean; onClose: () => void; isDemo: boolean; initialName: string; initialEmail: string; initialBirthday: string | null;
  initialAbout: string; initialFavorites: string[];
  avatarUri: string | null; onAvatar: (choice: AvatarChoice) => Promise<void>; userId: string | null; currentEmail: string | null;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [birthday, setBirthday] = useState('');
  const [about, setAbout] = useState('');
  const [favorites, setFavorites] = useState('');
  const [phone, setPhone] = useState('');
  const [savedPhone, setSavedPhone] = useState('');   // what's saved, to save only a change
  const [sheepMode, setSheepMode] = useState(false);
  const [pending, setPending] = useState<AvatarChoice | null>(null);   // a new picture, kept when you Save
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(initialName); setEmail(initialEmail); setSheepMode(false); setPending(null);
    setBirthday(initialBirthday ? initialBirthday.replace('-', '/') : '');
    setAbout(initialAbout); setFavorites(initialFavorites.join(', '));
    setPhone(''); setSavedPhone('');
    if (userId && !isDemo) loadMyPhone(userId).then(k => { const f = k ? formatPhone(k) : ''; setPhone(f); setSavedPhone(f); });
  }, [visible]);

  async function fromLibrary() {
    setSheepMode(false);
    const photo = await pickProfilePhoto();
    if (photo) setPending({ kind: 'photo', photo });
  }

  // What the picture will be once you Save.
  const shownAvatar = !pending ? avatarUri : pending.kind === 'photo' ? pending.photo.uri : pending.kind === 'sheep' ? pending.url : null;

  async function save() {
    if (!name.trim()) return;
    const bday = parseBirthday(birthday);
    if (bday === undefined) return notify('Check your birthday', 'Use month and day, like 10/23.');
    if (isDemo || !userId) {
      if (pending) { await onAvatar(pending); onClose(); return; }   // the demo keeps a picture until you leave
      return notify('Demo mode', 'Sign in to save profile changes.');
    }
    if (phone.trim() && !looksLikePhone(phone)) return notify('Check your number', 'That doesn’t look like a phone number.');
    setSaving(true);
    if (pending) await onAvatar(pending);
    if (phone.trim() !== savedPhone.trim()) {
      const phoneError = await saveMyPhone(userId, phone);
      if (phoneError) { setSaving(false); return notify('Couldn’t save your number', phoneError); }
    }
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
    { key: 'library', label: 'Choose from Library…', icon: 'images-outline' as const, onSelect: fromLibrary },
    { key: 'sheep', label: 'Pick a Sheep…', icon: 'happy-outline' as const, onSelect: () => setSheepMode(true) },
    ...(shownAvatar ? [{ key: 'remove', label: 'Remove Photo', icon: 'trash-outline' as const, destructive: true, onSelect: () => { setSheepMode(false); setPending({ kind: 'remove' }); } }] : []),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="Profile" width={480} action={{ label: 'Save', onPress: save, disabled: !name.trim(), loading: saving }}>
      <View style={{ alignItems: 'center', gap: space.s }}>
        <Avatar person={{ id: userId ?? 'me', full_name: name || initialName, avatar_url: shownAvatar }} size={96} highlight />
        {sheepMode ? (
          <Button label="Done" variant="plain" onPress={() => setSheepMode(false)} />
        ) : (
          <Menu title="Profile photo" sections={[{ items: photoItems }]}>
            {(open) => <Button label="Edit Photo" variant="plain" onPress={open} />}
          </Menu>
        )}
      </View>
      {sheepMode ? <SheepGrid value={shownAvatar} onChange={(url) => setPending({ kind: 'sheep', url })} /> : null}
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
      <Field
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        onBlur={() => { if (looksLikePhone(phone)) setPhone(formatPhone(phone)); }}
        placeholder="Optional"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        hint="So friends who have your number can find you and add you. Nobody sees it."
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

// ─── Calendar colors ─────────────────────────────────────────────────────────

const MODE_LABEL: Record<ColorMode, string> = { none: 'One color', calendar: 'By calendar', category: 'By category' };
const MODES: { key: ColorMode; title: string; detail: string }[] = [
  { key: 'none', title: 'One color', detail: 'Everything in olive, the clean look.' },
  { key: 'calendar', title: 'By calendar', detail: 'Each calendar in its own color.' },
  { key: 'category', title: 'By category', detail: 'Unfiled events use their calendar’s.' },
];

function Swatch({ color, size = 14 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** A swatch that opens the palette: tap, pick. */
function ColorPick({ color, label, onPick }: { color: string; label: string; onPick: (c: string) => void }) {
  const { c } = useTheme();
  return (
    <Menu title={label} sections={[{ items: PALETTE.map(p => ({
      key: p.color, label: p.name, checked: p.color.toLowerCase() === color.toLowerCase(), leading: <Swatch color={p.color} size={18} />, onSelect: () => onPick(p.color),
    })) }]}>
      {(open) => (
        <Tappable feedback="opacity" onPress={open} accessibilityLabel={`${label}: ${colorName(color)}. Change color`} hitSlop={6}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair + 2, paddingVertical: space.hair, paddingHorizontal: space.s, borderRadius: 14, borderWidth: 1, borderColor: c.separator }}>
          <Swatch color={color} />
          <Txt v="footnote" tone="secondary">{colorName(color)}</Txt>
        </Tappable>
      )}
    </Menu>
  );
}

/**
 * Calendar colors, all in one place: how to color events, each calendar's
 * color, and your categories with theirs. Yours alone; nobody else's calendar changes.
 */
function ColorsSheet({ visible, onClose, calendars, order }: { visible: boolean; onClose: () => void; calendars: Group[]; order: string[] }) {
  const { prefs, setMode, setCalendarColor, addCategory, setCategoryColor, removeCategory } = useCalendarColors();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[4].color);

  function add() {
    if (!name.trim()) return;
    addCategory(name, color);
    setName('');
  }

  async function remove(id: string, label: string) {
    if (await confirmAction('Delete category', `Delete “${label}”? Events filed under it go back to their calendar’s color.`, 'Delete')) removeCategory(id);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Calendar Colors" cancelLabel="Done" width={480}>
      <ListSection header="Color events" footer="Only you see your colors. Nobody else’s calendar changes.">
        {MODES.map(m => (
          <ListRow key={m.key} title={m.title} subtitle={m.detail} checked={prefs.mode === m.key} onPress={() => setMode(m.key)} />
        ))}
      </ListSection>

      <ListSection header="Calendars" separatorInset={56}>
        {/* Plans with people but no group: you and Fran, say. */}
        {(() => {
          const col = calendarColor(null, prefs, order);
          return (
            <ListRow leading={<View style={{ width: 24, alignItems: 'center' }}><Swatch color={col} /></View>} title="Personal" subtitle="Plans with people, not a group"
              trailing={<ColorPick color={col} label="Personal" onPick={cl => setCalendarColor(PERSONAL, cl)} />} />
          );
        })()}
        {calendars.map(g => {
          const col = calendarColor(g.id, prefs, order, g.avatar_color);
          return (
            <ListRow key={g.id} leading={<View style={{ width: 24, alignItems: 'center' }}><Swatch color={col} /></View>} title={g.name}
              trailing={<ColorPick color={col} label={g.name} onPick={cl => setCalendarColor(g.id, cl)} />} />
          );
        })}
      </ListSection>

      <ListSection header="Categories" footer="File an event under a category from the event itself." separatorInset={56}>
        {prefs.categories.map(cat => (
          <ListRow
            key={cat.id}
            leading={<View style={{ width: 24, alignItems: 'center' }}><Swatch color={cat.color} /></View>}
            title={cat.name}
            trailing={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair }}>
                <ColorPick color={cat.color} label={cat.name} onPick={cl => setCategoryColor(cat.id, cl)} />
                <IconButton icon="trash-outline" label={`Delete ${cat.name}`} onPress={() => remove(cat.id, cat.name)} />
              </View>
            }
          />
        ))}
      </ListSection>

      <View style={{ gap: space.m }}>
        <Field label="New category" value={name} onChangeText={setName} placeholder="Date night, Work, Fitness…" onSubmitEditing={add} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
          <ColorPick color={color} label="New category color" onPick={setColor} />
          <View style={{ flex: 1 }} />
          <Button label="Add Category" variant="gray" icon="add" onPress={add} disabled={!name.trim()} />
        </View>
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

