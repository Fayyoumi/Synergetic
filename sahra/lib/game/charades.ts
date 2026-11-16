import {
  CHARADES_ROUNDS_PER_TEAM,
  CHARADES_SKIPS_PER_TURN,
  CHARADES_TURN_SECONDS,
  charadesPoints,
  stealPoints,
  xpFor,
} from "./scoring";
import type { Team } from "./teamTrivia";

/**
 * Charades (بدون كلام) state machine (pure; the server runs it).
 *   lobby → turn_ready → turn_active → turn_summary → … → final → lobby
 * 2 teams × 3 rounds = 6 turns of 60 s, alternating teams; the actor rotates
 * within each team. The current word is only ever sent to the actor's phone.
 */

export type WordCard = { id: string; word: string; category: string; difficulty: 1 | 2 | 3 };

export type TurnEvent =
  | { kind: "got"; card: WordCard; points: number; team: Team }
  | { kind: "skip"; card: WordCard }
  | { kind: "steal"; card: WordCard; points: number; team: Team };

export type CharadesState = {
  v: 1;
  kind: "charades";
  phase: "lobby" | "turn_ready" | "turn_active" | "turn_summary" | "final";
  gameId: string | null;
  teams: Record<string, Team>;
  /** Acting order within each team (seat ids, join order). */
  order: Record<Team, string[]>;
  /** 0-based turn number; team 1 acts on even turns. */
  turn: number;
  totalTurns: number;
  deck: WordCard[];
  current: WordCard | null;
  startedAt: number;
  gameStartedAt: number;
  skipsUsed: number;
  /** This turn's events, in order. */
  log: TurnEvent[];
  /** The word just skipped: the other team may claim it with one guess, until the next action. */
  stealable: WordCard | null;
  /** Skipped (not stolen) words go back into the deck after the turn. */
  recycle: WordCard[];
  teamScores: Record<Team, number>;
};

export type CharadesAction =
  | { type: "start"; gameId: string; teams: Record<string, Team>; order: Record<Team, string[]>; deck: WordCard[]; now: number }
  | { type: "begin"; now: number }
  | { type: "got_it"; now: number }
  | { type: "skip"; now: number }
  | { type: "steal" }
  | { type: "time_up"; now: number }
  | { type: "advance"; joined?: Record<string, Team> }
  | { type: "remove"; seatId: string }
  | { type: "lobby" };

export type CharadesError = "wrong_phase" | "time_up" | "too_early" | "no_skips" | "nothing_to_steal" | "need_two_teams" | "no_words";
export type CharadesResult = { ok: true; state: CharadesState } | { ok: false; error: CharadesError };

const fail = (error: CharadesError): CharadesResult => ({ ok: false, error });
const other = (t: Team): Team => (t === 1 ? 2 : 1);

export function createCharadesState(): CharadesState {
  return {
    v: 1,
    kind: "charades",
    phase: "lobby",
    gameId: null,
    teams: {},
    order: { 1: [], 2: [] },
    turn: 0,
    totalTurns: 2 * CHARADES_ROUNDS_PER_TEAM,
    deck: [],
    current: null,
    startedAt: 0,
    gameStartedAt: 0,
    skipsUsed: 0,
    log: [],
    stealable: null,
    recycle: [],
    teamScores: { 1: 0, 2: 0 },
  };
}

export function actingTeam(state: Pick<CharadesState, "turn">): Team {
  return state.turn % 2 === 0 ? 1 : 2;
}

/** 1-based round for the current turn. */
export function roundOf(state: Pick<CharadesState, "turn">): number {
  return Math.floor(state.turn / 2) + 1;
}

/** Who acts this turn: members of the acting team take turns. */
export function actorOf(state: Pick<CharadesState, "turn" | "order">): string | null {
  const team = actingTeam(state);
  const members = state.order[team];
  if (!members.length) return null;
  return members[Math.floor(state.turn / 2) % members.length];
}

export function turnTimeUp(state: Pick<CharadesState, "startedAt">, now: number): boolean {
  return now - state.startedAt >= CHARADES_TURN_SECONDS * 1000;
}

/** Moves to the summary, putting the unfinished word back for later. */
function endTurn(state: CharadesState): CharadesState {
  return {
    ...state,
    phase: "turn_summary",
    recycle: state.current ? [...state.recycle, state.current] : state.recycle,
    current: null,
  };
}

function draw(state: CharadesState): CharadesState {
  const [next, ...rest] = state.deck;
  if (!next) return endTurn({ ...state, current: null });
  return { ...state, current: next, deck: rest };
}

