import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { IBM_Plex_Sans_Arabic, Lalezar } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { dirFor, routing } from "@/i18n/routing";
import { AuthBootstrap } from "@/components/AuthBootstrap";
import "../globals.css";

const lalezar = Lalezar({
  weight: "400",
  subsets: ["arabic", "latin"],
  variable: "--font-lalezar",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  weight: ["400", "600", "700"],
  subsets: ["arabic", "latin"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    applicationName: t("title"),
    appleWebApp: { capable: true, title: t("title"), statusBarStyle: "default" },
    icons: {
      icon: [
        { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#FFF4DE",
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      className={`${lalezar.variable} ${plexArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <AuthBootstrap />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
