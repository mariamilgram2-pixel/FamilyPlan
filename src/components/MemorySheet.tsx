// "How was it?" — add photos and/or a note to an event that's happened.
// Everyone who came sees them in the event's Memories.

import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/alert';
import { sendNotifications } from '../lib/notifications';
import { DEMO_COMMENTS } from '../lib/demo';
import { MAX_PHOTOS, PickedPhoto, pickPhotos, uploadPhotos } from '../lib/memories';
import { Field, Icon, IconButton, Sheet, Tappable, Txt } from './ui';
import { continuous, radius, space, useTheme } from '../theme';

export interface MemoryTarget {
  eventId: string;              // the series row for repeating events
  title: string;
  when: string;                 // "Today", "Sat, Oct 10"
  recipients: string[];         // who came; you're left out of notifications
}

const TILE = 96;

export default function MemorySheet({ target, onClose, onSaved, meId, myName, isDemo }: {
  target: MemoryTarget | null;
  onClose: () => void;
  onSaved: () => void;
  meId: string | null;
  myName: string;
  isDemo: boolean;
}) {
  const { c } = useTheme();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (target) { setPhotos([]); setNote(''); setSaving(false); } }, [target]);

  async function addPhotos() {
    try {
      const picked = await pickPhotos(MAX_PHOTOS - photos.length);
      setPhotos(prev => [...prev, ...picked].slice(0, MAX_PHOTOS));
    } catch (e: any) {
      notify('Couldn’t open photos', e?.message ?? 'Try again.');
    }
  }

  async function share() {
    if (!target || !meId) return;
    const body = note.trim();
    if (!body && !photos.length) return;
    if (isDemo) {
      // Demo memories keep the picked images as-is, in memory.
      DEMO_COMMENTS.push({
        id: `m-${Date.now()}`, event_id: target.eventId, idea_id: null, user_id: meId,
        body, photo_urls: photos.map(p => p.uri), created_at: new Date().toISOString(),
      });
      onSaved(); onClose();
      return;
    }
    setSaving(true);
    try {
      const paths = await uploadPhotos(target.eventId, meId, photos);
      const { error } = await supabase.from('plan_comments').insert({
        event_id: target.eventId, idea_id: null, user_id: meId, body, photo_urls: paths,
      } as any);
      if (error) throw error;
      const what = [photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : null, body ? `“${body.length > 100 ? `${body.slice(0, 99)}…` : body}”` : null]
        .filter(Boolean).join(' · ');
      await sendNotifications(target.recipients.filter(id => id !== meId).map(uid => ({
        user_id: uid, actor_id: meId, kind: 'comment' as const, idea_id: null, event_id: target.eventId,
        title: `${myName} added memories from ${target.title}`, body: what,
      })), false);
      onSaved(); onClose();
    } catch (e: any) {
      notify('Couldn’t share your memories', e?.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={!!target}
      onClose={onClose}
      title="Add Memories"
      action={{ label: 'Share', onPress: share, disabled: !note.trim() && !photos.length, loading: saving }}
    >
      {target ? (
        <View style={{ gap: space.hair, paddingHorizontal: space.m }}>
          <Txt v="title" accessibilityRole="header">{target.title}</Txt>
          <Txt v="callout" tone="secondary">{target.when}</Txt>
        </View>
      ) : null}

      {/* Photos: a grid that ends in an "add" tile. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, paddingHorizontal: space.m }}>
        {photos.map((p, i) => (
          <View key={`${p.uri}-${i}`} style={{ width: TILE, height: TILE }}>
            <Image source={{ uri: p.uri }} style={{ width: TILE, height: TILE, borderRadius: radius.row, backgroundColor: c.fill }} accessibilityLabel={`Photo ${i + 1}`} />
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
              width: TILE, height: TILE, borderRadius: radius.row, ...continuous,
              borderWidth: 2, borderStyle: 'dashed', borderColor: c.tint,
              alignItems: 'center', justifyContent: 'center', gap: space.hair, backgroundColor: c.tintSoft,
            }}
          >
            <Icon name="images-outline" size={26} color={c.tint} />
            <Txt v="caption" tone="tint" semibold>{photos.length ? 'More' : 'Add Photos'}</Txt>
          </Tappable>
        ) : null}
      </View>

      <Field
        label="Note"
        value={note}
        onChangeText={setNote}
        placeholder="What was the best part?"
        multiline
        maxLength={1000}
      />

      <View style={{ flexDirection: 'row', gap: space.s, paddingHorizontal: space.m, alignItems: 'flex-start' }}>
        <Icon name="people-outline" size={16} color={c.secondaryLabel} style={{ marginTop: 1 }} />
        <Txt v="footnote" tone="secondary" style={{ flex: 1 }}>Shared with everyone who came. Photos stay private to them.</Txt>
      </View>
    </Sheet>
  );
}
