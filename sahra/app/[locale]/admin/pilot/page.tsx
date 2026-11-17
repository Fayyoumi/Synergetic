import { setRequestLocale } from "next-intl/server";
import { PilotDashboard } from "@/components/admin/PilotDashboard";

export default async function PilotPage({ params }: PageProps<"/[locale]/admin/pilot">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PilotDashboard />;
}
