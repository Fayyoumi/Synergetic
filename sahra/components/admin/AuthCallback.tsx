"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";

/** Finishes sign-in from a link: ?code (PKCE), ?token_hash&type (one-time token) or #access_token. */
export function AuthCallback() {
  const t = useTranslations("admin");
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      const supabase = getBrowserSupabase();
      if (!supabase) return setFailed(true);
      const url = new URL(window.location.href);
      const next = url.searchParams.get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
      let error: unknown = null;
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const hash = new URLSearchParams(url.hash.slice(1));
      if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
      else if (tokenHash) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" }));
      else if (hash.get("access_token") && hash.get("refresh_token")) {
        ({ error } = await supabase.auth.setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")! }));
      } else error = new Error("no credentials");
      if (error) return setFailed(true);
      router.replace(safeNext);
    })();
  }, [router]);

  return <p role={failed ? "alert" : "status"} className="py-10 text-center font-semibold">{failed ? t("signInFailed") : t("signingIn")}</p>;
}
