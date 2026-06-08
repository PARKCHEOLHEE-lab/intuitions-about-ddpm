// Block equations (p.eq, the $$…$$ display math) get extra breathing room
// BELOW only — the bottom margin is noticeably larger than the top, which is
// left as-is.
const { test, expect } = require('@playwright/test');

test('block equations have more space below than above', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const { top, bottom } = await page.locator('p.eq').first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { top: parseFloat(cs.marginTop), bottom: parseFloat(cs.marginBottom) };
  });
  expect(bottom).toBeGreaterThan(top);          // below only — asymmetric
  expect(bottom).toBeGreaterThanOrEqual(top * 1.5); // a real gap, not a 1px nudge
});
