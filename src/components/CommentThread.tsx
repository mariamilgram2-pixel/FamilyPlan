// A short conversation on a plan: sort out rides, ask a question, say you're
// excited. Once the event has happened the same thread becomes "Memories",
// where people add photos and notes through the Add Memories sheet.

import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/alert';
import { sendNotifications } from '../lib/notifications';
import { DEMO_COMMENTS } from '../lib/demo';
import { photoLinks } from '../lib/memories';
import { usePlanComposer } from './PlanComposer';
import { PlanComment } from '../types';
import Avatar, { AvatarPerson } from './Avatar';
import { Button, Field, IconButton, ListSection, Tappable, Txt } from './ui';
import { radius, space, useTheme, brand } from '../theme';

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

export default function CommentThread({ eventId, ideaId, planTitle, meId, myName, personOf, recipients, isDemo, memories, onAddMemories }: {
  eventId?: string;
  ideaId?: string;
  planTitle: string;
  meId: string | null;
  myName: string;
  personOf: (id: string) => AvatarPerson;
  recipients: string[];        // who hears about a new comment (you're left out)
  isDemo: boolean;
  memories?: boolean;          // after the event
  onAddMemories?: () => void;  // photos + note sheet, instead of the text box
}) {
  const { c } = useTheme();
  const { version } = usePlanComposer();
  const [items, setItems] = useState<PlanComment[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});   // storage path → viewable URL
  const [viewing, setViewing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    if (isDemo) {
      setItems(DEMO_COMMENTS.filter(m => (eventId ? m.event_id === eventId : m.idea_id === ideaId)));
      return;
    }
    const q = supabase.from('plan_comments').select('*').order('created_at', { ascending: true });
    const { data } = await (eventId ? q.eq('event_id', eventId) : q.eq('idea_id', ideaId!));
    const rows = (data as PlanComment[]) ?? [];
    setItems(rows);
    setLinks(await photoLinks(rows.flatMap(r => r.photo_urls ?? [])));
  }

  useEffect(() => { setDraft(''); load(); }, [eventId, ideaId, isDemo, version]);
  const src = (path: string) => (isDemo ? path : links[path]);

  async function send() {
    const body = draft.trim();
    if (!body || !meId) return;
    const row = { event_id: eventId ?? null, idea_id: ideaId ?? null, user_id: meId, body };
    if (isDemo) {
      DEMO_COMMENTS.push({ ...row, id: `m-${Date.now()}`, created_at: new Date().toISOString() });
      setDraft('');
      load();
      return;
    }
    setSending(true);
    const { error } = await supabase.from('plan_comments').insert(row as any);
    if (error) { setSending(false); return notify('Couldn’t post', error.message); }
    await sendNotifications(recipients.filter(id => id !== meId).map(uid => ({
      user_id: uid, actor_id: meId, kind: 'comment' as const, idea_id: ideaId ?? null, event_id: eventId ?? null,
      title: `${myName} ${memories ? 'shared a memory from' : 'commented on'} ${planTitle}`,
      body: body.length > 140 ? `${body.slice(0, 139)}…` : body,
    })), false);
    setSending(false);
    setDraft('');
    load();
  }

  return (
    <View style={{ gap: space.s }}>
      <ListSection header={memories ? `Memories${items.length ? ` · ${items.length}` : ''}` : `Conversation${items.length ? ` · ${items.length}` : ''}`} separatorInset={60}>
        {items.length === 0 ? (
          <View style={{ padding: space.m }}>
            <Txt v="callout" tone="secondary">
              {memories ? 'No memories yet. Add photos or a note from the day.' : 'Sort out rides, ask a question, or say you’re excited.'}
            </Txt>
          </View>
        ) : items.map(m => {
          const p = personOf(m.user_id);
          const name = m.user_id === meId ? 'You' : (p.full_name ?? 'Someone').split(' ')[0];
          return (
            <View key={m.id} style={{ flexDirection: 'row', gap: space.m, padding: space.m, alignItems: 'flex-start' }}>
              <Avatar person={p} size={28} highlight={m.user_id === meId} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt v="footnote" tone="secondary"><Txt v="footnote" semibold>{name}</Txt>{`  ${ago(m.created_at)}`}</Txt>
                {m.body ? <Txt v="body">{m.body}</Txt> : null}
                {m.photo_urls?.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingTop: space.hair }}>
                    {m.photo_urls.map((p, i) => src(p) ? (
                      <Tappable key={p} feedback="opacity" onPress={() => setViewing(src(p)!)} accessibilityLabel={`Photo ${i + 1} from ${name}`}>
                        <Image source={{ uri: src(p) }} style={{ width: 88, height: 88, borderRadius: radius.row, backgroundColor: c.background }} />
                      </Tappable>
                    ) : null)}
                  </ScrollView>
                ) : null}
              </View>
            </View>
          );
        })}
      </ListSection>
      {memories && onAddMemories ? (
        <Button label="Add Memories" icon="images-outline" onPress={onAddMemories} block />
      ) : meId ? (
        <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Field
              value={draft}
              onChangeText={setDraft}
              placeholder={memories ? 'Add a memory…' : 'Add a comment…'}
              accessibilityLabel={memories ? 'Add a memory' : 'Add a comment'}
              maxLength={1000}
              multiline
            />
          </View>
          <Button label="Post" variant="gray" onPress={send} disabled={!draft.trim()} loading={sending} />
        </View>
      ) : null}

      {/* Full-size photo. */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable onPress={() => setViewing(null)} accessibilityLabel="Close photo" style={{ flex: 1, backgroundColor: brand.photoBackdrop, alignItems: 'center', justifyContent: 'center' }}>
          {viewing ? <Image source={{ uri: viewing }} resizeMode="contain" style={{ width: '100%', height: '80%' }} /> : null}
          <IconButton icon="close" label="Close photo" variant="gray" onPress={() => setViewing(null)} style={{ position: 'absolute', top: space.xl, right: space.m }} />
        </Pressable>
      </Modal>
    </View>
  );
}
