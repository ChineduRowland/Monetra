import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseBrowserConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Creates a browser Supabase client authenticated with a Clerk session JWT
 * (template: 'supabase') so PostgreSQL Row-Level Security evaluates `auth.jwt() ->> 'sub'`.
 */
export function createClerkSupabaseClient(getClerkToken: () => Promise<string | null>) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      fetch: async (url, options = {}) => {
        const token = await getClerkToken();
        const headers = new Headers(options.headers);
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return fetch(url, { ...options, headers });
      },
    },
  });
}
