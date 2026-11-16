"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { countdownSeconds } from "@/lib/game/scoring";
import type { TeamPublicView } from "./game";
import { gameApi } from "./client";

/**
 * The public game state for a room: loaded once, then kept up to date from
 * "state" and "answered" broadcasts. Older states (by server time) are ignored.
 */
export function useRoomGame(code: string) {
  const [game, setGameState] = useState<TeamPublicView | null>(null);
  const [offset, setOffset] = useState(0);
  const latest = useRef(0);

  const setGame = useCallback((g: TeamPublicView) => {
    if (g.serverNow < latest.current) return;
    latest.current = g.serverNow;
    setOffset(g.serverNow - Date.now());
    setGameState(g);
  }, []);

  const refresh = useCallback(async () => {
    const r = await gameApi.get(code);
    if (r.ok) setGame(r.game);
  }, [code, setGame]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAnswered = useCallback((seatId: string, index: number) => {
    setGameState((g) => {
      if (!g || g.phase !== "question" || g.index !== index || g.answered.includes(seatId)) return g;
      return { ...g, answered: [...g.answered, seatId] };
    });
  }, []);

  return { game, setGame, onAnswered, offset, refresh };
}

/** Countdown synced to the server clock; calls onZero once per question when it hits 0. */
export function useQuestionCountdown(startedAt: number | null, offset: number, active: boolean, onZero?: () => void) {
  const [seconds, setSeconds] = useState(15);
  const fired = useRef<number | null>(null);
  const zero = useRef(onZero);
  useEffect(() => {
    zero.current = onZero;
  });
  useEffect(() => {
    if (!active || startedAt === null) return;
    const tick = () => {
      const s = countdownSeconds(Date.now() + offset - startedAt);
      setSeconds(s);
      if (s === 0 && fired.current !== startedAt) {
        fired.current = startedAt;
        zero.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [startedAt, offset, active]);
  return seconds;
}
