import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Đã cấu hình Supabase? Nếu không, ứng dụng chạy ở chế độ dùng thử. */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('your-project-ref'))

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) throw new Error('Supabase chưa được cấu hình')
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'pwm-auth' },
    })
  }
  return client
}
