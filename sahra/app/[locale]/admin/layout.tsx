import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminNav } from "@/components/admin/AdminNav";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { robots: { index: false } };

/** Admin area: only for signed-in admins (profiles.is_admin). The API routes check again. */
export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");
  const db = await getServerSupabase();
  const { data: auth } = db ? await db.auth.getUser() : { data: { user: null } };
  let isAdmin = false;
  if (db && auth.user) {
    const { data } = await db.from("profiles").select("is_admin").eq("id", auth.user.id).maybeSingle<{ is_admin: boolean }>();
    isAdmin = data?.is_admin === true;
  }
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="display-text text-4xl">{t("title")}</h1>
        {isAdmin && <AdminNav />}
      </header>
      {isAdmin ? children : <AdminLogin signedInNotAdmin={!!auth.user && !auth.user.is_anonymous} />}
    </main>
  );
}
