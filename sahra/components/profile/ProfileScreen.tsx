"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Chip } from "@/components/Chip";
import { Kassa } from "@/components/Kassa";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button, Card } from "@/components/ui";
import { formatNumber, toWesternDigits } from "@/lib/i18n/digits";
import { AVATAR_COLOURS, type ProfilePatch, type ProfileView } from "@/lib/profile/api";
import { deleteMyData, fetchProfile, patchProfile } from "@/lib/profile/client";
import { getBrowserSupabase } from "@/lib/supabase/client";

export function ProfileScreen() {
  const t = useTranslations("profile");
  const tb = useTranslations("badges");
  const tc = useTranslations("common");
  const locale = useLocale();
  const fmt = (n: number) => formatNumber(n, locale);
  const num = (n: number | undefined) => (n === undefined ? "…" : fmt(n));

  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    void fetchProfile().then((r) => {
      if (!r.ok) return setFailed(true);
      setProfile(r.profile);
      setName((typed) => typed || (r.profile.displayName ?? ""));
      setBirthYear(r.profile.birthYear ? formatNumber(r.profile.birthYear, locale).replace(/[\u066C,]/g, "") : "");
    });
  }, [locale]);

  const save = async (patch: ProfilePatch) => {
    setStatus(null);
    const r = await patchProfile(patch);
    if (!r.ok) return setStatus(t("saveError"));
    setProfile(r.profile);
    if (patch.display_name !== undefined) setName(r.profile.displayName ?? "");
    setStatus(r.profile.nameFlagged ? t("nameMasked") : t("saved"));
  };

  const onDelete = async () => {
    const r = await deleteMyData();
    if (!r.ok) return setStatus(t("saveError"));
    await getBrowserSupabase()?.auth.signOut();
    setDeleted(true);
  };

  if (deleted) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Kassa mood="sad" size={120} label={tc("kassa")} />
        <p role="status" className="font-semibold">
          {t("deleted")}
        </p>
      </div>
    );
  }
  if (failed) return <p role="alert">{t("unavailable")}</p>;
  const initial = (profile?.displayName ?? t("guest")).trim().charAt(0);

  // The forms render on the server straight away (fast first paint); the stats wait for the profile.
  return (
    <div className="flex flex-col gap-4">
      {/* Same layout while loading ("…" values), so nothing shifts when the profile arrives. */}
      <div className="flex items-center gap-4" aria-busy={!profile}>
        <span
          aria-hidden="true"
          className="display-text flex h-16 w-16 items-center justify-center rounded-full ink-border-thick text-3xl text-ink"
          style={{ background: profile?.avatarColor ?? "transparent" }}
        >
          <span className={profile?.avatarColor === "#2B1B17" ? "text-cream" : ""}>{profile ? initial : ""}</span>
        </span>
        <div>
          <p className="display-text text-3xl">{profile ? profile.displayName || t("guest") : tc("loading")}</p>
          {profile?.isGuest && <p className="text-sm text-muted">{t("guestNote")}</p>}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <div className="flex flex-col-reverse items-center rounded-[18px] ink-border bg-paper py-3">
          <dt className="text-sm">{t("xp")}</dt>
          <dd className="display-text text-2xl" data-testid="profile-xp">
            {num(profile?.totalXp)}
          </dd>
        </div>
        <div className="flex flex-col-reverse items-center rounded-[18px] ink-border bg-paper py-3">
          <dt className="text-sm">{t("dayStreak")}</dt>
          <dd className="display-text text-2xl">{num(profile?.dayStreak)}</dd>
        </div>
        <div className="flex flex-col-reverse items-center rounded-[18px] ink-border bg-paper py-3">
          <dt className="text-sm">{t("gamesPlayed")}</dt>
          <dd className="display-text text-2xl" data-testid="profile-games">
            {num(profile?.gamesPlayed)}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted">{t("longestStreak", { days: num(profile?.longestStreak) })}</p>

      <section aria-labelledby="badges-h" className="flex flex-col gap-2">
        <h2 id="badges-h" className="display-text text-2xl">
          {t("badges")}
        </h2>
        {profile?.badges.length ? (
          <ul className="flex flex-wrap gap-2">
            {profile.badges.map((b) => (
              <li key={b}>
                <Chip tone="sunflower">{tb(b)}</Chip>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{profile ? t("noBadges") : "…"}</p>
        )}
      </section>

      <Card className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void save({ display_name: name.trim() });
          }}
        >
          <label htmlFor="name" className="font-bold">
            {t("name")}
          </label>
          <div className="flex gap-2">
            <input
              id="name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className="min-h-12 min-w-0 flex-1 rounded-[14px] ink-border bg-cream px-3"
            />
            <Button type="submit" tone="sunflower" size="md">
              {tc("save")}
            </Button>
          </div>
        </form>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-bold">{t("avatar")}</legend>
          <div className="flex flex-wrap gap-3">
            {AVATAR_COLOURS.map((c, i) => (
              <button
                key={c}
                type="button"
                aria-label={t("avatarOption", { n: fmt(i + 1) })}
                aria-pressed={profile?.avatarColor === c}
                onClick={() => void save({ avatar_color: c })}
                className={`h-11 w-11 rounded-full ${profile?.avatarColor === c ? "ink-border-thick" : "ink-border"}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </fieldset>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const y = Number(toWesternDigits(birthYear.trim()));
            void save({ birth_year: birthYear.trim() ? y : null });
          }}
        >
          <label htmlFor="birth" className="font-bold">
            {t("birthYear")}
          </label>
          <p id="birth-help" className="text-sm text-muted">
            {t("birthYearHelp")}
          </p>
          <div className="flex gap-2">
            <input
              id="birth"
              inputMode="numeric"
              aria-describedby="birth-help"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              placeholder={t("birthYearPlaceholder")}
              className="min-h-12 min-w-0 flex-1 rounded-[14px] ink-border bg-cream px-3"
            />
            <Button type="submit" tone="sunflower" size="md">
              {tc("save")}
            </Button>
          </div>
          {profile?.isMinor && <p className="text-sm font-semibold">{t("minorNote")}</p>}
        </form>

        <div className="flex items-center justify-between">
          <span className="font-bold">{t("language")}</span>
          <LanguageToggle />
        </div>
        {status && (
          <p role="status" className="font-semibold">
            {status}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="display-text text-2xl">{t("deleteTitle")}</h2>
        <p className="text-muted">{t("deleteBody")}</p>
        {confirmDelete ? (
          <div className="flex gap-2">
            <Button tone="tomato" size="md" onClick={onDelete} data-testid="confirm-delete">
              {t("deleteConfirm")}
            </Button>
            <Button tone="paper" size="md" onClick={() => setConfirmDelete(false)}>
              {tc("cancel")}
            </Button>
          </div>
        ) : (
          <Button tone="paper" size="md" className="self-start" onClick={() => setConfirmDelete(true)}>
            {t("deleteTitle")}
          </Button>
        )}
      </Card>
    </div>
  );
}
