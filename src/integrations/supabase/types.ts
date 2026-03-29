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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          abandoned_at: string | null
          checkout_url: string | null
          created_at: string | null
          currency: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          external_id: string | null
          id: string
          items: Json | null
          org_id: string
          recovered_at: string | null
          recovered_order_id: string | null
          recovery_status: string | null
          reminder_count: number | null
          reminder_sent_at: string | null
          total: number | null
        }
        Insert: {
          abandoned_at?: string | null
          checkout_url?: string | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          external_id?: string | null
          id?: string
          items?: Json | null
          org_id: string
          recovered_at?: string | null
          recovered_order_id?: string | null
          recovery_status?: string | null
          reminder_count?: number | null
          reminder_sent_at?: string | null
          total?: number | null
        }
        Update: {
          abandoned_at?: string | null
          checkout_url?: string | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          external_id?: string | null
          id?: string
          items?: Json | null
          org_id?: string
          recovered_at?: string | null
          recovered_order_id?: string | null
          recovery_status?: string | null
          reminder_count?: number | null
          reminder_sent_at?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_recovered_order_id_fkey"
            columns: ["recovered_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string | null
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          keywords: string[]
          name: string
          org_id: string
          reply_text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          keywords?: string[]
          name: string
          org_id: string
          reply_text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          keywords?: string[]
          name?: string
          org_id?: string
          reply_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          created_at: string | null
          customer_name: string | null
          delivered_at: string | null
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          phone: string
          read_at: string | null
          sent_at: string | null
          status: string
          variables: Json | null
          wa_message_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          phone: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          variables?: Json | null
          wa_message_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          phone?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          variables?: Json | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_tags: string[] | null
          audience_type: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          delivered_count: number | null
          exclude_campaign_ids: string[] | null
          exclude_tags: string[] | null
          failed_count: number | null
          id: string
          name: string
          notes: string | null
          org_id: string
          read_count: number | null
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number | null
          status: string
          template_language: string | null
          template_name: string | null
          template_variables: Json | null
          total_recipients: number | null
          updated_at: string | null
        }
        Insert: {
          audience_tags?: string[] | null
          audience_type?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          exclude_campaign_ids?: string[] | null
          exclude_tags?: string[] | null
          failed_count?: number | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          read_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string
          template_language?: string | null
          template_name?: string | null
          template_variables?: Json | null
          total_recipients?: number | null
          updated_at?: string | null
        }
        Update: {
          audience_tags?: string[] | null
          audience_type?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          exclude_campaign_ids?: string[] | null
          exclude_tags?: string[] | null
          failed_count?: number | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          read_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string
          template_language?: string | null
          template_name?: string | null
          template_variables?: Json | null
          total_recipients?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      closure_reasons: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          label: string
          org_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          org_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          org_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "closure_reasons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_team: string | null
          assigned_to: string | null
          closed_at: string | null
          closed_by: string | null
          closure_reason_id: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string
          customer_profile_pic: string | null
          id: string
          last_message: string | null
          last_message_at: string | null
          notes: string | null
          org_id: string | null
          status: string | null
          tags: string[] | null
          unread_count: number | null
          updated_at: string | null
          wa_conversation_id: string | null
        }
        Insert: {
          assigned_team?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_reason_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone: string
          customer_profile_pic?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          notes?: string | null
          org_id?: string | null
          status?: string | null
          tags?: string[] | null
          unread_count?: number | null
          updated_at?: string | null
          wa_conversation_id?: string | null
        }
        Update: {
          assigned_team?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          closed_by?: string | null
          closure_reason_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string
          customer_profile_pic?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          notes?: string | null
          org_id?: string | null
          status?: string | null
          tags?: string[] | null
          unread_count?: number | null
          updated_at?: string | null
          wa_conversation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_closure_reason_id_fkey"
            columns: ["closure_reason_id"]
            isOneToOne: false
            referencedRelation: "closure_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          discount_amount: number
          id: string
          org_id: string
          redeemed_at: string | null
        }
        Insert: {
          coupon_id: string
          discount_amount: number
          id?: string
          org_id: string
          redeemed_at?: string | null
        }
        Update: {
          coupon_id?: string
          discount_amount?: number
          id?: string
          org_id?: string
          redeemed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applicable_plans: string[] | null
          code: string
          created_at: string | null
          created_by: string | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          min_plan_price: number | null
          used_count: number
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applicable_plans?: string[] | null
          code: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_plan_price?: number | null
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applicable_plans?: string[] | null
          code?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          min_plan_price?: number | null
          used_count?: number
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      customer_tag_definitions: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tag_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          metadata: Json | null
          name: string | null
          notes: string | null
          org_id: string
          phone: string
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          notes?: string | null
          org_id: string
          phone: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          notes?: string | null
          org_id?: string
          phone?: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          media_url: string | null
          message_type: string | null
          metadata: Json | null
          sender: string
          status: string | null
          wa_message_id: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          sender: string
          status?: string | null
          wa_message_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          media_url?: string | null
          message_type?: string | null
          metadata?: Json | null
          sender?: string
          status?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          metadata: Json | null
          order_id: string
          product_id: string | null
          product_name: string
          product_sku: string | null
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          id?: string
          metadata?: Json | null
          order_id: string
          product_id?: string | null
          product_name: string
          product_sku?: string | null
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Update: {
          id?: string
          metadata?: Json | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          product_sku?: string | null
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          created_at: string | null
          currency: string | null
          customer_address: string | null
          customer_city: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_region: string | null
          delivered_at: string | null
          discount_amount: number | null
          external_id: string | null
          id: string
          notes: string | null
          order_number: string | null
          org_id: string
          payment_method: string | null
          payment_status: string | null
          refunded_at: string | null
          shipped_at: string | null
          shipping_amount: number | null
          source: string | null
          status: string
          subtotal: number | null
          tags: string[] | null
          tax_amount: number | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          customer_address?: string | null
          customer_city?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_region?: string | null
          delivered_at?: string | null
          discount_amount?: number | null
          external_id?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          org_id: string
          payment_method?: string | null
          payment_status?: string | null
          refunded_at?: string | null
          shipped_at?: string | null
          shipping_amount?: number | null
          source?: string | null
          status?: string
          subtotal?: number | null
          tags?: string[] | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          customer_address?: string | null
          customer_city?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_region?: string | null
          delivered_at?: string | null
          discount_amount?: number | null
          external_id?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          org_id?: string
          payment_method?: string | null
          payment_status?: string | null
          refunded_at?: string | null
          shipped_at?: string | null
          shipping_amount?: number | null
          source?: string | null
          status?: string
          subtotal?: number | null
          tags?: string[] | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          default_assignment_strategy: string
          default_max_conversations: number | null
          id: string
          is_active: boolean
          is_ecommerce: boolean | null
          logo_url: string | null
          name: string
          plan_id: string | null
          settings: Json | null
          slug: string | null
          store_platform: string | null
          store_url: string | null
          subscription_ends_at: string | null
          subscription_starts_at: string | null
          subscription_status: string
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_assignment_strategy?: string
          default_max_conversations?: number | null
          id?: string
          is_active?: boolean
          is_ecommerce?: boolean | null
          logo_url?: string | null
          name: string
          plan_id?: string | null
          settings?: Json | null
          slug?: string | null
          store_platform?: string | null
          store_url?: string | null
          subscription_ends_at?: string | null
          subscription_starts_at?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_assignment_strategy?: string
          default_max_conversations?: number | null
          id?: string
          is_active?: boolean
          is_ecommerce?: boolean | null
          logo_url?: string | null
          name?: string
          plan_id?: string | null
          settings?: Json | null
          slug?: string | null
          store_platform?: string | null
          store_url?: string | null
          subscription_ends_at?: string | null
          subscription_starts_at?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_cycle: string
          created_at: string | null
          currency: string
          description: string | null
          features: Json | null
          id: string
          is_active: boolean
          max_conversations: number
          max_messages_per_month: number
          max_phone_numbers: number
          max_team_members: number
          name: string
          name_ar: string
          price: number
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          billing_cycle?: string
          created_at?: string | null
          currency?: string
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          max_conversations?: number
          max_messages_per_month?: number
          max_phone_numbers?: number
          max_team_members?: number
          name: string
          name_ar: string
          price?: number
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          billing_cycle?: string
          created_at?: string | null
          currency?: string
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean
          max_conversations?: number
          max_messages_per_month?: number
          max_phone_numbers?: number
          max_team_members?: number
          name?: string
          name_ar?: string
          price?: number
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          compare_at_price: number | null
          created_at: string | null
          currency: string | null
          description: string | null
          external_id: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          metadata: Json | null
          name: string
          name_ar: string | null
          org_id: string
          price: number
          sku: string | null
          stock_quantity: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          external_id?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          name_ar?: string | null
          org_id: string
          price?: number
          sku?: string | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          external_id?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          name_ar?: string | null
          org_id?: string
          price?: number
          sku?: string | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          is_active: boolean
          is_online: boolean | null
          last_seen_at: string | null
          org_id: string | null
          phone: string | null
          team_id: string | null
          updated_at: string | null
          work_days: number[] | null
          work_days_2: number[] | null
          work_end: string | null
          work_end_2: string | null
          work_start: string | null
          work_start_2: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          is_online?: boolean | null
          last_seen_at?: string | null
          org_id?: string | null
          phone?: string | null
          team_id?: string | null
          updated_at?: string | null
          work_days?: number[] | null
          work_days_2?: number[] | null
          work_end?: string | null
          work_end_2?: string | null
          work_start?: string | null
          work_start_2?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_online?: boolean | null
          last_seen_at?: string | null
          org_id?: string | null
          phone?: string | null
          team_id?: string | null
          updated_at?: string | null
          work_days?: number[] | null
          work_days_2?: number[] | null
          work_end?: string | null
          work_end_2?: string | null
          work_start?: string | null
          work_start_2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      teams: {
        Row: {
          assignment_strategy: string
          created_at: string | null
          id: string
          last_assigned_index: number
          max_conversations_per_agent: number | null
          name: string
          org_id: string
          skill_keywords: Json | null
        }
        Insert: {
          assignment_strategy?: string
          created_at?: string | null
          id?: string
          last_assigned_index?: number
          max_conversations_per_agent?: number | null
          name: string
          org_id: string
          skill_keywords?: Json | null
        }
        Update: {
          assignment_strategy?: string
          created_at?: string | null
          id?: string
          last_assigned_index?: number
          max_conversations_per_agent?: number | null
          name?: string
          org_id?: string
          skill_keywords?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_tracking: {
        Row: {
          api_calls: number
          conversations_count: number
          created_at: string | null
          id: string
          messages_received: number
          messages_sent: number
          org_id: string
          period: string
          storage_used_mb: number
          updated_at: string | null
        }
        Insert: {
          api_calls?: number
          conversations_count?: number
          created_at?: string | null
          id?: string
          messages_received?: number
          messages_sent?: number
          org_id: string
          period: string
          storage_used_mb?: number
          updated_at?: string | null
        }
        Update: {
          api_calls?: number
          conversations_count?: number
          created_at?: string | null
          id?: string
          messages_received?: number
          messages_sent?: number
          org_id?: string
          period?: string
          storage_used_mb?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_tracking_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          org_id: string
          reference_id: string | null
          reference_type: string | null
          type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          org_id: string
          reference_id?: string | null
          reference_type?: string | null
          type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          org_id?: string
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string | null
          currency: string
          id: string
          is_active: boolean
          org_id: string
          updated_at: string | null
        }
        Insert: {
          balance?: number
          created_at?: string | null
          currency?: string
          id?: string
          is_active?: boolean
          org_id: string
          updated_at?: string | null
        }
        Update: {
          balance?: number
          created_at?: string | null
          currency?: string
          id?: string
          is_active?: boolean
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_config: {
        Row: {
          access_token: string
          business_account_id: string
          business_name: string | null
          created_at: string | null
          display_phone: string | null
          id: string
          is_connected: boolean | null
          last_register_attempt_at: string | null
          org_id: string | null
          phone_number_id: string
          registered_at: string | null
          registration_error: string | null
          registration_status: string | null
          token_expires_at: string | null
          token_last_refreshed_at: string | null
          token_refresh_error: string | null
          updated_at: string | null
          webhook_verify_token: string
        }
        Insert: {
          access_token: string
          business_account_id: string
          business_name?: string | null
          created_at?: string | null
          display_phone?: string | null
          id?: string
          is_connected?: boolean | null
          last_register_attempt_at?: string | null
          org_id?: string | null
          phone_number_id: string
          registered_at?: string | null
          registration_error?: string | null
          registration_status?: string | null
          token_expires_at?: string | null
          token_last_refreshed_at?: string | null
          token_refresh_error?: string | null
          updated_at?: string | null
          webhook_verify_token?: string
        }
        Update: {
          access_token?: string
          business_account_id?: string
          business_name?: string | null
          created_at?: string | null
          display_phone?: string | null
          id?: string
          is_connected?: boolean | null
          last_register_attempt_at?: string | null
          org_id?: string | null
          phone_number_id?: string
          registered_at?: string | null
          registration_error?: string | null
          registration_status?: string | null
          token_expires_at?: string | null
          token_last_refreshed_at?: string | null
          token_refresh_error?: string | null
          updated_at?: string | null
          webhook_verify_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "member" | "supervisor"
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
      app_role: ["super_admin", "admin", "member", "supervisor"],
    },
  },
} as const
