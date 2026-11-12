import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { refreshSupabaseSession } from "./lib/supabase/proxy";

const intl = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = intl(request);
  // Keep the Supabase auth cookie fresh on page navigations.
  return refreshSupabaseSession(request, response);
}

export const config = {
  // Skip API routes, Next internals and static files (anything with a dot).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