export function charadesReducer(state: CharadesState, action: CharadesAction): CharadesResult {
  switch (action.type) {
    case "start": {
      if (state.phase !== "lobby" && state.phase !== "final") return fail("wrong_phase");
      if (!action.order[1].length || !action.order[2].length) return fail("need_two_teams");
      if (!action.deck.length) return fail("no_words");
      return {
        ok: true,
        state: {
          ...createCharadesState(),
          phase: "turn_ready",
          gameId: action.gameId,
          teams: action.teams,
          order: action.order,
          deck: action.deck,
          gameStartedAt: action.now,
        },
      };
    }

    case "begin": {
      if (state.phase !== "turn_ready") return fail("wrong_phase");
      return { ok: true, state: draw({ ...state, phase: "turn_active", startedAt: action.now, skipsUsed: 0, log: [], stealable: null }) };
    }

    case "got_it": {
      if (state.phase !== "turn_active" || !state.current) return fail("wrong_phase");
      if (turnTimeUp(state, action.now)) return fail("time_up");
      const team = actingTeam(state);
      const points = charadesPoints(state.current.difficulty);
      return {
        ok: true,
        state: draw({
          ...state,
          teamScores: { ...state.teamScores, [team]: state.teamScores[team] + points },
          log: [...state.log, { kind: "got", card: state.current, points, team }],
          current: null,
          stealable: null,
        }),
      };
    }

    case "skip": {
      if (state.phase !== "turn_active" || !state.current) return fail("wrong_phase");
      if (turnTimeUp(state, action.now)) return fail("time_up");
      if (state.skipsUsed >= CHARADES_SKIPS_PER_TURN) return fail("no_skips");
      return {
        ok: true,
        state: draw({
          ...state,
          skipsUsed: state.skipsUsed + 1,
          log: [...state.log, { kind: "skip", card: state.current }],
          stealable: state.current,
          recycle: [...state.recycle, state.current],
          current: null,
        }),
      };
    }

    case "steal": {
      // Allowed during the turn or on its summary, for the word just skipped only.
      if (state.phase !== "turn_active" && state.phase !== "turn_summary") return fail("wrong_phase");
      const card = state.stealable;
      if (!card) return fail("nothing_to_steal");
      const team = other(actingTeam(state));
      const points = stealPoints(card.difficulty);
      return {
        ok: true,
        state: {
          ...state,
          teamScores: { ...state.teamScores, [team]: state.teamScores[team] + points },
          log: [...state.log, { kind: "steal", card, points, team }],
          stealable: null,
          // A stolen word is used up.
          recycle: state.recycle.filter((c) => c.id !== card.id),
        },
      };
    }

    case "time_up": {
      if (state.phase !== "turn_active") return fail("wrong_phase");
      if (!turnTimeUp(state, action.now)) return fail("too_early");
      return { ok: true, state: endTurn(state) };
    }

    case "advance": {
      if (state.phase !== "turn_summary") return fail("wrong_phase");
      const deck = [...state.deck, ...state.recycle];
      if (state.turn + 1 >= state.totalTurns) {
        return { ok: true, state: { ...state, phase: "final", deck, recycle: [], stealable: null } };
      }
      const teams = { ...state.teams };
      const order = { 1: [...state.order[1]], 2: [...state.order[2]] } as Record<Team, string[]>;
      for (const [seat, team] of Object.entries(action.joined ?? {})) {
        if (teams[seat]) continue;
        teams[seat] = team;
        order[team].push(seat);
      }
      return {
        ok: true,
        state: { ...state, phase: "turn_ready", turn: state.turn + 1, deck, recycle: [], stealable: null, log: [], teams, order },
      };
    }

    case "remove": {
      if (!state.teams[action.seatId]) return { ok: true, state };
      const wasActor = actorOf(state) === action.seatId;
      const teams = { ...state.teams };
      delete teams[action.seatId];
      const order = {
        1: state.order[1].filter((s) => s !== action.seatId),
        2: state.order[2].filter((s) => s !== action.seatId),
      } as Record<Team, string[]>;
      let next: CharadesState = { ...state, teams, order };
      if (wasActor && state.phase === "turn_active") next = endTurn(next);
      return { ok: true, state: next };
    }

    case "lobby": {
      if (state.phase !== "final") return fail("wrong_phase");
      return { ok: true, state: createCharadesState() };
    }
  }
}

/** End of game: winner (null on a tie) and per-player points (each player gets their team's score). */
export function charadesFinal(state: CharadesState) {
  const [s1, s2] = [state.teamScores[1], state.teamScores[2]];
  const winner: Team | null = s1 === s2 ? null : s1 > s2 ? 1 : 2;
  const players = Object.entries(state.teams).map(([seatId, team]) => {
    const points = state.teamScores[team];
    return { seatId, team, points, xp: xpFor(points) };
  });
  return { winner, teamScores: state.teamScores, players };
}
