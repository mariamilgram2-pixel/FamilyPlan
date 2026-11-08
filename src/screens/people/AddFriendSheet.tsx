// Add Friend: type someone's phone number or email; if they're on sheep, send
// a request. Only exact matches come back (see find_people), so nobody can
// browse who's on sheep. Requests you've sent wait at the bottom, to cancel.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Avatar from '../../components/Avatar';
import { Button, Field, ListRow, ListSection, Sheet, Txt } from '../../components/ui';
import { FoundPerson, FriendStatus, Request, findPeople } from '../../lib/friends';
import { looksLikePhone } from '../../lib/phone';
import { Friendship } from '../../types';
import { space, useTheme } from '../../theme';

export default function AddFriendSheet({ visible, onClose, statusWith, outgoing, onSend, onCancelRequest, isDemo }: {
  visible: boolean;
  onClose: () => void;
  statusWith: (userId: string) => FriendStatus;
  outgoing: Request[];
  onSend: (userId: string) => Promise<boolean>;
  onCancelRequest: (f: Friendship) => Promise<boolean>;
  isDemo: boolean;
}) {
  const { c } = useTheme();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<FoundPerson[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => { if (visible) { setQuery(''); setFound(null); } }, [visible]);

  const q = query.trim();
  const isEmail = /^\S+@\S+\.\S+$/.test(q);
  const canSearch = isEmail || looksLikePhone(q);

  async function search() {
    if (!canSearch) return;
    if (isDemo) { setFound([]); return; }
    setSearching(true);
    setFound(await findPeople(isEmail ? [] : [q], isEmail ? q : null));
    setSearching(false);
  }

  async function send(id: string) {
    setSending(id);
    await onSend(id);
    setSending(null);
  }

  const action = (p: FoundPerson) => {
    const status = statusWith(p.id);
    if (status === 'friends') return <Txt v="footnote" tone="secondary">Friends</Txt>;
    if (status === 'sent') return <Txt v="footnote" tone="secondary">Requested</Txt>;
    if (status === 'received') return <Txt v="footnote" tone="secondary">Wants to be friends</Txt>;
    return <Button small label="Add Friend" onPress={() => send(p.id)} loading={sending === p.id} />;
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Add Friend" cancelLabel="Done" width={480}>
      <Field
        label="Phone number or email"
        value={query}
        onChangeText={(t) => { setQuery(t); setFound(null); }}
        placeholder="(555) 123-4567 or name@email.com"
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        returnKeyType="search"
        onSubmitEditing={search}
        hint="The whole number or email. If they’re on sheep, you can send a request."
      />
      <Button label="Find" icon="search" onPress={search} disabled={!canSearch} loading={searching} block />

      {searching ? <ActivityIndicator color={c.secondaryLabel} /> : found ? (
        found.length ? (
          <ListSection separatorInset={64}>
            {found.map(p => (
              <ListRow key={p.id} leading={<Avatar person={p} size={36} />} title={p.full_name ?? 'Someone on sheep'} trailing={action(p)} />
            ))}
          </ListSection>
        ) : (
          <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>
            {isDemo ? 'Sign in to find friends on sheep.' : 'No one on sheep with that yet. Add them as a person and invite them to sheep.'}
          </Txt>
        )
      ) : null}

      {outgoing.length ? (
        <View>
          <ListSection header="Requests you sent" separatorInset={64}>
            {outgoing.map(r => (
              <ListRow
                key={r.friendship.id}
                leading={<Avatar person={r.person} size={32} />}
                title={r.person.full_name ?? r.person.email}
                trailing={<Button small variant="plain" label="Cancel" onPress={() => onCancelRequest(r.friendship)} />}
              />
            ))}
          </ListSection>
        </View>
      ) : null}
    </Sheet>
  );
}
