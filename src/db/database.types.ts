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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          background: Json | null
          changes_comment: string | null
          changes_steps: string[] | null
          created_at: string
          decided_at: string | null
          dossier: Json | null
          hrp: Json | null
          id: string
          refusal_comment: string | null
          refusal_criteria: string[] | null
          reviewer_id: string | null
          rp: Json | null
          status: Database["public"]["Enums"]["application_status"]
          submitted_at: string | null
          updated_at: string
          user_id: string
          viewed_at: string | null
          whitelist_revoke_reason: string | null
          whitelist_revoked_at: string | null
          whitelist_revoked_by_id: string | null
        }
        Insert: {
          background?: Json | null
          changes_comment?: string | null
          changes_steps?: string[] | null
          created_at?: string
          decided_at?: string | null
          dossier?: Json | null
          hrp?: Json | null
          id?: string
          refusal_comment?: string | null
          refusal_criteria?: string[] | null
          reviewer_id?: string | null
          rp?: Json | null
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          viewed_at?: string | null
          whitelist_revoke_reason?: string | null
          whitelist_revoked_at?: string | null
          whitelist_revoked_by_id?: string | null
        }
        Update: {
          background?: Json | null
          changes_comment?: string | null
          changes_steps?: string[] | null
          created_at?: string
          decided_at?: string | null
          dossier?: Json | null
          hrp?: Json | null
          id?: string
          refusal_comment?: string | null
          refusal_criteria?: string[] | null
          reviewer_id?: string | null
          rp?: Json | null
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          viewed_at?: string | null
          whitelist_revoke_reason?: string | null
          whitelist_revoked_at?: string | null
          whitelist_revoked_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_reviewer_id_users_id_fk"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_whitelist_revoked_by_id_users_id_fk"
            columns: ["whitelist_revoked_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blacklist: {
        Row: {
          created_at: string
          created_by_id: string
          discord_id: string
          reason: string | null
          source: string
        }
        Insert: {
          created_at?: string
          created_by_id: string
          discord_id: string
          reason?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          created_by_id?: string
          discord_id?: string
          reason?: string | null
          source?: string
        }
        Relationships: []
      }
      bot_command_permissions: {
        Row: {
          command: string
          guild_id: string
          level_id: string | null
        }
        Insert: {
          command: string
          guild_id: string
          level_id?: string | null
        }
        Update: {
          command?: string
          guild_id?: string
          level_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_command_permissions_level_id_bot_permission_levels_id_fk"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "bot_permission_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_giveaway_entries: {
        Row: {
          created_at: string
          giveaway_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          giveaway_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          giveaway_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_giveaway_entries_giveaway_id_bot_giveaways_id_fk"
            columns: ["giveaway_id"]
            isOneToOne: false
            referencedRelation: "bot_giveaways"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_giveaways: {
        Row: {
          channel_id: string
          created_at: string
          description: string | null
          ended_at: string | null
          ends_at: string
          guild_id: string
          host_id: string
          id: string
          message_id: string | null
          prize: string
          required_role_id: string | null
          status: Database["public"]["Enums"]["giveaway_status"]
          winner_count: number
          winner_ids: string[]
        }
        Insert: {
          channel_id: string
          created_at?: string
          description?: string | null
          ended_at?: string | null
          ends_at: string
          guild_id: string
          host_id: string
          id?: string
          message_id?: string | null
          prize: string
          required_role_id?: string | null
          status?: Database["public"]["Enums"]["giveaway_status"]
          winner_count?: number
          winner_ids?: string[]
        }
        Update: {
          channel_id?: string
          created_at?: string
          description?: string | null
          ended_at?: string | null
          ends_at?: string
          guild_id?: string
          host_id?: string
          id?: string
          message_id?: string | null
          prize?: string
          required_role_id?: string | null
          status?: Database["public"]["Enums"]["giveaway_status"]
          winner_count?: number
          winner_ids?: string[]
        }
        Relationships: []
      }
      bot_guild_config: {
        Row: {
          activity_text: string | null
          activity_type: string
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          embed_color: string
          embed_color_dark: string
          embed_color_light: string
          guild_id: string
          nickname: string | null
          prefix: string
          presence_status: string
          updated_at: string
        }
        Insert: {
          activity_text?: string | null
          activity_type?: string
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          embed_color?: string
          embed_color_dark?: string
          embed_color_light?: string
          guild_id: string
          nickname?: string | null
          prefix?: string
          presence_status?: string
          updated_at?: string
        }
        Update: {
          activity_text?: string | null
          activity_type?: string
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          embed_color?: string
          embed_color_dark?: string
          embed_color_light?: string
          guild_id?: string
          nickname?: string | null
          prefix?: string
          presence_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_messages: {
        Row: {
          content: string
          guild_id: string
          key: string
          updated_at: string
        }
        Insert: {
          content: string
          guild_id: string
          key: string
          updated_at?: string
        }
        Update: {
          content?: string
          guild_id?: string
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_modules: {
        Row: {
          enabled: boolean
          guild_id: string
          level_id: string | null
          module: string
          settings: Json
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          guild_id: string
          level_id?: string | null
          module: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          guild_id?: string
          level_id?: string | null
          module?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_modules_level_id_bot_permission_levels_id_fk"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "bot_permission_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_permission_level_roles: {
        Row: {
          level_id: string
          role_id: string
        }
        Insert: {
          level_id: string
          role_id: string
        }
        Update: {
          level_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_permission_level_roles_level_id_bot_permission_levels_id_fk"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "bot_permission_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_permission_levels: {
        Row: {
          created_at: string
          guild_id: string
          id: string
          name: string
          weight: number
        }
        Insert: {
          created_at?: string
          guild_id: string
          id?: string
          name: string
          weight: number
        }
        Update: {
          created_at?: string
          guild_id?: string
          id?: string
          name?: string
          weight?: number
        }
        Relationships: []
      }
      bot_sanctions: {
        Row: {
          created_at: string
          ends_at: string | null
          guild_id: string
          id: string
          moderator_id: string
          number: number
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by_id: string | null
          type: Database["public"]["Enums"]["sanction_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          guild_id: string
          id?: string
          moderator_id: string
          number?: never
          reason: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_id?: string | null
          type: Database["public"]["Enums"]["sanction_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          guild_id?: string
          id?: string
          moderator_id?: string
          number?: never
          reason?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by_id?: string | null
          type?: Database["public"]["Enums"]["sanction_type"]
          user_id?: string
        }
        Relationships: []
      }
      bot_tickets: {
        Row: {
          answers: Json
          category_id: string
          category_label: string
          channel_id: string
          claimed_by_id: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by_id: string | null
          created_at: string
          guild_id: string
          id: string
          last_activity_at: string
          number: number
          opener_id: string
          rating: number | null
          status: Database["public"]["Enums"]["ticket_status"]
          transcript: string | null
        }
        Insert: {
          answers?: Json
          category_id: string
          category_label: string
          channel_id: string
          claimed_by_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by_id?: string | null
          created_at?: string
          guild_id: string
          id?: string
          last_activity_at?: string
          number?: never
          opener_id: string
          rating?: number | null
          status?: Database["public"]["Enums"]["ticket_status"]
          transcript?: string | null
        }
        Update: {
          answers?: Json
          category_id?: string
          category_label?: string
          channel_id?: string
          claimed_by_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by_id?: string | null
          created_at?: string
          guild_id?: string
          id?: string
          last_activity_at?: string
          number?: never
          opener_id?: string
          rating?: number | null
          status?: Database["public"]["Enums"]["ticket_status"]
          transcript?: string | null
        }
        Relationships: []
      }
      businesses: {
        Row: {
          archived: boolean
          created_at: string
          description: string
          id: string
          name: string
          open: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          description?: string
          id: string
          name: string
          open?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          open?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          actor_id: string | null
          created_at: string
          data: Json
          id: string
          subject_id: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          subject_id?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          subject_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_actor_id_users_id_fk"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_subject_id_users_id_fk"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      factions: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          join_open: boolean
          kind: Database["public"]["Enums"]["faction_kind"]
          lead_open: boolean
          lore: Json | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id: string
          join_open?: boolean
          kind: Database["public"]["Enums"]["faction_kind"]
          lead_open?: boolean
          lore?: Json | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          join_open?: boolean
          kind?: Database["public"]["Enums"]["faction_kind"]
          lead_open?: boolean
          lore?: Json | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          href: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          href?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          href?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_views: {
        Row: {
          last_seen_at: string
          subject_id: string
          viewer_id: string
        }
        Insert: {
          last_seen_at?: string
          subject_id: string
          viewer_id: string
        }
        Update: {
          last_seen_at?: string
          subject_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_views_subject_id_users_id_fk"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_views_viewer_id_users_id_fk"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          reset_at: string
        }
        Insert: {
          count: number
          key: string
          reset_at: string
        }
        Update: {
          count?: number
          key?: string
          reset_at?: string
        }
        Relationships: []
      }
      reapply_locks: {
        Row: {
          discord_id: string
          until: string
        }
        Insert: {
          discord_id: string
          until: string
        }
        Update: {
          discord_id?: string
          until?: string
        }
        Relationships: []
      }
      refusal_criteria: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
          label: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      role_ranks: {
        Row: {
          rank: Database["public"]["Enums"]["rank"]
          role_id: string
          updated_at: string
          updated_by_id: string | null
        }
        Insert: {
          rank: Database["public"]["Enums"]["rank"]
          role_id: string
          updated_at?: string
          updated_by_id?: string | null
        }
        Update: {
          rank?: Database["public"]["Enums"]["rank"]
          role_id?: string
          updated_at?: string
          updated_by_id?: string | null
        }
        Relationships: []
      }
      site_owners: {
        Row: {
          added_by_id: string | null
          created_at: string
          discord_id: string
        }
        Insert: {
          added_by_id?: string | null
          created_at?: string
          discord_id: string
        }
        Update: {
          added_by_id?: string | null
          created_at?: string
          discord_id?: string
        }
        Relationships: []
      }
      staff_notes: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          subject_id: string
          visibility: Database["public"]["Enums"]["note_visibility"]
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          subject_id: string
          visibility?: Database["public"]["Enums"]["note_visibility"]
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          subject_id?: string
          visibility?: Database["public"]["Enums"]["note_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "staff_notes_author_id_users_id_fk"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_notes_subject_id_users_id_fk"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar: string | null
          banner: string | null
          cgu_accepted_at: string | null
          cgu_version: string | null
          created_at: string
          global_name: string | null
          id: string
          in_guild: boolean
          last_login_at: string | null
          rank: Database["public"]["Enums"]["rank"]
          roles_synced_at: string | null
          updated_at: string
          username: string
        }
        Insert: {
          avatar?: string | null
          banner?: string | null
          cgu_accepted_at?: string | null
          cgu_version?: string | null
          created_at?: string
          global_name?: string | null
          id: string
          in_guild?: boolean
          last_login_at?: string | null
          rank?: Database["public"]["Enums"]["rank"]
          roles_synced_at?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          avatar?: string | null
          banner?: string | null
          cgu_accepted_at?: string | null
          cgu_version?: string | null
          created_at?: string
          global_name?: string | null
          id?: string
          in_guild?: boolean
          last_login_at?: string | null
          rank?: Database["public"]["Enums"]["rank"]
          roles_synced_at?: string | null
          updated_at?: string
          username?: string
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
      application_status:
        | "brouillon"
        | "envoyee"
        | "a_modifier"
        | "entretien"
        | "whitelistee"
        | "refusee"
      faction_kind: "affinite" | "creature"
      giveaway_status: "en_cours" | "termine" | "annule"
      note_visibility: "equipe" | "admin"
      rank: "joueur" | "recruteur" | "admin" | "owner"
      sanction_type:
        | "avertissement"
        | "exclusion"
        | "expulsion"
        | "bannissement"
      ticket_status: "ouvert" | "ferme"
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
    Enums: {
      application_status: [
        "brouillon",
        "envoyee",
        "a_modifier",
        "entretien",
        "whitelistee",
        "refusee",
      ],
      faction_kind: ["affinite", "creature"],
      giveaway_status: ["en_cours", "termine", "annule"],
      note_visibility: ["equipe", "admin"],
      rank: ["joueur", "recruteur", "admin", "owner"],
      sanction_type: [
        "avertissement",
        "exclusion",
        "expulsion",
        "bannissement",
      ],
      ticket_status: ["ouvert", "ferme"],
    },
  },
} as const
