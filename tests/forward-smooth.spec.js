// The forward panel (noisy step-by-step walk) has a smoothing on/off toggle,
// like the reverse and transport panels. Defaults ON (consistent with them).
const { test, expect } = require('@playwright/test');

test('forward trail smoothing toggle defaults on', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const canvas = page.locator('#forward-scatter');
  await expect(canvas).toHaveAttribute('data-trail-smoothed', 'true'); // smoothed by default

  const toggle = page.locator('#forward-smooth');
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeChecked();

  await toggle.uncheck();
  await expect(canvas).toHaveAttribute('data-trail-smoothed', 'false'); // re-rendered raw
});
