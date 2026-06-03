// Playwright config — drives the static docs/ site in a real Chromium.
// The static site is served by Python's stdlib http.server (no app server),
// matching the "0 server-side runtime" constraint: the server only hands out
// files, all compute happens in the browser via Pyodide.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 5173;

module.exports = defineConfig({
  testDir: './tests',
  // Pyodide cold-start + micropip install can take a while on first load.
  timeout: 120_000,
  expect: { timeout: 90_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT} --directory docs`,
    // Use the directory root for readiness: it returns 200 even before
    // index.html exists, so a missing page surfaces as a clean assertion
    // failure in the test rather than a webServer startup timeout.
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
