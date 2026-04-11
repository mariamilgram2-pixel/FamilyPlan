import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { Database } from '../types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Guard: if env vars aren't set, export a stub so the app renders a useful UI
// rather than crashing silently at module init time.
function createSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      '[FamilyPlan] Supabase env vars not set. ' +
      'Copy .env.example → .env and fill in your project URL and anon key.'
    );
    // Return a minimal stub that won't throw on access
    return { auth: { getSession: async () => ({ data: { session: null }, error: null }), onAuthStateChange: (callback: any) => { setTimeout(() => callback('INITIAL_SESSION', null), 0); return { data: { subscription: { unsubscribe: () => {} } } }; } } } as unknown as SupabaseClient<Database>;
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export const supabase = createSupabaseClient();

// On native, swap in SecureStore for auth persistence once it async-loads.
if (Platform.OS !== 'web' && supabaseUrl) {
  import('expo-secure-store').then((SecureStore) => {
    (supabase.auth as any).storage = {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    };
  });
}
