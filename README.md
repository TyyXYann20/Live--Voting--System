# Pulse — Company Live Team Voting

A React + Vite JavaScript application with independent participant and administrator interfaces, PostgreSQL-enforced voting, and a projector that keeps its QR code beside live results. No server, paid API, Firebase, or Sheets is required. **Hosted Supabase and Vercel are not configured or verified by this repository.**

## What is included

- Mobile `/vote` session picker and `/vote/:sessionId` voting with confirmation and a unique receipt.
- Supabase Auth administrator login and role-checked routes: dashboard, sessions, teams, participants, results, history, settings.
- Dynamic sessions, teams, colors, participant registration, one-time secure code issuance, start/pause/resume/stop/archive.
- Secure codes enabled by default; codes identify both participant and registered team. Only SHA-256 hashes of 244-bit random codes are stored.
- Atomic voting RPC: session lock, unique participant identity, unique vote/token, team membership checks, own-team prohibition, and time-window checks. No client role or count is trusted.
- Realtime invalidation using safe session metadata and signals, plus ten-second reconciliation polling, reconnect refresh, and focus/online refresh.
- `/projector/:sessionId`: QR and results together, fullscreen, hide/reveal, all results, tied rankings, Top 3 podium, team detail dialog. Admin workspace includes manual full-screen winner celebration; projector can be fullscreen separately. No automatic winner announcement.
- QR enlargement, PNG download, copy link, and a print layout.
- Stop saves a final snapshot and hides results. Historical sessions retain votes, teams, participants, and snapshots. A stopped session cannot be reopened.
- Dark navy/lime design, responsive sidebar, reduced-motion behavior, labeled inputs, keyboard focus states, native modal focus trapping, toasts, loading and error states.

## Local setup

Use Node.js **22.12+** (or a newer supported LTS) and npm.

```powershell
npm install
Copy-Item .env.example .env
# Fill .env as described below.
npm run dev
```

Open `http://127.0.0.1:5173`. Without credentials, the participant page shows a truthful setup state and admin sign-in explains the missing connection. There is no demo login or seeded production vote data.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_LEGACY_ANON_KEY
VITE_SITE_URL=http://127.0.0.1:5173
VITE_HCAPTCHA_SITE_KEY=
```

All `VITE_` values are public and bundled at build time. **Never put a service role key, database password, JWT secret, or CAPTCHA secret here.** `.env` is ignored. The publishable/anon key is intentionally public; RLS and RPC authorization secure the data.

## Supabase setup

1. Create a project at [Supabase](https://supabase.com/dashboard). Keep the database password private.
2. In SQL Editor, run the entire file `supabase/migrations/202610260001_voting.sql` **once**. It expects Supabase's `auth` schema, `anon`/`authenticated` roles, and existing `supabase_realtime` publication. Alternatively use the CLI:

   ```powershell
   npx supabase login
   npx supabase init
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

3. Authentication → Sign In / Providers: enable **Email/password** and **Anonymous Sign-Ins**. Anonymous identities are required for participants. Enable new users if required for anonymous sign-ins; unapproved accounts still cannot gain administrator privileges. There is no public admin signup UI.
4. Authentication → URL Configuration: set Site URL to your deployed HTTPS origin; add your localhost and production origins as permitted redirects. Password login itself does not use a redirect flow.
5. For public events, enable **hCaptcha** in Supabase Auth attack protection. Store its secret only in Supabase. Set the corresponding public site key as `VITE_HCAPTCHA_SITE_KEY`; allow localhost and your production hostname at hCaptcha. The app passes the solved token to anonymous sign-in. Test this with a fresh browser identity. If CAPTCHA is disabled in Supabase, leave the site key empty.
6. Authentication → Users → Add user: create the administrator with a strong password and confirmed email. Replace the email in `supabase/bootstrap-admin.sql`, then run it in SQL Editor. It fails if that Auth user does not exist. Never use user-editable metadata to assign roles. Additional admins use the same trusted process; revoke by changing `profiles.role` in SQL Editor.
7. Copy Project URL and publishable (or legacy anon) key from Project Settings → API into `.env`. Restart Vite after changes.
8. Verify Realtime → Publications includes **only** `voting_sessions`, `teams`, and `result_signals` for this app. The migration adds them. Never add `votes`, `participants`, or `final_results` to a public publication.
9. Sign in at `/admin/login`, create a session, add at least two teams, register participants if codes are required, and privately distribute each one-time code. Retain codes securely when generated; raw codes cannot be recovered later.

