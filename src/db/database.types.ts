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
      rank: "joueur" | "recruteur" | "staff"
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
      rank: ["joueur", "recruteur", "staff"],
    },
  },
} as const
