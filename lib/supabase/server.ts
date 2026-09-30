import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    URL,
    ANON,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(
          list: Array<{
            name: string;
            value: string;
            options?: {
              domain?: string;
              encode?: (value: string) => string;
              expires?: Date;
              httpOnly?: boolean;
              maxAge?: number;
              path?: string;
              sameSite?: 'lax' | 'strict' | 'none' | boolean;
              secure?: boolean;
            };
          }>
        ) {
          try {
            list.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot always modify cookies.
            // Middleware handles session refresh when required.
          }
        },
      },
    }
  );
}
