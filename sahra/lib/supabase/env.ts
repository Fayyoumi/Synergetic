/**
 * Supabase settings. The app still renders without them (useful for UI work
 * before a project exists); anything that needs the database checks
 * `isSupabaseConfigured()` first.
 */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
}
