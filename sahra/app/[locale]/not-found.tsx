import { getTranslations } from "next-intl/server";
import { Kassa } from "@/components/Kassa";
import { PhoneShell } from "@/components/PhoneShell";
import { ButtonLink } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  const c = await getTranslations("common");
  return (
    <PhoneShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Kassa mood="sad" size={140} label={c("kassa")} />
        <h1 className="display-text text-4xl">{t("title")}</h1>
        <p className="text-muted">{t("body")}</p>
        <ButtonLink href="/" tone="sunflower" size="lg">
          {t("cta")}
        </ButtonLink>
      </div>
    </PhoneShell>
  );
}
