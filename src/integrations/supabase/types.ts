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
      aether_loyalty: {
        Row: {
          aether_key: string
          completed_at: string | null
          status: string
          step: number
          updated_at: string
          user_id: string
        }
        Insert: {
          aether_key: string
          completed_at?: string | null
          status?: string
          step?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          aether_key?: string
          completed_at?: string | null
          status?: string
          step?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      aether_quest_steps: {
        Row: {
          aether_key: string
          flavor: string
          objective: string
          reward_artifact_key: string | null
          reward_gold: number
          reward_merit: number
          reward_xp: number
          step_index: number
          themed_rune_key: string | null
          title: string
        }
        Insert: {
          aether_key: string
          flavor?: string
          objective: string
          reward_artifact_key?: string | null
          reward_gold?: number
          reward_merit?: number
          reward_xp?: number
          step_index: number
          themed_rune_key?: string | null
          title: string
        }
        Update: {
          aether_key?: string
          flavor?: string
          objective?: string
          reward_artifact_key?: string | null
          reward_gold?: number
          reward_merit?: number
          reward_xp?: number
          step_index?: number
          themed_rune_key?: string | null
          title?: string
        }
        Relationships: []
      }
      aethers: {
        Row: {
          alive: boolean
          domain: string
          fallen_at: string | null
          gift: string
          glyph: string
          key: string
          name: string
          sort_order: number
          throne_room: string | null
          vow: string
          wardens_killed: number
          well_room: string | null
        }
        Insert: {
          alive?: boolean
          domain: string
          fallen_at?: string | null
          gift: string
          glyph?: string
          key: string
          name: string
          sort_order?: number
          throne_room?: string | null
          vow: string
          wardens_killed?: number
          well_room?: string | null
        }
        Update: {
          alive?: boolean
          domain?: string
          fallen_at?: string | null
          gift?: string
          glyph?: string
          key?: string
          name?: string
          sort_order?: number
          throne_room?: string | null
          vow?: string
          wardens_killed?: number
          well_room?: string | null
        }
        Relationships: []
      }
      bounties: {
        Row: {
          alive_bonus_gold: number
          claim_kind: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          posted_by: string | null
          posted_by_name: string
          reason: string
          reward_gold: number
          status: string
          target_name: string
          target_user_id: string
          town_key: string
        }
        Insert: {
          alive_bonus_gold?: number
          claim_kind?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          posted_by?: string | null
          posted_by_name: string
          reason?: string
          reward_gold?: number
          status?: string
          target_name: string
          target_user_id: string
          town_key: string
        }
        Update: {
          alive_bonus_gold?: number
          claim_kind?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          posted_by?: string | null
          posted_by_name?: string
          reason?: string
          reward_gold?: number
          status?: string
          target_name?: string
          target_user_id?: string
          town_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "bounties_town_key_fkey"
            columns: ["town_key"]
            isOneToOne: false
            referencedRelation: "towns"
            referencedColumns: ["key"]
          },
        ]
      }
      chaos_path: {
        Row: {
          completed_at: string | null
          last_advanced_at: string
          started_at: string
          status: string
          step: number
          target_aether_key: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          last_advanced_at?: string
          started_at?: string
          status?: string
          step?: number
          target_aether_key?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          last_advanced_at?: string
          started_at?: string
          status?: string
          step?: number
          target_aether_key?: string | null
          user_id?: string
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
      dragons: {
        Row: {
          created_at: string
          current_room: string | null
          epithet: string
          hoard_target_room: string | null
          key: string
          last_woken_at: string | null
          name: string
          personality: string
        }
        Insert: {
          created_at?: string
          current_room?: string | null
          epithet?: string
          hoard_target_room?: string | null
          key: string
          last_woken_at?: string | null
          name: string
          personality?: string
        }
        Update: {
          created_at?: string
          current_room?: string | null
          epithet?: string
          hoard_target_room?: string | null
          key?: string
          last_woken_at?: string | null
          name?: string
          personality?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      guild_chapters: {
        Row: {
          flavor_blurb: string
          guild_key: string
          guildmaster_npc_id: string | null
          hall_room: string
          town_key: string
        }
        Insert: {
          flavor_blurb?: string
          guild_key: string
          guildmaster_npc_id?: string | null
          hall_room: string
          town_key: string
        }
        Update: {
          flavor_blurb?: string
          guild_key?: string
          guildmaster_npc_id?: string | null
          hall_room?: string
          town_key?: string
        }
        Relationships: []
      }
      guild_quest_templates: {
        Row: {
          description: string
          guild_key: string
          id: string
          objective: string
          rank_required: number
          reward_gold: number
          reward_item_key: string | null
          reward_rune_key: string | null
          reward_xp: number
          target_kind: string
          target_ref: string | null
          title: string
          town_key: string
        }
        Insert: {
          description?: string
          guild_key: string
          id?: string
          objective: string
          rank_required?: number
          reward_gold?: number
          reward_item_key?: string | null
          reward_rune_key?: string | null
          reward_xp?: number
          target_kind?: string
          target_ref?: string | null
          title: string
          town_key: string
        }
        Update: {
          description?: string
          guild_key?: string
          id?: string
          objective?: string
          rank_required?: number
          reward_gold?: number
          reward_item_key?: string | null
          reward_rune_key?: string | null
          reward_xp?: number
          target_kind?: string
          target_ref?: string | null
          title?: string
          town_key?: string
        }
        Relationships: []
      }
      guild_stock: {
        Row: {
          blurb: string
          guild_key: string
          id: string
          kind: string
          price_gold: number
          rank_required: number
          ref_key: string
          town_key: string
        }
        Insert: {
          blurb?: string
          guild_key: string
          id?: string
          kind: string
          price_gold?: number
          rank_required?: number
          ref_key: string
          town_key: string
        }
        Update: {
          blurb?: string
          guild_key?: string
          id?: string
          kind?: string
          price_gold?: number
          rank_required?: number
          ref_key?: string
          town_key?: string
        }
        Relationships: []
      }
      guilds: {
        Row: {
          blurb: string
          glyph: string
          key: string
          name: string
          specialty: string
        }
        Insert: {
          blurb?: string
          glyph?: string
          key: string
          name: string
          specialty?: string
        }
        Update: {
          blurb?: string
          glyph?: string
          key?: string
          name?: string
          specialty?: string
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
          unique_per_player: boolean
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
          unique_per_player?: boolean
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
          unique_per_player?: boolean
          value?: number
          weight?: number
        }
        Relationships: []
      }
      kanji_compounds: {
        Row: {
          components: string[]
          created_at: string
          description: string
          effect: Json
          english_meaning: string
          key: string
          lore_hint: string | null
          name: string
          rarity: string
        }
        Insert: {
          components: string[]
          created_at?: string
          description?: string
          effect?: Json
          english_meaning: string
          key: string
          lore_hint?: string | null
          name: string
          rarity?: string
        }
        Update: {
          components?: string[]
          created_at?: string
          description?: string
          effect?: Json
          english_meaning?: string
          key?: string
          lore_hint?: string | null
          name?: string
          rarity?: string
        }
        Relationships: []
      }
      kanji_runes: {
        Row: {
          created_at: string
          description: string
          difficulty: number
          element: string
          english_meaning: string
          kanji: string
          key: string
          rarity: string
          romaji: string
          template: Json
        }
        Insert: {
          created_at?: string
          description?: string
          difficulty?: number
          element?: string
          english_meaning: string
          kanji: string
          key: string
          rarity?: string
          romaji: string
          template?: Json
        }
        Update: {
          created_at?: string
          description?: string
          difficulty?: number
          element?: string
          english_meaning?: string
          kanji?: string
          key?: string
          rarity?: string
          romaji?: string
          template?: Json
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
      lichen_king_progress: {
        Row: {
          completed_at: string | null
          started_at: string
          status: string
          step: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          started_at?: string
          status?: string
          step?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          started_at?: string
          status?: string
          step?: number
          updated_at?: string
          user_id?: string
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
      market_events: {
        Row: {
          category: string | null
          created_at: string
          expires_at: string
          id: string
          item_key: string | null
          multiplier: number
          reason: string
          source: string
          town_key: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          item_key?: string | null
          multiplier?: number
          reason?: string
          source?: string
          town_key?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          item_key?: string | null
          multiplier?: number
          reason?: string
          source?: string
          town_key?: string | null
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
      npc_item_offers: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          item_key: string
          npc_id: string
          price_gold: number
          reason: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          item_key: string
          npc_id: string
          price_gold: number
          reason?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          item_key?: string
          npc_id?: string
          price_gold?: number
          reason?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      npc_items: {
        Row: {
          created_at: string
          equipped_slot: string | null
          id: string
          item_key: string
          npc_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          equipped_slot?: string | null
          id?: string
          item_key: string
          npc_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          equipped_slot?: string | null
          id?: string
          item_key?: string
          npc_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "npc_items_npc_id_fkey"
            columns: ["npc_id"]
            isOneToOne: false
            referencedRelation: "npcs"
            referencedColumns: ["id"]
          },
        ]
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
      npc_service_offers: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          npc_id: string
          price_gold: number
          reason: string
          service_key: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          npc_id: string
          price_gold: number
          reason?: string
          service_key: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          npc_id?: string
          price_gold?: number
          reason?: string
          service_key?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      npc_services: {
        Row: {
          amount: number
          blurb: string
          created_at: string
          id: string
          key: string
          kind: string
          name: string
          npc_id: string
          price_gold: number
        }
        Insert: {
          amount?: number
          blurb?: string
          created_at?: string
          id?: string
          key: string
          kind: string
          name: string
          npc_id: string
          price_gold?: number
        }
        Update: {
          amount?: number
          blurb?: string
          created_at?: string
          id?: string
          key?: string
          kind?: string
          name?: string
          npc_id?: string
          price_gold?: number
        }
        Relationships: []
      }
      npcs: {
        Row: {
          aether_key: string | null
          aggro_on_sight: boolean
          base_armor: number
          boss_intro: string | null
          boss_reward_gold: number
          boss_reward_merit: number
          boss_reward_xp: number
          combat_damage_max: number | null
          combat_damage_min: number | null
          combat_max_hp: number | null
          con: number
          current_activity: string | null
          dead_until: string | null
          dex: number
          fence_rate: number
          greeting: string | null
          guild_key: string | null
          guild_town: string | null
          hidden: boolean
          hire_no_trust: boolean
          hire_price_gold: number
          home_room: string | null
          id: string
          is_aether: boolean
          is_bard: boolean
          is_boss: boolean
          is_fence: boolean
          is_guard: boolean
          is_guildmaster: boolean
          is_merchant: boolean
          is_soul: boolean
          is_warden: boolean
          last_tick_at: string | null
          level: number
          merchant_categories: string[]
          merchant_town: string | null
          name: string
          persona: string
          purse_gold: number
          requires_rune_key: string | null
          room: string
          schedule: Json
          str: number
          sustained_by_npc_id: string | null
          title: string | null
          warden_index: number | null
        }
        Insert: {
          aether_key?: string | null
          aggro_on_sight?: boolean
          base_armor?: number
          boss_intro?: string | null
          boss_reward_gold?: number
          boss_reward_merit?: number
          boss_reward_xp?: number
          combat_damage_max?: number | null
          combat_damage_min?: number | null
          combat_max_hp?: number | null
          con?: number
          current_activity?: string | null
          dead_until?: string | null
          dex?: number
          fence_rate?: number
          greeting?: string | null
          guild_key?: string | null
          guild_town?: string | null
          hidden?: boolean
          hire_no_trust?: boolean
          hire_price_gold?: number
          home_room?: string | null
          id?: string
          is_aether?: boolean
          is_bard?: boolean
          is_boss?: boolean
          is_fence?: boolean
          is_guard?: boolean
          is_guildmaster?: boolean
          is_merchant?: boolean
          is_soul?: boolean
          is_warden?: boolean
          last_tick_at?: string | null
          level?: number
          merchant_categories?: string[]
          merchant_town?: string | null
          name: string
          persona: string
          purse_gold?: number
          requires_rune_key?: string | null
          room: string
          schedule?: Json
          str?: number
          sustained_by_npc_id?: string | null
          title?: string | null
          warden_index?: number | null
        }
        Update: {
          aether_key?: string | null
          aggro_on_sight?: boolean
          base_armor?: number
          boss_intro?: string | null
          boss_reward_gold?: number
          boss_reward_merit?: number
          boss_reward_xp?: number
          combat_damage_max?: number | null
          combat_damage_min?: number | null
          combat_max_hp?: number | null
          con?: number
          current_activity?: string | null
          dead_until?: string | null
          dex?: number
          fence_rate?: number
          greeting?: string | null
          guild_key?: string | null
          guild_town?: string | null
          hidden?: boolean
          hire_no_trust?: boolean
          hire_price_gold?: number
          home_room?: string | null
          id?: string
          is_aether?: boolean
          is_bard?: boolean
          is_boss?: boolean
          is_fence?: boolean
          is_guard?: boolean
          is_guildmaster?: boolean
          is_merchant?: boolean
          is_soul?: boolean
          is_warden?: boolean
          last_tick_at?: string | null
          level?: number
          merchant_categories?: string[]
          merchant_town?: string | null
          name?: string
          persona?: string
          purse_gold?: number
          requires_rune_key?: string | null
          room?: string
          schedule?: Json
          str?: number
          sustained_by_npc_id?: string | null
          title?: string | null
          warden_index?: number | null
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
      onboarding_progress: {
        Row: {
          created_at: string
          step: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          step?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          step?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pending_resurrections: {
        Row: {
          created_at: string
          id: string
          necromancer_damage_max: number
          necromancer_damage_min: number
          necromancer_max_hp: number
          necromancer_name: string
          necromancer_persona: string
          necromancer_title: string
          new_boss_intro: string | null
          new_damage_max: number
          new_damage_min: number
          new_max_hp: number
          new_name: string
          new_persona: string | null
          new_title: string | null
          original_name: string
          original_npc_id: string
          processed_at: string | null
          resurrect_at: string
          room: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          necromancer_damage_max?: number
          necromancer_damage_min?: number
          necromancer_max_hp?: number
          necromancer_name?: string
          necromancer_persona?: string
          necromancer_title?: string
          new_boss_intro?: string | null
          new_damage_max?: number
          new_damage_min?: number
          new_max_hp?: number
          new_name: string
          new_persona?: string | null
          new_title?: string | null
          original_name: string
          original_npc_id: string
          processed_at?: string | null
          resurrect_at: string
          room: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          necromancer_damage_max?: number
          necromancer_damage_min?: number
          necromancer_max_hp?: number
          necromancer_name?: string
          necromancer_persona?: string
          necromancer_title?: string
          new_boss_intro?: string | null
          new_damage_max?: number
          new_damage_min?: number
          new_max_hp?: number
          new_name?: string
          new_persona?: string | null
          new_title?: string | null
          original_name?: string
          original_npc_id?: string
          processed_at?: string | null
          resurrect_at?: string
          room?: string
          status?: string
        }
        Relationships: []
      }
      player_artifact_rumors: {
        Row: {
          artifact_key: string
          heard_at: string
          snippet: string
          source: string
          user_id: string
        }
        Insert: {
          artifact_key: string
          heard_at?: string
          snippet?: string
          source?: string
          user_id: string
        }
        Update: {
          artifact_key?: string
          heard_at?: string
          snippet?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_artifact_rumors_artifact_key_fkey"
            columns: ["artifact_key"]
            isOneToOne: false
            referencedRelation: "speaker_artifacts"
            referencedColumns: ["key"]
          },
        ]
      }
      player_guild_membership: {
        Row: {
          guild_key: string
          initiation_quest_id: string | null
          joined_at: string | null
          quests_completed: number
          rank: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          guild_key: string
          initiation_quest_id?: string | null
          joined_at?: string | null
          quests_completed?: number
          rank?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          guild_key?: string
          initiation_quest_id?: string | null
          joined_at?: string | null
          quests_completed?: number
          rank?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      player_items: {
        Row: {
          container_id: string | null
          created_at: string
          equipped_slot: string | null
          id: string
          item_key: string
          quantity: number
          stolen: boolean
          user_id: string
        }
        Insert: {
          container_id?: string | null
          created_at?: string
          equipped_slot?: string | null
          id?: string
          item_key: string
          quantity?: number
          stolen?: boolean
          user_id: string
        }
        Update: {
          container_id?: string | null
          created_at?: string
          equipped_slot?: string | null
          id?: string
          item_key?: string
          quantity?: number
          stolen?: boolean
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
      player_kanji_compound_discoveries: {
        Row: {
          compound_key: string
          discovered_at: string
          source: string
          user_id: string
        }
        Insert: {
          compound_key: string
          discovered_at?: string
          source?: string
          user_id: string
        }
        Update: {
          compound_key?: string
          discovered_at?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_kanji_compound_discoveries_compound_key_fkey"
            columns: ["compound_key"]
            isOneToOne: false
            referencedRelation: "kanji_compounds"
            referencedColumns: ["key"]
          },
        ]
      }
      player_kanji_knowledge: {
        Row: {
          kanji_key: string
          knows_meaning: boolean
          knows_stroke: boolean
          learned_meaning_at: string | null
          learned_stroke_at: string | null
          meaning_source: string | null
          user_id: string
        }
        Insert: {
          kanji_key: string
          knows_meaning?: boolean
          knows_stroke?: boolean
          learned_meaning_at?: string | null
          learned_stroke_at?: string | null
          meaning_source?: string | null
          user_id: string
        }
        Update: {
          kanji_key?: string
          knows_meaning?: boolean
          knows_stroke?: boolean
          learned_meaning_at?: string | null
          learned_stroke_at?: string | null
          meaning_source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_kanji_knowledge_kanji_key_fkey"
            columns: ["kanji_key"]
            isOneToOne: false
            referencedRelation: "kanji_runes"
            referencedColumns: ["key"]
          },
        ]
      }
      player_kanji_mastery: {
        Row: {
          backfire_count: number
          best_score: number
          cast_count: number
          first_cast_at: string
          kanji_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          backfire_count?: number
          best_score?: number
          cast_count?: number
          first_cast_at?: string
          kanji_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          backfire_count?: number
          best_score?: number
          cast_count?: number
          first_cast_at?: string
          kanji_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_kanji_mastery_kanji_key_fkey"
            columns: ["kanji_key"]
            isOneToOne: false
            referencedRelation: "kanji_runes"
            referencedColumns: ["key"]
          },
        ]
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
      player_npc_discoveries: {
        Row: {
          discovered_at: string
          npc_id: string
          user_id: string
        }
        Insert: {
          discovered_at?: string
          npc_id: string
          user_id: string
        }
        Update: {
          discovered_at?: string
          npc_id?: string
          user_id?: string
        }
        Relationships: []
      }
      player_room_cache_claims: {
        Row: {
          claimed_at: string
          room: string
          user_id: string
        }
        Insert: {
          claimed_at?: string
          room: string
          user_id: string
        }
        Update: {
          claimed_at?: string
          room?: string
          user_id?: string
        }
        Relationships: []
      }
      player_room_extra_exits: {
        Row: {
          dir: string
          label: string | null
          room: string
          to_room: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          dir: string
          label?: string | null
          room: string
          to_room: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          dir?: string
          label?: string | null
          room?: string
          to_room?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      player_rune_solves: {
        Row: {
          effect_id: string
          room: string
          solved_at: string
          user_id: string
        }
        Insert: {
          effect_id: string
          room: string
          solved_at?: string
          user_id: string
        }
        Update: {
          effect_id?: string
          room?: string
          solved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_rune_solves_effect_id_fkey"
            columns: ["effect_id"]
            isOneToOne: false
            referencedRelation: "rune_utility_effects"
            referencedColumns: ["id"]
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
      player_skills: {
        Row: {
          acquired_at: string
          node_key: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          node_key: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          node_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_skills_node_key_fkey"
            columns: ["node_key"]
            isOneToOne: false
            referencedRelation: "skill_nodes"
            referencedColumns: ["key"]
          },
        ]
      }
      player_songs: {
        Row: {
          learned_at: string
          song_key: string
          source: string
          user_id: string
        }
        Insert: {
          learned_at?: string
          song_key: string
          source?: string
          user_id: string
        }
        Update: {
          learned_at?: string
          song_key?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_songs_song_key_fkey"
            columns: ["song_key"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["key"]
          },
        ]
      }
      player_speaker_artifacts: {
        Row: {
          acquired_at: string
          artifact_key: string
          charges_remaining: number
          source: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          artifact_key: string
          charges_remaining?: number
          source?: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          artifact_key?: string
          charges_remaining?: number
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_speaker_artifacts_artifact_key_fkey"
            columns: ["artifact_key"]
            isOneToOne: false
            referencedRelation: "speaker_artifacts"
            referencedColumns: ["key"]
          },
        ]
      }
      player_town_rep: {
        Row: {
          score: number
          town_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          score?: number
          town_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          score?: number
          town_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_town_rep_town_key_fkey"
            columns: ["town_key"]
            isOneToOne: false
            referencedRelation: "towns"
            referencedColumns: ["key"]
          },
        ]
      }
      posted_quests: {
        Row: {
          author_name: string
          author_user_id: string | null
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          description: string
          expires_at: string | null
          id: string
          objective: string
          reward_gold: number
          reward_xp: number
          status: string
          target_kind: string
          target_ref: string | null
          title: string
          town_key: string
        }
        Insert: {
          author_name: string
          author_user_id?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          description?: string
          expires_at?: string | null
          id?: string
          objective?: string
          reward_gold?: number
          reward_xp?: number
          status?: string
          target_kind?: string
          target_ref?: string | null
          title: string
          town_key: string
        }
        Update: {
          author_name?: string
          author_user_id?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          description?: string
          expires_at?: string | null
          id?: string
          objective?: string
          reward_gold?: number
          reward_xp?: number
          status?: string
          target_kind?: string
          target_ref?: string | null
          title?: string
          town_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "posted_quests_town_key_fkey"
            columns: ["town_key"]
            isOneToOne: false
            referencedRelation: "towns"
            referencedColumns: ["key"]
          },
        ]
      }
      private_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          aether: string | null
          aether_chosen_at: string | null
          chaos_pressure: number
          char_description: string | null
          companion_mode: string
          companion_npc_id: string | null
          corruption: number
          created: boolean
          created_at: string
          current_room: string
          dead: boolean
          dead_at: string | null
          death_room: string | null
          desert_bearing: number
          desert_depth: number
          desert_entered_from: string | null
          downed: boolean
          downed_at: string | null
          downed_combat_id: string | null
          escortee_destination: string | null
          escortee_destination_name: string | null
          escortee_npc_id: string | null
          faction: string | null
          gold: number
          hall_refusals: number
          hp: number
          id: string
          in_combat_id: string | null
          infamy: number
          last_damage_kind: string | null
          last_encounter_at: string | null
          level: number
          max_hp: number
          max_weight: number
          merit: number
          non_serviam_at: string | null
          portrait_url: string | null
          portrait_variants: Json
          race: string | null
          revived_at: string | null
          revived_by: string | null
          talent_points: number
          updated_at: string
          username: string
          voice: string
          xp: number
          zombified: boolean
        }
        Insert: {
          aether?: string | null
          aether_chosen_at?: string | null
          chaos_pressure?: number
          char_description?: string | null
          companion_mode?: string
          companion_npc_id?: string | null
          corruption?: number
          created?: boolean
          created_at?: string
          current_room?: string
          dead?: boolean
          dead_at?: string | null
          death_room?: string | null
          desert_bearing?: number
          desert_depth?: number
          desert_entered_from?: string | null
          downed?: boolean
          downed_at?: string | null
          downed_combat_id?: string | null
          escortee_destination?: string | null
          escortee_destination_name?: string | null
          escortee_npc_id?: string | null
          faction?: string | null
          gold?: number
          hall_refusals?: number
          hp?: number
          id: string
          in_combat_id?: string | null
          infamy?: number
          last_damage_kind?: string | null
          last_encounter_at?: string | null
          level?: number
          max_hp?: number
          max_weight?: number
          merit?: number
          non_serviam_at?: string | null
          portrait_url?: string | null
          portrait_variants?: Json
          race?: string | null
          revived_at?: string | null
          revived_by?: string | null
          talent_points?: number
          updated_at?: string
          username: string
          voice?: string
          xp?: number
          zombified?: boolean
        }
        Update: {
          aether?: string | null
          aether_chosen_at?: string | null
          chaos_pressure?: number
          char_description?: string | null
          companion_mode?: string
          companion_npc_id?: string | null
          corruption?: number
          created?: boolean
          created_at?: string
          current_room?: string
          dead?: boolean
          dead_at?: string | null
          death_room?: string | null
          desert_bearing?: number
          desert_depth?: number
          desert_entered_from?: string | null
          downed?: boolean
          downed_at?: string | null
          downed_combat_id?: string | null
          escortee_destination?: string | null
          escortee_destination_name?: string | null
          escortee_npc_id?: string | null
          faction?: string | null
          gold?: number
          hall_refusals?: number
          hp?: number
          id?: string
          in_combat_id?: string | null
          infamy?: number
          last_damage_kind?: string | null
          last_encounter_at?: string | null
          level?: number
          max_hp?: number
          max_weight?: number
          merit?: number
          non_serviam_at?: string | null
          portrait_url?: string | null
          portrait_variants?: Json
          race?: string | null
          revived_at?: string | null
          revived_by?: string | null
          talent_points?: number
          updated_at?: string
          username?: string
          voice?: string
          xp?: number
          zombified?: boolean
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
      puzzle_pool: {
        Row: {
          answer: string
          created_at: string
          flavor: string
          hint: string
          id: string
          kind: string
          npc_id: string
          prompt: string
          reward_gold: number
          reward_item_key: string | null
          reward_merit: number
          reward_rune_key: string | null
          reward_xp: number
          severity: string
        }
        Insert: {
          answer: string
          created_at?: string
          flavor?: string
          hint?: string
          id?: string
          kind?: string
          npc_id: string
          prompt: string
          reward_gold?: number
          reward_item_key?: string | null
          reward_merit?: number
          reward_rune_key?: string | null
          reward_xp?: number
          severity?: string
        }
        Update: {
          answer?: string
          created_at?: string
          flavor?: string
          hint?: string
          id?: string
          kind?: string
          npc_id?: string
          prompt?: string
          reward_gold?: number
          reward_item_key?: string | null
          reward_merit?: number
          reward_rune_key?: string | null
          reward_xp?: number
          severity?: string
        }
        Relationships: []
      }
      quests: {
        Row: {
          accepted_at: string | null
          attempts: number
          completed_at: string | null
          created_at: string
          description: string
          escort_npc_id: string | null
          expires_at: string | null
          giver_npc_id: string
          giver_npc_name: string
          id: string
          is_initiation: boolean
          kind: string
          objective: string
          offered_room: string | null
          reward_amity: number
          reward_gold: number
          reward_item_key: string | null
          reward_kanji_key: string | null
          reward_rune_key: string | null
          reward_xp: number
          severity: string
          solution: string | null
          solution_hint: string | null
          source_guild: string | null
          source_guild_town: string | null
          status: string
          target_kind: string | null
          target_ref: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          attempts?: number
          completed_at?: string | null
          created_at?: string
          description?: string
          escort_npc_id?: string | null
          expires_at?: string | null
          giver_npc_id: string
          giver_npc_name: string
          id?: string
          is_initiation?: boolean
          kind?: string
          objective?: string
          offered_room?: string | null
          reward_amity?: number
          reward_gold?: number
          reward_item_key?: string | null
          reward_kanji_key?: string | null
          reward_rune_key?: string | null
          reward_xp?: number
          severity?: string
          solution?: string | null
          solution_hint?: string | null
          source_guild?: string | null
          source_guild_town?: string | null
          status?: string
          target_kind?: string | null
          target_ref?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          attempts?: number
          completed_at?: string | null
          created_at?: string
          description?: string
          escort_npc_id?: string | null
          expires_at?: string | null
          giver_npc_id?: string
          giver_npc_name?: string
          id?: string
          is_initiation?: boolean
          kind?: string
          objective?: string
          offered_room?: string | null
          reward_amity?: number
          reward_gold?: number
          reward_item_key?: string | null
          reward_kanji_key?: string | null
          reward_rune_key?: string | null
          reward_xp?: number
          severity?: string
          solution?: string | null
          solution_hint?: string | null
          source_guild?: string | null
          source_guild_town?: string | null
          status?: string
          target_kind?: string | null
          target_ref?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      room_audio: {
        Row: {
          ambient_url: string | null
          generated_at: string | null
          music_url: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          ambient_url?: string | null
          generated_at?: string | null
          music_url?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          ambient_url?: string | null
          generated_at?: string | null
          music_url?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      room_caches: {
        Row: {
          find_dc: number
          gold: number
          hint: string
          item_key: string | null
          reveal_text: string
          revealed_at: string | null
          revealed_by_name: string | null
          room: string
        }
        Insert: {
          find_dc?: number
          gold?: number
          hint?: string
          item_key?: string | null
          reveal_text?: string
          revealed_at?: string | null
          revealed_by_name?: string | null
          room: string
        }
        Update: {
          find_dc?: number
          gold?: number
          hint?: string
          item_key?: string | null
          reveal_text?: string
          revealed_at?: string | null
          revealed_by_name?: string | null
          room?: string
        }
        Relationships: []
      }
      room_env_tags: {
        Row: {
          room: string
          tag: string
        }
        Insert: {
          room: string
          tag: string
        }
        Update: {
          room?: string
          tag?: string
        }
        Relationships: []
      }
      room_loot: {
        Row: {
          gold: number
          id: string
          item_key: string | null
          placed_at: string
          placed_by_name: string | null
          quantity: number
          room: string
          source: string
        }
        Insert: {
          gold?: number
          id?: string
          item_key?: string | null
          placed_at?: string
          placed_by_name?: string | null
          quantity?: number
          room: string
          source?: string
        }
        Update: {
          gold?: number
          id?: string
          item_key?: string | null
          placed_at?: string
          placed_by_name?: string | null
          quantity?: number
          room?: string
          source?: string
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
          hidden: boolean
          kind: string
          label: string
          name: string
          requires_faction: string | null
          slug: string
          town_key: string | null
        }
        Insert: {
          ambience?: string | null
          description: string
          exits?: Json
          hidden?: boolean
          kind?: string
          label?: string
          name: string
          requires_faction?: string | null
          slug: string
          town_key?: string | null
        }
        Update: {
          ambience?: string | null
          description?: string
          exits?: Json
          hidden?: boolean
          kind?: string
          label?: string
          name?: string
          requires_faction?: string | null
          slug?: string
          town_key?: string | null
        }
        Relationships: []
      }
      rune_utility_effects: {
        Row: {
          created_at: string
          flavor_solve: string
          id: string
          match_key: string
          one_time: boolean
          reward_exit_dir: string | null
          reward_exit_label: string | null
          reward_exit_to: string | null
          reward_gold: number
          reward_item_key: string | null
          reward_kind: string
          reward_lore_slug: string | null
          reward_merit: number
          reward_xp: number
          rune_key: string
          scope: string
        }
        Insert: {
          created_at?: string
          flavor_solve: string
          id?: string
          match_key: string
          one_time?: boolean
          reward_exit_dir?: string | null
          reward_exit_label?: string | null
          reward_exit_to?: string | null
          reward_gold?: number
          reward_item_key?: string | null
          reward_kind?: string
          reward_lore_slug?: string | null
          reward_merit?: number
          reward_xp?: number
          rune_key: string
          scope: string
        }
        Update: {
          created_at?: string
          flavor_solve?: string
          id?: string
          match_key?: string
          one_time?: boolean
          reward_exit_dir?: string | null
          reward_exit_label?: string | null
          reward_exit_to?: string | null
          reward_gold?: number
          reward_item_key?: string | null
          reward_kind?: string
          reward_lore_slug?: string | null
          reward_merit?: number
          reward_xp?: number
          rune_key?: string
          scope?: string
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
      scene_music: {
        Row: {
          audio_base64: string
          created_at: string
          prompt: string | null
          scene_key: string
        }
        Insert: {
          audio_base64: string
          created_at?: string
          prompt?: string | null
          scene_key: string
        }
        Update: {
          audio_base64?: string
          created_at?: string
          prompt?: string | null
          scene_key?: string
        }
        Relationships: []
      }
      skill_nodes: {
        Row: {
          branch: string
          description: string
          effect: Json
          key: string
          name: string
          sort_order: number
          tier: number
        }
        Insert: {
          branch: string
          description?: string
          effect?: Json
          key: string
          name: string
          sort_order?: number
          tier: number
        }
        Update: {
          branch?: string
          description?: string
          effect?: Json
          key?: string
          name?: string
          sort_order?: number
          tier?: number
        }
        Relationships: []
      }
      songs: {
        Row: {
          amity_gain: number
          audio_url: string | null
          base_tip: number
          created_at: string
          description: string
          duration_seconds: number
          instrument_key: string | null
          key: string
          merit_gain: number
          music_prompt: string
          rarity: string
          scroll_item_key: string | null
          title: string
          vendor_price: number | null
          vocal_part: string
        }
        Insert: {
          amity_gain?: number
          audio_url?: string | null
          base_tip?: number
          created_at?: string
          description?: string
          duration_seconds?: number
          instrument_key?: string | null
          key: string
          merit_gain?: number
          music_prompt: string
          rarity?: string
          scroll_item_key?: string | null
          title: string
          vendor_price?: number | null
          vocal_part?: string
        }
        Update: {
          amity_gain?: number
          audio_url?: string | null
          base_tip?: number
          created_at?: string
          description?: string
          duration_seconds?: number
          instrument_key?: string | null
          key?: string
          merit_gain?: number
          music_prompt?: string
          rarity?: string
          scroll_item_key?: string | null
          title?: string
          vendor_price?: number | null
          vocal_part?: string
        }
        Relationships: []
      }
      speaker_artifacts: {
        Row: {
          active_blurb: string
          active_name: string
          blurb: string
          charges_max: number
          created_at: string
          glyph: string
          holder_kind: string
          holder_ref: string | null
          home_room: string
          key: string
          lore: string
          merit_required_earn: number
          name: string
          passive_blurb: string
          rep_penalty_steal: number
        }
        Insert: {
          active_blurb?: string
          active_name?: string
          blurb?: string
          charges_max?: number
          created_at?: string
          glyph?: string
          holder_kind: string
          holder_ref?: string | null
          home_room: string
          key: string
          lore?: string
          merit_required_earn?: number
          name: string
          passive_blurb?: string
          rep_penalty_steal?: number
        }
        Update: {
          active_blurb?: string
          active_name?: string
          blurb?: string
          charges_max?: number
          created_at?: string
          glyph?: string
          holder_kind?: string
          holder_ref?: string | null
          home_room?: string
          key?: string
          lore?: string
          merit_required_earn?: number
          name?: string
          passive_blurb?: string
          rep_penalty_steal?: number
        }
        Relationships: []
      }
      town_bank_accounts: {
        Row: {
          balance: number
          opened_at: string
          town_key: string
          user_id: string
        }
        Insert: {
          balance?: number
          opened_at?: string
          town_key: string
          user_id: string
        }
        Update: {
          balance?: number
          opened_at?: string
          town_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "town_bank_accounts_town_key_fkey"
            columns: ["town_key"]
            isOneToOne: false
            referencedRelation: "towns"
            referencedColumns: ["key"]
          },
        ]
      }
      town_bank_item_vault: {
        Row: {
          deposited_at: string
          id: string
          item_key: string
          quantity: number
          stolen: boolean
          town_key: string
          user_id: string
        }
        Insert: {
          deposited_at?: string
          id?: string
          item_key: string
          quantity?: number
          stolen?: boolean
          town_key: string
          user_id: string
        }
        Update: {
          deposited_at?: string
          id?: string
          item_key?: string
          quantity?: number
          stolen?: boolean
          town_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "town_bank_item_vault_item_key_fkey"
            columns: ["item_key"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "town_bank_item_vault_town_key_fkey"
            columns: ["town_key"]
            isOneToOne: false
            referencedRelation: "towns"
            referencedColumns: ["key"]
          },
        ]
      }
      towns: {
        Row: {
          blurb: string
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          blurb?: string
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          blurb?: string
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      trade_goods: {
        Row: {
          base_price: number
          blurb: string
          category: string
          demand_phase: number
          item_key: string
          origin_town_key: string
        }
        Insert: {
          base_price: number
          blurb?: string
          category: string
          demand_phase?: number
          item_key: string
          origin_town_key: string
        }
        Update: {
          base_price?: number
          blurb?: string
          category?: string
          demand_phase?: number
          item_key?: string
          origin_town_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_goods_item_key_fkey"
            columns: ["item_key"]
            isOneToOne: true
            referencedRelation: "items"
            referencedColumns: ["key"]
          },
        ]
      }
      wagon_routes: {
        Row: {
          cost_gold: number
          destination: string
          flavor: string
          hub: string
        }
        Insert: {
          cost_gold?: number
          destination: string
          flavor?: string
          hub: string
        }
        Update: {
          cost_gold?: number
          destination?: string
          flavor?: string
          hub?: string
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
      level_for_xp: { Args: { _xp: number }; Returns: number }
      quest_reward_caps: { Args: { _severity: string }; Returns: Json }
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
