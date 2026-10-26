import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const admin = "00000000-0000-4000-8000-000000000001";
const user = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
test("PostgreSQL integration: RLS, role boundaries, voting invariants, stop snapshot and history", async (t) => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values('${admin}'),('${user}'),('${other}');`,
  );
  const sql = await readFile(
    new URL("../supabase/migrations/202610260001_voting.sql", import.meta.url),
    "utf8",
  );
  // Embedded PostgreSQL has no logical replication publisher; test every other migration statement.
  await db.exec(
    sql.replace(/alter publication supabase_realtime add table[^;]+;/, ""),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610270001_participant_management.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query(
    `insert into public.profiles(id,full_name,role) values($1,'Admin','admin')`,
    [admin],
  );
  const identity = async (id, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(`set role ${role}`);
  };
  const rpc = async (name, args = []) => {
    const r = await db.query(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as result`,
      args,
    );
    return r.rows[0]?.result;
  };
  const rejects = async (fn, pattern) => {
    await assert.rejects(fn, pattern);
  };
  await identity(admin);
  const session = await rpc("save_session", [
    null,
    "Showcase",
    "A company event",
    null,
    null,
    true,
  ]);
  const a = await rpc("save_team", [null, session, "Orion", "#c3f56b", false]);
  const b = await rpc("save_team", [null, session, "Nova", "#759bff", false]);
  const p = await rpc("issue_participant", [session, "Alex Example", a]);
  const p2 = await rpc("issue_participant", [session, "Jamie Example", a]);
  await t.test(
    "codes are high entropy, hashed, and never stored plaintext",
    async () => {
      assert.equal(p.code.length, 64);
      const rows = await db.query(
        "select voting_code_hash from participants where id=$1",
        [p.id],
      );
      assert.notEqual(rows.rows[0].voting_code_hash, p.code);
      assert.equal(rows.rows[0].voting_code_hash.length, 64);
    },
  );
  await identity(user);
  await t.test(
    "participants cannot administer or directly insert votes/profiles",
    async () => {
      await rejects(
        () => rpc("session_action", [session, "start"]),
        /Administrator/,
      );
      await rejects(
        () =>
          db.query(
            "insert into profiles(id,full_name,role) values($1,'Attacker','admin')",
            [user],
          ),
        /permission denied/,
      );
      await rejects(
        () => db.exec("insert into votes default values"),
        /permission denied/,
      );
      assert.equal(
        (await db.query("select * from participants")).rows.length,
        0,
      );
      assert.equal((await db.query("select * from votes")).rows.length, 0);
    },
  );
  await t.test("draft session refuses voting", () =>
    rejects(
      () => rpc("submit_vote", [session, "Alex", a, b, p.code]),
      /not open/,
    ),
  );
  await identity(admin);
  await rpc("session_action", [session, "start"]);
  await identity(user);
  await t.test("hidden results and vote signals are inaccessible", async () => {
    assert.equal((await rpc("get_results", [session])).hidden, true);
    assert.equal(
      (await db.query("select * from result_signals")).rows.length,
      0,
    );
  });
  await t.test(
    "invalid codes, own-team votes and team impersonation fail",
    async () => {
      await rejects(
        () => rpc("submit_vote", [session, "Alex", a, b, "incorrect"]),
        /Invalid participant code/,
      );
      await rejects(
        () => rpc("submit_vote", [session, "Alex", a, a, p.code]),
        /own team/,
      );
      await rejects(
        () => rpc("submit_vote", [session, "Alex", b, a, p.code]),
        /Registered team/,
      );
    },
  );
  await t.test(
    "valid vote returns unique receipt; replay cannot create a second ballot",
    async () => {
      const token = await rpc("submit_vote", [session, "Alex", a, b, p.code]);
      assert.match(token, /^[0-9a-f-]{36}$/);
      await rejects(
        () => rpc("submit_vote", [session, "Alex", a, b, p.code]),
        /already been submitted/,
      );
      assert.equal(
        (await rpc("resolve_participant", [session, p.code])).has_voted,
        true,
      );
    },
  );
  await identity(other);
  await t.test("used code cannot be replayed from another identity", () =>
    rejects(
      () => rpc("submit_vote", [session, "Alex", a, b, p.code]),
      /already used/,
    ),
  );
  await identity(admin);
  await t.test("teams cannot be changed once voting begins", () =>
    rejects(
      () => rpc("save_team", [a, session, "Changed", "#ffffff", false]),
      /locked/,
    ),
  );
  await rpc("session_action", [session, "pause"]);
  await identity(other);
  await t.test("paused sessions reject new ballots", () =>
    rejects(
      () => rpc("submit_vote", [session, "Jamie", a, b, p2.code]),
      /not open/,
    ),
  );
  await identity(admin);
  await rpc("session_action", [session, "resume"]);
  await identity(other);
  await rpc("submit_vote", [session, "Jamie", a, b, p2.code]);
  await identity(admin);
  await rpc("session_action", [session, "show"]);
  await identity("", "anon");
  await t.test(
    "public results expose aggregates only after reveal",
    async () => {
      const r = await rpc("get_results", [session]);
      assert.equal(r.hidden, false);
      assert.equal(r.teams.find((t) => t.id === b).votes, 2);
      assert.equal(JSON.stringify(r).includes("Alex"), false);
    },
  );
  await identity(admin);
  await rpc("session_action", [session, "stop"]);
  await t.test(
    "stop captures immutable final results and hides them",
    async () => {
      const rows = await db.query(
        "select * from final_results where session_id=$1",
        [session],
      );
      assert.equal(rows.rows.length, 2);
      await identity("", "anon");
      assert.equal((await rpc("get_results", [session])).hidden, true);
      await identity(other);
      await rejects(
        () => rpc("submit_vote", [session, "Jamie", a, b, p2.code]),
        /not open/,
      );
    },
  );
  await identity(admin);
  await rpc("session_action", [session, "show"]);
  await identity("", "anon");
  assert.equal(
    (await rpc("get_results", [session])).teams.find((t) => t.id === b).votes,
    2,
  );
  await identity(admin);
  await rpc("session_action", [session, "archive"]);
  await t.test(
    "archive preserves private historical votes and final snapshot",
    async () => {
      assert.equal((await db.query("select * from votes")).rows.length, 2);
      assert.equal(
        (await rpc("get_results", [session])).teams.find((t) => t.id === b)
          .votes,
        2,
      );
      await identity("", "anon");
      assert.equal((await rpc("get_results", [session])).hidden, true);
      assert.equal(
        (await db.query("select * from voting_sessions")).rows.length,
        0,
      );
    },
  );
  await identity(admin);
  const open = await rpc("save_session", [
    null,
    "Open session",
    "",
    null,
    null,
    false,
  ]);
  const oa = await rpc("save_team", [null, open, "A", "#123456", false]);
  const ob = await rpc("save_team", [null, open, "B", "#abcdef", false]);
  await rpc("session_action", [open, "start"]);
  await identity(user);
  await t.test(
    "open registration atomically creates a participant and enforces one vote per identity",
    async () => {
      await rejects(
        () => rpc("submit_vote", [open, "User", oa, b, null]),
        /Invalid voting team/,
      );
      await rpc("submit_vote", [open, "User", oa, ob, null]);
      await rejects(
        () => rpc("submit_vote", [open, "Different name", oa, ob, null]),
        /already been submitted/,
      );
    },
  );
  await identity(admin);
  const future = await rpc("save_session", [
    null,
    "Scheduled",
    "",
    new Date(Date.now() + 3600000).toISOString(),
    new Date(Date.now() + 7200000).toISOString(),
    false,
  ]);
  const fa = await rpc("save_team", [null, future, "F1", "#ffffff", false]);
  const fb = await rpc("save_team", [null, future, "F2", "#000000", false]);
  await rpc("session_action", [future, "start"]);
  await identity(user);
  await t.test("scheduled start time is validated in the database", () =>
    rejects(
      () => rpc("submit_vote", [future, "User", fa, fb, null]),
      /not open/,
    ),
  );
  await identity(admin);
  const burst = await rpc("save_session", [
    null,
    "Duplicate burst",
    "",
    null,
    null,
    true,
  ]);
  const ba = await rpc("save_team", [null, burst, "Burst A", "#ffffff", false]);
  const bb = await rpc("save_team", [null, burst, "Burst B", "#000000", false]);
  const bp = await rpc("issue_participant", [burst, "Burst voter", ba]);
  await rpc("session_action", [burst, "start"]);
  await identity(user);
  await t.test(
    "parallel client duplicate burst records exactly one ballot (embedded execution is serialized)",
    async () => {
      const outcomes = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          rpc("submit_vote", [burst, "Burst voter", ba, bb, bp.code]),
        ),
      );
      assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(outcomes.filter((r) => r.status === "rejected").length, 19);
      await identity(admin);
      const rows = await db.query(
        "select count(*)::int as total from votes where session_id=$1",
        [burst],
      );
      assert.equal(rows.rows[0].total, 1);
    },
  );
  await identity(admin);
  const managed = await rpc("save_session", [
    null,
    "Managed session",
    "",
    null,
    null,
    true,
  ]);
  const ma = await rpc("save_team", [
    null,
    managed,
    "Managed A",
    "#ffffff",
    false,
  ]);
  const mb = await rpc("save_team", [
    null,
    managed,
    "Managed B",
    "#123456",
    false,
  ]);
  const unused = await rpc("issue_participant", [
    managed,
    "Unused participant",
    ma,
  ]);
  const mp = await rpc("issue_participant", [
    managed,
    "Managed participant",
    ma,
  ]);
  await identity(user);
  await t.test(
    "only admins can manage participants or write the audit log",
    async () => {
      await rejects(
        () => rpc("manage_participant", [managed, unused.id, "delete"]),
        /Administrator/,
      );
      await rejects(
        () => db.query("delete from participants where id=$1", [unused.id]),
        /permission denied/,
      );
      await rejects(
        () => db.exec("insert into participant_events default values"),
        /permission denied/,
      );
      assert.equal(
        (await db.query("select * from participant_events")).rows.length,
        0,
      );
    },
  );
  await identity(admin);
  await t.test(
    "delete only removes unused registrations in the selected session",
    async () => {
      await rejects(
        () => rpc("manage_participant", [managed, unused.id, "revoke"]),
        /no vote/,
      );
      await rejects(
        () => rpc("manage_participant", [burst, unused.id, "delete"]),
        /not found/,
      );
      await rejects(
        () => rpc("manage_participant", [managed, unused.id, "invalid"]),
        /Invalid participant action/,
      );
      await rpc("manage_participant", [managed, unused.id, "delete"]);
      assert.equal(
        (await db.query("select * from participants where id=$1", [unused.id]))
          .rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select * from participant_events where participant_id=$1 and action='delete'",
            [unused.id],
          )
        ).rows.length,
        1,
      );
      await identity(user);
      await rejects(
        () => rpc("resolve_participant", [managed, unused.code]),
        /Invalid participant code/,
      );
    },
  );
  await identity(admin);
  await rpc("session_action", [managed, "start"]);
  await identity(user);
  const firstReceipt = await rpc("submit_vote", [
    managed,
    "Managed participant",
    ma,
    mb,
    mp.code,
  ]);
  await identity(admin);
  await t.test(
    "revoke atomically deletes the ballot, updates live counts and preserves an admin audit",
    async () => {
      await rejects(
        () => rpc("manage_participant", [managed, mp.id, "delete"]),
        /Revoke the submitted vote/,
      );
      const signal = (
        await db.query("select nonce from result_signals where session_id=$1", [
          managed,
        ])
      ).rows[0].nonce;
      await rpc("manage_participant", [managed, mp.id, "revoke"]);
      assert.equal(
        (await db.query("select * from votes where participant_id=$1", [mp.id]))
          .rows.length,
        0,
      );
      assert.equal(
        (await rpc("get_results", [managed])).teams.find((t) => t.id === mb)
          .votes,
        0,
      );
      assert.notEqual(
        (
          await db.query(
            "select nonce from result_signals where session_id=$1",
            [managed],
          )
        ).rows[0].nonce,
        signal,
      );
      const audit = (
        await db.query(
          "select * from participant_events where participant_id=$1",
          [mp.id],
        )
      ).rows[0];
      assert.equal(audit.action, "revoke");
      assert.equal(audit.actor_id, admin);
      assert.equal(audit.previous_vote.voting_token, firstReceipt);
      assert.equal(
        (
          await db.query("select auth_user_id from participants where id=$1", [
            mp.id,
          ])
        ).rows[0].auth_user_id,
        user,
      );
      await rejects(
        () => rpc("manage_participant", [managed, mp.id, "revoke"]),
        /no vote/,
      );
    },
  );
  await identity(other);
  await t.test(
    "a revoked secure vote keeps the original identity and team binding",
    async () => {
      await rejects(
        () => rpc("submit_vote", [managed, "Other", ma, mb, mp.code]),
        /already used/,
      );
      await identity(user);
      assert.equal(
        (await rpc("resolve_participant", [managed, mp.code])).has_voted,
        false,
      );
      await rejects(
        () =>
          rpc("submit_vote", [managed, "Managed participant", ma, ma, mp.code]),
        /own team/,
      );
      await rejects(
        () =>
          rpc("submit_vote", [managed, "Managed participant", mb, ma, mp.code]),
        /Registered team/,
      );
      const replacement = await rpc("submit_vote", [
        managed,
        "Managed participant",
        ma,
        mb,
        mp.code,
      ]);
      assert.notEqual(replacement, firstReceipt);
      await rejects(
        () =>
          rpc("submit_vote", [managed, "Managed participant", ma, mb, mp.code]),
        /already been submitted/,
      );
    },
  );
  await identity(admin);
  await rpc("session_action", [managed, "stop"]);
  await t.test(
    "completed sessions reject revoke/delete and preserve their final snapshot",
    async () => {
      await rejects(
        () => rpc("manage_participant", [managed, mp.id, "revoke"]),
        /locked/,
      );
      await rejects(
        () => rpc("manage_participant", [managed, mp.id, "delete"]),
        /locked/,
      );
      assert.equal(
        (await rpc("get_results", [managed])).teams.find((t) => t.id === mb)
          .votes,
        1,
      );
      await rpc("session_action", [managed, "archive"]);
      await rejects(
        () => rpc("manage_participant", [managed, mp.id, "revoke"]),
        /locked/,
      );
    },
  );
  await t.test(
    "open registration can vote again after revocation without creating duplicate participants",
    async () => {
      const person = (
        await db.query(
          "select * from participants where session_id=$1 and auth_user_id=$2",
          [open, user],
        )
      ).rows[0];
      await rpc("manage_participant", [open, person.id, "revoke"]);
      await identity(user);
      await rejects(
        () => rpc("submit_vote", [open, "Different name", ob, oa, null]),
        /Registered team/,
      );
      await rpc("submit_vote", [open, "User", oa, ob, null]);
      await rejects(
        () => rpc("submit_vote", [open, "User", oa, ob, null]),
        /already been submitted/,
      );
      await identity(admin);
      assert.equal(
        (
          await db.query("select * from participants where session_id=$1", [
            open,
          ])
        ).rows.length,
        1,
      );
      assert.equal(
        (
          await db.query(
            "select participant_id from votes where session_id=$1",
            [open],
          )
        ).rows[0].participant_id,
        person.id,
      );
      await rpc("manage_participant", [open, person.id, "revoke"]);
      await rpc("manage_participant", [open, person.id, "delete"]);
      assert.equal(
        (await db.query("select * from participants where id=$1", [person.id]))
          .rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select * from participant_events where participant_id=$1",
            [person.id],
          )
        ).rows.length,
        3,
      );
    },
  );
  await db.close();
});
