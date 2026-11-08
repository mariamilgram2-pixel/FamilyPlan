// Right after making an account: the "Set up sheep" page, once. Shown to
// accounts made in the last week that haven't seen it yet. Everything on it
// is optional; Profile › Set up sheep opens it again any time.

import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../contexts/AuthContext';
import SetupSheet from './SetupSheet';

const NEW_FOR_MS = 7 * 24 * 60 * 60 * 1000;
export const setupSeenKey = (userId: string) => `setup_seen:${userId}`;

export default function FirstRunSetup({ demo }: { demo: boolean }) {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (demo || !user || !profile) return;
    if (Date.now() - new Date(profile.created_at).getTime() > NEW_FOR_MS) return;
    AsyncStorage.getItem(setupSeenKey(user.id)).then(seen => { if (!seen) setOpen(true); }).catch(() => {});
  }, [demo, user?.id, profile?.created_at]);

  const close = () => {
    setOpen(false);
    if (user) AsyncStorage.setItem(setupSeenKey(user.id), '1').catch(() => {});
  };

  return <SetupSheet visible={open} onClose={close} demo={demo} welcome />;
}
