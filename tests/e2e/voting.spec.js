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
          teams: teams.map((t, i) => ({ ...t, votes: [72, 58, 46][i] })),
        };
      if (name === "submit_vote") data = "40000000-0000-4000-8000-000000000001";
      if (name === "resolve_participant")
        data = { full_name: "Alex Johnson", team_id: a, has_voted: false };
      if (name === "issue_participant")
        data = { id: "new-person", code: "a".repeat(64) };
      if (name === "session_action") {
        const ac = body.p_action;
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
    else if (url.pathname.includes("/rest/v1/teams")) data = teams;
    else if (url.pathname.includes("/rest/v1/participants")) data = [];
    else if (url.pathname.includes("/rest/v1/votes")) data = [];
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
  return { session, calls, errors };
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
