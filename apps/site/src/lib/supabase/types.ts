// Hand-rolled Database type for the principals + members schema.
// Regenerate with `pnpm supabase:types` once the Supabase CLI is set up.

export type PrincipalRole = 'member' | 'admin' | 'superuser';
export type RecordSource = 'klubfunder' | 'manual';
export type MemberStatus = 'paid' | 'lapsed';

export interface PrincipalRow {
  id: string;
  email: string;
  auth_user_id: string | null;
  display_name: string;
  role: PrincipalRole;
  is_active: boolean;
  source: RecordSource;
  terms_accepted_at: string | null;
  last_seen_in_klubfunder_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PrincipalInsert = Omit<PrincipalRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type PrincipalUpdate = Partial<Omit<PrincipalRow, 'id'>>;

export interface MemberRow {
  id: string;
  principal_id: string;
  first_name: string;
  surname: string;
  date_of_birth: string;
  gender: string | null;
  athletic_association_number: string | null;
  status: MemberStatus;
  is_active: boolean;
  source: RecordSource;
  last_seen_in_klubfunder_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MemberInsert = Omit<MemberRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type MemberUpdate = Partial<Omit<MemberRow, 'id'>>;

export interface Database {
  public: {
    Tables: {
      principals: {
        Row: PrincipalRow;
        Insert: PrincipalInsert;
        Update: PrincipalUpdate;
      };
      members: {
        Row: MemberRow;
        Insert: MemberInsert;
        Update: MemberUpdate;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
