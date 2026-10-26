import { test, expect } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
const sid = "10000000-0000-4000-8000-000000000001";
const a = "20000000-0000-4000-8000-000000000001",
  b = "20000000-0000-4000-8000-000000000002",
  c = "20000000-0000-4000-8000-000000000003";
const teams = [
  { id: a, session_id: sid, name: "Orion", color: "#c3f56b", is_active: true },
  { id: b, session_id: sid, name: "Nova", color: "#729bff", is_active: true },
  { id: c, session_id: sid, name: "Zenith", color: "#9b7bff", is_active: true },
];
async function fixture(
  page,
  {
    admin = false,
    visible = true,
    codes = false,
    status = "LIVE",
    signedIn = true,
    people = [],
    ballots = [],
    managementError = null,
    teamList = teams,
    scores = [72, 58, 46],
    visibilityError = null,
  } = {},
) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const session = {
    id: sid,
    name: "Annual Team Showcase",
    description: "Celebrate the teams that made a difference.",
    status,
    require_codes: codes,
    results_visible: visible,
    created_at: "2026-10-26T00:00:00Z",
    updated_at: "2026-10-26T00:00:00Z",
    archived_at: null,
  };
  const user = {
    id: "30000000-0000-4000-8000-000000000001",
    email: admin ? "admin@example.test" : undefined,
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: !admin,
  };
  const token = [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(
      JSON.stringify({
        sub: user.id,
        role: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ),
    "test-signature",
  ].join(".");
  if (signedIn)
    await page.addInitScript(
      ({ token, user }) =>
        localStorage.setItem(
          "sb-pulse-test-auth-token",
          JSON.stringify({
            access_token: token,
            refresh_token: "test-refresh",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: "bearer",
            user,
          }),
        ),
      { token, user },
    );
  const calls = [];
  await page.route("https://pulse-test.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    let data = [];
    const body = route.request().postDataJSON?.();
    if (url.pathname.includes("/rpc/")) {
      const name = url.pathname.split("/").pop();
      calls.push({ name, body });
      if (name === "is_admin") data = admin;
      if (name === "get_results")
        data = {
          hidden: !admin && !session.results_visible,
          teams: teamList.map((t, i) => ({ ...t, votes: scores[i] || 0 })),
        };
      if (name === "submit_vote") data = "40000000-0000-4000-8000-000000000001";
      if (name === "resolve_participant")
        data = { full_name: "Alex Johnson", team_id: a, has_voted: false };
      if (name === "issue_participant")
        data = { id: "new-person", code: "a".repeat(64) };
      if (name === "manage_participant") {
        if (managementError) {
          await route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ message: managementError, code: "P0001" }),
          });
          return;
        }
        const index = ballots.findIndex(
          (v) => v.participant_id === body.p_participant,
        );
        if (body.p_action === "revoke" && index >= 0) ballots.splice(index, 1);
        if (body.p_action === "delete") {
          const p = people.findIndex((p) => p.id === body.p_participant);
          if (p >= 0) people.splice(p, 1);
        }
        data = null;
      }
      if (name === "session_action") {
        const ac = body.p_action;
        if (ac === "show" && visibilityError) {
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({ message: visibilityError, code: "42501" }),
          });
          return;
        }
        if (ac === "hide") session.results_visible = false;
        if (ac === "show") session.results_visible = true;
        if (ac === "pause") session.status = "PAUSED";
        if (ac === "resume") session.status = "LIVE";
        if (ac === "stop") {
          session.status = "STOPPED";
          session.results_visible = false;
        }
        data = null;
      }
      if (name === "save_session" || name === "save_team") data = sid;
    } else if (url.pathname.includes("/rest/v1/voting_sessions"))
      data = [session];
    else if (url.pathname.includes("/rest/v1/teams")) data = teamList;
    else if (url.pathname.includes("/rest/v1/participants")) data = people;
    else if (url.pathname.includes("/rest/v1/votes")) data = ballots;
    else if (url.pathname.includes("/auth/v1/"))
      data = {
        user,
        access_token: token,
        refresh_token: "test-refresh",
        expires_in: 3600,
        token_type: "bearer",
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return { session, calls, errors, scores };
}
test("participant mobile flow excludes own team, confirms and records receipt", async ({
  page,
}) => {
  const { calls, errors } = await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/vote/${sid}`);
  await expect(
    page.getByRole("heading", { name: "Annual Team Showcase" }),
  ).toBeVisible();
  await page.getByLabel("Your full name").fill("Alex Johnson");
  await page.getByLabel("Your team").selectOption(a);
  await expect(
    page.locator(".team-choice").filter({ hasText: "Orion" }),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: "Nova" }).check();
  await page.getByRole("button", { name: "Review my vote" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Confirm my vote" }).click();
  await expect(
    page.getByRole("heading", { name: "Your voice counts." }),
  ).toBeVisible();
  expect(
    calls.some(
      (c) =>
        c.name === "submit_vote" &&
        c.body.p_own_team === a &&
        c.body.p_voted_team === b,
    ),
  ).toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
test("secure participant code locks registered name and team", async ({
  page,
}) => {
  await fixture(page, { codes: true });
  await page.goto(`/vote/${sid}`);
  await page.getByLabel("Your participant code").fill("a".repeat(64));
  await page.getByRole("button", { name: "Verify my code" }).click();
  await expect(page.getByLabel("Your full name")).toHaveValue("Alex Johnson");
  await expect(page.getByLabel("Your full name")).toHaveAttribute(
    "readonly",
    "",
  );
  await expect(page.getByLabel("Your team")).toBeDisabled();
});
test("protected admin route rejects participant identity", async ({ page }) => {
  await fixture(page);
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/admin\/login/);
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
test("live results, QR, top three, team details and manual winner presentation", async ({
  page,
}) => {
  const { errors } = await fixture(page, { admin: true, status: "STOPPED" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/admin/results?session=${sid}`);
  await expect(page.getByText("Team votes and ranking")).toBeVisible();
  await expect(page.locator(".qr-image canvas")).toBeVisible();
  await page.getByRole("button", { name: "Top 3", exact: true }).click();
  await expect(page.locator(".podium")).toBeVisible();
  await page.locator(".podium-team").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Announce winner" }).click();
  await expect(
    page.getByRole("dialog", { name: "Winner announcement" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to results" }).click();
  await expect(page.locator(".qr-image")).toBeVisible();
  await page.screenshot({
    path: join(tmpdir(), "pulse-voting-qa", "live-results.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("public projector hides counts, keeps QR, then reveals on polling fallback", async ({
  page,
}) => {
  const { session } = await fixture(page, { visible: false });
  await page.clock.install();
  await page.goto(`/projector/${sid}`);
  await expect(page.getByText("The big reveal is coming.")).toBeVisible();
  await expect(page.getByText("Total votes", { exact: true })).toHaveCount(0);
  await expect(page.locator(".qr-image canvas")).toBeVisible();
  session.results_visible = true;
  await page.clock.fastForward(11000);
  await expect(page.getByText("Total votes", { exact: true })).toBeVisible();
  await expect(page.locator(".qr-image canvas")).toBeVisible();
});
test("admin creation, team management and participant code controls call real service functions", async ({
  page,
}) => {
  const { calls } = await fixture(page, {
    admin: true,
    status: "DRAFT",
    codes: true,
  });
  await page.goto("/admin/sessions");
  await page
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await page.getByLabel("Session name").fill("New event");
  await page.getByRole("button", { name: "Save session" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    calls.some(
      (c) => c.name === "save_session" && c.body.p_name === "New event",
    ),
  ).toBeTruthy();
  await page.goto("/admin/teams");
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  await page.getByLabel("Team name").fill("Apex");
  await page.getByRole("button", { name: "Save team" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    calls.some((c) => c.name === "save_team" && c.body.p_name === "Apex"),
  ).toBeTruthy();
  await page.goto("/admin/participants");
  await page
    .getByRole("button", { name: "Register participant", exact: true })
    .click();
  await page.getByLabel("Full name").fill("Sam Example");
  await page.getByLabel("Registered team").selectOption(a);
  await page.getByRole("button", { name: "Create secure code" }).click();
  await expect(page.getByLabel("New participant code")).toHaveValue(
    "a".repeat(64),
  );
});
test("QR enlargement, PNG download and mobile results fit viewport", async ({
  page,
}) => {
  await fixture(page, { admin: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/admin/results?session=${sid}`);
  await page.getByRole("button", { name: "Enlarge QR code" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download QR code" }).click();
  expect((await download).suggestedFilename()).toContain(".png");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: join(tmpdir(), "pulse-voting-qa", "mobile-results.png"),
    fullPage: true,
  });
});
test("pause, resume, stop, hide and reveal controls preserve administrator choice", async ({
  page,
}) => {
  const { calls } = await fixture(page, { admin: true });
  await page.goto(`/admin/results?session=${sid}`);
  await page.getByRole("button", { name: "Hide results", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show results", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause voting" }).click();
  await expect(
    page.getByRole("button", { name: "Resume voting" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume voting" }).click();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Stop voting", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reveal results" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Announce winner" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal results" }).click();
  await expect(
    page.getByRole("button", { name: "Announce winner" }),
  ).toBeVisible();
  expect(
    calls
      .filter((c) => c.name === "session_action")
      .map((c) => c.body.p_action),
  ).toEqual(["hide", "pause", "resume", "stop", "show"]);
});
test("administrator password login opens protected dashboard and navigation", async ({
  page,
}) => {
  const { errors } = await fixture(page, { admin: true, signedIn: false });
  await page.goto("/admin/login");
  await page.getByLabel("Email address").fill("admin@example.test");
  await page.getByLabel("Password").fill("test-only-password");
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await expect(page).toHaveURL(/admin\/dashboard/);
  await expect(
    page.getByRole("heading", { name: "Event overview" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Event history" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Workspace settings" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

const pendingPerson = {
  id: "50000000-0000-4000-8000-000000000001",
  session_id: sid,
  full_name: "Sam Example",
  team_id: a,
  created_at: "2026-10-27T00:00:00Z",
};
const votedPerson = {
  id: "50000000-0000-4000-8000-000000000002",
  session_id: sid,
  full_name: "Alex Johnson",
  team_id: b,
  created_at: "2026-10-27T00:00:00Z",
};
const castBallot = {
  id: "60000000-0000-4000-8000-000000000001",
  session_id: sid,
  participant_id: votedPerson.id,
  voted_team_id: a,
};

async function expectCentered(page) {
  const box = await page.getByRole("dialog").boundingBox();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(3);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(
    3,
  );
}

test("mobile participant cards revoke a vote and then allow registration deletion", async ({
  page,
}) => {
  const { calls, errors } = await fixture(page, {
    admin: true,
    codes: true,
    people: [{ ...pendingPerson }, { ...votedPerson }],
    ballots: [{ ...castBallot }],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/participants");
  await expect(
    page.getByRole("button", { name: "Delete Alex Johnson", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Revoke vote for Alex Johnson" })
    .click();
  await expectCentered(page);
  await page.screenshot({
    path: join(tmpdir(), "pulse-voting-qa", "mobile-revoke.png"),
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(calls.filter((c) => c.name === "manage_participant")).toHaveLength(0);
  await page
    .getByRole("button", { name: "Revoke vote for Alex Johnson" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revoke vote", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "Alex Johnson" });
  await expect(row.getByText("AWAITING VOTE", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Revoke vote for Alex Johnson" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Delete Alex Johnson", exact: true })
    .click();
  await expectCentered(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete participant", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "Alex Johnson" }),
  ).toHaveCount(0);
  expect(
    calls
      .filter((c) => c.name === "manage_participant")
      .map((c) => c.body.p_action),
  ).toEqual(["revoke", "delete"]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: join(tmpdir(), "pulse-voting-qa", "mobile-participants.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("small mobile register and code dialogs are centered and keep keyboard focus inside", async ({
  page,
}) => {
  await fixture(page, { admin: true, codes: true });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/admin/participants");
  await page
    .getByRole("button", { name: "Register participant", exact: true })
    .click();
  await expectCentered(page);
  await page.getByLabel("Full name").fill("Sam Example");
  await page.getByLabel("Registered team").selectOption(a);
  await page.screenshot({
    path: join(tmpdir(), "pulse-voting-qa", "mobile-register.png"),
  });
  await page
    .getByRole("button", { name: "Create secure code", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Participant code created" }),
  ).toBeVisible();
  await expectCentered(page);
  await page.getByRole("button", { name: "Done", exact: true }).focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      document.querySelector("dialog").contains(document.activeElement),
    ),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("participant action errors stay in the centered dialog without changing the row", async ({
  page,
}) => {
  await fixture(page, {
    admin: true,
    codes: true,
    people: [{ ...votedPerson }],
    ballots: [{ ...castBallot }],
    managementError: "Participant records are locked for completed sessions",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/participants");
  await page
    .getByRole("button", { name: "Revoke vote for Alex Johnson" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Revoke vote", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "locked for completed sessions",
  );
  await expectCentered(page);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Alex Johnson" })
      .getByText("VOTED", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("completed sessions disable register, revoke and delete controls", async ({
  page,
}) => {
  await fixture(page, {
    admin: true,
    codes: true,
    status: "STOPPED",
    people: [{ ...pendingPerson }, { ...votedPerson }],
    ballots: [{ ...castBallot }],
  });
  await page.goto("/admin/participants");
  await expect(
    page.getByRole("button", { name: "Register participant", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Revoke vote for Alex Johnson" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Delete Sam Example", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "This session is complete. Participant records and final results are locked.",
    ),
  ).toBeVisible();
});

test("desktop participant management keeps actions visible and filters voting status", async ({
  page,
}) => {
  await fixture(page, {
    admin: true,
    codes: true,
    people: [{ ...pendingPerson }, { ...votedPerson }],
    ballots: [{ ...castBallot }],
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/participants");
  await page.getByLabel("Filter voting status").selectOption("voted");
  await expect(
    page.getByRole("row").filter({ hasText: "Sam Example" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Revoke vote for Alex Johnson" })
    .click();
  await expectCentered(page);
  await page.screenshot({
    path: join(tmpdir(), "pulse-voting-qa", "desktop-revoke.png"),
  });
});

test("admin fullscreen reveals every team, keeps QR visible, and refreshes vote counts", async ({
  page,
}) => {
  const teamList = [
    ...teams,
    ...["Apex", "Horizon", "Vertex"].map((name, i) => ({
      id: `20000000-0000-4000-8000-00000000000${i + 4}`,
      session_id: sid,
      name,
      color: ["#ffb164", "#fc86b7", "#7debd0"][i],
      is_active: true,
    })),
  ];
  const { scores, calls, errors } = await fixture(page, {
    admin: true,
    visible: false,
    teamList,
    scores: [72, 58, 46, 32, 24, 16],
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.clock.install();
  await page.goto(`/projector/${sid}`);
  await expect(page.getByText("The big reveal is coming.")).toBeVisible();
  await page
    .getByRole("button", { name: "Show results & full screen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Exit full screen", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Boolean(document.fullscreenElement)),
  ).toBeTruthy();
  await expect(
    page.locator(".stat").filter({ hasText: "Total votes" }).locator("strong"),
  ).toHaveText("248");
  await expect(
    page.getByRole("button", { name: "All results", exact: true }),
  ).toHaveClass("active");
  for (const team of teamList)
    await expect(
      page
        .locator(".results-panel")
        .getByText(new RegExp(`\\d+\\. ${team.name}$`)),
    ).toBeVisible();
  await expect(
    page.locator(".results-panel").getByText("72 (29.0%)", { exact: true }),
  ).toBeVisible();
  const qr = page.locator(".qr-image canvas");
  await expect(qr).toBeVisible();
  const canvas = await qr.elementHandle();
  scores[5] += 3;
  await page.clock.fastForward(11000);
  await expect(
    page.locator(".stat").filter({ hasText: "Total votes" }).locator("strong"),
  ).toHaveText("251");
  expect(await canvas.evaluate((el) => el.isConnected)).toBeTruthy();
  await expect(
    page.locator(".results-panel").getByText("19 (7.6%)", { exact: true }),
  ).toBeVisible();
  const chart = await page.locator(".results-chart").boundingBox();
  const qrBox = await qr.boundingBox();
  expect(chart.y + chart.height).toBeLessThanOrEqual(900);
  expect(qrBox.y + qrBox.height).toBeLessThanOrEqual(900);
  await page.screenshot({
    path: join(tmpdir(), "pulse-voting-qa", "fullscreen-projector.png"),
  });
  await page
    .getByRole("button", { name: "Exit full screen", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBeFalsy();
  expect(
    calls
      .filter((c) => c.name === "session_action")
      .map((c) => c.body.p_action),
  ).toEqual(["show"]);
  expect(errors).toEqual([]);
});

test("projector show/hide controls and fullscreen reset Top 3 back to all teams", async ({
  page,
}) => {
  await fixture(page, { admin: true, visible: true });
  await page.goto(`/projector/${sid}`);
  await page.getByRole("button", { name: "Top 3", exact: true }).click();
  await expect(page.locator(".podium")).toBeVisible();
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "All results", exact: true }),
  ).toHaveClass("active");
  await expect(page.locator(".results-chart")).toBeVisible();
  await page.getByRole("button", { name: "Hide results", exact: true }).click();
  await expect(page.getByText("The big reveal is coming.")).toBeVisible();
  await expect(page.getByText("Total votes", { exact: true })).toHaveCount(0);
  await expect(page.locator(".qr-image canvas")).toBeVisible();
  await page.getByRole("button", { name: "Show results", exact: true }).click();
  await expect(page.getByText("Total votes", { exact: true })).toBeVisible();
});

test("a public fullscreen viewer cannot reveal hidden results", async ({
  page,
}) => {
  const { calls } = await fixture(page, { visible: false });
  await page.goto(`/projector/${sid}`);
  await expect(
    page.getByRole("button", { name: "Show results", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Exit full screen", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("The big reveal is coming.")).toBeVisible();
  await expect(page.getByText("Total votes", { exact: true })).toHaveCount(0);
  expect(calls.filter((c) => c.name === "session_action")).toHaveLength(0);
});

test("failed reveal stays hidden even when the browser enters fullscreen", async ({
  page,
}) => {
  await fixture(page, {
    admin: true,
    visible: false,
    visibilityError: "Administrator access required",
  });
  await page.goto(`/projector/${sid}`);
  await page
    .getByRole("button", { name: "Show results & full screen", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Administrator access required",
  );
  await expect(page.getByText("The big reveal is coming.")).toBeVisible();
  await expect(page.getByText("Total votes", { exact: true })).toHaveCount(0);
});

test("unsupported fullscreen still reveals results in normal projector mode", async ({
  page,
}) => {
  await fixture(page, { admin: true, visible: false });
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("Not supported"));
  });
  await page.goto(`/projector/${sid}`);
  await page
    .getByRole("button", { name: "Show results & full screen", exact: true })
    .click();
  await expect(page.getByText("Total votes", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Fullscreen is unavailable",
  );
  await expect(page.locator(".results-chart")).toBeVisible();
  await expect(page.locator(".qr-image canvas")).toBeVisible();
});