No Edge Function is necessary: database RPCs perform all privileged operations with a fixed empty search path, explicit object qualification, explicit execute grants, and administrator checks.

## Security model and event operation

**Secure mode (default):** a code is a bearer credential. Treat it like a ticket and deliver it privately. It binds a participant to their team; names and team values supplied by the browser cannot override that registration. A successful ballot binds the record to its authenticated identity. Each participant has at most one ballot and each identity has at most one participant per session. Codes cannot be reused from another device after voting. The receipt is a random vote token, not access to private ballot data.

**Open mode:** an anonymous Auth identity and database constraint prevent repeated voting in that identity. Clearing browser storage, another device, or a fresh identity can bypass this person-level limit. Team selection is self-reported. This cannot securely prevent impersonation; use code mode when eligibility matters. Names alone are never a uniqueness key. An administrator who also participates should use a separate browser profile to keep admin and participant identities separate.

Tables allow no direct application-role writes, including administrator clients. All writes go through authorized RPCs. Public users can read event/team metadata only. Participants, ballots, and final snapshot tables are admin-only. `get_results` returns an empty hidden response unless results are visible or the caller is an admin. Hidden sessions suppress public result signals as well. Admins can inspect results privately while a projector remains hidden. Hiding cannot retract counts already seen or captured by a viewer while results were public.

Session actions lock the session exclusively. Vote submissions use a shared session lock, so a stop waits for already-accepted transactions to finish and then rejects later submissions. The stop transaction snapshots all committed votes and sets visibility false. Team edits/deletes are restricted to drafts and cannot delete teams referenced by participant records. Session records cannot be deleted through the API.

Scheduled times restrict vote acceptance but **do not automatically start, stop, or snapshot sessions**. Start and stop are deliberate administrator actions. At the scheduled end, voting rejects immediately; click Stop to capture the final snapshot. The Top 3 view uses competition ranking (`1, 1, 3`); ties can put more than three teams in the top three ranks. Zero votes share rank 1 but cannot trigger a winner announcement.

Before an event: open results, test the deployed QR on an actual phone, start voting, and decide whether to show interim totals. Stop → review privately → Reveal Results → Announce Winner. Use screen sharing or the admin results screen in fullscreen for the winner animation. QR stays visible during ordinary chart refreshes; full-screen celebration is a separate intentional view.

The public projector has no private data. Distribute its URL only if the audience should see revealed aggregate results. Participant pages never display counts. Settings reflect deployment configuration; environment changes require a rebuild. Auth password recovery/account lifecycle is managed by your trusted operator in Supabase, not a public account-management UI.

