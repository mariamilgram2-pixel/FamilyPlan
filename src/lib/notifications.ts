// In-app notifications: "Ana proposed Pottery class", "Ben invited you to…".
//
// Rows live in Supabase (one per recipient) and show in the inbox on the
// Ideas tab. Demo mode keeps a local list so the inbox isn't empty.
// Push delivery (expo-notifications) can hang off the same rows later.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { AppNotification, AppNotificationInsert } from '../types';
import { DEMO_MEMBERS } from './demo';

export async function sendNotifications(rows: AppNotificationInsert[], isDemo: boolean) {
  // Demo recipients aren't real accounts; nothing to deliver.
  if (isDemo || rows.length === 0) return null;
  const { error } = await supabase.from('notifications').insert(rows as any);
  return error;
}

// ─── Demo inbox ──────────────────────────────────────────────────────────────

const ana = DEMO_MEMBERS.find(m => m.id === 'demo-ana')!;
let demoInbox: AppNotification[] = [{
  id: 'n1', user_id: 'demo-me', actor_id: ana.id, kind: 'idea_proposed', idea_id: 'i3', event_id: null,
  title: 'Ana is in on Pottery class', body: 'You proposed it — want to find a time?',
  read_at: null, created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  profiles: { id: ana.id, full_name: ana.full_name, email: ana.email },
}];

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useNotifications(meId: string | null, isDemo: boolean) {
  const [items, setItems] = useState<AppNotification[]>([]);

  const refresh = useCallback(async () => {
    if (isDemo) { setItems(demoInbox); return; }
    if (!meId) { setItems([]); return; }
    const { data } = await supabase.from('notifications')
      .select('*, profiles:actor_id(id, full_name, email)')
      .eq('user_id', meId)
      .order('created_at', { ascending: false })
      .limit(50);
    setItems((data as AppNotification[]) ?? []);
  }, [meId, isDemo]);

  useEffect(() => { refresh(); }, [refresh]);

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const at = new Date().toISOString();
    const mark = (list: AppNotification[]) => list.map(n => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: at } : n));
    setItems(mark);
    if (isDemo) { demoInbox = mark(demoInbox); return; }
    await supabase.from('notifications').update({ read_at: at } as any).in('id', ids);
  }, [isDemo]);

  return { items, unread: items.filter(n => !n.read_at).length, refresh, markRead };
}
