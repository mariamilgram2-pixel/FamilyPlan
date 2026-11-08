// Add people from your phone's contacts, several at once: pick them from a
// searchable list and they're saved as your people, with their numbers.
// Anyone whose number is already one of your people is shown as added.
// Asks for access to contacts first; not on web (except the demo's pretend list).

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import Avatar from '../../components/Avatar';
import { Button, Field, ListRow, ListSection, Sheet, Txt } from '../../components/ui';
import { space, useTheme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/alert';
import { addDemoContact, demoContacts, DEMO_ME } from '../../lib/demo';
import { PhoneContact, useDeviceContacts } from '../../lib/deviceContacts';
import { phoneMatches, samePhone } from '../../lib/phone';
import { Contact } from '../../types';

export default function ImportContactsSheet({ visible, onClose, demo, onAdded }: {
  visible: boolean;
  onClose: () => void;
  demo: boolean;
  /** How many were added, after saving. */
  onAdded?: (n: number) => void;
}) {
  const { c } = useTheme();
  const { user } = useAuth();
  const book = useDeviceContacts(visible, demo);
  const [mine, setMine] = useState<Contact[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  // Your people already, so their numbers show as added.
  useEffect(() => {
    if (!visible) return;
    setPicked(new Set()); setQuery('');
    if (demo || !user) { setMine(demoContacts()); return; }
    supabase.from('contacts').select('*').eq('owner_id', user.id)
      .then(({ data }) => setMine((data ?? []) as Contact[]));
  }, [visible, demo, user?.id]);

  // One row per person: the first number (mobile, usually) stands for them.
  const people = useMemo(() => {
    const seen = new Set<string>();
    return book.contacts.filter(pc => {
      const k = pc.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [book.contacts]);

  const already = (pc: PhoneContact) => mine.some(ct => samePhone(ct.phone, pc.phone));
  const q = query.trim().toLowerCase();
  const shown = q
    ? people.filter(pc => pc.name.toLowerCase().split(/\s+/).some(w => w.startsWith(q)) || phoneMatches(pc.phone, q))
    : people;

  const toggle = (key: string) => setPicked(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  async function save() {
    const chosen = people.filter(pc => picked.has(pc.key) && !already(pc));
    if (!chosen.length) return onClose();
    setSaving(true);
    if (demo || !user) {
      chosen.forEach((pc, i) => addDemoContact({
        id: `local-${Date.now()}-${i}`, owner_id: DEMO_ME, name: pc.name, email: null, note: null, phone: pc.phone, created_at: new Date().toISOString(),
      }));
    } else {
      const { error } = await supabase.from('contacts')
        .insert(chosen.map(pc => ({ owner_id: user.id, name: pc.name, phone: pc.phone })) as any);
      if (error) { setSaving(false); return notify('Couldn’t add them', error.message); }
    }
    setSaving(false);
    onAdded?.(chosen.length);
    onClose();
  }

  const count = people.filter(pc => picked.has(pc.key) && !already(pc)).length;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add from contacts"
      action={book.access === 'granted' ? { label: count ? `Add ${count}` : 'Done', onPress: save, loading: saving } : undefined}
      scroll={false}
    >
      {!book.available ? (
        <View style={{ padding: space.m }}>
          <Txt v="callout" tone="secondary">Your phone’s contacts are only reachable from the sheep app on your phone.</Txt>
        </View>
      ) : book.access !== 'granted' ? (
        <View style={{ padding: space.m, gap: space.m }}>
          <Txt v="title" accessibilityRole="header">Add the people you plan with</Txt>
          <Txt v="callout" tone="secondary">
            Pick people from your contacts to have them ready when you make plans. Only the ones you pick are added, and only you see them.
          </Txt>
          <Button
            label={book.access === 'blocked' ? 'Open Settings' : 'Choose from contacts'}
            icon={book.access === 'blocked' ? 'settings-outline' : 'book-outline'}
            onPress={book.ask}
            block
          />
          {book.access === 'blocked' ? (
            <Txt v="footnote" tone="secondary">Contacts are turned off for sheep. Turn them on in Settings, then come back.</Txt>
          ) : null}
        </View>
      ) : (
        <>
          <View style={{ paddingHorizontal: space.m, paddingBottom: space.s }}>
            <Field value={query} onChangeText={setQuery} placeholder="Search contacts" autoCorrect={false} autoCapitalize="none" accessibilityLabel="Search contacts" />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.m, paddingTop: space.s, gap: space.l }} keyboardShouldPersistTaps="handled">
            {book.limited ? (
              <ListSection footer="You let sheep see only some of your contacts. Pick more here, or allow all of them in your iPhone’s Settings.">
                <ListRow icon="person-add-outline" title="Allow more contacts" tintTitle onPress={book.allowMore} />
              </ListSection>
            ) : null}
            {book.loading ? <ActivityIndicator color={c.secondaryLabel} /> : shown.length ? (
              <ListSection separatorInset={64}>
                {shown.map(pc => {
                  const done = already(pc);
                  return (
                    <ListRow
                      key={pc.key}
                      leading={<Avatar person={{ id: pc.key, full_name: pc.name, avatar_url: null }} size={32} />}
                      title={pc.name}
                      subtitle={done ? 'Already one of your people' : pc.phone}
                      checked={done || picked.has(pc.key)}
                      onPress={done ? undefined : () => toggle(pc.key)}
                    />
                  );
                })}
              </ListSection>
            ) : (
              <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>
                {q ? `No one matching “${query.trim()}”.` : 'No contacts with a phone number.'}
              </Txt>
            )}
          </ScrollView>
        </>
      )}
    </Sheet>
  );
}
