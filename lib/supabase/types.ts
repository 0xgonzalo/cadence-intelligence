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
      agent_config: {
        Row: {
          artist_id: string
          brand_voice: string | null
          cadence: string | null
          formats: string[]
          id: string
          push_targets: Json | null
          thresholds: Json | null
        }
        Insert: {
          artist_id: string
          brand_voice?: string | null
          cadence?: string | null
          formats?: string[]
          id?: string
          push_targets?: Json | null
          thresholds?: Json | null
        }
        Update: {
          artist_id?: string
          brand_voice?: string | null
          cadence?: string | null
          formats?: string[]
          id?: string
          push_targets?: Json | null
          thresholds?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_config_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_log: {
        Row: {
          artist_id: string
          created_at: string
          id: string
          level: string
          message: string
          payload: Json | null
          phase: string | null
        }
        Insert: {
          artist_id: string
          created_at?: string
          id?: string
          level?: string
          message: string
          payload?: Json | null
          phase?: string | null
        }
        Update: {
          artist_id?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          payload?: Json | null
          phase?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_log_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artists: {
        Row: {
          created_at: string
          id: string
          name: string
          spotify_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          spotify_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          spotify_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      briefs: {
        Row: {
          angle: string | null
          copy: Json | null
          created_at: string
          format: string
          id: string
          language: string | null
          market: string | null
          opportunity_id: string
        }
        Insert: {
          angle?: string | null
          copy?: Json | null
          created_at?: string
          format: string
          id?: string
          language?: string | null
          market?: string | null
          opportunity_id: string
        }
        Update: {
          angle?: string | null
          copy?: Json | null
          created_at?: string
          format?: string
          id?: string
          language?: string | null
          market?: string | null
          opportunity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "briefs_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "content_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_leads: {
        Row: {
          created_at: string
          fit_score: number | null
          handle: string
          id: string
          market: string | null
          opportunity_id: string
          outreach_draft: string | null
          rationale: string | null
          reach: number | null
          source: string | null
        }
        Insert: {
          created_at?: string
          fit_score?: number | null
          handle: string
          id?: string
          market?: string | null
          opportunity_id: string
          outreach_draft?: string | null
          rationale?: string | null
          reach?: number | null
          source?: string | null
        }
        Update: {
          created_at?: string
          fit_score?: number | null
          handle?: string
          id?: string
          market?: string | null
          opportunity_id?: string
          outreach_draft?: string | null
          rationale?: string | null
          reach?: number | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collab_leads_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "content_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      content_opportunities: {
        Row: {
          artist_id: string
          detected_at: string
          id: string
          language: string | null
          market: string | null
          reason: string | null
          signal_delta: Json | null
          status: string
          track_id: string | null
        }
        Insert: {
          artist_id: string
          detected_at?: string
          id?: string
          language?: string | null
          market?: string | null
          reason?: string | null
          signal_delta?: Json | null
          status?: string
          track_id?: string | null
        }
        Update: {
          artist_id?: string
          detected_at?: string
          id?: string
          language?: string | null
          market?: string | null
          reason?: string | null
          signal_delta?: Json | null
          status?: string
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_opportunities_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_opportunities_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      content_packages: {
        Row: {
          assets: Json
          created_at: string
          id: string
          opportunity_id: string
          status: string
        }
        Insert: {
          assets?: Json
          created_at?: string
          id?: string
          opportunity_id: string
          status?: string
        }
        Update: {
          assets?: Json
          created_at?: string
          id?: string
          opportunity_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_packages_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "content_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      track_intelligence: {
        Row: {
          bpm: number | null
          clip_end_ms: number | null
          clip_start_ms: number | null
          energy_curve: Json | null
          language: string | null
          mood: string | null
          themes: string[]
          track_id: string
          updated_at: string
          visual_mood: string | null
        }
        Insert: {
          bpm?: number | null
          clip_end_ms?: number | null
          clip_start_ms?: number | null
          energy_curve?: Json | null
          language?: string | null
          mood?: string | null
          themes?: string[]
          track_id: string
          updated_at?: string
          visual_mood?: string | null
        }
        Update: {
          bpm?: number | null
          clip_end_ms?: number | null
          clip_start_ms?: number | null
          energy_curve?: Json | null
          language?: string | null
          mood?: string | null
          themes?: string[]
          track_id?: string
          updated_at?: string
          visual_mood?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "track_intelligence_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: true
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_signals: {
        Row: {
          captured_at: string
          id: string
          market: string | null
          metric: string
          source: string
          track_id: string
          value: number
        }
        Insert: {
          captured_at?: string
          id?: string
          market?: string | null
          metric: string
          source: string
          track_id: string
          value: number
        }
        Update: {
          captured_at?: string
          id?: string
          market?: string | null
          metric?: string
          source?: string
          track_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "track_signals_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          artist_id: string
          created_at: string
          id: string
          isrc: string | null
          mxm_track_id: string | null
          title: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          id?: string
          isrc?: string | null
          mxm_track_id?: string | null
          title: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          id?: string
          isrc?: string | null
          mxm_track_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracks_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plans: {
        Row: {
          artist_id: string
          created_at: string
          id: string
          plan: Json | null
          week_start: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          id?: string
          plan?: Json | null
          week_start: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          id?: string
          plan?: Json | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plans_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
