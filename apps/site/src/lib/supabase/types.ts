// Hand-rolled Database type for the principals + members schema.
// Regenerate with `pnpm supabase:types` once the Supabase CLI is set up.
//
// Shape follows Supabase's generated-types convention so that the
// SupabaseClient<Database> type machinery (in @supabase/postgrest-js) infers
// table column types correctly. In particular: every Row/Insert/Update is a
// type alias (not interface), Relationships is present per table, and
// Views/Functions/Enums/CompositeTypes use the empty-mapped-type pattern.

export type PrincipalRole = 'member' | 'registrar' | 'admin' | 'superuser';
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
  session_id: string | null;
  counterparty_principal_id: string | null;
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
  session_id?: string | null;
  counterparty_principal_id?: string | null;
  created_at?: string;
};

// The ledger is append-only — the table refuses updates and deletes — so there
// is no Update shape to speak of. Postgrest still wants the key present.
export type CreditTransactionUpdate = Record<string, never>;

export type GroupRow = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

export type GroupInsert = {
  id?: string;
  name: string;
  is_active?: boolean;
  created_at?: string;
};

export type GroupUpdate = {
  id?: string;
  name?: string;
  is_active?: boolean;
  created_at?: string;
};

export type TrainingSessionRow = {
  id: string;
  group_id: string;
  starts_at: string;
  note: string | null;
  price_pence: number;
  is_cancelled: boolean;
  created_by: string;
  created_at: string;
};

export type TrainingSessionInsert = {
  id?: string;
  group_id: string;
  starts_at: string;
  note?: string | null;
  price_pence: number;
  is_cancelled?: boolean;
  created_by: string;
  created_at?: string;
};

export type TrainingSessionUpdate = {
  id?: string;
  group_id?: string;
  starts_at?: string;
  note?: string | null;
  price_pence?: number;
  is_cancelled?: boolean;
  created_by?: string;
  created_at?: string;
};

export type MemberGroupRow = {
  member_id: string;
  group_id: string;
  created_at: string;
};

export type MemberGroupInsert = {
  member_id: string;
  group_id: string;
  created_at?: string;
};

export type MemberGroupUpdate = {
  member_id?: string;
  group_id?: string;
  created_at?: string;
};

export type GuestRow = {
  id: string;
  first_name: string;
  surname: string;
  created_by: string;
  created_at: string;
};

export type GuestInsert = {
  id?: string;
  first_name: string;
  surname: string;
  created_by: string;
  created_at?: string;
};

export type GuestUpdate = {
  id?: string;
  first_name?: string;
  surname?: string;
  created_by?: string;
  created_at?: string;
};

// `amount_paid_pence` is a guest's cash for the session. A member's £2 comes
// out of the household pot, so it lives in credit_transactions instead, and
// the table refuses a member row that carries an amount.
export type AttendanceRow = {
  id: string;
  session_id: string;
  member_id: string | null;
  guest_id: string | null;
  amount_paid_pence: number | null;
  recorded_by: string;
  idempotency_key: string;
  created_at: string;
};

export type AttendanceInsert = {
  id?: string;
  session_id: string;
  member_id?: string | null;
  guest_id?: string | null;
  amount_paid_pence?: number | null;
  recorded_by: string;
  idempotency_key: string;
  created_at?: string;
};

// Unticking somebody removes the row rather than amending it, and a guest's
// payment figure states what they handed over. Nothing updates attendance, so
// there are no policies permitting it.
export type AttendanceUpdate = Record<string, never>;

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
          {
            foreignKeyName: 'credit_transactions_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'training_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'credit_transactions_counterparty_principal_id_fkey';
            columns: ['counterparty_principal_id'];
            referencedRelation: 'principals';
            referencedColumns: ['id'];
          },
        ];
      };
      groups: {
        Row: GroupRow;
        Insert: GroupInsert;
        Update: GroupUpdate;
        Relationships: [];
      };
      training_sessions: {
        Row: TrainingSessionRow;
        Insert: TrainingSessionInsert;
        Update: TrainingSessionUpdate;
        Relationships: [
          {
            foreignKeyName: 'training_sessions_group_id_fkey';
            columns: ['group_id'];
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'training_sessions_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'principals';
            referencedColumns: ['id'];
          },
        ];
      };
      member_groups: {
        Row: MemberGroupRow;
        Insert: MemberGroupInsert;
        Update: MemberGroupUpdate;
        Relationships: [
          {
            foreignKeyName: 'member_groups_member_id_fkey';
            columns: ['member_id'];
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'member_groups_group_id_fkey';
            columns: ['group_id'];
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
      guests: {
        Row: GuestRow;
        Insert: GuestInsert;
        Update: GuestUpdate;
        Relationships: [
          {
            foreignKeyName: 'guests_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'principals';
            referencedColumns: ['id'];
          },
        ];
      };
      attendance: {
        Row: AttendanceRow;
        Insert: AttendanceInsert;
        Update: AttendanceUpdate;
        Relationships: [
          {
            foreignKeyName: 'attendance_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'training_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_member_id_fkey';
            columns: ['member_id'];
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_guest_id_fkey';
            columns: ['guest_id'];
            referencedRelation: 'guests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_recorded_by_fkey';
            columns: ['recorded_by'];
            referencedRelation: 'principals';
            referencedColumns: ['id'];
          },
        ];
      };
      // Migration 0019. Written and read only inside the sign-in RPCs; listed
      // so the tables here match the database (types-match-schema.ts).
      attendance_aliases: {
        Row: { alias_id: string; attendance_id: string };
        Insert: { alias_id: string; attendance_id: string };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: 'attendance_aliases_attendance_id_fkey';
            columns: ['attendance_id'];
            referencedRelation: 'attendance';
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
      // Migration 0020. Each member who has trained with a squad, once.
      squad_regulars: {
        Row: { group_id: string; member_id: string };
        Relationships: [];
      };
    };
    Functions: {
      // Migration 0011. A tick is two rows in two tables and PostgREST cannot
      // write both in one statement, so the pair goes through these.
      sign_in_member: {
        Args: {
          p_member_id: string;
          p_session_id: string;
          // Optional, for the offline queue: a phone that fixes the row's
          // identity at tick time can retry the same call for hours.
          p_attendance_id?: string;
        };
        Returns: string;
      };
      undo_member_sign_in: {
        Args: { p_attendance_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
