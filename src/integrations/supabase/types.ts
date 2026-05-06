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
      aethers: {
        Row: {
          domain: string
          gift: string
          glyph: string
          key: string
          name: string
          sort_order: number
          vow: string
        }
        Insert: {
          domain: string
          gift: string
          glyph?: string
          key: string
          name: string
          sort_order?: number
          vow: string
        }
        Update: {
          domain?: string
          gift?: string
          glyph?: string
          key?: string
          name?: string
          sort_order?: number
          vow?: string
        }
        Relationships: []
      }
      combat_actions: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          combat_id: string
          created_at: string
          damage: number
          id: string
          target_name: string | null
          text: string
          turn_number: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name: string
          combat_id: string
          created_at?: string
          damage?: number
          id?: string
          target_name?: string | null
          text: string
          turn_number: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          combat_id?: string
          created_at?: string
          damage?: number
          id?: string
          target_name?: string | null
          text?: string
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "combat_actions_combat_id_fkey"
            columns: ["combat_id"]
            isOneToOne: false
            referencedRelation: "combats"
            referencedColumns: ["id"]
          },
        ]
      }
      combatants: {
        Row: {
          combat_id: string
          defeated: boolean
          defending: boolean
          hp: number
          id: string
          initiative: number
          kind: string
          max_hp: number
          name: string
          npc_id: string | null
          side: string
          turn_order: number
          user_id: string | null
        }
        Insert: {
          combat_id: string
          defeated?: boolean
          defending?: boolean
          hp: number
          id?: string
          initiative?: number
          kind: string
          max_hp: number
          name: string
          npc_id?: string | null
          side: string
          turn_order?: number
          user_id?: string | null
        }
        Update: {
          combat_id?: string
          defeated?: boolean
          defending?: boolean
          hp?: number
          id?: string
          initiative?: number
          kind?: string
          max_hp?: number
          name?: string
          npc_id?: string | null
          side?: string
          turn_order?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "combatants_combat_id_fkey"
            columns: ["combat_id"]
            isOneToOne: false
            referencedRelation: "combats"
            referencedColumns: ["id"]
          },
        ]
      }
      combats: {
        Row: {
          current_combatant_id: string | null
          ended_at: string | null
          id: string
          log: Json
          room: string
          started_at: string
          status: string
          turn_number: number
          winner_side: string | null
        }
        Insert: {
          current_combatant_id?: string | null
          ended_at?: string | null
          id?: string
          log?: Json
          room: string
          started_at?: string
          status?: string
          turn_number?: number
          winner_side?: string | null
        }
        Update: {
          current_combatant_id?: string | null
          ended_at?: string | null
          id?: string
          log?: Json
          room?: string
          started_at?: string
          status?: string
          turn_number?: number
          winner_side?: string | null
        }
        Relationships: []
      }
      item_runes: {
        Row: {
          charges: number
          id: string
          max_charges: number
          player_item_id: string
          rune_key: string
          woven_at: string
        }
        Insert: {
          charges?: number
          id?: string
          max_charges?: number
          player_item_id: string
          rune_key: string
          woven_at?: string
        }
        Update: {
          charges?: number
          id?: string
          max_charges?: number
          player_item_id?: string
          rune_key?: string
          woven_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_runes_player_item_id_fkey"
            columns: ["player_item_id"]
            isOneToOne: false
            referencedRelation: "player_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_runes_rune_key_fkey"
            columns: ["rune_key"]
            isOneToOne: false
            referencedRelation: "runes"
            referencedColumns: ["key"]
          },
        ]
      }
      items: {
        Row: {
          base_armor: number
          base_damage: number
          capacity_weight: number
          description: string
          heal_amount: number
          key: string
          max_stack: number
          name: string
          rune_slots: number
          slot: string
          stackable: boolean
          value: number
          weight: number
        }
        Insert: {
          base_armor?: number
          base_damage?: number
          capacity_weight?: number
          description?: string
          heal_amount?: number
          key: string
          max_stack?: number
          name: string
          rune_slots?: number
          slot?: string
          stackable?: boolean
          value?: number
          weight?: number
        }
        Update: {
          base_armor?: number
          base_damage?: number
          capacity_weight?: number
          description?: string
          heal_amount?: number
          key?: string
          max_stack?: number
          name?: string
          rune_slots?: number
          slot?: string
          stackable?: boolean
          value?: number
          weight?: number
        }
        Relationships: []
      }
      lesser_runes: {
        Row: {
          created_at: string
          description: string
          difficulty: number
          effect: Json
          english_meaning: string
          glyph: string
          key: string
          latin_name: string
          template: Json
        }
        Insert: {
          created_at?: string
          description?: string
          difficulty?: number
          effect?: Json
          english_meaning: string
          glyph?: string
          key: string
          latin_name: string
          template?: Json
        }
        Update: {
          created_at?: string
          description?: string
          difficulty?: number
          effect?: Json
          english_meaning?: string
          glyph?: string
          key?: string
          latin_name?: string
          template?: Json
        }
        Relationships: []
      }
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
          addressed_to: string | null
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
          addressed_to?: string | null
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
          addressed_to?: string | null
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
      npc_amity: {
        Row: {
          npc_id: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          npc_id: string
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          npc_id?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      npc_memories: {
        Row: {
          created_at: string
          emotion: string | null
          id: string
          importance: number
          npc_id: string
          room: string | null
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emotion?: string | null
          id?: string
          importance?: number
          npc_id: string
          room?: string | null
          summary: string
          user_id: string
        }
        Update: {
          created_at?: string
          emotion?: string | null
          id?: string
          importance?: number
          npc_id?: string
          room?: string | null
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      npcs: {
        Row: {
          current_activity: string | null
          dead_until: string | null
          greeting: string | null
          home_room: string | null
          id: string
          last_tick_at: string | null
          name: string
          persona: string
          room: string
          schedule: Json
          title: string | null
        }
        Insert: {
          current_activity?: string | null
          dead_until?: string | null
          greeting?: string | null
          home_room?: string | null
          id?: string
          last_tick_at?: string | null
          name: string
          persona: string
          room: string
          schedule?: Json
          title?: string | null
        }
        Update: {
          current_activity?: string | null
          dead_until?: string | null
          greeting?: string | null
          home_room?: string | null
          id?: string
          last_tick_at?: string | null
          name?: string
          persona?: string
          room?: string
          schedule?: Json
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
      player_items: {
        Row: {
          container_id: string | null
          created_at: string
          equipped_slot: string | null
          id: string
          item_key: string
          quantity: number
          user_id: string
        }
        Insert: {
          container_id?: string | null
          created_at?: string
          equipped_slot?: string | null
          id?: string
          item_key: string
          quantity?: number
          user_id: string
        }
        Update: {
          container_id?: string | null
          created_at?: string
          equipped_slot?: string | null
          id?: string
          item_key?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_items_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "player_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_items_item_key_fkey"
            columns: ["item_key"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["key"]
          },
        ]
      }
      player_journal_entries: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          room: string | null
          source_event_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind: string
          room?: string | null
          source_event_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          room?: string | null
          source_event_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      player_lesser_rune_knowledge: {
        Row: {
          knows_symbol: boolean
          knows_word: boolean
          learned_symbol_at: string | null
          learned_word_at: string | null
          rune_key: string
          user_id: string
          word_source: string | null
        }
        Insert: {
          knows_symbol?: boolean
          knows_word?: boolean
          learned_symbol_at?: string | null
          learned_word_at?: string | null
          rune_key: string
          user_id: string
          word_source?: string | null
        }
        Update: {
          knows_symbol?: boolean
          knows_word?: boolean
          learned_symbol_at?: string | null
          learned_word_at?: string | null
          rune_key?: string
          user_id?: string
          word_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_lesser_rune_knowledge_rune_key_fkey"
            columns: ["rune_key"]
            isOneToOne: false
            referencedRelation: "lesser_runes"
            referencedColumns: ["key"]
          },
        ]
      }
      player_lesser_runes: {
        Row: {
          backfire_count: number
          best_score: number
          cast_count: number
          first_cast_at: string
          rune_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          backfire_count?: number
          best_score?: number
          cast_count?: number
          first_cast_at?: string
          rune_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          backfire_count?: number
          best_score?: number
          cast_count?: number
          first_cast_at?: string
          rune_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_lesser_runes_rune_key_fkey"
            columns: ["rune_key"]
            isOneToOne: false
            referencedRelation: "lesser_runes"
            referencedColumns: ["key"]
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
      player_runes: {
        Row: {
          id: string
          learned_at: string
          rune_key: string
          source: string
          user_id: string
        }
        Insert: {
          id?: string
          learned_at?: string
          rune_key: string
          source?: string
          user_id: string
        }
        Update: {
          id?: string
          learned_at?: string
          rune_key?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_runes_rune_key_fkey"
            columns: ["rune_key"]
            isOneToOne: false
            referencedRelation: "runes"
            referencedColumns: ["key"]
          },
        ]
      }
      profiles: {
        Row: {
          aether: string | null
          aether_chosen_at: string | null
          char_description: string | null
          companion_npc_id: string | null
          corruption: number
          created: boolean
          created_at: string
          current_room: string
          gold: number
          hp: number
          id: string
          in_combat_id: string | null
          level: number
          max_hp: number
          max_weight: number
          merit: number
          portrait_url: string | null
          race: string | null
          updated_at: string
          username: string
          xp: number
        }
        Insert: {
          aether?: string | null
          aether_chosen_at?: string | null
          char_description?: string | null
          companion_npc_id?: string | null
          corruption?: number
          created?: boolean
          created_at?: string
          current_room?: string
          gold?: number
          hp?: number
          id: string
          in_combat_id?: string | null
          level?: number
          max_hp?: number
          max_weight?: number
          merit?: number
          portrait_url?: string | null
          race?: string | null
          updated_at?: string
          username: string
          xp?: number
        }
        Update: {
          aether?: string | null
          aether_chosen_at?: string | null
          char_description?: string | null
          companion_npc_id?: string | null
          corruption?: number
          created?: boolean
          created_at?: string
          current_room?: string
          gold?: number
          hp?: number
          id?: string
          in_combat_id?: string | null
          level?: number
          max_hp?: number
          max_weight?: number
          merit?: number
          portrait_url?: string | null
          race?: string | null
          updated_at?: string
          username?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_aether_fkey"
            columns: ["aether"]
            isOneToOne: false
            referencedRelation: "aethers"
            referencedColumns: ["key"]
          },
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
          kind: string
          label: string
          name: string
          slug: string
        }
        Insert: {
          ambience?: string | null
          description: string
          exits?: Json
          kind?: string
          label?: string
          name: string
          slug: string
        }
        Update: {
          ambience?: string | null
          description?: string
          exits?: Json
          kind?: string
          label?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      runes: {
        Row: {
          description: string
          effect: Json
          glyph: string
          key: string
          kind: string
          lore_slug: string | null
          max_charges: number
          name: string
          rarity: string
          teacher_npc: string | null
        }
        Insert: {
          description?: string
          effect?: Json
          glyph?: string
          key: string
          kind?: string
          lore_slug?: string | null
          max_charges?: number
          name: string
          rarity?: string
          teacher_npc?: string | null
        }
        Update: {
          description?: string
          effect?: Json
          glyph?: string
          key?: string
          kind?: string
          lore_slug?: string | null
          max_charges?: number
          name?: string
          rarity?: string
          teacher_npc?: string | null
        }
        Relationships: []
      }
      world_events: {
        Row: {
          actor_id: string | null
          actor_name: string
          created_at: string
          decay_at: string | null
          details: Json
          id: string
          kind: string
          room: string
          target_id: string | null
          target_kind: string | null
          target_name: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_name: string
          created_at?: string
          decay_at?: string | null
          details?: Json
          id?: string
          kind: string
          room: string
          target_id?: string | null
          target_kind?: string | null
          target_name?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          decay_at?: string | null
          details?: Json
          id?: string
          kind?: string
          room?: string
          target_id?: string | null
          target_kind?: string | null
          target_name?: string | null
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
