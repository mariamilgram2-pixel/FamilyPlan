// "Set up sheep": right after making an account, and from Profile any time.
// A short list of optional things, each ticked off when it's done:
//   Connect your calendars   — so sheep knows when you're busy
//   Add people from contacts — the people you plan with, ready to pick
//   Your birthday            — people you plan with get a nudge
//   Start or join a group    — shared calendars, later is fine
//   Your work hours          — shown on your calendar
// Nothing is required; "Finish later" closes it.
//
// The sheets these open live inside this one: on iPhone a sheet can only
// open on top of the one that's showing if it's inside it.

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Field, ListRow, ListSection, Sheet, Txt } from '../../components/ui';
import { space } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup } from '../../contexts/GroupContext';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/alert';
import { birthdayText, parseBirthday } from '../../lib/birthday';
import { useConnectedCalendars } from '../../lib/phoneCalendars';
import { useWorkSchedules } from '../../lib/workSchedule';
import { CreateGroupSheet, JoinGroupSheet } from '../../components/GroupSwitcher';
import ConnectedCalendarsSheet from '../calendar/ConnectedCalendarsSheet';
import ImportContactsSheet from '../people/ImportContactsSheet';
import WorkScheduleSheet from '../work/WorkScheduleSheet';

type Step = 'calendars' | 'contacts' | 'birthday' | 'group' | 'join' | 'work';

export default function SetupSheet({ visible, onClose, demo, welcome = false }: {
  visible: boolean;
  onClose: () => void;
  demo: boolean;
  /** Just made an account: say hello. */
  welcome?: boolean;
}) {
  const { user, profile, refreshProfile } = useAuth();
  const { groups } = useGroup();
  const cals = useConnectedCalendars(demo);
  const work = useWorkSchedules();
  const [open, setOpen] = useState<Step | null>(null);
  const [peopleCount, setPeopleCount] = useState(0);
  const [bday, setBday] = useState('');
  const [savingBday, setSavingBday] = useState(false);

  // How many people you have, to tick that off.
  useEffect(() => {
    if (!visible || demo || !user) return;
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('owner_id', user.id)
      .then(({ count }) => setPeopleCount(count ?? 0));
  }, [visible, demo, user?.id, open]);

  useEffect(() => { if (open === 'birthday') setBday(birthdayText(profile?.birthday)); }, [open]);

  async function saveBirthday() {
    const b = parseBirthday(bday);
    if (b === undefined) return notify('Check your birthday', 'Use month and day, like 10/23.');
    if (demo || !user) { setOpen(null); return; }
    setSavingBday(true);
    const { error } = await supabase.from('profiles').update({ birthday: b } as any).eq('id', user.id);
    setSavingBday(false);
    if (error) return notify('Couldn’t save', error.message);
    await refreshProfile();
    setOpen(null);
  }

  const done = {
    calendars: cals.connections.length > 0,
    contacts: peopleCount > 0,
    birthday: !!profile?.birthday,
    group: groups.length > 0,
    work: work.length > 0,
  };
  const doneCount = Object.values(done).filter(Boolean).length;
  const first = (profile?.full_name ?? '').split(' ')[0];

  const step = (key: keyof typeof done, icon: React.ComponentProps<typeof ListRow>['icon'], title: string, detail: string, onPress: () => void, value?: string) => (
    <ListRow
      key={key}
      icon={done[key] ? 'checkmark-circle' : icon}
      title={title}
      subtitle={detail}
      value={value}
      chevron
      onPress={onPress}
    />
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={welcome ? 'Welcome to sheep' : 'Set up sheep'}
      cancelLabel={doneCount ? 'Done' : 'Finish later'}
      width={520}
    >
      <View style={{ gap: space.hair, paddingHorizontal: space.m }}>
        <Txt v="title" accessibilityRole="header">{welcome ? `You’re in${first ? `, ${first}` : ''}!` : 'Set up sheep'}</Txt>
        <Txt v="callout" tone="secondary">
          A few things that make plans easier. All optional; do any now, or later from Profile.
        </Txt>
      </View>

      <ListSection footer={`${doneCount} of 5 done`} separatorInset={52}>
        {step('calendars', 'calendar-outline', 'Connect your calendars', 'See when you’re busy', () => setOpen('calendars'),
          done.calendars ? `${cals.connections.length}` : undefined)}
        {step('contacts', 'book-outline', 'Add people from contacts', 'Have them ready for plans', () => setOpen('contacts'),
          done.contacts ? `${peopleCount}` : undefined)}
        {step('birthday', 'gift-outline', 'Your birthday', 'So friends can celebrate', () => setOpen('birthday'),
          done.birthday ? birthdayText(profile?.birthday) : undefined)}
        {step('group', 'people-outline', 'Start a group', 'A shared calendar', () => setOpen('group'),
          done.group ? `${groups.length}` : undefined)}
        <ListRow key="join" icon="enter-outline" title="Join a group with a code" subtitle="From an invite" chevron onPress={() => setOpen('join')} />
        {step('work', 'briefcase-outline', 'Your work hours', 'Plans fit around them', () => setOpen('work'))}
      </ListSection>

      <View style={{ paddingHorizontal: space.m }}>
        <Button label={doneCount ? 'Done' : 'Finish later'} variant={doneCount ? 'filled' : 'plain'} onPress={onClose} block />
      </View>

      {/* What each step opens, inside this sheet. */}
      <ConnectedCalendarsSheet visible={open === 'calendars'} onClose={() => setOpen(null)} demo={demo} />
      <ImportContactsSheet visible={open === 'contacts'} onClose={() => setOpen(null)} demo={demo} onAdded={n => setPeopleCount(c => c + n)} />
      <WorkScheduleSheet visible={open === 'work'} onClose={() => setOpen(null)} editing={null} hasOngoing={work.some(w => w.scope.kind === 'ongoing')} />
      <CreateGroupSheet visible={open === 'group'} onClose={() => setOpen(null)} />
      <JoinGroupSheet visible={open === 'join'} onClose={() => setOpen(null)} />
      <Sheet
        visible={open === 'birthday'}
        onClose={() => setOpen(null)}
        title="Your birthday"
        action={{ label: 'Save', onPress: saveBirthday, loading: savingBday }}
        width={420}
      >
        <Field
          label="Birthday"
          value={bday}
          onChangeText={setBday}
          placeholder="MM/DD"
          keyboardType="numbers-and-punctuation"
          autoFocus
          hint="Just the month and day. People you plan with get a nudge to celebrate."
        />
      </Sheet>
    </Sheet>
  );
}
