// In the modes ("Sampling trajectories") figure, x_T (noise) is drawn as round
// DOTS while x_0 (data modes) stays as × crosses, so the two are symbol-distinct.
const { test, expect } = require('@playwright/test');

test('modes x_T is drawn as dots; x_0 stays crosses', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  // left endpoints panel: x_T starts = dots, x_0 ends = crosses
  const ep = page.locator('#modes-endpoints');
  await expect(ep).toHaveAttribute('data-start-marker', 'dot');
  await expect(ep).toHaveAttribute('data-marker', 'cross');

  // right trajectory panel: the selected x_T starts are drawn as dots
  await expect(page.locator('#modes-canvas')).toHaveAttribute('data-solid-start-marker', 'dot');
});
