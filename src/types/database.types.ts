
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
            "accounts": {
                  Row: {
                    "color": string | null,"created_at": string | null,"currency_code": string | null,"household_id": string,"icon": string | null,"id": string,"initial_balance_cents": number | null,"is_active": boolean | null,"name": string,"owner_user_id": string | null,"sort_order": number | null,"type": string,"updated_at": string | null,"visibility": string | null
                  }
                  Insert: {
                    "color"?: string | null,"created_at"?: string | null,"currency_code"?: string | null,"household_id"?: string,"icon"?: string | null,"id"?: string,"initial_balance_cents"?: number | null,"is_active"?: boolean | null,"name": string,"owner_user_id"?: string | null,"sort_order"?: number | null,"type": string,"updated_at"?: string | null,"visibility"?: string | null
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string | null,"currency_code"?: string | null,"household_id"?: string,"icon"?: string | null,"id"?: string,"initial_balance_cents"?: number | null,"is_active"?: boolean | null,"name"?: string,"owner_user_id"?: string | null,"sort_order"?: number | null,"type"?: string,"updated_at"?: string | null,"visibility"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "accounts_owner_user_id_fkey"
      columns: ["owner_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"budgets": {
                  Row: {
                    "amount_cents": number,"category_id": string,"created_at": string,"currency_code": string,"household_id": string,"id": string,"month": string,"month_key": number | null,"updated_at": string
                  }
                  Insert: {
                    "amount_cents"?: number,"category_id": string,"created_at"?: string,"currency_code"?: string,"household_id"?: string,"id"?: string,"month": string,"month_key"?: never,"updated_at"?: string
                  }
                  Update: {
                    "amount_cents"?: number,"category_id"?: string,"created_at"?: string,"currency_code"?: string,"household_id"?: string,"id"?: string,"month"?: string,"month_key"?: never,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budgets_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "color": string,"created_at": string | null,"household_id": string,"icon": string | null,"id": string,"is_active": boolean | null,"name": string,"parent_id": string | null,"sort_order": number | null,"updated_at": string | null
                  }
                  Insert: {
                    "color"?: string,"created_at"?: string | null,"household_id"?: string,"icon"?: string | null,"id"?: string,"is_active"?: boolean | null,"name": string,"parent_id"?: string | null,"sort_order"?: number | null,"updated_at"?: string | null
                  }
                  Update: {
                    "color"?: string,"created_at"?: string | null,"household_id"?: string,"icon"?: string | null,"id"?: string,"is_active"?: boolean | null,"name"?: string,"parent_id"?: string | null,"sort_order"?: number | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"debt_payments": {
                  Row: {
                    "adjustment_reason": string | null,"amount_cents": number,"created_at": string | null,"debt_id": string | null,"device_id": string,"household_id": string,"id": string,"internal_debt_id": string | null,"is_overpayment": boolean | null,"is_reversal": boolean | null,"overpayment_amount": number | null,"payment_date": string,"reverses_payment_id": string | null,"transaction_id": string | null
                  }
                  Insert: {
                    "adjustment_reason"?: string | null,"amount_cents": number,"created_at"?: string | null,"debt_id"?: string | null,"device_id": string,"household_id"?: string,"id"?: string,"internal_debt_id"?: string | null,"is_overpayment"?: boolean | null,"is_reversal"?: boolean | null,"overpayment_amount"?: number | null,"payment_date": string,"reverses_payment_id"?: string | null,"transaction_id"?: string | null
                  }
                  Update: {
                    "adjustment_reason"?: string | null,"amount_cents"?: number,"created_at"?: string | null,"debt_id"?: string | null,"device_id"?: string,"household_id"?: string,"id"?: string,"internal_debt_id"?: string | null,"is_overpayment"?: boolean | null,"is_reversal"?: boolean | null,"overpayment_amount"?: number | null,"payment_date"?: string,"reverses_payment_id"?: string | null,"transaction_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "debt_payments_debt_id_fkey"
      columns: ["debt_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_payments_internal_debt_id_fkey"
      columns: ["internal_debt_id"]
isOneToOne: false
      referencedRelation: "internal_debts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_payments_reverses_payment_id_fkey"
      columns: ["reverses_payment_id"]
isOneToOne: false
      referencedRelation: "debt_payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_payments_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "debt_payments_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions_non_transfer"
      referencedColumns: ["id"]
    }
                  ]
                },"debts": {
                  Row: {
                    "closed_at": string | null,"created_at": string | null,"household_id": string,"id": string,"name": string,"original_amount_cents": number,"status": string,"updated_at": string | null
                  }
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string | null,"household_id"?: string,"id"?: string,"name": string,"original_amount_cents": number,"status"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string | null,"household_id"?: string,"id"?: string,"name"?: string,"original_amount_cents"?: number,"status"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"devices": {
                  Row: {
                    "created_at": string,"fingerprint": string,"household_id": string,"id": string,"is_active": boolean,"last_seen": string,"name": string,"platform": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"fingerprint": string,"household_id"?: string,"id": string,"is_active"?: boolean,"last_seen"?: string,"name": string,"platform": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"fingerprint"?: string,"household_id"?: string,"id"?: string,"is_active"?: boolean,"last_seen"?: string,"name"?: string,"platform"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"internal_debts": {
                  Row: {
                    "closed_at": string | null,"created_at": string | null,"from_display_name": string,"from_id": string,"from_type": string,"household_id": string,"id": string,"name": string,"original_amount_cents": number,"status": string,"to_display_name": string,"to_id": string,"to_type": string,"updated_at": string | null
                  }
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string | null,"from_display_name": string,"from_id": string,"from_type": string,"household_id"?: string,"id"?: string,"name": string,"original_amount_cents": number,"status"?: string,"to_display_name": string,"to_id": string,"to_type": string,"updated_at"?: string | null
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string | null,"from_display_name"?: string,"from_id"?: string,"from_type"?: string,"household_id"?: string,"id"?: string,"name"?: string,"original_amount_cents"?: number,"status"?: string,"to_display_name"?: string,"to_id"?: string,"to_type"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string | null,"device_id": string | null,"email": string,"full_name": string | null,"household_id": string,"id": string,"notification_preferences": Json | null,"theme_preference": string | null,"timezone": string | null,"updated_at": string | null
                  }
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string | null,"device_id"?: string | null,"email": string,"full_name"?: string | null,"household_id"?: string,"id": string,"notification_preferences"?: Json | null,"theme_preference"?: string | null,"timezone"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string | null,"device_id"?: string | null,"email"?: string,"full_name"?: string | null,"household_id"?: string,"id"?: string,"notification_preferences"?: Json | null,"theme_preference"?: string | null,"timezone"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"device_id": string,"endpoint": string,"id": string,"p256dh": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "auth": string,"created_at"?: string,"device_id": string,"endpoint": string,"id"?: string,"p256dh": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"device_id"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_device_id_fkey"
      columns: ["device_id"]
isOneToOne: false
      referencedRelation: "devices"
      referencedColumns: ["id"]
    }
                  ]
                },"sync_queue": {
                  Row: {
                    "created_at": string,"device_id": string,"entity_id": string,"entity_type": string,"error_message": string | null,"household_id": string,"id": string,"max_retries": number,"operation": NonNullable<Json>,"retry_count": number,"status": string,"synced_at": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"device_id": string,"entity_id": string,"entity_type": string,"error_message"?: string | null,"household_id"?: string,"id"?: string,"max_retries"?: number,"operation": NonNullable<Json>,"retry_count"?: number,"status"?: string,"synced_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"device_id"?: string,"entity_id"?: string,"entity_type"?: string,"error_message"?: string | null,"household_id"?: string,"id"?: string,"max_retries"?: number,"operation"?: NonNullable<Json>,"retry_count"?: number,"status"?: string,"synced_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"transaction_events": {
                  Row: {
                    "actor_user_id": string | null,"checksum": string,"created_at": string,"device_id": string,"entity_id": string,"entity_type": string,"event_version": number,"household_id": string,"id": string,"idempotency_key": string,"lamport_clock": number,"op": string,"payload": NonNullable<Json>,"vector_clock": NonNullable<Json>
                  }
                  Insert: {
                    "actor_user_id"?: string | null,"checksum": string,"created_at"?: string,"device_id": string,"entity_id": string,"entity_type"?: string,"event_version"?: number,"household_id"?: string,"id"?: string,"idempotency_key": string,"lamport_clock": number,"op": string,"payload": NonNullable<Json>,"vector_clock": NonNullable<Json>
                  }
                  Update: {
                    "actor_user_id"?: string | null,"checksum"?: string,"created_at"?: string,"device_id"?: string,"entity_id"?: string,"entity_type"?: string,"event_version"?: number,"household_id"?: string,"id"?: string,"idempotency_key"?: string,"lamport_clock"?: number,"op"?: string,"payload"?: NonNullable<Json>,"vector_clock"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "transaction_events_actor_user_id_fkey"
      columns: ["actor_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transaction_events_device_id_fkey"
      columns: ["device_id"]
isOneToOne: false
      referencedRelation: "devices"
      referencedColumns: ["id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "account_id": string | null,"amount_cents": number,"category_id": string | null,"created_at": string,"created_by_user_id": string | null,"currency_code": string,"date": string,"debt_id": string | null,"description": string,"device_id": string | null,"household_id": string,"id": string,"import_key": string | null,"internal_debt_id": string | null,"notes": string | null,"status": string,"tagged_user_ids": (string)[] | null,"transfer_group_id": string | null,"type": string,"updated_at": string,"visibility": string
                  }
                  Insert: {
                    "account_id"?: string | null,"amount_cents": number,"category_id"?: string | null,"created_at"?: string,"created_by_user_id"?: string | null,"currency_code"?: string,"date": string,"debt_id"?: string | null,"description": string,"device_id"?: string | null,"household_id"?: string,"id"?: string,"import_key"?: string | null,"internal_debt_id"?: string | null,"notes"?: string | null,"status"?: string,"tagged_user_ids"?: (string)[] | null,"transfer_group_id"?: string | null,"type": string,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "account_id"?: string | null,"amount_cents"?: number,"category_id"?: string | null,"created_at"?: string,"created_by_user_id"?: string | null,"currency_code"?: string,"date"?: string,"debt_id"?: string | null,"description"?: string,"device_id"?: string | null,"household_id"?: string,"id"?: string,"import_key"?: string | null,"internal_debt_id"?: string | null,"notes"?: string | null,"status"?: string,"tagged_user_ids"?: (string)[] | null,"transfer_group_id"?: string | null,"type"?: string,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_created_by_user_id_fkey"
      columns: ["created_by_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_debt_id_fkey"
      columns: ["debt_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_internal_debt_id_fkey"
      columns: ["internal_debt_id"]
isOneToOne: false
      referencedRelation: "internal_debts"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "transactions_non_transfer": {
                  Row: {
                    "account_id": string | null,"amount_cents": number | null,"category_id": string | null,"created_at": string | null,"created_by_user_id": string | null,"currency_code": string | null,"date": string | null,"debt_id": string | null,"description": string | null,"device_id": string | null,"household_id": string | null,"id": string | null,"import_key": string | null,"internal_debt_id": string | null,"notes": string | null,"status": string | null,"tagged_user_ids": (string)[] | null,"transfer_group_id": string | null,"type": string | null,"updated_at": string | null,"visibility": string | null
                  }
                  Insert: {
                           "account_id"?: string | null,"amount_cents"?: number | null,"category_id"?: string | null,"created_at"?: string | null,"created_by_user_id"?: string | null,"currency_code"?: string | null,"date"?: string | null,"debt_id"?: string | null,"description"?: string | null,"device_id"?: string | null,"household_id"?: string | null,"id"?: string | null,"import_key"?: string | null,"internal_debt_id"?: string | null,"notes"?: string | null,"status"?: string | null,"tagged_user_ids"?: (string)[] | null,"transfer_group_id"?: string | null,"type"?: string | null,"updated_at"?: string | null,"visibility"?: string | null
                         }
                        Update: {
                           "account_id"?: string | null,"amount_cents"?: number | null,"category_id"?: string | null,"created_at"?: string | null,"created_by_user_id"?: string | null,"currency_code"?: string | null,"date"?: string | null,"debt_id"?: string | null,"description"?: string | null,"device_id"?: string | null,"household_id"?: string | null,"id"?: string | null,"import_key"?: string | null,"internal_debt_id"?: string | null,"notes"?: string | null,"status"?: string | null,"tagged_user_ids"?: (string)[] | null,"transfer_group_id"?: string | null,"type"?: string | null,"updated_at"?: string | null,"visibility"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "transactions_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_created_by_user_id_fkey"
      columns: ["created_by_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_debt_id_fkey"
      columns: ["debt_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_internal_debt_id_fkey"
      columns: ["internal_debt_id"]
isOneToOne: false
      referencedRelation: "internal_debts"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "check_budget_thresholds":
{ Args: Record<PropertyKey, never>; Returns: {
              "amount_cents": number,"category_id": string,"category_name": string,"id": string,"percentage": number,"spent_cents": number,"user_id": string
            }[]
                           },
"cleanup_old_events":
{ Args: Record<PropertyKey, never>; Returns: {
              "deleted_count": number
            }[]
                           },
"cleanup_old_sync_queue":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"get_account_balances":
{ Args: { "p_account_ids"?: (string)[] }; Returns: {
              "account_id": string,"cleared_count": number,"cleared_delta_cents": number,"pending_count": number,"pending_delta_cents": number
            }[]
                           },
"get_user_household_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"transactions_filter_summary":
{ Args: { "p_account_id"?: string,"p_amount_max"?: number,"p_amount_min"?: number,"p_category_id"?: string,"p_date_from"?: string,"p_date_to"?: string,"p_exclude_transfers"?: boolean,"p_search"?: string,"p_status"?: string,"p_type"?: string }; Returns: {
              "total_in_cents": number,"total_out_cents": number,"txn_count": number
            }[]
                           }
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
