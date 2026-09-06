import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Alert, Switch, ActivityIndicator, Modal, Share, Platform,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { supabase } from '../lib/supabase';
import { Profile, Group } from '../types';

const PROFILE_COLORS = ['#8dc76d', '#A0522D', '#6B8E7B', '#7B8EA0', '#A07B8E', '#9B8B6B', '#6B7B8B', '#8B6B7B'];

const CATEGORY_COLORS = [
  '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C',
  '#3498DB', '#9B59B6', '#E91E63', '#795548', '#607D8B',
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD',
];

const REMINDER_OPTIONS = [
  { label: 'None', value: 0 },
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '1 day', value: 1440 },
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

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  eventInvites: true,
  eventChanges: true,
  reminders: true,
};

async function copyToClipboard(text: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // Fallback: clipboard not available — alert shown by caller
  }
}

export default function ProfileScreen({ navigation }: any) {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { groups, activeGroup, fetchGroups, setActiveGroup } = useGroup();
  const isDemo = !user || user.id === 'demo';

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [editEmail, setEditEmail] = useState(user?.email ?? '');
  const [profileColor, setProfileColor] = useState('#8dc76d');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [sharedWithFriends, setSharedWithFriends] = useState(true);
  const [hiddenFriends, setHiddenFriends] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<Profile[]>([]);
  const [showHiddenModal, setShowHiddenModal] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Event categories
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0]);

  // Notification Preferences
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);

  // Default Reminders
  const [defaultReminder, setDefaultReminder] = useState(15); // minutes before

  // Group Management
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [selectedGroupDetail, setSelectedGroupDetail] = useState<Group | null>(null);
  const [groupMemberCounts, setGroupMemberCounts] = useState<Record<string, number>>({});
  const [groupMembersDetail, setGroupMembersDetail] = useState<Profile[]>([]);
  const [loadingGroupDetail, setLoadingGroupDetail] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);

  // Calendar Export
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('event_categories').then(data => {
      if (data) setCategories(JSON.parse(data));
    });
    AsyncStorage.getItem('shared_with_friends').then(data => {
      if (data !== null) setSharedWithFriends(JSON.parse(data));
    });
    AsyncStorage.getItem('hidden_friends').then(data => {
      if (data) setHiddenFriends(JSON.parse(data));
    });
    AsyncStorage.getItem('notification_prefs').then(data => {
      if (data) setNotifPrefs(JSON.parse(data));
    });
    AsyncStorage.getItem('default_reminder').then(data => {
      if (data !== null) setDefaultReminder(JSON.parse(data));
    });
    AsyncStorage.getItem('profile_avatar').then(data => {
      if (data) setAvatarUri(data);
    });
  }, []);

  useEffect(() => {
    if (!activeGroup || activeGroup.id === 'demo') return;
    supabase
      .from('group_members')
      .select('profiles(id, full_name, email)')
      .eq('group_id', activeGroup.id)
      .then(({ data }) => {
        const members = (data ?? []).map((r: any) => r.profiles).filter(Boolean).filter((m: Profile) => m.id !== user?.id);
        setGroupMembers(members);
      });
  }, [activeGroup, user]);

  // Fetch member counts for all groups
  useEffect(() => {
    if (groups.length === 0) return;
    Promise.all(
      groups.map(g =>
        supabase
          .from('group_members')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', g.id)
          .then(({ count }) => ({ groupId: g.id, count: count ?? 0 }))
      )
    ).then(results => {
      const counts: Record<string, number> = {};
      results.forEach(r => { counts[r.groupId] = r.count; });
      setGroupMemberCounts(counts);
    });
  }, [groups]);

  function handleSharedToggle(val: boolean) {
    setSharedWithFriends(val);
    AsyncStorage.setItem('shared_with_friends', JSON.stringify(val));
  }

  function toggleHiddenFriend(id: string) {
    const updated = hiddenFriends.includes(id) ? hiddenFriends.filter(f => f !== id) : [...hiddenFriends, id];
    setHiddenFriends(updated);
    AsyncStorage.setItem('hidden_friends', JSON.stringify(updated));
  }

  function saveCategories(updated: EventCategory[]) {
    setCategories(updated);
    AsyncStorage.setItem('event_categories', JSON.stringify(updated));
  }

  function handleAddCategory() {
    if (!newCategoryName.trim()) {
      Alert.alert('Required', 'Please enter a category name.');
      return;
    }
    const cat: EventCategory = {
      id: Date.now().toString(),
      name: newCategoryName.trim(),
      color: newCategoryColor,
    };
    saveCategories([...categories, cat]);
    setNewCategoryName('');
    setNewCategoryColor(CATEGORY_COLORS[0]);
    setShowCategoryModal(false);
  }

  function handleDeleteCategory(id: string) {
    Alert.alert('Delete category', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => saveCategories(categories.filter(c => c.id !== id)) },
    ]);
  }

  // Notification preference handlers
  function updateNotifPref(key: keyof NotificationPrefs, val: boolean) {
    const updated = { ...notifPrefs, [key]: val };
    setNotifPrefs(updated);
    AsyncStorage.setItem('notification_prefs', JSON.stringify(updated));
  }

  // Default reminder handler
  function handleDefaultReminderChange(minutes: number) {
    setDefaultReminder(minutes);
    AsyncStorage.setItem('default_reminder', JSON.stringify(minutes));
  }

  // Group management handlers
  async function openGroupDetail(group: Group) {
    setSelectedGroupDetail(group);
    setShowGroupModal(true);
    setLoadingGroupDetail(true);
    const { data } = await supabase
      .from('group_members')
      .select('profiles(id, full_name, email), role')
      .eq('group_id', group.id);
    const members = (data ?? []).map((r: any) => ({ ...r.profiles, role: r.role })).filter(Boolean);
    setGroupMembersDetail(members);
    setLoadingGroupDetail(false);
  }

  async function handleLeaveGroup(group: Group) {
    if (!user) return;
    Alert.alert(
      'Leave group',
      `Are you sure you want to leave "${group.name}"? You'll need a new invite code to rejoin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLeavingGroup(true);
            const { error } = await supabase
              .from('group_members')
              .delete()
              .eq('group_id', group.id)
              .eq('user_id', user.id);
            setLeavingGroup(false);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              setShowGroupModal(false);
              await fetchGroups();
            }
          },
        },
      ]
    );
  }

  async function copyInviteCode(code: string) {
    await copyToClipboard(code);
    Alert.alert('Copied!', 'Invite code copied to clipboard.');
  }

  // Calendar export — generate .ics content
  async function handleExportCalendar() {
    if (!activeGroup || activeGroup.id === 'demo') {
      Alert.alert('No group', 'Join a group first to export events.');
      return;
    }
    setExporting(true);
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('group_id', activeGroup.id)
      .order('start_time', { ascending: true });

    if (error) {
      setExporting(false);
      Alert.alert('Error', error.message);
      return;
    }

    const icsEvents = (events ?? []).map(e => {
      const start = e.start_time.replace(/[-:]/g, '').replace(/\.\d+/, '').replace('Z', '') + 'Z';
      const end = e.end_time.replace(/[-:]/g, '').replace(/\.\d+/, '').replace('Z', '') + 'Z';
      return [
        'BEGIN:VEVENT',
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${(e.title || '').replace(/[,;\\]/g, ' ')}`,
        e.location ? `LOCATION:${e.location.replace(/[,;\\]/g, ' ')}` : '',
        e.description ? `DESCRIPTION:${e.description.replace(/\n/g, '\\n').replace(/[,;\\]/g, ' ')}` : '',
        `UID:${e.id}@familyplan`,
        'END:VEVENT',
      ].filter(Boolean).join('\r\n');
    }).join('\r\n');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//FamilyPlan//sheep//EN',
      `X-WR-CALNAME:${activeGroup.name}`,
      icsEvents,
      'END:VCALENDAR',
    ].join('\r\n');

    setExporting(false);

    try {
      await Share.share({
        message: Platform.OS === 'android' ? ics : undefined,
        title: `${activeGroup.name} Calendar`,
        url: Platform.OS === 'ios' ? `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}` : undefined,
      });
    } catch {
      // User cancelled share — copy to clipboard as fallback
      await copyToClipboard(ics);
      Alert.alert('Exported!', 'Calendar data copied to clipboard. Save it as a .ics file to import into your calendar app.');
    }
  }

  // Photo handling
  function handlePickFile() {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          Alert.alert('Too large', 'Please choose an image under 5MB.');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setAvatarUri(dataUrl);
          AsyncStorage.setItem('profile_avatar', dataUrl);
          setShowPhotoModal(false);
        };
        reader.readAsDataURL(file);
      };
      input.click();
    } else {
      Alert.alert('Upload', 'File upload is available on web. Use "Enter image URL" instead.');
    }
  }

  function handleSetPhotoUrl() {
    const url = photoUrlInput.trim();
    if (!url) {
      Alert.alert('Required', 'Please enter an image URL.');
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Alert.alert('Invalid URL', 'Please enter a URL starting with http:// or https://');
      return;
    }
    setAvatarUri(url);
    AsyncStorage.setItem('profile_avatar', url);
    setPhotoUrlInput('');
    setShowPhotoModal(false);
  }

  function handleRemovePhoto() {
    setAvatarUri(null);
    AsyncStorage.removeItem('profile_avatar');
    setShowPhotoModal(false);
  }

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setEditEmail(user?.email ?? '');
  }, [profile, user]);

  async function handleSave() {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }
    if (isDemo) {
      Alert.alert('Demo mode', 'Sign in to save profile changes.');
      return;
    }
    setSaving(true);

    // Update display name in profiles table
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', user!.id);

    if (error) {
      setSaving(false);
      Alert.alert('Error', error.message);
      return;
    }

    // Update email if changed
    const newEmail = editEmail.trim();
    if (newEmail && newEmail !== user?.email) {
      const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });
      if (emailError) {
        setSaving(false);
        Alert.alert('Email update failed', emailError.message);
        return;
      }
      // Also update email in profiles table
      await supabase.from('profiles').update({ email: newEmail }).eq('id', user!.id);
      Alert.alert('Check your inbox', 'A confirmation link was sent to your new email address.');
    }

    setSaving(false);
    await refreshProfile();
    setEditing(false);
  }

  const displayName = profile?.full_name || user?.email || 'Guest';
  const initial = displayName[0].toUpperCase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <TouchableOpacity onPress={() => setShowPhotoModal(true)} activeOpacity={0.8}>
          <View style={[styles.avatar, { backgroundColor: profileColor }]}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{initial}</Text>
            )}
          </View>
          <View style={styles.avatarEditBadge}>
            <Text style={styles.avatarEditBadgeText}>Edit</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.displayName}>{displayName}</Text>
        <Text style={styles.email}>{user?.email ?? 'guest@sheep.app'}</Text>
      </View>

      {/* Photo Picker Modal */}
      <Modal visible={showPhotoModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPhotoModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowPhotoModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Profile Photo</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Current photo preview */}
            <View style={styles.photoPreviewSection}>
              <View style={[styles.photoPreview, { backgroundColor: profileColor }]}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.photoPreviewImage} />
                ) : (
                  <Text style={styles.photoPreviewText}>{initial}</Text>
                )}
              </View>
              <Text style={styles.fieldHint}>{avatarUri ? 'Tap an option below to change' : 'No photo set'}</Text>
            </View>

            {/* Upload from device */}
            <TouchableOpacity style={styles.photoOptionBtn} onPress={handlePickFile}>
              <Text style={styles.photoOptionIcon}>+</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.photoOptionTitle}>Upload from device</Text>
                <Text style={styles.fieldHint}>Choose a photo from your files</Text>
              </View>
            </TouchableOpacity>

            {/* Enter URL */}
            <View style={styles.photoUrlSection}>
              <Text style={styles.fieldLabel}>Or enter an image URL</Text>
              <TextInput
                style={styles.modalInput}
                value={photoUrlInput}
                onChangeText={setPhotoUrlInput}
                placeholder="https://example.com/photo.jpg"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <TouchableOpacity style={styles.photoUrlBtn} onPress={handleSetPhotoUrl}>
                <Text style={styles.photoUrlBtnText}>Use this URL</Text>
              </TouchableOpacity>
            </View>

            {/* Remove photo */}
            {avatarUri && (
              <TouchableOpacity style={styles.removePhotoBtn} onPress={handleRemovePhoto}>
                <Text style={styles.removePhotoBtnText}>Remove photo</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Profile */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.card}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Display name</Text>
            {editing ? (
              <TextInput
                style={styles.fieldInput}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your name"
                placeholderTextColor="#9CA3AF"
                autoFocus
              />
            ) : (
              <Text style={styles.fieldValue}>{fullName || '—'}</Text>
            )}
          </View>

          <View style={styles.separator} />

          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Email</Text>
            {editing ? (
              <TextInput
                style={styles.fieldInput}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="your@email.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            ) : (
              <Text style={styles.fieldValue}>{user?.email ?? 'guest@sheep.app'}</Text>
            )}
          </View>

          <View style={styles.separator} />

          <Text style={styles.fieldLabel}>Profile color</Text>
          <View style={styles.colorRow}>
            {PROFILE_COLORS.map(color => (
              <TouchableOpacity
                key={color}
                style={[styles.colorDot, { backgroundColor: color }, profileColor === color && styles.colorDotSelected]}
                onPress={() => setProfileColor(color)}
              />
            ))}
          </View>

          {editing ? (
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditing(false); setFullName(profile?.full_name ?? ''); setEditEmail(user?.email ?? ''); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Text style={styles.editBtnText}>Edit profile</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Notification Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Event invites</Text>
              <Text style={styles.fieldHint}>Get notified when someone invites you to an event</Text>
            </View>
            <Switch
              value={notifPrefs.eventInvites}
              onValueChange={val => updateNotifPref('eventInvites', val)}
              trackColor={{ false: '#D1D5DB', true: '#b8dfa8' }}
              thumbColor={notifPrefs.eventInvites ? '#8dc76d' : '#f4f3f4'}
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Event changes</Text>
              <Text style={styles.fieldHint}>Get notified when an event you're attending is updated or cancelled</Text>
            </View>
            <Switch
              value={notifPrefs.eventChanges}
              onValueChange={val => updateNotifPref('eventChanges', val)}
              trackColor={{ false: '#D1D5DB', true: '#b8dfa8' }}
              thumbColor={notifPrefs.eventChanges ? '#8dc76d' : '#f4f3f4'}
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Event reminders</Text>
              <Text style={styles.fieldHint}>Get reminded before events start</Text>
            </View>
            <Switch
              value={notifPrefs.reminders}
              onValueChange={val => updateNotifPref('reminders', val)}
              trackColor={{ false: '#D1D5DB', true: '#b8dfa8' }}
              thumbColor={notifPrefs.reminders ? '#8dc76d' : '#f4f3f4'}
            />
          </View>
        </View>
      </View>

      {/* Default Reminders */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Default Reminder</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Remind me before events</Text>
          <Text style={styles.fieldHint}>New events will use this reminder time by default</Text>
          <View style={styles.reminderRow}>
            {REMINDER_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.reminderChip, defaultReminder === opt.value && styles.reminderChipActive]}
                onPress={() => handleDefaultReminderChange(opt.value)}
              >
                <Text style={[styles.reminderChipText, defaultReminder === opt.value && styles.reminderChipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Group Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Groups</Text>
        <View style={styles.card}>
          {groups.length === 0 ? (
            <Text style={styles.fieldValue}>No groups yet</Text>
          ) : (
            groups.map((g, idx) => (
              <React.Fragment key={g.id}>
                {idx > 0 && <View style={styles.separator} />}
                <TouchableOpacity style={styles.groupRow} onPress={() => openGroupDetail(g)} activeOpacity={0.7}>
                  <View style={[styles.groupIcon, activeGroup?.id === g.id && styles.groupIconActive]}>
                    <Text style={styles.groupIconText}>{g.name[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupName}>{g.name}</Text>
                    <Text style={styles.fieldHint}>
                      {groupMemberCounts[g.id] ?? '—'} member{(groupMemberCounts[g.id] ?? 0) !== 1 ? 's' : ''}
                      {activeGroup?.id === g.id ? '  •  Active' : ''}
                    </Text>
                  </View>
                  <Text style={styles.groupArrow}>›</Text>
                </TouchableOpacity>
              </React.Fragment>
            ))
          )}
        </View>
      </View>

      {/* Group Detail Modal */}
      <Modal visible={showGroupModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowGroupModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowGroupModal(false)}>
              <Text style={styles.modalCancel}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{selectedGroupDetail?.name ?? 'Group'}</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
            {selectedGroupDetail && (
              <>
                {/* Invite Code */}
                <View style={styles.inviteCodeSection}>
                  <Text style={styles.fieldLabel}>Invite code</Text>
                  <View style={styles.inviteCodeRow}>
                    <Text style={styles.inviteCodeText}>{selectedGroupDetail.invite_code}</Text>
                    <TouchableOpacity style={styles.copyBtn} onPress={() => copyInviteCode(selectedGroupDetail.invite_code)}>
                      <Text style={styles.copyBtnText}>Copy</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.fieldHint}>Share this code so others can join your group</Text>
                </View>

                {selectedGroupDetail.description && (
                  <View style={{ marginTop: 20 }}>
                    <Text style={styles.fieldLabel}>Description</Text>
                    <Text style={styles.fieldValue}>{selectedGroupDetail.description}</Text>
                  </View>
                )}

                {/* Members */}
                <Text style={[styles.fieldLabel, { marginTop: 24, marginBottom: 12 }]}>
                  Members ({groupMembersDetail.length})
                </Text>
                {loadingGroupDetail ? (
                  <ActivityIndicator color="#8dc76d" style={{ marginTop: 12 }} />
                ) : (
                  <View style={{ gap: 8 }}>
                    {groupMembersDetail.map((m: any) => (
                      <View key={m.id} style={styles.memberRow}>
                        <View style={styles.memberAvatar}>
                          <Text style={styles.memberAvatarText}>{(m.full_name ?? m.email ?? '?')[0].toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>
                            {m.full_name ?? m.email}
                            {m.id === user?.id ? ' (you)' : ''}
                          </Text>
                          {m.full_name && <Text style={styles.memberEmail}>{m.email}</Text>}
                        </View>
                        {m.role === 'admin' && (
                          <View style={styles.adminBadge}>
                            <Text style={styles.adminBadgeText}>Admin</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* Set Active / Leave */}
                <View style={{ marginTop: 28, gap: 12 }}>
                  {activeGroup?.id !== selectedGroupDetail.id && (
                    <TouchableOpacity
                      style={styles.setActiveBtn}
                      onPress={() => { setActiveGroup(selectedGroupDetail); setShowGroupModal(false); }}
                    >
                      <Text style={styles.setActiveBtnText}>Set as active group</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.leaveGroupBtn}
                    onPress={() => handleLeaveGroup(selectedGroupDetail)}
                    disabled={leavingGroup}
                  >
                    {leavingGroup ? (
                      <ActivityIndicator color="#DC2626" size="small" />
                    ) : (
                      <Text style={styles.leaveGroupBtnText}>Leave group</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Calendar Sync & Export */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Calendar Sync & Export</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Export calendar</Text>
          <Text style={styles.fieldHint}>
            Download your events as an .ics file to import into Apple Calendar, Google Calendar, or Outlook
          </Text>
          <TouchableOpacity style={styles.exportBtn} onPress={handleExportCalendar} disabled={exporting}>
            {exporting ? (
              <ActivityIndicator color="#8dc76d" size="small" />
            ) : (
              <Text style={styles.exportBtnText}>Export as .ics</Text>
            )}
          </TouchableOpacity>

          <View style={styles.separator} />

          <Text style={styles.fieldLabel}>Share with other apps</Text>
          <Text style={styles.fieldHint}>
            Use the export above and add the .ics file as a subscribed calendar in your preferred app
          </Text>
        </View>
      </View>

      {/* Privacy Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Show email to group members</Text>
              <Text style={styles.fieldHint}>Others can see your email address</Text>
            </View>
            <Switch
              value={showEmail}
              onValueChange={setShowEmail}
              trackColor={{ false: '#D1D5DB', true: '#b8dfa8' }}
              thumbColor={showEmail ? '#8dc76d' : '#f4f3f4'}
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Shared with friends</Text>
              <Text style={styles.fieldHint}>{sharedWithFriends ? 'Friends can see your events unless you mark them private' : 'New events default to private — only you can see them'}</Text>
            </View>
            <Switch
              value={sharedWithFriends}
              onValueChange={handleSharedToggle}
              trackColor={{ false: '#D1D5DB', true: '#b8dfa8' }}
              thumbColor={sharedWithFriends ? '#8dc76d' : '#f4f3f4'}
            />
          </View>

          {sharedWithFriends && (
            <>
              <View style={styles.separator} />
              <Text style={styles.fieldLabel}>Hide events from</Text>
              <Text style={styles.fieldHint}>Selected friends won't see any of your events</Text>

              {hiddenFriends.length > 0 && (
                <View style={styles.hiddenList}>
                  {groupMembers.filter(m => hiddenFriends.includes(m.id)).map(m => (
                    <View key={m.id} style={styles.hiddenChip}>
                      <Text style={styles.hiddenChipText} numberOfLines={1}>{m.full_name ?? m.email}</Text>
                      <TouchableOpacity onPress={() => toggleHiddenFriend(m.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                        <Text style={styles.hiddenChipRemove}>x</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity style={styles.addCategoryBtn} onPress={() => { setFriendSearch(''); setShowHiddenModal(true); }}>
                <Text style={styles.addCategoryBtnText}>{hiddenFriends.length > 0 ? 'Edit hidden list' : '+ Add friends to hide from'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Hidden Friends Modal */}
      <Modal visible={showHiddenModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowHiddenModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowHiddenModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Hide Events From</Text>
            <TouchableOpacity onPress={() => setShowHiddenModal(false)}>
              <Text style={styles.modalSaveText}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldHint}>Selected friends won't see any of your calendar events. This is like a close friends list in reverse.</Text>
            <TextInput
              style={styles.searchInput}
              value={friendSearch}
              onChangeText={setFriendSearch}
              placeholder="Search by name..."
              placeholderTextColor="#9CA3AF"
            />
            <View style={{ marginTop: 12, gap: 8 }}>
              {groupMembers.length === 0 ? (
                <Text style={styles.fieldValue}>No group members yet</Text>
              ) : (
                groupMembers.filter(m => {
                  if (!friendSearch.trim()) return true;
                  const q = friendSearch.toLowerCase();
                  return (m.full_name ?? '').toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
                }).map(m => {
                  const isHidden = hiddenFriends.includes(m.id);
                  return (
                    <TouchableOpacity key={m.id} style={[styles.friendRow, isHidden && styles.friendRowHidden]} onPress={() => toggleHiddenFriend(m.id)} activeOpacity={0.7}>
                      <View style={styles.friendAvatar}>
                        <Text style={styles.friendAvatarText}>{(m.full_name ?? m.email ?? '?')[0].toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.friendName}>{m.full_name ?? m.email}</Text>
                        {m.full_name && <Text style={styles.friendEmail}>{m.email}</Text>}
                      </View>
                      <View style={[styles.friendCheck, isHidden && styles.friendCheckActive]}>
                        {isHidden && <Text style={styles.friendCheckText}>Hidden</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Event Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Event Settings</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Categories</Text>
          <Text style={styles.fieldHint}>Color-code your events by category</Text>

          {categories.length > 0 && (
            <View style={styles.categoryList}>
              {categories.map(cat => (
                <View key={cat.id} style={styles.categoryItem}>
                  <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.categoryName} numberOfLines={1}>{cat.name}</Text>
                  <TouchableOpacity onPress={() => handleDeleteCategory(cat.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.categoryDelete}>x</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.addCategoryBtn} onPress={() => setShowCategoryModal(true)}>
            <Text style={styles.addCategoryBtnText}>+ Add category</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Add Category Modal */}
      <Modal visible={showCategoryModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCategoryModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Category</Text>
            <TouchableOpacity onPress={handleAddCategory}>
              <Text style={styles.modalSaveText}>Add</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Category name</Text>
            <TextInput
              style={styles.modalInput}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="e.g. Date night, Dinners, Work..."
              placeholderTextColor="#9CA3AF"
              autoFocus
            />

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Color</Text>
            <View style={styles.modalColorGrid}>
              {CATEGORY_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  style={[styles.modalColorDot, { backgroundColor: color }, newCategoryColor === color && styles.modalColorDotSelected]}
                  onPress={() => setNewCategoryColor(color)}
                />
              ))}
            </View>

            <View style={styles.modalPreview}>
              <View style={[styles.categoryDot, { backgroundColor: newCategoryColor }]} />
              <Text style={styles.modalPreviewText}>{newCategoryName || 'Category name'}</Text>
            </View>

            {categories.length > 0 && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Existing categories</Text>
                <View style={styles.categoryList}>
                  {categories.map(cat => (
                    <View key={cat.id} style={styles.categoryItem}>
                      <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                      <Text style={styles.categoryName} numberOfLines={1}>{cat.name}</Text>
                      <TouchableOpacity onPress={() => handleDeleteCategory(cat.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.categoryDelete}>x</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Display to Others */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How others see you</Text>
        <View style={styles.card}>
          <View style={styles.previewRow}>
            <View style={[styles.previewAvatar, { backgroundColor: profileColor }]}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.previewAvatarImage} />
              ) : (
                <Text style={styles.previewAvatarText}>{initial}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewName}>{fullName || displayName}</Text>
              {showEmail && <Text style={styles.previewEmail}>{user?.email ?? 'guest@sheep.app'}</Text>}
              {sharedWithFriends && <Text style={styles.previewStatus}>Events visible to friends</Text>}
            </View>
          </View>
        </View>
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f3e7' },
  content: { padding: 20 },
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 12, overflow: 'hidden' },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  avatarEditBadge: { position: 'absolute', bottom: 10, right: -4, backgroundColor: '#8dc76d', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 2, borderColor: '#f5f3e7' },
  avatarEditBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  displayName: { fontSize: 22, fontWeight: '700', color: '#111827' },
  email: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  fieldRow: { paddingVertical: 4 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 2 },
  fieldValue: { fontSize: 15, color: '#6B7280' },
  fieldInput: { fontSize: 15, color: '#111827', borderBottomWidth: 1.5, borderBottomColor: '#8dc76d', paddingVertical: 4 },
  fieldHint: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  separator: { height: 1, backgroundColor: '#edeadb', marginVertical: 12 },
  colorRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 12, flexWrap: 'wrap' },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 3 },
  editBtn: { alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#8dc76d', marginTop: 4 },
  editBtnText: { color: '#8dc76d', fontSize: 14, fontWeight: '700' },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#D1D5DB' },
  cancelBtnText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#8dc76d' },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  previewAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  previewAvatarImage: { width: 44, height: 44, borderRadius: 22 },
  previewAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  previewName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  previewEmail: { fontSize: 13, color: '#6B7280', marginTop: 1 },
  previewStatus: { fontSize: 12, color: '#8dc76d', fontWeight: '600', marginTop: 2 },
  signOutBtn: { alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#D1D5DB', backgroundColor: '#fff' },
  signOutText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
  // Hidden friends styles
  hiddenList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  hiddenChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, gap: 6 },
  hiddenChipText: { fontSize: 13, fontWeight: '600', color: '#991B1B', maxWidth: 120 },
  hiddenChipRemove: { fontSize: 14, color: '#DC2626', fontWeight: '700' },
  searchInput: { marginTop: 12, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#111827', backgroundColor: '#fff' },
  friendRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 12, borderWidth: 1.5, borderColor: '#E5E7EB' },
  friendRowHidden: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  friendAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#8dc76d', alignItems: 'center', justifyContent: 'center' },
  friendAvatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  friendName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  friendEmail: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  friendCheck: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: '#edeadb' },
  friendCheckActive: { backgroundColor: '#FEE2E2' },
  friendCheckText: { fontSize: 12, fontWeight: '700', color: '#DC2626' },
  // Category styles
  categoryList: { marginTop: 12, gap: 8 },
  categoryItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f3e7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  categoryDot: { width: 14, height: 14, borderRadius: 7 },
  categoryName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#374151' },
  categoryDelete: { fontSize: 16, color: '#9CA3AF', fontWeight: '600', paddingHorizontal: 4 },
  addCategoryBtn: { alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#8dc76d', marginTop: 14, borderStyle: 'dashed' },
  addCategoryBtnText: { color: '#8dc76d', fontSize: 14, fontWeight: '700' },
  // Category modal styles
  modalContainer: { flex: 1, backgroundColor: '#f5f3e7' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#fff' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  modalCancel: { fontSize: 16, color: '#6B7280' },
  modalSaveText: { fontSize: 16, fontWeight: '700', color: '#8dc76d' },
  modalBody: { padding: 20 },
  modalInput: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', backgroundColor: '#fff' },
  modalColorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  modalColorDot: { width: 38, height: 38, borderRadius: 19 },
  modalColorDotSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  modalPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, backgroundColor: '#fff', borderRadius: 10, padding: 14 },
  modalPreviewText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  // Reminder styles
  reminderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  reminderChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff' },
  reminderChipActive: { borderColor: '#8dc76d', backgroundColor: '#ece8d5' },
  reminderChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  reminderChipTextActive: { color: '#8dc76d' },
  // Group management styles
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  groupIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  groupIconActive: { backgroundColor: '#8dc76d' },
  groupIconText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  groupName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  groupArrow: { fontSize: 22, color: '#9CA3AF', fontWeight: '300' },
  inviteCodeSection: { marginBottom: 8 },
  inviteCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 6 },
  inviteCodeText: { fontSize: 22, fontWeight: '700', color: '#111827', letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  copyBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: '#ece8d5' },
  copyBtnText: { fontSize: 13, fontWeight: '700', color: '#8dc76d' },
  memberRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 12, borderWidth: 1.5, borderColor: '#E5E7EB' },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#8dc76d', alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  memberName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  memberEmail: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  adminBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: '#ece8d5' },
  adminBadgeText: { fontSize: 11, fontWeight: '700', color: '#8dc76d' },
  setActiveBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: '#8dc76d' },
  setActiveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  leaveGroupBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#FCA5A5' },
  leaveGroupBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  // Export styles
  exportBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#8dc76d', marginTop: 14 },
  exportBtnText: { color: '#8dc76d', fontSize: 14, fontWeight: '700' },
  // Photo modal styles
  photoPreviewSection: { alignItems: 'center', marginBottom: 28 },
  photoPreview: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden' },
  photoPreviewImage: { width: 100, height: 100, borderRadius: 50 },
  photoPreviewText: { color: '#fff', fontSize: 40, fontWeight: '700' },
  photoOptionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 14, marginBottom: 16, borderWidth: 1.5, borderColor: '#E5E7EB' },
  photoOptionIcon: { fontSize: 22, fontWeight: '700', color: '#8dc76d', width: 36, height: 36, borderRadius: 18, backgroundColor: '#edf7e8', textAlign: 'center', lineHeight: 36 },
  photoOptionTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  photoUrlSection: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 16 },
  photoUrlBtn: { alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#8dc76d', marginTop: 12 },
  photoUrlBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  removePhotoBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#FCA5A5' },
  removePhotoBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
});
