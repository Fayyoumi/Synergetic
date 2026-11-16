import { describe, expect, it } from "vitest";
import {
  actingTeam,
  actorOf,
  charadesFinal,
  charadesReducer,
  createCharadesState,
  roundOf,
  type CharadesAction,
  type CharadesState,
  type WordCard,
} from "@/lib/game/charades";
import { charadesPoints, countdownFrom, stealPoints } from "@/lib/game/scoring";

const card = (id: string, difficulty: 1 | 2 | 3 = 1): WordCard => ({ id, word: id, category: "x", difficulty });
const deck = () => [card("w1", 1), card("w2", 2), card("w3", 3), card("w4", 1), card("w5", 2), card("w6", 1)];

function apply(s: CharadesState, a: CharadesAction): CharadesState {
  const r = charadesReducer(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

function started(words = deck()) {
  return apply(createCharadesState(), {
    type: "start",
    gameId: "g",
    teams: { a: 1, b: 1, c: 2 },
    order: { 1: ["a", "b"], 2: ["c"] },
    deck: words,
    now: 0,
  });
}

describe("charades scoring", () => {
  it("scores 100/200/300 by difficulty; steals are half", () => {
    expect([charadesPoints(1), charadesPoints(2), charadesPoints(3)]).toEqual([100, 200, 300]);
    expect([stealPoints(1), stealPoints(2), stealPoints(3)]).toEqual([50, 100, 150]);
  });

  it("counts down from 60", () => {
    expect(countdownFrom(60, 0)).toBe(60);
    expect(countdownFrom(60, 59_001)).toBe(1);
    expect(countdownFrom(60, 60_000)).toBe(0);
  });
});

describe("charades state machine", () => {
  it("goes lobby → turn_ready → turn_active → turn_summary → … → final", () => {
    let s = started();
    expect(s.phase).toBe("turn_ready");
    for (let t = 0; t < 6; t++) {
      s = apply(s, { type: "begin", now: t * 100_000 });
      expect(s.phase).toBe("turn_active");
      s = apply(s, { type: "time_up", now: t * 100_000 + 60_000 });
      expect(s.phase).toBe("turn_summary");
      s = apply(s, { type: "advance" });
    }
    expect(s.phase).toBe("final");
    expect(apply(s, { type: "lobby" }).phase).toBe("lobby");
  });

  it("alternates teams over 3 rounds and rotates the actor within a team", () => {
    let s = started();
    const seen: [number, number, string | null][] = [];
    for (let t = 0; t < 6; t++) {
      seen.push([actingTeam(s), roundOf(s), actorOf(s)]);
      s = apply(s, { type: "begin", now: 0 });
      s = apply(s, { type: "time_up", now: 60_000 });
      s = apply(s, { type: "advance" });
    }
    expect(seen).toEqual([
      [1, 1, "a"],
      [2, 1, "c"],
      [1, 2, "b"],
      [2, 2, "c"],
      [1, 3, "a"],
      [2, 3, "c"],
    ]);
  });

  it("gives the acting team the word's points and draws the next word", () => {
    let s = apply(started(), { type: "begin", now: 0 });
    expect(s.current!.id).toBe("w1");
    s = apply(s, { type: "got_it", now: 1000 });
    s = apply(s, { type: "got_it", now: 2000 });
    expect(s.teamScores).toEqual({ 1: 300, 2: 0 });
    expect(s.current!.id).toBe("w3");
  });

  it("allows 3 skips per turn, each worth 0", () => {
    let s = apply(started(), { type: "begin", now: 0 });
    for (let i = 0; i < 3; i++) s = apply(s, { type: "skip", now: 1 });
    expect(charadesReducer(s, { type: "skip", now: 1 })).toEqual({ ok: false, error: "no_skips" });
    expect(s.teamScores).toEqual({ 1: 0, 2: 0 });
  });

  it("lets the other team steal the word just skipped, for half points, once", () => {
    let s = apply(started(), { type: "begin", now: 0 });
    s = apply(s, { type: "got_it", now: 1 }); // w1 (100) to team 1
    s = apply(s, { type: "skip", now: 2 }); // w2 (difficulty 2) skipped
    s = apply(s, { type: "steal" });
    expect(s.teamScores).toEqual({ 1: 100, 2: 100 });
    expect(charadesReducer(s, { type: "steal" })).toEqual({ ok: false, error: "nothing_to_steal" });
  });

  it("closes the steal chance at the next action (one guess only)", () => {
    let s = apply(started(), { type: "begin", now: 0 });
    s = apply(s, { type: "skip", now: 1 });
    s = apply(s, { type: "got_it", now: 2 });
    expect(charadesReducer(s, { type: "steal" })).toEqual({ ok: false, error: "nothing_to_steal" });
  });

  it("allows a steal after a skip right before time ran out", () => {
    let s = apply(started(), { type: "begin", now: 0 });
    s = apply(s, { type: "skip", now: 59_000 });
    s = apply(s, { type: "time_up", now: 60_000 });
    s = apply(s, { type: "steal" });
    expect(s.teamScores[2]).toBe(50);
  });

  it("refuses taps after the 60 seconds and early time-ups", () => {
    const s = apply(started(), { type: "begin", now: 0 });
    expect(charadesReducer(s, { type: "got_it", now: 60_000 })).toEqual({ ok: false, error: "time_up" });
    expect(charadesReducer(s, { type: "time_up", now: 59_999 })).toEqual({ ok: false, error: "too_early" });
  });

  it("puts skipped (not stolen) and unfinished words back in the deck for later turns", () => {
    let s = apply(started([card("w1"), card("w2"), card("w3")]), { type: "begin", now: 0 });
    s = apply(s, { type: "skip", now: 1 }); // w1 skipped, not stolen
    s = apply(s, { type: "time_up", now: 60_000 }); // w2 unfinished
    s = apply(s, { type: "advance" });
    expect(s.deck.map((c) => c.id)).toEqual(["w3", "w1", "w2"]);
  });

  it("drops stolen words for good", () => {
    let s = apply(started([card("w1"), card("w2")]), { type: "begin", now: 0 });
    s = apply(s, { type: "skip", now: 1 });
    s = apply(s, { type: "steal" });
    s = apply(s, { type: "time_up", now: 60_000 });
    s = apply(s, { type: "advance" });
    expect(s.deck.map((c) => c.id)).toEqual(["w2"]);
  });

  it("ends the turn early when the deck runs out", () => {
    let s = apply(started([card("w1")]), { type: "begin", now: 0 });
    s = apply(s, { type: "got_it", now: 1 });
    expect(s.phase).toBe("turn_summary");
  });

  it("ends the turn if the actor is removed, and keeps rotating without them", () => {
    let s = apply(started(), { type: "begin", now: 0 });
    s = apply(s, { type: "remove", seatId: "a" });
    expect(s.phase).toBe("turn_summary");
    s = apply(s, { type: "advance" });
    s = apply(s, { type: "begin", now: 0 });
    s = apply(s, { type: "time_up", now: 60_000 });
    s = apply(s, { type: "advance" });
    expect(actorOf(s)).toBe("b");
  });

  it("adds late joiners to their team's rotation", () => {
    let s = apply(started(), { type: "begin", now: 0 });
    s = apply(s, { type: "time_up", now: 60_000 });
    s = apply(s, { type: "advance", joined: { d: 2 } });
    expect(s.order[2]).toEqual(["c", "d"]);
  });

  it("needs both teams and some words to start", () => {
    expect(
      charadesReducer(createCharadesState(), { type: "start", gameId: "g", teams: { a: 1 }, order: { 1: ["a"], 2: [] }, deck: deck(), now: 0 }),
    ).toEqual({ ok: false, error: "need_two_teams" });
    expect(
      charadesReducer(createCharadesState(), { type: "start", gameId: "g", teams: { a: 1, c: 2 }, order: { 1: ["a"], 2: ["c"] }, deck: [], now: 0 }),
    ).toEqual({ ok: false, error: "no_words" });
  });

  it("final: winner and each player's points = their team's score", () => {
    let s = apply(started(), { type: "begin", now: 0 });
    s = apply(s, { type: "got_it", now: 1 });
    const f = charadesFinal(s);
    expect(f.winner).toBe(1);
    expect(f.players.find((p) => p.seatId === "c")).toEqual({ seatId: "c", team: 2, points: 0, xp: 0 });
    expect(f.players.find((p) => p.seatId === "a")!.xp).toBe(10);
  });
});
