"use client";

import { useEffect } from "react";
import { ensureGuestSession } from "@/lib/supabase/session";

/** Signs every visitor in anonymously (guests need no account). Renders nothing. */
export function AuthBootstrap() {
  useEffect(() => {
    void ensureGuestSession();
  }, []);
  return null;
}
