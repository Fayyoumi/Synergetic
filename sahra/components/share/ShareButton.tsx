"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { renderStory, type StoryCard } from "@/lib/share/story";

type Tone = "paper" | "sunflower" | "tomato" | "chair" | "ink";

async function logClientEvent(name: "share_clicked" | "share_image_generated", props: Record<string, unknown>, roomCode?: string) {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, props, roomCode }),
      keepalive: true,
    });
  } catch {
    // analytics must never break sharing
  }
}

/**
 * "Share" for a story image: draws the 1080×1920 card, then uses the native
 * share sheet with the image file where supported, or shows the image with a
 * "save" link otherwise.
 */
export function ShareButton({
  card,
  what,
  roomCode,
  label,
  tone = "paper",
  size = "lg",
  testId,
}: {
  card: StoryCard;
  what: "solo_result" | "team_result" | "charades_result" | "title";
  roomCode?: string;
  label?: string;
  tone?: Tone;
  size?: "md" | "lg";
  testId?: string;
}) {
  const t = useTranslations("share");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const onShare = async () => {
    setBusy(true);
    void logClientEvent("share_clicked", { what }, roomCode);
    try {
      const started = performance.now();
      const blob = await renderStory(card, {
        wordmark: tc("appName"),
        tagline: tc("tagline"),
        footer: window.location.host,
        dir: locale === "ar" ? "rtl" : "ltr",
      });
      void logClientEvent("share_image_generated", { what, ms: Math.round(performance.now() - started) }, roomCode);
      const file = new File([blob], "sahra.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: t("text") });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }
      setPreview(URL.createObjectURL(blob));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button tone={tone} size={size} onClick={onShare} disabled={busy} data-testid={testId ?? "share"}>
        {busy ? t("preparing") : (label ?? t("button"))}
      </Button>
      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("previewTitle")}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/80 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, not an optimisable asset */}
          <img src={preview} alt={t("previewAlt")} className="max-h-[75vh] w-auto rounded-[20px] ink-border-thick" data-testid="story-preview" />
          <p className="text-center font-semibold text-cream">{t("saveHint")}</p>
          <div className="flex gap-3">
            <a
              href={preview}
              download="sahra.png"
              className="inline-flex min-h-12 items-center rounded-[16px] ink-border bg-sunflower px-5 font-bold text-ink"
            >
              {t("save")}
            </a>
            <Button tone="paper" size="md" onClick={() => setPreview(null)}>
              {tc("close")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
