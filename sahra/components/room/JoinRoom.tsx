"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Kassa } from "@/components/Kassa";
import { Chip } from "@/components/Chip";
import { Button, ButtonLink, Card, SpeechBubble } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { formatNumber, roomCode } from "@/lib/i18n/digits";
import { AVATAR_COLOURS } from "@/lib/profile/api";
import { fetchProfile } from "@/lib/profile/client";
import { useRoomChannel } from "@/lib/realtime/useRoomChannel";
import type { RoomErrorCode, RoomView } from "@/lib/rooms/api";
import { hasConsented, rememberConsent, roomsApi } from "@/lib/rooms/client";
import { ConnBadge, ConnToasts, PlayerList, SelfConnBanner } from "./Presence";

const JOIN_ERRORS = new Set(["not_found", "ended", "full", "minor_mood", "removed", "consent_required"]);

/** Phone: join form (name, colour, consent) then the lobby, which becomes the game controller. */
export function JoinRoom({ code }: { code: string }) {
  const t = useTranslations("join");
  const tc = useTranslations("common");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<RoomErrorCode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void roomsApi.get(code).then((r) => {
      if (!alive) return;
      if (r.ok) setRoom(r.room);
      else setError(r.error);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [code]);

  if (loading) return <p className="py-10 text-center text-muted">{tc("loading")}</p>;
  if (room && room.mySeatId && room.status !== "ended") return <PlayerLobby initial={room} />;
  if (error && error !== "consent_required") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Kassa mood="sad" size={120} label={tc("kassa")} />
        <p role="alert" className="font-semibold">
          {t(`errors.${JOIN_ERRORS.has(error) ? error : "generic"}`)}
        </p>
        <ButtonLink href="/join" tone="sunflower" size="md">
          {t("title")}
        </ButtonLink>
      </div>
    );
  }
  if (room?.status === "ended") {
    return <p role="alert">{t("errors.ended")}</p>;
  }
  return <JoinForm code={code} onJoined={setRoom} />;
}

function JoinForm({ code, onJoined }: { code: string; onJoined: (room: RoomView) => void }) {
  const t = useTranslations("join");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [colour, setColour] = useState<string>(AVATAR_COLOURS[2]);
  const [consent, setConsent] = useState(false);
  const [askConsent, setAskConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from the profile; skip the consent box if this device already agreed.
  useEffect(() => {
    let alive = true;
    void fetchProfile().then((r) => {
      if (!alive) return;
      if (r.ok) {
        if (r.profile.displayName) setName(r.profile.displayName.slice(0, 24));
        setColour(r.profile.avatarColor);
      }
      if (hasConsented()) {
        setConsent(true);
        setAskConsent(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) return setError(t("consentRequired"));
    setBusy(true);
    setError(null);
    const r = await roomsApi.join(code, { name: name.trim(), avatarColor: colour, consent });
    setBusy(false);
    if (!r.ok) return setError(t(`errors.${JOIN_ERRORS.has(r.error) ? r.error : "generic"}`));
    rememberConsent();
    onJoined(r.room);
  };

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
      <p className="display-text text-center text-6xl tracking-[0.15em] text-tomato" dir="ltr" lang="en">
        {roomCode(code)}
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="player-name" className="font-bold">
          {t("nameLabel")}
        </label>
        <input
          id="player-name"
          required
          maxLength={24}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          autoComplete="nickname"
          className="min-h-12 rounded-[14px] ink-border bg-paper px-3 text-lg"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-bold">{t("colourLabel")}</legend>
        <div className="flex flex-wrap gap-3">
          {AVATAR_COLOURS.map((c, i) => (
            <button
              key={c}
              type="button"
              aria-label={t("colourOption", { n: formatNumber(i + 1, locale) })}
              aria-pressed={colour === c}
              onClick={() => setColour(c)}
              className={`h-11 w-11 rounded-full ${colour === c ? "ink-border-thick" : "ink-border"}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </fieldset>
      {askConsent && (
        <Card className="flex flex-col gap-3" tone="paper">
          <h2 className="display-text text-2xl">{t("consentTitle")}</h2>
          {/* The consent text is always shown in both languages, each in its own direction. */}
          <p lang="ar" dir="rtl" className="leading-relaxed">
            {t("consentAr")}
          </p>
          <p lang="en" dir="ltr" className="leading-relaxed text-muted">
            {t("consentEn")}
          </p>
          <label className="flex min-h-11 items-center gap-3 font-bold">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="h-6 w-6 accent-[var(--chair)]"
              data-testid="consent"
            />
            {t("consentCheck")}
          </label>
          <Link href="/privacy" className="text-sm underline">
            {t("privacyLink")}
          </Link>
        </Card>
      )}
      {error && (
        <p role="alert" className="font-bold text-tomato">
          {error}
        </p>
      )}
      <div className="mt-auto">
        <Button type="submit" tone="tomato" size="xl" block disabled={busy || !name.trim()}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

function PlayerLobby({ initial }: { initial: RoomView }) {
  const t = useTranslations("lobby");
  const tm = useTranslations("moods");
  const th = useTranslations("host");
  const tc = useTranslations("common");
  const tconn = useTranslations("conn");
  const locale = useLocale();
  const [room, setRoom] = useState(initial);
  const [removed, setRemoved] = useState(false);

  const seatIds = useMemo(() => room.seats.map((s) => s.id), [room.seats]);
  const onRoom = useCallback((r: Omit<RoomView, "role" | "mySeatId">) => setRoom((prev) => ({ ...prev, ...r })), []);
  const onRemoved = useCallback(
    (seatId: string) => {
      if (seatId === initial.mySeatId) setRemoved(true);
    },
    [initial.mySeatId],
  );
  const { tracker, channelState } = useRoomChannel({
    code: room.code,
    role: "player",
    seatId: initial.mySeatId,
    seatIds,
    onRoom,
    onRemoved,
  });

  if (removed || room.status === "ended") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Kassa mood={removed ? "sad" : "laughing"} size={130} label={tc("kassa")} />
        <h2 className="display-text text-3xl">{removed ? t("removedTitle") : t("endedTitle")}</h2>
        <p>{removed ? t("removedBody") : t("endedBody")}</p>
        <ButtonLink href="/" tone="sunflower" size="md">
          {t("backHome")}
        </ButtonLink>
      </div>
    );
  }

  const me = room.seats.find((s) => s.id === initial.mySeatId);
  const hostStatus = tracker.statuses.host ?? "offline";

  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="player-lobby">
      <ConnToasts tracker={tracker} seats={room.seats} />
      <SelfConnBanner state={channelState} />
      <div className="flex items-end gap-3">
        <Kassa mood="cheeky" size={90} label={tc("kassa")} className="shrink-0" />
        <SpeechBubble>
          {t("youreIn", { name: me?.name ?? "" })} {t("waiting")}
        </SpeechBubble>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="sunflower">{t("mood", { mood: tm(room.mood) })}</Chip>
        {room.game && <Chip tone="paper">{t("game", { game: th(`games.${room.game}`) })}</Chip>}
        <span className="inline-flex items-center gap-2 text-sm font-semibold" data-testid="host-status" data-status={hostStatus}>
          {tconn("host")}
          <ConnBadge status={hostStatus} />
        </span>
      </div>
      <h2 className="display-text text-2xl">{t("players", { count: formatNumber(room.seats.length, locale) })}</h2>
      <PlayerList seats={room.seats} tracker={tracker} mySeatId={initial.mySeatId} />
      <p className="text-sm text-muted">{tconn("fairPlay")}</p>
    </div>
  );
}
