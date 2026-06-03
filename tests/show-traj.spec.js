// Each trajectory panel has a "show trajectories" toggle (default on) that
// hides/shows the trail polylines (the current x_t dots remain).
const { test, expect } = require('@playwright/test');

const PANELS = [
  { toggle: '#forward-show-traj', canvas: '#forward-scatter' },
  { toggle: '#reverse-show-traj', canvas: '#reverse-traj' },
  { toggle: '#modes-show-traj', canvas: '#modes-canvas' },
];

test('show-trajectories toggle defaults on and hides the trail when off', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  for (const { toggle, canvas } of PANELS) {
    const t = page.locator(toggle);
    const c = page.locator(canvas);
    await expect(t).toBeVisible();
    await expect(t).toBeChecked(); // default on
    await expect(c).toHaveAttribute('data-trail-shown', 'true');

    await t.uncheck();
    await expect(c).toHaveAttribute('data-trail-shown', 'false'); // trail hidden
  }
});
