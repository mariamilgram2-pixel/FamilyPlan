// Photos for memories. They're stored privately ("memories" bucket, path
// "<event id>/<user id>/<file>") and shown through short-lived signed links,
// so only people who can see the event can see its photos.

import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export const MAX_PHOTOS = 12;

export interface PickedPhoto { uri: string; mime: string }

/** Let the person choose photos from their library (or files, on web). */
export async function pickPhotos(limit: number): Promise<PickedPhoto[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.7,
  });
  if (res.canceled) return [];
  return res.assets.slice(0, limit).map(a => ({ uri: a.uri, mime: a.mimeType ?? 'image/jpeg' }));
}

/** Upload picked photos for an event; returns their storage paths. */
export async function uploadPhotos(eventId: string, userId: string, photos: PickedPhoto[]): Promise<string[]> {
  const paths: string[] = [];
  for (const [i, p] of photos.entries()) {
    const ext = p.mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const path = `${eventId}/${userId}/${Date.now()}-${i}.${ext}`;
    const blob = await (await fetch(p.uri)).blob();
    const { error } = await supabase.storage.from('memories').upload(path, blob, { contentType: p.mime });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

/** Signed, viewable links for stored photo paths (an hour is plenty to look). */
export async function photoLinks(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from('memories').createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  (data ?? []).forEach(d => { if (d.path && d.signedUrl) out[d.path] = d.signedUrl; });
  return out;
}
