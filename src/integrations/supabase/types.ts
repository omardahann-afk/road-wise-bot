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
      diagnostics: {
        Row: {
          ai_output: Json | null
          created_at: string
          id: string
          input: Json
          mode: Database["public"]["Enums"]["diagnostic_mode"]
          severity: Database["public"]["Enums"]["severity_level"] | null
          summary: string | null
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          ai_output?: Json | null
          created_at?: string
          id?: string
          input?: Json
          mode: Database["public"]["Enums"]["diagnostic_mode"]
          severity?: Database["public"]["Enums"]["severity_level"] | null
          summary?: string | null
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          ai_output?: Json | null
          created_at?: string
          id?: string
          input?: Json
          mode?: Database["public"]["Enums"]["diagnostic_mode"]
          severity?: Database["public"]["Enums"]["severity_level"] | null
          summary?: string | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnostics_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          asking_price: number | null
          created_at: string
          findings: Json | null
          id: string
          notes: string | null
          recommendation: string | null
          scores: Json | null
          updated_at: string
          user_id: string
          vehicle_info: Json
        }
        Insert: {
          asking_price?: number | null
          created_at?: string
          findings?: Json | null
          id?: string
          notes?: string | null
          recommendation?: string | null
          scores?: Json | null
          updated_at?: string
          user_id: string
          vehicle_info?: Json
        }
        Update: {
          asking_price?: number | null
          created_at?: string
          findings?: Json | null
          id?: string
          notes?: string | null
          recommendation?: string | null
          scores?: Json | null
          updated_at?: string
          user_id?: string
          vehicle_info?: Json
        }
        Relationships: []
      }
      knowledge_sources: {
        Row: {
          body: Json
          created_at: string
          id: string
          key: string
          source_type: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          body?: Json
          created_at?: string
          id?: string
          key: string
          source_type: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: Json
          created_at?: string
          id?: string
          key?: string
          source_type?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      learning_events: {
        Row: {
          created_at: string
          detection_confidence: number | null
          id: string
          issue_confirmed_by_user: boolean | null
          issue_detected: string | null
          metadata: Json
          paint_color: string | null
          paint_tone: string | null
          source: string
          step_id: string | null
          surface_visibility: string | null
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          detection_confidence?: number | null
          id?: string
          issue_confirmed_by_user?: boolean | null
          issue_detected?: string | null
          metadata?: Json
          paint_color?: string | null
          paint_tone?: string | null
          source: string
          step_id?: string | null
          surface_visibility?: string | null
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          detection_confidence?: number | null
          id?: string
          issue_confirmed_by_user?: boolean | null
          issue_detected?: string | null
          metadata?: Json
          paint_color?: string | null
          paint_tone?: string | null
          source?: string
          step_id?: string | null
          surface_visibility?: string | null
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: []
      }
      product_recommendation_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          price_estimate: number | null
          priority: number | null
          product_name: string
          task_slug: string
          url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          price_estimate?: number | null
          priority?: number | null
          product_name: string
          task_slug: string
          url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          price_estimate?: number | null
          priority?: number | null
          product_name?: string
          task_slug?: string
          url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          experience: Database["public"]["Enums"]["experience_level"] | null
          id: string
          locale: string | null
          units: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          experience?: Database["public"]["Enums"]["experience_level"] | null
          id?: string
          locale?: string | null
          units?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          experience?: Database["public"]["Enums"]["experience_level"] | null
          id?: string
          locale?: string | null
          units?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      repair_guides: {
        Row: {
          created_at: string
          diagnostic_id: string | null
          difficulty: string | null
          estimated_cost: Json | null
          id: string
          parts: Json | null
          steps: Json
          title: string
          tools: Json | null
          updated_at: string
          user_id: string
          vehicle_id: string | null
          warnings: Json | null
        }
        Insert: {
          created_at?: string
          diagnostic_id?: string | null
          difficulty?: string | null
          estimated_cost?: Json | null
          id?: string
          parts?: Json | null
          steps?: Json
          title: string
          tools?: Json | null
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
          warnings?: Json | null
        }
        Update: {
          created_at?: string
          diagnostic_id?: string | null
          difficulty?: string | null
          estimated_cost?: Json | null
          id?: string
          parts?: Json | null
          steps?: Json
          title?: string
          tools?: Json | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
          warnings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_guides_diagnostic_id_fkey"
            columns: ["diagnostic_id"]
            isOneToOne: false
            referencedRelation: "diagnostics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_guides_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          difficulty: string | null
          estimated_cost: Json | null
          id: string
          slug: string
          steps: Json
          title: string
          tools: Json | null
          updated_at: string
          warnings: Json | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          difficulty?: string | null
          estimated_cost?: Json | null
          id?: string
          slug: string
          steps?: Json
          title: string
          tools?: Json | null
          updated_at?: string
          warnings?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          difficulty?: string | null
          estimated_cost?: Json | null
          id?: string
          slug?: string
          steps?: Json
          title?: string
          tools?: Json | null
          updated_at?: string
          warnings?: Json | null
        }
        Relationships: []
      }
      sessions: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          kind: Database["public"]["Enums"]["session_kind"]
          status: string | null
          title: string | null
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          kind: Database["public"]["Enums"]["session_kind"]
          status?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          kind?: Database["public"]["Enums"]["session_kind"]
          status?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      universal_task_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          difficulty: string | null
          duration_minutes: number | null
          id: string
          slug: string
          steps: Json
          title: string
          tools: Json | null
          updated_at: string
          warnings: Json | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          difficulty?: string | null
          duration_minutes?: number | null
          id?: string
          slug: string
          steps?: Json
          title: string
          tools?: Json | null
          updated_at?: string
          warnings?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          difficulty?: string | null
          duration_minutes?: number | null
          id?: string
          slug?: string
          steps?: Json
          title?: string
          tools?: Json | null
          updated_at?: string
          warnings?: Json | null
        }
        Relationships: []
      }
      usage_limits: {
        Row: {
          ai_requests: number
          camera_minutes: number
          diagnostics_count: number
          id: string
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_requests?: number
          camera_minutes?: number
          diagnostics_count?: number
          id?: string
          period_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_requests?: number
          camera_minutes?: number
          diagnostics_count?: number
          id?: string
          period_start?: string
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
      valuation_reports: {
        Row: {
          ai_output: Json | null
          asking_price: number | null
          base_price: number | null
          created_at: string
          decision: string | null
          fair_value_avg: number | null
          fair_value_high: number | null
          fair_value_low: number | null
          id: string
          inspection_id: string | null
          negotiation_advice: string | null
          updated_at: string
          user_id: string
          vehicle_info: Json
        }
        Insert: {
          ai_output?: Json | null
          asking_price?: number | null
          base_price?: number | null
          created_at?: string
          decision?: string | null
          fair_value_avg?: number | null
          fair_value_high?: number | null
          fair_value_low?: number | null
          id?: string
          inspection_id?: string | null
          negotiation_advice?: string | null
          updated_at?: string
          user_id: string
          vehicle_info?: Json
        }
        Update: {
          ai_output?: Json | null
          asking_price?: number | null
          base_price?: number | null
          created_at?: string
          decision?: string | null
          fair_value_avg?: number | null
          fair_value_high?: number | null
          fair_value_low?: number | null
          id?: string
          inspection_id?: string | null
          negotiation_advice?: string | null
          updated_at?: string
          user_id?: string
          vehicle_info?: Json
        }
        Relationships: [
          {
            foreignKeyName: "valuation_reports_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string
          fuel_type: string | null
          id: string
          image_url: string | null
          make: string | null
          metadata: Json | null
          mileage: number | null
          model: string | null
          nickname: string | null
          transmission: string | null
          trim: string | null
          updated_at: string
          user_id: string
          vin: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          fuel_type?: string | null
          id?: string
          image_url?: string | null
          make?: string | null
          metadata?: Json | null
          mileage?: number | null
          model?: string | null
          nickname?: string | null
          transmission?: string | null
          trim?: string | null
          updated_at?: string
          user_id: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          fuel_type?: string | null
          id?: string
          image_url?: string | null
          make?: string | null
          metadata?: Json | null
          mileage?: number | null
          model?: string | null
          nickname?: string | null
          transmission?: string | null
          trim?: string | null
          updated_at?: string
          user_id?: string
          vin?: string | null
          year?: number | null
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
      app_role: "admin" | "mechanic" | "user"
      diagnostic_mode: "camera" | "obd2" | "symptom" | "inspection"
      experience_level: "beginner" | "intermediate" | "advanced"
      session_kind:
        | "camera"
        | "repair"
        | "cleaning"
        | "inspection"
        | "beginner"
        | "valuation"
      severity_level: "info" | "low" | "medium" | "high" | "critical"
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
    Enums: {
      app_role: ["admin", "mechanic", "user"],
      diagnostic_mode: ["camera", "obd2", "symptom", "inspection"],
      experience_level: ["beginner", "intermediate", "advanced"],
      session_kind: [
        "camera",
        "repair",
        "cleaning",
        "inspection",
        "beginner",
        "valuation",
      ],
      severity_level: ["info", "low", "medium", "high", "critical"],
    },
  },
} as const
