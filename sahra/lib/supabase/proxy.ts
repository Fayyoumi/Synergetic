import type { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./env";

/** Refreshes the Supabase auth cookie on the given response, if any. */
export async function refreshSupabaseSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  if (!isSupabaseConfigured()) return response;
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}
