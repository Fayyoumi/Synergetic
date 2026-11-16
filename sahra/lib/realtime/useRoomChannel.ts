"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { roomBroadcast, roomTopic, type PresencePayload, type RoomView } from "@/lib/rooms/api";
import type { TeamPublicView } from "@/lib/rooms/game";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { createTracker, HOST_KEY, observe, statusOf, type ConnStatus, type PresenceTracker } from "./presence";

export type ChannelState = "connecting" | "live" | "reconnecting";

type Options = {
  code: string;
  role: "host" | "player";
  /** Required for players; the presence key. */
  seatId: string | null;
  /** Seat ids to watch (the roster). */
  seatIds: readonly string[];
  onRoom?: (room: Omit<RoomView, "role" | "mySeatId">) => void;
  onRemoved?: (seatId: string) => void;
  onState?: (game: TeamPublicView) => void;
  onAnswered?: (seatId: string, index: number) => void;
  /**
   * Called every time the channel (re)connects. Messages sent while this
   * client wasn't subscribed are lost, so callers re-fetch room and game here.
   */
  onSubscribed?: () => void;
};

const RETRY_MS = [1000, 2000, 4000, 8000, 15000];

function visibility(): PresencePayload["status"] {
  return typeof document !== "undefined" && document.visibilityState === "hidden" ? "away" : "active";
}

/**
 * Joins the room's private channel, publishes this client's presence
 * (active / away) and tracks everyone else's. Reconnects on its own.
 */
export function useRoomChannel({ code, role, seatId, seatIds, onRoom, onRemoved, onState, onAnswered, onSubscribed }: Options) {
  const [snapshot, setSnapshot] = useState<Record<string, ConnStatus>>({});
  const [synced, setSynced] = useState(0);
  const [channelState, setChannelState] = useState<ChannelState>("connecting");
  const [attempt, setAttempt] = useState(0);
  const handlers = useRef({ onRoom, onRemoved, onState, onAnswered, onSubscribed });
  useEffect(() => {
    handlers.current = { onRoom, onRemoved, onState, onAnswered, onSubscribed };
  });

  const presenceKey = role === "host" ? HOST_KEY : seatId;

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase || !presenceKey) return;
    let channel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const payload = (): PresencePayload => ({ v: 1, role, seatId: role === "host" ? null : seatId, status: visibility(), since: Date.now() });

    const onVisibility = () => {
      void channel?.track(payload());
    };
    // Leaving the page: drop presence at once so others see it immediately.
    const onPageHide = () => {
      void channel?.untrack();
    };

    void (async () => {
      await supabase.realtime.setAuth();
      if (disposed) return;
      channel = supabase.channel(roomTopic(code), {
        config: { private: true, presence: { key: presenceKey, enabled: true } },
      });
      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState<PresencePayload>();
          const next: Record<string, ConnStatus> = {};
          for (const [key, list] of Object.entries(state)) next[key] = statusOf(list);
          setSnapshot(next);
          setSynced((n) => n + 1);
        })
        .on("broadcast", { event: "room" }, ({ payload: msg }) => {
          const parsed = roomBroadcast.safeParse(msg);
          if (parsed.success && parsed.data.type === "room") handlers.current.onRoom?.(parsed.data.room);
        })
        .on("broadcast", { event: "removed" }, ({ payload: msg }) => {
          const parsed = roomBroadcast.safeParse(msg);
          if (parsed.success && parsed.data.type === "removed") handlers.current.onRemoved?.(parsed.data.seatId);
        })
        .on("broadcast", { event: "state" }, ({ payload: msg }) => {
          const parsed = roomBroadcast.safeParse(msg);
          if (parsed.success && parsed.data.type === "state") handlers.current.onState?.(parsed.data.game);
        })
        .on("broadcast", { event: "answered" }, ({ payload: msg }) => {
          const parsed = roomBroadcast.safeParse(msg);
          if (parsed.success && parsed.data.type === "answered") handlers.current.onAnswered?.(parsed.data.seatId, parsed.data.index);
        })
        .subscribe((status) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            setChannelState("live");
            void channel!.track(payload());
            handlers.current.onSubscribed?.();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setChannelState("reconnecting");
            // A refused channel can mean we were removed or the room ended: re-check.
            handlers.current.onSubscribed?.();
            if (!retryTimer) {
              retryTimer = setTimeout(() => setAttempt((a) => a + 1), RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]);
            }
          }
        });
    })();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [code, role, seatId, presenceKey, attempt]);

  // Everyone watches the host plus every seat.
  const watched = useMemo(() => [HOST_KEY, ...seatIds], [seatIds]);
  // Start tracking only once our own presence shows up; an earlier snapshot can
  // miss us (and everyone who joined in the same instant) and would trigger
  // false "disconnected / back" notices.
  const tracker = useTrackedPresence(snapshot, watched, presenceKey && snapshot[presenceKey] ? synced : 0);

  return { tracker, channelState };
}

/** Feeds presence snapshots through the pure tracker, keeping its history. */
function useTrackedPresence(snapshot: Record<string, ConnStatus>, watched: readonly string[], synced: number) {
  const [tracker, setTracker] = useState<PresenceTracker>(createTracker);
  const last = useRef<{ snapshot: Record<string, ConnStatus>; watched: readonly string[] } | null>(null);
  useEffect(() => {
    if (synced === 0) return;
    if (last.current && last.current.snapshot === snapshot && last.current.watched === watched) return;
    last.current = { snapshot, watched };
    // Derived from an external feed (presence); runs only when the feed changes.
    setTracker((t) => observe(t, snapshot, watched, Date.now()));
  }, [snapshot, watched, synced]);
  return tracker;
}
