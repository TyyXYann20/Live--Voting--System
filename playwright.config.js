import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: join(tmpdir(), "pulse-voting-qa", "runs"),
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5173", headless: true },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "https://pulse-test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-only-public-key",
      VITE_SITE_URL: "http://127.0.0.1:5173",
    },
  },
  reporter: "list",
});
