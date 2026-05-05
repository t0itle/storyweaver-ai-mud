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
      lore_entries: {
        Row: {
          content: string
          created_at: string
          keywords: string[]
          slug: string
          source_url: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          keywords?: string[]
          slug: string
          source_url: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          keywords?: string[]
          slug?: string
          source_url?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          author_name: string
          content: string
          created_at: string
          id: string
          kind: string
          npc_id: string | null
          room: string
          user_id: string | null
        }
        Insert: {
          author_name: string
          content: string
          created_at?: string
          id?: string
          kind?: string
          npc_id?: string | null
          room: string
          user_id?: string | null
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          kind?: string
          npc_id?: string | null
          room?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_npc_id_fkey"
            columns: ["npc_id"]
            isOneToOne: false
            referencedRelation: "npcs"
            referencedColumns: ["id"]
          },
        ]
      }
      npcs: {
        Row: {
          greeting: string | null
          id: string
          name: string
          persona: string
          room: string
          title: string | null
        }
        Insert: {
          greeting?: string | null
          id?: string
          name: string
          persona: string
          room: string
          title?: string | null
        }
        Update: {
          greeting?: string | null
          id?: string
          name?: string
          persona?: string
          room?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "npcs_room_fkey"
            columns: ["room"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["slug"]
          },
        ]
      }
      player_lore_discoveries: {
        Row: {
          discovered_at: string
          id: string
          lore_slug: string
          source: string
          user_id: string
        }
        Insert: {
          discovered_at?: string
          id?: string
          lore_slug: string
          source?: string
          user_id: string
        }
        Update: {
          discovered_at?: string
          id?: string
          lore_slug?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_lore_discoveries_lore_slug_fkey"
            columns: ["lore_slug"]
            isOneToOne: false
            referencedRelation: "lore_entries"
            referencedColumns: ["slug"]
          },
        ]
      }
      profiles: {
        Row: {
          char_description: string | null
          created: boolean
          created_at: string
          current_room: string
          gold: number
          hp: number
          id: string
          level: number
          max_hp: number
          portrait_url: string | null
          race: string | null
          updated_at: string
          username: string
          xp: number
        }
        Insert: {
          char_description?: string | null
          created?: boolean
          created_at?: string
          current_room?: string
          gold?: number
          hp?: number
          id: string
          level?: number
          max_hp?: number
          portrait_url?: string | null
          race?: string | null
          updated_at?: string
          username: string
          xp?: number
        }
        Update: {
          char_description?: string | null
          created?: boolean
          created_at?: string
          current_room?: string
          gold?: number
          hp?: number
          id?: string
          level?: number
          max_hp?: number
          portrait_url?: string | null
          race?: string | null
          updated_at?: string
          username?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_race_fkey"
            columns: ["race"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["key"]
          },
        ]
      }
      races: {
        Row: {
          cost: string
          flavor: string
          gain: string
          hp_mod: number
          key: string
          name: string
          sort_order: number
          visual_traits: string
        }
        Insert: {
          cost: string
          flavor: string
          gain: string
          hp_mod?: number
          key: string
          name: string
          sort_order?: number
          visual_traits: string
        }
        Update: {
          cost?: string
          flavor?: string
          gain?: string
          hp_mod?: number
          key?: string
          name?: string
          sort_order?: number
          visual_traits?: string
        }
        Relationships: []
      }
      room_scenes: {
        Row: {
          context_hash: string
          created_at: string
          id: string
          image_url: string
          prompt: string | null
          room: string
        }
        Insert: {
          context_hash: string
          created_at?: string
          id?: string
          image_url: string
          prompt?: string | null
          room: string
        }
        Update: {
          context_hash?: string
          created_at?: string
          id?: string
          image_url?: string
          prompt?: string | null
          room?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          ambience: string | null
          description: string
          exits: Json
          name: string
          slug: string
        }
        Insert: {
          ambience?: string | null
          description: string
          exits?: Json
          name: string
          slug: string
        }
        Update: {
          ambience?: string | null
          description?: string
          exits?: Json
          name?: string
          slug?: string
        }
        Relationships: []
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
