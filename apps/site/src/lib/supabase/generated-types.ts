export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          amount_paid_pence: number | null
          created_at: string
          guest_id: string | null
          id: string
          idempotency_key: string
          member_id: string | null
          recorded_by: string
          session_id: string
        }
        Insert: {
          amount_paid_pence?: number | null
          created_at?: string
          guest_id?: string | null
          id?: string
          idempotency_key: string
          member_id?: string | null
          recorded_by: string
          session_id: string
        }
        Update: {
          amount_paid_pence?: number | null
          created_at?: string
          guest_id?: string | null
          id?: string
          idempotency_key?: string
          member_id?: string | null
          recorded_by?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "principal_balances"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_aliases: {
        Row: {
          alias_id: string
          attendance_id: string
        }
        Insert: {
          alias_id: string
          attendance_id: string
        }
        Update: {
          alias_id?: string
          attendance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_aliases_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount_pence: number
          counterparty_principal_id: string | null
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          member_id: string | null
          notes: string | null
          principal_id: string
          session_id: string | null
          type: string
        }
        Insert: {
          amount_pence: number
          counterparty_principal_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key: string
          member_id?: string | null
          notes?: string | null
          principal_id: string
          session_id?: string | null
          type: string
        }
        Update: {
          amount_pence?: number
          counterparty_principal_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string
          member_id?: string | null
          notes?: string | null
          principal_id?: string
          session_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_counterparty_principal_id_fkey"
            columns: ["counterparty_principal_id"]
            isOneToOne: false
            referencedRelation: "principal_balances"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "credit_transactions_counterparty_principal_id_fkey"
            columns: ["counterparty_principal_id"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "principal_balances"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "credit_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "principal_balances"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "credit_transactions_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contact_openings: {
        Row: {
          id: string
          member_id: string
          opened_at: string
          opened_by: string
          recorded_at: string
        }
        Insert: {
          id: string
          member_id: string
          opened_at: string
          opened_by: string
          recorded_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          opened_at?: string
          opened_by?: string
          recorded_at?: string
        }
        Relationships: []
      }
      emergency_contacts: {
        Row: {
          contact_name: string | null
          contact_phone: string
          member_id: string
          source: string
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          contact_phone: string
          member_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string
          member_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      guests: {
        Row: {
          created_at: string
          created_by: string
          first_name: string
          id: string
          surname: string
        }
        Insert: {
          created_at?: string
          created_by: string
          first_name: string
          id?: string
          surname: string
        }
        Update: {
          created_at?: string
          created_by?: string
          first_name?: string
          id?: string
          surname?: string
        }
        Relationships: [
          {
            foreignKeyName: "guests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "principal_balances"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "guests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["id"]
          },
        ]
      }
      member_groups: {
        Row: {
          created_at: string
          group_id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          member_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_groups_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          athletic_association_number: string | null
          created_at: string
          date_of_birth: string
          first_name: string
          gender: string | null
          id: string
          is_active: boolean
          klubfunder_member_id: string | null
          last_seen_in_klubfunder_at: string | null
          principal_id: string
          source: string
          status: string
          surname: string
          trains_free: boolean
          trains_free_reason: string | null
          updated_at: string
        }
        Insert: {
          athletic_association_number?: string | null
          created_at?: string
          date_of_birth: string
          first_name: string
          gender?: string | null
          id?: string
          is_active?: boolean
          klubfunder_member_id?: string | null
          last_seen_in_klubfunder_at?: string | null
          principal_id: string
          source?: string
          status?: string
          surname: string
          trains_free?: boolean
          trains_free_reason?: string | null
          updated_at?: string
        }
        Update: {
          athletic_association_number?: string | null
          created_at?: string
          date_of_birth?: string
          first_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          klubfunder_member_id?: string | null
          last_seen_in_klubfunder_at?: string | null
          principal_id?: string
          source?: string
          status?: string
          surname?: string
          trains_free?: boolean
          trains_free_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "principal_balances"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "members_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["id"]
          },
        ]
      }
      principals: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_name: string
          email: string
          emergency_contacts_reason: string | null
          id: string
          is_active: boolean
          last_seen_in_klubfunder_at: string | null
          opens_emergency_contacts: boolean
          role: string
          source: string
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_name: string
          email: string
          emergency_contacts_reason?: string | null
          id?: string
          is_active?: boolean
          last_seen_in_klubfunder_at?: string | null
          opens_emergency_contacts?: boolean
          role?: string
          source?: string
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string
          email?: string
          emergency_contacts_reason?: string | null
          id?: string
          is_active?: boolean
          last_seen_in_klubfunder_at?: string | null
          opens_emergency_contacts?: boolean
          role?: string
          source?: string
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      training_sessions: {
        Row: {
          created_at: string
          created_by: string
          group_id: string
          id: string
          is_cancelled: boolean
          note: string | null
          price_pence: number
          starts_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          group_id: string
          id?: string
          is_cancelled?: boolean
          note?: string | null
          price_pence: number
          starts_at: string
        }
        Update: {
          created_at?: string
          created_by?: string
          group_id?: string
          id?: string
          is_cancelled?: boolean
          note?: string | null
          price_pence?: number
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "principal_balances"
            referencedColumns: ["principal_id"]
          },
          {
            foreignKeyName: "training_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "principals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      principal_balances: {
        Row: {
          balance_pence: number | null
          last_transaction_at: string | null
          principal_id: string | null
        }
        Relationships: []
      }
      squad_regulars: {
        Row: {
          group_id: string | null
          last_attended_at: string | null
          member_id: string | null
          sessions_attended: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_run_a_session: { Args: never; Returns: boolean }
      current_app_role: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      is_club_admin: { Args: never; Returns: boolean }
      opens_emergency_contacts: { Args: never; Returns: boolean }
      own_household_member_ids: { Args: never; Returns: string[] }
      sign_in_guest: {
        Args: {
          p_attendance_id?: string
          p_guest_id: string
          p_session_id: string
        }
        Returns: string
      }
      sign_in_member: {
        Args: {
          p_attendance_id?: string
          p_member_id: string
          p_session_id: string
        }
        Returns: string
      }
      undo_guest_sign_in: {
        Args: { p_attendance_id: string }
        Returns: undefined
      }
      undo_member_sign_in: {
        Args: { p_attendance_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
