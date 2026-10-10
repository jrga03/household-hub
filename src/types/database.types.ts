
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "events": {
                  Row: {
                    "actor_user_id": string,"device_id": string,"entity_id": string,"entity_type": string,"event_type": string,"event_version": number,"hlc": string,"household_id": string,"id": string,"owner_user_id": string | null,"payload": NonNullable<Json>,"received_at": string,"sequence": number,"visibility": string
                  }
                  Insert: {
                    "actor_user_id"?: string,"device_id": string,"entity_id": string,"entity_type": string,"event_type": string,"event_version": number,"hlc": string,"household_id": string,"id": string,"owner_user_id"?: string | null,"payload": NonNullable<Json>,"received_at"?: string,"sequence"?: number,"visibility": string
                  }
                  Update: {
                    "actor_user_id"?: string,"device_id"?: string,"entity_id"?: string,"entity_type"?: string,"event_type"?: string,"event_version"?: number,"hlc"?: string,"household_id"?: string,"id"?: string,"owner_user_id"?: string | null,"payload"?: NonNullable<Json>,"received_at"?: string,"sequence"?: number,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"household_members": {
                  Row: {
                    "household_id": string,"joined_at": string,"user_id": string
                  }
                  Insert: {
                    "household_id": string,"joined_at"?: string,"user_id": string
                  }
                  Update: {
                    "household_id"?: string,"joined_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_members_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"households": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"name": string,"owner_user_id": string
                  }
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"name": string,"owner_user_id": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"name"?: string,"owner_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "households_owner_is_member"
      columns: ["id","owner_user_id"]
isOneToOne: false
      referencedRelation: "household_members"
      referencedColumns: ["household_id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "create_household":
{ Args: { "household_name": string }; Returns: {
              "code": string,
"created_at": string,
"id": string,
"name": string,
"owner_user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "households"
        isOneToOne: true
        isSetofReturn: false
      } },
"current_household_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"generate_household_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"pull_events":
{ Args: { "after_sequence": number,"batch_size": number }; Returns: {
              "actor_user_id": string,
"device_id": string,
"entity_id": string,
"entity_type": string,
"event_type": string,
"event_version": number,
"hlc": string,
"household_id": string,
"id": string,
"owner_user_id": string | null,
"payload": NonNullable<Json>,
"received_at": string,
"sequence": number,
"visibility": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "events"
        isOneToOne: false
        isSetofReturn: true
      } }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
