// The people in your phone's own contacts, for adding to a plan. Asks for
// access only when you tap to search them; once allowed, they load whenever
// the picker opens. One entry per number, so someone with a mobile and a
// home number shows twice, labelled. Not on web: there's no address book there
// (the demo has a few pretend ones, so the picker can be tried in a browser).

import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { formatPhone } from './phone';

export interface PhoneContact {
  /** The address book's id plus which number, so each number is its own row. */
  key: string;
  name: string;
  phone: string;
  /** "mobile", "home"… as the phone labels it. */
  label: string | null;
}

/** granted: loaded. ask: we can ask. blocked: turned off, so only Settings can allow it. */
export type ContactsAccess = 'unknown' | 'granted' | 'ask' | 'blocked';

const DEMO_PHONE_CONTACTS: PhoneContact[] = [
  { key: 'd1-0', name: 'Jamie Torres', phone: '(415) 555-0142', label: 'mobile' },
  { key: 'd2-0', name: 'Lena Brooks', phone: '(415) 555-0177', label: 'mobile' },
  { key: 'd2-1', name: 'Lena Brooks', phone: '(415) 555-0190', label: 'home' },
  { key: 'd3-0', name: 'Omar Haddad', phone: '(628) 555-0123', label: 'mobile' },
  { key: 'd4-0', name: 'Dr. Kim’s office', phone: '(415) 555-0100', label: 'work' },
];

// iOS labels come through as "_$!<Mobile>!$_".
const cleanLabel = (l?: string) => (l ? l.replace(/^_\$!<(.*)>!\$_$/, '$1').toLowerCase() : null);

async function readAll(): Promise<PhoneContact[]> {
  const rows = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES] as const);
  const out: PhoneContact[] = [];
  rows.forEach(r => {
    const name = r.fullName?.trim();
    (r.phones ?? []).forEach((p, i) => {
      if (!p.number) return;
      out.push({ key: `${r.id}-${i}`, name: name || formatPhone(p.number), phone: formatPhone(p.number), label: cleanLabel(p.label) });
    });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function useDeviceContacts(active: boolean, demo: boolean) {
  const pretend = demo && Platform.OS === 'web';
  const available = Platform.OS !== 'web' || pretend;
  const [access, setAccess] = useState<ContactsAccess>('unknown');
  // iPhone lets people share only some contacts; then sheep sees just those.
  const [limited, setLimited] = useState(false);
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setContacts(await readAll()); } catch { setContacts([]); }
    setLoading(false);
  }, []);

  // Opening the picker: load them if already allowed, without asking.
  useEffect(() => {
    if (!active || !available) return;
    if (pretend) { setAccess(a => (a === 'granted' ? a : 'ask')); return; }
    let cancelled = false;
    getPermissionsAsync().then(p => {
      if (cancelled) return;
      setLimited(p.accessPrivileges === 'limited');
      if (p.granted) { setAccess('granted'); load(); }
      else setAccess(p.canAskAgain ? 'ask' : 'blocked');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [active, available, pretend]);

  /** Tapped "Search your contacts": ask, or send to Settings if it was turned off. */
  const ask = useCallback(async () => {
    if (pretend) { setAccess('granted'); setContacts(DEMO_PHONE_CONTACTS); return; }
    if (access === 'blocked') { Linking.openSettings(); return; }
    const p = await requestPermissionsAsync();
    setLimited(p.accessPrivileges === 'limited');
    if (p.granted) { setAccess('granted'); load(); }
    else setAccess(p.canAskAgain ? 'ask' : 'blocked');
  }, [access, pretend, load]);

  /** Shared only some contacts: iPhone's own picker, to share more, then reload. */
  const allowMore = useCallback(async () => {
    if (pretend || Platform.OS !== 'ios') return;
    try { await Contact.presentAccessPicker(); } catch { Linking.openSettings(); return; }
    const p = await getPermissionsAsync();
    setLimited(p.accessPrivileges === 'limited');
    load();
  }, [pretend, load]);

  return { available, access, contacts, loading, ask, limited, allowMore };
}
