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
  klubfunder_member_id: string | null;
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
  klubfunder_member_id?: string | null;
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
  klubfunder_member_id?: string | null;
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

export type CreditTransactionType =
  | 'top_up_stripe'
  | 'top_up_cash'
  | 'session'
  | 'manual_adjustment'
  | 'refund'
  | 'transfer_in'
  | 'transfer_out';

export type CreditTransactionRow = {
  id: string;
  principal_id: string;
  member_id: string | null;
  amount_pence: number;
  type: CreditTransactionType;
  idempotency_key: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type CreditTransactionInsert = {
  id?: string;
  principal_id: string;
  member_id?: string | null;
  amount_pence: number;
  type: CreditTransactionType;
  idempotency_key: string;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
};

// The ledger is append-only — the table refuses updates and deletes — so there
// is no Update shape to speak of. Postgrest still wants the key present.
export type CreditTransactionUpdate = Record<string, never>;

export type PrincipalBalanceRow = {
  principal_id: string;
  balance_pence: number;
  last_transaction_at: string | null;
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
      credit_transactions: {
        Row: CreditTransactionRow;
        Insert: CreditTransactionInsert;
        Update: CreditTransactionUpdate;
        Relationships: [
          {
            foreignKeyName: 'credit_transactions_principal_id_fkey';
            columns: ['principal_id'];
            referencedRelation: 'principals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_transactions_member_id_fkey';
            columns: ['member_id'];
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_transactions_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'principals';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      principal_balances: {
        Row: PrincipalBalanceRow;
        Relationships: [
          {
            foreignKeyName: 'principal_balances_principal_id_fkey';
            columns: ['principal_id'];
            referencedRelation: 'principals';
            referencedColumns: ['id'];
          },
        ];
      };
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
