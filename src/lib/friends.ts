// Friends on sheep (public.friendships): send a request, they accept, and you
// can add each other to plans and groups without sharing a group first.
//
// Finding people goes through find_people(), which only answers exact
// matches: the numbers of people you've added, or an email or number you
// type. Your own number (for being found) is in profile_phones, which nobody
// else can read.
//
// Every screen using useFriends sees changes right away. The demo has one
// request waiting, kept for the session.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { notify } from './alert';
import { sendNotifications } from './notifications';
import { phoneKey } from './phone';
import { DEMO_FRIENDS, DEMO_ME } from './demo';
import { Friendship, Profile } from '../types';

export interface FoundPerson { id: string; full_name: string | null; avatar_url: string | null; phone_key: string | null }
export interface Request { friendship: Friendship; person: Profile }
export type FriendStatus = 'friends' | 'sent' | 'received' | null;

// ─── Demo ────────────────────────────────────────────────────────────────────
let demoRows: Friendship[] | null = null;
function demoList(): Friendship[] {
  if (!demoRows) {
    const from = DEMO_FRIENDS[DEMO_FRIENDS.length - 1];
    demoRows = from ? [{ id: 'demo-fr-1', requester_id: from.id, addressee_id: DEMO_ME, status: 'pending', created_at: new Date().toISOString(), accepted_at: null }] : [];
  }
  return demoRows;
}

const listeners = new Set<() => void>();
const changed = () => listeners.forEach(l => l());

export function useFriends(meId: string | null, isDemo: boolean, myName = 'Someone') {
  const [rows, setRows] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const l = () => setVersion(v => v + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  useEffect(() => {
    if (!meId) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      if (isDemo) {
        setRows([...demoList()]);
        setProfiles(new Map(DEMO_FRIENDS.map(p => [p.id, p])));
        return;
      }
      const { data } = await supabase.from('friendships').select('*');
      const list = (data ?? []) as Friendship[];
      const others = Array.from(new Set(list.map(f => (f.requester_id === meId ? f.addressee_id : f.requester_id))));
      const { data: ps } = others.length
        ? await supabase.from('profiles').select('id, full_name, email, avatar_url, birthday, about, favorites, created_at').in('id', others)
        : { data: [] as Profile[] };
      if (cancelled) return;
      setRows(list);
      setProfiles(new Map(((ps ?? []) as Profile[]).map(p => [p.id, p])));
    })();
    return () => { cancelled = true; };
  }, [meId, isDemo, version]);

  const other = (f: Friendship) => (f.requester_id === meId ? f.addressee_id : f.requester_id);
  const personOf = (f: Friendship): Profile | null => profiles.get(other(f)) ?? null;

  const friends = useMemo(() => rows.filter(f => f.status === 'accepted').map(personOf).filter((p): p is Profile => !!p)
    .sort((a, b) => (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? '')), [rows, profiles]);
  const incoming = useMemo(() => rows.filter(f => f.status === 'pending' && f.addressee_id === meId)
    .flatMap((f): Request[] => { const p = personOf(f); return p ? [{ friendship: f, person: p }] : []; }), [rows, profiles, meId]);
  const outgoing = useMemo(() => rows.filter(f => f.status === 'pending' && f.requester_id === meId)
    .flatMap((f): Request[] => { const p = personOf(f); return p ? [{ friendship: f, person: p }] : []; }), [rows, profiles, meId]);

  const rowWith = useCallback((userId: string) => rows.find(f => other(f) === userId) ?? null, [rows, meId]);
  const statusWith = useCallback((userId: string): FriendStatus => {
    const f = rowWith(userId);
    if (!f) return null;
    if (f.status === 'accepted') return 'friends';
    return f.requester_id === meId ? 'sent' : 'received';
  }, [rowWith, meId]);

  const send = useCallback(async (userId: string) => {
    if (!meId) return false;
    if (isDemo) { notify('Demo mode', 'Sign in to add friends.'); return false; }
    const { error } = await supabase.from('friendships').insert({ requester_id: meId, addressee_id: userId });
    if (error && error.code !== '23505') { notify('Couldn’t send the request', error.message); return false; }
    await sendNotifications([{ user_id: userId, actor_id: meId, kind: 'friend_request', idea_id: null, event_id: null,
      title: `${myName} wants to be friends on sheep`, body: 'Accept in Friends to plan together.' } as any], false);
    changed();
    return true;
  }, [meId, isDemo, myName]);

  const accept = useCallback(async (f: Friendship) => {
    if (isDemo) {
      const row = demoList().find(x => x.id === f.id);
      if (row) { row.status = 'accepted'; row.accepted_at = new Date().toISOString(); }
      changed();
      return true;
    }
    const { error } = await supabase.from('friendships').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', f.id);
    if (error) { notify('Couldn’t accept', error.message); return false; }
    await sendNotifications([{ user_id: f.requester_id, actor_id: meId, kind: 'friend_accepted', idea_id: null, event_id: null,
      title: `${myName} accepted your friend request`, body: 'You can plan together now.' } as any], false);
    changed();
    return true;
  }, [isDemo, meId, myName]);

  /** Decline a request, cancel yours, or unfriend. */
  const end = useCallback(async (f: Friendship) => {
    if (isDemo) { demoRows = demoList().filter(x => x.id !== f.id); changed(); return true; }
    const { error } = await supabase.from('friendships').delete().eq('id', f.id);
    if (error) { notify('Couldn’t do that', error.message); return false; }
    changed();
    return true;
  }, [isDemo]);

  return { friends, incoming, outgoing, statusWith, rowWith, send, accept, end };
}

/** People on sheep with any of these numbers, or this exact email. */
export async function findPeople(phones: (string | null | undefined)[], email?: string | null): Promise<FoundPerson[]> {
  const keys = Array.from(new Set(phones.map(phoneKey).filter((k): k is string => !!k))).slice(0, 500);
  if (!keys.length && !email?.trim()) return [];
  const { data, error } = await supabase.rpc('find_people', { p_phones: keys, p_email: email?.trim() || null });
  if (error) return [];
  return (data ?? []) as FoundPerson[];
}

/** Your number for being found, and saving it (empty removes it). */
export async function loadMyPhone(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profile_phones').select('phone_key').eq('user_id', userId).maybeSingle();
  return (data as { phone_key: string } | null)?.phone_key ?? null;
}
export async function saveMyPhone(userId: string, phone: string): Promise<string | null> {
  const key = phoneKey(phone);
  const { error } = key
    ? await supabase.from('profile_phones').upsert({ user_id: userId, phone_key: key, updated_at: new Date().toISOString() })
    : await supabase.from('profile_phones').delete().eq('user_id', userId);
  return error?.message ?? null;
}