## Verification

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run preview
```

`npm test` runs real embedded PostgreSQL (PGlite), not an in-memory vote simulator. Tests apply the migration with Supabase auth/role fixtures and exercise RLS, unauthorized direct writes, codes, invalid/self/cross-session targets, duplicate ballots, state transitions, scheduling, snapshots, visibility, and history. The logical replication publication statement is excluded because PGlite has no publisher.

Playwright launches Vite with **test-only** environment values and intercepts Supabase HTTP requests. These fixtures exist only in tests, never in production. Tests cover mobile voting/confirmation, secure code registration, protected routes, session/team/participant controls, QR display/download, result views, team dialogs, winner animation, hidden public projection, and polling fallback. They verify frontend behavior against API contracts, not live Supabase Auth or WebSockets.

See `docs/TESTING.md` for the deployment acceptance checklist, including real parallel transactions, Realtime reconnection, CAPTCHA, QR scanning, and commercial deployment checks. These require your project and devices and are **not claimed as verified**.

## GitHub

Create an empty private or public repository on GitHub, without adding a README there. Then:

```powershell
git init
git add .
git commit -m "Build Pulse company live voting system"
git branch -M main
git remote add origin https://github.com/YOUR_ORG/company-live-voting.git
git push -u origin main
```

Review `git status` before committing: `.env`, node_modules, screenshots, and local caches must remain untracked. The lockfile should be committed. No GitHub repository is created or pushed automatically.

## Vercel deployment

1. Push to GitHub, then Vercel → Add New Project → Import the repository.
2. Framework: **Vite**. Root: repository root. Install: `npm ci`. Build: `npm run build`. Output: `dist`.
3. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL` (your final HTTPS domain), and optional `VITE_HCAPTCHA_SITE_KEY` in Vercel environment variables for the intended environments. Never add service-role credentials.
4. Deploy. If the final hostname was unknown initially, set `VITE_SITE_URL` to the assigned URL and **redeploy**. A custom domain is preferable for stable QR codes.
5. Update Supabase Site URL/redirect configuration and hCaptcha allowed hostnames to match. Prefer a separate Supabase project for previews and test data; preview builds must not silently use production ballots.
6. Open `/admin/login`, `/vote`, a direct `/vote/SESSION_ID` URL, and `/projector/SESSION_ID` after a hard reload. `vercel.json` provides SPA rewrites and basic security headers.
7. Perform every acceptance check in `docs/TESTING.md`. HTTPS and a real phone are necessary to validate a deployed QR workflow.

**Company use and free tiers (checked October 26, 2026):** [Vercel Hobby](https://vercel.com/docs/plans/hobby) and [Vercel terms](https://vercel.com/legal/terms) restrict Hobby to personal, non-commercial use. Do not assume a company event application qualifies because it charges no admission. Use an eligible Vercel paid plan or obtain clarification from Vercel; the requested company deployment cannot be promised free Vercel hosting.

[Supabase free allowances](https://supabase.com/docs/guides/platform/billing-on-supabase) include 500 MB database per project and 2 million Realtime messages. [Realtime limits](https://supabase.com/docs/guides/realtime/limits) include Free connection/throughput caps (currently 200 peak connections and 100 messages/second). Fan-out consumes messages per subscriber. Restrict projector tabs, use participant polling when appropriate, and load-test for your event size. Polling is automatic fallback but consumes database/API resources. Free projects can pause with inactivity, lack paid backup guarantees, and have Auth rate limits; inspect project health before the event and arrange your own backup. See [anonymous Auth guidance](https://supabase.com/docs/guides/auth/auth-anonymous) for CAPTCHA and anonymous-user cleanup. Recheck provider terms and quotas before launch.

## Project map

```text
public/                     Favicon
src/
  components/               Shared UI, layouts, CAPTCHA, QR, result/podium/winner views
  hooks/                    Auth and live data lifecycle
  pages/                    Participant, login, dashboard, sessions, teams,
                            participants, live results, history, settings
  services/supabase.js       Public client and paginated queries/RPC wrapper
  utils/results.js           Tie-aware rankings and deployed voting URLs
  App.jsx, main.jsx          Routing, providers, error boundary
  index.css                 Responsive design system, print and motion rules
supabase/
  migrations/               Schema, constraints, RLS, RPCs, safe Realtime publication
  bootstrap-admin.sql       Trusted first-admin initialization
tests/                      PostgreSQL/ranking tests and Playwright browser tests
docs/                       Visual concept and deployed acceptance checklist
.env.example                Public configuration template
vercel.json                 SPA deployment configuration
```

No credentials or hosting accounts have been invented. Remaining setup is creating your Supabase project/admin, supplying public frontend configuration, deploying, and completing the live acceptance checks. Do not describe the system as production-verified until those checks pass for your actual deployment and event load.
