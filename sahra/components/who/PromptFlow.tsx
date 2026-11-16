"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Kassa } from "@/components/Kassa";
import { Button, SpeechBubble } from "@/components/ui";
import { formatNumber } from "@/lib/i18n/digits";
import type { PromptItem } from "@/lib/rooms/game";

/**
 * Secret prompts, one at a time: textarea + "send" / "skip", a progress bar,
 * and Kassa promising to keep the secret. Answers go to the server only.
 */
export function PromptFlow({ code, onDone }: { code: string; onDone?: () => void }) {
  const t = useTranslations("prompts");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [prompts, setPrompts] = useState<PromptItem[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [masked, setMasked] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch(`/api/rooms/${code}/prompts`, { cache: "no-store" })
      .then((r) => r.json())
      .then((r) => {
        if (!alive) return;
        if (r.ok) setPrompts(r.prompts);
        else setError(true);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [code]);

  if (error) return <p role="alert">{tc("retry")}</p>;
  if (!prompts) return <p className="text-muted">{tc("loading")}</p>;
  if (!prompts.length) return <p>{t("none")}</p>;

  const current = prompts.find((p) => p.status === "pending");
  const done = prompts.filter((p) => p.status !== "pending").length;
  const total = prompts.length;

  const submit = async (skip: boolean) => {
    if (!current) return;
    setBusy(true);
    setMasked(false);
    const r = await fetch(`/api/rooms/${code}/prompts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ promptId: current.id, answer: skip ? undefined : text, skip }),
    })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (!r?.ok) return setError(true);
    setPrompts(r.prompts);
    setMasked(r.masked);
    setText("");
    if (!r.prompts.some((p: PromptItem) => p.status === "pending")) onDone?.();
  };

  return (
    <div className="-mx-5 flex flex-1 flex-col gap-4 bg-chair px-5 py-4" data-testid="prompt-flow">
      <div className="flex items-center gap-3">
        <span className="display-text rounded-full ink-border bg-cream px-4 py-1 text-xl" data-testid="prompt-progress">
          {t("progress", { n: formatNumber(Math.min(done + (current ? 1 : 0), total), locale), total: formatNumber(total, locale) })}
        </span>
      </div>
      <div className="flex gap-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={t("title")}>
        {prompts.map((p) => (
          <span key={p.id} className={`h-3 flex-1 rounded-full ink-border ${p.status === "pending" ? "bg-cream" : "bg-ink"}`} />
        ))}
      </div>

      {current ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void submit(false);
          }}
        >
          <div className="flex flex-col gap-3 rounded-[24px] ink-border-thick bg-cream p-5">
            <p className="text-sm font-semibold">{t("secretLabel")}</p>
            <h2 className="display-text text-3xl leading-snug" data-testid="prompt-text" lang="ar" dir="rtl">
              {current.text}
            </h2>
            <label htmlFor="secret-answer" className="font-semibold">
              {t("answerLabel")}
            </label>
            <textarea
              id="secret-answer"
              value={text}
              maxLength={280}
              rows={3}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("placeholder")}
              className="min-h-24 rounded-[18px] ink-border bg-paper p-3 text-lg"
            />
          </div>
          {masked && <p role="status" className="font-bold">{t("masked")}</p>}
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <Button tone="paper" size="lg" onClick={() => void submit(true)} disabled={busy} data-testid="prompt-skip">
              {t("skip")}
            </Button>
            <Button type="submit" tone="sunflower" size="lg" disabled={busy || !text.trim()} data-testid="prompt-send">
              {t("send")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2 rounded-[24px] ink-border-thick bg-cream p-5" data-testid="prompts-done">
          <h2 className="display-text text-3xl">{t("doneTitle")}</h2>
          <p>{t("doneBody")}</p>
        </div>
      )}

      <div className="mt-auto flex items-end gap-3">
        <SpeechBubble className="flex-1">{done >= total - 1 && current ? t("kassaLast") : t("kassaSafe")}</SpeechBubble>
        <Kassa mood="cheeky" size={90} className="shrink-0" />
      </div>
    </div>
  );
}
