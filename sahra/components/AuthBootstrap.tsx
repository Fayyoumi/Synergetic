"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";
import { ensureGuestSession } from "@/lib/supabase/session";

/**
 * Signs every visitor in anonymously (guests need no account). Renders nothing.
 * Skipped on the sign-in callback and admin pages: an anonymous sign-in racing
 * an email sign-in there could replace the admin's session.
 */
export function AuthBootstrap() {
  const pathname = usePathname();
  const skip = pathname.startsWith("/auth/") || pathname.startsWith("/admin");
  useEffect(() => {
    if (!skip) void ensureGuestSession();
  }, [skip]);
  return null;
}
