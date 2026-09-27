import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SERVICE_ROLE) {
  console.warn('[Supabase] SUPABASE_SERVICE_ROLE_KEY is not configured. Admin operations will fail.');
}

export const supabaseAdmin = createClient(URL, SERVICE_ROLE || 'missing-service-role-key', {
  auth: { autoRefreshToken: false, persistSession: false },
});
