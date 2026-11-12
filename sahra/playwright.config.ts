import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "off" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "host-720p", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } },
  ],
  // Runs against a production build. Build first: `npm run build`.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
