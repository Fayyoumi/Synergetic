"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/lib/i18n/digits";
import { HOST_KEY, recentNotices, type ConnStatus, type PresenceTracker } from "@/lib/realtime/presence";
import type { ChannelState } from "@/lib/realtime/useRoomChannel";
import type { Seat } from "@/lib/rooms/api";

const dot: Record<ConnStatus, string> = {
  active: "bg-chair",
  away: "bg-sunflower",
  offline: "bg-tomato",
};

/** Connection status as a coloured dot plus a text label (never colour alone). */
export function ConnBadge({ status, large }: { status: ConnStatus; large?: boolean }) {
  const t = useTranslations("conn");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ink-border bg-paper px-2 py-0.5 font-semibold ${large ? "text-lg" : "text-xs"}`}
      data-status={status}
    >
      <span aria-hidden="true" className={`inline-block rounded-full ink-border ${dot[status]} ${large ? "h-3.5 w-3.5" : "h-2.5 w-2.5"}`} />
      {t(status)}
    </span>
  );
}

/** Player roster with live connection status (and away counts on the host screen). */
export function PlayerList({
  seats,
  tracker,
  mySeatId,
  showIncidents,
  large,
  onRemove,
  renderExtra,
}: {
  seats: Seat[];
  tracker: PresenceTracker;
  mySeatId?: string | null;
  showIncidents?: boolean;
  large?: boolean;
  onRemove?: (seat: Seat) => void;
  /** Extra control per seat (e.g. the host's team switch). */
  renderExtra?: (seat: Seat) => React.ReactNode;
}) {
  const t = useTranslations("lobby");
  const tc = useTranslations("conn");
  const th = useTranslations("host");
  const locale = useLocale();
  return (
    <ul className={`grid gap-2 ${large ? "grid-cols-2 xl:grid-cols-3" : "grid-cols-1"}`} data-testid="player-list">
      {seats.map((s) => {
        const status = tracker.statuses[s.id] ?? "offline";
        const incidents = tracker.incidents[s.id] ?? 0;
        return (
          <li
            key={s.id}
            data-testid={`seat-${s.name}`}
            data-status={status}
            className={`flex items-center gap-3 rounded-[18px] ink-border bg-paper ${large ? "p-3" : "px-3 py-2"} ${
              status === "active" ? "" : "border-dashed"
            }`}
          >
            <span
              aria-hidden="true"
              className={`display-text flex shrink-0 items-center justify-center rounded-full ink-border ${large ? "h-12 w-12 text-2xl" : "h-9 w-9 text-lg"}`}
              style={{ background: s.color, color: s.color === "#2B1B17" ? "var(--cream)" : "var(--ink)" }}
            >
              {s.name.trim().charAt(0)}
            </span>
            <span className={`min-w-0 flex-1 truncate font-bold ${large ? "text-2xl" : ""}`}>
              {s.name}
              {s.id === mySeatId && <span className="ms-2 text-sm font-semibold text-muted">({t("you")})</span>}
            </span>
            <span className="flex flex-col items-end gap-1">
              <ConnBadge status={status} large={large} />
              {showIncidents && incidents > 0 && (
                <span className="text-xs font-bold text-tomato" data-testid="incidents">
                  {incidents === 1 ? tc("incidentsOne") : tc("incidents", { count: formatNumber(incidents, locale) })}
                </span>
              )}
            </span>
            {renderExtra?.(s)}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(s)}
                aria-label={th("remove", { name: s.name })}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full ink-border bg-cream"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Everyone sees when anyone leaves the app, disconnects or comes back.
 * A polite live region announces it to screen readers too.
 */
export function ConnToasts({ tracker, seats, large }: { tracker: PresenceTracker; seats: Seat[]; large?: boolean }) {
  const t = useTranslations("conn");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const nameOf = (who: string) => (who === HOST_KEY ? t("host") : (seats.find((s) => s.id === who)?.name ?? "?"));
  const notices = recentNotices(tracker, now);
  return (
    <div
      aria-live="polite"
      // Host screen: top centre. Phones: bottom, clear of the header and back button.
      className={`pointer-events-none fixed inset-x-0 z-50 mx-auto flex gap-2 px-4 ${
        large ? "top-2 max-w-3xl flex-col items-center" : "bottom-4 max-w-[480px] flex-col-reverse items-center"
      }`}
      data-testid="conn-toasts"
    >
      {notices.slice(0, 3).map((n) => (
        <p
          key={n.id}
          className={`rounded-full ink-border-thick px-4 py-2 font-bold ${large ? "text-2xl" : ""} ${
            n.kind === "back" ? "bg-chair text-ink" : n.kind === "away" ? "bg-sunflower text-ink" : "bg-tomato text-cream"
          }`}
        >
          {n.kind === "back"
            ? t("noticeBack", { name: nameOf(n.who) })
            : n.kind === "away"
              ? t("noticeAway", { name: nameOf(n.who) })
              : t("noticeOffline", { name: nameOf(n.who) })}
        </p>
      ))}
    </div>
  );
}

/** This client's own connection: shown when it isn't live. */
export function SelfConnBanner({ state }: { state: ChannelState }) {
  const t = useTranslations("conn");
  if (state === "live") return null;
  return (
    <p role="status" className="rounded-[16px] ink-border bg-tomato px-4 py-2 font-bold text-cream" data-testid="self-conn">
      {state === "connecting" ? t("selfConnecting") : t("selfReconnecting")}
    </p>
  );
}
