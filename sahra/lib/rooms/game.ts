import { z } from "zod";
import type { Team } from "@/lib/game/teamTrivia";

/** Public team-trivia state, as broadcast to the host screen and phones. Never contains an answer before the reveal. */
export type TeamPublicView = {
  v: 1;
  kind: "trivia_team";
  phase: "lobby" | "question" | "reveal" | "scoreboard" | "final";
  index: number;
  total: number;
  settings: { count: number; difficulty: "easy" | "mixed" | "hard" };
  question: {
    category: string;
    difficulty: "easy" | "medium" | "hard" | "legend";
    lang: "ar" | "en";
    question: string;
    /** In display order (the same for everyone). */
    options: string[];
    startedAt: number;
  } | null;
  /** Seats that answered the current question (not what they answered). */
  answered: string[];
  players: Record<string, { team: Team; points: number }>;
  teamScores: Record<Team, number>;
  reveal: {
    correctChoice: number;
    perSeat: Record<string, { choice: number | null; correct: boolean; points: number; base: number; speed: number; streak: number }>;
    teamPoints: Record<Team, number>;
  } | null;
  final: {
    winner: Team | null;
    standings: { seatId: string; team: Team; points: number; correct: number; bestStreak: number; xp: number; badges: string[] }[];
  } | null;
  serverNow: number;
};

/** Public charades state. Never contains the word being acted; skipped words stay hidden until the turn ends. */
export type CharadesPublicView = {
  v: 1;
  kind: "charades";
  phase: "lobby" | "turn_ready" | "turn_active" | "turn_summary" | "final";
  turn: number;
  totalTurns: number;
  round: number;
  roundsPerTeam: number;
  actingTeam: Team;
  actorSeatId: string | null;
  startedAt: number;
  turnSeconds: number;
  skipsLeft: number;
  canSteal: boolean;
  /** This turn's events. `word` is null for a skip until it's stolen or the turn ends. */
  log: { kind: "got" | "skip" | "steal"; word: string | null; points: number; team: Team | null }[];
  teams: Record<string, Team>;
  teamScores: Record<Team, number>;
  final: { winner: Team | null; players: { seatId: string; team: Team; points: number; xp: number }[] } | null;
  serverNow: number;
};

export type GameView = TeamPublicView | CharadesPublicView;

/** Private message for one player only (sent on their own channel). */
export type SecretView = {
  kind: "charades_word";
  turn: number;
  word: string;
  category: string;
  difficulty: 1 | 2 | 3;
  points: number;
};

export const gameCommand = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    count: z.union([z.literal(5), z.literal(10), z.literal(15)]).default(10),
    difficulty: z.enum(["easy", "mixed", "hard"]).default("mixed"),
    locale: z.enum(["ar", "en"]).default("ar"),
  }),
  z.object({ action: z.literal("advance") }),
  z.object({ action: z.literal("lobby") }),
  z.object({ action: z.literal("team"), seatId: z.uuid(), team: z.union([z.literal(1), z.literal(2)]) }),
  z.object({ action: z.literal("balance") }),
  /** Any member may ask for the reveal once the time is up (keeps the game moving if the host screen drops). */
  z.object({ action: z.literal("timeup"), index: z.number().int().min(0).max(49) }),
  // Charades: the host or the current actor.
  z.object({ action: z.literal("begin") }),
  z.object({ action: z.literal("got_it") }),
  z.object({ action: z.literal("skip") }),
  z.object({ action: z.literal("steal") }),
]);
export type GameCommand = z.input<typeof gameCommand>;

export const answerRequest = z.object({
  index: z.number().int().min(0).max(49),
  choice: z.number().int().min(0).max(3),
  answeredAt: z.number().finite().nullable(),
});

export type GameErrorCode =
  | "unconfigured"
  | "unauthenticated"
  | "bad_request"
  | "not_found"
  | "ended"
  | "not_host"
  | "not_member"
  | "not_playing"
  | "wrong_phase"
  | "stale_question"
  | "too_early"
  | "need_two_teams"
  | "no_questions"
  | "already_answered"
  | "time_up"
  | "conflict"
  | "not_actor"
  | "no_skips"
  | "nothing_to_steal"
  | "no_words"
  | "server_error";

export type GameResponse = { ok: true; game: GameView } | { ok: false; error: GameErrorCode };
