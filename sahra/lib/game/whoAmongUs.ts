import { shuffle, type Rng } from "./round";
import { xpFor } from "./scoring";

/**
 * "Who among us?" (مين فينا؟) — pure logic.
 *   lobby → prompts_collect → vote_open → reveal → vote_open → … → final → lobby
 *
 * Two kinds of round:
 *  - trait:  "مين فينا… {trait}؟" — the most-voted player takes the trait as their title.
 *  - answer: a player's secret answer is shown anonymously; everyone votes who wrote it.
 *            Only the author knows it's theirs, and they can veto the reveal: the round is
 *            cancelled, the answer leaves the screen and the author is never shown.
 * Scoring (spec): voters for the most-voted player get +100; on a tie, voters for any
 * tied player get +100. Titles carry no points.
 */

export const VOTE_SECONDS = 20;
export const MAJORITY_POINTS = 100;

export type WhoRound =
  | { kind: "trait"; traitId: string; trait: string }
  | { kind: "answer"; answerId: string; prompt: string; answer: string; authorSeatId: string };

export type WhoResult = {
  index: number;
  tally: Record<string, number>;
  top: string[];
  /** Voters who picked a top-voted player (+100 each). */
  majorityVoters: string[];
  /** Trait rounds: the title (the trait) goes to the top-voted player(s). */
  title: string | null;
  vetoed: boolean;
};

export type WhoState = {
  v: 1;
  kind: "who_among_us";
  phase: "lobby" | "prompts_collect" | "vote_open" | "reveal" | "final";
  gameId: string | null;
  players: string[];
  rounds: WhoRound[];
  index: number;
  startedAt: number;
  gameStartedAt: number;
  scores: Record<string, number>;
  vetoed: boolean;
  lastResult: WhoResult | null;
  titles: { index: number; seatId: string; title: string }[];
};

export type WhoAction =
  | { type: "collect"; gameId: string; players: string[]; now: number }
  | { type: "open"; rounds: WhoRound[]; now: number }
  | { type: "reveal"; index: number; votes: Record<string, string>; now: number }
  | { type: "veto"; seatId: string }
  | { type: "advance"; now: number; joined?: string[] }
  | { type: "remove"; seatId: string }
  | { type: "lobby" };

export type WhoError = "wrong_phase" | "stale_round" | "too_early" | "not_author" | "need_players" | "no_rounds";
export type WhoReducerResult = { ok: true; state: WhoState } | { ok: false; error: WhoError };

const fail = (error: WhoError): WhoReducerResult => ({ ok: false, error });

export function createWhoState(): WhoState {
  return {
    v: 1,
    kind: "who_among_us",
    phase: "lobby",
    gameId: null,
    players: [],
    rounds: [],
    index: 0,
    startedAt: 0,
    gameStartedAt: 0,
    scores: {},
    vetoed: false,
    lastResult: null,
    titles: [],
  };
}

/** True when a vote is valid: both are players and nobody votes for themselves. */
export function validVote(players: readonly string[], voter: string, target: string): boolean {
  return voter !== target && players.includes(voter) && players.includes(target);
}

/** Counts votes; top = everyone with the highest count (empty if no votes). */
export function tallyVotes(votes: Readonly<Record<string, string>>) {
  const tally: Record<string, number> = {};
  for (const target of Object.values(votes)) tally[target] = (tally[target] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(tally));
  const top = max > 0 ? Object.keys(tally).filter((s) => tally[s] === max) : [];
  const topSet = new Set(top);
  const majorityVoters = Object.entries(votes)
    .filter(([, target]) => topSet.has(target))
    .map(([voter]) => voter);
  return { tally, top, majorityVoters };
}

export function voteTimeUp(state: Pick<WhoState, "startedAt">, now: number): boolean {
  return now - state.startedAt >= VOTE_SECONDS * 1000;
}

/**
 * Plans the rounds: secret-answer rounds (one per answer, authors spread out)
 * alternating with trait rounds, up to `count`.
 */
export function buildWhoRounds(args: {
  traits: { id: string; text: string }[];
  answers: { id: string; prompt: string; answer: string; authorSeatId: string }[];
  count: number;
  rng: Rng;
}): WhoRound[] {
  const traits = shuffle(args.traits, args.rng).map((t): WhoRound => ({ kind: "trait", traitId: t.id, trait: t.text }));
  // Round-robin by author so one person's answers don't come in a row.
  const byAuthor = new Map<string, WhoRound[]>();
  for (const a of shuffle(args.answers, args.rng)) {
    const list = byAuthor.get(a.authorSeatId) ?? [];
    list.push({ kind: "answer", answerId: a.id, prompt: a.prompt, answer: a.answer, authorSeatId: a.authorSeatId });
    byAuthor.set(a.authorSeatId, list);
  }
  const answers: WhoRound[] = [];
  const queues = [...byAuthor.values()];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) answers.push(q.shift()!);

  const rounds: WhoRound[] = [];
  let t = 0;
  let a = 0;
  while (rounds.length < args.count && (t < traits.length || a < answers.length)) {
    const wantTrait = rounds.length % 2 === 0;
    if ((wantTrait && t < traits.length) || a >= answers.length) rounds.push(traits[t++]);
    else rounds.push(answers[a++]);
  }
  return rounds;
}

