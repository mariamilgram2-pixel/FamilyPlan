// Connected calendars, from Profile. Before anything's connected: what
// connecting does, and one button, which asks for access to the phone's
// calendars and connects the ones worth counting (not birthdays or
// holidays). After: every calendar on the phone, by account, each with a
// switch; turning one off deletes what sheep copied from it. Calendars
// connected from another phone are listed too, so they can be turned off
// here. On web there's no phone to read, so it says to connect from the app.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Icon, IconButton, ListRow, ListSection, Sheet, Toggle, Txt } from '../../components/ui';
import { space, useTheme } from '../../theme';
import { CALENDAR_DISCLOSURE } from '../../lib/availability';
import {
  CalendarAccess, PhoneCalendar, askCalendarAccess, calendarAccess, disconnectCalendar, phoneCalendarsFor,
  phoneCalendarsSupported, syncPhoneCalendars, useConnectedCalendars,
} from '../../lib/phoneCalendars';
import { CalendarConnection } from '../../types';
import { syncedAgo } from '../../lib/calendarItems';

function Dot({ color }: { color: string }) {
  return <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />;
}

export default function ConnectedCalendarsSheet({ visible, onClose, demo, firstRun = false }: {
  visible: boolean; onClose: () => void; demo: boolean;
  /** Opened as the first thing to do: a skippable intro. */
  firstRun?: boolean;
}) {
  const { c } = useTheme();
  const store = useConnectedCalendars(demo);
  // A browser in demo pretends to be a phone; otherwise a browser can only list and disconnect.
  const canRead = phoneCalendarsSupported || demo;
  const [access, setAccess] = useState<CalendarAccess | 'unknown'>('unknown');
  const [onPhone, setOnPhone] = useState<PhoneCalendar[] | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const device = store.connections.filter(x => x.provider === 'device');
  const connOf = (p: PhoneCalendar) => device.find(x => x.remote_calendar_id === p.id);
  const elsewhere = store.connections.filter(x => !onPhone?.some(p => p.id === x.remote_calendar_id));
  const lastSync = device.map(x => x.last_synced_at).filter(Boolean).sort().pop() ?? null;

  // Opening: if access was already given, list the phone's calendars.
  useEffect(() => {
    if (!visible || !canRead) return;
    let cancelled = false;
    (async () => {
      const a = phoneCalendarsSupported ? await calendarAccess() : (device.length ? 'granted' : 'ask');
      if (cancelled) return;
      setAccess(a);
      if (a === 'granted') setOnPhone(await phoneCalendarsFor(demo));
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [visible, demo]);

  // The one button: ask, then connect the calendars worth counting.
  async function connect() {
    setWorking('connect');
    try {
      const a = phoneCalendarsSupported ? await askCalendarAccess(access === 'unknown' ? 'ask' : access) : 'granted';
      setAccess(a);
      if (a !== 'granted') return;
      const list = await phoneCalendarsFor(demo);
      setOnPhone(list);
      const pick = list.filter(p => p.suggested);
      if (pick.length) await syncPhoneCalendars(pick);
    } finally {
      setWorking(null);
    }
  }

  async function toggle(p: PhoneCalendar, on: boolean) {
    setWorking(p.id);
    const conn = connOf(p);
    if (on) await syncPhoneCalendars([p]);
    else if (conn) await disconnectCalendar(conn.id);
    setWorking(null);
  }

  async function syncNow() {
    const connected = (onPhone ?? []).filter(p => connOf(p));
    if (connected.length) await syncPhoneCalendars(connected);
  }

  const accounts = Array.from(new Set((onPhone ?? []).map(p => p.account)));
  const nothingYet = store.connections.length === 0;

  const disclosure = (
    <View style={{ gap: space.s, paddingHorizontal: space.m }}>
      {CALENDAR_DISCLOSURE.map(line => (
        <View key={line} style={{ flexDirection: 'row', gap: space.s, alignItems: 'flex-start' }}>
          <Icon name="checkmark-circle" size={18} color={c.tint} style={{ marginTop: 1 }} />
          <Txt v="callout" style={{ flex: 1 }}>{line}</Txt>
        </View>
      ))}
    </View>
  );

  const elsewhereRow = (x: CalendarConnection) => (
    <ListRow
      key={x.id}
      icon="calendar-outline"
      title={x.calendar_name ?? 'Calendar'}
      subtitle={[x.account_label, `synced ${syncedAgo(x.last_synced_at)}`].filter(Boolean).join(' · ')}
      trailing={working === x.id ? <ActivityIndicator color={c.secondaryLabel} /> : (
        <IconButton icon="close-circle-outline" label={`Disconnect ${x.calendar_name ?? 'calendar'}`}
          onPress={async () => { setWorking(x.id); await disconnectCalendar(x.id); setWorking(null); }} />
      )}
    />
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={firstRun ? 'Welcome to sheep' : 'Connected calendars'}
      cancelLabel={firstRun && store.connections.length === 0 ? 'Not now' : 'Done'}
      width={520}
    >
      <View style={{ gap: space.hair, paddingHorizontal: space.m }}>
        <Txt v="title" accessibilityRole="header">{firstRun ? 'First, your calendars' : 'Your calendars, in sheep'}</Txt>
        <Txt v="callout" tone="secondary">
          So sheep knows when you’re busy and suggests times that work. Includes iCloud, and any Google, Outlook or work account on your phone.
        </Txt>
      </View>

      {!canRead ? (
        <>
          <ListSection footer="Connecting reads the calendars on your phone, so it’s done from the sheep app on your iPhone or Android.">
            <ListRow icon="phone-portrait-outline" title="Connect from your phone" subtitle="Profile › Connected calendars, in the app" />
          </ListSection>
          {store.connections.length ? (
            <ListSection header="Connected" separatorInset={52}>{store.connections.map(elsewhereRow)}</ListSection>
          ) : disclosure}
        </>
      ) : access !== 'granted' || (nothingYet && !onPhone) ? (
        <>
          {disclosure}
          <View style={{ paddingHorizontal: space.m, gap: space.s }}>
            <Button
              label={access === 'blocked' ? 'Open Settings' : 'Connect my calendars'}
              icon={access === 'blocked' ? 'settings-outline' : 'calendar-outline'}
              onPress={connect}
              loading={working === 'connect' || store.syncing}
              block
            />
            {access === 'blocked' ? (
              <Txt v="footnote" tone="secondary">Calendar access is off for sheep. Turn on Calendars for sheep in Settings, then come back.</Txt>
            ) : null}
          </View>
        </>
      ) : !onPhone ? (
        <ActivityIndicator color={c.secondaryLabel} />
      ) : (
        <>
          {accounts.map(account => (
            <ListSection key={account} header={account} separatorInset={52}>
              {onPhone.filter(p => p.account === account).map(p => (
                <ListRow
                  key={p.id}
                  leading={<Dot color={p.color} />}
                  title={p.name}
                  trailing={working === p.id ? <ActivityIndicator color={c.secondaryLabel} /> : (
                    <Toggle label={`Use ${p.name}`} value={!!connOf(p)} onValueChange={v => toggle(p, v)} />
                  )}
                />
              ))}
            </ListSection>
          ))}
          {onPhone.length === 0 ? (
            <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>No calendars on this phone yet.</Txt>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.m, gap: space.s }}>
            <Txt v="footnote" tone={store.error ? 'danger' : 'secondary'} style={{ flex: 1 }}>
              {store.syncing ? 'Syncing…' : store.error ? store.error : device.length ? `Synced ${syncedAgo(lastSync)}. Syncs again when you open sheep.` : 'Turn on the calendars sheep should use.'}
            </Txt>
            {device.length ? <Button label="Sync now" variant="plain" small onPress={syncNow} disabled={store.syncing} /> : null}
          </View>

          {elsewhere.length ? (
            <ListSection header="Connected on another device" separatorInset={52}>{elsewhere.map(elsewhereRow)}</ListSection>
          ) : null}

          <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>
            Only you see your events. Others only ever see counts like “3 of 4 calendars look free”. Sheep never changes your calendars, and turning one off deletes what sheep copied from it.
          </Txt>
        </>
      )}
    </Sheet>
  );
}
