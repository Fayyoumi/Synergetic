import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/game/round";
import {
  buildWhoRounds,
  createWhoState,
  tallyVotes,
  validVote,
  whoFinal,
  whoReducer,
  type WhoAction,
  type WhoRound,
  type WhoState,
} from "@/lib/game/whoAmongUs";

function apply(s: WhoState, a: WhoAction): WhoState {
  const r = whoReducer(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const trait = (id: string): WhoRound => ({ kind: "trait", traitId: id, trait: `trait ${id}` });
const answer = (id: string, author: string): WhoRound => ({ kind: "answer", answerId: id, prompt: "p", answer: `a ${id}`, authorSeatId: author });

function opened(rounds: WhoRound[] = [trait("t1"), answer("x1", "c"), trait("t2")]) {
  let s = apply(createWhoState(), { type: "collect", gameId: "g", players: ["a", "b", "c", "d"], now: 0 });
  s = apply(s, { type: "open", rounds, now: 1000 });
  return s;
}

describe("vote scoring", () => {
  it("never allows self-votes", () => {
    expect(validVote(["a", "b"], "a", "a")).toBe(false);
    expect(validVote(["a", "b"], "a", "b")).toBe(true);
    expect(validVote(["a", "b"], "a", "z")).toBe(false);
  });

  it("gives +100 to voters for the most-voted player", () => {
    expect(tallyVotes({ a: "c", b: "c", c: "a", d: "c" })).toEqual({ tally: { c: 3, a: 1 }, top: ["c"], majorityVoters: ["a", "b", "d"] });
  });

  it("on a tie, voters for any tied player get +100", () => {
    const r = tallyVotes({ a: "b", b: "a", c: "a", d: "b" });
    expect(r.top.sort()).toEqual(["a", "b"]);
    expect(r.majorityVoters.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("handles a round with no votes", () => {
    expect(tallyVotes({})).toEqual({ tally: {}, top: [], majorityVoters: [] });
  });
});

describe("who among us state machine", () => {
  it("goes lobby → prompts_collect → vote_open → reveal → … → final", () => {
    let s = opened();
    expect(s.phase).toBe("vote_open");
    s = apply(s, { type: "reveal", index: 0, votes: { a: "b", b: "a", c: "b", d: "b" }, now: 2000 });
    expect(s.phase).toBe("reveal");
    s = apply(s, { type: "advance", now: 3000 });
    expect(s).toMatchObject({ phase: "vote_open", index: 1, startedAt: 3000 });
    s = apply(s, { type: "reveal", index: 1, votes: {}, now: 3000 + 20_000 });
    s = apply(s, { type: "advance", now: 4000 });
    s = apply(s, { type: "reveal", index: 2, votes: {}, now: 4000 + 20_000 });
    s = apply(s, { type: "advance", now: 5000 });
    expect(s.phase).toBe("final");
    expect(apply(s, { type: "lobby" }).phase).toBe("lobby");
  });

  it("scores the majority and gives the trait as a title to the most-voted", () => {
    let s = opened();
    s = apply(s, { type: "reveal", index: 0, votes: { a: "b", b: "a", c: "b", d: "b" }, now: 2000 });
    expect(s.scores).toEqual({ a: 100, b: 0, c: 100, d: 100 });
    expect(s.titles).toEqual([{ index: 0, seatId: "b", title: "trait t1" }]);
  });

  it("gives the title to every tied player", () => {
    let s = opened();
    s = apply(s, { type: "reveal", index: 0, votes: { a: "b", b: "a", c: "a", d: "b" }, now: 2000 });
    expect(s.titles.map((t) => t.seatId).sort()).toEqual(["a", "b"]);
  });

  it("ignores self-votes and votes for non-players", () => {
    let s = opened();
    s = apply(s, { type: "reveal", index: 0, votes: { a: "a", b: "z", c: "d", d: "c" }, now: 1000 + 20_000 });
    expect(s.lastResult!.tally).toEqual({ d: 1, c: 1 });
  });

  it("waits for every vote or the 20-second timer", () => {
    const s = opened();
    expect(whoReducer(s, { type: "reveal", index: 0, votes: { a: "b" }, now: 5000 })).toEqual({ ok: false, error: "too_early" });
    expect(whoReducer(s, { type: "reveal", index: 0, votes: { a: "b" }, now: 21_000 }).ok).toBe(true);
  });

  it("answer rounds give no title", () => {
    let s = opened([answer("x1", "c")]);
    s = apply(s, { type: "reveal", index: 0, votes: { a: "c", b: "c", c: "a", d: "c" }, now: 2000 });
    expect(s.lastResult!.title).toBeNull();
    expect(s.titles).toEqual([]);
  });

  it("lets only the author veto: before the reveal it cancels the round with no points", () => {
    let s = opened([answer("x1", "c"), trait("t1")]);
    expect(whoReducer(s, { type: "veto", seatId: "a" })).toEqual({ ok: false, error: "not_author" });
    s = apply(s, { type: "veto", seatId: "c" });
    expect(s.phase).toBe("reveal");
    expect(s.vetoed).toBe(true);
    expect(s.lastResult).toMatchObject({ vetoed: true, top: [] });
    expect(Object.values(s.scores).every((x) => x === 0)).toBe(true);
    s = apply(s, { type: "advance", now: 9000 });
    expect(s.vetoed).toBe(false);
  });

  it("a veto after the reveal hides the answer but keeps the points", () => {
    let s = opened([answer("x1", "c")]);
    s = apply(s, { type: "reveal", index: 0, votes: { a: "c", b: "c", c: "a", d: "c" }, now: 2000 });
    s = apply(s, { type: "veto", seatId: "c" });
    expect(s.vetoed).toBe(true);
    expect(s.scores.a).toBe(100);
  });

  it("can't veto a trait round", () => {
    const s = opened([trait("t1")]);
    expect(whoReducer(s, { type: "veto", seatId: "a" })).toEqual({ ok: false, error: "not_author" });
  });

  it("needs at least 3 players and some rounds", () => {
    expect(whoReducer(createWhoState(), { type: "collect", gameId: "g", players: ["a", "b"], now: 0 })).toEqual({ ok: false, error: "need_players" });
    const s = apply(createWhoState(), { type: "collect", gameId: "g", players: ["a", "b", "c"], now: 0 });
    expect(whoReducer(s, { type: "open", rounds: [], now: 0 })).toEqual({ ok: false, error: "no_rounds" });
  });

  it("drops a removed player's upcoming answer rounds and adds late joiners", () => {
    let s = opened([trait("t1"), answer("x1", "c"), answer("x2", "d")]);
    s = apply(s, { type: "remove", seatId: "c" });
    expect(s.rounds.map((r) => (r.kind === "answer" ? r.answerId : r.traitId))).toEqual(["t1", "x2"]);
    s = apply(s, { type: "reveal", index: 0, votes: {}, now: 21_000 });
    s = apply(s, { type: "advance", now: 22_000, joined: ["e"] });
    expect(s.players).toContain("e");
    expect(s.scores.e).toBe(0);
  });

  it("final standings and titles", () => {
    let s = opened([trait("t1")]);
    s = apply(s, { type: "reveal", index: 0, votes: { a: "b", b: "a", c: "b", d: "b" }, now: 2000 });
    const f = whoFinal(s);
    expect(f.standings[0]).toMatchObject({ points: 100, xp: 10 });
    expect(f.titles).toHaveLength(1);
  });
});

describe("round planning", () => {
  const traits = ["t1", "t2", "t3", "t4"].map((id) => ({ id, text: id }));
  const answers = [
    { id: "a1", prompt: "p", answer: "x", authorSeatId: "s1" },
    { id: "a2", prompt: "p", answer: "y", authorSeatId: "s1" },
    { id: "a3", prompt: "p", answer: "z", authorSeatId: "s2" },
  ];

  it("alternates trait and answer rounds up to the count", () => {
    const rounds = buildWhoRounds({ traits, answers, count: 6, rng: seededRng(1) });
    expect(rounds.map((r) => r.kind)).toEqual(["trait", "answer", "trait", "answer", "trait", "answer"]);
  });

  it("spreads one author's answers out", () => {
    const rounds = buildWhoRounds({ traits: [], answers, count: 3, rng: seededRng(2) });
    const authors = rounds.map((r) => (r.kind === "answer" ? r.authorSeatId : ""));
    expect(authors[0]).not.toBe(authors[1]);
  });

  it("uses only traits when nobody wrote answers, and stops when content runs out", () => {
    expect(buildWhoRounds({ traits, answers: [], count: 8, rng: seededRng(3) }).map((r) => r.kind)).toEqual(["trait", "trait", "trait", "trait"]);
  });
});
