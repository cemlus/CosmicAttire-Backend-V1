// ============================================================================
// HAND-AUTHORED, NOT GENERATED — pending real access.
// This file is normally produced by `npm run update-types` (supabase gen
// types) against the live project. As of the Phase 1 unification the server
// was repointed at the app's Supabase project (duhujnznyacxpllmpyyz) instead
// of the old backend project this was originally generated from, and that
// project wasn't reachable to regenerate against. Every table/column below
// was hand-matched against the actual migration SQL
// (supabase_schema.sql + supabase_migration_*.sql in the app repo) rather
// than introspected — re-run `npm run update-types` once the migrations
// have actually been applied and drop this notice.
// ============================================================================

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
      profiles: {
        Row: {
          id: string
          user_id: string
          full_name: string | null
          email: string | null
          phone: string | null
          age: string | null
          title: string | null
          app_role: string
          bio: string | null
          avatar_url: string | null
          cosmic_id: string | null
          nickname: string | null
          instagram: string | null
          linkedin: string | null
          twitter: string | null
          whatsapp_number: string | null
          pitch_deck_url: string | null
          resume_url: string | null
          portfolio_url: string | null
          permission: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          age?: string | null
          title?: string | null
          app_role?: string
          bio?: string | null
          avatar_url?: string | null
          cosmic_id?: string | null
          nickname?: string | null
          instagram?: string | null
          linkedin?: string | null
          twitter?: string | null
          whatsapp_number?: string | null
          pitch_deck_url?: string | null
          resume_url?: string | null
          portfolio_url?: string | null
          permission?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          age?: string | null
          title?: string | null
          app_role?: string
          bio?: string | null
          avatar_url?: string | null
          cosmic_id?: string | null
          nickname?: string | null
          instagram?: string | null
          linkedin?: string | null
          twitter?: string | null
          whatsapp_number?: string | null
          pitch_deck_url?: string | null
          resume_url?: string | null
          portfolio_url?: string | null
          permission?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      otp_verifications: {
        Row: {
          created_at: string
          id: string
          user_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      payment_devices: {
        Row: {
          created_at: string
          device_secret: string | null
          hardware_uid: string | null
          id: string
          label: string | null
          lat: number | null
          lng: number | null
          location: string | null
          mac_address: string
          organization_id: string | null
          radius_m: number
          reader_type: string
          shopkeeper_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_secret?: string | null
          hardware_uid?: string | null
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          mac_address: string
          organization_id?: string | null
          radius_m?: number
          reader_type?: string
          shopkeeper_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_secret?: string | null
          hardware_uid?: string | null
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          location?: string | null
          mac_address?: string
          organization_id?: string | null
          radius_m?: number
          reader_type?: string
          shopkeeper_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_devices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reader_access: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          reader_id: string
          ring_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          reader_id: string
          ring_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          reader_id?: string
          ring_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reader_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reader_access_reader_id_fkey"
            columns: ["reader_id"]
            isOneToOne: false
            referencedRelation: "payment_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reader_access_ring_id_fkey"
            columns: ["ring_id"]
            isOneToOne: false
            referencedRelation: "rings"
            referencedColumns: ["id"]
          },
        ]
      }
      rings: {
        Row: {
          created_at: string
          id: string
          nfc_uid: string | null
          org_name: string | null
          ring_id: string
          status: string
          last_sync: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nfc_uid?: string | null
          org_name?: string | null
          ring_id: string
          status?: string
          last_sync?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nfc_uid?: string | null
          org_name?: string | null
          ring_id?: string
          status?: string
          last_sync?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string | null
          id: string
          location: string | null
          merchant: string | null
          organization_id: string | null
          ring_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          merchant?: string | null
          organization_id?: string | null
          ring_id?: string | null
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          merchant?: string | null
          organization_id?: string | null
          ring_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: string
          organization_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: string
          organization_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: string
          organization_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          id: string
          balance: number
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          balance?: number
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          balance?: number
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      process_payment: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_location: string
          p_mac_address: string
          p_ring_id: string
          p_shopkeeper_id: string
        }
        Returns: Json
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
