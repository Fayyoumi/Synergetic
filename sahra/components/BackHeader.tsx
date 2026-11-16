"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const chevron = (
  // Points "back" in LTR (left); flipped in RTL so it points right.
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="flip-rtl">
    <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const circle = "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-paper ink-border";

/** Title row with a round back button (link or action) and an optional trailing slot. */
export function BackHeader({
  title,
  href,
  onBack,
  trailing,
}: {
  title: ReactNode;
  href?: string;
  onBack?: () => void;
  trailing?: ReactNode;
}) {
  const t = useTranslations("common");
  return (
    <header className="flex items-center gap-3 pt-2">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label={t("back")} className={circle}>
          {chevron}
        </button>
      ) : (
        <Link href={href ?? "/"} aria-label={t("back")} className={circle}>
          {chevron}
        </Link>
      )}
      <h1 className="display-text min-w-0 flex-1 truncate text-3xl">{title}</h1>
      {trailing}
    </header>
  );
}
