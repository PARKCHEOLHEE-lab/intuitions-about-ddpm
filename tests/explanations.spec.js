// KR3 — the page explains each step in plain language instead of dumping torch
// source. The old code panels (#q-code/#p-code/#train-code) must be gone.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('KR3: torch code panels are removed', async ({ page }) => {
  await ready(page);
  for (const id of ['#q-code', '#p-code', '#train-code']) {
    await expect(page.locator(id)).toHaveCount(0);
  }
});

test('KR3: each module has a natural-language explanation', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#forward-explain')).toContainText(/noise/i);
  await expect(page.locator('#train-explain')).toContainText(/train|step/i);
  await expect(page.locator('#reverse-explain')).toContainText(/noise/i);
  // explanations are prose, not source code
  await expect(page.locator('#forward-explain')).not.toContainText('def ');
});
