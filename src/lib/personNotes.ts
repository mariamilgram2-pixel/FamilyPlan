// The notes and photos you keep about someone. Private to you; photos live
// in the "person-notes" bucket under your own folder.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { PickedPhoto } from './memories';
import { DEMO_PERSON_NOTES } from './demo';
import { PersonNote } from '../types';

export type NoteSubject = { kind: 'user' | 'contact'; id: string };

const subjectColumn = (s: NoteSubject) => (s.kind === 'user' ? 'subject_user_id' : 'subject_contact_id');

/** Your notes about one person, newest first, with viewable photo links. */
export function usePersonNotes(ownerId: string | null, subject: NoteSubject | null, isDemo: boolean) {
  const [notes, setNotes] = useState<PersonNote[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const key = subject ? `${subject.kind}:${subject.id}` : null;

  const load = useCallback(async () => {
    if (!subject) { setNotes([]); return; }
    if (isDemo) {
      const mine = DEMO_PERSON_NOTES.filter(n => n[subjectColumn(subject)] === subject.id);
      setNotes([...mine].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setLinks({});
      return;
    }
    if (!ownerId) return;
    const { data } = await supabase.from('person_notes').select('*')
      .eq('owner_id', ownerId).eq(subjectColumn(subject), subject.id).order('created_at', { ascending: false });
    const rows = (data ?? []) as PersonNote[];
    setNotes(rows);
    const paths = rows.flatMap(n => n.photo_urls);
    if (!paths.length) { setLinks({}); return; }
    const { data: signed } = await supabase.storage.from('person-notes').createSignedUrls(paths, 3600);
    const out: Record<string, string> = {};
    (signed ?? []).forEach(d => { if (d.path && d.signedUrl) out[d.path] = d.signedUrl; });
    setLinks(out);
  }, [key, ownerId, isDemo]);

  useEffect(() => { load(); }, [load]);

  async function add(body: string, photos: PickedPhoto[]): Promise<string | null> {
    if (!subject || !ownerId) return 'Sign in to keep notes.';
    const base = {
      owner_id: ownerId,
      subject_user_id: subject.kind === 'user' ? subject.id : null,
      subject_contact_id: subject.kind === 'contact' ? subject.id : null,
      body: body.trim(),
    };
    if (isDemo) {
      // Demo notes keep the picked images as-is, in memory.
      DEMO_PERSON_NOTES.push({ ...base, id: `pn-${Date.now()}`, photo_urls: photos.map(p => p.uri), created_at: new Date().toISOString() });
      await load();
      return null;
    }
    try {
      const paths: string[] = [];
      for (const [i, p] of photos.entries()) {
        const ext = p.mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
        const path = `${ownerId}/${Date.now()}-${i}.${ext}`;
        const blob = await (await fetch(p.uri)).blob();
        const { error } = await supabase.storage.from('person-notes').upload(path, blob, { contentType: p.mime });
        if (error) throw error;
        paths.push(path);
      }
      const { error } = await supabase.from('person_notes').insert({ ...base, photo_urls: paths });
      if (error) throw error;
    } catch (e: any) {
      return e?.message ?? 'Try again.';
    }
    await load();
    return null;
  }

  async function remove(note: PersonNote): Promise<string | null> {
    if (isDemo) {
      const i = DEMO_PERSON_NOTES.findIndex(n => n.id === note.id);
      if (i >= 0) DEMO_PERSON_NOTES.splice(i, 1);
      await load();
      return null;
    }
    const { error } = await supabase.from('person_notes').delete().eq('id', note.id);
    if (error) return error.message;
    if (note.photo_urls.length) await supabase.storage.from('person-notes').remove(note.photo_urls);
    await load();
    return null;
  }

  // Demo photos are already viewable URIs.
  const photoUri = (path: string) => (isDemo ? path : links[path]);

  return { notes, add, remove, photoUri };
}
