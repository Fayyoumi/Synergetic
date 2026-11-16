"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useLocale, useTranslations } from "next-intl";
import { Kassa } from "@/components/Kassa";
import { Button, ButtonLink, SpeechBubble } from "@/components/ui";
import { WeddingLights } from "@/components/WeddingLights";
import { formatNumber, roomCode } from "@/lib/i18n/digits";
import { useRoomChannel } from "@/lib/realtime/useRoomChannel";
import { ROOM_GAMES, type RoomErrorCode, type RoomGame, type RoomMood, type RoomView } from "@/lib/rooms/api";
import { roomsApi } from "@/lib/rooms/client";
import { MoodPicker } from "./MoodPicker";
import { ConnToasts, PlayerList, SelfConnBanner } from "./Presence";

/** TV / laptop host screen: QR + code, live roster with connection status, game and mood. */
export function HostLobby({ code }: { code: string }) {
  const t = useTranslations("host");
  const tj = useTranslations("join");
  const tl = useTranslations("lobby");
  const tm = useTranslations("moods");
  const tc = useTranslations("common");
  const tconn = useTranslations("conn");
  const locale = useLocale();

  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<RoomErrorCode | null>(null);
  const [moodError, setMoodError] = useState<string | null>(null);
  const [qr, setQr] = useState<string>("");
  const [joinUrl, setJoinUrl] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    let alive = true;
    void roomsApi.get(code).then((r) => {
      if (!alive) return;
      if (r.ok) setRoom(r.room);
      else setError(r.error);
    });
    const url = `${window.location.origin}/join/${code}`;
    void QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#2B1B17", light: "#FFFFFF" } }).then((svg) => {
      if (!alive) return;
      setQr(svg);
      setJoinUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [code]);

  const seatIds = useMemo(() => room?.seats.map((s) => s.id) ?? [], [room]);
  const onRoom = useCallback((r: Omit<RoomView, "role" | "mySeatId">) => setRoom((prev) => (prev ? { ...prev, ...r } : prev)), []);
  const { tracker, channelState } = useRoomChannel({
    code,
    role: "host",
    seatId: null,
    seatIds,
    onRoom,
  });

  const act = async (action: Parameters<typeof roomsApi.host>[1]) => {
    const r = await roomsApi.host(code, action);
    if (r.ok) setRoom(r.room);
    return r;
  };

  const onMood = async (mood: RoomMood, roastConfirmed: boolean) => {
    setMoodError(null);
    const r = await act({ action: "mood", mood, roastConfirmed });
    if (!r.ok) {
      setMoodError(r.error === "roast_unconfirmed" ? tm("roastNeedsConfirm") : r.error === "minor_seated" ? tm("minorSeated") : null);
    }
  };

  if (error === "not_host" || room?.role === "player" || room?.role === "visitor") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
        <Kassa mood="shocked" size={160} label={tc("kassa")} />
        <p className="display-text text-4xl">{t("notHost")}</p>
        <ButtonLink href={`/join/${code}`} tone="sunflower" size="xl">
          {t("joinInstead")}
        </ButtonLink>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
        <Kassa mood="sad" size={160} label={tc("kassa")} />
        <p className="display-text text-4xl">{tj(`errors.${error === "ended" || error === "not_found" ? error : "generic"}`)}</p>
        <ButtonLink href="/play/group" tone="sunflower" size="lg">
          {tc("back")}
        </ButtonLink>
      </div>
    );
  }
  if (!room) return <p className="p-10 text-center text-2xl text-muted">{tc("loading")}</p>;

  if (room.status === "ended") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
        <Kassa mood="laughing" size={180} label={tc("kassa")} />
        <p className="display-text text-5xl">{tl("endedTitle")}</p>
        <ButtonLink href="/" tone="sunflower" size="xl">
          {tl("backHome")}
        </ButtonLink>
      </div>
    );
  }

  const count = formatNumber(room.seats.length, locale);
  const displayCode = roomCode(room.code);

  return (
    <div className="flex min-h-screen flex-col">
      <WeddingLights variant="wide" />
      <ConnToasts tracker={tracker} seats={room.seats} large />
      <div className="grid flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 px-10 pb-8">
        {/* Join panel */}
        <section className="flex flex-col items-center gap-4 rounded-[28px] ink-border-thick bg-paper p-8 text-center">
          <h2 className="display-text text-4xl">{t("scanToJoin")}</h2>
          <div
            className="aspect-square w-full max-w-[340px] rounded-[20px] ink-border bg-paper p-3 [&_svg]:h-full [&_svg]:w-full"
            role="img"
            aria-label={t("scanToJoin")}
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <p className="text-xl font-semibold">{t("code")}</p>
          <p
            dir="ltr"
            lang="en"
            className="display-text text-8xl tracking-[0.2em] text-tomato"
            aria-label={t("codeAria", { code: displayCode.split("").join(" ") })}
            data-testid="room-code"
          >
            {displayCode}
          </p>
          <p className="text-lg text-muted" dir="auto">
            {t("orGoTo", { url: joinUrl.replace(/^https?:\/\//, "").replace(/\/join\/\d+$/, "/join") })}
          </p>
        </section>

        {/* Room panel */}
        <section className="flex min-w-0 flex-col gap-6">
          <div className="flex items-end gap-4">
            <Kassa mood="cheeky" size={130} label={tc("kassa")} className="shrink-0" />
            <SpeechBubble className="text-2xl">{t("kassaWelcome")}</SpeechBubble>
          </div>
          <SelfConnBanner state={channelState} />

          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="display-text text-4xl">{t("players", { count })}</h2>
              <p className="text-lg text-muted">{tconn("fairPlay")}</p>
            </div>
            {room.seats.length ? (
              <PlayerList
                seats={room.seats}
                tracker={tracker}
                showIncidents
                large
                onRemove={(s) => void act({ action: "remove", seatId: s.id })}
              />
            ) : (
              <p className="rounded-[20px] ink-border bg-paper p-6 text-2xl">{tl("noPlayers")}</p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="display-text text-3xl">{t("chooseGame")}</h2>
            <div className="grid grid-cols-3 gap-3" role="radiogroup">
              {ROOM_GAMES.map((g: RoomGame) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={room.game === g}
                  onClick={() => void act({ action: "game", game: g })}
                  className={`display-text min-h-16 rounded-[20px] px-3 text-2xl ${
                    room.game === g ? "bg-sunflower ink-border-thick" : "bg-paper ink-border"
                  }`}
                >
                  {t(`games.${g}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="display-text text-3xl">{t("chooseMood")}</h2>
            <MoodPicker mood={room.mood} onChange={onMood} error={moodError} />
          </div>

          <div className="mt-auto flex items-center gap-4">
            <Button tone="tomato" size="xl" className="flex-1" disabled title={t("startSoon")}>
              {t("start")}
            </Button>
            {confirmEnd ? (
              <>
                <Button tone="ink" size="lg" onClick={() => void act({ action: "end" })}>
                  {t("end")}
                </Button>
                <Button tone="paper" size="lg" onClick={() => setConfirmEnd(false)}>
                  {tc("cancel")}
                </Button>
              </>
            ) : (
              <Button tone="paper" size="lg" onClick={() => setConfirmEnd(true)}>
                {t("end")}
              </Button>
            )}
          </div>
          <p className="text-lg text-muted">{t("startSoon")}</p>
        </section>
      </div>
    </div>
  );
}
