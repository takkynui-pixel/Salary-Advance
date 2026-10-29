import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'missing-key';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export type Role = 'employee' | 'hr' | 'finance' | 'admin';
export const isStaffRole = (r?: Role | null) => r === 'hr' || r === 'finance' || r === 'admin';
