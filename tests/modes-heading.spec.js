// The intro modes-panel heading is framed as trajectories (not "transport"),
// keeping the noise → data direction.
const { test, expect } = require('@playwright/test');

test('modes-panel heading reads as trajectories: noise → data', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const h2 = (await page.locator('#modes-panel h2').textContent()).trim();
  expect(h2.toLowerCase()).toContain('trajectories'); // the term we kept
  expect(h2.toLowerCase()).not.toContain('transport'); // metaphor dropped
  expect(h2).toContain('noise');
  expect(h2).toContain('data'); // noise → data framing preserved
});
