// The "Where this goes next" wrap-up section (#followup-panel) was removed.
const { test, expect } = require('@playwright/test');

test('the "Where this goes next" followup section is gone', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  expect(await page.locator('#followup-panel').count()).toBe(0);
  await expect(page.locator('main')).not.toContainText('Where this goes next');
});
