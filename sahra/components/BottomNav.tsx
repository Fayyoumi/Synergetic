"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const icons = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  play: (
    <>
      <rect x="3" y="7" width="18" height="11" rx="4" />
      <path d="M8 11v4M6 13h4M15.5 12.5h.01M18 14.5h.01" />
    </>
  ),
  titles: (
    <>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
} as const;

const items = [
  { key: "home", href: "/" },
  { key: "play", href: "/play" },
  { key: "titles", href: "/titles" },
  { key: "profile", href: "/profile" },
] as const;

/** Phone bottom navigation. The active item uses tomato plus aria-current (not colour alone). */
export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="sticky bottom-0 mt-auto border-t-2 border-ink bg-paper">
      <ul className="mx-auto grid max-w-[480px] grid-cols-4">
        {items.map(({ key, href }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                  active ? "font-bold text-tomato" : "text-muted"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {icons[key]}
                </svg>
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
