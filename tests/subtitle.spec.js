// The header subtitle drops the implementation aside (precomputed / pure-JS /
// no-server) and instead credits the author.
const { test, expect } = require('@playwright/test');

test('header subtitle drops the implementation aside and credits Claude', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const sub = await page.locator('.subtitle').innerText();
  expect(sub).not.toContain('precomputed snapshots replayed');
  expect(sub).not.toContain('No server');
  expect(sub).toContain('written by Claude');
  expect(sub).toMatch(/DDPM/); // the core one-line description stays
});
