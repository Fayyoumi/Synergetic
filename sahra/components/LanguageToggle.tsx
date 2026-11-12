"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LanguageToggle({ className }: { className?: string }) {
  const t = useTranslations("lang");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const next = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      lang={next}
      aria-label={t("switchToAria")}
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          router.replace(pathname, { locale: next });
        })
      }
      className={`min-h-11 min-w-11 px-3 rounded-full bg-paper ink-border text-sm font-bold ${className ?? ""}`}
    >
      {t("switchTo")}
    </button>
  );
}
