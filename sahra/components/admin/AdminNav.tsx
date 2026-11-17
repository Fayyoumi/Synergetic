"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";

export function AdminNav() {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const router = useRouter();
  const items = [
    { href: "/admin", label: t("navContent") },
    { href: "/admin/pilot", label: t("navPilot") },
  ];
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label={t("title")}>
      {items.map((i) => {
        const active = pathname === i.href;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`min-h-11 rounded-full px-4 py-2 font-bold ${active ? "bg-sunflower ink-border-thick" : "bg-paper ink-border"}`}
          >
            {i.label}
          </Link>
        );
      })}
      <button
        type="button"
        className="min-h-11 rounded-full ink-border bg-paper px-4 font-semibold"
        onClick={async () => {
          await getBrowserSupabase()?.auth.signOut();
          router.replace("/");
        }}
      >
        {t("signOut")}
      </button>
    </nav>
  );
}
