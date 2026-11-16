"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toWesternDigits } from "@/lib/i18n/digits";
import { Button } from "@/components/ui";

/** "Got a room code?" — 4 digits (Arabic-Indic digits are accepted too). */
export function JoinCodeForm({ compact }: { compact?: boolean }) {
  const t = useTranslations("join");
  const th = useTranslations("home");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const c = toWesternDigits(code).replace(/\D/g, "");
        if (c.length !== 4) return setError(true);
        router.push(`/join/${c}`);
      }}
    >
      <label htmlFor="room-code" className={compact ? "font-bold" : "display-text text-2xl"}>
        {compact ? th("joinTitle") : t("codeLabel")}
      </label>
      <div className="flex gap-2">
        <input
          id="room-code"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          dir="ltr"
          lang="en"
          value={code}
          onChange={(e) => {
            setError(false);
            setCode(e.target.value);
          }}
          placeholder="0000"
          aria-describedby="room-code-help"
          className="display-text min-h-14 w-0 flex-1 rounded-[14px] ink-border bg-paper px-3 text-center text-3xl tracking-[0.3em]"
        />
        <Button type="submit" tone="sunflower" size="lg">
          {compact ? th("joinCta") : t("go")}
        </Button>
      </div>
      <p id="room-code-help" className={`text-sm ${error ? "font-bold text-tomato" : "text-muted"}`} role={error ? "alert" : undefined}>
        {error ? t("badCode") : t("codeHelp")}
      </p>
    </form>
  );
}
