"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@/components/ui";
import { getBrowserSupabase } from "@/lib/supabase/client";

/** Email magic-link sign-in for admins (accounts are made admin with `npm run admin:make`). */
export function AdminLogin({ signedInNotAdmin }: { signedInNotAdmin: boolean }) {
  const t = useTranslations("admin");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "failed">("idle");
  return (
    <Card className="flex max-w-lg flex-col gap-4">
      <h2 className="display-text text-3xl">{t("signInTitle")}</h2>
      {signedInNotAdmin && (
        <p role="alert" className="font-bold text-tomato">
          {t("notAdmin")}
        </p>
      )}
      <p>{t("signInBody")}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const supabase = getBrowserSupabase();
          if (!supabase) return setState("failed");
          const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback?next=/admin` },
          });
          setState(error ? "failed" : "sent");
        }}
      >
        <label htmlFor="admin-email" className="font-bold">
          {t("email")}
        </label>
        <input
          id="admin-email"
          type="email"
          required
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-12 rounded-[14px] ink-border bg-cream px-3"
        />
        <Button type="submit" tone="sunflower" size="md">
          {t("sendLink")}
        </Button>
      </form>
      {state !== "idle" && (
        <p role="status" className="font-semibold">
          {state === "sent" ? t("linkSent") : t("linkFailed")}
        </p>
      )}
    </Card>
  );
}
