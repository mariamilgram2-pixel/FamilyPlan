// Edit Group, from the top right of a group's page: its photo, name, and
// background. Everyone in the group sees the changes. Nothing's kept until
// Save. A group without a shared calendar can go without a name (it goes by
// who's in it); a shared calendar needs one. The background colors its cover
// and flock, and is a shared calendar's color for anyone who hasn't picked
// their own in You › Calendar colors.

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Field, Menu, Sheet, Tappable, Txt } from '../../components/ui';
import { GroupFlock } from '../../components/GroupFlock';
import { Group } from '../../types';
import { PALETTE } from '../../lib/calendarColors';
import { isCalendar } from '../../lib/groups';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/alert';
import { PickedPhoto, pickProfilePhoto, uploadProfilePhoto } from '../../lib/profilePhoto';
import { eyebrow, space, useTheme } from '../../theme';

export default function EditGroupSheet({ visible, group, memberCount, meId, isDemo, onClose, onSaved }: {
  visible: boolean;
  group: Group | null;
  memberCount: number;
  meId: string | null;
  isDemo: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);       // a new one, uploaded on Save
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !group) return;
    setName(group.named === false ? '' : group.name);
    setColor(group.avatar_color ?? null);
    setPhoto(null); setRemovePhoto(false);
  }, [visible, group?.id]);

  if (!group) return null;
  const calendar = isCalendar(group);
  const shownPhoto = photo?.uri ?? (removePhoto ? null : group.avatar_url ?? null);
  const preview: Group = { ...group, name: name || group.name, avatar_url: shownPhoto, avatar_color: color };

  async function choosePhoto() {
    const p = await pickProfilePhoto();
    if (p) { setPhoto(p); setRemovePhoto(false); }
  }

  async function save() {
    if (!group) return;
    if (calendar && !name.trim()) return notify('Name required', 'A shared calendar needs a name.');
    if (isDemo || !meId) return notify('Demo mode', 'Sign in to edit groups.');
    setSaving(true);
    try {
      const avatar_url = photo ? await uploadProfilePhoto(meId, photo) : removePhoto ? null : group.avatar_url ?? null;
      const { error } = await supabase.from('groups')
        .update({ name: name.trim() || null, avatar_url, avatar_color: color } as any).eq('id', group.id);
      if (error) throw error;
      await onSaved();
      onClose();
    } catch (e: any) {
      notify('Couldn’t save the group', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const photoItems = [
    { key: 'library', label: 'Choose from Library…', icon: 'images-outline' as const, onSelect: choosePhoto },
    ...(shownPhoto ? [{ key: 'remove', label: 'Remove Photo', icon: 'trash-outline' as const, destructive: true, onSelect: () => { setPhoto(null); setRemovePhoto(true); } }] : []),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="Edit Group" width={480} action={{ label: 'Save', onPress: save, loading: saving }}>
      <View style={{ alignItems: 'center', gap: space.s }}>
        <GroupFlock group={preview} count={memberCount} size={96} />
        <Menu title="Group photo" sections={[{ items: photoItems }]}>
          {(open) => <Button label={shownPhoto ? 'Change Photo' : 'Add Photo'} variant="plain" onPress={open} />}
        </Menu>
      </View>

      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder={calendar ? 'The Cohens, Our house…' : group.named === false ? group.name : 'Optional'}
        hint={calendar ? undefined : 'Optional'}
        returnKeyType="done"
      />

      <View style={{ gap: space.s }}>
        <Txt v="footnote" tone="secondary" style={[eyebrow, { paddingHorizontal: space.m }]}>Background</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m, paddingHorizontal: space.m }}>
          {/* Default: the color it'd have anyway. */}
          <Tappable
            feedback="opacity"
            onPress={() => setColor(null)}
            accessibilityLabel={`Default background${color === null ? ', selected' : ''}`}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: color === null ? c.tint : c.separator }}
          >
            <Txt v="caption" tone="secondary">Auto</Txt>
          </Tappable>
          {PALETTE.map(p => {
            const on = color?.toLowerCase() === p.color.toLowerCase();
            return (
              <Tappable
                key={p.color}
                feedback="opacity"
                onPress={() => setColor(p.color)}
                accessibilityLabel={`${p.name} background${on ? ', selected' : ''}`}
                style={{ width: 36, height: 36, borderRadius: 18, padding: 3, borderWidth: 2, borderColor: on ? c.tint : 'transparent' }}
              >
                <View style={{ flex: 1, borderRadius: 14, backgroundColor: p.color }} />
              </Tappable>
            );
          })}
        </View>
        {shownPhoto ? (
          <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>The photo shows instead while it has one.</Txt>
        ) : null}
      </View>
    </Sheet>
  );
}
