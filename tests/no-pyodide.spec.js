// KR7 — keystone disconfirming test: the page is a pure-JS viewer with NO
// Pyodide. If Pyodide were still wired, this fails on the network assertions.
const { test, expect } = require('@playwright/test');

test('KR7: no pyodide network requests, all panels render from JSON', async ({ page }) => {
  const urls = [];
  page.on('request', (req) => urls.push(req.url()));

  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  // No request URL may contain "pyodide", and nothing may hit jsDelivr for it.
  for (const u of urls) {
    expect(u.toLowerCase()).not.toContain('pyodide');
    expect(u).not.toMatch(/cdn\.jsdelivr\.net.*pyodide/i);
  }

  // All panels rendered from the precomputed JSON.
  await expect(page.locator('#forward-scatter')).toHaveAttribute('data-point-count', '200');
  await expect(page.locator('#reverse-x0')).toHaveAttribute('data-point-count', '200');
  // reverse trajectory panel (scrubable) renders the recorded frames as a trail.
  // (The panel defaults to the noise start = 1 frame, so scrub to build the trail.)
  await expect(page.locator('#reverse-traj')).toHaveAttribute('data-point-count', '200');
  const revSlider = page.locator('#reverse-step-slider');
  await revSlider.fill((await revSlider.getAttribute('max')) || '0');
  await revSlider.dispatchEvent('input');
  const trail = parseInt(
    (await page.locator('#reverse-traj').getAttribute('data-trail-steps')) || '0',
    10
  );
  expect(trail).toBeGreaterThanOrEqual(2);
});
