// The transport (modes) figure's in-canvas legend is per-SYMBOL now that the
// markers distinguish the series: ● x_T + ✕ x_0 (one each, not one per mode
// color); the trajectories plot adds a ─ trajectory entry.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('modes legend is per-symbol (xT dot + x0 cross, + trajectory line)', async ({ page }) => {
  await ready(page);

  // endpoints legend: exactly two symbol entries — x_T and x_0
  const epMarks = page.locator('#modes-endpoints-legend .lg-mark');
  await expect(epMarks).toHaveCount(2);

  // trajectories legend: the same two + a "trajectory" line entry = 3 marks
  const trMarks = page.locator('#modes-canvas-legend .lg-mark');
  await expect(trMarks).toHaveCount(3);
  await expect(page.locator('#modes-canvas-legend')).toContainText(/trajectory/i);

  // the first entry is the red x_T DOT marker
  const first = epMarks.first();
  expect(await first.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(220, 38, 38)');
  expect((await first.textContent()).trim()).toBe('●'); // a dot, not ✕

  // the old below-canvas legend paragraph is gone
  expect(await page.locator('#modes-panel p.legend').count()).toBe(0);
});
