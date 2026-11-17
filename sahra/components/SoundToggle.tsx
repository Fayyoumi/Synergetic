"use client";

import { useTranslations } from "next-intl";
import { setSoundEnabled, useSoundEnabled } from "@/lib/sound";

/** Mute / unmute Kassa's sound effects (icon button, labelled). */
export function SoundToggle({ large }: { large?: boolean }) {
  const t = useTranslations("sound");
  const on = useSoundEnabled();
  const size = large ? 28 : 22;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t("mute") : t("unmute")}
      onClick={() => setSoundEnabled(!on)}
      className={`flex shrink-0 items-center justify-center rounded-full ink-border bg-paper ${large ? "h-14 w-14" : "h-11 w-11"}`}
      data-testid="sound-toggle"
    >
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
        {on ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /> : <path d="M17 9l5 6M22 9l-5 6" />}
      </svg>
    </button>
  );
}
