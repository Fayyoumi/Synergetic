"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { RoomGame } from "@/lib/rooms/api";
import { roomsApi } from "@/lib/rooms/client";

const GAMES: { game: RoomGame; key: "teamTrivia" | "charades" | "whoAmongUs"; tone: string }[] = [
  { game: "trivia_team", key: "teamTrivia", tone: "bg-sunflower text-ink" },
  { game: "charades", key: "charades", tone: "bg-tomato text-cream" },
  { game: "who_among_us", key: "whoAmongUs", tone: "bg-chair text-ink" },
];

/** Picking a group game creates a room and opens the host screen on this device. */
export function GroupGameCards() {
  const t = useTranslations("play");
  const te = useTranslations("errors");
  const router = useRouter();
  const [busy, setBusy] = useState<RoomGame | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = async (game: RoomGame) => {
    setBusy(game);
    setError(null);
    const r = await roomsApi.create(game);
    if (!r.ok) {
      setBusy(null);
      return setError(r.error === "unconfigured" ? te("unconfigured") : te("generic"));
    }
    router.push(`/host/${r.room.code}`);
  };

  return (
    <>
      {GAMES.map(({ game, key, tone }) => (
        <button
          key={game}
          type="button"
          disabled={busy !== null}
          onClick={() => void create(game)}
          className={`flex items-center gap-3 rounded-[20px] ink-border p-4 text-start disabled:opacity-60 ${tone}`}
          data-testid={`create-${game}`}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="display-text text-2xl">{t(`games.${key}.name`)}</span>
            <span className="text-sm">{busy === game ? t("creating") : t(`games.${key}.meta`)}</span>
          </span>
          <span className="shrink-0 rounded-full ink-border bg-cream px-3 py-1 text-sm font-bold text-ink">{t(`games.${key}.tag`)}</span>
        </button>
      ))}
      {error && (
        <p role="alert" className="font-bold text-tomato">
          {error}
        </p>
      )}
    </>
  );
}
