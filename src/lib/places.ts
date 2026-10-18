// Places for plans: search (Google Places, through the `places` function),
// your saved places ("Home"), and the one-line form plans keep them in.
//
// Like Google Calendar, a plan's location is a single line, name first:
// "Via Carota, 51 Grove St, New York, NY 10014, USA". It reads as the name
// with the address under it, and anything typed by hand still works.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { SavedPlace } from '../types';

export interface PlaceHit { id: string; name: string; address: string }
export interface Place { name: string; address: string | null }

/** "Via Carota" + "51 Grove St, …" → one line. An address that already starts with the name isn't repeated. */
export function placeText(name: string, address?: string | null) {
  const n = name.trim(), a = address?.trim();
  if (!a) return n;
  if (!n || a.toLowerCase().startsWith(n.toLowerCase())) return a;
  return `${n}, ${a}`;
}

/** One line back to name and address: "Lilia, 567 Union Ave" → Lilia / 567 Union Ave. */
export function splitPlace(text: string): Place {
  const t = text.trim();
  const i = t.indexOf(',');
  if (i <= 0) return { name: t, address: null };
  const address = t.slice(i + 1).trim();
  return { name: t.slice(0, i).trim(), address: address || null };
}

/** A token tying one search's keystrokes to the pick that ends it. */
export const newSession = () =>
  Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('').slice(0, 32);

// In the demo there's no server: a few real places stand in.
const DEMO_HITS: PlaceHit[] = [
  { id: 'demo-via-carota', name: 'Via Carota', address: '51 Grove St, New York, NY 10014, USA' },
  { id: 'demo-lilia', name: 'Lilia', address: '567 Union Ave, Brooklyn, NY 11222, USA' },
  { id: 'demo-prospect-park', name: 'Prospect Park', address: 'Brooklyn, NY, USA' },
  { id: 'demo-brooklyn-bowl', name: 'Brooklyn Bowl', address: '61 Wythe Ave, Brooklyn, NY 11249, USA' },
  { id: 'demo-union-sq', name: 'Union Square Greenmarket', address: 'E 17th St & Union Square W, New York, NY 10003, USA' },
];

/** Up to five places matching what's typed. Empty when search isn't set up or fails: typing still works. */
export async function searchPlaces(input: string, session: string, demo: boolean): Promise<PlaceHit[]> {
  const q = input.trim().toLowerCase();
  if (q.length < 2) return [];
  if (demo) return DEMO_HITS.filter(h => h.name.toLowerCase().includes(q) || h.address.toLowerCase().includes(q));
  const { data, error } = await supabase.functions.invoke('places', { body: { action: 'search', input, session } });
  if (error || !Array.isArray(data?.results)) return [];
  return data.results as PlaceHit[];
}

/** The full name and address for a pick (the search only has a short address). */
export async function placeDetails(hit: PlaceHit, session: string, demo: boolean): Promise<Place> {
  const fallback = { name: hit.name, address: hit.address || null };
  if (demo) return fallback;
  const { data, error } = await supabase.functions.invoke('places', { body: { action: 'details', id: hit.id, session } });
  if (error || !data?.place?.name) return fallback;
  return { name: data.place.name, address: data.place.address || hit.address || null };
}

// ─── Saved places ────────────────────────────────────────────────────────────

let demoSaved: SavedPlace[] = [
  { id: 'demo-home', owner_id: 'demo', label: 'Home', place: 'Home, 123 Maple St, Brooklyn, NY 11215', created_at: '' },
];

/** Your saved places, label first: tapping "Home" fills in Home and its address. */
export function useSavedPlaces(meId: string | null, demo: boolean) {
  const [saved, setSaved] = useState<SavedPlace[]>(demo ? demoSaved : []);

  useEffect(() => {
    if (demo) { setSaved(demoSaved); return; }
    if (!meId) return;
    supabase.from('saved_places').select('*').eq('owner_id', meId).order('label')
      .then(({ data }) => setSaved((data ?? []) as SavedPlace[]));
  }, [meId, demo]);

  const add = useCallback(async (label: string, place: Place): Promise<boolean> => {
    const row = { owner_id: meId ?? 'demo', label: label.trim(), place: placeText(label, place.address ?? place.name) };
    if (!row.label) return false;
    if (demo) {
      demoSaved = [...demoSaved, { ...row, id: `demo-${Date.now()}`, created_at: new Date().toISOString() }];
      setSaved(demoSaved);
      return true;
    }
    const { data, error } = await supabase.from('saved_places').insert(row).select().single();
    if (error || !data) return false;
    setSaved(list => [...list, data as SavedPlace].sort((a, b) => a.label.localeCompare(b.label)));
    return true;
  }, [meId, demo]);

  const remove = useCallback(async (id: string) => {
    if (demo) { demoSaved = demoSaved.filter(s => s.id !== id); setSaved(demoSaved); return; }
    setSaved(list => list.filter(s => s.id !== id));
    await supabase.from('saved_places').delete().eq('id', id);
  }, [demo]);

  return { saved, add, remove };
}
