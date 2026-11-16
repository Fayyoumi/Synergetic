import { z } from "zod";

export const AVATAR_COLOURS = ["#E8412C", "#FFC93C", "#12A6A0", "#2E8B57", "#2B1B17", "#D9541E"] as const;

const currentYear = new Date().getFullYear();

export const profilePatch = z
  .object({
    display_name: z.string().trim().min(1).max(40).optional(),
    avatar_color: z.enum(AVATAR_COLOURS).optional(),
    locale: z.enum(["ar", "en"]).optional(),
    birth_year: z.number().int().min(1900).max(currentYear).nullable().optional(),
  })
  .strict();
export type ProfilePatch = z.infer<typeof profilePatch>;

export type ProfileView = {
  id: string;
  isGuest: boolean;
  displayName: string | null;
  nameFlagged: boolean;
  avatarColor: string;
  locale: "ar" | "en";
  birthYear: number | null;
  /** Under 18 => Family mood only and no public leagues. */
  isMinor: boolean | null;
  totalXp: number;
  dayStreak: number;
  longestStreak: number;
  gamesPlayed: number;
  badges: string[];
  playedToday: boolean;
  dailyDoneToday: boolean;
};

/**
 * With only a birth year we can't know if an 18th birthday has passed, so we
 * err on the side of kids: anyone who turns 18 this calendar year still counts
 * as under 18 until the next year. null = unknown (not answered yet).
 */
export function isMinor(birthYear: number | null, now = new Date()): boolean | null {
  if (birthYear == null) return null;
  return now.getFullYear() - birthYear <= 18;
}
