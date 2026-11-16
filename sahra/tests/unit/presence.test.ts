import { describe, expect, it } from "vitest";
import { createTracker, HOST_KEY, observe, recentNotices, statusOf, type ConnStatus } from "@/lib/realtime/presence";

const watched = [HOST_KEY, "a", "b"];

function run(...snapshots: Record<string, ConnStatus>[]) {
  let t = createTracker();
  snapshots.forEach((s, i) => {
    t = observe(t, s, watched, 1000 * (i + 1));
  });
  return t;
}

describe("presence tracker", () => {
  it("doesn't announce anyone on the first sync", () => {
    const t = run({ host: "active", a: "active" });
    expect(t.statuses).toEqual({ host: "active", a: "active", b: "offline" });
    expect(t.notices).toEqual([]);
    expect(t.ready).toBe(true);
  });

  it("announces a player who leaves the app, and counts it", () => {
    const t = run({ host: "active", a: "active", b: "active" }, { host: "active", a: "away", b: "active" });
    expect(t.statuses.a).toBe("away");
    expect(t.notices).toMatchObject([{ who: "a", kind: "away" }]);
    expect(t.incidents).toEqual({ a: 1 });
  });

  it("announces a player who disconnects mid-question, and their return", () => {
    const t = run(
      { host: "active", a: "active", b: "active" },
      { host: "active", b: "active" }, // a's connection dropped
      { host: "active", a: "active", b: "active" },
    );
    expect(t.notices.map((n) => [n.who, n.kind])).toEqual([
      ["a", "offline"],
      ["a", "back"],
    ]);
    expect(t.incidents).toEqual({ a: 1 });
  });

  it("announces the host going offline too", () => {
    const t = run({ host: "active", a: "active" }, { a: "active" });
    expect(t.notices).toMatchObject([{ who: HOST_KEY, kind: "offline" }]);
  });

  it("counts away → offline as one incident but shows both steps", () => {
    const t = run({ host: "active", a: "active" }, { host: "active", a: "away" }, { host: "active" });
    expect(t.notices.map((n) => n.kind)).toEqual(["away", "offline"]);
    expect(t.incidents.a).toBe(1);
  });

  it("counts every separate trip out of the app", () => {
    const t = run(
      { host: "active", a: "active" },
      { host: "active", a: "away" },
      { host: "active", a: "active" },
      { host: "active", a: "away" },
    );
    expect(t.incidents.a).toBe(2);
  });

  it("doesn't announce a newly seated player who was never seen", () => {
    let t = run({ host: "active", a: "active" });
    t = observe(t, { host: "active", a: "active", c: "active" }, [...watched, "c"], 5000);
    expect(t.notices).toEqual([]);
    expect(t.statuses.c).toBe("active");
  });

  it("doesn't say 'back' when a new player's seat arrives before their presence", () => {
    let t = run({ host: "active", a: "active" });
    t = observe(t, { host: "active", a: "active" }, [...watched, "c"], 5000); // roster first: c looks offline
    expect(t.statuses.c).toBe("offline");
    t = observe(t, { host: "active", a: "active", c: "active" }, [...watched, "c"], 6000); // then presence
    expect(t.notices).toEqual([]);
    // From now on c is tracked like everyone else.
    t = observe(t, { host: "active", a: "active" }, [...watched, "c"], 7000);
    expect(t.notices).toMatchObject([{ who: "c", kind: "offline" }]);
  });

  it("keeps only the latest notices and shows recent ones newest first", () => {
    let t = createTracker();
    t = observe(t, { a: "active" }, ["a"], 0);
    for (let i = 1; i <= 30; i++) t = observe(t, { a: i % 2 ? "away" : "active" }, ["a"], i * 1000);
    expect(t.notices).toHaveLength(20);
    const recent = recentNotices(t, 30_500, 3000);
    expect(recent.map((n) => n.at)).toEqual([30_000, 29_000, 28_000]);
  });

  it("treats a player with one active tab as active", () => {
    expect(statusOf([{ status: "away" }, { status: "active" }])).toBe("active");
    expect(statusOf([{ status: "away" }])).toBe("away");
    expect(statusOf([])).toBe("offline");
    expect(statusOf(undefined)).toBe("offline");
  });
});
