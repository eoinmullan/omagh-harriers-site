// Hand-rolled Database type for the principals + members schema.
// Regenerate with `pnpm supabase:types` once the Supabase CLI is set up.
//
// Shape follows Supabase's generated-types convention so that the
// SupabaseClient<Database> type machinery (in @supabase/postgrest-js) infers
// table column types correctly. In particular: every Row/Insert/Update is a
// type alias (not interface), Relationships is present per table, and
// Views/Functions/Enums/CompositeTypes use the empty-mapped-type pattern.

export type PrincipalRole = 'member' | 'admin' | 'superuser';
export type RecordSource = 'klubfunder' | 'manual';
export type MemberStatus = 'paid' | 'lapsed';

export type PrincipalRow = {
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
};

export type PrincipalInsert = {
  id?: string;
  email: string;
  auth_user_id?: string | null;
  display_name: string;
  role?: PrincipalRole;
  is_active?: boolean;
  source?: RecordSource;
  terms_accepted_at?: string | null;
  last_seen_in_klubfunder_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PrincipalUpdate = {
  id?: string;
  email?: string;
  auth_user_id?: string | null;
  display_name?: string;
  role?: PrincipalRole;
  is_active?: boolean;
  source?: RecordSource;
  terms_accepted_at?: string | null;
  last_seen_in_klubfunder_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MemberRow = {
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
};

export type MemberInsert = {
  id?: string;
  principal_id: string;
  first_name: string;
  surname: string;
  date_of_birth: string;
  gender?: string | null;
  athletic_association_number?: string | null;
  status?: MemberStatus;
  is_active?: boolean;
  source?: RecordSource;
  last_seen_in_klubfunder_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MemberUpdate = {
  id?: string;
  principal_id?: string;
  first_name?: string;
  surname?: string;
  date_of_birth?: string;
  gender?: string | null;
  athletic_association_number?: string | null;
  status?: MemberStatus;
  is_active?: boolean;
  source?: RecordSource;
  last_seen_in_klubfunder_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Database = {
  public: {
    Tables: {
      principals: {
        Row: PrincipalRow;
        Insert: PrincipalInsert;
        Update: PrincipalUpdate;
        Relationships: [];
      };
      members: {
        Row: MemberRow;
        Insert: MemberInsert;
        Update: MemberUpdate;
        Relationships: [
          {
            foreignKeyName: 'members_principal_id_fkey';
            columns: ['principal_id'];
            referencedRelation: 'principals';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
