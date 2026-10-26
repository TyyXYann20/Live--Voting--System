import test from "node:test";
import assert from "node:assert/strict";
import { rankTeams } from "../src/utils/results.js";
test("competition ranking shares tied positions and skips ranks fairly", () => {
  const rows = rankTeams([
    { name: "A", votes: 5 },
    { name: "B", votes: 5 },
    { name: "C", votes: 3 },
    { name: "D", votes: 1 },
  ]);
  assert.deepEqual(
    rows.map((t) => t.rank),
    [1, 1, 3, 4],
  );
  assert.equal(rows[0].percentage, (5 / 14) * 100);
});
test("zero votes never produce NaN percentages or false winners", () => {
  const rows = rankTeams([
    { name: "A", votes: 0 },
    { name: "B", votes: 0 },
  ]);
  assert.deepEqual(
    rows.map((t) => [t.rank, t.percentage]),
    [
      [1, 0],
      [1, 0],
    ],
  );
  assert.deepEqual(rankTeams([]), []);
});
