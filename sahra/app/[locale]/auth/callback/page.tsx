import { setRequestLocale } from "next-intl/server";
import { PhoneShell } from "@/components/PhoneShell";
import { AuthCallback } from "@/components/admin/AuthCallback";

/** Lands here from a sign-in link (magic link / one-time token). */
export default async function CallbackPage({ params }: PageProps<"/[locale]/auth/callback">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <PhoneShell lights={false}>
      <AuthCallback />
    </PhoneShell>
  );
}
