// The caption hints (p.hint) get a line break of space BELOW them, and the
// slider rows (p.controls) get a line break of space ABOVE them, so each panel
// breathes around the figure block.
const { test, expect } = require('@playwright/test');

async function box(page, sel) {
  return page.locator(sel).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      top: parseFloat(cs.marginTop),
      bottom: parseFloat(cs.marginBottom),
      fs: parseFloat(cs.fontSize),
    };
  });
}

test('caption hints have a line break of space below', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const { top, bottom, fs } = await box(page, 'p.hint');
  expect(bottom).toBeGreaterThan(top);     // space added below, not above
  expect(bottom).toBeGreaterThanOrEqual(fs); // at least ~one line (a real break)
});

test('slider controls have a line break of space above', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const { top, bottom, fs } = await box(page, 'p.controls');
  expect(top).toBeGreaterThan(bottom);     // space added above, not below
  expect(top).toBeGreaterThanOrEqual(fs);  // at least ~one line (a real break)

  // the shape-bar selector row keeps its own symmetric (1.5em 0) spacing — it
  // must NOT pick up the asymmetric p.controls top margin.
  const sb = await page.locator('#shape-bar').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { top: parseFloat(cs.marginTop), bottom: parseFloat(cs.marginBottom) };
  });
  expect(sb.top).toBeCloseTo(sb.bottom, 0); // symmetric — unaffected by p.controls
});
