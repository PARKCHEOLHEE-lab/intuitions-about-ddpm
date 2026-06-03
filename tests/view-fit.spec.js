// KR4 — the dino panels must fit their view to the (standardized, ~±2.6) data
// so the dino fills the canvas. The fixed VIEW=1.15 would clip it to a corner.
const { test, expect } = require('@playwright/test');

test('KR4: dino panels fit view to standardized data (not clipped at 1.15)', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  for (const id of ['#forward-endpoint', '#reverse-x0']) {
    const v = parseFloat((await page.locator(id).getAttribute('data-view')) || '0');
    expect(v).toBeGreaterThan(1.5); // standardized data spans ~2.6; 1.15 would clip
  }
  await expect(page.locator('#forward-endpoint')).toHaveAttribute('data-point-count', '200');
  await expect(page.locator('#reverse-x0')).toHaveAttribute('data-point-count', '200');
});

// KR4b — every panel uses ONE common view (meta.view) so the SAME dino renders
// at the same on-screen size everywhere (Dataset / Forward t=0 / Reverse final /
// Training). Previously each panel fit its own extent, so the dino looked
// 1.5x smaller in the noise-inclusive forward/reverse panels.
test('all panels share one common view scale', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const ids = ['#forward-endpoint', '#forward-scatter', '#reverse-x0', '#reverse-traj', '#snapshots-canvas'];
  const views = [];
  for (const id of ids) {
    views.push(parseFloat((await page.locator(id).getAttribute('data-view')) || '0'));
  }
  for (const v of views) {
    expect(Math.abs(v - views[0])).toBeLessThan(1e-6); // all equal to the dataset's view
  }
});
