import { getTranslations } from "next-intl/server";
import { PhoneShell } from "./PhoneShell";
import { ButtonLink } from "./ui";

export async function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const t = await getTranslations("legal");
  const c = await getTranslations("common");
  return (
    <PhoneShell>
      <h1 className="display-text text-4xl">{t(kind === "privacy" ? "privacyTitle" : "termsTitle")}</h1>
      <p className="rounded-[16px] ink-border bg-sunflower px-4 py-2 font-bold">{t("draftNotice")}</p>
      <p className="leading-loose">{t(kind === "privacy" ? "privacyBody" : "termsBody")}</p>
      <ButtonLink href="/" tone="paper" size="md" className="self-start">
        {c("home")}
      </ButtonLink>
    </PhoneShell>
  );
}
