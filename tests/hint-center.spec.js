// The figure caption hints (p.hint, e.g. "Left: precomputed forward samples …")
// are center-aligned under their figures. The shape-bar note (span.hint) is a
// different context and stays left-aligned.
const { test, expect } = require('@playwright/test');

test('p.hint caption paragraphs are centered; span.hint note is not', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const captions = page.locator('p.hint');
  const n = await captions.count();
  expect(n).toBeGreaterThanOrEqual(2); // forward, train caption hints (reverse note removed)
  for (let i = 0; i < n; i++) {
    const align = await captions.nth(i).evaluate((el) => getComputedStyle(el).textAlign);
    expect(align).toBe('center');
  }

  // the shape-bar selector note is a span.hint — it must NOT be centered
  const note = await page
    .locator('#shape-bar span.hint')
    .evaluate((el) => getComputedStyle(el).textAlign);
  expect(note).not.toBe('center');
});
