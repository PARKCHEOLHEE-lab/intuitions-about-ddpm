// All body content shares ONE column: prose, callouts, controls and the
// figure modules line up on the same left AND right edge. Previously prose was
// capped at 48rem while figures spanned the full width, so the edges were ragged.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

async function box(loc) {
  const b = await loc.boundingBox();
  return { left: b.x, right: b.x + b.width };
}

test('prose, callout and figure module share one aligned column', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await ready(page);

  // forward panel: its intro paragraph, its callout, and its figure module
  const para = await box(page.locator('#forward-panel > p').first());
  const callout = await box(page.locator('#forward-explain'));
  const module = await box(page.locator('#forward-panel .module'));

  // same LEFT edge (already true) AND same RIGHT edge (the regression: prose was
  // capped narrower than the module)
  expect(Math.abs(para.left - module.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(callout.left - module.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(para.right - module.right)).toBeLessThanOrEqual(1);
  expect(Math.abs(callout.right - module.right)).toBeLessThanOrEqual(1);
});
