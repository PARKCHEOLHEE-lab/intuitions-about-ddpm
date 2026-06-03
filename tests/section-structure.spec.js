// The standalone "The data x0" panel was removed (its scatter duplicated the
// forward panel's x0 figure). The remaining numbered steps are renumbered to
// 1/2/3, and the standardization rationale moves into the forward panel.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('dataset panel is removed and the steps are renumbered 1/2/3', async ({ page }) => {
  await ready(page);

  // the standalone dataset panel + its scatter are gone
  expect(await page.locator('#dataset-panel').count()).toBe(0);
  expect(await page.locator('#scatter').count()).toBe(0);

  // forward is now step 1, training step 2, reverse step 3
  await expect(page.locator('#forward-panel h2')).toContainText('1 · Forward diffusion');
  await expect(page.locator('#train-panel h2')).toContainText('2 · Training');
  await expect(page.locator('#reverse-panel h2')).toContainText('3 · Reverse sampling');

  // the standardization rationale (unique to the old dataset panel) is preserved
  // in the forward panel: zero mean / unit variance → end state N(0,I)
  await expect(page.locator('#forward-panel')).toContainText(/unit variance/i);
});
