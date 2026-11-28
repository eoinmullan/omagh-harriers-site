import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';
import { everyRow } from '../supabase/every-row';
import { clubDayWindow } from '../training/tonight';
import { assembleCopy, type EmergencyCopy } from './copy';

// Reading a fresh copy, through RLS: every read here is allowed only to a login
// holding the flag (migration 0026). Throws on any failure, so the caller keeps
// the copy it had rather than replacing it with part of one.

export async function fetchCopy(supabase: SupabaseClient<Database>, authUserId: string): Promise<EmergencyCopy> {
  const today = clubDayWindow();

  const [principal, members, contacts, sessions] = await Promise.all([
    supabase.from('principals').select('id').eq('auth_user_id', authUserId).single(),
    everyRow((from, to) => supabase.from('members').select('id, first_name, surname, is_active').order('id').range(from, to)),
    everyRow((from, to) =>
      supabase.from('emergency_contacts').select('member_id, contact_name, contact_phone').order('member_id').range(from, to),
    ),
    supabase
      .from('training_sessions')
      .select('id, starts_at, is_cancelled, group:group_id(name)')
      .gte('starts_at', today.from)
      .lt('starts_at', today.until),
  ]);
  if (principal.error) throw new Error(principal.error.message);
  if (sessions.error) throw new Error(sessions.error.message);

  const sessionIds = (sessions.data ?? []).map((session) => session.id);
  const attendance =
    sessionIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from('attendance')
          .select('session_id, member_id, guest:guest_id(first_name, surname)')
          .in('session_id', sessionIds);
  if (attendance.error) throw new Error(attendance.error.message);

  return assembleCopy({
    principalId: principal.data.id,
    members,
    contacts,
    sessions: sessions.data ?? [],
    attendance: attendance.data ?? [],
  });
}
