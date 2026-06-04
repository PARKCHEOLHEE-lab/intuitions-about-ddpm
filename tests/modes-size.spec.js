// The "Sampling as transport" (modes) figure is capped (54rem) so its two
// canvases are sized ~1.5× the earlier 36rem cap, but still under the full column.
const { test, expect } = require('@playwright/test');

test('transport (modes) canvases are sized at the 46rem cap', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const w = (await page.locator('#modes-canvas').boundingBox()).width;
  expect(w).toBeGreaterThan(320); // ~358 at the 46rem cap (85% of the 54rem size)
  expect(w).toBeLessThan(390); // smaller than the previous 54rem (~422) sizing
});
