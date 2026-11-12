"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ensureGuestSession, type GuestSession } from "@/lib/supabase/session";

export function SessionStatus() {
  const t = useTranslations("design");
  const [session, setSession] = useState<GuestSession | null>(null);

  useEffect(() => {
    let alive = true;
    void ensureGuestSession().then((s) => alive && setSession(s));
    return () => {
      alive = false;
    };
  }, []);

  let text: string;
  if (!session) text = t("sessionLoading");
  else if (session.status === "unconfigured") text = t("sessionNone");
  else if (session.status === "error") text = t("sessionError", { message: session.message });
  else text = t("sessionGuest", { id: session.user.id.slice(0, 8) });

  return (
    <p data-testid="session-status" data-status={session?.status ?? "loading"} className="font-semibold">
      {text}
    </p>
  );
}
