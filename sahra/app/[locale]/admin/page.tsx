import { setRequestLocale } from "next-intl/server";
import { AdminContent } from "@/components/admin/AdminContent";

export default async function AdminPage({ params }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AdminContent />;
}