export function whoReducer(state: WhoState, action: WhoAction): WhoReducerResult {
  switch (action.type) {
    case "collect": {
      if (state.phase !== "lobby" && state.phase !== "final") return fail("wrong_phase");
      if (action.players.length < 3) return fail("need_players");
      return {
        ok: true,
        state: {
          ...createWhoState(),
          phase: "prompts_collect",
          gameId: action.gameId,
          players: action.players,
          scores: Object.fromEntries(action.players.map((p) => [p, 0])),
          gameStartedAt: action.now,
        },
      };
    }

    case "open": {
      if (state.phase !== "prompts_collect") return fail("wrong_phase");
      if (!action.rounds.length) return fail("no_rounds");
      return { ok: true, state: { ...state, phase: "vote_open", rounds: action.rounds, index: 0, startedAt: action.now, vetoed: false } };
    }

    case "reveal": {
      if (state.phase !== "vote_open") return fail("wrong_phase");
      if (action.index !== state.index) return fail("stale_round");
      const valid = Object.fromEntries(Object.entries(action.votes).filter(([voter, target]) => validVote(state.players, voter, target)));
      const allVoted = state.players.every((p) => valid[p] !== undefined);
      if (!allVoted && !voteTimeUp(state, action.now)) return fail("too_early");
      const { tally, top, majorityVoters } = tallyVotes(valid);
      const round = state.rounds[state.index];
      const scores = { ...state.scores };
      for (const v of majorityVoters) scores[v] = (scores[v] ?? 0) + MAJORITY_POINTS;
      const title = round.kind === "trait" && top.length ? round.trait : null;
      return {
        ok: true,
        state: {
          ...state,
          phase: "reveal",
          scores,
          lastResult: { index: state.index, tally, top, majorityVoters, title, vetoed: false },
          titles: title ? [...state.titles, ...top.map((seatId) => ({ index: state.index, seatId, title }))] : state.titles,
        },
      };
    }

    case "veto": {
      if (state.phase !== "vote_open" && state.phase !== "reveal") return fail("wrong_phase");
      const round = state.rounds[state.index];
      if (round.kind !== "answer" || round.authorSeatId !== action.seatId) return fail("not_author");
      if (state.phase === "vote_open") {
        // Cancelled before anyone saw the result: no points, nothing revealed.
        return {
          ok: true,
          state: {
            ...state,
            phase: "reveal",
            vetoed: true,
            lastResult: { index: state.index, tally: {}, top: [], majorityVoters: [], title: null, vetoed: true },
          },
        };
      }
      // Already revealed: hide the answer and the author from now on (points stand).
      return {
        ok: true,
        state: { ...state, vetoed: true, lastResult: state.lastResult ? { ...state.lastResult, vetoed: true } : null },
      };
    }

    case "advance": {
      if (state.phase !== "reveal") return fail("wrong_phase");
      if (state.index >= state.rounds.length - 1) return { ok: true, state: { ...state, phase: "final" } };
      const players = [...state.players];
      const scores = { ...state.scores };
      for (const p of action.joined ?? []) {
        if (!players.includes(p)) {
          players.push(p);
          scores[p] = 0;
        }
      }
      return {
        ok: true,
        state: { ...state, phase: "vote_open", index: state.index + 1, startedAt: action.now, vetoed: false, players, scores },
      };
    }

    case "remove": {
      if (!state.players.includes(action.seatId)) return { ok: true, state };
      // Rounds built from the removed player's answers are dropped (except the current one).
      const rounds = state.rounds.filter(
        (r, i) => i <= state.index || r.kind !== "answer" || r.authorSeatId !== action.seatId,
      );
      return { ok: true, state: { ...state, players: state.players.filter((p) => p !== action.seatId), rounds } };
    }

    case "lobby": {
      if (state.phase !== "final") return fail("wrong_phase");
      return { ok: true, state: createWhoState() };
    }
  }
}

export function whoFinal(state: WhoState) {
  const standings = Object.entries(state.scores)
    .filter(([seat]) => state.players.includes(seat))
    .map(([seatId, points]) => ({ seatId, points, xp: xpFor(points) }))
    .sort((a, b) => b.points - a.points);
  return { standings, titles: state.titles };
}
