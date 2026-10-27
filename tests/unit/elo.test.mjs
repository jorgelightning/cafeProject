/* Unit tests for js/lib/elo.js — the ranking's arithmetic, without a board or a browser. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ELO_BASE, PLACING, eloFor, matchCount, isProvisional, kFor, pairKey,
  expectedScore, eloStep, placementPos, placementElo, placementStep,
} from "../../js/lib/elo.js";

test("a cafe with no score sits at the base, and counts no comparisons", () => {
  assert.equal(eloFor({}), ELO_BASE);
  assert.equal(eloFor(null), ELO_BASE);
  assert.equal(eloFor({ elo: 1612 }), 1612);
  assert.equal(matchCount({}), 0);
  assert.equal(matchCount({ matches: 7 }), 7);
});

test("provisional until PLACING comparisons", () => {
  assert.equal(isProvisional({ matches: PLACING - 1 }), true);
  assert.equal(isProvisional({ matches: PLACING }), false);
});

test("K is per cafe: a newcomer moves a lot, a veteran barely, never under 16", () => {
  assert.equal(kFor({ matches: 0 }), 40);
  assert.equal(kFor({ matches: 2 }), 28);
  assert.equal(kFor({ matches: 4 }), 16);
  assert.equal(kFor({ matches: 50 }), 16);
});

test("pairKey is the same whichever way round", () => {
  assert.equal(pairKey("b", "a"), pairKey("a", "b"));
});

test("expectedScore: even at equal ratings, 10:1 at 400 apart", () => {
  assert.equal(expectedScore(1500, 1500), 0.5);
  assert.ok(Math.abs(expectedScore(1900, 1500) - 10 / 11) < 1e-12);
  assert.ok(Math.abs(expectedScore(1500, 1600) + expectedScore(1600, 1500) - 1) < 1e-12, "the two sides add to one");
});

test("eloStep: a win between equals at K 16 is 8 points each way", () => {
  assert.deepEqual(eloStep(1500, 1500, 16, 16, false), { a: 1508, b: 1492 });
});

test("eloStep: a draw between equals moves nobody; a draw with a stronger side pulls them together", () => {
  assert.deepEqual(eloStep(1500, 1500, 16, 16, true), { a: 1500, b: 1500 });
  const r = eloStep(1400, 1600, 16, 16, true);
  assert.ok(r.a > 1400 && r.b < 1600);
});

test("eloStep: a heavy favourite winning still moves both by a point", () => {
  assert.deepEqual(eloStep(2400, 1000, 16, 16, false), { a: 2401, b: 999 });
});

test("eloStep: each side moves by its own K", () => {
  const r = eloStep(1500, 1500, 40, 16, false);
  assert.equal(r.a - 1500, 20, "the newcomer at K 40");
  assert.equal(1500 - r.b, 8, "the veteran at K 16");
});

/* references sorted best first, 100 apart */
const refs = [1800, 1700, 1600, 1500, 1400].map(elo => ({ elo }));

test("placementPos and placementElo are inverses inside the list", () => {
  assert.equal(placementPos(1700, refs), 1);
  assert.equal(placementPos(1650, refs), 1.5);
  for (const r of [0.25, 1, 1.5, 2.75, 3.5]) assert.equal(placementPos(placementElo(refs, r), refs), r);
});

test("past either end, placement extends a little and no further", () => {
  assert.ok(placementPos(1900, refs) < 0);
  assert.ok(placementPos(1300, refs) > refs.length - 1);
  assert.ok(placementPos(9999, refs) >= -4, "capped above the top");
  assert.ok(placementElo(refs, -100) <= 1800 + 40, "never more than 40 over the best");
  assert.ok(placementElo(refs, 100) >= 1400 - 40, "never more than 40 under the worst");
});

test("placementStep: big steps first, settling as comparisons add up", () => {
  const steps = [0, 1, 2, 4, 8].map(m => placementStep(m, 24));
  assert.equal(steps[0], 6, "a quarter of 24 references on the first answer");
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] <= steps[i - 1], "never grows");
  assert.equal(placementStep(100, 24), 3, "floor: min(3, n/6)");
});
