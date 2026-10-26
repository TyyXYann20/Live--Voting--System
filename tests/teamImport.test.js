import test from "node:test";
import assert from "node:assert/strict";
import { prepareTeamBatch, MAX_BATCH_TEAMS } from "../src/utils/teamImport.js";

test("team paste accepts commas, new lines, whitespace and trailing separators", () => {
  const batch = prepareTeamBatch(" A1,\r\nA2,\n B1, B2,\n, ");
  assert.deepEqual(
    batch.teams.map((t) => t.name),
    ["A1", "A2", "B1", "B2"],
  );
  assert.equal(batch.count, 4);
  assert.equal(batch.invalid.length, 0);
  assert.equal(prepareTeamBatch(" ,\n \r\n").teams.length, 0);
});
test("team paste skips repeated and existing names without case sensitivity", () => {
  const batch = prepareTeamBatch("A1, a1, Nova, NOVA, B1", [
    { name: "Nova", color: "#729bff" },
  ]);
  assert.deepEqual(
    batch.teams.map((t) => t.name),
    ["A1", "B1"],
  );
  assert.equal(batch.duplicates, 2);
  assert.equal(batch.existingSkipped, 1);
});
test("automatic colors are stable, valid, unique and avoid existing colors", () => {
  const text = Array.from(
    { length: MAX_BATCH_TEAMS },
    (_, i) => `Team ${i}`,
  ).join(",");
  const existing = [{ name: "Existing", color: "#C3F56B" }];
  const batch = prepareTeamBatch(text, existing);
  assert.deepEqual(batch, prepareTeamBatch(text, existing));
  const colors = batch.teams.map((t) => t.color);
  assert.equal(new Set(colors).size, MAX_BATCH_TEAMS);
  assert.equal(colors.includes("#c3f56b"), false);
  assert.ok(colors.every((c) => /^#[0-9a-f]{6}$/.test(c)));
});
test("team paste flags long names and oversized batches without silently importing a subset", () => {
  assert.equal(prepareTeamBatch("A1," + "x".repeat(81)).invalid.length, 1);
  const batch = prepareTeamBatch(
    Array.from({ length: 101 }, (_, i) => `T${i}`).join(","),
  );
  assert.equal(batch.tooMany, true);
  assert.equal(batch.count, 101);
  assert.equal(batch.teams.length, 100);
});
test("team-name length matches PostgreSQL Unicode character counting", () => {
  assert.equal(prepareTeamBatch("😀".repeat(80)).invalid.length, 0);
  assert.equal(prepareTeamBatch("😀".repeat(81)).invalid.length, 1);
});
