import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || 'missing-service-role-key';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[Supabase] SUPABASE_SERVICE_ROLE_KEY is not configured. Admin operations will fail.');
}

export const supabaseAdmin = createClient(URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});
