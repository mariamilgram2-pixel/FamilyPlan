// Alerts and confirmations.
//
// iOS/Android use the native Alert. On web we render our own Apple-style
// alert (see components/ui/AlertHost) instead of window.alert/confirm:
// browser dialogs are suppressed in many embedded webviews, which made
// failures look like "nothing happened".

import { Alert, Platform } from 'react-native';

export interface AlertRequest {
  title: string;
  message?: string;
  confirmLabel?: string;     // present → two-button confirmation
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

type Listener = (req: AlertRequest) => void;
let listener: Listener | null = null;

/** Registered by <AlertHost />. */
export function setAlertListener(l: Listener | null) { listener = l; }

function present(req: Omit<AlertRequest, 'resolve'>): Promise<boolean> {
  return new Promise(resolve => {
    if (listener) listener({ ...req, resolve });
    else if (Platform.OS === 'web') resolve(req.confirmLabel ? window.confirm(`${req.title}\n\n${req.message ?? ''}`) : (window.alert(req.title), true));
    else resolve(true);
  });
}

export function notify(title: string, message?: string) {
  if (Platform.OS !== 'web') { Alert.alert(title, message); return; }
  present({ title, message });
}

export function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS !== 'web') {
    return new Promise(resolve => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) });
    });
  }
  return present({ title, message, confirmLabel, destructive: true });
}
