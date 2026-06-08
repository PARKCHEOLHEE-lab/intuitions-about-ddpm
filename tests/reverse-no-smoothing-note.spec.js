// The reverse panel's "Smoothing is cosmetic only …" caption note was removed
// (the smoothing toggle itself stays — only the explanatory paragraph is gone).
const { test, expect } = require('@playwright/test');

test('reverse panel has no smoothing-note caption', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const panelText = await page.locator('#reverse-panel').innerText();
  expect(panelText).not.toContain('Smoothing is cosmetic'); // the note is gone
  expect(panelText).not.toContain('cosmetic'); // no leftover smoothing explainer

  // the smoothing toggle control is untouched
  await expect(page.locator('#reverse-smooth')).toHaveCount(1);
});
