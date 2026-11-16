/** Daily play streak on the profile ("N days in a row"). Pure. */

export const STREAK_TIME_ZONE = "Asia/Amman";

/** Calendar date (YYYY-MM-DD) in Amman for a timestamp. */
export function localDate(at: Date, timeZone = STREAK_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export type DayStreak = { current: number; longest: number; lastPlayedOn: string | null };

/** Updates the streak after a game finished on `today`. */
export function nextDayStreak(prev: DayStreak, today: string): DayStreak {
  let current: number;
  if (prev.lastPlayedOn === null) current = 1;
  else {
    const gap = daysBetween(prev.lastPlayedOn, today);
    if (gap <= 0) current = Math.max(1, prev.current); // same day (or clock skew)
    else if (gap === 1) current = prev.current + 1;
    else current = 1;
  }
  return { current, longest: Math.max(prev.longest, current), lastPlayedOn: today };
}

/** The streak as it stands today: it lapses if the player missed yesterday. */
export function visibleDayStreak(prev: DayStreak, today: string): number {
  if (!prev.lastPlayedOn) return 0;
  return daysBetween(prev.lastPlayedOn, today) <= 1 ? prev.current : 0;
}
