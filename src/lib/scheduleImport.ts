// Importing a work schedule from what an employer sends: a screenshot, a
// photo of a printout, or a PDF from email.
//
// Picking files works today on iOS and web. Reading them does not yet:
// `readScheduleFromFile` is the seam where that plugs in. The intended path
// is a server-side function (e.g. a Supabase Edge Function) that sends the
// file to a vision-capable model and returns structured hours, so no API
// keys ever ship inside the app. Whatever it returns is only ever used to
// PRE-FILL the editor — the person always reviews before saving.

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { WeekPattern } from './workSchedule';

export interface ScheduleFile {
  name: string;
  mimeType: string;
  size: number | null;
  uri: string;            // local file URI (native) or blob/data URL (web) — session only
  kind: 'image' | 'pdf';
}

export type ReadResult =
  | { status: 'unavailable' }                                  // reading not connected yet
  | { status: 'ok'; pattern: WeekPattern; weekStart?: string } // parsed hours (+ the week, if stated)
  | { status: 'unreadable'; reason: string };                  // couldn't find a schedule in it

const MAX_BYTES = 15 * 1024 * 1024;

/** Photos library — where screenshots live on iPhone. */
export async function pickScheduleImage(): Promise<ScheduleFile | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
    allowsMultipleSelection: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  return {
    name: a.fileName ?? 'Schedule photo',
    mimeType: a.mimeType ?? 'image/jpeg',
    size: a.fileSize ?? null,
    uri: a.uri,
    kind: 'image',
  };
}

/** Files — a PDF or image saved from an email attachment. */
export async function pickScheduleDocument(): Promise<ScheduleFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['image/*', 'application/pdf'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const mimeType = a.mimeType ?? (a.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/*');
  return {
    name: a.name,
    mimeType,
    size: a.size ?? null,
    uri: a.uri,
    kind: mimeType === 'application/pdf' ? 'pdf' : 'image',
  };
}

export function validateScheduleFile(f: ScheduleFile): string | null {
  if (f.size && f.size > MAX_BYTES) return 'That file is over 15 MB. Try a screenshot of just the schedule.';
  if (f.kind !== 'pdf' && !f.mimeType.startsWith('image/')) return 'Use an image (screenshot or photo) or a PDF.';
  return null;
}

/**
 * Read hours out of an uploaded schedule.
 * Not connected yet — returns `unavailable` so the UI can say so honestly.
 */
export async function readScheduleFromFile(_file: ScheduleFile): Promise<ReadResult> {
  return { status: 'unavailable' };
}

export function formatBytes(n: number | null) {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
