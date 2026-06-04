// The transport (modes) figure shows an in-canvas legend on each plot's
// top-left: x_T + one x_0 entry per mode color (× marks); the trajectories plot
// adds a "trajectory" line entry. Replaces the old below-canvas legend.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('modes canvases carry an in-canvas legend (xT + x0 modes, + trajectory)', async ({ page }) => {
  await ready(page);

  // endpoints legend: x_T + one entry per mode (4 modes) = 5 marks
  const epMarks = page.locator('#modes-endpoints-legend .lg-mark');
  await expect(epMarks).toHaveCount(5);

  // trajectories legend: same + a "trajectory" entry = 6 marks, incl the word
  const trMarks = page.locator('#modes-canvas-legend .lg-mark');
  await expect(trMarks).toHaveCount(6);
  await expect(page.locator('#modes-canvas-legend')).toContainText(/trajectory/i);

  // the first endpoints entry is the red x_T marker
  const c = await epMarks.first().evaluate((el) => getComputedStyle(el).color);
  expect(c).toBe('rgb(220, 38, 38)');

  // the old below-canvas legend paragraph is gone
  expect(await page.locator('#modes-panel p.legend').count()).toBe(0);
});
