// The .explain blocks are plain paragraphs now — no callout box (no background,
// no left rule, no inset padding).
const { test, expect } = require('@playwright/test');

test('.explain renders as a normal paragraph (no callout box)', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const el = page.locator('#forward-explain');
  const s = await el.evaluate((n) => {
    const cs = getComputedStyle(n);
    return { bg: cs.backgroundColor, border: cs.borderLeftWidth, padLeft: cs.paddingLeft };
  });
  expect(s.bg).toBe('rgba(0, 0, 0, 0)'); // transparent — no callout surface
  expect(parseFloat(s.border)).toBe(0); // no left rule
  expect(parseFloat(s.padLeft)).toBe(0); // no inset
});
