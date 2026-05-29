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
      agency_services: {
        Row: {
          ativo: boolean
          categoria: string | null
          created_at: string
          descricao: string | null
          id: string
          keywords: string[]
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          keywords?: string[]
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          keywords?: string[]
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      channel_posts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          created_at: string
          event_starts_at: string | null
          external_id: string | null
          id: string
          image_url: string | null
          link_url: string | null
          metadata: Json
          source: string
          status: Database["public"]["Enums"]["channel_post_status"]
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          created_at?: string
          event_starts_at?: string | null
          external_id?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          metadata?: Json
          source?: string
          status?: Database["public"]["Enums"]["channel_post_status"]
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          created_at?: string
          event_starts_at?: string | null
          external_id?: string | null
          id?: string
          image_url?: string | null
          link_url?: string | null
          metadata?: Json
          source?: string
          status?: Database["public"]["Enums"]["channel_post_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      channel_settings: {
        Row: {
          created_at: string
          horario_atendimento: string
          id: string
          mensagem_fora_horario: string
          mensagem_humano: string
          persona_descubra: string
          persona_viagens: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          horario_atendimento?: string
          id?: string
          mensagem_fora_horario?: string
          mensagem_humano?: string
          persona_descubra?: string
          persona_viagens?: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          horario_atendimento?: string
          id?: string
          mensagem_fora_horario?: string
          mensagem_humano?: string
          persona_descubra?: string
          persona_viagens?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          author: Database["public"]["Enums"]["message_author"]
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          id: string
          metadata: Json
          session_id: string
          text: string
        }
        Insert: {
          author: Database["public"]["Enums"]["message_author"]
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          id?: string
          metadata?: Json
          session_id: string
          text: string
        }
        Update: {
          author?: Database["public"]["Enums"]["message_author"]
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          id?: string
          metadata?: Json
          session_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          must_change_password: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          must_change_password?: boolean
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          must_change_password?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          assigned_to: string | null
          contact_name: string | null
          created_at: string
          id: string
          intake_data: Json
          intake_state: string | null
          last_message_at: string
          line: Database["public"]["Enums"]["channel_line"]
          mode: Database["public"]["Enums"]["session_mode"]
          phone: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          intake_data?: Json
          intake_state?: string | null
          last_message_at?: string
          line: Database["public"]["Enums"]["channel_line"]
          mode?: Database["public"]["Enums"]["session_mode"]
          phone: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          intake_data?: Json
          intake_state?: string | null
          last_message_at?: string
          line?: Database["public"]["Enums"]["channel_line"]
          mode?: Database["public"]["Enums"]["session_mode"]
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      travel_intake: {
        Row: {
          adultos: number | null
          assigned_to: string | null
          created_at: string
          criancas: number | null
          data_ida: string | null
          data_volta: string | null
          destino: string | null
          id: string
          orcamento_brl: number | null
          origem: string | null
          preferencias: Json
          protocol: string
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          adultos?: number | null
          assigned_to?: string | null
          created_at?: string
          criancas?: number | null
          data_ida?: string | null
          data_volta?: string | null
          destino?: string | null
          id?: string
          orcamento_brl?: number | null
          origem?: string | null
          preferencias?: Json
          protocol: string
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          adultos?: number | null
          assigned_to?: string | null
          created_at?: string
          criancas?: number | null
          data_ida?: string | null
          data_volta?: string | null
          destino?: string | null
          id?: string
          orcamento_brl?: number | null
          origem?: string | null
          preferencias?: Json
          protocol?: string
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_intake_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
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
      generate_protocol: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _uid: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "consultor"
      channel_line: "descubra" | "viagens"
      channel_post_status: "rascunho" | "aprovado" | "publicado" | "arquivado"
      message_author: "user" | "bot" | "agent" | "system"
      message_direction: "in" | "out"
      session_mode: "bot" | "humano" | "triagem" | "aguardando"
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
      app_role: ["admin", "consultor"],
      channel_line: ["descubra", "viagens"],
      channel_post_status: ["rascunho", "aprovado", "publicado", "arquivado"],
      message_author: ["user", "bot", "agent", "system"],
      message_direction: ["in", "out"],
      session_mode: ["bot", "humano", "triagem", "aguardando"],
    },
  },
} as const
