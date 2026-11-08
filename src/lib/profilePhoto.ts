// Your profile picture: a photo from your camera roll, or one of the drawn
// sheep. Either way it's saved in profiles.avatar_url, so everyone you plan
// with sees it. Photos go in the public "avatars" bucket at
// "<user id>/<time>.<ext>"; sheep are saved as "sheep:<id>" (no upload).

import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export interface PickedPhoto { uri: string; mime: string }

/** Choose a photo from your library, cropped square. Null if you cancel. */
export async function pickProfilePhoto(): Promise<PickedPhoto | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mime: a.mimeType ?? 'image/jpeg' };
}

/** Upload a picked photo to your folder; returns its public link. */
export async function uploadProfilePhoto(userId: string, photo: PickedPhoto): Promise<string> {
  const ext = photo.mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const blob = await (await fetch(photo.uri)).blob();
  if (blob.size > 5 * 1024 * 1024) throw new Error('Choose a photo under 5 MB.');
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: photo.mime });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

/** Save (or clear) your picture on your profile. */
export async function saveAvatarUrl(userId: string, url: string | null): Promise<void> {
  const { error } = await supabase.from('profiles').update({ avatar_url: url } as any).eq('id', userId);
  if (error) throw error;
}
