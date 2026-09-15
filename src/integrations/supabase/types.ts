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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string
          default_country_code: string
          invoice_counter: number
          name: string
          phone: string
          profit_pin_hash: string | null
          purchase_counter: number
          sms_enabled: boolean
          sms_invoice_enabled: boolean
          sms_payment_enabled: boolean
          sms_template_invoice: string | null
          sms_template_payment: string | null
          updated_at: string
          user_id: string
          wa_invoice_template: string | null
          wa_statement_template: string | null
        }
        Insert: {
          address?: string
          default_country_code?: string
          invoice_counter?: number
          name?: string
          phone?: string
          profit_pin_hash?: string | null
          purchase_counter?: number
          sms_enabled?: boolean
          sms_invoice_enabled?: boolean
          sms_payment_enabled?: boolean
          sms_template_invoice?: string | null
          sms_template_payment?: string | null
          updated_at?: string
          user_id: string
          wa_invoice_template?: string | null
          wa_statement_template?: string | null
        }
        Update: {
          address?: string
          default_country_code?: string
          invoice_counter?: number
          name?: string
          phone?: string
          profit_pin_hash?: string | null
          purchase_counter?: number
          sms_enabled?: boolean
          sms_invoice_enabled?: boolean
          sms_payment_enabled?: boolean
          sms_template_invoice?: string | null
          sms_template_payment?: string | null
          updated_at?: string
          user_id?: string
          wa_invoice_template?: string | null
          wa_statement_template?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          area: string | null
          company: string | null
          created_at: string
          id: string
          name: string
          opening_balance: number
          phone: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          area?: string | null
          company?: string | null
          created_at?: string
          id?: string
          name: string
          opening_balance?: number
          phone?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          area?: string | null
          company?: string | null
          created_at?: string
          id?: string
          name?: string
          opening_balance?: number
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          customer_id: string
          customer_name: string
          date: string
          id: string
          items: Json
          notes: string | null
          number: number
          paid: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          customer_name: string
          date?: string
          id?: string
          items?: Json
          notes?: string | null
          number: number
          paid?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          customer_name?: string
          date?: string
          id?: string
          items?: Json
          notes?: string | null
          number?: number
          paid?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      last_prices: {
        Row: {
          customer_id: string
          price: number
          product_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          customer_id: string
          price: number
          product_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          customer_id?: string
          price?: number
          product_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          customer_name: string
          date: string
          id: string
          method: string | null
          notes: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_id: string
          customer_name: string
          date?: string
          id?: string
          method?: string | null
          notes?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          customer_name?: string
          date?: string
          id?: string
          method?: string | null
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      print_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          kind: string
          payload: Json
          printed_at: string | null
          requested_by: string | null
          requested_by_name: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          payload?: Json
          printed_at?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          payload?: Json
          printed_at?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          company: string | null
          created_at: string
          id: string
          low_stock_threshold: number
          name: string
          pack: string | null
          purchase_price: number
          sale_price: number
          stock: number
          unit: string | null
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name: string
          pack?: string | null
          purchase_price?: number
          sale_price?: number
          stock?: number
          unit?: string | null
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name?: string
          pack?: string | null
          purchase_price?: number
          sale_price?: number
          stock?: number
          unit?: string | null
          user_id?: string
        }
        Relationships: []
      }
      purchase_returns: {
        Row: {
          created_at: string
          date: string
          id: string
          items: Json
          notes: string | null
          supplier_id: string
          supplier_name: string
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          items?: Json
          notes?: string | null
          supplier_id: string
          supplier_name: string
          total?: number
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          items?: Json
          notes?: string | null
          supplier_id?: string
          supplier_name?: string
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          created_at: string
          date: string
          id: string
          items: Json
          notes: string | null
          number: number
          paid: number
          supplier_id: string
          supplier_name: string
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          items?: Json
          notes?: string | null
          number: number
          paid?: number
          supplier_id: string
          supplier_name: string
          total?: number
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          items?: Json
          notes?: string | null
          number?: number
          paid?: number
          supplier_id?: string
          supplier_name?: string
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      sales_returns: {
        Row: {
          created_at: string
          customer_id: string
          customer_name: string
          date: string
          id: string
          items: Json
          notes: string | null
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          customer_name: string
          date?: string
          id?: string
          items?: Json
          notes?: string | null
          total?: number
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          customer_name?: string
          date?: string
          id?: string
          items?: Json
          notes?: string | null
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          date: string
          id: string
          method: string | null
          notes: string | null
          supplier_id: string
          supplier_name: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          date?: string
          id?: string
          method?: string | null
          notes?: string | null
          supplier_id: string
          supplier_name: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          id?: string
          method?: string | null
          notes?: string | null
          supplier_id?: string
          supplier_name?: string
          user_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          area: string | null
          company: string | null
          created_at: string
          id: string
          name: string
          opening_balance: number
          phone: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          area?: string | null
          company?: string | null
          created_at?: string
          id?: string
          name: string
          opening_balance?: number
          phone?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          area?: string | null
          company?: string | null
          created_at?: string
          id?: string
          name?: string
          opening_balance?: number
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "salesman"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "salesman"],
    },
  },
} as const
