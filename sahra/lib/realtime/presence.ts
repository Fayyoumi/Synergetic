/**
 * Connection tracking for rooms (pure, no I/O).
 *
 * Every client publishes its presence on the room channel: "active" when the
 * app is in the foreground, "away" when the player switched app or locked the
 * screen. A player with no presence at all is "offline" (connection lost).
 * Every client runs this tracker on the same presence feed, so everyone in
 * the room (host screen and phones) sees the same statuses and notices.
 */

export type ConnStatus = "active" | "away" | "offline";

export const HOST_KEY = "host";

export type ConnNotice = {
  id: number;
  /** Seat id, or "host". */
  who: string;
  kind: "away" | "offline" | "back";
  at: number;
};

export type PresenceTracker = {
  statuses: Record<string, ConnStatus>;
  /**
   * Seats that have been online at least once. A new seat can reach the roster
   * before its presence does; until it's seen, it shows as offline without
   * any "disconnected" or "back" notice.
   */
  seen: Record<string, true>;
  /** Times each seat went away or offline since this client started watching. */
  incidents: Record<string, number>;
  notices: ConnNotice[];
  /** False until the first presence sync, so joining doesn't flood notices. */
  ready: boolean;
  nextNoticeId: number;
};

export const MAX_NOTICES = 20;

export function createTracker(): PresenceTracker {
  return { statuses: {}, seen: {}, incidents: {}, notices: [], ready: false, nextNoticeId: 1 };
}

/** One key can have several presences (two tabs): any active one wins. */
export function statusOf(presences: readonly { status: "active" | "away" }[] | undefined): ConnStatus {
  if (!presences || presences.length === 0) return "offline";
  return presences.some((p) => p.status === "active") ? "active" : "away";
}

/**
 * Applies a presence snapshot. `watched` lists the keys to track (current seat
 * ids plus "host"); anyone watched but absent from the snapshot is offline.
 */
export function observe(
  tracker: PresenceTracker,
  snapshot: Readonly<Record<string, ConnStatus>>,
  watched: readonly string[],
  now: number,
): PresenceTracker {
  const statuses: Record<string, ConnStatus> = {};
  const seen = { ...tracker.seen };
  const incidents = { ...tracker.incidents };
  const notices = [...tracker.notices];
  let nextNoticeId = tracker.nextNoticeId;

  for (const who of watched) {
    const next = snapshot[who] ?? "offline";
    const prev = tracker.statuses[who];
    const wasSeen = tracker.seen[who] === true;
    statuses[who] = next;
    if (next !== "offline") seen[who] = true;
    if (!tracker.ready || !wasSeen || prev === undefined || prev === next) continue;

    if (next === "active") {
      notices.push({ id: nextNoticeId++, who, kind: "back", at: now });
    } else {
      // active → away/offline, or away → offline: both are worth showing.
      notices.push({ id: nextNoticeId++, who, kind: next, at: now });
      if (prev === "active") incidents[who] = (incidents[who] ?? 0) + 1;
    }
  }

  return {
    statuses,
    seen,
    incidents,
    notices: notices.slice(-MAX_NOTICES),
    ready: true,
    nextNoticeId,
  };
}

/** Notices younger than `ttlMs`, newest first, for a toast stack. */
export function recentNotices(tracker: PresenceTracker, now: number, ttlMs = 8000): ConnNotice[] {
  return tracker.notices.filter((n) => now - n.at < ttlMs).reverse();
}
