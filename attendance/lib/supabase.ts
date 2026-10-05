import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export type Profile = { id: string; full_name: string; role: 'employee' | 'hr' };
export type Attendance = { id: string; employee_id: string; work_date: string | null; location: 'office' | 'remote'; in_time: string | null; out_time: string | null; signature_approved: boolean };
