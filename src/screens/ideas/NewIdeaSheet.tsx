// A new idea, like typing a message: write it out, then save it as a draft
// (just yours, or with people you add, who can add notes too), or start
// planning it. The first line is its title; anything after is notes.

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Group, Profile } from '../../types';
import { Button, Field, Sheet, Txt } from '../../components/ui';
import { space, useTheme } from '../../theme';
import { AudiencePicker, ShareTarget, chosenLabels } from './ShareSheet';

export interface NewIdeaText { title: string; notes: string | null }

/** First line as the title, the rest as notes. */
export function splitIdea(text: string): NewIdeaText {
  const [first, ...rest] = text.trim().split('\n');
  const notes = rest.join('\n').trim();
  return { title: first.trim().slice(0, 200), notes: notes || null };
}

export default function NewIdeaSheet({ visible, groups, people, onClose, onSave, onStartPlanning }: {
  visible: boolean;
  groups: Group[];
  people: Profile[];          // everyone you share a group with, not you
  onClose: () => void;
  onSave: (idea: NewIdeaText, with_: ShareTarget) => Promise<boolean>;
  onStartPlanning: (idea: NewIdeaText, with_: ShareTarget) => void;
}) {
  const { c } = useTheme();
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);       // the people picker is open
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  const [userIds, setUserIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setText(''); setAdding(false); setGroupIds(new Set()); setUserIds(new Set()); setSaving(false);
  }, [visible]);

  const ready = !!text.trim();
  const chosen = chosenLabels(groups, people, groupIds, userIds).map(ch => ch.label);
  const target = (): ShareTarget => ({ groupIds: Array.from(groupIds), userIds: Array.from(userIds) });
  const withWhom = chosen.length <= 2 ? chosen.join(' and ') : `${chosen.slice(0, -1).join(', ')} and ${chosen[chosen.length - 1]}`;

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    const ok = await onSave(splitIdea(text), target());
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="New Idea">
      <View style={{ gap: space.l }}>
        <Field
          value={text}
          onChangeText={setText}
          placeholder="What would be fun to do?"
          accessibilityLabel="Your idea"
          maxLength={4000}
          multiline
          autoFocus
          style={{ minHeight: 140, fontSize: 18, lineHeight: 26 }}
        />

        <View style={{ gap: space.s }}>
          <Button label="Save Draft" icon="bookmark-outline" onPress={save} disabled={!ready} loading={saving} block />
          <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m, color: c.secondaryLabel }}>
            {chosen.length ? `Saved with ${withWhom}. They can add notes and suggestions.` : 'Only you can see it until you add people or share it.'}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: space.s }}>
          {!adding ? (
            <View style={{ flex: 1 }}>
              <Button label="Add People" icon="person-add-outline" variant="gray" onPress={() => setAdding(true)} block />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button label="Start Planning" icon="calendar-outline" variant="gray" onPress={() => onStartPlanning(splitIdea(text), target())} disabled={!ready} block />
          </View>
        </View>

        {/* Below the buttons, so Save stays in reach while you pick. */}
        {adding ? (
          <AudiencePicker
            groups={groups}
            people={people}
            groupIds={groupIds}
            userIds={userIds}
            onChange={(g, u) => { setGroupIds(g); setUserIds(u); }}
            hint="Anyone you add sees the draft and can add notes and suggestions."
          />
        ) : null}
      </View>
    </Sheet>
  );
}
