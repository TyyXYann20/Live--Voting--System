# Local verification

Completed in the workspace using Node, embedded PostgreSQL, Vite and Chromium.

| Check                                       | Result                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Dependency installation/audit               | Successful, no vulnerabilities reported at install                                 |
| Database and ranking suite (`npm test`)     | 34 passing checks                                                                  |
| Production bundle (`npm run build`)         | Successful                                                                         |
| Playwright (`npm run test:e2e`)             | 22 passing browser flows                                                           |
| Desktop/mobile visual inspection            | Reviewed at 1440px, 390px and 320px; centered participant dialogs and mobile cards |
| Browser runtime exceptions in checked flows | None                                                                               |
| Supabase production connection              | Not configured or verified                                                         |
| Vercel deployment                           | Not performed                                                                      |

Browser plugin was unavailable; Playwright Chromium was used. HTTP fixtures isolate frontend behavior and do not verify actual Supabase Auth or WebSocket service behavior. Live replication is not available in the embedded PostgreSQL test runtime. The duplicate-burst test issues parallel client promises, but the embedded database serializes execution; genuine multi-connection races and load remain deployment checks.

Fullscreen projector checks use real Chromium fullscreen entry/exit at 1600×900. They verify an authorized reveal, six teams with numeric chart labels, a count update through polling without replacing the QR canvas, all-results reset from Top 3, projector show/hide controls, blocked public reveals, failed backend authorization, and unsupported-browser fallback. No hosted event visibility setting was changed during these tests.

See `TESTING.md` for remaining real-environment checks. No production credentials, deployment, physically scanned QR code, or production capacity is claimed as tested.

Bulk-team checks cover comma/newline parsing, trailing separators, case-insensitive duplicate/existing-name skipping, Unicode name limits, 100 distinct generated colors, oversized input, administrator permissions, atomic rollback, existing-team conflicts and post-start locking. Browser tests exercise the centered mobile preview, a single batch request, rendered saved teams, validation and retained input after a failed save. The new migration has not been applied to the hosted Supabase project by the agent.
